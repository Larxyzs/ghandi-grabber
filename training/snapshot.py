"""Save real product pages for training (independent of the extension).

  python training/snapshot.py                    # every corpus product that has no snapshot yet
  python training/snapshot.py --site lg --force  # again, even if saved
  python training/snapshot.py --ids lg-gr-b499nqlm

For each product, in training/snapshots/<site>/<id>/:
  raw.html.gz       the page exactly as downloaded (what the extension's "quick read" sees)
  rendered.html.gz  the page after a real browser ran it, opened every tab/accordion/"voir plus", scrolled
                    (scripts removed, hidden parts marked display:none so they stay hidden without the CSS)
  xhr/NN.json       JSON answers the page fetched ({url, body})
  gallery.json      the pictures the browser showed in the product area (address, size, place)
  spec.txt          the visible text of the specifications area, after opening everything (for checking)
  shots/*.jpg       screenshots: top of the page (gallery), each gallery slide, the opened specifications
  meta.json         address, final address, status, title, when, what was clicked
Polite: real browser, >= the site's delay between pages, no logins, no forms (only the cookie "accept" button).
"""
import argparse, json, os, re, sys, time
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

OPEN_RX = (r'^(\+\s*)?(voir|afficher|montrer|lire)\s+(toutes?|tous|plus|la suite|les d[ée]tails)|^(voir|afficher) (les |toutes les )?(caract[ée]ristiques|sp[ée]cifications)'
           r'|^(toutes les )?(caract[ée]ristiques|sp[ée]cifications)( techniques| du produit| principales)?$|^fiche technique$|^d[ée]tails( du produit)?$'
           r'|^(informations?|donn[ée]es) techniques?$|^agrandir tout$|^tout (ouvrir|afficher|agrandir|d[ée]velopper)$|^spec(s|ifications)?$'
           r'|^(dimensions|performances?|consommation|conception|programmes?|fonctions?|s[ée]curit[ée]|connectivit[ée]|g[ée]n[ée]ral|confort|capacit[ée]|caract[ée]ristiques g[ée]n[ée]rales|son|image|audio|vid[ée]o)')

OPENER_JS = r'''
(o) => {
  const RX = new RegExp(o.rx, 'i');
  const extra = o.extra ? new RegExp(o.extra, 'i') : null;
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const SEL = 'button,[role=button],[role=tab],a,summary,[aria-expanded],li,span,div,h2,h3,h4,h5,dt,p,label';
  const out = [];
  const els = Array.from(document.querySelectorAll(SEL));
  for (const el of els) {
    if (el.closest('header,footer,nav,[class*="cookie" i],#onetrust-consent-sdk,[class*="newsletter" i],form,[class*="breadcrumb" i],[class*="megamenu" i],[class*="mega-menu" i]')) continue;
    if (el.dataset.ghClicked) continue;
    const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 70) continue;
    const ae = el.getAttribute('aria-expanded');
    if (ae === 'true') continue;
    const hit = RX.test(t) || (extra && extra.test(t)) || (o.aria && ae === 'false' && /accordion|collaps|toggle|expand|spec|tab|caract/i.test((el.className || '') + ' ' + (el.getAttribute('aria-controls') || '')));
    if (!hit) continue;
    // innermost element with that text only
    if (Array.from(el.querySelectorAll(SEL)).some((c) => (c.innerText || '').replace(/\s+/g, ' ').trim() === t)) continue;
    const a = el.closest('a[href]');
    if (a) { const h = a.getAttribute('href') || ''; if (h && !/^(#|javascript:)/i.test(h)) { try { const u = new URL(a.href); if (u.pathname !== location.pathname || u.host !== location.host) continue; } catch (e) { continue; } } }
    if (el.closest('select,input,textarea')) continue;
    if (!vis(el)) continue;
    el.dataset.ghClicked = '1';
    try { el.scrollIntoView({ block: 'center' }); el.click(); out.push(t.slice(0, 50)); } catch (e) {}
    if (out.length >= o.max) break;
  }
  document.querySelectorAll('details:not([open])').forEach((d) => { d.open = true; });
  return out;
}
'''

