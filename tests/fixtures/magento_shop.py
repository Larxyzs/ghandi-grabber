"""Fake electroplanet.ma (Magento 2) for tests, built from the REAL page structure seen on the site (Nov 2026):
- product page: h1.page-title > a.manufacturer (brand) + span.ref (short name) + a.category-name + span (shop number)
- gallery: <script type="text/x-magento-init"> {"[data-gallery-role=gallery-placeholder]": {"mage/gallery/gallery": {"data": [...]}}}
  with cache-size "img"/"full" addresses (big original = without /cache/<32 hex>/), plus a video entry sometimes
- specs: div.additional-attributes-wrapper > div.attr-group > span (title) + table th/td; first group often untitled;
  "Autre Caractéristique" holds Marque / Code produit / Code / Reference fournisseur; some values empty, some Y/N
- related products (".block.related .product-item") and an Insider widget with pictures of OTHER products
- category pages: .products-grid .product-item (40 per page), "N articles", ?p=2 + <link rel="next">, "En savoir plus" link
The REF / brand / "Code produit" values below are real examples copied from electroplanet.ma; the spec rows are invented.
"""
import json, html, re

H = 'https://www.electroplanet.ma'
MEDIA = 'https://prod2-media.electroplanet.ma/media/catalog/product'
CACHE_BIG = 'cache/4ba182f8830f3062d1daaf27de459955'
CACHE_SMALL = 'cache/521119050236537f9f74812c7d39556c'


def esc(s):
    return html.escape(s, quote=True)


