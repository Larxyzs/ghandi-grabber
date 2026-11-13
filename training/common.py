"""Shared helpers for the training scripts (paths, corpus, polite delays, the real extension in Chromium).

Nothing here imports the extension's scanners: the extension is only driven through its own messages.
"""
import asyncio, gzip, json, os, re, shutil, sys, tempfile, time
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SNAP = os.path.join(HERE, 'snapshots')
EXPECTED = os.path.join(HERE, 'expected')
RUNS = os.path.join(HERE, 'runs')
TMP = os.path.join(HERE, 'tmp')
CORPUS = os.path.join(HERE, 'corpus.jsonl')
SITES = os.path.join(HERE, 'sites.json')
for d in (SNAP, EXPECTED, RUNS, TMP):
    os.makedirs(d, exist_ok=True)

# fine product types (corpus) -> the extension's sheet types (what "type" is graded against)
SHEET_TYPE = {
    'fridge': 'fridge', 'freezer': 'fridge', 'washer': 'washer', 'washer-dryer': 'washer', 'dryer': 'other',
    'dishwasher': 'dishwasher', 'ac': 'ac', 'fan': 'fan', 'tv': 'tv', 'soundbar': 'other', 'hob': 'hob',
    'cooker': 'other', 'hood': 'other', 'oven': 'oven', 'microwave': 'microwave', 'sink': 'sink',
}


def now_iso():
    return time.strftime('%Y-%m-%dT%H:%M:%S')


def load_sites():
    with open(SITES, encoding='utf-8') as f:
        return json.load(f)


def load_corpus():
    out = []
    if os.path.exists(CORPUS):
        with open(CORPUS, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    out.append(json.loads(line))
    return out


def save_corpus(items):
    with open(CORPUS, 'w', encoding='utf-8') as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + '\n')


def site_of_url(url, sites=None):
    host = (urlparse(url).hostname or '').lower()
    for sid, s in (sites or load_sites()).items():
        if any(m in host for m in s.get('match', [sid])):
            return sid
    return ''


def snap_dir(item):
    return os.path.join(SNAP, item['site'], item['id'])


def read_gz(path):
    with gzip.open(path, 'rt', encoding='utf-8', errors='replace') as f:
        return f.read()


def write_gz(path, text):
    with gzip.open(path, 'wt', encoding='utf-8', compresslevel=9) as f:
        f.write(text)


def load_expected(pid):
    p = os.path.join(EXPECTED, pid + '.json')
    if not os.path.exists(p):
        return None
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def save_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def filter_items(items, args):
    site = getattr(args, 'site', None)
    typ = getattr(args, 'type', None)
    ids = getattr(args, 'ids', None)
    out = []
    for it in items:
        if site and it['site'] not in site.split(','):
            continue
        if typ and it['type'] not in typ.split(','):
            continue
        if ids and it['id'] not in ids:
            continue
        out.append(it)
    return out


# ------------------------------------------------------------------ politeness (>= N seconds between pages of a site)
class Polite:
    """Remembers when each website was last asked for a page (also across runs) and waits."""

    def __init__(self, default=2.5):
        self.path = os.path.join(TMP, 'polite.json')
        self.default = default
        try:
            with open(self.path) as f:
                self.last = json.load(f)
        except Exception:
            self.last = {}

    def wait(self, url, delay=None):
        host = urlparse(url).hostname or ''
        gap = (delay or self.default) - (time.time() - self.last.get(host, 0))
        if gap > 0:
            time.sleep(gap)
        self.last[host] = time.time()
        try:
            with open(self.path, 'w') as f:
                json.dump(self.last, f)
        except Exception:
            pass


# ------------------------------------------------------------------ a screen for "headed" Chromium on Linux
def ensure_display():
    """Headed Chromium needs a screen. On a Linux server without one, run again inside xvfb-run."""
    if sys.platform.startswith('linux') and not os.environ.get('DISPLAY') and shutil.which('xvfb-run') and not os.environ.get('GH_XVFB'):
        os.environ['GH_XVFB'] = '1'
        os.execvp('xvfb-run', ['xvfb-run', '-a', '-s', '-screen 0 1600x1000x24', sys.executable] + sys.argv)


def proxy_server():
    for k in ('HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'):
        if os.environ.get(k):
            return os.environ[k]
    return ''


