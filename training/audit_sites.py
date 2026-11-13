"""Per-site audit rules (independent of the extension). Each function gets an audit.Page and returns
{name, brand, model, pictures: [...], specs: [{group, label, value}], notes: [...]}.
Written by looking at the real saved pages (see training/JOURNAL.md for what each site looks like)."""
import json, re
from urllib.parse import urlparse, unquote

from audit import clean, hidden, text, vis_text, uniq, rows_from_pairs  # noqa: F401


def norm_space(s):
    return re.sub(r'\s+', ' ', s or '').strip()


def page_has(p, label):
    """True if the label is written in the visible text of the page (spec.txt / rendered)."""
    if not hasattr(p, '_vis'):
        try:
            with open(p.dir + '/spec.txt', encoding='utf-8') as f:
                p._vis = norm_space(f.read()).lower()
        except Exception:
            p._vis = ''
        p._vis += ' ' + vis_text(p.soup.body).lower()
    return norm_space(label).lower() in p._vis


# ------------------------------------------------------------------ Candy & Haier (same "Candy Hoover / Haier Europe" Gatsby platform)
def _gatsby_product(p):
    for x in p.xhr:
        if '/page-data/' in x['url'] and x['url'].rstrip('/').endswith('page-data.json'):
            try:
                d = x['json']['result']['data'].get('babelProdotto')
            except Exception:
                d = None
            path = urlparse(p.url).path
            if d and ((d.get('productLink') and d['productLink'].strip('/') in path) or (d.get('key_prod') and '/' + str(d['key_prod']) + '/' in path)):
                return d
    return None


def _haier_pic(u):
    # https://d15v10x8t3bz3x.cloudfront.net/Immagini/2024/4/17121341/1_31020150_09_02_o_x-M.jpg -> the site's own copy
    m = re.search(r'/Immagini/(.+)$', u)
    return '/h-image/haier-product/' + m.group(1) if m else u


def candy_haier(p, brand_default):
    notes = []
    d = _gatsby_product(p)
    if not d:
        notes.append('no page-data.json product found')
        return {'name': p.h1(), 'brand': brand_default, 'notes': notes}
    name = p.h1()
    model = clean(d.get('productName') or d.get('productCode') or '')
    brand = clean(d.get('brandName') or brand_default)
    pics = []

    def big(lst):
        # the biggest copy: type "M" (the site shows it at w=1000); else the first one
        best = None
        for x in lst or []:
            if x.get('imageType') == 'M':
                best = x['imageUrl']
        if not best and lst:
            best = lst[-1]['imageUrl']
        return best
    prim = big(d.get('primaryimage'))
    if prim:
        pics.append(p.abs(_haier_pic(prim)))
    for lst in d.get('otherImages') or []:
        b = big(lst)
        if b:
            pics.append(p.abs(_haier_pic(b)))
    pics = uniq(pics, key=lambda u: re.sub(r'^\d{2,4}-|-[A-Z]\.(jpe?g|png|webp)$', '', unquote(u.rsplit('/', 1)[-1])).lower())
    # "_n_" pictures are technical size drawings: skipped like on every site (owner's choice for Bosch/LG drawings)
    drawings = [u for u in pics if re.search(r'_\d+_\d+_n_', u.rsplit('/', 1)[-1])]
    if drawings:
        notes.append(f'{len(drawings)} technical drawing(s) left out')
        pics = [u for u in pics if u not in drawings]
    specs = []
    hiddenrows = 0
    for cat in d.get('specifications') or []:
        g = clean(cat['category'].get('nameCategory', ''))
        for ch in cat.get('children') or []:
            l, v = clean(ch.get('fieldName')), clean(ch.get('fieldValue'))
            if not l or not v:
                continue
            if not page_has(p, l):
                hiddenrows += 1  # in the site's own product data but not written on the page: still the truth
            if keep_row(l, v):
                specs.append({'group': g, 'label': l, 'value': v})
    if hiddenrows:
        notes.append(f'{hiddenrows} rows come from the site JSON only (not written as text on the page)')
    ref = [r['value'] for r in specs if re.fullmatch(r'r[ée]f[ée]rence commerciale', r['label'], re.I)]
    if ref and looks_like_model(ref[0]):
        model = ref[0]  # the code the page shows (productName can be an internal code: HW100B14959S8U1U vs HW100-B14959S8U1)
    return {'name': name, 'brand': brand, 'model': model, 'pictures': pics, 'specs': specs, 'notes': notes}


