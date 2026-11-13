"""
End-to-end test of the REAL extension on a fake Magento shop built like electroplanet.ma
(tests/fixtures/magento_shop.py: 32 products of 20 types (fridges, freezers, washers, washer-dryer, dryer,
dishwashers, AC, TV, soundbar, cooker, hobs, hood, oven, microwave, water heater, fan), 2 lists, one with 3 pages).

It loads the extension in Chromium, runs "Find products" on both lists, grabs every product,
and checks name, brand, MODEL CODE, pictures (gallery order, big originals, no video, no other products),
specs (groups, empty lines dropped, Y -> Oui, shop lines removed), no price.

Run:
  python tests/test_electroplanet_e2e.py                 # quick read (no windows), headless
  python tests/test_electroplanet_e2e.py --window        # real reading windows (use --headed, or xvfb-run on Linux)
  python tests/test_electroplanet_e2e.py --window --headed

Needs: pip install playwright && playwright install chromium
Notes learned the hard way:
  - Headless Chromium drops pages in the extension's popup windows (net::ERR_ABORTED). For --window,
    run headed (Windows/Mac) or under `xvfb-run -a` (Linux).
  - If the machine has HTTP(S)_PROXY set, the test removes it for the browser (it talks to 127.0.0.1).
"""
import asyncio, os, re, sys, threading, time, tempfile, shutil
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, 'fixtures'))
import magento_shop as S  # noqa: E402

S.H = 'http://www.electroplanet.ma'
S.MEDIA = 'http://prod2-media.electroplanet.ma/media/catalog/product'
PORT = 8766
WINDOW = '--window' in sys.argv
HEADED = '--headed' in sys.argv
for k in ('HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'ALL_PROXY', 'all_proxy'):
    os.environ.pop(k, None)

PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        u = urlparse(self.path)
        if re.search(r'\.(jpg|png)$', u.path):
            self.send_response(200)
            self.send_header('Content-Type', 'image/png')
            self.end_headers()
            self.wfile.write(PNG)
            return
        body = S.route(u.path, u.query)
        if body is None:
            self.send_response(404)
            self.end_headers()
            return
        b = body.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)


async def main():
    from playwright.async_api import async_playwright
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    profile = tempfile.mkdtemp(prefix='ghandi-ep-')
    try:
        async with async_playwright() as p:
            ctx = await p.chromium.launch_persistent_context(
                profile, headless=not HEADED, channel=None if HEADED else 'chromium',
                args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}',
                      f'--host-resolver-rules=MAP www.electroplanet.ma:80 127.0.0.1:{PORT},MAP prod2-media.electroplanet.ma:80 127.0.0.1:{PORT}', '--no-proxy-server', '--disable-dev-shm-usage', '--disable-gpu'])
            sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
            eid = sw.url.split('/')[2]
            pg = await ctx.new_page()
            await pg.goto(f'chrome-extension://{eid}/app/app.html')
            send = lambda m: pg.evaluate('(m)=>new Promise(r=>chrome.runtime.sendMessage(m,r))', m)
            get = lambda k: pg.evaluate('(k)=>new Promise(r=>chrome.storage.local.get(k,o=>r(o)))', k)
            await pg.evaluate('(q)=>new Promise(r=>chrome.storage.local.get("settings",o=>chrome.storage.local.set({settings:Object.assign({},o.settings||{},{quickRead:q})},r)))', not WINDOW)
            await send({'type': 'clear-all'})

            t0 = time.time()
            for path in [S.CATS['fridges'][0], S.CATS['others'][0]]:
                url = S.H + path
                sent = time.time() * 1000
                await send({'type': 'crawl', 'url': url, 'maxPages': 5})
                for _ in range(240):
                    c = (await get('crawl')).get('crawl') or {}
                    if c.get('state') == 'idle' and (c.get('finishedAt') or 0) > sent:
                        break
                    await asyncio.sleep(0.5)
                print('LIST', path, '->', c.get('message'))
            ids = (await get('ids')).get('ids') or []
            print('links found:', len(ids), 'in', round(time.time() - t0, 1), 's')

            t1 = time.time()
            await send({'type': 'start'})
            items = []
            for _ in range(900):
                got = await get(['it:' + i for i in ids])
                items = list(got.values())
                if items and all(i['status'] in ('done', 'check', 'failed') for i in items):
                    break
                await asyncio.sleep(1)
            print('grabbed', len(items), 'in', round(time.time() - t1, 1), 's')

            by_url = {i['url']: i for i in items}
            want_specs = {'Type', 'Niveau sonore', 'Couleur du produit', "Placement de l'appareil", 'Éclairage LED', 'Largeur', 'Profondeur', 'Hauteur', 'Poids', "Classe d'efficacité énergétique"}
            ok = 0
            for prod in S.products:
                it = by_url.get(S.H + prod['path'])
                if not it:
                    print('FAIL', prod['ref'], '-> not found in the list')
                    continue
                r = it.get('result') or {}
                pics = [u for u in [r.get('mainImage', '')] + (r.get('otherImages') or []) if u]
                want_pics = [S.original(f) for f in prod['files']]
                specs = {s['label']: s['value'] for s in r.get('specs') or []}
                problems = []
                if not (r.get('name') or '').startswith(prod['catname'] + ' ' + prod['brand'] + ' '):
                    problems.append(f"name {r.get('name')!r}")
                if (r.get('brand') or '') != prod['brand']:
                    problems.append(f"brand {r.get('brand')!r} (want {prod['brand']!r})")
                if (r.get('model') or '') != prod['model']:
                    problems.append(f"model {r.get('model')!r} (want {prod['model']!r})")
                if pics != want_pics:
                    problems.append(f"pictures {len(pics)} (want {len(want_pics)} in order): {pics[:2]}")
                if set(specs) != want_specs or specs.get('Éclairage LED') != 'Oui':
                    problems.append(f'specs {sorted(set(specs) ^ want_specs)}')
                if len(r.get('specGroups') or []) != 4:
                    problems.append(f"spec groups {[g.get('title') for g in r.get('specGroups') or []]}")
                if r.get('price'):
                    problems.append('price was read')
                if problems:
                    print('FAIL', prod['ref'], '->', '; '.join(problems), f"[{it['status']}: {it.get('message', '')}]")
                else:
                    ok += 1
            extra = [u for u in by_url if not any(u.endswith(p['path']) for p in S.products)]
            modes = {}
            for i in items:
                modes[i.get('mode') or '?'] = modes.get(i.get('mode') or '?', 0) + 1
            print(f'PASS {ok}/{len(S.products)}', '| extra links:', extra, '| read modes:', modes)
            await ctx.close()
            return ok == len(S.products) and not extra
    finally:
        srv.shutdown()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(0 if asyncio.run(main()) else 1)