# (ref as shown, brand link text, Marque row, Code produit row, expected brand, expected model, category name, category key, pictures, video?)
P = [
    ('COMB GR-B499NQLM 333L SILVER NF LG', 'LG', 'LG', '', 'LG', 'GR-B499NQLM', 'Réfrigérateur avec congélateur en bas', 'bas', 3, False),
    ('REF WTMF700460XNA 406L DNF A INOX WHP', 'WHIRLPOOL', 'WHIRLPOOL', 'WTMF 700460 XNA', 'Whirlpool', 'WTMF 700460 XNA', 'Réfrigérateur avec congélateur en haut', 'haut', 7, False),
    ('REF ELXRFG751 245L NF SLV ELEXIA', 'ELEXIA', 'ELEXIA', 'REF ELXRFG751 245L NF SLV ELEXIA', 'Elexia', 'ELXRFG751', 'Réfrigérateur avec congélateur en haut', 'haut', 6, False),
    ('REF RT455 NF XI/NFDXI A++SLV SIERA', 'SIERA', 'SIERA', 'REF RT455 NF XI/NFDXI A++SLV SIERA', 'Siera', 'RT455', 'Réfrigérateur avec congélateur en haut', 'haut', 3, False),
    ('SBS RS70F65Q1TMA 651L A SAMSUNG', 'SAMSUNG', 'SAMSUNG', 'RS70F65Q1TMA', 'Samsung', 'RS70F65Q1TMA', 'Réfrigérateur américain side by side', 'sbs', 8, True),
    ('SBS SERIE 4 KAN93VL30N 178,3*90,8 INOX BOSCH', 'BOSCH', 'BOSCH', 'KAN93VL30N', 'Bosch', 'KAN93VL30N', 'Réfrigérateur américain side by side', 'sbs', 6, False),
    ('SBS QUATRO RQ758N4SAI1 560L NF INOX HISENSE', 'HISENSE', 'HISENSE', 'REFRIG QUATRO RQ758N4SAI1 560L', 'Hisense', 'RQ758N4SAI1', 'Réfrigérateur américain side by side', 'sbs', 11, False),
    ('CONG VERT KRD-204WYED 153L 7T BLC KELON', 'KELON', 'KELON', 'CONG VERT KRD-204WYED 153L 7T', 'Kelon', 'KRD-204WYED', 'Congélateur armoire', 'armoire', 2, False),
    ('CONG VER WTZ 551101 SNA STAT 9', 'WHIRLPOOL', 'WHIRLPOOL', 'WTZ 551101 SNA', 'Whirlpool', 'WTZ 551101 SNA', 'Congélateur armoire', 'armoire', 3, False),
    ('CONG HORIZ B14WMS 140L A+ SLV OCEAN', 'OCEAN', 'OCEAN', 'CONG HORIZ B14WMS 140L A+ SLV', 'Ocean', 'B14WMS', 'Congélateur coffre', 'coffre', 1, False),
    ('CONG COFFRE FC-26DT4SAT 260L BLC HISENSE', 'HISENSE', 'HISENSE', 'FC26DT4SAT', 'Hisense', 'FC26DT4SAT', 'Congélateur coffre', 'coffre', 1, False),
    ('MAL 10KG ELX-AWMF-1003 ELEXIA', 'ELEXIA', 'ELEXIA', 'MAL 10KG ELX-AWMF-1003 ELEXIA', 'Elexia', 'ELX-AWMF-1003', 'Machine à laver à hublot', 'hublot', 6, False),
    ('MAL B1W73235WMA 7KG 1200T BLC BEKO', 'BEKO', 'BEKO', 'B1W73235WMA', 'Beko', 'B1W73235WMA', 'Machine à laver à hublot', 'hublot', 4, False),
    ('L.S WD3S1043BT4 10,5/6 1400T T.GREY HISENSE', 'HISENSE', 'HISENSE', 'L.S WD3S1043BT4 10,5/6 1400T', 'Hisense', 'WD3S1043BT4', 'Machine à laver séchante', 'sechante', 3, False),
    ('MAL TOP WTJA802T 8KG 800T T.GREY HISENSE', 'HISENSE', 'HISENSE', 'MAL TOP WTJA802T 8KG', 'Hisense', 'WTJA802T', 'Machine à laver ouverture en haut', 'top', 3, False),
    ('CLIM PORTABLE AP096CM1W 9K BTU ARTHUR MARTIN', 'ARTHUR MARTIN', 'ARTHUR MARTIN', 'AP096CM1W', 'Arthur Martin', 'AP096CM1W', 'Climatiseur', 'clim', 1, False),
    ('CLIM 9000BTU DUALCOOL PRO DA10A0H0.SW0 LG', 'LG', 'LG', 'CLIM 9000BTU DUALCOOL PRO DA10A0H0.SW0', 'LG', 'DA10A0H0.SW0', 'Climatiseur', 'clim', 2, False),
    ('LED UA55U8000HUXMV SAMSUNG', 'SAMSUNG', 'SAMSUNG', 'UA55U8000HUXMV', 'Samsung', 'UA55U8000HUXMV', 'Téléviseur', 'tv', 4, True),
    ('QNED 65QNED8MB6T LG', 'LG', 'LG', '65QNED8MB6T', 'LG', '65QNED8MB6T', 'Téléviseur', 'tv', 2, False),
    ('MINI BAR ELXMBF552 90L SLV ELEXIA', 'ELEXIA', 'ELEXIA', 'MINI BAR ELXMBF552 90L', 'Elexia', 'ELXMBF552', 'Mini bar', 'minibar', 1, False),
    ('SL DH7S107BB 10KG POMPE A CHALEUR HISENSE', 'HISENSE', 'HISENSE', 'DH7S107BB', 'Hisense', 'DH7S107BB', 'Sèche-linge à condensation', 'sl', 16, False),
    ('LAVE VAISSELLE ENCASTRABLE FDW 614 E5P E', 'LAV', 'FRANKE', 'E5P', 'Franke', 'FDW 614', 'Lave-vaisselle encastrable', 'lvenc', 2, False),
    ('LV BDFN38640XC-8 PRG SETTINGS BEKO', 'BEKO', 'BEKO', 'BDFN38640XC', 'Beko', 'BDFN38640XC', 'Lave-vaisselle pose libre', 'lv', 15, False),
    ('CUIS IX FCK 965 TC GMG T414 XS FRANKE', 'FRANKE', 'FRANKE', 'CUIS IX FCK 965 TC GMG T414 XS', 'Franke', 'FCK 965', 'Cuisinière 5 feux', 'cuis', 1, False),
    ('PLAQUE CUIS HIAG 64223 B 4F 60CM BEKO', 'BEKO', 'BEKO', 'PLAQUE CUIS HIAG 64223 B', 'Beko', 'HIAG 64223 B', 'Plaque de cuisson à gaz', 'plaque', 1, False),
    ('PLAQUE DOMINO VITROCERAMIQUE AKT 360/IX WHIRLPOOL', 'WHIRLPOOL', 'WHIRLPOOL', 'AKT 360/IX', 'Whirlpool', 'AKT 360/IX', 'Plaque de cuisson électrique', 'plaqueel', 4, False),
    ('HOTTE FPJ 915 V BK/DG A FRANKE', 'FRANKE', 'FRANKE', 'HOTTE FPJ 915 V BK/DG A', 'Franke', 'FPJ 915 V', 'Hotte décorative murale', 'hotte', 4, False),
    ('FOUR SERIE 4 HUA736ER0 60CM INOX BOSCH', 'BOSCH', 'BOSCH', 'HUA736ER0', 'Bosch', 'HUA736ER0', 'Four encastrable', 'four', 6, False),
    ('MO GRILL ENC CA38FL7NWBX 20L 5P INOX CANDY', 'CANDY', 'CANDY', 'CA38FL7NWBX', 'Candy', 'CA38FL7NWBX', 'Micro-onde', 'mo', 4, False),
    ('BARRE DE SON HW-B400F/MV 2.0 SAMSUNG', 'SAMSUNG', 'SAMSUNG', 'HW-B400F/MV', 'Samsung', 'HW-B400F/MV', 'Barre de son', 'son', 11, False),
    ('CHAUFFE EAU INSTANTANE MLRC 7,0KW MEGA LIFE', 'MEGA LIFE', 'MEGA LIFE', 'ML-RC-7KW-220V', 'Mega Life', 'ML-RC-7KW-220V', 'Chauffe-eau électrique', 'ce', 4, False),
    ('VENTILATEUR PIED ELX-TSF-951 ELEXIA', 'ELEXIA', 'ELEXIA', 'VENTILATEUR PIED ELX-TSF-951', 'Elexia', 'ELX-TSF-951', 'Ventilateur', 'vent', 5, False),
]

