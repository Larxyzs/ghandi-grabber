"""Fake electrobousfiha.com (PrestaShop 1.7 'classic'-like markup, megnor theme bits) for tests."""
import json, html, random
random.seed(7)
H='https://electrobousfiha.com'
def esc(s): return html.escape(s, quote=True)

# (name, brand_expected, brand_where, spec_style, nimg, reference, category)
# brand_where: logo | link | jsonld | marque | name | none
# spec_style: dl | table | lines | ul | dl+marque | none
P=[
 ("REFRIGERATEUR LG 2 PORTES 395L NET INOX","LG","logo","dl",5,"GN-B392PLGB","fr"),
 ("REFRIGERATEUR SAMSUNG 2 PORTES 528 L NO-FROST GRIS","Samsung","name","dl",4,"RT53K6340UT","fr"),
 ("REFRIGERATEUR SAMSUNG SIDE BY SIDE 4 PORTES INOX","Samsung","logo","table",6,"","fr"),
 ("REFRIGERATEUR BOSCH COMBINE 70CM INOX","Bosch","link","dl",3,"KGN56XIDP","fr"),
 ("REFIGERATEUR MIDEA TABLE TOP 93L BLANC","Midea","name","lines",2,"","fr"),
 ("REFRIGERATEUR MIDEA 4 PORTES (FRENCH DOOR) 632L INOX","Midea","jsonld","dl",4,"","fr"),
 ("REFRIGERATEUR ARTHUR MARTIN COMBINE TOTAL NO FROST 188*60, AFFICHEUR INOX","Arthur Martin","name","dl",5,"ANT5MF32U0","fr"),
 ("REFRIGERATEUR WHIRLPOOL COMBINE 335L INOX","Whirlpool","marque","dl+marque",4,"","fr"),
 ("REFRIGERATEUR HAIER MULTI PORTES 466L","Haier","logo","ul",3,"HTF-520IP7","fr"),
 ("REFRIGERATEUR BEKO 2 PORTES 470L INOX","Beko","name","table",4,"","fr"),
 ("REFRIGERATEUR CANDY 1 PORTE 250L BLANC","Candy","logo","dl",1,"","fr"),
 ("REFRIGERATEUR HISENSE COMBINE 360L SILVER","Hisense","link","lines",3,"RB440N4BCE","fr"),
 ("REFRIGERATEUR TCL 2 PORTES 280L","TCL","name","dl",3,"P280TMN","fr"),
 ("REFRIGERATEUR AEG COMBINE 360L INOX","AEG","logo","dl",4,"","fr"),
 ("REFRIGERATEUR ZANUSSI 2 PORTES 312L","Zanussi","jsonld","table",3,"","fr"),
 ("REFRIGERATEUR CONDOR 2 PORTES 400L","Condor","name","ul",2,"","fr"),
 ("REFRIGERATEUR FROSTLINE 2 PORTES 210L","Frostline","link","dl",2,"","fr"),
 ("CONGELATEUR SIERA COFFRE 300L","Siera","name","dl",2,"","fr"),
 ("CONGELATEUR OCEAN VERTICAL 7 TIROIRS","Ocean","logo","lines",3,"","fr"),
 ("REFRIGERATEUR SAMSUNG BESPOKE COMBINE 344L","Samsung","logo","dl",6,"RB34A7B5D39","fr"),
 ("REFRIGERATEUR LG SIDE BY SIDE 601L INSTAVIEW","LG","name","dl",5,"GC-X257CSES","fr"),
 ("MINI BAR KIWI 50L","Kiwi","name","none",1,"","fr"),
 ("REFRIGERATEUR DE DIETRICH COMBINE 335L","De Dietrich","marque","dl+marque",3,"","fr"),
 ("MACHINE A LAVER CANDY 9KG 1200T SILVER","Candy","name","dl",4,"","ml"),
 ("MACHINE A LAVER LG 10.5KG AI DD VAPEUR","LG","logo","table",5,"F4V5RYP0W","ml"),
 ("MACHINE A LAVER BOSCH SERIE 6 9KG","Bosch","link","dl",4,"WGG24409FF","ml"),
 ("MACHINE A LAVER SAMSUNG ECOBUBBLE 8KG","Samsung","jsonld","lines",3,"","ml"),
 ("MACHINE A LAVER WHIRLPOOL 7KG FRESHCARE","Whirlpool","name","ul",3,"","ml"),
 ("LAVANTE SECHANTE HAIER 10/6KG","Haier","logo","dl",4,"HWD100-B14979","ml"),
 ("MACHINE A LAVER INDESIT 7KG TOP","Indesit","marque","dl+marque",2,"","ml"),
]
CATS={'fr':('/137-refrigerateur-','REFRIGERATEUR'),'ml':('/319-machine-a-laver-automatique-','Machine A Laver Automatique')}
BRAND_ID={}
def slug(s):
    import re,unicodedata
    s=unicodedata.normalize('NFD',s).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',s).strip('-')