COOKIE_JS = r'''
() => {
  const b = document.querySelector('#onetrust-accept-btn-handler, #didomi-notice-agree-button, .cmplz-accept, #CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll, [data-testid="uc-accept-all-button"]');
  if (b) { b.click(); return 'accept-button'; }
  const rx = /^(tout |tous )?(accepter|j'accepte|accept all|accept|autoriser tous|ok|d'accord)( tout| tous| et fermer| les cookies)?$/i;
  for (const el of document.querySelectorAll('button,a[role=button],[role=button]')) {
    const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (rx.test(t) && el.getBoundingClientRect().width > 0) { el.click(); return t; }
  }
  return '';
}
'''

# what the browser shows in the product area: every picture with its size and place (for the auditor)
GALLERY_JS = r'''
(sel) => {
  const out = [];
  const seen = new Set();
  const root = sel ? Array.from(document.querySelectorAll(sel)) : [document.body];
  root.forEach((r) => r.querySelectorAll('img, source').forEach((im) => {
    const src = im.tagName === 'IMG' ? (im.currentSrc || im.src || im.getAttribute('data-src') || '') : (im.getAttribute('srcset') || '').split(',')[0].trim().split(' ')[0];
    if (!src || src.startsWith('data:')) return;
    const b = (im.tagName === 'IMG' ? im : (im.parentElement && im.parentElement.querySelector('img')) || im).getBoundingClientRect();
    const key = src + '|' + Math.round(b.left) + '|' + Math.round(b.top);
    if (seen.has(key)) return; seen.add(key);
    out.push({ src, srcset: im.getAttribute('srcset') || '', dataSrc: im.getAttribute('data-src') || '', alt: im.getAttribute('alt') || '',
      w: im.naturalWidth || 0, h: im.naturalHeight || 0, x: Math.round(b.left + scrollX), y: Math.round(b.top + scrollY), bw: Math.round(b.width), bh: Math.round(b.height),
      tag: im.tagName, cls: (im.className && im.className.baseVal === undefined ? im.className : '') .slice(0, 80) });
  }));
  return out;
}
'''

FREEZE_JS = r'''
() => {
  // mark what is hidden now (the saved page has no CSS), remember the picture the browser chose, drop scripts
  let n = 0;
  document.querySelectorAll('body *').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') { el.setAttribute('data-gh-hidden', '1'); el.style.setProperty('display', 'none', 'important'); n++; }
    else if (cs.visibility === 'hidden') { el.setAttribute('data-gh-hidden', 'v'); el.style.setProperty('visibility', 'hidden', 'important'); }
    if (el.tagName === 'IMG' && el.currentSrc) el.setAttribute('data-gh-current', el.currentSrc);
  });
  document.querySelectorAll('script').forEach((s) => { const t = (s.type || '').toLowerCase(); if (!/json/.test(t)) s.remove(); });
  document.querySelectorAll('link[rel=stylesheet], link[rel=preload], link[rel=prefetch], link[rel=modulepreload], style[data-emotion]').forEach((l) => l.remove());
  document.querySelectorAll('iframe').forEach((f) => f.removeAttribute('src'));
  return n;
}
'''


def scroll_through(page, step=700, pause=250, max_ms=12000):
    t0 = time.time()
    h = page.evaluate('document.documentElement.scrollHeight')
    y = 0
    while y < h and (time.time() - t0) * 1000 < max_ms:
        y += step
        page.evaluate(f'window.scrollTo(0,{y})')
        page.wait_for_timeout(pause)
        h = page.evaluate('document.documentElement.scrollHeight')
    page.evaluate('window.scrollTo(0,0)')
    page.wait_for_timeout(400)