NOTHING = re.compile(r'^(n/?a|n\.a\.?|-+|—|–|pas applicable|non applicable|not applicable|specifications\.translatedboolean\.na|aucune valeur)$', re.I)


def keep_row(l, v):
    """'Marque' is never a spec line (the brand has its own place); values that mean 'nothing' are not information."""
    return l and v and not re.fullmatch(r'marque|brand', l.strip(), re.I) and not NOTHING.match(v.strip())


def looks_like_model(v):
    v = clean(v)
    return 4 <= len(v) <= 32 and re.search(r'\d', v) and re.search(r'[a-z]', v, re.I) and len(v.split()) <= 4


# ------------------------------------------------------------------ TCL (AEM site; specs come from a JSON the page fetches)
def tcl(p):
    notes = []
    name = p.h1()
    specs = []
    model = ''
    for x in p.xhr:
        if 'product_spec' in x['url'] and isinstance(x.get('json'), dict):
            for tab in x['json'].get('data') or []:
                g = clean(tab.get('tab'))
                for it in tab.get('specItems') or []:
                    l, v = clean(it.get('name')), clean(it.get('value'))
                    if re.fullmatch(r'mod[eè]le( de client)?|nom du mod[eè]le|model', l, re.I) and looks_like_model(v) and not model:
                        model = v
                    if keep_row(l, v):
                        specs.append({'group': g, 'label': l, 'value': v})
    if not specs:
        notes.append('no product_spec JSON')
    slug = urlparse(p.url).path.rstrip('/').rsplit('/', 1)[-1]
    if not model and looks_like_model(slug.replace('-', ' ')) and '-' not in slug:
        model = slug.upper()
    pics = []
    for im in p.soup.select('.thumbsSlider img, .thumbs-wrapper img'):
        u = im.get('src') or im.get('data-src') or ''
        if '/content/dam/' in u:
            pics.append(p.abs(u.split('?')[0]))
    if not pics:
        slides = [im.get('src') or im.get('data-src') or '' for im in p.soup.select('.gallerySlider .swiper-slide:not(.swiper-slide-duplicate) img')]
        pics = [p.abs(u.split('?')[0]) for u in slides if '/content/dam/' in u]
        notes.append('pictures from slides (no thumbnails)')
    pics = uniq(pics, key=lambda u: re.sub(r'^https?://[^/]+', '', u))
    return {'name': name, 'brand': 'TCL', 'model': model, 'pictures': pics, 'specs': specs, 'notes': notes}


# ------------------------------------------------------------------ Bosch (Next.js: full spec groups in the page data; JSON-LD has the same list)
def _next_flight(raw):
    out = []
    for m in re.finditer(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)', raw):
        try:
            out.append(json.loads('"' + m.group(1) + '"'))
        except Exception:
            pass
    return ''.join(out)


def _json_at(s, i):
    depth, j, instr, esc = 0, i, False, False
    while j < len(s):
        c = s[j]
        if instr:
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == '"':
                instr = False
        elif c == '"':
            instr = True
        elif c in '[{':
            depth += 1
        elif c in ']}':
            depth -= 1
            if depth == 0:
                return s[i:j + 1]
        j += 1
    return ''


