"""Model codes (scraper/core.js readModel + Samsung recipe), and prices stay off.
Run: python tests/test_model_codes.py
"""
import asyncio, re
from playwright.async_api import async_playwright
import os
EXT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files=['scraper/core.js']+re.findall(r"'(scraper/[^']+\.js)'",open(EXT+'/recipe-list.js').read())
JS='\n;\n'.join(open(EXT+'/'+f).read() for f in files)
U='https://www.samsung.com/n_africa/refrigerators/bottom-mount-freezer/rb34c600es9-340l-silver-rb34c600es9-ma/'
def sam(sku=True, attrs=True):
    g=''.join(f'<img src="https://images.samsung.com/is/image/samsung/p6pim/n_africa/rb34c600es9/gallery/n-africa-rb34-{i}.png?$1164_776_PNG$" width=400 height=300>' for i in range(4))
    rows=''.join(f'<li><span class="spec-name">Label {i}</span><span class="spec-value">Val {i}</span></li>' for i in range(14))
    reco='<div class="recommended"><button data-modelcode="RT42CG6420S9/MA">Ajouter</button></div>' if attrs else ''
    own='<button class="buy" data-modelcode="RB34C600ES9/MA">Acheter</button>' if attrs else ''
    return f'''<html><body><header>menu</header>{reco}<div class="pd-info"><h1>Réfrigérateur combiné 340L</h1><div class="price-current">6.399,00 DH</div><script type="application/ld+json">{{"@type":"Product","name":"x","offers":{{"price":"6399","priceCurrency":"MAD"}}}}</script>
    {'<div class="pd-info__sku"><span class="pd-info__sku-code">RB34C600ES9/MA</span></div>' if sku else ''}{own}</div>
    <div class="gallery">{g}</div><div id="specs"><h2>Caractéristiques</h2><ul class="specs-list">{rows}</ul></div></body></html>'''
def tcl():
    return '''<html><head><script type="application/ld+json">{"@type":"Product","name":"TCL C755","mpn":"55C755","image":["https://static-obg.tcl.com/a.png"]}</script></head>
    <body><h1>TCL 55C755 QD-Mini LED</h1><div class="gallery"><img src="https://static-obg.tcl.com/a.png" width=400 height=300></div><table class="specification"><tr><td>A</td><td>1</td></tr></table></body></html>'''
CASES=[('samsung sku on page',U,sam(True,True),'RB34C600ES9/MA'),
       ('samsung only data-modelcode (other product first)',U,sam(False,True),'RB34C600ES9/MA'),
       ('samsung nothing on page -> address',U,sam(False,False),'RB34C600ES9/MA'),
       ('samsung TV address no suffix','https://www.samsung.com/n_africa/tvs/qled-tv/q60d-55-inch-qled-4k-smart-tv-qa55q60dauxmv/',sam(False,False),'QA55Q60DAUXMV'),
       ('tcl json-ld mpn','https://www.tcl.com/ma/fr/tvs/c755',tcl(),'55C755'),
       ('json-ld internal code not trusted','https://www.tcl.com/ma/fr/tvs/c755',tcl().replace('55C755"','GR-B499NQLM.ASLQMEA"'),'')]
async def main():
    ok=True
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page()
        for name,url,html,want in CASES:
            await pg.unroute('**/*')
            def mk(h):
                async def r(route):
                    if route.request.resource_type=='document': await route.fulfill(status=200,content_type='text/html; charset=utf-8',body=h)
                    else: await route.fulfill(status=200,content_type='image/png',body=b'')
                return r
            await pg.route('**/*',mk(html))
            await pg.goto(url)
            await pg.add_script_tag(content=JS)
            r=await pg.evaluate('window.GHANDI.run({timeoutMs:6000})')
            good=r.get('model')==want; ok&=good
            print('PASS' if good else 'FAIL',name,'->',r.get('model'),'| price:',repr(r.get('price')),r.get('priceValue'),r['debug'].get('priceFrom'))
        await b.close()
    print('ALL PASS' if ok else 'SOME FAILED'); import sys; sys.exit(0 if ok else 1)
asyncio.run(main())