products=[]
img_id=10000
for i,(name,brand,where,spec,nimg,ref,cat) in enumerate(P):
    pid=5000+i*37
    catslug=CATS[cat][0].split('-',1)[1].strip('-') if i%3 else 'accueil'
    url=f'/{catslug}/{pid}-{slug(name)}.html'
    imgs=[]
    for k in range(nimg):
        img_id+=1; imgs.append(img_id)
    bid=BRAND_ID.setdefault(brand,len(BRAND_ID)+2)
    rows=[('Capacité totale',f'{300+i} L'),('Classe énergétique','A+'),('Couleur','Inox'),('Dimensions (HxLxP)',f'{180+i} x 60 x 65 cm'),('Garantie','1 an')]
    products.append(dict(i=i,pid=pid,name=name,brand=brand,where=where,spec=spec,imgs=imgs,ref=ref,cat=cat,url=url,bid=bid,rows=rows))

def img_url(iid,size,name): return f'{H}/{iid}-{size}_default/{slug(name)}.jpg'
def miniature(p,where_cls='product-miniature js-product-miniature'):
    return f'''<article class="{where_cls}" data-id-product="{p['pid']}"><div class="thumbnail-container">
<a href="{H}{p['url']}" class="thumbnail product-thumbnail"><img src="{img_url(p['imgs'][0],'home',p['name'])}" alt="{esc(p['name'])}" width="250" height="250"></a>
<div class="product-description"><h3 class="h3 product-title"><a href="{H}{p['url']}">{esc(p['name'])}</a></h3>
<div class="product-manufacturer"><a href="{H}/brand/{p['bid']}-{slug(p['brand'])}">{esc(p['brand'])}</a></div>
<div class="product-price-and-shipping"><span class="price">4 999,00 DH</span></div></div></div></article>'''

def header():
    menu=''.join(f'<li><a href="{H}{c[0]}">{c[1]}</a></li>' for c in CATS.values())
    feat=miniature(products[(7)])  # a product in the mega menu
    return f'''<header id="header"><div class="header-top"><a href="{H}/"><img class="logo" src="{H}/img/logo.png" alt="Electrobousfiha"></a>
<form action="{H}/recherche"><input name="s"></form><ul class="top-menu">{menu}</ul><div class="megamenu-featured">{feat}</div></div></header>'''
def footer():
    logos=''.join(f'<a href="{H}/brand/{bid}-{slug(b)}"><img src="{H}/img/m/{bid}.jpg" alt="{esc(b)}"></a>' for b,bid in BRAND_ID.items())
    return f'''<footer id="footer"><div class="brands-slider">{logos}</div><p>© 2026 - Electrobousfiha. All Rights Reserved.</p></footer>'''
def left_column(exclude):
    best=[p for p in products if p['pid']!=exclude][:3]
    return '<div id="left-column"><section class="best-sellers"><h4>Meilleures ventes</h4>'+''.join(miniature(p) for p in best)+'</section></div>'

def spec_html(p):
    rows=p['rows']
    if p['spec']=='dl' or p['spec']=='dl+marque':
        extra=[('Marque',p['brand'].upper())] if p['spec']=='dl+marque' else []
        dl=''.join(f'<dt class="name">{esc(a)}</dt><dd class="value">{esc(b)}</dd>' for a,b in extra+rows)
        return '', f'<section class="product-features"><p class="h6">Fiche technique</p><dl class="data-sheet">{dl}</dl></section>'
    if p['spec']=='table':
        tr=''.join(f'<tr><td>{esc(a)}</td><td>{esc(b)}</td></tr>' for a,b in rows)
        return f'<p>Un appareil fiable et économique.</p><table class="table"><tbody>{tr}</tbody></table>', ''
    if p['spec']=='lines':
        return '<p><strong>Points forts :</strong></p><p>'+'<br>'.join(f'{esc(a)} : {esc(b)}' for a,b in rows)+'</p>', ''
    if p['spec']=='ul':
        return '<p>Caractéristiques :</p><ul>'+''.join(f'<li>{esc(a)} : {esc(b)}</li>' for a,b in rows)+'</ul>', ''
    return '<p>Un petit appareil pratique pour votre chambre.</p>', ''