def bosch(p):
    notes = []
    ld = p.product_ld()
    model = clean(ld.get('mpn') or ld.get('sku') or urlparse(p.url).path.rstrip('/').rsplit('/', 1)[-1])
    name = clean(ld.get('name')) or p.h1()
    specs = []
    t = _next_flight(p.raw)
    BOOL = {'specifications.translatedBoolean.yes': 'Oui', 'specifications.translatedBoolean.no': 'Non'}
    for m in re.finditer(r'\{"name":"([^"]+)","fallbackNameKey":[^,]*,"key":"([A-Z_]+)","specifications":', t):
        try:
            arr = json.loads(_json_at(t, m.end()))
        except Exception:
            continue
        g = clean(m.group(1))
        for x in arr:
            l = clean((x.get('name') or {}).get('text'))
            v = clean((x.get('value') or {}).get('text'))
            v = BOOL.get(v, v)
            if x.get('unit') and v and not v.endswith(x['unit']):
                v = v + ' ' + clean(x['unit'])
            if keep_row(l, v):
                specs.append({'group': g, 'label': l, 'value': v})
    # "Aperçu technique": the short box at the top; its lines that are not in the full list (e.g. size with handle)
    have = {(r['label'].lower(), r['value'].lower().replace(' ', '')) for r in specs}
    for it in p.soup.select('[data-testid="technical-overview-item"]'):
        sp = it.find_all('span', recursive=True)
        h = sp[0] if sp else None
        c = it.find(lambda t: t.name in ('div', 'span') and t is not h and h is not None and h not in t.parents and t not in h.parents and text(t))
        if h and c and keep_row(text(h), text(c)) and (text(h).lower(), text(c).lower().replace(' ', '')) not in have:
            specs.insert(0, {'group': 'Aperçu technique', 'label': text(h), 'value': text(c)})
            have.add((text(h).lower(), text(c).lower().replace(' ', '')))
    if len(specs) < 5:
        notes.append('few specs from page data; JSON-LD additionalProperty used')
        for a in ld.get('additionalProperty') or []:
            l, v = clean(a.get('name')), clean(a.get('value'))
            if a.get('unitText'):
                v += ' ' + clean(a['unitText'])
            if keep_row(l, v):
                specs.append({'group': 'Caractéristiques', 'label': l, 'value': v})
    imgs = ld.get('image') or []
    imgs = [imgs] if isinstance(imgs, str) else imgs
    pics = [u for u in imgs if 'Line_Drawings' not in u]  # technical drawings are skipped on purpose (owner's choice)
    # the slideshow may have more shots than JSON-LD
    for im in p.soup.select('[data-testid="product-gallery-slider"] img, [data-testid="product-gallery-thumb-list"] img'):
        u = im.get('src') or ''
        if 'bsh-group.com/' in u and 'Line_Drawings' not in u:
            pics.append(u.split('?')[0])
    pics = uniq(pics, key=lambda u: re.sub(r'\.[a-z]+$', '', u.rsplit('/', 1)[-1]).lower())
    return {'name': name, 'brand': 'Bosch', 'model': model, 'pictures': pics, 'specs': specs, 'notes': notes}


# ------------------------------------------------------------------ Electrobousfiha (PrestaShop shop, many brands)
EB_BRANDS = ['Arthur Martin', 'De Dietrich', 'Bosch', 'Siemens', 'LG', 'Samsung', 'Whirlpool', 'Candy', 'Hoover', 'Haier', 'TCL', 'Hisense', 'Midea', 'Beko',
             'Schneider', 'Carrier', 'Gree', 'Teka', 'Franke', 'Electrolux', 'Indesit', 'Ariston', 'Smeg', 'Brandt', 'Sharp', 'Toshiba', 'Daewoo', 'Condor',
             'Vestel', 'Kenwood', 'Moulinex', 'Tefal', 'Sony', 'Philips', 'Panasonic', 'Grundig', 'Elica', 'Cata', 'Pyramis', 'Blanco', 'Glem', 'Elba',
             'Westpoint', 'Nikai', 'Thomson', 'Aucma', 'Sauter', 'Faure', 'Iris', 'Fagor', 'Nardi', 'Hotpoint', 'Zanussi', 'AEG', 'Daikin', 'Mitsubishi', 'Fujitsu']