CATS = {
    'fridges': ('/gros-electromenager/refrigerateur', 'Réfrigérateur', {'bas', 'haut', 'sbs', 'minibar'}),
    'others': ('/gros-electromenager/autres', 'Électroménager', None),
}


def slug(s):
    import unicodedata
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


products = []
for i, (ref, linkbrand, marque, code, brand, model, catname, ck, npics, video) in enumerate(P):
    num = 3124345 + i * 977
    path = f'/p{num}-{slug(ref)}.html' if i != 5 else f'/p{num}.html'  # one product with a bare address, like the real site
    files = [f'{str(num)[0]}/{str(num)[1]}/{num}-cb-{65552 + k}_1.png' for k in range(npics)]
    rows = [
        ('', [('Type', catname), ('Niveau sonore', f'{35 + i} dB'), ('VOLUME UTILE', '')]),
        ('Autre Caractéristique', [('Marque', marque), ('Code produit', code), ('Code', str(num)), ('Reference fournisseur', ref)]),
        ('Design', [('Couleur du produit', 'Argent'), ('Placement de l\'appareil', 'Pose libre'), ('Éclairage LED', 'Y')]),
        ('Poids Et Dimensions', [('Largeur', '595 mm'), ('Profondeur', '674 mm'), ('Hauteur', f'{1800 + i} mm'), ('Poids', '66 kg')]),
        ('Puissance', [('Classe d\'efficacité énergétique', 'A++')]),
    ]
    products.append(dict(i=i, num=num, path=path, ref=ref, linkbrand=linkbrand, brand=brand, model=model, catname=catname, ck=ck,
                         files=files, video=video, groups=rows))


