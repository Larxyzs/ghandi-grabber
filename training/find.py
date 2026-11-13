"""Find product links on the real category pages with the extension's OWN "Find products", then add some to the corpus.

  python training/find.py [--site lg] [--type fridge]          # crawl -> training/tmp/found.json
  python training/find.py --pick 3 [--site lg] [--type fridge] # add up to 3 NEW products per site x type to corpus.jsonl

Polite: one category page at a time, >= the site's delay between pages of the same site.
"""
import argparse, asyncio, json, os, random, re, sys
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

FOUND = os.path.join(C.TMP, 'found.json')


def make_id(site, url, taken):
    segs = [s for s in urlparse(url).path.split('/') if s]
    last = segs[-1] if segs else 'p'
    if site == 'electrobousfiha':
        last = re.sub(r'\.html$', '', last)
    if site == 'whirlpool' and len(segs) >= 2 and re.fullmatch(r'\d{9,14}', last):
        last = segs[-2]
    if site in ('haier', 'candy') and len(segs) >= 2 and re.fullmatch(r'\d{1,2}', last):
        last = segs[-2]
    slug = re.sub(r'[^a-z0-9]+', '-', last.lower()).strip('-')[:40] or 'p'
    pid = site + '-' + slug
    n = 2
    while pid in taken:
        pid = f'{site}-{slug}-{n}'
        n += 1
    taken.add(pid)
    return pid


async def crawl(args):
    sites = C.load_sites()
    found = {}
    if os.path.exists(FOUND):
        with open(FOUND, encoding='utf-8') as f:
            found = json.load(f)
    polite = C.Polite()
    async with C.Extension(live=True) as ext:
        await ext.settings(quickRead=True)
        for sid, s in sites.items():
            if args.site and sid not in args.site.split(','):
                continue
            for typ, urls in s['categories'].items():
                if args.type and typ not in args.type.split(','):
                    continue
                for url in urls:
                    polite.wait(url, s.get('delay', 2.5))
                    await ext.send({'type': 'clear-all'})
                    c = await ext.crawl(url, max_pages=args.pages)
                    items = await ext.items()
                    links = [{'url': i['url'], 'title': i.get('title', '')} for i in items]
                    found.setdefault(sid, {}).setdefault(typ, {})[url] = {'message': c.get('message', ''), 'links': links, 'report': c.get('report')}
                    print(f'{sid:16} {typ:12} {len(links):3} links | {c.get("message", "")[:90]}', flush=True)
                    C.save_json(FOUND, found)


def pick(args):
    with open(FOUND, encoding='utf-8') as f:
        found = json.load(f)
    corpus = C.load_corpus()
    have = {C.url_key(i['url']) for i in corpus}
    taken = {i['id'] for i in corpus}
    rnd = random.Random(args.seed)
    added = 0
    for sid, types in found.items():
        if args.site and sid not in args.site.split(','):
            continue
        for typ, cats in types.items():
            if args.type and typ not in args.type.split(','):
                continue
            pool = []
            for cat, r in cats.items():
                for l in r['links']:
                    if C.url_key(l['url']) not in have and l['url'] not in [p[0] for p in pool]:
                        pool.append((l['url'], cat, l.get('title', '')))
            already = sum(1 for i in corpus if i['site'] == sid and i['type'] == typ)
            want = max(0, args.pick - (already if args.fill else 0))
            rnd.shuffle(pool)
            for url, cat, title in pool[:want]:
                pid = make_id(sid, url, taken)
                corpus.append({'id': pid, 'site': sid, 'type': typ, 'url': url, 'listUrl': cat, 'title': title, 'addedAt': C.now_iso(), 'verified': False})
                have.add(C.url_key(url))
                added += 1
                print('added', pid, url)
    C.save_corpus(corpus)
    print('corpus:', len(corpus), 'products (+%d)' % added)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--site')
    ap.add_argument('--type')
    ap.add_argument('--pages', type=int, default=2)
    ap.add_argument('--pick', type=int, default=0)
    ap.add_argument('--fill', action='store_true', help='with --pick: count products already in the corpus')
    ap.add_argument('--seed', type=int, default=7)
    a = ap.parse_args()
    if a.pick:
        pick(a)
    else:
        C.ensure_display()
        asyncio.run(crawl(a))
