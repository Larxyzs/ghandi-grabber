"""Help Claude check expected files against the real page before setting "verified": true.

  python training/check.py --site candy          # picture sheet + spec cross-check for one site
  python training/check.py --verify ID ID ...    # mark these expected files verified (after looking)

Writes training/tmp/check-<site>.jpg: one row per product with its expected pictures in order (main first),
its name, brand, model, type, and the number of spec rows. Also prints, per product, spec rows whose label or value
is not written anywhere on the saved page (they come from the site's JSON, or the auditor made a mistake).
"""
import argparse, html, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import score as S  # noqa: E402


def page_text(item):
    d = C.snap_dir(item)
    t = ''
    for f in ('rendered.html.gz', 'raw.html.gz'):
        try:
            t += ' ' + C.read_gz(os.path.join(d, f))
        except Exception:
            pass
    t = html.unescape(re.sub(r'<[^>]+>', ' ', t))
    t = t.replace('\\u0027', "'").replace('\\"', '"')
    return S.fold(t)


def sheet(site, items, out):
    rows = []
    for it in items:
        e = C.load_expected(it['id'])
        if not e:
            continue
        pics = ''.join(f'<img src="{html.escape(u)}" loading="eager">' for u in e['pictures'][:14])
        more = f'<b>+{len(e["pictures"]) - 14}</b>' if len(e['pictures']) > 14 else ''
        rows.append(f'<div class="r"><div class="t"><b>{html.escape(it["id"])}</b><br>{html.escape(e["name"][:90])}<br>'
                    f'<i>{html.escape(e["brand"])}</i> | <code>{html.escape(e["model"])}</code> | {e["type"]} | {len(e["specs"])} specs | {len(e["pictures"])} pics'
                    f'{" | ✔" if e.get("verified") else ""}</div><div class="p">{pics}{more}</div></div>')
    page = ('<html><head><meta charset="utf-8"><style>body{font:12px sans-serif;margin:6px;background:#fff}'
            '.r{display:flex;border-bottom:1px solid #ccc;padding:3px 0}.t{width:300px;flex:none}'
            '.p img{height:86px;max-width:130px;object-fit:contain;border:1px solid #ddd;margin:1px;background:#f6f6f6}'
            '.p img:first-child{border:2px solid #d00}</style></head><body>' + ''.join(rows) + '</body></html>')
    hp = os.path.join(C.TMP, f'check-{site}.html')
    with open(hp, 'w', encoding='utf-8') as f:
        f.write(page)
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        kw = {'proxy': {'server': C.proxy_server()}} if C.proxy_server() else {}
        b = p.chromium.launch(**kw)
        pg = b.new_page(viewport={'width': 1700, 'height': 900})
        pg.goto('file://' + hp, wait_until='domcontentloaded')
        try:
            pg.wait_for_load_state('networkidle', timeout=40000)
        except Exception:
            pass
        pg.wait_for_timeout(1500)
        pg.screenshot(path=out, full_page=True, type='jpeg', quality=55)
        b.close()
    return out


def spec_check(items):
    for it in items:
        e = C.load_expected(it['id'])
        if not e:
            continue
        t = page_text(it)
        miss = []
        for r in e['specs']:
            l, v = S.fold(r['label']), S.fold(r['value'])
            if l not in t or (v not in t and S.norm_value(v) not in t.replace(' ', '')):
                miss.append(f"{r['label']}={r['value']}")
        flag = '' if not miss else f'  NOT-ON-PAGE {len(miss)}: ' + '; '.join(miss[:6])
        print(f"{it['id']:55} specs {len(e['specs']):3} pics {len(e['pictures']):2} model {e['model']!r}{flag}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--site')
    ap.add_argument('--type')
    ap.add_argument('--ids', nargs='*')
    ap.add_argument('--verify', nargs='*')
    ap.add_argument('--note', default='')
    ap.add_argument('--no-sheet', action='store_true')
    args = ap.parse_args()
    if args.verify is not None:
        for pid in args.verify:
            e = C.load_expected(pid)
            if not e:
                print('no expected file', pid)
                continue
            e['verified'] = True
            e['verifiedAt'] = C.now_iso()
            if args.note:
                e['checkNotes'] = args.note
            C.save_json(os.path.join(C.EXPECTED, pid + '.json'), e)
        print('verified', len(args.verify))
        return
    items = [i for i in C.filter_items(C.load_corpus(), args) if C.load_expected(i['id'])]
    spec_check(items)
    if not args.no_sheet:
        by = {}
        for it in items:
            by.setdefault(it['site'], []).append(it)
        for site, its in by.items():
            for k in range(0, len(its), 14):
                out = os.path.join(C.TMP, f'check-{site}-{k // 14 + 1}.jpg')
                print('sheet', sheet(site, its[k:k + 14], out))


if __name__ == '__main__':
    main()