def big(f):
    return f'{MEDIA}/{CACHE_BIG}/{f}'


def small(f):
    return f'{MEDIA}/{CACHE_SMALL}/{f}'


def original(f):
    return f'{MEDIA}/{f}'


def card(p):
    return f'''<li class="item product product-item"><div class="product-item-info"><div class="item-inner"><div class="box-image">
<a href="{H}{p['path']}" class="product photo product-item-photo"><span class="product-image-container"><span class="product-image-wrapper">
<img class="product-image-photo" src="{small(p['files'][0])}" alt="{esc(p['ref'])}" width="270" height="270"></span></span></a></div>
<div class="product details product-item-details box-info"><div class="product name product-item-name product-name">
<a class="product-item-link" href="{H}{p['path']}"><span class="brand">{esc(p['linkbrand'])}</span><span class="ref">{esc(p['ref'][:28])}...</span></a></div>
<div class="price-box price-final_price"><span class="price">4 999 DH</span></div></div></div></div></li>'''


def header():
    return f'''<header class="page-header"><a class="logo" href="{H}/"><img src="{H}/static/logo.svg" alt="Electroplanet"></a>
<nav class="navigation"><ul><li><a href="{H}/gros-electromenager/refrigerateur">Réfrigérateur</a></li><li><a href="{H}/depliant/depliant-electroplanet.html">Dépliant</a></li></ul></nav></header>'''


def footer():
    return f'<footer class="page-footer"><a href="{H}/marques/lg">LG</a><a href="{H}/magasins/marina">Magasins</a></footer>'


def gallery_json(p):
    data = [{'thumb': small(f), 'img': big(f), 'full': big(f), 'caption': p['ref'], 'position': str(k + 1), 'isMain': k == 0,
             'type': 'image', 'videoUrl': None} for k, f in enumerate(p['files'])]
    if p['video']:  # a video in the middle, like some real pages
        data.insert(1, {'thumb': small(p['files'][0]), 'img': big(p['files'][0]).replace('.png', '-video.png'), 'full': None, 'position': '2',
                        'isMain': False, 'type': 'video', 'videoUrl': 'https://www.youtube.com/watch?v=abc'})
    data = list(reversed(data))  # the order in the file is not the slideshow order: position/isMain decide
    return json.dumps({'[data-gallery-role=gallery-placeholder]': {'mage/gallery/gallery': {'mixins': ['magnifier/magnify'], 'magnifierOpts': {}, 'data': data,
                       'options': {'nav': 'thumbs', 'loop': True}}}})


def specs_html(p):
    out = ['<div class="additional-attributes-container">']
    for title, rows in p['groups']:
        trs = ''.join(f'<tr id="{slug(a)}"><th class="col label" scope="row">{esc(a)}</th><td class="col data">{esc(b)}</td></tr>' for a, b in rows)
        out.append(f'<div class="additional-attributes-wrapper"><div class="attr-group"><span>{esc(title)}</span></div>'
                   f'<table class="data table additional-attributes" id="product-attribute-specs-table"><caption class="table-caption">Plus d’information</caption><tbody>{trs}</tbody></table></div>')
    out.append('</div>')
    return ''.join(out)


