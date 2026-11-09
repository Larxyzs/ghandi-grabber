"""List pages (scraper/links.js): hidden menus, cards hidden by a filter, "3 Résultats" box, rows grids, plain lists.
Run: python tests/test_list_pages.py   (needs: pip install playwright && playwright install chromium)
"""
import asyncio, json, re, sys
from playwright.async_api import async_playwright
import os
EXT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files=['scraper/core.js']+re.findall(r"'(scraper/recipes/[^']+)'",open(EXT+'/recipe-list.js').read())+['scraper/links.js']
JS='\n;\n'.join(open(EXT+'/'+f).read() for f in files)

def card(slug,title,hidden=False):
    return f'<div class="product-card" {"style=\"display:none\"" if hidden else ""}><a href="/ma/fr/tvs/{slug}"><img src="https://static-obg.tcl.com/{slug}.png" width=200 height=150><h3>{title}</h3></a></div>'
MENU=''.join(f'<li><a href="/ma/fr/tvs/{s}"><img src="https://static-obg.tcl.com/m{s}.png"><span>{s}</span></a></li>' for s in ['c7k','c6k','p8k','p7k'])
ALL=[('c7k','C7K'),('c755','C755'),('c6k','C6K'),('c745','C745'),('p8k','P8K'),('p635','P635'),('p7k','P7K')]
GAMING={'c755','c745','p635'}

def page(kind):
    head='<html><body><header><a href="/ma/fr">TCL</a><a href="/ma/fr/tvs">TV</a></header>'
    menu=f'<div class="mega-menu" style="display:none"><ul>{MENU}</ul></div>'
    hero='<div class="kv-banner"><a href="/ma/fr/tvs/x955"><img src="https://static-obg.tcl.com/kv.jpg" width=1200 height=300></a></div>'
    if kind=='tcl-hide':   # all cards in the HTML, the page script hides the others a bit later
        grid=''.join(card(s,t) for s,t in ALL)
        script='<script>setTimeout(()=>{document.querySelectorAll(".product-card").forEach(c=>{if(!/c755|c745|p635/.test(c.innerHTML))c.style.display="none"});document.getElementById("cnt").textContent="3 Résultats"},600)</script>'
        return head+menu+hero+'<div class="filters">Filtres <span id="cnt">7 Résultats</span></div><div class="grid">'+grid+'</div>'+script+'</body></html>'
    if kind=='tcl-visible-extras':  # extras visible: banner + "en vedette" strip outside the results grid
        feat='<div class="featured">'+''.join(card(s,t) for s,t in ALL if s not in GAMING)+'</div>'
        grid=''.join(card(s,t) for s,t in ALL if s in GAMING)
        return head+hero+'<div class="filters">Filtres | <span>3 Résultats</span></div><div class="grid">'+grid+'</div>'+feat+'</body></html>'
    if kind=='rows-24':  # "24 produits" text, grid built of rows of 4: must NOT be trimmed
        rows=''.join('<div class="row">'+''.join(card(f'm{r*4+i}',f'M{r*4+i}') for i in range(4))+'</div>' for r in range(6))
        return head+'<p>24 produits</p><div class="grid">'+rows+'</div><div class="featured">'+card('z1','Z1')+card('z2','Z2')+'</div></body></html>'
    if kind=='results-12-rows':  # "12 Résultats", rows of 3 + 2 extra links outside: keep the 12
        rows=''.join('<div class="row">'+''.join(card(f'm{r*3+i}',f'M{r*3+i}') for i in range(3))+'</div>' for r in range(4))
        return head+hero+'<p>12 Résultats</p><div class="grid">'+rows+'</div><div class="featured">'+card('z1','Z1')+card('z2','Z2')+'</div></body></html>'
    if kind=='plain':  # no count at all, 9 cards + menu hidden
        return head+menu+'<div class="grid">'+''.join(card(f'q{i}',f'Q{i}') for i in range(9))+'</div></body></html>'

EXPECT={'tcl-hide':{'c755','c745','p635'},'tcl-visible-extras':{'c755','c745','p635'},
        'rows-24':{f'm{i}' for i in range(24)}|{'z1','z2'},'results-12-rows':{f'm{i}' for i in range(12)},
        'plain':{f'q{i}' for i in range(9)}}

async def main():
    ok=True
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page()
        for kind in EXPECT:
            def mk(kind):
              async def route(r):
                if 'static-obg' in r.request.url: await r.fulfill(status=200,content_type='image/png',body=b'')
                else: await r.fulfill(status=200,content_type='text/html; charset=utf-8',body=page(kind))
              return route
            route=mk(kind)
            await pg.unroute('**/*')
            await pg.route('**/*',route)
            await pg.goto('https://www.tcl.com/ma/fr/tvs?tvs-for-gaming')
            await pg.add_script_tag(content=JS)
            r=await pg.evaluate('window.GHANDI.collectLinks({timeoutMs:15000})')
            got={u['url'].rstrip('/').split('/')[-1] for u in r['links']}
            good=got==EXPECT[kind]
            ok&=good
            print('PASS' if good else 'FAIL',kind,'found',len(got),'expected',r['expected'],r['how'], '' if good else (sorted(got), r['diag']['anchorsTotal'], r['warnings']))
            # static (quick read) version of the same page
            html=page(kind)
            s=await pg.evaluate('''([h,u])=>{const d=new DOMParser().parseFromString(h,'text/html');return window.GHANDI.forDocument(d,u).collectLinks({static:true})}''',[html,'https://www.tcl.com/ma/fr/tvs?tvs-for-gaming'])
            print('   static:',len(s['links']),'links, page says',s['expected'])
        await b.close()
    print('ALL PASS' if ok else 'SOME FAILED'); import sys; sys.exit(0 if ok else 1)
if __name__=="__main__": asyncio.run(main())