def product_page(p):
    imgs=p['imgs']
    cover=f'<div class="product-cover"><img class="js-qv-product-cover" src="{img_url(imgs[0],"large",p["name"])}" alt="{esc(p["name"])}" width="800" height="800"><div class="layer"></div></div>'
    thumbs='<div class="js-qv-mask mask"><ul class="product-images js-qv-product-images">'+''.join(
        f'<li class="thumb-container"><img class="thumb js-thumb" data-image-medium-src="{img_url(k,"medium",p["name"])}" data-image-large-src="{img_url(k,"large",p["name"])}" src="{img_url(k,"home",p["name"])}" width="100" height="100"></li>' for k in imgs)+'</ul></div>'
    manu=''
    if p['where']=='logo':
        manu=f'<div class="product-manufacturer"><a href="{H}/brand/{p["bid"]}-{slug(p["brand"])}"><img src="{H}/img/m/{p["bid"]}.jpg" class="img img-thumbnail manufacturer-logo" alt="{esc(p["brand"])}"></a></div>'
    elif p['where']=='link':
        manu=f'<div class="product-manufacturer"><label class="label">Marque</label><span><a href="{H}/brand/{p["bid"]}-{slug(p["brand"])}">{esc(p["brand"].upper())}</a></span></div>'
    ld=''
    if p['where']=='jsonld':
        ld='<script type="application/ld+json">'+json.dumps({"@context":"https://schema.org","@type":"Product","name":p['name'],"brand":{"@type":"Brand","name":p['brand'].upper()}})+'</script>'
    ref=f'<div class="product-reference"><label class="label">Référence </label><span itemprop="sku">{esc(p["ref"])}</span></div>' if p['ref'] else ''
    desc,features=spec_html(p)
    related='<section class="featured-products clearfix"><h2>16 autres produits dans la même catégorie :</h2><div class="products">'+''.join(miniature(o) for o in products if o['cat']==p['cat'] and o['pid']!=p['pid'])[:20000]+'</div></section>'
    modal=f'<div class="modal fade js-product-images-modal" id="product-modal"><div class="modal-body"><figure><img class="js-modal-product-cover product-cover-modal" src="{img_url(imgs[0],"large",p["name"])}" width="800"></figure><ul class="product-images js-modal-product-images">'+''.join(f'<li class="thumb-container"><img data-image-large-src="{img_url(k,"large",p["name"])}" class="thumb js-modal-thumb" src="{img_url(k,"medium",p["name"])}" width="200"></li>' for k in imgs)+'</ul></div></div>'
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>{esc(p["name"])}</title>{ld}</head><body id="product">
{header()}<section id="wrapper"><div class="container"><nav class="breadcrumb"><ol><li><a href="{H}/">Accueil</a></li><li><a href="{H}{CATS[p['cat']][0]}">{CATS[p['cat']][1]}</a></li></ol></nav>
<div class="row">{left_column(p['pid'])}<div id="content-wrapper"><section id="main"><div class="row product-container">
<div class="col-md-6"><section class="page-content" id="content"><div class="images-container">{cover}{thumbs}</div></section></div>
<div class="col-md-6"><h1 class="h1 productpage_title">{esc(p["name"])}</h1>{manu if p['where']=='logo' else ''}
<div class="product-prices"><div class="product-price h5"><div class="current-price"><span class="price" content="4999">4 999,00 DH</span></div></div></div>
<div class="product-information"><div class="product-actions"><form><button class="btn btn-primary add-to-cart">Ajouter au panier</button></form></div></div></div></div>
<div class="tabs"><ul class="nav nav-tabs"><li class="nav-item"><a class="nav-link active" href="#description">Description</a></li><li class="nav-item"><a class="nav-link" href="#product-details">Détails du produit</a></li></ul>
<div class="tab-content" id="tab-content"><div class="tab-pane fade in active" id="description"><div class="product-description">{desc}</div></div>
<div class="tab-pane fade" id="product-details" style="display:none">{manu if p['where']=='link' else ''}{ref}<div class="product-quantities"><label class="label">En stock</label><span>12 Produits</span></div>{features}</div></div></div>
{related}{modal}</section></div></div></div></section>{footer()}</body></html>'''

def list_page(cat,page):
    items=[p for p in products if p['cat']==cat]
    per=12; chunk=items[(page-1)*per:page*per]; pages=(len(items)+per-1)//per
    nav=''
    if page<pages: nav=f'<li><a rel="next" href="{H}{CATS[cat][0]}?page={page+1}" class="next js-search-link">Suivant</a></li>'
    count=f'<div class="total-products"><p>Il y a {len(items)} produits.</p></div>'
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>{CATS[cat][1]}</title></head><body id="category">{header()}
<section id="wrapper"><div class="container"><div class="row">{left_column(-1)}<div id="content-wrapper"><section id="main"><h1 class="h1">{CATS[cat][1]}</h1>
<section id="products"><div id="js-product-list-top">{count}</div><div id="js-product-list"><div class="products row">{''.join(miniature(p) for p in chunk)}</div>
<nav class="pagination"><div>Affichage {(page-1)*per+1}-{(page-1)*per+len(chunk)} de {len(items)} article(s)</div><ul class="page-list">{nav}</ul></nav></div></section></section></div></div></div></section>{footer()}</body></html>'''

def route(path, query):
    for p in products:
        if path==p['url']: return product_page(p)
    for cat,(cp,_) in CATS.items():
        if path==cp:
            pg=int(dict(x.split('=') for x in query.split('&') if '=' in x).get('page','1'))
            return list_page(cat,pg)
    return None