def shot_element(page, sel, prefix, outdir, maxn=8):
    """Screenshot of the element(s) matching sel, cut in pieces of at most 1280 px high."""
    files = []
    try:
        boxes = page.evaluate('''(s) => Array.from(document.querySelectorAll(s)).map(e => { const r = e.getBoundingClientRect(); return [r.left + scrollX, r.top + scrollY, r.width, r.height]; }).filter(b => b[2] > 50 && b[3] > 30)''', sel)
    except Exception:
        boxes = []
    # merge into one region
    if not boxes:
        return files
    x0 = max(0, min(b[0] for b in boxes)); y0 = max(0, min(b[1] for b in boxes))
    x1 = max(b[0] + b[2] for b in boxes); y1 = max(b[1] + b[3] for b in boxes)
    w = min(1280, x1 - x0)
    y = y0
    i = 0
    while y < y1 and i < maxn:
        hh = min(1280, y1 - y)
        f = os.path.join(outdir, f'{prefix}-{i + 1}.jpg')
        try:
            page.screenshot(path=f, type='jpeg', quality=60, full_page=True, clip={'x': x0, 'y': y, 'width': w, 'height': hh})
            files.append(os.path.basename(f))
        except Exception as e:
            print('   shot failed', e)
            break
        y += hh
        i += 1
    return files


