/*
  core.js  —  the BRAIN of the extension.

  It is the same for every brand. It:
    - looks at the web address and picks the right brand recipe,
    - waits for the page to finish loading its pictures and tables,
    - opens hidden "Caractéristiques" boxes if it has to,
    - reads: name, price, pictures, specifications,
    - sends everything back in one tidy package.

  You normally never edit this file.
  To teach it a new brand, you add a recipe file (see HOW-TO-ADD-A-BRAND.txt).
*/
(function boot(window, document, location) {
  'use strict';

  const G = (window.GHANDI = window.GHANDI || {});
  G.recipes = G.recipes || {};

  // Brand recipes call this to sign up.
  G.register = function (recipe) {
    if (recipe && recipe.id) G.recipes[recipe.id] = recipe;
  };

  // ================================================================
  //  Small tools
  // ================================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (t) =>
    String(t == null ? '' : t)
      .replace(/[ ​‎‏﻿]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const toArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const qa = (sel, root) => {
    try {
      return Array.from((root || document).querySelectorAll(sel));
    } catch (e) {
      return [];
    }
  };

  // Wait until the page stops changing (a click opened something and it finished drawing).
  // Much faster than a fixed pause: usually ~150 ms, never longer than maxMs.
  function settle(maxMs, quietMs) {
    return new Promise((resolve) => {
      const quiet = quietMs || 100;
      let timer = null;
      let cap = null;
      let finished = false;
      let mo = null;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        clearTimeout(cap);
        if (mo) mo.disconnect();
        resolve();
      };
      try {
        mo = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(finish, quiet);
        });
        mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      } catch (e) {
        return setTimeout(resolve, maxMs || 450);
      }
      timer = setTimeout(finish, quiet + 20);
      cap = setTimeout(finish, maxMs || 450);
    });
  }

  async function waitUntil(test, timeoutMs, everyMs) {
    const end = Date.now() + timeoutMs;
    for (;;) {
      try {
        if (test()) return true;
      } catch (e) {
        /* ignore and try again */
      }
      if (Date.now() >= end) return false;
      await sleep(everyMs || 300);
    }
  }

  function absUrl(u) {
    try {
      return new URL(u, location.href).href;
    } catch (e) {
      return '';
    }
  }

  // ================================================================
  //  Prices
  // ================================================================
  const PRICE_RE = /(?:[€$£]\s*)?\d+(?:[\s.,]\d{3})*(?:[.,]\d{1,2})?(?:\s*(?:€|EUR|MAD|DHS?|Dhs?|dirhams?|\$|£))?/i;

  function firstPrice(text) {
    const t = clean(text);
    const m = t.match(PRICE_RE);
    if (!m) return '';
    const found = clean(m[0]);
    const hasCurrency = /[€$£]|EUR|MAD|DH|dirham/i.test(found);
    const hasDecimals = /[.,]\d{1,2}$/.test(found.replace(/\s*(?:€|EUR|MAD|DHS?|Dhs?|dirhams?|\$|£)\s*$/i, ''));
    if (!hasCurrency && !hasDecimals) return ''; // e.g. "-5%" is not a price
    return found;
  }

  function toNumber(text) {
    let s = String(text).replace(/[^\d.,]/g, '');
    if (!s) return NaN;
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot > -1 && lastComma > -1) {
      const dec = lastDot > lastComma ? '.' : ',';
      const thou = dec === '.' ? ',' : '.';
      s = s.split(thou).join('').replace(dec, '.');
    } else if (lastDot > -1 || lastComma > -1) {
      const sep = lastDot > -1 ? '.' : ',';
      const count = s.split(sep).length - 1;
      const after = s.length - s.lastIndexOf(sep) - 1;
      if (count > 1 || after === 3) s = s.split(sep).join(''); // thousands
      else s = s.replace(sep, '.'); // decimal
    }
    return parseFloat(s);
  }

  // ================================================================
  //  JSON-LD ("hidden data card" most shops put in their pages)
  // ================================================================
  function readJsonLd() {
    const out = { has: false, name: '', images: [], price: '', currency: '' };
    const nodes = [];
    const collect = (d) => {
      if (!d) return;
      if (Array.isArray(d)) return d.forEach(collect);
      if (typeof d !== 'object') return;
      nodes.push(d);
      if (d['@graph']) collect(d['@graph']);
    };
    qa('script[type="application/ld+json"]').forEach((s) => {
      try {
        collect(JSON.parse(s.textContent));
      } catch (e) {
        /* bad JSON, skip */
      }
    });
    const prod = nodes.find((n) => toArray(n['@type']).some((t) => /^(Product|ProductGroup)$/i.test(String(t))));
    if (!prod) return out;

    out.has = true;
    out.name = clean(prod.name || '');
    out.images = toArray(prod.image)
      .map((i) => (typeof i === 'string' ? i : i && (i.url || i.contentUrl)))
      .filter((i) => typeof i === 'string' && i);

    const offers = toArray(prod.offers).flatMap((o) => (o && o.offers ? toArray(o.offers) : [o]));
    for (const o of offers) {
      if (!o) continue;
      const p = o.price != null ? o.price : o.lowPrice;
      if (p != null && Number(p) > 0) {
        out.price = String(p);
        out.currency = o.priceCurrency || '';
        break;
      }
    }
    return out;
  }

  // ================================================================
  //  Images
  // ================================================================
  const DEFAULT_BAD_IMAGE = /\.svg(\?|$)|(^|[\/_\-.])(logo|icon|sprite|placeholder|spinner|loader|blank|pixel|badge|flag|payment|rating|avatar)([\/_\-.]|$)|shadow|ytimg\.com|youtube\./i;

  function defaultImageKey(u) {
    try {
      const x = new URL(u);
      let p = x.pathname;
      // sizes like ".../ids/155234-500-auto/" (VTEX shops) or "photo-1200-800.jpg"
      // (NOT "…-gallery-2010-01.jpg": "01" is a slide number, not a size — lg.com names its slides like that)
      p = p.replace(/(\/ids\/\d+)-\d+-(?:\d+|auto)(?=\/|\.|$)/, '$1');
      p = p.replace(/-\d{3,4}-(?:\d{3,4}|auto)(?=\.[a-z0-9]+$)/i, '');
      p = p.replace(/[_-]\d{2,4}x(?:\d{2,4})?(?=\.)/, ''); // sizes like _300x300 or _540x
      return x.host + p;
    } catch (e) {
      return u;
    }
  }

  function largestFromSrcset(srcset) {
    if (!srcset) return '';
    let best = '';
    let bestScore = -1;
    String(srcset)
      .split(',')
      .forEach((part) => {
        const bits = part.trim().split(/\s+/);
        if (!bits[0]) return;
        const d = bits[1] || '';
        const score = d ? parseFloat(d) || 0 : 1;
        if (score >= bestScore) {
          bestScore = score;
          best = bits[0];
        }
      });
    return best;
  }

  function bestImageUrl(img) {
    const attr = (n) => img.getAttribute(n) || '';
    const direct = ['data-zoom-image', 'data-zoom-src', 'data-large', 'data-full', 'data-original'];
    for (const n of direct) if (attr(n)) return attr(n);

    const pic = img.closest ? img.closest('picture') : null;
    if (pic) {
      const s = qa('source', pic)
        .map((so) => largestFromSrcset(so.getAttribute('srcset') || so.getAttribute('data-srcset')))
        .filter(Boolean);
      if (s.length) return s[0];
    }
    const fromSet = largestFromSrcset(attr('srcset') || attr('data-srcset'));
    if (fromSet) return fromSet;

    const rest = ['data-src', 'data-lazy-src', 'data-lazy', img.currentSrc ? 'currentSrc' : '', 'src'];
    for (const n of rest) {
      if (!n) continue;
      const v = n === 'currentSrc' ? img.currentSrc : attr(n);
      if (v && !/^data:/i.test(v)) return v;
    }
    // last resort: any attribute that holds something that looks like a picture address
    for (const a of Array.from(img.attributes || [])) {
      const v = a.value || '';
      if (/^data:/i.test(v) || v.length > 600) continue;
      if (/^(https?:)?\/\//i.test(v) || v.charAt(0) === '/') {
        if (/\.(png|jpe?g|webp|avif)|\/renditions\/|\/images?\//i.test(v)) return v.split(/\s+/)[0];
      }
    }
    return '';
  }

  // Turn a raw list of urls into a clean, unique, upgraded list.
  // how big a picture address says it is (w=1000, width=800, _1600x900 ...). 0 = unknown
  function sizeScore(u) {
    try {
      const x = new URL(u);
      for (const k of ['w', 'width', 'wid', 'imwidth', 'sw']) {
        const v = parseInt(x.searchParams.get(k), 10);
        if (v > 0) return v;
      }
      const m = x.pathname.match(/[_-](\d{2,4})x\d{0,4}(?=[._-])/) || x.pathname.match(/\/(\d{2,4})-[^/]+$/);
      return m ? parseInt(m[1], 10) : 0;
    } catch (e) {
      return 0;
    }
  }

  function processImages(rawUrls, cfg) {
    const seen = new Map();
    const out = [];
    const keyOf = cfg.imageKey || defaultImageKey;
    for (const raw of rawUrls) {
      if (!raw || /^data:/i.test(raw)) continue;
      let u = absUrl(raw);
      if (!u) continue;
      if (DEFAULT_BAD_IMAGE.test(u)) continue;
      if (typeof cfg.imageFilter === 'function' && !cfg.imageFilter(u)) continue;
      if (typeof cfg.imageUpgrade === 'function') {
        try {
          u = cfg.imageUpgrade(u) || u;
        } catch (e) {
          /* keep original */
        }
      }
      const k = keyOf(u);
      if (seen.has(k)) {
        // same picture twice (small thumbnail + big one): keep the BIGGER one, in the first place
        const at = seen.get(k);
        if (sizeScore(u) > sizeScore(out[at])) out[at] = u;
        continue;
      }
      seen.set(k, out.length);
      out.push(u);
    }
    return out;
  }

  // Boxes that show OTHER products ("Produits similaires", "Vous aimerez aussi"...):
  // never take pictures or specifications from them.
  const OTHER_PRODUCTS =
    '#related,#similar,#recommendations,[id*="related" i],[id*="similar" i],[id*="recommend" i],[id*="cross-sell" i],[id*="upsell" i],' +
    '[class*="related" i],[class*="similar" i],[class*="recommend" i],[class*="cross-sell" i],[class*="crosssell" i],[class*="upsell" i],' +
    '[class*="also-like" i],[class*="alsoLike" i],[class*="recently" i],[class*="compare" i],[data-section*="related" i]';
  const OTHER_TITLES = /^(produits? (similaires|associ[ée]e?s?|recommand[ée]e?s?|compl[ée]mentaires|compatibles|combinables)|recommand[ée]s?$|recommand[ée]s? pour vous|nos recommandations|vous (aimerez|pourriez aimer|pourriez [ée]galement aimer|aimeriez) (aussi|peut-[êe]tre|[ée]galement)|vous aimerez peut-[êe]tre|vous pourriez aussi aimer|achetez (ces produits|aussi|[ée]galement)|souvent achet[ée]s ensemble|les clients (ont|qui) |articles similaires|accessoires( recommand[ée]s| compatibles| associ[ée]s)?$|compl[ée]tez (votre|avec)|(produits )?r[ée]cemment consult[ée]s|vous avez (vu|consult[ée]) r[ée]cemment|derniers produits consult[ée]s|comparer (les )?produits|related products|recommended( for you)?|you may also like|frequently bought together|recently viewed)/i;
  let EXTRA_OTHER = '';
  function linksElsewhere(a) {
    const href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(href) || /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(href)) return false;
    try {
      const to = new URL(href, location.href).href.split('#')[0].replace(/\/+$/, '');
      return to !== location.href.split('#')[0].replace(/\/+$/, '');
    } catch (e) {
      return false;
    }
  }
  // A box whose class says "related / similar / compare..." lists OTHER products — except
  //  - a box that holds the product's own title (h1): that is the product's own area
  //    (lg.com wraps its whole product area in a "compare" box, for its "Comparer" checkbox)
  //  - a box with no link to any other product page: it lists no products
  const NOT_PRODUCT_LINK = /\.(pdf|docx?|xlsx?|zip)(\?|#|$)|\/(support|manuels?|downloads?|t[ée]l[ée]chargements?|contact|faq|compare|comparer|comparateur|compare-products)(\/|\?|#|$)|^(https?:)?\/\/[^/]*(facebook|twitter|x|instagram|youtube|whatsapp|linkedin|pinterest|tiktok)\.(com|me)/i;
  const otherBoxMemo = new WeakMap();
  function isOtherBox(box) {
    const now = Date.now();
    const m = otherBoxMemo.get(box);
    if (m && now - m.t < 1500) return m.v; // pages change (cards arrive late): remember only briefly
    let v = !box.querySelector('h1');
    if (v) {
      v = false;
      for (const a of qa('a[href]', box)) {
        if (linksElsewhere(a) && !NOT_PRODUCT_LINK.test(a.getAttribute('href') || '')) {
          v = true;
          break;
        }
      }
    }
    otherBoxMemo.set(box, { t: now, v });
    return v;
  }
  function inOtherBox(el, sel) {
    let box = el.closest(sel);
    for (let i = 0; box && i < 15; i++) {
      if (isOtherBox(box)) return true;
      box = box.parentElement ? box.parentElement.closest(sel) : null;
    }
    return false;
  }
  function inOtherProducts(el) {
    if (!el || !el.closest) return false;
    try {
      if (inOtherBox(el, OTHER_PRODUCTS)) return true;
      if (EXTRA_OTHER && el.closest(EXTRA_OTHER)) return true;
      // a line sitting in a small box that also holds a picture linking to ANOTHER product = a card
      const box = el.parentElement;
      if (box && box.querySelector) {
        const link = box.querySelector('a[href] img') && box.querySelector('a[href]');
        if (link && linksElsewhere(link) && !box.querySelector('h1')) return true;
      }
      // a picture (or line) inside a link to ANOTHER product page = a card of another product
      const card = el.closest('a[href]');
      if (card) {
        const href = card.getAttribute('href') || '';
        if (href && href.charAt(0) !== '#' && !/^(javascript|mailto|tel):/i.test(href) && !/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(href)) {
          try {
            const to = new URL(href, location.href);
            const here = location.href.split('#')[0].replace(/\/+$/, '');
            if (to.href.split('#')[0].replace(/\/+$/, '') !== here) return true;
          } catch (e) {
            /* fine */
          }
        }
      }
    } catch (e) {
      /* fine */
    }
    // a section whose title says "Produits similaires"
    let node = el.parentElement;
    for (let i = 0; i < 8 && node && node !== document.body; i++, node = node.parentElement) {
      // only a box that STARTS with that title (and does not hold the product's own title)
      const first = node.firstElementChild;
      if (!first || node.querySelector('h1')) continue;
      // the title itself, or a small title bar holding it (not a whole section of the page that holds a title somewhere)
      const h = /^H[2-4]$/.test(first.tagName) ? first : clean(first.textContent).length <= 150 ? first.querySelector('h2,h3,h4') : null;
      if (h && OTHER_TITLES.test(clean(h.textContent))) return true;
    }
    return false;
  }

  // Model code / product number of THIS page, from the address and the title.
  // e.g. ".../gr-x257cses/" -> "grx257cses", ".../34005895/hdpr3618dnpkma/" -> "34005895", "WBMF 606374 XNA: ..." -> "wbmf606374xna"
  function productTokens(name) {
    const out = new Set();
    const nrm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const mixed = (s) => /\d/.test(s) && /[a-z]/i.test(s);
    let segs = [];
    try {
      segs = location.pathname.split('/').filter(Boolean).map((x) => decodeURIComponent(x));
    } catch (e) {
      segs = [];
    }
    segs.forEach((seg) => {
      if (/^\d{6,9}$/.test(seg)) out.add(seg);
      if (mixed(seg) && seg.length <= 24) out.add(nrm(seg));
      if (mixed(seg) && seg.length === 3 && seg === segs[segs.length - 1]) out.add('/' + nrm(seg)); // short slug like "p7k": must be a whole folder/file name
      seg.split(/[-_.]/).forEach((p) => {
        if (mixed(p) && p.length >= 5) out.add(nrm(p));
      });
    });
    const n = String(name || '');
    const before = n.split(/[:|]/)[0];
    if (before.length <= 30 && mixed(before)) out.add(nrm(before));
    (n.match(/\b[A-Z0-9][A-Z0-9-]{4,}\b/g) || []).forEach((w) => mixed(w) && out.add(nrm(w)));
    return Array.from(out).filter((t) => (t.length >= 4 || t.charAt(0) === '/') && !/^\d+(kg|l|w|cm|mm|kw|btu|hz|v)$/.test(t) && !/^(4k|8k|uhd|fhd)/.test(t));
  }

  // LOOPING SLIDESHOWS: they put a COPY of the last slide before the first one (swiper "duplicate",
  // slick "cloned"...), or move the last slide to the front (Swiper 9+). Copies are left out and the
  // slides are put back in their real order (data-swiper-slide-index / data-slick-index...), so the
  // main picture is slide 1, not the last one.
  const CLONE_SEL =
    '.swiper-slide-duplicate,.slick-cloned,.owl-item.cloned,.glide__slide--clone,.splide__slide--clone,.flickity-clone,.carousel-clone,.slide-clone,[data-clone="true"],[data-cloned="true"],[class~="clone"],[class~="cloned"],[class*="slide--clone" i],[class*="slide-duplicate" i]';
  const SLIDE_INDEX_SEL = '[data-swiper-slide-index],[data-slick-index],[data-slide-index],[data-slide-number],[data-slide],[aria-label*=" / "][role="group"]';
  function slideIndexOf(el) {
    const s = el && el.closest ? el.closest(SLIDE_INDEX_SEL) : null;
    if (!s) return null;
    let v = null;
    for (const a of ['data-swiper-slide-index', 'data-slick-index', 'data-slide-index', 'data-slide-number', 'data-slide']) {
      if (s.hasAttribute(a)) {
        v = parseInt(s.getAttribute(a), 10);
        break;
      }
    }
    if (v === null) {
      const m = /^(\d+)\s*\/\s*\d+$/.exec(clean(s.getAttribute('aria-label') || '')); // "3 / 13"
      v = m ? parseInt(m[1], 10) : null;
    }
    return v === null || isNaN(v) || v < 0 ? null : { v, box: s.parentElement };
  }
  const isCloneSlide = (el) => !!(el && el.closest && el.closest(CLONE_SEL));
  // list = pictures (or {el}); get = how to reach the picture element
  function inSlideOrder(list, get) {
    const elOf = get || ((x) => x);
    const real = list.filter((x) => !isCloneSlide(elOf(x)));
    const out = (real.length ? real : list).slice();
    // inside each slideshow, the slides that know their number go back in number order
    const groups = new Map();
    out.forEach((x, i) => {
      const s = slideIndexOf(elOf(x));
      if (!s) return;
      if (!groups.has(s.box)) groups.set(s.box, []);
      groups.get(s.box).push({ x, i, v: s.v });
    });
    groups.forEach((g) => {
      if (g.length < 2) return;
      const places = g.map((e) => e.i);
      const sorted = g.slice().sort((a, b) => a.v - b.v || a.i - b.i);
      places.forEach((p, k) => (out[p] = sorted[k].x));
    });
    return out;
  }

  function galleryImages(cfg, info) {
    const byAddress = slideshowByAddress(cfg, info);
    if (byAddress.length >= 2) return { urls: byAddress, how: 'slideshow-address ' + String(cfg.slideshowPattern) };
    for (const sel of toArray(cfg.imageSelectors)) {
      const imgs = [];
      qa(sel).forEach((el) => {
        if (el.tagName === 'IMG') imgs.push(el);
        else qa('img', el).forEach((i) => imgs.push(i));
      });
      const urls = processImages(inSlideOrder(imgs.filter((i) => !inOtherProducts(i))).map(bestImageUrl), cfg);
      if (urls.length) return { urls, how: sel };
    }
    return { urls: [], how: '' };
  }

  function metaImages(cfg) {
    const raw = qa('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"]').map((m) =>
      m.getAttribute('content')
    );
    return processImages(raw, cfg);
  }

  // Smart guess: start at the product name and walk UP the page until we find
  // a box with 2 or more product pictures (the slideshow sits next to the name).
  // Also understands pictures drawn as CSS backgrounds.
  function nearNameImages(cfg) {
    let nameEl = null;
    for (const sel of toArray(cfg.nameSelectors)) {
      nameEl = qa(sel).find((el) => clean(el.textContent).length > 3);
      if (nameEl) break;
    }
    if (!nameEl) return { urls: [], how: '' };
    let node = nameEl;
    for (let i = 0; i < 10 && node && node !== document.body; i++, node = node.parentElement) {
      const raw = inSlideOrder(qa('img', node).filter((i) => !inOtherProducts(i))).map(bestImageUrl);
      qa('[style*="background-image"]', node).forEach((el) => {
        const m = /url\((['"]?)(.*?)\1\)/.exec(el.style.backgroundImage || '');
        if (m && m[2]) raw.push(m[2]);
      });
      const urls = processImages(raw, cfg);
      if (urls.length >= 2) return { urls, how: 'near-name level ' + i };
    }
    return { urls: [], how: '' };
  }

  // SLIDESHOW MODE: only the pictures of the product's own slideshow.
  // SLIDESHOW BY ADDRESS: some brands name every slideshow picture the same way
  // (lg.com: ".../<product folder>/gallery/..."). We take every such address on the page —
  // also the pictures that are still asleep, and addresses only written in the page code —
  // from the product's OWN folder, in slide order (01, 02, 03...). Feature banners, awards and
  // lifestyle photos further down the page live in other folders, so they never get in.
  function slideshowByAddress(cfg, info) {
    const re = cfg.slideshowPattern;
    if (!(re instanceof RegExp)) return [];
    const toks = productTokens(findName(cfg, readJsonLd()).text).filter((t) => t.charAt(0) !== '/');
    const nrm = (u) => String(u).toLowerCase().replace(/[^a-z0-9]/g, '');
    const mine = (u) => toks.some((t) => nrm(u).indexOf(t) !== -1);
    const found = [];
    const seen = new Set();
    const add = (raw, el) => {
      if (!raw) return;
      String(raw)
        .split(/,\s+/)
        .forEach((part) => {
          const u0 = part.trim().split(/\s+/)[0];
          if (!u0 || /^data:/i.test(u0)) return;
          const u = absUrl(u0.replace(/&amp;/g, '&'));
          if (!u || !re.test(u) || seen.has(u)) return;
          seen.add(u);
          found.push({ u, el, other: el ? inOtherProducts(el) && !mine(u) : false, head: !!(el && el.closest && el.closest('head')) });
        });
    };
    const ATTRS = ['src', 'data-src', 'data-lazy-src', 'data-lazy', 'data-original', 'srcset', 'data-srcset', 'data-zoom-image', 'data-large', 'data-full'];
    // copies made by a looping slideshow come last: the real slide keeps its place
    const imgEls = qa('img, source');
    const loopCopies = imgEls.filter((el) => isCloneSlide(el));
    imgEls.filter((el) => !isCloneSlide(el)).concat(loopCopies).forEach((el) => {
      const owner = el.tagName === 'SOURCE' ? el.parentElement || el : el;
      ATTRS.forEach((a) => add(el.getAttribute(a), owner));
    });
    qa('[style*="url("]').forEach((el) => {
      const m = /url\((['"]?)(.*?)\1\)/.exec(el.getAttribute('style') || '');
      if (m) add(m[2], el);
    });
    // addresses only written in the page code (a gallery that builds its pictures later)
    try {
      const html = document.documentElement.innerHTML;
      const rx = /(?:https?:)?\/\/[^"'\s<>()\\]+?\.(?:jpe?g|png|webp|avif)(?:\/jcr:content\/renditions\/[^"'\s<>()\\]+)?(?:\?[^"'\s<>()\\]*)?|\/content\/dam\/[^"'\s<>()\\]+?\.(?:jpe?g|png|webp|avif)(?:\/jcr:content\/renditions\/[^"'\s<>()\\]+)?(?:\?[^"'\s<>()\\]*)?/gi;
      let m;
      let n = 0;
      while ((m = rx.exec(html)) && n++ < 4000) add(m[0], null);
    } catch (e) {
      /* fine */
    }
    const folderOf = (u) => {
      const i = u.search(re);
      return i === -1 ? '' : u.slice(0, i);
    };
    const good = inSlideOrder(found.filter((x) => !x.other && processImages([x.u], cfg).length), (x) => x.el);
    if (info) info.slideshow = { pattern: String(re), found: found.length, good: good.length, other: found.filter((x) => x.other).length };
    if (!good.length) return [];
    // the product's own folder = the folder of the first slide on the page (not the share picture in <head>)
    const first = good.find((x) => x.el && !x.head && mine(x.u)) || good.find((x) => x.el && !x.head) || good.find((x) => mine(x.u)) || good[0];
    const folder = folderOf(first.u);
    let urls = processImages(good.filter((x) => folderOf(x.u) === folder).map((x) => x.u), cfg);
    urls = bySlideNumber(urls);
    if (info) Object.assign(info.slideshow, { folder: folder.slice(-90), kept: urls.length });
    return urls;
  }
  // "...-gallery-2010-01.jpg", "New_DZ2.jpg", "..._z3_020817.jpg": put the slides in their number order
  function bySlideNumber(urls) {
    if (urls.length < 2) return urls;
    const nums = urls.map((u) => {
      let f = String(u).split('?')[0].replace(/\/jcr:content\/.*$/, '');
      try {
        f = decodeURIComponent(f);
      } catch (e) {
        /* fine */
      }
      f = f.split('/').pop().replace(/\.[a-z0-9]+$/i, '');
      return (f.match(/\d+/g) || []).map(Number);
    });
    const len = Math.min.apply(null, nums.map((g) => g.length));
    for (let k = 1; k <= len; k++) {
      const vals = nums.map((g) => g[g.length - k]);
      const distinct = new Set(vals);
      if (distinct.size === vals.length && vals.every((v) => v >= 0 && v <= 99)) {
        return urls
          .map((u, i) => [u, vals[i], i])
          .sort((a, b) => a[1] - b[1] || a[2] - b[2])
          .map((x) => x[0]);
      }
      if (distinct.size > 1) break; // the number that changes is not a slide number
    }
    return urls;
  }

  // The slideshow = the box around the FIRST good picture, grown bigger until it
  // would swallow a section title, a video or the specifications.
  function slideshowImages(cfg, info) {
    const byAddress = slideshowByAddress(cfg, info);
    if (byAddress.length >= 2) return { urls: byAddress, how: 'slideshow-address ' + String(cfg.slideshowPattern) };
    const specBoxes = toArray(cfg.specContainerSelectors)
      .map((s) => {
        try {
          return document.querySelector(s);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
    for (const sel of toArray(cfg.slideshowSelectors || cfg.imageSelectors)) {
      const imgs = [];
      qa(sel).forEach((el) => {
        if (el.tagName === 'IMG') imgs.push(el);
        else qa('img', el).forEach((i) => imgs.push(i));
      });
      const cand = inSlideOrder(imgs.filter((i) => !inOtherProducts(i) && bestImageUrl(i) && processImages([bestImageUrl(i)], cfg).length));
      if (!cand.length) continue;
      let box = cand[0];
      const count = (n) => cand.filter((i) => n.contains(i)).length;
      while (box.parentElement && box.parentElement !== document.body) {
        const up = box.parentElement;
        if (/^(MAIN|BODY|HTML)$/.test(up.tagName)) break;
        if (specBoxes.some((b) => up.contains(b))) break;
        const has = count(box);
        if (has >= 2 && qa('h2,h3,video', up).some((h) => !box.contains(h))) break;
        if (has >= 2 && up.querySelector('h1') && !box.querySelector('h1') && count(up) === has) break;
        box = up;
      }
      let urls = processImages(cand.filter((i) => box.contains(i)).map(bestImageUrl), cfg);
      // the same picture may also exist BIGGER elsewhere (a zoom / lightbox copy): use the big one
      const keyOf = cfg.imageKey || defaultImageKey;
      const big = new Map();
      toArray(cfg.imageSelectors).forEach((s2) => {
        qa(s2).forEach((el) => {
          (el.tagName === 'IMG' ? [el] : qa('img', el)).forEach((i) => {
            if (inOtherProducts(i)) return;
            processImages([bestImageUrl(i)], cfg).forEach((u) => {
              const k = keyOf(u);
              if (!big.has(k) || sizeScore(u) > sizeScore(big.get(k))) big.set(k, u);
            });
          });
        });
      });
      urls = urls.map((u) => {
        const b = big.get(keyOf(u));
        return b && sizeScore(b) > sizeScore(u) ? b : u;
      });
      if (urls.length) return { urls, how: 'slideshow ' + sel };
    }
    return { urls: [], how: '' };
  }

  // Is this an air conditioner or a fan? (only the address, the title and the name: never the menu)
  const COOLING = /climati[sz]|air[-\s]?condition|ventilat|\bfans?\b|brasseur|\bbtu\b|split[-\s]?(mural|system)/i;
  function isCooling(nameText) {
    return COOLING.test(decodeURIComponent(location.pathname) + ' ' + (document.title || '') + ' ' + (nameText || ''));
  }

  // ================================================================
  //  Specification pairs (label + value)
  // ================================================================
  const NICE = (t) => clean(t).replace(/\s*:\s*$/, '');

  // remember WHERE a row sits on the page, without it ever leaving the page
  const withEl = (pair, el) => {
    if (el) Object.defineProperty(pair, 'el', { value: el, enumerable: false, configurable: true });
    return pair;
  };

  function dedupePairs(pairs) {
    const seen = new Set();
    const out = [];
    for (const p of pairs) {
      const label = NICE(p.label);
      const value = clean(p.value);
      if (!label || !value) continue;
      if (label.length > 120 || value.length > 400) continue;
      const k = label.toLowerCase() + '|' + value.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(withEl({ label, value }, p.el));
    }
    return out;
  }

  function pairsFromTables(root) {
    const out = [];
    qa('tr', root).forEach((tr) => {
      const cells = Array.from(tr.children).filter((c) => /^(TD|TH)$/.test(c.tagName));
      const txt = cells.map((c) => readText(c)); // (help texts like "Plus d'informations" left out)
      if (cells.length === 2) {
        out.push(withEl({ label: txt[0], value: txt[1] }, tr));
      } else if (cells.length === 3) {
        // [group | label | value]  or  [label | value | unit]
        const numberish = /^[\d.,\s]+$/.test(txt[1]);
        if (numberish && txt[2].length <= 8) out.push(withEl({ label: txt[0], value: txt[1] + ' ' + txt[2] }, tr));
        else out.push(withEl({ label: txt[1], value: txt[2] }, tr));
      }
    });
    return out;
  }

  function pairsFromDl(root) {
    const out = [];
    qa('dt', root).forEach((dt) => {
      let dd = dt.nextElementSibling;
      while (dd && dd.tagName !== 'DD' && dd.tagName !== 'DT') dd = dd.nextElementSibling;
      if (dd && dd.tagName === 'DD') out.push(withEl({ label: readText(dt), value: readText(dd) }, dt));
    });
    return out;
  }

  function pairsFromLists(root) {
    const out = [];
    qa('li', root).forEach((li) => {
      if (li.querySelector('li')) return;
      const t = readText(li);
      const m = t.match(/^(.{2,90}?)\s*:\s+(.+)$/) || t.match(/^(.{2,90}?)\s*:\s*(\S.*)$/);
      if (m) out.push(withEl({ label: m[1], value: m[2] }, li));
    });
    return out;
  }

  function pairsFromTwoChildRows(root) {
    const leafish = (el) => !el.querySelector('div,table,ul,ol,li,p,section,tr');
    const sig = (el) => el.tagName + '.' + String(el.className || '') + '>' + el.children[0].tagName + '.' + String(el.children[0].className || '');
    const rows = [];
    qa('*', root).forEach((el) => {
      if (el.children.length !== 2) return;
      const a = el.children[0];
      const b = el.children[1];
      if (!leafish(a) || !leafish(b)) return;
      const l = readText(a);
      const v = readText(b);
      if (!l || !v || l.length > 90 || v.length > 200) return;
      if (!el.parentElement) return;
      rows.push({ el, l, v, s: sig(el), p: el.parentElement });
    });
    // a real spec row looks like its neighbours: keep a row when 3+ rows share its shape
    // (so a section with only 1 or 2 lines is still read), or when its box has 3+ rows
    const bySig = new Map();
    const byParent = new Map();
    rows.forEach((r) => {
      bySig.set(r.s, (bySig.get(r.s) || 0) + 1);
      byParent.set(r.p, (byParent.get(r.p) || 0) + 1);
    });
    return rows.filter((r) => bySig.get(r.s) >= 3 || byParent.get(r.p) >= 3).map((r) => withEl({ label: r.l, value: r.v }, r.el));
  }

  // ROWS MADE OF TWO PIECES OF TEXT (label, value), however deep the boxes around them are:
  //   <li><div><p>Volume du congélateur</p></div><div><p>113</p></div></li>
  //   <li><div class="row"><div><strong>Bac à légumes</strong></div><div><span>Oui (2)</span></div></div></li>
  // Help texts for blind readers or in tooltip buttons ("Plus d'informations") are not counted.
  const BLOCK_TAG = /^(DIV|P|LI|UL|OL|DL|DT|DD|TABLE|TBODY|THEAD|TFOOT|TR|TD|TH|H[1-6]|SECTION|ARTICLE|HEADER|FOOTER|ASIDE|FIGURE|FIGCAPTION|BLOCKQUOTE|PRE|FORM|FIELDSET|DETAILS|SUMMARY|LABEL|MAIN|NAV)$/;
  const BLOCK_SEL = 'div,p,li,ul,ol,dl,dt,dd,table,tr,td,th,h1,h2,h3,h4,h5,h6,section,article,header,footer,aside,figure,figcaption,blockquote,pre,form,fieldset,details,summary,label,main,nav';
  const HELPER_TOKEN = /^(blind|sr-only|sr-text|visually-?hidden|visuallyhidden|screen-reader-text|screen-reader-only|a11y|a11y-hidden|hidden-text|hide-text|offscreen|tooltip|tooltip-(content|text|layer|box|body|popup|inner|wrap)|tip-(content|text|layer|box))$/i;
  function skipText(n) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG|BUTTON|SELECT|OPTION|INPUT|TEXTAREA|IMG|PICTURE|VIDEO|AUDIO|IFRAME|CANVAS|OBJECT)$/i.test(n.tagName)) return true;
    const c = typeof n.className === 'string' ? n.className : '';
    return !!c && c.split(/\s+/).some((t) => HELPER_TOKEN.test(t));
  }
  // the text of a box without help texts; if that leaves nothing (the label itself sits in a
  // button or a "tooltip" box), the whole text
  function readText(node) {
    const run = (strict) => {
      let s = '';
      const walk = (n) => {
        if (n.nodeType === 3) s += n.nodeValue;
        else if (n.nodeType === 1 && (strict ? !skipText(n) : !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG)$/i.test(n.tagName))) {
          const gap = BLOCK_TAG.test(n.tagName) || n.tagName === 'BR';
          if (gap) s += ' ';
          n.childNodes.forEach(walk);
          if (gap) s += ' ';
        }
      };
      walk(node);
      return clean(s);
    };
    return run(true) || run(false);
  }
  // the pieces of text of a box (more than `max` pieces: stop counting)
  function textUnits(el, max) {
    const out = [];
    const ownText = Array.prototype.some.call(el.childNodes, (n) => n.nodeType === 3 && /\S/.test(n.nodeValue));
    if (ownText) {
      // words mixed with small tags ("Volume <sup>1</sup>"): one piece per real box
      let buf = '';
      const flush = () => {
        const t = clean(buf);
        if (t) out.push(t);
        buf = '';
      };
      const walk = (n) => {
        if (out.length > max) return;
        if (n.nodeType === 3) buf += n.nodeValue;
        else if (n.nodeType === 1 && !skipText(n)) {
          const block = BLOCK_TAG.test(n.tagName);
          if (block) flush();
          else if (n.tagName === 'BR') buf += ' ';
          n.childNodes.forEach(walk);
          if (block) flush();
        }
      };
      el.childNodes.forEach(walk);
      flush();
      return out;
    }
    for (const c of Array.from(el.children)) {
      if (out.length > max) break;
      if (skipText(c)) continue;
      if (!c.querySelector(BLOCK_SEL)) {
        const t = readText(c);
        if (t) out.push(t);
      } else out.push(...textUnits(c, max - out.length));
    }
    return out;
  }
  function pairsFromTextUnits(root) {
    const cand = [];
    for (const el of qa('li,tr,dl,div', root)) {
      const u = textUnits(el, 2);
      if (u.length !== 2) continue;
      const [l, v] = u;
      if (l.length > 90 || v.length > 200 || l === v || !/[a-zà-ÿ]/i.test(l)) continue;
      cand.push({ el, l, v });
    }
    // the BIGGEST box holding exactly the two texts is the row (not the small boxes inside it)
    const set = new Set(cand.map((c) => c.el));
    const rows = cand.filter((c) => {
      for (let x = c.el.parentElement; x; x = x.parentElement) {
        if (set.has(x)) return false;
        if (x === root) break;
      }
      return !!c.el.parentElement;
    });
    // a real spec row looks like its neighbours: 3+ rows with the same shape, or 3+ rows in the same box
    const sig = (el) => el.tagName + '.' + String(el.className || '') + '>' + (el.firstElementChild ? el.firstElementChild.tagName + '.' + String(el.firstElementChild.className || '') : '');
    const bySig = new Map();
    const byParent = new Map();
    rows.forEach((r) => {
      r.s = sig(r.el);
      bySig.set(r.s, (bySig.get(r.s) || 0) + 1);
      byParent.set(r.el.parentElement, (byParent.get(r.el.parentElement) || 0) + 1);
    });
    return rows.filter((r) => bySig.get(r.s) >= 3 || byParent.get(r.el.parentElement) >= 3).map((r) => withEl({ label: r.l, value: r.v }, r.el));
  }

  function pairsWithRecipeRows(root, cfg) {
    const out = [];
    if (!cfg.specRowSelector) return out;
    qa(cfg.specRowSelector, root).forEach((row) => {
      const l = cfg.specLabelSelector ? row.querySelector(cfg.specLabelSelector) : null;
      const v = cfg.specValueSelector ? row.querySelector(cfg.specValueSelector) : null;
      if (l && !v && cfg.emptyValueAs && clean(l.textContent) && row.children.length === 1) {
        out.push(withEl({ label: l.textContent, value: cfg.emptyValueAs }, row));
      } else if (l && v) {
        let value = v.textContent;
        // a tick mark or icon instead of text means "yes"
        if (!clean(value) && v.querySelector('[class*="check" i], svg, img')) value = 'Oui';
        // a feature listed with no value ("OptiSense®", "Verrouillage d'enfant") = the product has it
        if (!clean(value) && cfg.emptyValueAs && clean(l.textContent)) value = cfg.emptyValueAs;
        out.push(withEl({ label: l.textContent, value }, row));
      }
    });
    return out;
  }

  function pairsFrom(root, cfg, noText) {
    const strategies = [
      ['recipe-rows', () => pairsWithRecipeRows(root, cfg)],
      ['table', () => pairsFromTables(root)],
      ['definition-list', () => pairsFromDl(root)],
      ['bullet-list', () => pairsFromLists(root)],
      ['two-column-rows', () => pairsFromTwoChildRows(root)],
    ];
    let best = { pairs: [], how: '', raw: [] };
    for (const [how, fn] of strategies) {
      const raw = fn().filter((p) => !p.el || !inOtherProducts(p.el));
      const pairs = dedupePairs(raw);
      if (pairs.length >= 3) {
        best = { pairs, how, raw };
        break;
      }
      if (pairs.length > best.pairs.length) best = { pairs, how, raw };
    }
    // rows made of two texts in deeper boxes: when the simple ways found (almost) nothing,
    // or — if the recipe asks ("textRows: 'compare'") — when they found clearly fewer lines
    const compare = cfg.textRows === 'compare';
    if (cfg.textRows !== false && (compare || (!noText && best.pairs.length < 3))) {
      const raw = pairsFromTextUnits(root).filter((p) => !p.el || !inOtherProducts(p.el));
      const pairs = dedupePairs(raw);
      const better = best.pairs.length < 3 ? pairs.length > best.pairs.length : pairs.length >= best.pairs.length * 1.5 + 2;
      if (better) best = { pairs, how: 'text-rows', raw };
    }
    return best;
  }

  const HEADING_RE = /^(caract[ée]ristiques( techniques)?|sp[ée]cifications?( techniques?)?|fiche technique|informations? techniques?|donn[ée]es techniques|d[ée]tails techniques|(toutes les )?sp[ée]cifications( du produit)?|toutes les caract[ée]ristiques|technical specifications?|specifications?|specs)$/i;
  const CLICKABLE =
    'button,[role="tab"],[role="button"],summary,[aria-expanded],h2,h3,h4,li,a[href^="#"],a[href^="javascript"],a[role="tab"],div[class*="tab" i],div[class*="accordion" i],div[class*="collaps" i],span[class*="tab" i]';
  const stripArrows = (t) => clean(t).replace(/[\s+\-−–▼▲▾▴▿▵▸▹›‹»>⌄⌃^˅˄ˇ∨∧⋁⋀︾︽❯❮〉⏷⏶]+$/g, '');

  // titles above a specifications area ("Caractéristiques", "Fiche technique"...) + the recipe's own
  // (lg.com: "Caractéristiques principales", "Voir toutes les caractéristiques")
  function headingCandidates(cfg) {
    const extra = toArray(cfg && cfg.specHeadings);
    return qa('h1,h2,h3,h4,h5,h6,button,summary,[role="tab"],legend,strong,span,p,div,a,li').filter((el) => {
      if (el.childElementCount > 3) return false;
      const t = el.textContent || '';
      if (t.length > 60) return false;
      const s = stripArrows(t);
      return HEADING_RE.test(s) || extra.some((re) => re.test(s));
    });
  }

  // ---------- section (group) titles ----------
  // Spec boxes usually sit under a title like "Dimensions et poids".
  // Returns { title, header }  (header = the bar you click to open the box)
  const isCookie = (el) =>
    !!el.closest('[id*="onetrust" i],[class*="onetrust" i],[id*="cookie" i],[class*="cookie" i],[class*="consent" i]');
  // boxes we must not blindly click open: cookie banner, menus, page header/footer
  const isNoise = (el) => isCookie(el) || !!el.closest('header,nav,footer');

  function guessGroup(el, cfg) {
    const cleanTitle = (x) => stripArrows(x.textContent || '');
    const titleOk = (x) => {
      const t = clean(x.textContent);
      return t && t.length <= 80 && !x.contains(el) && !el.contains(x);
    };
    const before = (x) => (x.compareDocumentPosition(el) & 4) !== 0; // x comes before el

    // a) the recipe says where the title is
    if (cfg.groupTitleSelector) {
      const box = el.closest(cfg.groupBoxSelector || '[class*="ccordion" i],[class*="collaps" i],details,section');
      const h = box && qa(cfg.groupTitleSelector, box).find(titleOk);
      if (h) return { title: cleanTitle(h), header: h };
    }

    // b) inside an accordion box: the closest header bar above the rows
    const box = el.closest('[class*="ccordion" i],[class*="collaps" i],[class*="expand" i],details');
    if (box) {
      const pick = (sel) => {
        const list = qa(sel, box).filter((x) => titleOk(x) && before(x));
        return list[list.length - 1];
      };
      const h = pick('summary,button,[aria-expanded]') || pick('[class*="title" i],[class*="header" i],[class*="head" i],h2,h3,h4,h5');
      if (h) return { title: cleanTitle(h), header: h };
    }

    // c) the box starts with its own title (a heading above the first line): use it,
    //    never a title from far above the box (that can be a marketing block)
    const firstRow = el.querySelector('tr,li,dt,[class*="row" i]');
    const own = qa('h2,h3,h4,h5', el).find((h) => {
      const t = clean(h.textContent);
      return t && t.length <= 80 && !h.querySelector('li,tr') && (!firstRow || (h.compareDocumentPosition(firstRow) & 4) !== 0);
    });
    if (own) return { title: cleanTitle(own), header: own };

    // d) walk up: the title is usually just before the box
    let node = el;
    for (let i = 0; i < 5 && node && node !== document.body; i++, node = node.parentElement) {
      let sib = node.previousElementSibling;
      for (let k = 0; sib && k < 2; k++, sib = sib.previousElementSibling) {
        const t = cleanTitle(sib);
        if (t && t.length <= 80 && qa('tr,li', sib).length < 2) return { title: t, header: sib };
      }
      const p = node.parentElement;
      if (p) {
        const first = Array.from(p.children).find((c) => c !== node && !c.contains(el) && clean(c.textContent));
        if (first && (first.compareDocumentPosition(node) & 4) !== 0) {
          const t = cleanTitle(first);
          if (t && t.length <= 80 && qa('tr,li', first).length < 2) return { title: t, header: first };
        }
      }
    }
    return { title: '', header: null };
  }

  const totalRows = (groups) => groups.reduce((n, g) => n + g.rows.length, 0);

  // One big box with several small headings inside (h3/h4 ... then rows):
  // cut it into pieces at every heading and read each piece on its own.
  // One big box with several titles inside ("Général", "Dimensions" ... as h3 or as
  // accordion buttons): give every row the title that comes just before it.
  const SPLIT_HEADS = 'h2,h3,h4,h5,h6,summary,button[aria-expanded],[role="tab"],[class*="accordion" i][class*="title" i],[class*="accordion" i][class*="header" i]';
  function splitByHeadings(el, cfg, whole) {
    if (/^(table|dl|tbody|tr)$/i.test(el.tagName)) return null;
    if (!whole.length || !whole.every((p) => p.el)) return null;
    let heads = qa(SPLIT_HEADS, el).filter((h) => {
      const t = stripArrows(h.textContent || '');
      return t && t.length <= 80 && !h.querySelector('table,ul,ol,li,dl,tr') && !h.closest('table,dl,li');
    });
    heads = heads.filter((h) => !heads.some((o) => o !== h && o.contains(h))); // a button inside an h3: keep the h3
    // "Voir toutes les caractéristiques", "Afficher plus"... are buttons, not section titles
    heads = heads.filter((h) => !/^(voir|afficher|masquer|cacher|r[ée]duire|plus d|moins d|show|hide|view|see|read|lire|tout voir|fermer|close)\b/i.test(stripArrows(h.textContent || '')));
    heads.sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1)); // page order
    if (heads.length < 2) return null;
    const groups = [];
    const byHead = new Map();
    const before = [];
    for (const p of whole) {
      let owner = null;
      for (const h of heads) {
        if (h.contains(p.el)) continue;
        if (h.compareDocumentPosition(p.el) & 4) owner = h; // h comes before the row
        else break;
      }
      if (!owner) {
        before.push(p);
        continue;
      }
      if (!byHead.has(owner)) {
        byHead.set(owner, []);
        groups.push({ title: stripArrows(owner.textContent), header: owner, rows: byHead.get(owner), how: 'split-at-titles' });
      }
      byHead.get(owner).push(p);
    }
    if (!groups.length) return null;
    groups.forEach((g) => (g.rows = dedupePairs(g.rows)));
    if (before.length) {
      before.splice(0, before.length, ...dedupePairs(before));
      const g = guessGroup(el, cfg);
      groups.unshift({ title: g.title, header: g.header, rows: before, how: 'split-at-titles' });
    }
    return groups;
  }

  function groupsFromContainers(els, cfg) {
    const groups = [];
    const done = [];
    for (const el of els) {
      if (done.some((d) => d.contains(el))) continue; // already inside a box we read
      const r = pairsFrom(el, cfg);
      if (!r.pairs.length) continue;
      const split = splitByHeadings(el, cfg, r.raw || r.pairs);
      if (split) {
        groups.push(...split);
        done.push(el);
        continue;
      }
      const g = guessGroup(el, cfg);
      groups.push({ title: g.title, header: g.header, rows: r.pairs, how: r.how });
      done.push(el);
    }
    return groups;
  }

  // one box that may hold several tables -> one section per table
  function groupsFor(node, cfg, r) {
    const tables = qa('table', node);
    if (tables.length >= 2) {
      const gs = groupsFromContainers(tables, cfg);
      if (totalRows(gs) >= r.pairs.length * 0.8) return gs;
    }
    // the recipe says the box has its section titles inside (lg.com: "CAPACITÉ", "DIMENSIONS ET POIDS"...)
    if (cfg.splitUnderHeading) {
      const split = splitByHeadings(node, cfg, r.raw || r.pairs);
      if (split && totalRows(split) >= r.pairs.length * 0.8) return split;
    }
    return [{ title: '', header: null, rows: r.pairs, how: r.how }];
  }

  function findSpecs(cfg) {
    let best = { groups: [], how: '' };
    const consider = (groups, how) => {
      if (totalRows(groups) > totalRows(best.groups)) best = { groups, how };
    };
    const finish = (b) => ({
      groups: b.groups,
      pairs: dedupePairs(b.groups.flatMap((g) => g.rows)),
      how: b.how,
    });

    // 1) the recipe says exactly where the rows are (each box = one section)
    for (const sel of toArray(cfg.specContainerSelectors)) {
      const groups = groupsFromContainers(qa(sel), cfg);
      const how = 'recipe-container ' + sel + ' → ' + (groups[0] ? groups[0].how : '');
      if (totalRows(groups) >= 3) return finish({ groups, how });
      consider(groups, how);
    }

    // 2) find the "Caractéristiques" heading and climb up until we see rows
    //    (first with tables / lists / simple rows only; rows in deeper boxes only if that finds nothing)
    const heads = headingCandidates(cfg);
    for (const pass of [true, false]) {
      if (!pass && totalRows(best.groups) >= 3) break;
      for (const h of heads) {
        let node = h.parentElement;
        for (let i = 0; i < 7 && node; i++, node = node.parentElement) {
          const r = pairsFrom(node, cfg, pass);
          if (r.pairs.length >= 3) {
            consider(groupsFor(node, cfg, r), 'under-heading → ' + r.how);
            break;
          }
          if (node === document.body) break;
        }
      }
    }
    if (totalRows(best.groups) >= 3 || cfg.specsBoxOnly) return finish(best);

    // 3) boxes whose class name talks about specs / properties / technical / caractéristiques
    const boxes = qa('[class*="spec" i],[class*="propert" i],[class*="techn" i],[class*="caract" i]').slice(0, 60);
    for (const pass of [true, false]) {
      if (!pass && totalRows(best.groups) >= 3) break;
      for (const box of boxes) {
        const r = pairsFrom(box, cfg, pass);
        if (r.pairs.length) consider(groupsFor(box, cfg, r), 'class-name-guess → ' + r.how);
      }
    }
    if (totalRows(best.groups) >= 3) return finish(best);

    // 4) last chance: every table / list on the page
    const all = groupsFromContainers(qa('table,dl'), cfg);
    consider(all, 'tables-on-page');
    return finish(best);
  }

  // Keeps everything we ever saw, section by section, even if the page
  // closes a box when we open the next one.
  function makeAccumulator() {
    const map = new Map(); // title -> { title, rows: Map, strong }
    const api = {
      // strong = found where the RECIPE says the specs are (better than a guess)
      add(groups, strong) {
        groups.forEach((g) => {
          const title = g.title || '';
          if (!map.has(title)) map.set(title, { title, rows: new Map(), strong: false });
          if (strong) map.get(title).strong = true;
          g.rows.forEach((r) => map.get(title).rows.set(r.label.toLowerCase() + '|' + r.value.toLowerCase(), r));
        });
      },
      groups() {
        const titled = new Set();
        map.forEach((g) => {
          if (g.title) g.rows.forEach((_, k) => titled.add(k));
        });
        const out = [];
        // once the recipe's own place gave sections, forget the early guesses
        const anyStrong = Array.from(map.values()).some((g) => g.strong);
        map.forEach((g) => {
          if (anyStrong && !g.strong) return;
          const rows = Array.from(g.rows.entries())
            .filter(([k]) => g.title || !titled.has(k))
            .map(([, r]) => r);
          if (rows.length) out.push({ title: g.title, rows });
        });
        return out;
      },
      count() {
        return api.groups().reduce((n, g) => n + g.rows.length, 0);
      },
    };
    return api;
  }

  // One shared "clicker" so nothing is clicked twice (a second click would CLOSE a box).
  function makeClicker() {
    const done = [];
    const keys = new Set();
    return {
      seen(el) {
        return done.some((x) => x === el || x.contains(el) || el.contains(x));
      },
      async click(el, wait) {
        if (!el || typeof el.click !== 'function') return false;
        if (done.some((x) => x === el || x.contains(el) || el.contains(x))) return false;
        if (el.getAttribute('aria-expanded') === 'true' || el.getAttribute('aria-selected') === 'true') return false;
        const label = clean(el.textContent).slice(0, 60);
        const key = label ? el.tagName + '|' + label : '';
        if (key && keys.has(key)) return false; // same bar after the page redrew itself
        done.push(el);
        if (key) keys.add(key);
        try {
          el.click();
        } catch (e) {
          return false;
        }
        await settle(wait || 450);
        return true;
      },
      count() {
        return done.length;
      },
    };
  }

  // Open EVERY closed accordion box on the page (not the cookie banner or menus).
  async function openAccordions(clicker, harvest) {
    const sel =
      '[aria-expanded="false"],details:not([open]) > summary,[class*="ccordion" i][class*="header" i],[class*="ccordion" i][class*="title" i],[class*="ccordion" i][class*="toggle" i],[class*="ccordion" i] > button';
    const skipped = new Set();
    for (let i = 0; i < 30; i++) {
      const el = qa(sel).find((e) => !isNoise(e) && !skipped.has(e) && !clicker.seen(e));
      if (!el) break;
      const ok = await clicker.click(el, 350);
      if (!ok) skipped.add(el); // could not click it: do not try again
      harvest();
    }
  }

  // Click the title bar of every spec section we found, in case it is still closed.
  async function openGroupHeaders(clicker, harvest, getHeaders) {
    // only titles that look CLOSED (clicking an open one would close it, and costs time)
    const looksClosed = (h) => {
      if (h.getAttribute('aria-expanded') === 'false') return true;
      const btn = h.querySelector && h.querySelector('[aria-expanded="false"]');
      if (btn) return true;
      if (/(^|\s|-)(collapsed|closed|is-closed)(\s|$)/i.test(String(h.className || ''))) return true;
      const next = h.nextElementSibling;
      if (next) {
        if (next.hidden) return true;
        try {
          const cs = window.getComputedStyle(next);
          if (cs.display === 'none' || cs.visibility === 'hidden' || (cs.maxHeight === '0px' && cs.overflow === 'hidden')) return true;
        } catch (e) {
          /* ignore */
        }
      }
      return false;
    };
    for (const h of getHeaders()) {
      if (!h || isNoise(h) || !looksClosed(h)) continue;
      if (await clicker.click(h, 350)) harvest();
    }
  }

  // From a list of elements keep only the innermost ones (a wrapper that merely
  // contains the title is not the thing to click; the title bar itself is).
  const innermost = (list) => list.filter((el) => !list.some((o) => o !== el && el.contains(o)));

  // Click on "Caractéristiques" tabs / boxes that hide the table.
  async function tryExpand(cfg, clicker, enough) {
    const res = [
      HEADING_RE,
      /^(voir|afficher|d[ée]couvrir) (toutes )?(les )?(caract[ée]ristiques|sp[ée]cifications|d[ée]tails)/i,
      ...toArray(cfg.expandText),
    ];
    const matches = innermost(
      qa(CLICKABLE).filter((el) => {
        const t = stripArrows(el.textContent || '');
        return t && t.length <= 60 && res.some((r) => r.test(t));
      })
    );
    for (const el of matches) {
      if (await clicker.click(el, 600) && enough()) return true;
    }
    return false;
  }

  // Click EVERY button/tab/box the recipe lists, even if some specs are already
  // visible (for pages that show only a few specs until you click "see all").
  async function clickAll(cfg, clicker, harvest, count, left) {
    const res = toArray(cfg.alwaysClick);
    if (!res.length) return 0;
    // some pages build the full list a moment AFTER the click (they download it first):
    // with a recipe that asks for it, wait a little while we still have only a few lines
    const waitMs = typeof cfg.alwaysClickWait === 'number' ? cfg.alwaysClickWait : 0;
    const enough = cfg.fullListMin || 12;
    let n = 0;
    const matches = innermost(
      qa(CLICKABLE + ',div,span,p,h5,h6').filter((el) => {
        if (el.childElementCount > 3 || isCookie(el)) return false;
        const t = stripArrows(el.textContent || '');
        return t && t.length <= 60 && res.some((r) => r.test(t));
      })
    );
    for (const el of matches) {
      const before = count ? count() : 0;
      if (await clicker.click(el, 500)) {
        n++;
        harvest();
        if (waitMs && count && count() < enough) {
          const t1 = Date.now();
          const until = Math.min(waitMs, left ? left() : waitMs);
          while (Date.now() - t1 < until) {
            await sleep(250);
            harvest();
            if (count() >= before + 3) break;
          }
        }
      }
    }
    return n;
  }

  // ================================================================
  //  Scrolling (some pages build their tables only when you scroll)
  // ================================================================
  async function scrollThrough(maxMs) {
    const t0 = Date.now();
    try {
      const step = Math.max(400, Math.round((window.innerHeight || 800) * 0.8));
      let y = 0;
      while (y < document.documentElement.scrollHeight && Date.now() - t0 < maxMs) {
        window.scrollTo(0, y);
        await sleep(110);
        y += step;
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(150);
      window.scrollTo(0, 0);
    } catch (e) {
      /* scrolling is only a helper */
    }
  }

  // ================================================================
  //  Text pieces: name and price
  // ================================================================
  // Text of the name, keeping a space between pieces that sit in separate boxes
  // (some sites glue "Série 3" + "HDPR3618" + "A++" together in their title).
  function nameText(el) {
    const parts = [];
    const walk = (n) => {
      if (n.nodeType === 3) parts.push(n.nodeValue);
      else if (n.nodeType === 1 && !/^(script|style|svg|button)$/i.test(n.tagName)) {
        const block = /^(div|p|span|small|strong|b|em|i|sup|sub|br|h\d|li)$/i.test(n.tagName);
        if (block) parts.push(' ');
        n.childNodes.forEach(walk);
        if (block) parts.push(' ');
      }
    };
    walk(el);
    return parts.join('');
  }
  // remove star-rating leftovers like "0.0 (0)" or "4,5 (12 avis)" at the end of a name
  const cleanName = (t) =>
    clean(t)
      .replace(/(?:\s+\d|\s*\d[.,]\d)\s*\(\d+(?:\s*avis)?\)\s*$/i, '')
      .trim();

  function findName(cfg, ld) {
    for (const sel of toArray(cfg.nameSelectors)) {
      for (const el of qa(sel)) {
        const t = cleanName(nameText(el));
        if (t.length > 3) return { text: t, how: sel };
      }
    }
    if (ld.name) return { text: ld.name, how: 'json-ld' };
    const og = document.querySelector('meta[property="og:title"]');
    if (og && clean(og.getAttribute('content'))) return { text: clean(og.getAttribute('content')), how: 'og:title' };
    return { text: '', how: '' };
  }

  // ---- prices that are NOT the price to pay: crossed out, "old price", "you save 200 DH", per month...
  // ("regular" is not in the list: some shops call their normal price "price--regular")
  const BAD_PRICE_PART = /^(old|was|before|original|strike|striked|strikethrough|crossed|barre|barree|ancien|ancienne|saving|savings|save|installment|installments|monthly|mensuel|mensualite|through)$/i;
  function badPriceClass(el) {
    const c = typeof el.className === 'string' ? el.className : '';
    if (!c) return false;
    return c.split(/\s+/).some((tok) => {
      const parts = tok
        .split(/[-_]+|(?=[A-Z][a-z])/)
        .map((x) => x.toLowerCase())
        .filter(Boolean);
      return parts.some((x) => BAD_PRICE_PART.test(x)) || (parts.indexOf('list') !== -1 && parts.indexOf('price') !== -1);
    });
  }
  function crossedOut(x) {
    if (/^(S|DEL|STRIKE)$/i.test(x.tagName)) return true;
    try {
      const view = (x.ownerDocument && x.ownerDocument.defaultView) || null;
      if (!view) return false; // a page read as text: no styles
      const cs = view.getComputedStyle(x);
      return !!cs && /line-through/.test((cs.textDecorationLine || '') + ' ' + (cs.textDecoration || ''));
    } catch (e) {
      return false;
    }
  }
  const NOT_TO_PAY = /[ée]conomi[sz]|\bsave\b|\bsaving|vous gagnez|\/\s*mois|par mois|x\s*\d+\s*fois|[ée]co-?(part|taxe|participation)|\bdeee\b|participation|[àa] partir de\s*\d+[.,]?\d*\s*(dh|mad|€)?\s*\/|mensualit/i;
  // the first price to PAY inside a box: every small piece holding a price is judged on its own
  // (a box "6.599,00DH 6.399,00DH Économiser 200,00DH" gives 6.399,00DH when 6.599 is crossed out)
  function priceToPayIn(box) {
    if (crossedOut(box) || badPriceClass(box)) return null;
    for (let x = box.parentElement, i = 0; x && i < 2; x = x.parentElement, i++) if (crossedOut(x)) return null;
    const pieces = [box].concat(qa('*', box)).filter((x) => {
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG|OPTION|SELECT)$/i.test(x.tagName)) return false;
      const t = readText(x);
      return t && t.length <= 60 && firstPrice(t);
    });
    const leaves = pieces.filter((x) => !pieces.some((y) => y !== x && x.contains(y)));
    for (const leaf of leaves) {
      let bad = false;
      for (let x = leaf; x && x !== box; x = x.parentElement) {
        if (crossedOut(x) || badPriceClass(x)) {
          bad = true;
          break;
        }
      }
      if (bad) continue;
      const own = readText(leaf);
      // the words around it ("Économiser" in a box next to it): only when that box holds no other price
      const par = leaf.parentElement && leaf !== box ? readText(leaf.parentElement) : '';
      const around = par && (par.match(new RegExp(PRICE_RE.source, 'gi')) || []).filter((m) => firstPrice(m)).length <= 1 ? par : own;
      if (NOT_TO_PAY.test(own) || NOT_TO_PAY.test(around)) continue;
      const text = firstPrice(own);
      const value = text ? toNumber(text) : NaN;
      if (text && value > 0) return { text, value };
    }
    return null;
  }

  // Smart guess: the first "123,45 €" next to the product name that is not
  // crossed out, not a monthly price and not an eco-fee.
  function nearNamePrice(cfg) {
    let nameEl = null;
    for (const sel of toArray(cfg.nameSelectors)) {
      nameEl = qa(sel).find((el) => clean(el.textContent).length > 3);
      if (nameEl) break;
    }
    if (!nameEl) return null;
    const BAD_CLASS = /(^|[\s_-])(old|regular|was|before)([\s_-]|$)|old-?price|price-?old|strike|crossed|list-?price|original|savings|discount|installment|monthly/i;
    let node = nameEl;
    for (let i = 0; i < 7 && node && node !== document.body; i++, node = node.parentElement) {
      for (const el of qa('*', node)) {
        if (el.children.length > 2) continue;
        const own = clean(el.textContent);
        if (!own || own.length > 25) continue;
        if (el.closest('s,del,strike')) continue;
        if (crossedOut(el) || (el.parentElement && crossedOut(el.parentElement))) continue; // crossed out by the page's style
        if (inOtherProducts(el)) continue; // the price of a "similar product" card
        if (typeof el.className === 'string' && (BAD_CLASS.test(el.className) || badPriceClass(el))) continue;
        const around = clean(el.parentElement ? el.parentElement.textContent : '').slice(0, 80);
        if (/\/\s*mois|par mois|x\s*\d+\s*fois|[ée]co|deee|participation|economis|économis|\bsave\b/i.test(around)) continue;
        const text = firstPrice(own);
        const value = text ? toNumber(text) : NaN;
        if (text && value > 0 && /[€$£]|EUR|MAD|DH/i.test(text)) return { text, value, how: 'near-name level ' + i };
      }
    }
    return null;
  }

  function findPrice(cfg, ld) {
    const sources = toArray(cfg.priceFrom).slice();
    if (!sources.includes('nearName')) sources.push('nearName'); // safety net for every recipe
    for (const source of sources) {
      if (source === 'nearName') {
        const hit = nearNamePrice(cfg);
        if (hit) return hit;
        continue;
      }
      if (source === 'dom') {
        for (const sel of toArray(cfg.priceSelectors)) {
          for (const el of qa(sel)) {
            if (el.getAttribute('content')) {
              // <meta itemprop="price" content="6399.00">
              const text = firstPrice(el.getAttribute('content')) || (/^\d+([.,]\d+)?$/.test(el.getAttribute('content').trim()) ? el.getAttribute('content').trim() : '');
              const value = text ? toNumber(text) : NaN;
              if (text && value > 0 && (el.tagName === 'META' || !inOtherProducts(el))) return { text, value, how: sel };
              continue;
            }
            if (inOtherProducts(el)) continue; // price of another product
            const hit = priceToPayIn(el); // not a crossed-out "old price", not "Économiser 200 DH"
            if (hit) return { text: hit.text, value: hit.value, how: sel };
          }
        }
      } else if (source === 'jsonld' && ld.price) {
        const value = Number(ld.price);
        if (value > 0) return { text: ld.price + (ld.currency ? ' ' + ld.currency : ''), value, how: 'json-ld' };
      }
    }
    return { text: '', value: null, how: '' };
  }

  // ================================================================
  //  Report for the helper (me) when something looks wrong
  // ================================================================
  function diagnose(ld) {
    const hints = new Map();
    qa('[class]').forEach((el) => {
      String(el.getAttribute('class'))
        .split(/\s+/)
        .forEach((c) => {
          if (/spec|caract|gallery|carousel|thumb|swiper|slick|price|productName|productImage|accordion|tab/i.test(c)) {
            hints.set(c, (hints.get(c) || 0) + 1);
          }
        });
    });
    const chain = (el, n) => {
      const out = [];
      let x = el;
      for (let i = 0; i < n && x && x !== document.body; i++, x = x.parentElement) {
        const cls = typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
        out.push(x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + cls + ' [' + qa('img', x).length + ' img, ' + qa('tr', x).length + ' tr, ' + qa('li', x).length + ' li]');
      }
      return out;
    };
    const up = (el, n) => {
      let x = el;
      for (let i = 0; i < n && x.parentElement && x.parentElement !== document.body; i++) x = x.parentElement;
      return x;
    };
    const snippet = (el, max) => {
      if (!el) return '';
      const c = el.cloneNode(true);
      qa('script,style,svg,noscript,path', c).forEach((n) => n.remove());
      return c.outerHTML
        .replace(/="([^"]{110,})"/g, (m, v) => '="' + v.slice(0, 110) + '…"')
        .replace(/\s+/g, ' ')
        .slice(0, max);
    };

    const h1 = qa('h1')[0];
    const imgs = qa('img')
      .map((img) => ({ img, src: bestImageUrl(img) }))
      .filter((x) => x.src && !/^data:/i.test(x.src) && !/\.svg(\?|$)/i.test(x.src));
    const bigImgs = imgs
      .filter((x) => (x.img.naturalWidth || parseInt(x.img.getAttribute('width'), 10) || 0) >= 150 || /vtexassets|vteximg|arquivos/i.test(x.src))
      .slice(0, 12);
    const heads = headingCandidates().slice(0, 5);

    return {
      pageTitle: document.title,
      h1: qa('h1')
        .slice(0, 3)
        .map((e) => clean(e.textContent).slice(0, 100)),
      hasJsonLdProduct: !!ld.has,
      jsonLdImages: ld.images.length,
      tables: qa('table').length,
      definitionLists: qa('dl').length,
      images: qa('img').length,
      nameChain: h1 ? chain(h1, 8) : [],
      bigImages: bigImgs.map((x) => ({
        src: x.src.slice(0, 160),
        alt: clean(x.img.getAttribute('alt') || '').slice(0, 60),
        where: chain(x.img, 4),
      })),
      specHeadings: heads.map((h) => ({ text: clean(h.textContent), where: chain(h, 6) })),
      tableList: qa('table')
        .slice(0, 6)
        .map((t) => ({
          class: typeof t.className === 'string' ? t.className.slice(0, 80) : '',
          rows: qa('tr', t).length,
          firstRows: qa('tr', t)
            .slice(0, 3)
            .map((tr) => Array.from(tr.children).map((c) => clean(c.textContent).slice(0, 40)).join(' | ')),
        })),
      htmlAroundSpecs: heads[0] ? snippet(up(heads[0], 2), 2500) : '',
      htmlBiggestTable: snippet(
        qa('table').sort((a, b) => qa('tr', b).length - qa('tr', a).length)[0],
        3000
      ),
      htmlSpecClassBox: snippet(
        qa('[class*="spec" i],[class*="caract" i]').find((el) => qa('*', el).length > 5),
        3000
      ),
      htmlAroundGallery: snippet(bigImgs[0] ? up(bigImgs[0].img, 3) : h1 ? up(h1, 4) : null, 3000),
      classHints: Array.from(hints.entries())
        .slice(0, 60)
        .map(([c, n]) => c + ' x' + n),
    };
  }

  // ================================================================
  //  The generic recipe (used when no brand recipe matches)
  // ================================================================
  const GENERIC = {
    id: 'generic',
    brand: 'Unknown website',
    match: [],
    nameSelectors: ['h1'],
    priceFrom: ['dom', 'jsonld'],
    priceSelectors: ['[itemprop="price"]', '[class*="sellingPrice" i]', '[class*="selling-price" i]', '[class*="current-price" i]', '[class*="price" i]'],
    imagePriority: ['gallery', 'jsonld', 'nearName', 'meta'],
    imageSelectors: [
      '[class*="productImage" i] img, [class*="product-image" i] img, [class*="product-gallery" i] img',
      '[class*="gallery" i] img',
      '.swiper-slide img, .slick-slide img, [class*="carousel" i] img',
    ],
    specContainerSelectors: [],
    expandText: [],
  };
  G.register(GENERIC);

  G.pickRecipe = function (hostname) {
    const h = String(hostname || '').toLowerCase();
    return (
      Object.values(G.recipes).find(
        (r) => r.id !== 'generic' && toArray(r.match).some((m) => h.includes(String(m).toLowerCase()))
      ) || null
    );
  };

  // ================================================================
  //  THE MAIN JOB
  // ================================================================
  // "Quick read": the page was downloaded as plain text (no window, no scripts),
  // so there is nothing to wait for, scroll or click. These do nothing then.
  const _sleep = sleep;
  const _waitUntil = waitUntil;
  const _scrollThrough = scrollThrough;
  const _clickAll = clickAll;
  const _openAccordions = openAccordions;
  const _openGroupHeaders = openGroupHeaders;
  const _tryExpand = tryExpand;

  G.run = async function (options) {
    const fast = !!(options && options.static);
    const nothing = async () => 0;
    const sleep = fast ? nothing : _sleep;
    const waitUntil = fast ? async (test) => test() : _waitUntil;
    const scrollThrough = fast ? nothing : _scrollThrough;
    const clickAll = fast ? nothing : _clickAll;
    const openAccordions = fast ? nothing : _openAccordions;
    const openGroupHeaders = fast ? nothing : _openGroupHeaders;
    const tryExpand = fast ? async () => false : _tryExpand;
    const t0 = Date.now();
    const budget = (options && options.timeoutMs) || 35000;
    const left = () => Math.max(0, budget - (Date.now() - t0));
    const warnings = [];
    const debug = { mode: fast ? 'quick-read' : 'window' };

    const forced = options && options.recipeId && options.recipeId !== 'auto' && options.recipeId !== 'generic' ? G.recipes[options.recipeId] : null;
    const picked = forced || G.pickRecipe(location.hostname);
    const cfg = Object.assign({}, GENERIC, picked || {});
    EXTRA_OTHER = toArray(cfg.otherProductsSelectors).join(',');
    debug.recipe = picked ? picked.id + (forced ? ' (chosen by you)' : '') : 'generic (no brand recipe matched)';
    if (!picked) {
      warnings.push('I do not have a recipe for this website yet, so I used the general method. Please check every result.');
    }

    const timeline = (debug.timeline = []);
    const mark = (what) => timeline.push(what + ' ' + (Date.now() - t0) + 'ms');

    // 0. a "page not found" page: stop at once (no need to wait 30 seconds)
    const looks404 = () =>
      /(^|\D)404(\D|$)|introuvable|n.existe (plus|pas)|page not found|non trouv[ée]e|plus disponible sur ce site/i.test(
        document.title + ' ' + qa('h1').map((h) => h.textContent).join(' ')
      ) && !readJsonLd().has;
    if (looks404()) {
      await sleep(400);
      if (looks404()) {
        return { ok: false, notFound: true, url: location.href, error: 'This page does not exist (404). The product was probably removed from the website.', warnings: [], debug: { page: { pageTitle: document.title } } };
      }
    }

    // 1. wait until the page has at least a product name
    await waitUntil(() => findName(cfg, readJsonLd()).text, Math.min(document.readyState === 'complete' ? 8000 : 15000, left()), 150);
    mark('name');
    await sleep(150);

    // SLIDESHOW MODE (air conditioners & fans by default, or every product if chosen):
    //   'specs'   = pictures from the slideshow only + specifications from the specs box only
    //   'nospecs' = pictures from the slideshow only, no specifications at all
    const setting = (options && options.slideshowMode) || 'ac-specs';
    let slideMode = '';
    if (setting === 'all-specs') slideMode = 'specs';
    else if (setting === 'all-nospecs') slideMode = 'nospecs';
    else if (setting !== 'off') {
      // you chose the type (fridge, air conditioner...) -> that decides; otherwise the page's words do
      const told = String((options && options.productType) || '');
      const nm = findName(cfg, readJsonLd()).text;
      const cooling = told ? /^(ac|fan)$/.test(told) : isCooling(nm) || (cfg.slideshowFor && cfg.slideshowFor.test(location.pathname));
      if (cooling) slideMode = setting === 'ac-nospecs' ? 'nospecs' : 'specs';
      debug.toldType = told || 'no';
    }
    if (slideMode) cfg.specsBoxOnly = true;
    debug.slideshowMode = slideMode || 'off';


    // 2. scroll down so lazy pieces get built — but only when something is still missing
    //    (scrolling a page that is already complete is wasted time)
    const lazyLeft = () =>
      toArray(cfg.imageSelectors).some((sel) =>
        qa(sel).some((el) => (el.tagName === 'IMG' ? [el] : qa('img', el)).some((img) => !bestImageUrl(img)))
      );
    const quickSpecs = slideMode === 'nospecs' ? { pairs: [1, 2, 3] } : findSpecs(cfg);
    const quickPics = (slideMode ? slideshowImages(cfg) : galleryImages(cfg)).urls.length;
    if (quickSpecs.pairs.length >= 3 && quickPics >= 2 && !lazyLeft()) {
      mark('no-scroll-needed');
    } else {
      await scrollThrough(Math.min(4000, left()));
      mark('scroll');
    }

    // 3. specs: find them, open every box (the recipe's buttons, every closed
    //    accordion, every section title), and keep everything we see, section by section
    const acc = makeAccumulator();
    const clicker = makeClicker();
    let specs = { groups: [], pairs: [], how: '' };
    const harvest = () => {
      if (slideMode === 'nospecs') return specs; // this mode takes no specifications
      specs = findSpecs(cfg);
      acc.add(specs.groups, /^recipe-container/.test(specs.how || ''));
      return specs;
    };
    harvest();
    mark('first-read');
    debug.clickedBoxes = 0;
    const wantSpecs = slideMode !== 'nospecs';
    if (wantSpecs && toArray(cfg.alwaysClick).length) debug.clickedBoxes += await clickAll(cfg, clicker, harvest, () => acc.count(), left);
    mark('buttons');
    if (wantSpecs && cfg.openAccordions !== false) {
      await openAccordions(clicker, harvest);
      mark('accordions');
      await openGroupHeaders(clicker, harvest, () => specs.groups.map((g) => g.header));
      mark('section-titles');
    }
    harvest();
    if (wantSpecs && acc.count() < 3) {
      await tryExpand(cfg, clicker, () => (harvest(), acc.count() >= 3));
    }
    if (wantSpecs && acc.count() < 3) {
      await waitUntil(() => (harvest(), acc.count() >= 3), Math.min(9000, left()), 500);
    }
    if (wantSpecs && acc.count() < 3) {
      await scrollThrough(Math.min(3000, left()));
      await tryExpand(cfg, clicker, () => (harvest(), acc.count() >= 3));
      harvest();
    }
    const specGroups = acc.groups();
    // a section "named" after the product (or without a name) gets a plain title
    const nameNow = findName(cfg, readJsonLd()).text;
    specGroups.forEach((g) => {
      if (/enter headline|headline here|lorem ipsum|^titre$|^title$/i.test(g.title || '')) g.title = cfg.defaultGroupTitle || 'Caractéristiques';
      if (!g.title || g.title === nameNow || g.title.length > 70) g.title = cfg.defaultGroupTitle || g.title || '';
      if (g.title === nameNow) g.title = '';
    });
    // "N/A", "-" mean nothing for a shop: drop those lines
    const DROP = cfg.dropValues === false ? null : cfg.dropValues || /^(n\/?a|n\.a\.|-+|—|–)$/i;
    if (DROP) {
      specGroups.forEach((g) => (g.rows = g.rows.filter((r) => !DROP.test(String(r.value || '').trim()))));
      for (let i = specGroups.length - 1; i >= 0; i--) if (!specGroups[i].rows.length) specGroups.splice(i, 1);
    }
    // some sites print the whole list twice (once with titles, once without):
    // a line already shown in an earlier section is not repeated in a later one
    if (cfg.dedupeAcrossSections) {
      const shown = new Set();
      specGroups.forEach((g) => {
        g.rows = g.rows.filter((r) => {
          const k = r.label.toLowerCase() + '|' + r.value.toLowerCase();
          if (shown.has(k)) return false;
          shown.add(k);
          return true;
        });
      });
      for (let i = specGroups.length - 1; i >= 0; i--) if (!specGroups[i].rows.length) specGroups.splice(i, 1);
    }
    const specRows = [];
    const seenRows = new Set();
    specGroups.forEach((g) =>
      g.rows.forEach((r) => {
        const k = r.label.toLowerCase() + '|' + r.value.toLowerCase();
        if (!seenRows.has(k)) {
          seenRows.add(k);
          specRows.push(r);
        }
      })
    );
    debug.clicks = clicker.count();

    mark('specs-done');
    // 4. images: wait a little if none are there yet
    const pickGallery = () => (slideMode ? slideshowImages(cfg, debug) : galleryImages(cfg, debug));
    let gallery = pickGallery();
    const enoughPictures = () =>
      (gallery = pickGallery()).urls.length >= 2 ||
      readJsonLd().images.length >= 2 ||
      nearNameImages(cfg).urls.length >= 2;
    if (!enoughPictures()) {
      // pictures still asleep? (an <img> with its real address waiting in data-src)
      const sleeping = () =>
        qa('img').some((i) => {
          const later = i.getAttribute('data-src') || i.getAttribute('data-lazy-src') || i.getAttribute('data-original') || i.getAttribute('data-lazy');
          const now = i.getAttribute('src') || '';
          return later && (!now || /^data:|placeholder|blank|spacer|loading/i.test(now));
        });
      // one picture and nothing asleep = a product with only one picture: do not wait long
      const short = gallery.urls.length >= 1 && !sleeping();
      await scrollThrough(Math.min(short ? 900 : 2500, left())); // wake up lazy pictures once more
      await waitUntil(enoughPictures, Math.min(short ? 1200 : 6000, left()), short ? 300 : 400);
    }

    // 5. read everything
    const ld = readJsonLd();
    const name = findName(cfg, ld);
    const noPrice = typeof cfg.noPrice === 'function' ? !!cfg.noPrice(location.hostname.replace(/\.localhost$/, ''), location.pathname) : !!cfg.noPrice;
    let price = noPrice ? { text: '', value: null, how: 'this website shows no real price' } : findPrice(cfg, ld);
    // some pages add the price a moment after they open (lg.com/ma asks its shop for it): wait a little
    if (!noPrice && !price.value && !fast && cfg.waitForPrice) {
      const ms = typeof cfg.waitForPrice === 'function' ? cfg.waitForPrice(location.hostname.replace(/\.localhost$/, ''), location.pathname) : cfg.waitForPrice;
      if (ms > 0) {
        await waitUntil(() => (price = findPrice(cfg, readJsonLd())).value, Math.min(ms, left()), 250);
        debug.waitedForPrice = ms;
      }
    }

    const near = nearNameImages(cfg);
    const sets = {
      gallery: gallery.urls,
      jsonld: processImages(ld.images, cfg),
      nearName: near.urls,
      meta: metaImages(cfg),
    };
    // every recipe gets the smart guess as a safety net, even if it forgot to list it
    // slideshow mode: the slideshow first; the box next to the name and the share picture only if there is no slideshow
    const order = slideMode ? ['gallery', 'jsonld', 'meta'] : toArray(cfg.imagePriority).slice();
    if (!slideMode && !order.includes('nearName')) order.splice(Math.max(0, order.indexOf('meta')), 0, 'nearName');
    let chosen = order.find((k) => sets[k] && sets[k].length >= 2);
    if (!chosen) chosen = order.find((k) => sets[k] && sets[k].length >= 1);
    let images = chosen ? sets[chosen] : [];
    // Pictures of OTHER products often sit in the same kind of folder. The product's own
    // pictures usually carry its model code / product number in their address: keep those.
    if (cfg.modelFilter !== false && !slideMode && images.length > 1) {
      const toks = productTokens(findName(cfg, readJsonLd()).text);
      const nrm = (u) => String(u).toLowerCase().replace(/[^a-z0-9]/g, '');
      const hit = (u, t) =>
        t.charAt(0) === '/' ? String(u).toLowerCase().split(/[/?#._-]/).indexOf(t.slice(1)) !== -1 : nrm(u).indexOf(t) !== -1;
      const mine = toks.length ? images.filter((u) => toks.some((t) => hit(u, t))) : [];
      if (mine.length && mine.length < images.length) {
        debug.droppedPictures = images.length - mine.length;
        images = mine;
      }
      debug.modelTokens = toks;
    }

    const result = {
      ok: false,
      brand: picked ? picked.brand : '',
      url: location.href,
      name: name.text,
      price: price.text,
      priceValue: price.value,
      mainImage: images[0] || '',
      otherImages: images.slice(1),
      specs: specRows,
      specGroups,
      slideshowMode: slideMode,
      warnings,
      debug,
    };

    // 6. a recipe may fix things in its own special way
    if (typeof cfg.custom === 'function') {
      try {
        await cfg.custom({ result, util: { qa, clean, sleep, absUrl, toNumber }, jsonld: ld });
      } catch (e) {
        warnings.push('The special step for this brand had a problem: ' + e.message);
      }
    }

    // 7. honest warnings
    if (!result.name) warnings.push('I could not find the product name.');
    const expectPrice = typeof cfg.expectPrice === 'function' ? cfg.expectPrice(location.hostname.replace(/\.localhost$/, ''), location.pathname) : cfg.expectPrice !== false;
    if (!result.price && expectPrice && !noPrice) warnings.push('I could not find the price. (Some websites do not show prices at all.)');
    if (!result.mainImage) warnings.push('I could not find any product picture.');
    if (slideMode === 'nospecs') {
      /* this mode takes no specifications on purpose */
    } else if (result.specs.length === 0 && slideMode) warnings.push('Slideshow mode: this page has no « Caractéristiques » box, so I took no details.');
    else if (result.specs.length === 0) warnings.push('I could not find the specifications table.');
    else if (slideMode) {
      /* few rows in the specs box is fine for an air conditioner */
    } else if (result.specs.length < 4) warnings.push('I found only ' + result.specs.length + ' specification rows. Please check the page.');

    result.ok = !!(result.name || result.mainImage || result.specs.length);
    if (!result.ok) result.error = 'I could not find a product on this page. Is this a product page link?';

    debug.nameFrom = name.how;
    debug.priceFrom = price.how;
    debug.imagesFrom = chosen || 'none';
    debug.imageCounts = { gallery: sets.gallery.length, jsonld: sets.jsonld.length, nearName: sets.nearName.length, meta: sets.meta.length };
    debug.nearNameWhere = near.how;
    debug.galleryWhere = gallery.how;
    debug.specsFrom = specs.how;
    debug.specCount = result.specs.length;
    debug.specSections = specGroups.map((g) => g.title + ' (' + g.rows.length + ')');
    mark('end (page ' + (document.visibilityState || '?') + ' ' + window.innerWidth + 'x' + window.innerHeight + ')');
    debug.secondsTaken = Math.round((Date.now() - t0) / 100) / 10;
    debug.page = diagnose(ld);
    if (options && options.xray) {
      try {
        debug.xray = xray(cfg, [result.mainImage].concat(result.otherImages || []));
      } catch (e) {
        debug.xray = { error: String(e && e.message) };
      }
    }

    return JSON.parse(JSON.stringify(result)); // make sure it travels safely
  };

  // ================================================================
  //  X-RAY: a short map of the page for the helper (me), made by "Copy problem report"
  //  every picture (where it sits, kept or not), the specifications area, the data the page downloaded
  // ================================================================
  function xray(cfg, kept) {
    const short = (u) => {
      try {
        const x = new URL(u, location.href);
        const p = x.pathname.length > 110 ? '…' + x.pathname.slice(-110) : x.pathname;
        return p + (x.search ? x.search.slice(0, 24) : '');
      } catch (e) {
        return String(u).slice(0, 120);
      }
    };
    const tag = (el) =>
      el.tagName.toLowerCase() +
      (el.id ? '#' + el.id : '') +
      (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
    const where = (el, n) => {
      const out = [];
      let x = el.parentElement;
      for (let i = 0; i < n && x && x !== document.body; i++, x = x.parentElement) out.push(tag(x));
      return out.join(' < ');
    };
    const keyOf = cfg.imageKey || defaultImageKey;
    const keptKeys = new Set(kept.filter(Boolean).map((u) => keyOf(u)));
    const imgs = qa('img')
      .slice(0, 150)
      .map((img) => {
        const u = bestImageUrl(img);
        const fixed = u ? processImages([u], cfg)[0] : '';
        return {
          s: u ? short(u) : '(no address) ' + String(img.getAttribute('src') || '').slice(0, 30),
          alt: clean(img.getAttribute('alt') || '').slice(0, 40),
          at: where(img, 4),
          other: inOtherProducts(img) ? 1 : 0,
          kept: fixed && keptKeys.has(keyOf(fixed)) ? 1 : 0,
          skip: u && !fixed ? 1 : 0,
        };
      });
    let calls = [];
    try {
      calls = performance
        .getEntriesByType('resource')
        .filter((e) => /fetch|xmlhttprequest/.test(e.initiatorType))
        .map((e) => e.name.slice(0, 220))
        .filter((u) => !/google|facebook|doubleclick|analytics|hotjar|criteo|clarity|tiktok|bing|adobedtm|demdex|omtrdc/i.test(u))
        .slice(0, 60);
    } catch (e) {
      /* fine */
    }
    const snip = (el, max) => {
      if (!el) return '';
      const c = el.cloneNode(true);
      qa('script,style,svg,noscript,path,img,source,video', c).forEach((n) => n.remove());
      return c.outerHTML
        .replace(/ (data-[a-z-]+|aria-[a-z-]+|role|tabindex|style)="[^"]*"/gi, '')
        .replace(/="([^"]{80,})"/g, (m, v) => '="' + v.slice(0, 80) + '…"')
        .replace(/\s+/g, ' ')
        .slice(0, max);
    };
    // the specifications: the box(es) holding "Toutes les caractéristiques" / the recipe's spec boxes
    const titles = qa('h1,h2,h3,h4,h5,h6,p,span,div,button,a,strong,dt,th,li').filter(
      (el) => el.childElementCount === 0 && /^((voir )?toutes les caract|caract[ée]ristiques|sp[ée]cifications|fiche technique)/i.test(clean(el.textContent))
    );
    // every small piece of the page that shows a price (to see which one is the price to pay)
    const prices = qa('body *')
      .filter((el) => el.childElementCount <= 2 && /\d/.test(el.textContent || '') && clean(el.textContent).length <= 40 && /[€$£]|EUR|MAD|\bDHS?\b|\dDH/i.test(el.textContent || ''))
      .filter((el, i, all) => !all.some((o) => o !== el && el.contains(o)))
      .slice(0, 14)
      .map((el) => clean(el.textContent) + '  @ ' + tag(el) + ' < ' + where(el, 3) + (crossedOut(el) ? '  [crossed out]' : '') + (inOtherProducts(el) ? '  [other product]' : ''));
    const boxes = [];
    toArray(cfg.specContainerSelectors).forEach((sel) => {
      try {
        qa(sel).forEach((el) => boxes.push(el));
      } catch (e) {
        /* fine */
      }
    });
    titles.slice(0, 6).forEach((t) => {
      let x = t;
      for (let i = 0; i < 4 && x.parentElement && x.parentElement !== document.body; i++) x = x.parentElement;
      if (!boxes.some((b) => b.contains(x) || x.contains(b))) boxes.push(x);
    });
    return {
      url: location.href,
      images: imgs,
      dataCalls: calls,
      specTitles: titles.slice(0, 12).map((t) => clean(t.textContent).slice(0, 60) + '  @ ' + where(t, 3)),
      prices,
      specBoxes: boxes.slice(0, 4).map((b) => ({ at: tag(b) + ' < ' + where(b, 3), rows: qa('tr,li,dt,[class*="row" i]', b).length, html: snip(b, 7000) })),
    };
  }

  // ================================================================
  //  Shared tools for the other scraper files (links.js)
  // ================================================================
  G.util = { settle, sleep, clean, qa, toArray, waitUntil, absUrl, bestImageUrl, firstPrice, toNumber, isNoise, isCookie, stripArrows };
  G.pickRecipeFor = function (hostname, recipeId) {
    if (recipeId && recipeId !== 'auto' && recipeId !== 'generic' && G.recipes[recipeId]) return G.recipes[recipeId];
    return G.pickRecipe(hostname);
  };

  // Run the same brain on a page that was only DOWNLOADED (not opened in a window):
  // used by the "quick read" (offscreen.js). Shares the brand recipes.
  G.forDocument = function (doc, url) {
    const fakeWindow = {
      GHANDI: { recipes: G.recipes },
      innerHeight: 900,
      scrollTo: function () {},
      getComputedStyle: function () {
        return {};
      },
    };
    const loc = new URL(url);
    boot(fakeWindow, doc, loc);
    if (globalThis.GHANDI_LINKS_BOOT) globalThis.GHANDI_LINKS_BOOT(fakeWindow, doc, loc); // list pages too
    return fakeWindow.GHANDI;
  };
})(window, document, location);