def eb_brand(s):
    t = ' ' + re.sub(r'[^a-z0-9]+', ' ', (s or '').lower()) + ' '
    best = None
    for b in sorted(EB_BRANDS, key=len, reverse=True):
        i = t.find(' ' + b.lower() + ' ')
        if i != -1 and (best is None or i < best[0]):
            best = (i, b)
    return best[1] if best else ''


def electrobousfiha(p):
    notes = []
    h = p.soup.select_one('h1.productpage_title') or p.soup.select_one('h1[itemprop=name]')
    name = text(h) if h else p.h1()
    ref = p.soup.select_one('.product-reference')
    model = ''
    if ref:
        model = clean(re.sub(r'^r[ée]f[ée]rence\s*:?\s*', '', text(ref), flags=re.I)).lstrip(': ').strip()
    brand = ''
    man = p.soup.select_one('.product-manufacturer img[alt], .product-manufacturer a')
    if man:
        brand = eb_brand(man.get('alt') or text(man) or man.get('href', '').replace('-', ' '))
    if not brand:
        for el in p.soup.select('.product-information h1, #product-description-short, .product-description-short'):
            m = re.search(r'MARQUE\s*:\s*([^\n|]+)', vis_text(el), re.I)
            if m:
                brand = eb_brand(m.group(1)) or clean(m.group(1)).title()
                break
    rows = []
    for dl in p.soup.select('.product-features dl.data-sheet, #product-details dl.data-sheet'):
        dts = dl.find_all('dt')
        for dt in dts:
            dd = dt.find_next_sibling('dd')
            if dd:
                rows.append((text(dt), text(dd)))
    marque = [v for l, v in rows if re.fullmatch(r'marque', l, re.I)]
    if not brand and marque:
        brand = eb_brand(marque[0]) or marque[0].title()
    if not brand:
        brand = eb_brand(name)
        notes.append('brand from the product name')
    specs = [{'group': 'Fiche technique', 'label': l, 'value': v} for l, v in rows if keep_row(l, v)]
    if not specs:
        notes.append('no Fiche technique')
        for tb in p.soup.select('#description table'):
            for tr in tb.select('tr'):
                tds = tr.find_all(['td', 'th'])
                if len(tds) == 2 and keep_row(text(tds[0]), text(tds[1])):
                    specs.append({'group': 'Description', 'label': text(tds[0]).rstrip(' :'), 'value': text(tds[1])})
    ids = []
    root = p.soup.select_one('.images-container') or p.soup.select_one('.product-cover')
    scope = root.parent if root is not None and root.name and 'product-cover' in ' '.join(root.get('class', [])) else root
    for im in (scope or p.soup).select('img'):
        u = im.get('src') or im.get('data-src') or im.get('data-image-large-src') or ''
        m = re.search(r'/(\d+)-[a-z0-9_]+_default/([^/?]+)', u)
        if m and m.group(1) not in [i[0] for i in ids]:
            ids.append((m.group(1), m.group(2)))
    pics = [f'https://electrobousfiha.com/{i}-large_default/{f}' for i, f in ids]
    return {'name': name, 'brand': brand, 'model': model, 'pictures': pics, 'specs': specs, 'notes': notes}



