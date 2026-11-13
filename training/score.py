"""The grading rules (used by evaluate.py and replay.py). 100 points per product, see training/README.md.

Python, independent of the extension: it only reads the extension's saved product (it:<id>) and expected/<id>.json.
  python training/score.py runs/<ts>     # grade a saved run again (after fixing an expected file)
"""
import json, os, re, subprocess, sys, unicodedata
from urllib.parse import urlparse, unquote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

POINTS = {'model': 15, 'brand': 10, 'name': 5, 'type': 5, 'pic_recall': 10, 'pic_precision': 10, 'pic_main': 5, 'pic_order': 5,
          'spec_recall': 20, 'spec_precision': 10, 'sheet': 5}
FIELDS = list(POINTS)


# ------------------------------------------------------------------ text normalising
def fold(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn')
    s = s.replace(' ', ' ').replace(' ', ' ').replace('’', "'").replace('‘', "'")
    return re.sub(r'\s+', ' ', s).strip().lower()


def squash(s):
    return re.sub(r'[^a-z0-9]', '', fold(s))


YES = {'oui', 'yes', 'true', 'vrai', '✓', '✔', '✔️', 'x', 'disponible', 'avec', 'present', 'inclus'}
NO = {'non', 'no', 'false', 'faux', '✗', '✘', 'sans', 'absent', 'aucun', 'aucune', 'none'}


def norm_value(v):
    t = fold(v)
    t = t.strip(' .;:')
    if t in YES:
        return 'oui'
    if t in NO:
        return 'non'
    t = re.sub(r'(\d)[ \'](?=\d{3}\b)', r'\1', t)  # 1 860 -> 1860
    t = re.sub(r'(\d),(\d)', r'\1.\2', t)  # 10,5 -> 10.5
    t = re.sub(r'(\d+\.\d*?)0+\b', r'\1', t)  # 3.50 -> 3.5
    t = re.sub(r'(\d)\.(?!\d)', r'\1', t)
    return re.sub(r'[^a-z0-9.]', '', t)


def norm_label(l):
    t = fold(l).rstrip(' :*')
    return re.sub(r'[^a-z0-9]', '', t)


def canon_brand(b):
    return squash(b).replace('and', '')


# ------------------------------------------------------------------ pictures: the same picture in another size = same key
def pic_key(site, url):
    u = str(url or '').strip()
    if not u:
        return ''
    p = urlparse(u if '//' in u else 'https://' + u)
    path = p.path
    low = (p.netloc + path).lower()
    if site == 'lg':
        low = re.sub(r'/jcr:content/renditions/.*$', '', low)
        low = re.sub(r'/gallery(-[a-z0-9]*)?/(\d+/)*', '/gallery/', low)
    elif site in ('candy', 'haier'):
        # the same picture: other size prefix (640-), other date folder, other letter suffix (-M/-S/-T)
        f = unquote(low.rsplit('/', 1)[-1])
        return 'hp:' + re.sub(r'^\d{2,4}-|-[a-z]\.(jpe?g|png|webp)$', '', f)
    elif site == 'electrobousfiha':
        m = re.search(r'/(\d+)-[a-z0-9_]+_default/', low)
        if m:
            return 'img-' + m.group(1)
    elif site == 'bosch':
        m = re.search(r'/([^/]+?)(\.[a-z0-9]+)?$', low)
        if m and 'bsh-group' in low:
            return 'bsh:' + re.sub(r'_(def|sm|xl|lg)$', '', m.group(1))
    elif site == 'samsung':
        pass  # the size is in the query ($1164_776_PNG$): dropped below
    elif site == 'tcl':
        low = re.sub(r'^aws-obg-image-lb-\d+\.tcl\.com', 'static-obg.tcl.com', low)
    elif site == 'whirlpool':
        low = re.sub(r'/jcr:content/renditions/.*$', '', low)
        low = re.sub(r'\.(transform|thumb)/[^/]+', '', low)
    low = re.sub(r'^www\.', '', low)
    return low


def lcs(a, b):
    if not a or not b:
        return 0
    dp = [0] * (len(b) + 1)
    for x in a:
        prev = 0
        for j, y in enumerate(b, 1):
            cur = dp[j]
            dp[j] = prev + 1 if x == y else max(dp[j], dp[j - 1])
            prev = cur
    return dp[-1]


# ------------------------------------------------------------------ spec rows
def row_match(er, xr):
    if er['v'] != xr['v']:
        return False
    if er['l'] == xr['l']:
        return True
    a, b = er['l'], xr['l']
    return len(a) >= 4 and len(b) >= 4 and (a in b or b in a)


def match_specs(exp_rows, got_rows):
    E = [{'l': norm_label(r['label']), 'v': norm_value(r['value']), 'raw': r} for r in exp_rows]
    G = [{'l': norm_label(r.get('label', '')), 'v': norm_value(r.get('value', '')), 'raw': r} for r in got_rows]
    used = set()
    found = 0
    missing = []
    for e in E:
        hit = None
        for j, g in enumerate(G):
            if j not in used and e['l'] == g['l'] and e['v'] == g['v']:
                hit = j
                break
        if hit is None:
            for j, g in enumerate(G):
                if j not in used and row_match(e, g):
                    hit = j
                    break
        if hit is None:
            missing.append(e['raw'])
        else:
            used.add(hit)
            found += 1
    junk = [G[j]['raw'] for j in range(len(G)) if j not in used]
    return found, missing, junk


# ------------------------------------------------------------------ sheets (Electroplanet lines)
def sheet_counts(products):
    """products: [{id, type, url, name, brand, model, groups}] -> {id: {filled, rows}} using sheets/engine.js in Node."""
    if not products:
        return {}
    try:
        r = subprocess.run(['node', os.path.join(C.HERE, 'sheet_count.js')], input=json.dumps(products), capture_output=True, text=True, timeout=120)
        return json.loads(r.stdout or '{}')
    except Exception as e:
        print('sheet count failed:', e)
        return {}


def exp_groups(exp):
    groups = []
    for r in exp.get('specs', []):
        if not groups or groups[-1]['title'] != r.get('group', ''):
            groups.append({'title': r.get('group', ''), 'rows': []})
        groups[-1]['rows'].append({'label': r['label'], 'value': r['value']})
    return groups


def same_name(got, want, model, brand):
    """Same text (spaces/case ignored). The model code or brand added/removed around it does not change the name."""
    g, w = squash(got), squash(want)
    if g == w:
        return True
    for t in (squash(model), squash(brand)):
        if t and len(t) >= 2:
            g, w = g.replace(t, ''), w.replace(t, '')
    return bool(g) and g == w


# ------------------------------------------------------------------ one product
def score_product(exp, item, sheet_exp=None):
    site = exp['site']
    r = (item or {}).get('result') or {}
    s = {}
    detail = {}
    ok = item is not None and item.get('status') in ('done', 'check') and r
    if not ok:
        return {f: 0.0 for f in FIELDS}, {'status': (item or {}).get('status', 'missing'), 'message': (item or {}).get('message', '')}
    # identity
    s['model'] = 1.0 if exp.get('model') and squash(r.get('model')) == squash(exp['model']) else (1.0 if not exp.get('model') and not r.get('model') else 0.0)
    s['brand'] = 1.0 if canon_brand(r.get('brand')) == canon_brand(exp.get('brand')) else 0.0
    s['name'] = 1.0 if same_name(r.get('name'), exp.get('name'), exp.get('model'), exp.get('brand')) else 0.0
    got_type = item.get('ptype') or item.get('ptypeAuto') or (item.get('sheet') or {}).get('type') or 'other'
    want_type = C.SHEET_TYPE.get(exp['type'], 'other')
    s['type'] = 1.0 if got_type == want_type else 0.0
    detail.update(model=r.get('model'), brand=r.get('brand'), name=r.get('name'), type=got_type, wantType=want_type)
    # pictures
    got = [u for u in [r.get('mainImage')] + list(r.get('otherImages') or []) if u]
    gk = [pic_key(site, u) for u in got]
    ek = [pic_key(site, u) for u in exp.get('pictures', [])]
    eset = set(ek)
    seen = set()
    good = []
    foreign = []
    for u, k in zip(got, gk):
        if k in eset and k not in seen:
            good.append(k)
            seen.add(k)
        else:
            foreign.append(u)
    s['pic_recall'] = len(seen) / len(eset) if eset else (1.0 if not got else 0.0)
    s['pic_precision'] = len(good) / len(got) if got else (1.0 if not eset else 0.0)
    s['pic_main'] = 1.0 if ek and gk and gk[0] == ek[0] else (1.0 if not ek and not gk else 0.0)
    common = [k for k in ek if k in seen]
    s['pic_order'] = (lcs(common, good) / len(common)) if len(common) >= 2 else (1.0 if common else (1.0 if not ek else 0.0))
    detail.update(pictures=len(got), picturesExpected=len(ek), foreignPictures=foreign[:12], missingPictures=[u for u, k in zip(exp.get('pictures', []), ek) if k not in seen][:12])
    # specs
    exp_rows = exp.get('specs', [])
    got_rows = r.get('specs') or []
    if not exp_rows:
        s['spec_recall'] = 1.0
        s['spec_precision'] = 1.0 if not got_rows else 0.0
        missing, junk = [], got_rows
    else:
        found, missing, junk = match_specs(exp_rows, got_rows)
        s['spec_recall'] = found / len(exp_rows)
        s['spec_precision'] = (len(got_rows) - len(junk)) / len(got_rows) if got_rows else 0.0
    detail.update(specs=len(got_rows), specsExpected=len(exp_rows), missingSpecs=missing[:40], junkSpecs=junk[:40])
    # sheet coverage
    want = (sheet_exp or {}).get('filled', 0)
    have = ((item.get('sheet') or {}).get('filled') or 0) if (item.get('sheet') or {}).get('type') == want_type else 0
    s['sheet'] = min(1.0, have / want) if want else 1.0
    detail.update(sheetFilled=have, sheetPossible=want, sheetMissing=[l for l in (sheet_exp or {}).get('rows', []) if l not in [x['label'] for g in ((item.get('sheet') or {}).get('groups') or []) for x in g.get('rows', [])]][:30])
    detail.update(status=item.get('status'), message=item.get('message', ''), mode=item.get('mode', ''), seconds=item.get('seconds'), warnings=r.get('warnings', []))
    return s, detail


def total(s):
    return sum(POINTS[f] * s.get(f, 0) for f in FIELDS)


def score_run(items_by_id, corpus):
    """items_by_id: corpus id -> extension item. Returns {id: {...}} with points per field."""
    exps = {}
    for it in corpus:
        e = C.load_expected(it['id'])
        if e:
            exps[it['id']] = e
    sheets = sheet_counts([{'id': pid, 'type': C.SHEET_TYPE.get(e['type'], 'other'), 'url': e['url'], 'name': e.get('name'), 'brand': e.get('brand'),
                            'model': e.get('model'), 'groups': exp_groups(e)} for pid, e in exps.items()])
    out = {}
    for pid, e in exps.items():
        s, d = score_product(e, items_by_id.get(pid), sheets.get(pid))
        out[pid] = {'site': e['site'], 'type': e['type'], 'verified': bool(e.get('verified')), 'points': {f: round(POINTS[f] * s[f], 2) for f in FIELDS},
                    'total': round(total(s), 2), 'detail': d}
    return out


# ------------------------------------------------------------------ report
def avg(xs):
    xs = list(xs)
    return sum(xs) / len(xs) if xs else 0.0


def report(scores, title, extra_lines=()):
    L = [f'# {title}', '']
    L += list(extra_lines)
    allp = list(scores.values())
    L.append(f'**Total: {avg(p["total"] for p in allp):.1f} / 100** on {len(allp)} products '
             f'({sum(1 for p in allp if p["verified"])} verified expected files).')
    L.append('')
    # points lost per field (where to work)
    L.append('## Points lost per field (all products)')
    L.append('| Field | Max | Average | Points lost (sum) |')
    L.append('|---|---|---|---|')
    lost = []
    for f in FIELDS:
        a = avg(p['points'][f] for p in allp)
        lost.append((sum(POINTS[f] - p['points'][f] for p in allp), f, a))
    for l, f, a in sorted(lost, reverse=True):
        L.append(f'| {f} | {POINTS[f]} | {a:.2f} | {l:.0f} |')
    L.append('')
    # site x field
    sites = sorted({p['site'] for p in allp})
    short = {'model': 'model', 'brand': 'brand', 'name': 'name', 'type': 'type', 'pic_recall': 'pic rec', 'pic_precision': 'pic prec', 'pic_main': 'main', 'pic_order': 'order',
             'spec_recall': 'spec rec', 'spec_precision': 'spec prec', 'sheet': 'sheet'}
    L.append('## Score per site')
    L.append('| Site | N | Total | ' + ' | '.join(short[f] for f in FIELDS) + ' | sec | quick |')
    L.append('|---|---|---|' + '---|' * len(FIELDS) + '---|---|')
    for st in sites:
        ps = [p for p in allp if p['site'] == st]
        secs = [p['detail'].get('seconds') for p in ps if p['detail'].get('seconds') is not None]
        quick = sum(1 for p in ps if p['detail'].get('mode') == 'quick')
        L.append(f'| {st} | {len(ps)} | **{avg(p["total"] for p in ps):.1f}** | ' + ' | '.join(f'{avg(p["points"][f] for p in ps):.1f}' for f in FIELDS) +
                 f' | {avg(secs):.1f} | {quick}/{len(ps)} |')
    L.append('')
    types = sorted({p['type'] for p in allp})
    L.append('## Score per product type')
    L.append('| Type | N | Total | model | pic rec | pic prec | spec rec | spec prec | sheet | type |')
    L.append('|---|---|---|---|---|---|---|---|---|---|')
    for t in types:
        ps = [p for p in allp if p['type'] == t]
        L.append(f'| {t} | {len(ps)} | **{avg(p["total"] for p in ps):.1f}** | ' + ' | '.join(f'{avg(p["points"][f] for p in ps):.1f}' for f in ['model', 'pic_recall', 'pic_precision', 'spec_recall', 'spec_precision', 'sheet', 'type']) + ' |')
    L.append('')
    L.append('## Weakest products')
    L.append('| Product | Total | Lost on | Notes |')
    L.append('|---|---|---|---|')
    for pid, p in sorted(scores.items(), key=lambda kv: kv[1]['total'])[:25]:
        lostf = sorted(((POINTS[f] - p['points'][f], f) for f in FIELDS), reverse=True)
        lostf = ', '.join(f'{f} -{l:.0f}' for l, f in lostf if l >= 1)[:90]
        d = p['detail']
        note = d.get('message') or ''
        if d.get('missingSpecs'):
            note += f' missing {len(d["missingSpecs"])} specs (e.g. {d["missingSpecs"][0]["label"]})'
        if d.get('foreignPictures'):
            note += f' {len(d["foreignPictures"])} foreign pics'
        L.append(f'| {pid} | {p["total"]:.0f} | {lostf} | {note[:120]} |')
    return '\n'.join(L) + '\n'


if __name__ == '__main__':
    run = sys.argv[1]
    items = {}
    for f in os.listdir(run):
        if f.endswith('.json') and f not in ('scores.json', 'meta.json'):
            with open(os.path.join(run, f), encoding='utf-8') as fh:
                items[f[:-5]] = json.load(fh)
    sc = score_run(items, [c for c in C.load_corpus() if c['id'] in items])
    C.save_json(os.path.join(run, 'scores.json'), sc)
    txt = report(sc, 'Re-scored ' + os.path.basename(run))
    with open(os.path.join(run, 'report.md'), 'w', encoding='utf-8') as f:
        f.write(txt)
    print(txt[:3000])
