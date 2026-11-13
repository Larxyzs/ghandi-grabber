"""
The owner's site drives the extension through bridge/bridge.js (content script on ghandihomeelectro.com).
A fake https ghandihomeelectro.com page and a fake https electrobousfiha.com shop (self-signed certificate):
hello -> crawl a list (products are found AND grabbed) -> status -> refused foreign address -> send
(no site connected in this test, so the extension's page answers "connect your site first").
"""
import asyncio, os, re, ssl, subprocess, sys, tempfile, shutil, threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, 'fixtures'))
import prestashop_shop as S  # noqa: E402

S.H = 'https://electrobousfiha.com'
PORT = 8767
for k in ('HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'ALL_PROXY', 'all_proxy'):
    os.environ.pop(k, None)
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        u = urlparse(self.path)
        host = (self.headers.get('Host') or '').split(':')[0]
        if re.search(r'\.(jpg|png)$', u.path):
            body, ctype = PNG, 'image/png'
        elif host.endswith('ghandihomeelectro.com'):
            body, ctype = b'<!doctype html><html><head><meta charset="utf-8"><title>Admin</title></head><body>admin</body></html>', 'text/html; charset=utf-8'
        else:
            html = S.route(u.path, u.query)
            if html is None:
                self.send_response(404)
                self.end_headers()
                return
            body, ctype = html.encode(), 'text/html; charset=utf-8'
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


CALL = '''([cmd, args]) => new Promise((res) => {
  const id = Math.random().toString(36).slice(2);
  const on = (e) => { if (e.data && e.data.ghandi === 'bridge-reply' && e.data.id === id) { removeEventListener('message', on); res(e.data); } };
  addEventListener('message', on);
  postMessage({ ghandi: 'bridge', id, cmd, args }, location.origin);
  setTimeout(() => res({ ok: false, error: 'no answer' }), 20000);
})'''


async def main():
    from playwright.async_api import async_playwright
    tmp = tempfile.mkdtemp(prefix='ghandi-bridge-')
    key, crt = os.path.join(tmp, 'k.pem'), os.path.join(tmp, 'c.pem')
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '1', '-subj', '/CN=test'], check=True, capture_output=True)
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    sc = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    sc.load_cert_chain(crt, key)
    srv.socket = sc.wrap_socket(srv.socket, server_side=True)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    ok = True
    try:
        async with async_playwright() as p:
            ctx = await p.chromium.launch_persistent_context(
                os.path.join(tmp, 'profile'), headless=True, channel='chromium', ignore_https_errors=True,
                args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', '--ignore-certificate-errors',
                      f'--host-resolver-rules=MAP electrobousfiha.com:443 127.0.0.1:{PORT},MAP ghandihomeelectro.com:443 127.0.0.1:{PORT}',
                      '--no-proxy-server', '--disable-dev-shm-usage'])
            sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
            pg = await ctx.new_page()
            await pg.goto('https://ghandihomeelectro.com/admin')
            await pg.wait_for_selector('html[data-ghandi-bridge]', timeout=10000)
            call = lambda cmd, args=None: pg.evaluate(CALL, [cmd, args or {}])
            r = await call('hello')
            print('hello', r)
            ok &= r['ok'] and bool(r['data']['version'])
            r = await call('crawl', {'url': 'https://evil.example.com/list'})
            print('foreign address refused:', not r['ok'], r.get('error'))
            ok &= not r['ok']
            r = await call('crawl', {'url': S.H + S.CATS['ml'][0], 'ptype': 'washer'})
            ok &= r['ok']
            items = []
            for _ in range(120):
                await asyncio.sleep(1)
                st = (await call('status'))['data']
                items = st['items']
                if items and st['crawl'].get('state') != 'running' and all(i['status'] in ('done', 'check', 'failed') for i in items):
                    break
            want = [x for x in S.products if x['cat'] == 'ml'] if 'cat' in S.products[0] else None
            done = [i for i in items if i['status'] in ('done', 'check')]
            print(f'crawl+grab: {len(done)}/{len(items)} grabbed'); [print('   ', i['status'], i['brand'], repr(i['model']), i['type'], i['name'][:40]) for i in items]
            ok &= len(items) > 0 and len(done) == len(items) and all(i['brand'] and i['type'] == 'washer' for i in done) and not any(i['model'] == '1200T' for i in done)
            r = await call('add', {'urls': ['https://evil.example.com/x']})
            ok &= not r['ok']
            r = await call('add', {'urls': [done[0]['url']]})
            print('add again:', r.get('data'))
            ok &= r['ok'] and r['data']['skipped'] == 1
            r = await call('retry', {'ids': [done[0]['id']]})
            ok &= r['ok']
            r = await call('remove', {'ids': [done[-1]['id']]})
            ok &= r['ok']
            for _ in range(60):
                await asyncio.sleep(1)
                st = (await call('status'))['data']
                if all(i['status'] in ('done', 'check', 'failed') for i in st['items']):
                    break
            print('after retry/remove:', len(st['items']), 'items')
            ok &= len(st['items']) == len(done) - 1 and all(i['images'] for i in st['items'])
            done = [i for i in st['items'] if i['status'] in ('done', 'check')]
            r = await call('send', {'ids': [i['id'] for i in done]})
            ok &= r['ok']
            res = None
            for _ in range(30):
                await asyncio.sleep(1)
                res = (await call('sendResult'))['data']
                if res and res.get('token') == r['data']['token']:
                    break
            print('send answer:', res)
            ok &= bool(res) and res['token'] == r['data']['token'] and res['ok'] is False and 'onnect' in (res['message'] or '')
            await ctx.close()
    finally:
        srv.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)
    print('PASS' if ok else 'FAIL')
    sys.exit(0 if ok else 1)


asyncio.run(main())