def product_page(p):
    related = [o for o in products if o['ck'] == p['ck'] and o['i'] != p['i']][:4] or products[:3]
    insider = f'<div class="ins-preview-wrapper"><a class="ins-element-link" href="{H}{products[0]["path"]}"><img src="{small(products[0]["files"][0])}" width="120"></a></div>'
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>{esc(p['catname'])} {esc(p['ref'])} | Electroplanet | Electroplanet</title>
<script type="application/ld+json">{{"@context":"https://schema.org","@type":"WebSite","name":"ELECTROPLANET"}}</script></head>
<body class="catalog-product-view">{header()}<main id="maincontent"><div class="columns"><div class="column main"><div class="product-page-wrapper">
<div class="product media">{insider}<div class="gallery-placeholder" data-gallery-role="gallery-placeholder">
<img alt="main product photo" class="gallery-placeholder__image" src="{big(p['files'][0])}" width="800" height="800"></div>
<script type="text/x-magento-init">{gallery_json(p)}</script></div>
<div class="product-info-main"><div class="detail-product-info"><div class="product-title-top"><div class="brand-container">
<a class="manufacturer" title="Produits de la marque {esc(p['linkbrand'])}" href="{H}/marques/{slug(p['linkbrand'])}"><span class="brand-logo"></span></a></div></div>
<div class="page-title-wrapper"><h1 class="page-title"><span class="base"><a class="manufacturer" href="{H}/marques/{slug(p['linkbrand'])}">{esc(p['linkbrand'])}</a>
<span class="ref">{esc(p['ref'])}</span><a class="category-name" href="{H}/x" style="display:none">{esc(p['catname'])}</a><span style="display:none">{p['num']}</span></span></h1></div>
<div class="product-info-price"><div class="price-box price-final_price"><span class="old-price"><span class="price">6 599 DH</span></span><span class="special-price"><span class="price">5 999 DH</span></span></div></div>
<div class="shipping-label"><span class="label">Livraison à domicile</span><span class="free-label">Gratuite</span></div></div></div>
<div class="detail-bottom-wrapper"><div class="product info detailed"><div class="product data items">
<div class="data item title active" id="tab-label-additional"><a class="data switch">Caractéristiques</a></div>
<div class="data item content" id="additional"><div class="attributes-container">{specs_html(p)}</div><div class="show-more"><span class="show-more-btn">Afficher plus</span></div></div>
<div class="data item title"><a class="data switch">La marque vous parle</a></div><div class="data item content"><div id="flixmedia-inpage"></div></div></div></div></div>
<div class="block related"><strong class="block-title">Produits similaires</strong><ol class="products list items product-items">{''.join(card(o) for o in related)}</ol></div>
</div></div></div></main>{footer()}</body></html>'''


def list_page(cat, page):
    base, title, keys = CATS[cat]
    items = [p for p in products if (p['ck'] in keys if keys else True)]
    if cat == 'others':
        items = [p for p in products if p['ck'] not in CATS['fridges'][2]]
    per = 10
    pages = (len(items) + per - 1) // per
    chunk = items[(page - 1) * per: page * per]
    nxt = f'{H}{base}?p={page + 1}' if page < pages else ''
    head_next = f'<link rel="next" href="{nxt}">' if nxt else ''
    nav = ''.join(f'<li class="item"><a class="page" href="{H}{base}?p={k}"><span class="label">Page</span><span>{k}</span></a></li>' for k in range(1, pages + 1) if k != page)
    if nxt:
        nav += f'<li class="item pages-item-next"><a class="action  next" href="{nxt}" title="Suivant"><span class="label">Page</span><span>Suivant</span></a></li>'
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>{title} | Electroplanet</title>{head_next}</head><body class="catalog-category-view">{header()}
<main id="maincontent"><h1 class="page-title"><span class="base">{title}</span></h1><div class="toolbar toolbar-products"><p class="toolbar-amount"><span class="toolbar-number">{len(items)}</span> articles</p></div>
<div class="products wrapper grid products-grid"><ol class="products list items product-items row">{''.join(card(p) for p in chunk)}</ol></div>
<a class="action" href="{H}/conseils/bien-choisir">En savoir plus</a>
<div class="pages"><ul class="items pages-items">{nav}</ul></div></main>{footer()}</body></html>'''


def route(path, query):
    for p in products:
        if path == p['path']:
            return product_page(p)
    for cat, (base, _, _) in CATS.items():
        if path == base:
            pg = int(dict(x.split('=') for x in query.split('&') if '=' in x).get('p', '1'))
            return list_page(cat, pg)
    return None
