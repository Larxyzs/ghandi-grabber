"""The independent auditor: builds expected/<id>.json (THE TRUTH) from a saved page. It never imports the extension.

  python training/audit.py                 # every saved product without an expected file
  python training/audit.py --ids X --force # again (keeps "verified" files unless --force-verified)
  python training/audit.py --check         # print a short line per product (pictures, specs, model) for checking

It reads the rendered page (rendered.html.gz: tabs opened, hidden parts marked), the downloaded page (raw.html.gz),
the JSON the page fetched (xhr/) and what the browser showed (gallery.json), with rules written per site from
looking at the real pages (structured data first: JSON-LD, the site's own JSON; then the visible spec tables).
Claude then checks each file against the screenshots/spec.txt and sets "verified": true.
"""
import argparse, glob, gzip, html, json, os, re, sys
from urllib.parse import urljoin, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402

WS = re.compile(r'\s+')


def clean(t):
    return WS.sub(' ', html.unescape(str(t or '')).replace(' ', ' ').replace('​', '')).strip()


def hidden(el):
    while el is not None and getattr(el, 'attrs', None) is not None:
        if el.attrs.get('data-gh-hidden') == '1':
            return True
        el = el.parent
    return False


def text(el):
    if el is None:
        return ''
    return clean(el.get_text(' '))


def vis_text(el):
    """Text of el without the parts that were hidden on the page."""
    if el is None:
        return ''
    parts = []
    for s in el.find_all(string=True):
        if s.parent and s.parent.name in ('script', 'style', 'noscript'):
            continue
        if hidden(s.parent):
            continue
        parts.append(str(s))
    return clean(' '.join(parts))


class Page:
    def __init__(self, item):
        self.item = item
        self.dir = C.snap_dir(item)
        self.rendered = C.read_gz(os.path.join(self.dir, 'rendered.html.gz'))
        self.raw = C.read_gz(os.path.join(self.dir, 'raw.html.gz'))
        self.soup = BeautifulSoup(self.rendered, 'lxml')
        self._raw_soup = None
        with open(os.path.join(self.dir, 'meta.json'), encoding='utf-8') as f:
            self.meta = json.load(f)
        self.url = self.meta.get('finalUrl') or item['url']
        try:
            with open(os.path.join(self.dir, 'gallery.json'), encoding='utf-8') as f:
                self.gallery = json.load(f).get('images', [])
        except Exception:
            self.gallery = []
        self.xhr = []
        for f in sorted(glob.glob(os.path.join(self.dir, 'xhr', '*.json*'))):
            try:
                with (gzip.open(f, 'rt', encoding='utf-8') if f.endswith('.gz') else open(f, encoding='utf-8')) as fh:
                    x = json.load(fh)
                x['json'] = json.loads(x['body'])
                self.xhr.append(x)
            except Exception:
                pass

    @property
    def raw_soup(self):
        if self._raw_soup is None:
            self._raw_soup = BeautifulSoup(self.raw, 'lxml')
        return self._raw_soup

    def abs(self, u):
        return urljoin(self.url, html.unescape(u or '').strip())

    def jsonld(self, soup=None):
        out = []
        for s in (soup or self.soup).find_all('script', type=re.compile('ld\\+json', re.I)):
            try:
                d = json.loads(s.string or s.get_text() or '')
            except Exception:
                continue
            stack = d if isinstance(d, list) else [d]
            while stack:
                x = stack.pop(0)
                if isinstance(x, dict):
                    if '@graph' in x:
                        stack += x['@graph'] if isinstance(x['@graph'], list) else [x['@graph']]
                    out.append(x)
                elif isinstance(x, list):
                    stack += x
        return out

    def product_ld(self):
        for soup in (self.soup, self.raw_soup):
            for x in self.jsonld(soup):
                t = x.get('@type')
                if t == 'Product' or (isinstance(t, list) and 'Product' in t):
                    return x
        return {}

    def h1(self):
        for h in self.soup.find_all('h1'):
            if not hidden(h) and text(h):
                return text(h)
        h = self.soup.find('h1')
        return text(h)


def rows_from_pairs(group, pairs):
    out = []
    seen = set()
    for l, v in pairs:
        l, v = clean(l).rstrip(' :'), clean(v)
        if not l or not v:
            continue
        k = (l.lower(), v.lower())
        if k in seen:
            continue
        seen.add(k)
        out.append({'group': clean(group), 'label': l, 'value': v})
    return out


def dedupe(rows):
    seen = set()
    out = []
    for r in rows:
        k = (r['label'].lower(), r['value'].lower())
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    return out


def uniq(seq, key=lambda x: x):
    seen = set()
    out = []
    for x in seq:
        k = key(x)
        if k and k not in seen:
            seen.add(k)
            out.append(x)
    return out


def audit(item):
    from audit_sites import SITES  # one function per site, written from the real pages
    p = Page(item)
    fn = SITES.get(item['site'])
    res = fn(p) if fn else {}
    exp = {
        'id': item['id'], 'site': item['site'], 'type': item['type'], 'url': item['url'], 'finalUrl': p.url,
        'name': res.get('name', ''), 'brand': res.get('brand', ''), 'model': res.get('model', ''),
        'pictures': res.get('pictures', []), 'specs': dedupe(res.get('specs', [])),
        'verified': False, 'auditedAt': C.now_iso(), 'auditNotes': res.get('notes', []),
    }
    if res.get('type'):
        exp['type'] = res['type']
    return exp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--site')
    ap.add_argument('--type')
    ap.add_argument('--ids', nargs='*')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--force-verified', action='store_true')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    items = [i for i in C.filter_items(C.load_corpus(), args) if os.path.exists(os.path.join(C.snap_dir(i), 'rendered.html.gz'))]
    for it in items:
        old = C.load_expected(it['id'])
        if args.check:
            e = old
        elif old and not args.force:
            continue
        elif old and old.get('verified') and not args.force_verified:
            print('keep verified', it['id'])
            continue
        else:
            try:
                e = audit(it)
            except Exception as ex:
                import traceback
                traceback.print_exc()
                print('AUDIT FAILED', it['id'], ex)
                continue
            if old and old.get('checkNotes'):
                e['checkNotes'] = old['checkNotes']
            C.save_json(os.path.join(C.EXPECTED, it['id'] + '.json'), e)
        if e:
            groups = uniq([r['group'] for r in e['specs']])
            print(f"{it['id']:52} {e['type']:12} pics {len(e['pictures']):2}  specs {len(e['specs']):3} in {len(groups):2} groups  model {e['model']!r:22} brand {e['brand']!r} {'V' if e.get('verified') else ''}")


if __name__ == '__main__':
    main()
