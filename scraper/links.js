/*
  links.js  —  finds the PRODUCT LINKS on a category / list page.

  It is loaded together with core.js. It:
    1. waits for the page,
    2. clicks "Charger plus / Voir plus" and scrolls until no new products appear,
    3. picks out the product links (recipe rules first, smart guessing second),
    4. looks for a "next page" link.

  You normally never edit this file. Each brand recipe can describe its own
  product links in a small "productLinks" block (see whirlpool.js for an example).
*/
(function bootLinks(window, document, location) {
  'use strict';

  const G = window.GHANDI;
  const U = G.util;
  const { sleep, clean, qa, toArray, waitUntil, bestImageUrl, isNoise, isCookie } = U;

  const LOAD_MORE_RE = /^(voir|afficher|charger|montrer|show|view|load|see)\s+(plus|davantage|more|encore)\b|^plus de (produits|r[ée]sultats)\b|^(more|load more)$/i;
  const NEXT_RE = /^(suivant|page suivante|next|next page|suivante|›|»|>|→)$/i;
  const TRACKING = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'mc_cid', 'mc_eid'];

  function toUrl(href) {
    try {
      const u = new URL(href, location.href);
      if (!/^https?:$/.test(u.protocol)) return null;
      return u;
    } catch (e) {
      return null;
    }
  }

  function normalize(href) {
    const u = toUrl(href);
    if (!u) return null;
    u.hash = '';
    TRACKING.forEach((k) => u.searchParams.delete(k));
    return u.href;
  }

  function keyOf(href) {
    const u = toUrl(href);
    if (!u) return href;
    return (u.host + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
  }

  const segments = (pathname) => pathname.split('/').filter(Boolean);

  // ---------- which links are products? ----------
  function isProductUrl(u, lc, here) {
    const path = u.pathname;
    if (/\.(pdf|jpe?g|png|webp|gif|zip|mp4|svg|docx?)$/i.test(path)) return false;
    if (normalize(u.href) === normalize(here.href)) return false;
    if (toArray(lc.exclude).some((r) => r.test(path))) return false;

    if (typeof lc.test === 'function') {
      try {
        return !!lc.test(path, u);
      } catch (e) {
        return false;
      }
    }
    const pats = toArray(lc.pattern);
    if (pats.length && pats.some((r) => r.test(path + u.search))) return true;

    const segs = segments(path);
    const last = segs[segs.length - 1] || '';
    if (lc.lastSegmentRegex && lc.lastSegmentRegex.test(last) && segs.length >= (lc.minSegments || 2)) return true;
    return false;
  }

  function isChildOfListing(u, here) {
    const base = here.pathname.replace(/\/+$/, '').toLowerCase();
    const p = u.pathname.replace(/\/+$/, '').toLowerCase();
    return p.startsWith(base + '/') && segments(p).length === segments(base).length + 1;
  }

  function allAnchors() {
    return qa('a[href]').filter((a) => !isNoise(a) && !/^(mailto:|tel:|javascript:)/i.test(a.getAttribute('href') || ''));
  }

  // Cards: many links with a picture, same folder, same depth.
  function clusterAnchors(anchors, here) {
    const groups = new Map();
    anchors.forEach((a) => {
      if (!a.querySelector('img,picture')) return;
      const u = toUrl(a.href);
      if (!u || u.host !== here.host) return;
      const segs = segments(u.pathname);
      if (!segs.length) return;
      const key = segs.length + '|' + segs.slice(0, -1).join('/').toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a);
    });
    let best = null;
    groups.forEach((list, key) => {
      const unique = new Set(list.map((a) => keyOf(a.href))).size;
      if (unique >= 3 && (!best || unique > best.unique)) best = { key, list, unique };
    });
    return best ? best.list : [];
  }

  function findProductAnchors(lc, here, recipeless) {
    const anchors = allAnchors();

    // 1) the recipe names the cards / links exactly
    for (const sel of toArray(lc.selectors)) {
      const list = qa(sel).flatMap((el) => (el.tagName === 'A' ? [el] : qa('a[href]', el))).filter((a) => !isCookie(a));
      if (list.length) return { anchors: list, how: 'recipe-selector ' + sel };
    }
    // 2) the recipe describes the product address
    const byRule = anchors.filter((a) => {
      const u = toUrl(a.href);
      return u && u.host === here.host && isProductUrl(u, lc, here);
    });
    if (byRule.length) {
      // keep only products of THIS category (menus often show products from other categories)
      const n = lc.sameSection;
      if (n) {
        const base = segments(here.pathname).slice(0, n).join('/').toLowerCase();
        const same = byRule.filter((a) => {
          const u = toUrl(a.href);
          return u && segments(u.pathname).slice(0, n).join('/').toLowerCase() === base;
        });
        if (same.length && segments(here.pathname).length >= n) {
          // a product of an older folder can sit in the SAME grid of cards (lg.com: /ma/climatisation-residentielle/...)
          // -> also keep links that live inside the box holding all the cards (but never the menu)
          // the grid = the deepest box holding most of the cards (a banner link elsewhere does not count)
          let grid = null;
          if (same.length >= 2) {
            const need = Math.max(2, Math.ceil(same.length * 0.6));
            let bestDepth = -1;
            same.forEach((a) => {
              let depth = 0;
              for (let n = a.parentElement; n; n = n.parentElement) depth++;
              for (let n = a.parentElement, d = depth; n; n = n.parentElement, d--) {
                if (d <= bestDepth) break;
                if (same.filter((b) => n.contains(b)).length >= need) {
                  grid = n;
                  bestDepth = d;
                  break;
                }
              }
            });
          }
          if (grid && !/^(BODY|HTML|MAIN)$/.test(grid.tagName) && !grid.querySelector('header,nav,footer') && !grid.closest('header,nav,footer')) {
            const more = byRule.filter((a) => same.indexOf(a) === -1 && grid.contains(a));
            if (more.length) return { anchors: byRule.filter((a) => same.indexOf(a) !== -1 || more.indexOf(a) !== -1), how: 'address-rule (same section + same grid)' };
          }
          return { anchors: same, how: 'address-rule (same section)' };
        }
      }
      return { anchors: byRule, how: 'address-rule' };
    }

    // 3) products that live one folder below the list page
    const kids = anchors.filter((a) => {
      const u = toUrl(a.href);
      return u && u.host === here.host && !toArray(lc.exclude).some((r) => r.test(u.pathname)) && isChildOfListing(u, here);
    });
    if (kids.length >= 2) return { anchors: kids, how: 'one-folder-below-this-page' };

    // 4) smart guess from the shape of the page
    const cards = clusterAnchors(anchors, here);
    if (cards.length) return { anchors: cards, how: 'repeated-cards-guess' };
    return { anchors: [], how: 'nothing' };
  }

  // ---------- reading one anchor ----------
  function titleOf(a) {
    const direct = clean(a.getAttribute('title') || a.getAttribute('aria-label') || '');
    if (direct) return direct.slice(0, 160);
    const h = a.querySelector('h1,h2,h3,h4,h5,[class*="title" i],[class*="name" i]');
    if (h && clean(h.textContent)) return clean(h.textContent).slice(0, 160);
    const text = clean(a.textContent);
    if (text) return text.slice(0, 160);
    const img = a.querySelector('img[alt]');
    return img ? clean(img.getAttribute('alt')).slice(0, 160) : '';
  }

  function imageOf(a) {
    const img = a.querySelector('img');
    if (!img) return '';
    const u = bestImageUrl(img);
    if (!u || /^data:/i.test(u)) return '';
    try {
      return new URL(u, location.href).href;
    } catch (e) {
      return '';
    }
  }

  // ---------- "Charger plus" ----------
  const looksHidden = (el) => {
    if (el.hidden || el.disabled || el.getAttribute('aria-disabled') === 'true') return true;
    try {
      const cs = window.getComputedStyle(el);
      return cs.display === 'none' || cs.visibility === 'hidden';
    } catch (e) {
      return false;
    }
  };

  // the "load more" button. Buttons inside filters / menus are ignored, buttons placed
  // AFTER the products come first, and a button that already did nothing is skipped.
  const dudButtons = new Set();
  function findLoadMore(lc, lastProduct) {
    const custom = lc.loadMore instanceof RegExp ? lc.loadMore : null;
    const all = qa('button,a,[role="button"],input[type="button"]').filter((el) => {
      if (dudButtons.has(el) || isCookie(el) || looksHidden(el)) return false;
      if (el.tagName === 'A' && /^(https?:)?\/\//.test(el.getAttribute('href') || '') && !custom) return false;
      const t = clean(el.textContent || el.value || '');
      if (!t || t.length > 40) return false;
      return custom ? custom.test(t) : LOAD_MORE_RE.test(t);
    });
    const side = (el) => !!el.closest('aside,nav,header,footer,[class*="filter" i],[class*="facet" i],[class*="refine" i]');
    const after = (el) => !!(lastProduct && lastProduct.compareDocumentPosition && lastProduct.compareDocumentPosition(el) & 4);
    const score = (el) => (after(el) ? 1 : 0);
    // a "voir plus" inside the filters only opens more filter choices: never a load-more button
    return all.filter((el) => !side(el)).map((el, i) => ({ el, i, s: score(el) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.el)[0];
  }

  // "résultats (22)", "22 produits" ...
  function expectedCount() {
    const texts = qa('h1,h2,h3,h4,p,span,div,strong')
      .filter((el) => el.childElementCount <= 2)
      .map((el) => clean(el.textContent))
      .filter((t) => t.length > 0 && t.length <= 40);
    for (const t of texts) {
      // "résultats (7)", "Produits correspondants (10)", "24 produits", "12 De 12 Produits", "Afficher 6 De 6 Résultats"
      let m =
        t.match(/\b(\d{1,4})\s+(?:de|sur|of)\s+(\d{1,4})\s+(?:r[ée]sultats?|results?|produits?|products?|articles?)\b/i) ||
        t.match(/(?:r[ée]sultats?|results?|produits?|products?|articles?)(?:\s+correspondants?)?\s*[:(]?\s*(\d{1,4})\b/i) ||
        t.match(/\b(\d{1,4})\s*(?:r[ée]sultats?|results?|produits?|products?|articles?)\b/i);
      if (m) return parseInt(m[2] || m[1], 10);
    }
    return 0;
  }

  // ---------- "next page" ----------
  function currentPageNumber(here) {
    for (const k of ['page', 'p', 'pg', 'pagina', 'pageNumber', 'pageIndex']) {
      const v = parseInt(here.searchParams.get(k), 10);
      if (v > 0) return v;
    }
    const m = here.pathname.match(/\/page\/(\d+)/i);
    if (m) return parseInt(m[1], 10);
    const cur = qa('[aria-current="page"]').map((e) => parseInt(clean(e.textContent), 10)).find((n) => n > 0);
    return cur || 1;
  }

  function findNextPage(here) {
    const rel = document.querySelector('a[rel~="next"][href], link[rel="next"][href]');
    if (rel) {
      const n = normalize(rel.getAttribute('href'));
      if (n && n !== normalize(here.href)) return n;
    }
    const anchors = qa('a[href]').filter((a) => !isCookie(a));
    const byLabel = anchors.find((a) => {
      const t = clean(a.getAttribute('aria-label') || a.textContent || '');
      return NEXT_RE.test(t) && a.getAttribute('aria-disabled') !== 'true' && !/disabled/i.test(a.className || '');
    });
    if (byLabel) {
      const n = normalize(byLabel.href);
      if (n && n !== normalize(here.href)) return n;
    }
    const nextNum = currentPageNumber(here) + 1;
    const numbered = anchors.find(
      (a) => clean(a.textContent) === String(nextNum) && a.closest('[class*="pagin" i],nav[aria-label*="pag" i],[role="navigation"]')
    );
    if (numbered) {
      const n = normalize(numbered.href);
      if (n && n !== normalize(here.href)) return n;
    }
    return '';
  }

  // A "shop window" page that shows only a few products and a link "Voir tous les produits"
  function fullListLink(lc, here) {
    const re = lc.fullListText instanceof RegExp ? lc.fullListText : /^(voir|afficher|d[ée]couvrir) (tous|toute) (les )?(produits|la gamme|la s[ée]lection)$/i;
    const a = qa('a[href]').find((x) => !isNoise(x) && re.test(clean(x.textContent)));
    if (!a) return '';
    const n = normalize(a.href);
    return n && n !== normalize(here.href) ? n : '';
  }

  // ---------- report for when something looks wrong ----------
  function diagnoseList(here) {
    const anchors = allAnchors();
    const groups = new Map();
    anchors.forEach((a) => {
      const u = toUrl(a.href);
      if (!u || u.host !== here.host) return;
      const segs = segments(u.pathname);
      const key = segs.length + ' folders under /' + segs.slice(0, Math.min(2, Math.max(segs.length - 1, 0))).join('/');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a.getAttribute('href'));
    });
    const top = Array.from(groups.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8)
      .map(([key, list]) => ({ key, count: list.length, samples: list.slice(0, 3).map((h) => String(h).slice(0, 140)) }));
    const pager = qa('[class*="pagin" i] a, nav[aria-label*="pag" i] a')
      .slice(0, 10)
      .map((a) => clean(a.textContent).slice(0, 20) + ' → ' + String(a.getAttribute('href')).slice(0, 100));
    const buttons = qa('button,[role="button"]')
      .map((b) => clean(b.textContent))
      .filter((t) => /plus|more|suivant|next|charger|afficher|voir/i.test(t) && t.length < 40)
      .slice(0, 10);
    return {
      pageTitle: document.title,
      h1: qa('h1').slice(0, 2).map((e) => clean(e.textContent).slice(0, 100)),
      anchorsTotal: qa('a[href]').length,
      anchorsInContent: anchors.length,
      linkGroups: top,
      pagination: pager,
      buttonsThatLookLikeMore: buttons,
    };
  }

  // ================================================================
  //  THE JOB
  // ================================================================
  G.collectLinks = async function (options) {
    const t0 = Date.now();
    const budget = (options && options.timeoutMs) || 70000;
    const here = new URL(location.href);
    const recipe = G.pickRecipeFor(location.hostname, options && options.recipeId);
    const lc = (recipe && recipe.productLinks) || {};
    const warnings = [];
    const fast = !!(options && options.static); // quick read: the page was only downloaded

    if (!fast) {
      // wait for the products: 2 or more, or 1 that stays alone (lists that show one card + "voir plus")
      let firstSeen = 0;
      await waitUntil(() => {
        const n = findProductAnchors(lc, here).anchors.length;
        if (n >= 2) return true;
        if (n < 1) return false;
        if (!firstSeen) firstSeen = Date.now();
        return !!findLoadMore(lc, null) || Date.now() - firstSeen > 1500;
      }, Math.min(10000, budget), 300);
      await sleep(300);
    }

    const found = new Map(); // address -> { url, title, image }
    let how = '';
    let lastAnchor = null;
    const harvest = () => {
      const r = findProductAnchors(lc, here);
      how = r.how;
      if (r.anchors.length) lastAnchor = r.anchors[r.anchors.length - 1];
      r.anchors.forEach((a) => {
        const url = normalize(a.href);
        if (!url) return;
        const k = keyOf(url);
        const title = titleOf(a);
        const image = imageOf(a);
        if (!found.has(k)) found.set(k, { url, title, image });
        else {
          const f = found.get(k);
          if (!f.title && title) f.title = title;
          if (!f.image && image) f.image = image;
        }
      });
      return found.size;
    };

    harvest();
    const expected = expectedCount();

    // load everything that hides behind "Charger plus" or infinite scrolling
    let still = 0;
    const hasLoadMore = !!findLoadMore(lc, lastAnchor);
    for (let round = 0; !fast && round < ((options && options.maxRounds) || 40) && Date.now() - t0 < budget && still < 2; round++) {
      if (expected && found.size >= expected) break;
      const before = found.size;
      const btn = findLoadMore(lc, lastAnchor);
      if (btn) {
        try {
          btn.scrollIntoView({ block: 'center' });
        } catch (e) {
          /* fine */
        }
        btn.click();
        // wait until new products show up (not a fixed pause)
        await waitUntil(() => harvest() > before || !btn.isConnected, 3000, 150);
        await sleep(150);
        if (found.size === before && btn.isConnected) {
          dudButtons.add(btn); // this one did nothing: try the next button, it is not "no more products" yet
          if (findLoadMore(lc, lastAnchor)) continue;
        }
      } else {
        try {
          window.scrollTo(0, document.documentElement.scrollHeight);
        } catch (e) {
          /* fine */
        }
        await waitUntil(() => harvest() > before, 700, 150);
      }
      harvest();
      still = found.size === before ? still + 1 : 0;
    }
    try {
      window.scrollTo(0, 0);
    } catch (e) {
      /* fine */
    }

    const links = Array.from(found.values());
    if (!links.length) warnings.push('I could not find any product links on this page. Is it a category / list page?');
    else if (expected && links.length < expected) warnings.push('The page says ' + expected + ' products but I found ' + links.length + '.');

    const h1 = qa('h1').map((e) => clean(e.textContent)).find(Boolean) || '';
    return JSON.parse(
      JSON.stringify({
        ok: links.length > 0,
        url: location.href,
        title: h1,
        brand: recipe ? recipe.brand : '',
        links,
        next: findNextPage(here) || (links.length <= 12 ? fullListLink(lc, here) : ''),
        expected,
        hasLoadMore: fast ? hasLoadMore : false,
        how,
        warnings,
        diag: diagnoseList(here),
        seconds: Math.round((Date.now() - t0) / 100) / 10,
      })
    );
  };
  if (!window.GHANDI_LINKS_BOOT) window.GHANDI_LINKS_BOOT = bootLinks;
})(window, document, location);