def drop_proxy_env():
    for k in ('HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'ALL_PROXY', 'all_proxy'):
        os.environ.pop(k, None)


# ------------------------------------------------------------------ the REAL extension
class Extension:
    """Loads the extension (Playwright's Chromium + --load-extension) and talks to it with its own messages,
    exactly like tests/test_shop_e2e.py: open app/app.html, chrome.runtime.sendMessage, read chrome.storage.local."""

    def __init__(self, live=True, host_rules='', headed=True):
        self.live = live
        self.host_rules = host_rules
        self.headed = headed

    async def __aenter__(self):
        from playwright.async_api import async_playwright
        self._pw = await async_playwright().start()
        self.profile = tempfile.mkdtemp(prefix='ghandi-train-')
        args = [f'--disable-extensions-except={ROOT}', f'--load-extension={ROOT}', '--window-size=1400,950']
        if self.host_rules:
            args.append('--host-resolver-rules=' + self.host_rules)
        if self.live and proxy_server():
            args.append('--proxy-server=' + proxy_server())
        elif not self.live:
            args.append('--no-proxy-server')
        self.ctx = await self._pw.chromium.launch_persistent_context(
            self.profile, headless=not self.headed, channel=None if self.headed else 'chromium', args=args, viewport={'width': 1300, 'height': 900})
        sw = self.ctx.service_workers[0] if self.ctx.service_workers else await self.ctx.wait_for_event('serviceworker')
        self.eid = sw.url.split('/')[2]
        self.page = await self.ctx.new_page()
        await self.page.goto(f'chrome-extension://{self.eid}/app/app.html')
        return self

    async def __aexit__(self, *a):
        try:
            await self.ctx.close()
        finally:
            await self._pw.stop()
            shutil.rmtree(self.profile, ignore_errors=True)

    async def send(self, msg):
        return await self.page.evaluate('(m)=>new Promise(r=>chrome.runtime.sendMessage(m,r))', msg)

    async def get(self, keys):
        return await self.page.evaluate('(k)=>new Promise(r=>chrome.storage.local.get(k,o=>r(o)))', keys)

    async def settings(self, **kw):
        await self.page.evaluate(
            '(p)=>new Promise(r=>chrome.storage.local.get("settings",o=>chrome.storage.local.set({settings:Object.assign({},o.settings||{},p)},r)))', kw)

    async def crawl(self, url, max_pages=5, timeout=240):
        sent = time.time() * 1000
        await self.send({'type': 'crawl', 'url': url, 'maxPages': max_pages})
        c = {}
        for _ in range(int(timeout * 2)):
            c = (await self.get('crawl')).get('crawl') or {}
            if c.get('state') == 'idle' and (c.get('finishedAt') or 0) > sent:
                break
            await asyncio.sleep(0.5)
        return c

    async def items(self, ids=None):
        if ids is None:
            ids = (await self.get('ids')).get('ids') or []
        got = await self.get(['it:' + i for i in ids])
        return [got['it:' + i] for i in ids if 'it:' + i in got]

    async def grab(self, urls, timeout=3600, progress=None):
        """Adds the links, starts the queue, waits until every product is done/check/failed. Returns items by url."""
        await self.send({'type': 'add-links', 'urls': urls})
        await self.send({'type': 'start'})
        t0 = time.time()
        items = []
        last = -1
        while time.time() - t0 < timeout:
            items = await self.items()
            done = sum(1 for i in items if i['status'] in ('done', 'check', 'failed'))
            if progress and done != last:
                progress(done, len(items))
                last = done
            if items and done == len(items):
                break
            await asyncio.sleep(1)
        return items


def ext_hash(key):
    """Same id as background.js hash(keyOf(url)) — lets us find a product's it:<id> without asking the extension."""
    def imul(a, b):
        return ((a & 0xffffffff) * (b & 0xffffffff)) & 0xffffffff

    h1, h2 = 0xdeadbeef, 0x41c6ce57
    for ch in key.encode('utf-16-le').decode('utf-16-le'):
        c = ord(ch)
        h1 = imul(h1 ^ c, 2654435761)
        h2 = imul(h2 ^ c, 1597334677)
    h1 = imul(h1 ^ (h1 >> 16), 2246822507) ^ imul(h2 ^ (h2 >> 13), 3266489909)
    h1 &= 0xffffffff
    h2 = imul(h2 ^ (h2 >> 16), 2246822507) ^ imul(h1 ^ (h1 >> 13), 3266489909)
    h2 &= 0xffffffff

    def b36(n):
        s = ''
        while True:
            n, r = divmod(n, 36)
            s = '0123456789abcdefghijklmnopqrstuvwxyz'[r] + s
            if n == 0:
                return s
    return b36(h2) + b36(h1)


def url_key(url):
    u = urlparse(url)
    return (u.netloc + re.sub(r'/+$', '', u.path) + ('?' + u.query if u.query else '')).lower()
