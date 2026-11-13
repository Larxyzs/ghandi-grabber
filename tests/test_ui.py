"""Smoke test of the side panel (app/app.html) with the REAL extension, fake products and a fake shop.

  python tests/test_ui.py            # checks only
  python tests/test_ui.py --shots    # also saves screenshots at 380 and 560 px (training/tmp/ui-*.png)

Checks: the smart start card, filters and counts, the virtual list (600 products, only a few cards in the page),
selection bar, remove + Undo (nothing removed before 10 s), inline "No model code" fix, editor (pictures,
specs search, Electroplanet count, autosave), sending to a fake site (sections, history), settings drawer,
dark mode, keyboard, and no JavaScript errors.
"""
import asyncio, json, os, shutil, sys, tempfile, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.dirname(HERE)
SHOTS = '--shots' in sys.argv
OUT = os.path.join(EXT, 'training', 'tmp')
PORT = 8777
for k in ('HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'ALL_PROXY', 'all_proxy'):
    os.environ.pop(k, None)

SECTIONS = [
    {'id': 's1', 'name': 'Réfrigérateur', 'path': 'Gros électroménager > Réfrigérateur'},
    {'id': 's2', 'name': 'Réfrigérateur avec congélateur en bas', 'path': 'Gros électroménager > Réfrigérateur > Réfrigérateur avec congélateur en bas'},
    {'id': 's3', 'name': 'Machine à laver à hublot', 'path': 'Gros électroménager > Machine à laver > Machine à laver à hublot'},
    {'id': 's4', 'name': 'Téléviseur', 'path': 'TV > Téléviseur'},
    {'id': 's5', 'name': 'Climatiseur', 'path': 'Climatisation > Climatiseur'},
]
PUSHED = []


class Site(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        if self.headers.get('x-ghandi-key') != 'test-key':
            out, code = {'ok': False, 'error': 'bad key'}, 401
        elif body.get('action') == 'ping':
            out, code = {'ok': True, 'site': 'Test shop', 'sections': SECTIONS}, 200
        else:
            PUSHED.append(body)
            out, code = {'ok': True, 'added': len(body.get('products', []))}, 200
        b = json.dumps(out).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b)


PIC = 'data:image/svg+xml,' + '%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect width=%22200%22 height=%22200%22 fill=%22%23cfd8dc%22/%3E%3Crect x=%2260%22 y=%2220%22 width=%2280%22 height=%22160%22 rx=%228%22 fill=%22%23607d8b%22/%3E%3C/svg%3E'


def item(i, kind):
    base = {'id': f'p{i}', 'url': f'https://www.lg.com/ma/refrigerateurs/combines/gr-x{i:03d}/', 'key': f'www.lg.com/ma/refrigerateurs/combines/gr-x{i:03d}', 'title': f'Product {i}',
            'image': '', 'listing': '', 'listingTitle': '', 'category': '', 'status': 'done', 'message': '', 'ptype': '', 'ptypeBy': '', 'attempts': 1, 'addedAt': 1, 'finishedAt': 1000 + i}
    rows = [{'label': f'Ligne {k}', 'value': str(k)} for k in range(14)] + [{'label': 'Volume total', 'value': '333 L'}, {'label': 'Classe énergétique', 'value': 'A++'}]
    res = {'brand': 'LG' if i % 3 else 'Samsung', 'url': base['url'], 'name': f'Réfrigérateur combiné {300 + i} L No Frost', 'model': f'GR-X{i:03d}NQLM', 'price': '', 'priceValue': None,
           'mainImage': PIC + '#' + str(i), 'otherImages': [PIC + '#b' + str(i), PIC + '#c' + str(i)], 'specs': rows, 'specGroups': [{'title': 'Caractéristiques', 'rows': rows}], 'slideshowMode': '', 'warnings': []}
    sheet = {'type': 'fridge', 'label': 'Réfrigérateur', 'groups': [{'title': 'Autre Caractéristique', 'rows': [{'label': 'Marque', 'value': res['brand']}]}, {'title': 'Capacité', 'rows': [{'label': 'Capacité totale', 'value': '333 L'}]}], 'extra': [], 'filled': 18, 'model': res['model'], 'at': 1}
    it = dict(base, result=res, sheet=sheet, ptypeAuto='fridge', ptypeSure=True)
    if kind == 'nomodel':
        it['result'] = dict(res, model='', name='Réfrigérateur sans code')
        it['sheet'] = dict(sheet, model='')
        it['url'] = it['url'].replace(f'gr-x{i:03d}/', 'sans-code/')
        it['status'] = 'check'
        it['result']['warnings'] = ['I could not find the model.']
    elif kind == 'failed':
        it.update(status='failed', message='Chrome could not open that page.', result=None, sheet=None)
    elif kind == 'found':
        it.update(status='found', result=None, sheet=None)
    elif kind == 'sent':
        it['sentAt'] = 5
    elif kind == 'fewspecs':
        it['result'] = dict(res, specs=rows[:2], specGroups=[{'title': '', 'rows': rows[:2]}])
        it['status'] = 'check'
    return it


async def main():
    from playwright.async_api import async_playwright
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Site)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    profile = tempfile.mkdtemp(prefix='ghandi-ui-')
    problems = []
    errors = []
    try:
        async with async_playwright() as p:
            ctx = await p.chromium.launch_persistent_context(profile, headless=True, channel='chromium', args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', '--no-proxy-server'], viewport={'width': 380, 'height': 820})
            sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
            eid = sw.url.split('/')[2]
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
            url = f'chrome-extension://{eid}/app/app.html'
            await pg.goto(url)
            await pg.wait_for_timeout(800)

            def check(cond, what):
                if not cond:
                    problems.append(what)
                print(('PASS ' if cond else 'FAIL ') + what)

            async def shot(name):
                if SHOTS:
                    os.makedirs(OUT, exist_ok=True)
                    await pg.screenshot(path=os.path.join(OUT, f'ui-{name}.png'))

            # 1) empty
            check(await pg.is_visible('#start'), 'smart start card is shown')
            check('empty' in (await pg.inner_text('#empty')).lower(), 'empty list says so')
            await shot('380-empty')

            # 2) products (a mix) + a connected fake site
            kinds = ['ok'] * 8 + ['nomodel', 'failed', 'found', 'sent', 'fewspecs']
            items = {f'it:p{i}': item(i, k) for i, k in enumerate(kinds)}
            ids = [f'p{i}' for i in range(len(kinds))]
            await pg.evaluate('(o)=>new Promise(r=>chrome.storage.local.set(o,r))', dict(items, ids=ids, siteSections=SECTIONS,
                              settings={'v': 2, 'siteUrl': f'http://127.0.0.1:{PORT}/import', 'siteKey': 'test-key', 'siteName': 'Test shop', 'workers': 4, 'delayMs': 300}))
            await pg.wait_for_timeout(700)
            cnt = await pg.evaluate("()=>Object.fromEntries([...document.querySelectorAll('#filters [data-f]')].map(b=>[b.dataset.f,b.querySelector('span').textContent]))")
            check(cnt.get('ready') == '8', f'8 ready products counted ({cnt})')
            check(cnt.get('check') == '3', 'to check = no model + few specs + not grabbed')
            check(cnt.get('failed') == '1' and cnt.get('sent') == '1', 'failed and sent counted')
            await pg.click('#filters [data-f="check"]')
            await pg.wait_for_timeout(300)
            txt = await pg.inner_text('#list')
            check('No model code' in txt, 'problem written in plain words: "No model code"')
            check('Only 2 specs' in txt, 'problem written in plain words: "Only 2 specs"')
            await shot('380-review-check')
            # inline model fix
            await pg.click('.card-item[data-id="p8"] [data-fix="model"]')
            await pg.fill('[data-fixmodel]', 'GR-TEST123')
            await pg.press('[data-fixmodel]', 'Enter')
            await pg.wait_for_timeout(600)
            m = await pg.evaluate('()=>new Promise(r=>chrome.storage.local.get("it:p8",o=>r(o["it:p8"].result.model)))')
            check(m == 'GR-TEST123', 'model code typed on the card is saved')
            # ready list + section chips
            await pg.click('#filters [data-f="ready"]')
            await pg.wait_for_timeout(300)
            chips = await pg.eval_on_selector_all('.card-item [data-sec]', 'els=>els.map(e=>e.textContent)')
            check(any('congélateur en bas' in c for c in chips), f'each card shows its site section ({chips[:2]})')
            await shot('380-review-ready')
            # selection bar + remove + undo
            await pg.click('.card-item[data-id="p0"] [data-ck]')
            await pg.click('.card-item[data-id="p1"] [data-ck]')
            check(await pg.is_visible('#bulk'), 'selection bar appears')
            await shot('380-selection')
            await pg.click('#bulk [data-bulk="remove"]')
            await pg.wait_for_timeout(300)
            check(await pg.is_visible('#undo'), 'Undo bar appears (no confirmation pop-up)')
            still = await pg.evaluate('()=>new Promise(r=>chrome.storage.local.get("ids",o=>r(o.ids.length)))')
            check(still == len(kinds), 'nothing removed before the 10 seconds')
            await shot('380-undo')
            await pg.click('#undoBtn')
            await pg.wait_for_timeout(300)
            check(await pg.locator('.card-item[data-id="p0"]').count() == 1, 'Undo brings the products back')
            # editor
            await pg.click('.card-item[data-id="p2"] .nm')
            await pg.wait_for_timeout(400)
            check(await pg.is_visible('#editor'), 'editor opens')
            check(await pg.locator('#edPics .pic').count() == 3, 'editor shows the 3 pictures')
            check('18/38' in await pg.inner_text('#sheetCount'), 'Electroplanet count "18/38 lines filled"')
            await pg.click('#vBrand')
            await pg.fill('#specQ', 'classe')
            await pg.wait_for_timeout(200)
            vis = await pg.eval_on_selector_all('#edSpecs .srow', 'els=>els.filter(e=>!e.hidden).length')
            check(vis == 1, f'search inside specs ({vis} line shown)')
            await shot('380-editor')
            await pg.fill('#fName', 'Nom changé')
            await pg.wait_for_timeout(1300)
            n = await pg.evaluate('()=>new Promise(r=>chrome.storage.local.get("it:p2",o=>r(o["it:p2"].result.name)))')
            check(n == 'Nom changé', 'editor saves by itself')
            await pg.keyboard.press('Escape')
            await pg.wait_for_timeout(300)
            check(not await pg.is_visible('#editor'), 'Esc closes the editor')
            # send all ready products
            label = await pg.inner_text('#sendAll')
            check('Send' in label and '9' in label, f'big send button: "{label}"')
            await pg.click('#sendAll')
            for _ in range(30):
                if PUSHED and not await pg.is_disabled('#sendAll'):
                    break
                await pg.wait_for_timeout(200)
            await pg.wait_for_timeout(500)
            sent = sum(len(b['products']) for b in PUSHED)
            check(sent == 9, f'9 products pushed to the site ({sent})')
            check(all(b['products'][0]['price'] == '' for b in PUSHED), 'no price is sent')
            secs = {b['suggestedSectionPath'] for b in PUSHED}
            check(any('congélateur en bas' in s for s in secs), f'sent into the right section ({secs})')
            await pg.click('#histBtn')
            await pg.wait_for_timeout(300)
            check('9 products' in await pg.inner_text('#histList'), 'history shows what was sent')
            await shot('380-history')
            await pg.click('#history [data-close]')
            # settings + dark mode
            await pg.click('#setBtn')
            await pg.wait_for_timeout(200)
            check(await pg.is_visible('#settings') and await pg.is_visible('#siteUrl'), 'settings drawer with site connection')
            await shot('380-settings')
            await pg.select_option('#theme', 'dark')
            await pg.wait_for_timeout(200)
            check(await pg.evaluate("()=>document.documentElement.dataset.theme") == 'dark', 'dark mode')
            await pg.click('#settings [data-close]')
            await pg.click('#filters [data-f="all"]')
            await pg.wait_for_timeout(300)
            await shot('380-dark')
            # 3) 600 products: the list stays light
            big = {f'it:q{i}': dict(item(i, 'ok'), id=f'q{i}', url=f'https://www.lg.com/ma/refrigerateurs/x/q{i}/', key=f'q{i}') for i in range(600)}
            t0 = time.time()
            await pg.evaluate('(o)=>new Promise(r=>chrome.storage.local.set(o,r))', dict(big, ids=[f'q{i}' for i in range(600)]))
            await pg.wait_for_timeout(1200)
            cards = await pg.locator('.card-item').count()
            check(0 < cards < 40, f'600 products, only {cards} cards in the page (virtual list)')
            await pg.focus('#list')
            for _ in range(5):
                await pg.keyboard.press('ArrowDown')
            check(await pg.locator('.card-item.focus').count() == 1, 'arrow keys move between products')
            await pg.evaluate("()=>document.getElementById('list').scrollTop=40000")
            await pg.wait_for_timeout(300)
            check(await pg.locator('.card-item').count() > 0, 'cards are drawn after a long scroll')
            print(f'600 products shown in {time.time() - t0:.1f} s')
            # 4) wide panel
            await pg.set_viewport_size({'width': 560, 'height': 820})
            await pg.select_option('#groupBy', 'brand')
            await pg.evaluate("()=>document.getElementById('list').scrollTop=0")
            await pg.wait_for_timeout(400)
            check(await pg.locator('.group-head').count() >= 1, 'group by brand')
            await shot('560-grouped')
            check(not errors, 'no JavaScript errors' + (': ' + '; '.join(errors[:3]) if errors else ''))
            await ctx.close()
    finally:
        srv.shutdown()
        shutil.rmtree(profile, ignore_errors=True)
    print('\nUI OK' if not problems else '\nUI FAILED: ' + '; '.join(problems))
    return not problems


if __name__ == '__main__':
    sys.exit(0 if asyncio.run(main()) else 1)