def snapshot_one(ctx, item, site, polite):
    d = C.snap_dir(item)
    os.makedirs(os.path.join(d, 'shots'), exist_ok=True)
    os.makedirs(os.path.join(d, 'xhr'), exist_ok=True)
    for f in os.listdir(os.path.join(d, 'shots')):
        os.remove(os.path.join(d, 'shots', f))
    for f in os.listdir(os.path.join(d, 'xhr')):
        os.remove(os.path.join(d, 'xhr', f))
    cfg = site.get('snap', {})
    meta = {'id': item['id'], 'url': item['url'], 'savedAt': C.now_iso()}
    # 1) raw page (what quick read downloads)
    polite.wait(item['url'], site.get('delay', 2.5))
    try:
        r = ctx.request.get(item['url'], headers={'accept': 'text/html,application/xhtml+xml'}, timeout=45000)
        raw = r.text()
        meta.update(rawStatus=r.status, rawUrl=r.url, rawBytes=len(raw))
    except Exception as e:  # the site refused the plain download (that is what quick read gets too)
        raw = ''
        meta.update(rawStatus=0, rawError=str(e).splitlines()[0][:200], rawBytes=0)
    C.write_gz(os.path.join(d, 'raw.html.gz'), raw)
    # 2) the real page in the browser
    page = ctx.new_page()
    xhr = []

    def on_resp(resp):
        try:
            if resp.request.resource_type in ('xhr', 'fetch') and 'json' in (resp.headers.get('content-type') or '') and len(xhr) < 40:
                body = resp.text()
                if 50 < len(body) < 3_000_000:
                    xhr.append({'url': resp.url, 'body': body})
        except Exception:
            pass
    page.on('response', on_resp)
    page.on('popup', lambda pp: pp.close())
    polite.wait(item['url'], site.get('delay', 2.5))
    resp = page.goto(item['url'], wait_until='domcontentloaded', timeout=60000)
    meta['status'] = resp.status if resp else None
    try:
        page.wait_for_load_state('load', timeout=25000)
    except Exception:
        pass
    page.wait_for_timeout(cfg.get('waitMs', 2500))
    meta['cookies'] = page.evaluate(COOKIE_JS)
    page.wait_for_timeout(800)
    home = urlparse(page.url).path
    meta['finalUrl'] = page.url
    meta['title'] = page.title()
    scroll_through(page)
    # 3) open every tab / accordion / "voir toutes les caractéristiques"
    clicked = []
    for sel in cfg.get('clickFirst', []):
        try:
            for el in page.query_selector_all(sel)[:30]:
                if el.is_visible():
                    el.click(timeout=3000)
                    clicked.append('sel:' + sel)
                    page.wait_for_timeout(500)
        except Exception:
            pass
    for _ in range(cfg.get('passes', 4)):
        try:
            got = page.evaluate(OPENER_JS, {'rx': OPEN_RX, 'extra': cfg.get('open', ''), 'aria': cfg.get('aria', True), 'max': 60})
        except Exception:  # the page reloaded itself: wait and go on
            page.wait_for_timeout(3000)
            got = []
        if urlparse(page.url).path.rstrip('/').lower() != home.rstrip('/').lower():  # a click left the page: come back
            clicked.append('LEFT THE PAGE -> ' + page.url[:120])
            try:
                page.goto(meta['finalUrl'], wait_until='domcontentloaded', timeout=60000)
                page.wait_for_timeout(3000)
                page.evaluate(COOKIE_JS)
            except Exception:
                pass
            continue  # open everything again on the reloaded page (links are never clicked twice: they are marked)
        clicked += got
        page.wait_for_timeout(1200 if got else 300)
        if not got:
            break
    meta['clicked'] = clicked
    scroll_through(page, step=900, pause=150, max_ms=6000)
    page.wait_for_timeout(1000)
    # 4) what the browser shows: gallery pictures, specification text, screenshots
    gal_sel = cfg.get('gallery', '')
    gallery = page.evaluate(GALLERY_JS, gal_sel or None)
    C.save_json(os.path.join(d, 'gallery.json'), {'selector': gal_sel, 'images': gallery})
    spec_sel = cfg.get('specs', '')
    try:
        spec_txt = page.evaluate('(s) => Array.from(document.querySelectorAll(s)).map(e => e.innerText).join("\\n\\n=====\\n\\n")', spec_sel) if spec_sel else ''
    except Exception:
        spec_txt = ''
    if not spec_txt:
        spec_txt = page.evaluate('() => (document.querySelector("main") || document.body).innerText')
    with open(os.path.join(d, 'spec.txt'), 'w', encoding='utf-8') as f:
        f.write(spec_txt)
    shots = []
    page.evaluate('window.scrollTo(0,0)')
    page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(d, 'shots', 'top.jpg'), type='jpeg', quality=60)
    shots.append('top.jpg')
    if spec_sel:
        shots += shot_element(page, spec_sel, 'specs', os.path.join(d, 'shots'))
    meta['shots'] = shots
    # 5) the rendered page, frozen
    meta['hiddenMarked'] = page.evaluate(FREEZE_JS)
    html = page.content()
    C.write_gz(os.path.join(d, 'rendered.html.gz'), html)
    path = urlparse(item['url']).path.rstrip('/').lower()
    kept = 0
    for x in xhr:  # keep only the product's own data (page data, spec JSON), gzipped
        u = x['url'].lower()
        if ('/page-data/' in u and path.split('/fr_ma', 1)[-1] in u) or ('/page-data/' not in u and re.search(r'product_spec|spec|getproductsbysku|/product', u)):
            C.write_gz(os.path.join(d, 'xhr', f'{kept:02d}.json.gz'), json.dumps(x, ensure_ascii=False))
            kept += 1
    meta['xhr'] = kept
    meta['renderedBytes'] = len(html)
    C.save_json(os.path.join(d, 'meta.json'), meta)
    page.close()
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--site')
    ap.add_argument('--type')
    ap.add_argument('--ids', nargs='*')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()
    C.ensure_display()
    from playwright.sync_api import sync_playwright
    sites = C.load_sites()
    items = C.filter_items(C.load_corpus(), args)
    todo = [i for i in items if args.force or not os.path.exists(os.path.join(C.snap_dir(i), 'meta.json'))]
    # alternate sites so each one gets long pauses
    by_site = {}
    for it in todo:
        by_site.setdefault(it['site'], []).append(it)
    order = []
    while any(by_site.values()):
        for s in list(by_site):
            if by_site[s]:
                order.append(by_site[s].pop(0))
    print(len(order), 'pages to save')
    polite = C.Polite()
    with sync_playwright() as p:
        kw = {'proxy': {'server': C.proxy_server()}} if C.proxy_server() else {}
        b = p.chromium.launch(headless=False, **kw)
        ctx = None
        for n, it in enumerate(order, 1):
            t0 = time.time()
            if ctx is None:
                ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='fr-FR')
                ctx.set_default_timeout(30000)
            try:
                m = snapshot_one(ctx, it, sites[it['site']], polite)
                print(f'[{n}/{len(order)}] {it["id"]}: {m.get("status")} raw {m.get("rawBytes")} b, {len(m.get("clicked", []))} clicks, {m.get("xhr")} json, {round(time.time() - t0, 1)} s', flush=True)
            except Exception as e:
                print(f'[{n}/{len(order)}] {it["id"]}: FAILED {str(e).splitlines()[0][:200]}', flush=True)
                try:
                    ctx.close()  # a broken page can block the next one: start clean
                except Exception:
                    pass
                ctx = None
        b.close()


if __name__ == '__main__':
    main()