# ------------------------------------------------------------------ Samsung (n_africa AEM site)
def samsung(p):
    notes = []
    name = p.h1()
    model = ''
    for el in p.soup.select('[class*="sku"]'):
        t = clean(re.sub(r'^(code (du )?mod[eè]le|mod[eè]le|model|sku|code)\s*[:.]?\s*', '', text(el), flags=re.I))
        if looks_like_model(t):
            model = t
            break
    if not model:
        seg = urlparse(p.url).path.rstrip('/').rsplit('/', 1)[-1].split('-')
        if len(seg) >= 2:
            model = (seg[-2] + '/' + seg[-1]).upper()
        notes.append('model from the address')
    pics = []
    for im in p.soup.select('.hdd02-gallery__item .hdd02-gallery__image img, .hdd02-gallery__item img'):
        li = im.find_parent('li')
        if li is not None and 'swiper-slide-duplicate' in ' '.join(li.get('class', [])):
            continue
        u = im.get('src') or im.get('data-src') or ''
        if '/gallery/' in u:
            pics.append(p.abs(u.split('?')[0]))
    pics = uniq(pics)
    specs = []
    for it in p.soup.select('#specs .pdd32-product-spec__item'):
        g = text(it.select_one('.pdd32-product-spec__title'))
        for row in it.select('.pdd32-product-spec__content-item'):
            l = text(row.select_one('.pdd32-product-spec__content-item-title'))
            v = text(row.select_one('.pdd32-product-spec__content-item-desc'))
            if keep_row(l, v):
                specs.append({'group': g, 'label': l, 'value': v})
    if not specs:
        notes.append('no #specs rows')
    return {'name': name, 'brand': 'Samsung', 'model': model, 'pictures': pics, 'specs': specs, 'notes': notes}



# ------------------------------------------------------------------ LG (lg.com/ma AEM; full list = "Toutes les caractéristiques")
def lg(p):
    notes = []
    name = p.h1()
    ld = p.product_ld()
    model = clean(ld.get('mpn') or '')
    if not looks_like_model(model):
        model = urlparse(p.url).path.rstrip('/').rsplit('/', 1)[-1].upper()
        notes.append('model from the address')
    pics = []
    # the product's own gallery lives in div.c-gallery (other carousels on the page show other products).
    # Its zoom swiper lists the slides in order without loop clones; the display carousel has a clone first.
    def gal(sel):
        out = []
        for im in p.soup.select(sel):
            if im.find_parent(class_=re.compile(r'lg-pick|c-product-item|neo-card')) is not None:
                continue
            slide = im.find_parent(class_=re.compile('swiper-slide'))
            if slide is not None and 'swiper-slide-duplicate' in ' '.join(slide.get('class', [])):
                continue
            u = im.get('src') or im.get('data-src') or ''
            if '/gallery' in u:
                out.append(p.abs(re.sub(r'/jcr:content/renditions/.*$', '', u.split('?')[0])))
        return uniq(out)
    pics = gal('[class*="c-gallery__display-swiper"] li img') or gal('.c-gallery [class*="c-gallery__item--display"] img')
    if not pics:
        notes.append('no gallery found')
    pics = [u for u in uniq(pics) if not re.search(r'MDI_|/spec/|energy', u, re.I)]
    # LG loop carousels put a clone first: the real order is 01, 02 ... (file names say it)
    specs = []
    groups = [g for g in p.soup.select('.c-compare-selling__group') if re.search(r'toutes les caract', text(g.select_one('.c-compare-selling__group-head')), re.I)]
    tables = [t for g in groups for t in g.select('.c-compare-selling__table')] or p.soup.select('.c-compare-selling__table')
    for tb in tables:
        g = text(tb.select_one('.c-compare-selling__table-head'))
        for it in tb.select('.c-compare-selling__item'):
            l = text(it.select_one('.c-compare-selling__spec-name'))
            v = text(it.select_one('.c-compare-selling__spec-desc'))
            if keep_row(l, v):
                specs.append({'group': g, 'label': l, 'value': v})
    if not specs:
        notes.append('no full spec list in the page')
    return {'name': name, 'brand': 'LG', 'model': model, 'pictures': pics, 'specs': specs, 'notes': notes}


SITES = {
    'lg': lg,
    'samsung': samsung,
    'tcl': tcl,
    'bosch': bosch,
    'electrobousfiha': electrobousfiha,
    'candy': lambda p: candy_haier(p, 'Candy'),
    'haier': lambda p: candy_haier(p, 'Haier'),
}
