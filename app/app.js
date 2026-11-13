/*
  app.js — the side panel (4.0 design).
  It only SHOWS things and sends orders to background.js (same messages as before).
  Everything it shows comes from chrome.storage.local (see background.js).

  One flow: the "smart start" card understands the tab you are on -> find / grab -> live progress ->
  review (big cards, problems in plain words with a fix right there) -> send to the site.
*/
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const DEFAULTS = { quickRead: true, autoGrab: true, v: 2, recipeId: 'auto', category: '', maxPages: 10, delayMs: 300, workers: 4, lightLoad: true, slideshowMode: 'ac-specs', askType: true, sheetStyle: 'electroplanet', keepExtra: false, theme: 'auto' };
  const VERSION_NAME = 'Ghandi Product Grabber 4.0';
  const S = {
    items: new Map(),
    order: [],
    settings: Object.assign({}, DEFAULTS),
    run: {},
    crawl: {},
    sel: new Set(),
    hidden: new Set(), // removed, waiting 10 s for "Undo"
    filter: '',
    group: 'none',
    q: '',
    recipes: [],
    openId: null,
    tab: null,
    sections: [],
    history: [],
    focusId: null,
    startType: 'auto',
    preview: {},
    fixing: null,
  };

  // ------------------------------------------------------------ tiny helpers
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const host = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch (e) {
      return '';
    }
  };
  const send = (type, extra) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(Object.assign({ type }, extra || {}), (res) => {
          if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
          resolve(res || { ok: false, error: 'No answer' });
        });
      } catch (e) {
        resolve({ ok: false, error: String(e && e.message) });
      }
    });
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');

  let toastTimer;
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms || 3800);
  }
  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(okMsg || 'Copied.');
  }

  // ------------------------------------------------------------ recipes (names only)
  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }
  async function loadRecipes() {
    try {
      for (const f of RECIPE_FILES) await loadScript('../' + f);
    } catch (e) {
      /* fewer brands */
    }
    S.recipes = window.GHANDI.recipes.slice();
    $('recipe').innerHTML =
      '<option value="auto">Auto — pick by website</option>' +
      S.recipes.map((r) => '<option value="' + esc(r.id) + '">' + esc(r.brand) + '</option>').join('') +
      '<option value="generic">General method (no recipe)</option>';
    $('siteChips').innerHTML = S.recipes
      .filter((r) => r.home)
      .map((r) => '<button class="chip" type="button" data-home="' + esc(r.home) + '">' + esc(r.brand.replace(/\s*\(.*\)$/, '')) + '</button>')
      .join('');
  }
  function detect(urlStr) {
    const h = host(urlStr);
    if (!h) return null;
    return S.recipes.find((r) => r.match.some((m) => h.indexOf(m) !== -1)) || null;
  }
  function recipeFor(url) {
    const id = S.settings.recipeId;
    if (id && id !== 'auto' && id !== 'generic') return S.recipes.find((x) => x.id === id) || null;
    return detect(url);
  }
  function looksLikeProduct(url, r) {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return false;
    }
    const lc = (r && r.productLinks) || {};
    const path = u.pathname;
    const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
    if (arr(lc.exclude).some((re) => re.test(path))) return false;
    if (typeof lc.test === 'function') {
      try {
        return !!lc.test(path, u);
      } catch (e) {
        return false;
      }
    }
    if (arr(lc.pattern).some((re) => re.test(path + u.search))) return true;
    const segs = path.split('/').filter(Boolean);
    const last = segs[segs.length - 1] || '';
    if (lc.lastSegmentRegex) return lc.lastSegmentRegex.test(last) && segs.length >= (lc.minSegments || 2);
    return /\d/.test(last) && segs.length >= 3;
  }
  function keyOfUrl(href) {
    try {
      const u = new URL(href);
      u.hash = '';
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'].forEach((k) => u.searchParams.delete(k));
      return (u.host + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
    } catch (e) {
      return '';
    }
  }

  // ------------------------------------------------------------ item helpers (what is sent to the site: unchanged)
  const list = () => S.order.map((id) => S.items.get(id)).filter((it) => it && !S.hidden.has(it.id));
  const nameOf = (it) => (it.result && it.result.name) || it.title || '';
  const picOf = (it) => (it.result && it.result.mainImage) || it.image || '';

  function guessModel(it) {
    const r = it.result || {};
    if (r.model) return r.model;
    if (it.sheet && it.sheet.model) return it.sheet.model;
    const name = r.name || '';
    let m = name.match(/^([A-Z0-9][A-Za-z0-9 \-\/.]{3,28}?)\s*[:|–-]\s/);
    if (m && /\d/.test(m[1]) && /[A-Za-z]/.test(m[1])) return m[1].trim();
    try {
      const segs = new URL(it.url).pathname.split('/').filter(Boolean);
      for (let i = segs.length - 1; i >= 0; i--) {
        const seg = decodeURIComponent(segs[i]);
        if (/^p$/i.test(seg)) continue;
        if (/\d/.test(seg) && /[a-z]/i.test(seg) && seg.length <= 32 && !/\.(html?|php)$/i.test(seg)) return seg.toUpperCase();
        break;
      }
    } catch (e) {
      /* no model from the address */
    }
    m = name.match(/\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9][A-Z0-9-]{4,}\b/);
    return m ? m[0] : '';
  }
  const groupsOf = (r) => {
    if (r.specGroups && r.specGroups.length) return r.specGroups;
    return r.specs && r.specs.length ? [{ title: '', rows: r.specs }] : [];
  };
  function flatSpecs(groups) {
    const seen = new Set();
    const out = [];
    groups.forEach((g) =>
      (g.rows || []).forEach((r) => {
        const k = (r.label + '|' + r.value).toLowerCase();
        if (r.label && !seen.has(k)) {
          seen.add(k);
          out.push({ label: r.label, value: r.value });
        }
      })
    );
    return out;
  }
  const TYPE_NAMES = {};
  try {
    GHANDI_SHEETS.types().forEach((t) => (TYPE_NAMES[t.id] = t));
  } catch (e) {
    /* no sheets */
  }
  const typeOf = (it) => (it.sheet && it.sheet.type) || it.ptype || it.ptypeAuto || '';
  const typeLabel = (id) => (TYPE_NAMES[id] ? TYPE_NAMES[id].label : id === 'other' ? 'Autre' : '');
  const typeIcon = (id) => (TYPE_NAMES[id] ? TYPE_NAMES[id].icon : '📦');
  const sheetLines = (id) => {
    try {
      return GHANDI_SHEETS.lines(id) || 0;
    } catch (e) {
      return 0;
    }
  };
  function sheetGroupsOf(it) {
    if (S.settings.sheetStyle === 'brand' || !it.sheet || !(it.sheet.groups || []).length) return null;
    let groups = it.sheet.groups;
    if (S.settings.keepExtra && !it.sheet.edited && (it.sheet.extra || []).length) groups = groups.concat([{ title: 'Autres Caractéristiques', rows: it.sheet.extra }]);
    return groups;
  }
  function productOf(it) {
    const r = it.result;
    const clean = (gs) => gs.map((g) => ({ title: g.title || '', rows: (g.rows || []).map((x) => ({ label: x.label, value: x.value })) }));
    const brandGroups = clean(groupsOf(r));
    const sheet = sheetGroupsOf(it);
    const groups = sheet ? clean(sheet) : brandGroups;
    const main = r.mainImage || '';
    const others = (r.otherImages || []).filter((u) => u && u !== main);
    return {
      sourceUrl: it.url,
      brand: r.brand || '',
      category: it.category || '',
      sourceCategory: it.listingTitle || '',
      name: r.name || '',
      model: guessModel(it) || (it.sheet && it.sheet.model) || '',
      // prices are never sent: they are typed on the site (the site saves 0 + "Rupture de stock")
      price: '',
      priceValue: null,
      currency: '',
      mainImage: main,
      otherImages: others,
      images: main ? [main].concat(others) : others,
      specs: flatSpecs(groups),
      specGroups: groups,
      specStyle: sheet ? 'electroplanet' : 'brand',
      productType: typeOf(it),
      productTypeLabel: typeLabel(typeOf(it)),
      brandSpecGroups: sheet ? brandGroups : undefined,
      needsReview: it.status === 'check',
      warnings: it.status === 'check' ? r.warnings || [] : [],
      scrapedAt: it.finishedAt ? new Date(it.finishedAt).toISOString() : '',
    };
  }
  const grabbed = () => list().filter((it) => it.result && (it.status === 'done' || it.status === 'check'));
  function download() {
    const items = grabbed();
    if (!items.length) return toast('Nothing to save yet. Grab some products first.');
    const data = { schema: 'ghandi-products/v1', generatedAt: new Date().toISOString(), generator: VERSION_NAME, count: items.length, products: items.map(productOf), failed: [] };
    send('mark-exported', { ids: items.map((it) => it.id) });
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const name = 'ghandi-products-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
    toast('Saved ' + plural(items.length, 'product') + ' in ' + name);
  }

  // ------------------------------------------------------------ my site (direct import)
  const siteOn = () => !!(S.settings.siteUrl && S.settings.siteKey);
  async function api(body, timeoutMs) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs || 45000);
    let res;
    try {
      res = await fetch(S.settings.siteUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ghandi-key': S.settings.siteKey },
        body: JSON.stringify(Object.assign({ source: VERSION_NAME }, body)),
        signal: ctl.signal,
      });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'Your site took too long to answer. Try again.' : 'I cannot reach that address. Check it (copy it again from your site).');
    } finally {
      clearTimeout(t);
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* not JSON */
    }
    if (res.status === 401 || res.status === 403) throw new Error('The secret key is wrong. Copy it again from your site (page “Extension Chrome”).');
    if (!res.ok || !data || data.ok === false) throw new Error((data && data.error) || 'Your site answered with an error (' + res.status + ').');
    return data;
  }

  // a section of the site from what you typed: exact name or path first, then a close guess
  // ("combinés" -> "Réfrigérateurs - Congélateurs", "frigo" -> "Réfrigérateurs"...)
  const foldText = (t) =>
    String(t || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const WORDS_FOR = [
    [/\bcombine/, 'refrigerateur congelateur'],
    [/\bfrigo|\bfridge|side by side|americain|multi portes|deux portes/, 'refrigerateur'],
    [/\bclim\b|\bclims\b|climatis|split/, 'climatiseur'],
    [/\btele\b|\btv\b|televiseur/, 'television'],
    [/table de cuisson|plaque/, 'plaque cuisson'],
    [/four encastrable/, 'four'],
    [/micro onde/, 'micro onde'],
  ];
  // the site's sections (new Electroplanet-style names first, the old names after)
  const TYPE_SECTION = {
    fridge: ['refrigerateur', 'refrigerateur congelateur'],
    ac: ['climatiseur'],
    fan: ['ventilateur'],
    washer: ['machine a laver a hublot', 'machine a laver', 'lave linge'],
    dishwasher: ['lave vaisselle'],
    tv: ['televiseur', 'television'],
    hob: ['plaque de cuisson', 'plaque cuisson'],
    oven: ['four encastrable', 'four'],
    microwave: ['micro ondes encastrable', 'micro ondes', 'micro onde'],
    sink: ['evier'],
  };
  // a fridge or a freezer: which kind of section (precise first, then wider)
  function fridgeSections(it) {
    const name = foldText((it.result && it.result.name) || it.title || '');
    const rows = ((it.sheet && it.sheet.groups) || []).flatMap((g) => g.rows || []);
    const type = foldText((rows.find((r) => /^type$/i.test(r.label || '')) || {}).value || '');
    const all = name + ' ' + type + ' ' + foldText(((it.result && it.result.specs) || []).map((r) => r.label + ' ' + r.value).join(' ')).slice(0, 3000);
    const model = foldText((it.sheet && it.sheet.model) || '');
    // a freezer alone (not a fridge-freezer)
    if (/congelateur/.test(name) && !/refrigerateur/.test(name)) {
      if (/\b(droit|vertical|armoire|upright)\b/.test(all)) return ['congelateur armoire', 'congelateurs vertical', 'congelateur', 'congelateurs'];
      if (/\b(coffre|poitrine|horizontal|bahut|chest)\b/.test(all) || /^(wcf|cf\d|cmch)/.test(model.replace(/ /g, ''))) return ['congelateur coffre', 'congelateurs horizontal', 'congelateur', 'congelateurs'];
      return ['congelateur', 'congelateurs'];
    }
    const k = type + ' ' + name;
    if (/side by side|americain|\bsbs\b/.test(k)) return ['refrigerateur americain side by side', 'refrigerateurs side by side', 'refrigerateur', 'refrigerateur congelateur'];
    if (/multi portes|[34] portes|[34] door|french door|cross door|multi door|\bcube\b|quatre portes|quatres portes|trois portes/.test(k)) return ['refrigerateur multi portes', 'refrigerateurs multi portes', 'refrigerateur', 'refrigerateur congelateur'];
    if (/combine|congelateur en bas|congelateur inferieur|bottom/.test(k)) return ['refrigerateur avec congelateur en bas', 'refrigerateurs combines', 'refrigerateur', 'refrigerateur congelateur'];
    if (/congelateur en haut|double porte|double door|2 portes|deux portes|top freezer|top mount|monte sur le dessus/.test(k)) return ['refrigerateur avec congelateur en haut', 'refrigerateurs 2 portes', 'refrigerateur', 'refrigerateur congelateur'];
    if (/table top|sous plan|top table|mini bar/.test(k)) return ['mini bar et table top', 'refrigerateurs table top', 'refrigerateur'];
    if (/une porte|1 porte|monoporte|one door|single door/.test(k)) return ['refrigerateur 1 porte', 'refrigerateurs 1 porte', 'refrigerateur'];
    return ['refrigerateur'];
  }
  function findSection(typed) {
    const list = S.sections || [];
    const t = foldText(typed);
    if (!t) return { choices: [] };
    const exact = list.find((x) => foldText(x.path) === t || foldText(x.name) === t);
    if (exact) return { exact, choices: [] };
    const stem = (w) => w.replace(/(aux|eaux|s|x)$/, '');
    const wordsOf = (q) => foldText(q).split(' ').filter((w) => (w.length > 2 || /^\d+$/.test(w)) && !/^(les|des|pour|avec|and)$/.test(w)).map(stem);
    const fits = (q) => {
      const ws = wordsOf(q);
      if (!ws.length) return [];
      return list.filter((x) => {
        const have = foldText(x.name).split(' ').map(stem);
        return ws.every((w) => have.some((h) => h === w || (w.length >= 4 && (h.startsWith(w) || w.startsWith(h)))));
      });
    };
    let hits = fits(t);
    let q = t;
    if (!hits.length) {
      const alt = WORDS_FOR.find(([re]) => re.test(t));
      if (alt) {
        q = alt[1];
        hits = fits(q);
      }
    }
    hits.q = q;
    // "réfrigérateur" -> « Réfrigérateurs » rather than « Réfrigérateurs - Congélateurs »: a section with no extra words wins
    if (hits.length > 1) {
      const n = wordsOf(hits.q || t).length;
      const tight = hits.filter((x) => wordsOf(x.name).length === n);
      if (tight.length === 1) hits = tight;
    }
    // the narrowest section wins (" > " deeper in the tree), when only one is that deep
    if (hits.length > 1) {
      const depth = (x) => String(x.path || '').split('>').length;
      const max = Math.max.apply(null, hits.map(depth));
      const deep = hits.filter((x) => depth(x) === max);
      if (deep.length === 1) hits = deep;
    }
    if (hits.length === 1) return { guess: hits[0], choices: [] };
    const some = wordsOf(t);
    const close = list.filter((x) => some.some((w) => foldText(x.name).split(' ').some((h) => stem(h).startsWith(w.slice(0, 4)))));
    return { choices: (hits.length ? hits : close).slice(0, 4) };
  }

  // the most precise sub-section for a product, from its name and address (tried before the type's general section):
  // TVs by screen family, hobs gas/electric/mixed, built-in or free-standing, dryers by kind, hoods by shape
  function preciseSections(type, text) {
    const t = foldText(text);
    const built = /encastr|integr|built ?in|\bbuiltin\b|semi integr|tout integr/.test(t);
    if (type === 'tv') {
      if (/oled evo|oled.*\bevo\b/.test(t)) return ['tv oled evo', 'tv oled'];
      if (/oled/.test(t)) return ['tv oled'];
      if (/neo qled/.test(t)) return ['tv neo qled', 'tv qled mini led et qned'];
      if (/micro ?rgb/.test(t)) return ['tv microrgb'];
      if (/qled|mini ?led|qned|\bqd ?mini/.test(t)) return ['tv qled mini led et qned'];
      if (/nanocell|nano cell/.test(t)) return ['tv nanocell'];
      if (/full hd|\bfhd\b|\bhd ready\b/.test(t)) return ['tv full hd'];
      return ['tv 4k uhd'];
    }
    if (type === 'hob' || /plaque|table de cuisson|\bhob\b/.test(t)) {
      if (/mixte|mixed|gaz.*(induction|electr|vitro)|(induction|electr|vitro).*gaz/.test(t)) return ['plaque de cuisson mixte'];
      if (/gaz|gas|bruleur|feux/.test(t)) return ['plaque de cuisson a gaz'];
      if (type === 'hob' || /induction|vitro|electri/.test(t)) return ['plaque de cuisson electrique vitroceramique induction'];
    }
    if (/\bhotte|\bhood/.test(t)) {
      if (/ilot|island/.test(t)) return ['hotte ilot', 'hotte aspirante'];
      if (/visiere|telescop|tiroir|escamot|groupe filtrant|integr|encastr|built|slim/.test(t)) return ['hotte visiere', 'hotte aspirante'];
      return ['hotte decorative murale', 'hotte aspirante'];
    }
    if (/seche linge|\bdryer\b/.test(t) && !/lave linge|washer|sechant/.test(t)) {
      if (/pompe a chaleur|heat pump|thermopompe/.test(t)) return ['seche linge pompe a chaleur', 'seche linge'];
      if (/evacuation|vented/.test(t)) return ['seche linge a evacuation', 'seche linge'];
      return ['seche linge a condensation', 'seche linge'];
    }
    if (type === 'microwave') return built ? ['micro ondes encastrable'] : ['micro ondes posable', 'micro ondes'];
    if (type === 'dishwasher') return built ? ['lave vaisselle encastrable'] : ['lave vaisselle pose libre', 'lave vaisselle'];
    if (type === 'washer' && /chargement par le haut|ouverture en haut|top load|\btop\b|lave linge top/.test(t)) return ['machine a laver ouverture en haut'];
    if (type === 'fridge' && built) return ['refrigerateur encastrable'];
    if (/cuisiniere|\bcooker\b/.test(t) && type !== 'oven') return ['cuisiniere'];
    return [];
  }

  // (end of the section helpers; tests/test_sections.js reads the code above, up to: async function sendToSite())

  // ------------------------------------------------------------ which section of the site a product goes to
  // the section you chose for it (its "category"), else its type (the most precise section first)
  function sectionFor(it) {
    if (!(S.sections || []).length) return null;
    const c = findSection(it.category || '');
    if (c.exact || c.guess) return c.exact || c.guess;
    let tries = (TYPE_SECTION[typeOf(it)] || []).slice();
    if (typeOf(it) === 'fridge') tries = fridgeSections(it);
    if (typeOf(it) === 'washer' && /sechant|lavante sechante|washer dryer|lave linge sechant/.test(foldText(nameOf(it)))) tries.unshift('machine a laver sechante', 'lave linge sechants');
    else tries = preciseSections(typeOf(it), nameOf(it) + ' ' + String(it.url || '').replace(/[-_/]+/g, ' ')).concat(tries);
    for (const words of tries) {
      const t = findSection(words);
      if (t.exact || t.guess) return t.exact || t.guess;
    }
    return null;
  }

  // ------------------------------------------------------------ SEND: products go straight into the shop, no question
  async function sendToSite(items) {
    if (!siteOn()) {
      openSheet('settings');
      $('siteUrl').focus();
      return toast('Connect your site first (paste the two lines from your site).');
    }
    items = (items || []).filter((it) => it.result && (it.status === 'done' || it.status === 'check'));
    if (!items.length) return toast('Nothing to send.');
    // fresh list of the site's sections (a section deleted and created again has a new id)
    try {
      const r = await api({ action: 'ping' }, 15000);
      if (r && Array.isArray(r.sections)) {
        S.sections = r.sections;
        chrome.storage.local.set({ siteSections: r.sections });
      }
    } catch (e) {
      /* use the list we have */
    }
    const groups = new Map();
    const lost = [];
    items.forEach((it) => {
      const sec = sectionFor(it);
      if (!sec && (S.sections || []).length) return lost.push(it);
      const k = sec ? sec.id : '';
      if (!groups.has(k)) groups.set(k, { sec, items: [] });
      groups.get(k).items.push(it);
    });
    const total = items.length - lost.length;
    if (!total) return toast('Choose the site section for ' + (lost.length === 1 ? 'this product' : 'these products') + ' (tap the section chip on the card).');
    const CHUNK = 20;
    const btn = $('sendAll');
    btn.disabled = true;
    $('sendTrack').hidden = false;
    $('sendFill').style.width = '0%';
    let sent = 0;
    let added = 0;
    let known = true;
    const where = [];
    try {
      for (const { sec, items: part0 } of groups.values()) {
        const batchId = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const brands = Array.from(new Set(part0.map((it) => (it.result && it.result.brand) || ''))).filter(Boolean);
        const label = part0.length + ' produits' + (brands.length ? ' – ' + brands.join(', ') : '');
        for (let i = 0; i < part0.length; i += CHUNK) {
          const part = part0.slice(i, i + CHUNK);
          $('footMsg').textContent = 'Sending ' + Math.min(sent + part.length, total) + ' of ' + total + '…';
          const answer = await api({
            action: 'push',
            batchId,
            label,
            note: '',
            total: part0.length,
            final: i + CHUNK >= part0.length,
            suggestedSectionId: sec ? sec.id : null,
            suggestedSectionPath: sec ? sec.path || sec.name : '',
            products: part.map(productOf),
          });
          sent += part.length;
          if (answer && typeof answer.added === 'number') added += answer.added;
          else known = false;
          await send('mark-sent', { ids: part.map((it) => it.id), batchId });
          $('sendFill').style.width = Math.round((sent / total) * 100) + '%';
        }
        where.push({ name: sec ? sec.name : 'Automatic', n: part0.length });
      }
      const entry = { at: Date.now(), count: sent, added: known ? added : null, sections: where, names: items.slice(0, 6).map(nameOf) };
      S.history = [entry].concat(S.history || []).slice(0, 200);
      chrome.storage.local.set({ sendHistory: S.history });
      if (known && added < sent) {
        $('footMsg').textContent = sent + ' sent, but only ' + added + ' are in your shop. Your site did not accept the other ' + (sent - added) + '.';
        toast((sent - added) + ' products did not go into your shop.');
      } else {
        $('footMsg').textContent = '';
        toast('✓ ' + plural(sent, 'product') + ' sent: ' + where.map((w) => w.name + ' (' + w.n + ')').join(', ') + (lost.length ? '. ' + lost.length + ' still need a section.' : ''), 6000);
      }
    } catch (e) {
      $('footMsg').textContent = (sent ? sent + ' products were sent, then: ' : '') + e.message;
    }
    btn.disabled = false;
    $('sendTrack').hidden = true;
    render();
  }

  // ------------------------------------------------------------ what a product needs (plain words)
  function info(it) {
    const r = it.result || {};
    const main = r.mainImage || '';
    const pics = (main ? 1 : 0) + (r.otherImages || []).filter((u) => u && u !== main).length;
    const specs = (r.specs || []).length;
    const model = it.result ? guessModel(it) : '';
    const type = typeOf(it);
    const probs = [];
    let state;
    if (it.status === 'queued' || it.status === 'working') state = 'busy';
    else if (it.status === 'failed') state = 'failed';
    else if (it.status === 'found' || !it.result) state = 'waiting';
    else if (it.sentAt) state = 'sent';
    if (state === 'failed') probs.push({ code: 'grab', t: 'Could not read the page', cls: 'bad', block: 1 });
    if (state === 'waiting') probs.push({ code: 'grab', t: 'Not grabbed yet', block: 1 });
    let sec = null;
    if (it.result && state !== 'failed') {
      if (!r.name) probs.push({ code: 'open', t: 'No name', cls: 'bad', block: 1 });
      if (!model) probs.push({ code: 'model', t: 'No model code', cls: 'bad', block: 1 });
      if (!pics) probs.push({ code: 'grab', t: 'No pictures', cls: 'bad', block: 1 });
      else if (pics === 1) probs.push({ code: 'open', t: 'Check the pictures (only 1)' });
      if (r.slideshowMode !== 'nospecs') {
        if (specs < 3) probs.push({ code: 'grab', t: specs ? 'Only ' + specs + ' specs' : 'No specs', block: 1 });
        else if (specs < 8) probs.push({ code: 'open', t: 'Only ' + specs + ' specs' });
      }
      if (!type || type === 'other' || (!it.ptype && it.ptypeSure === false)) probs.push({ code: 'type', t: type && type !== 'other' ? typeLabel(type) + '?' : 'Choose the type' });
      sec = sectionFor(it);
      if (siteOn() && (S.sections || []).length && !sec && state !== 'sent') probs.push({ code: 'section', t: 'Choose the site section', block: 1 });
    }
    if (!state) state = probs.some((p) => p.block) || (it.status === 'check' && probs.length) ? 'check' : 'ready';
    return { state, probs, pics, specs, model, type, sec };
  }
  const STATE_LABEL = { ready: 'Ready', check: 'To check', failed: 'Failed', sent: 'Sent', busy: 'Working…', waiting: 'Waiting' };

  // ------------------------------------------------------------ the list (virtual: only the visible cards exist)
  function matches(it, inf) {
    const f = S.filter;
    if (f === 'check' && !(inf.state === 'check' || inf.state === 'waiting')) return false;
    if (f === 'ready' && inf.state !== 'ready') return false;
    if (f === 'sent' && inf.state !== 'sent') return false;
    if (f === 'failed' && inf.state !== 'failed') return false;
    if (S.q) {
      const hay = (nameOf(it) + ' ' + inf.model + ' ' + ((it.result && it.result.brand) || '') + ' ' + it.url).toLowerCase();
      if (!S.q.split(/\s+/).every((w) => hay.indexOf(w) !== -1)) return false;
    }
    return true;
  }
  let MODEL = { rows: [], height: 0, ids: [], infos: new Map() };
  function buildModel() {
    const infos = new Map();
    const counts = { check: 0, ready: 0, sent: 0, failed: 0, all: 0 };
    const shown = [];
    list().forEach((it) => {
      const inf = info(it);
      infos.set(it.id, inf);
      counts.all++;
      if (inf.state === 'check' || inf.state === 'waiting') counts.check++;
      if (counts[inf.state] != null && inf.state !== 'check') counts[inf.state]++;
      if (matches(it, inf)) shown.push(it);
    });
    if (!S.filter) S.filter = counts.check ? 'check' : 'all';
    const CH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-h')) || 152;
    const HH = 34;
    const rows = [];
    let y = 0;
    const push = (row, h) => {
      row.top = y;
      row.h = h;
      rows.push(row);
      y += h;
    };
    if (S.group === 'none') shown.forEach((it) => push({ kind: 'item', id: it.id }, CH));
    else {
      const key = (it) => (S.group === 'brand' ? ((it.result && it.result.brand) || 'No brand').toUpperCase() : typeLabel(typeOf(it)) || 'Unknown type');
      const groups = new Map();
      shown.forEach((it) => {
        const k = key(it);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(it);
      });
      Array.from(groups.keys())
        .sort()
        .forEach((k) => {
          push({ kind: 'head', label: k, n: groups.get(k).length }, HH);
          groups.get(k).forEach((it) => push({ kind: 'item', id: it.id }, CH));
        });
    }
    MODEL = { rows, height: y, ids: rows.filter((r) => r.kind === 'item').map((r) => r.id), infos, counts };
  }

  function chipsHtml(it, inf) {
    if (S.fixing && S.fixing.id === it.id && S.fixing.code === 'model')
      return '<span class="fixin"><input data-fixmodel value="" placeholder="Type the model code" aria-label="Model code"><button type="button" data-fixsave>OK</button></span>';
    const out = inf.probs.slice(0, 3).map((p) => '<button type="button" class="prob' + (p.cls ? ' ' + p.cls : '') + '" data-fix="' + p.code + '" title="Fix it">' + esc(p.t) + '</button>');
    if (!inf.probs.length && inf.state === 'ready') out.push('<span class="prob ok">✓ Looks good</span>');
    if (inf.state === 'check' && !inf.probs.some((p) => p.block)) out.push('<button type="button" class="prob ok" data-fix="okay" title="Mark it as checked">✓ It is fine</button>');
    if (inf.state === 'busy') out.push('<span class="prob info">' + esc(it.message || 'Working…') + '</span>');
    return out.join('');
  }
  function cardHtml(it, row) {
    const inf = MODEL.infos.get(it.id) || info(it);
    const r = it.result || {};
    const pic = picOf(it);
    const brand = r.brand || '';
    const type = inf.type;
    const lines = it.sheet && it.sheet.type && it.sheet.type !== 'other' ? ' · ' + (it.sheet.filled || 0) + '/' + sheetLines(it.sheet.type) + ' lines' : '';
    const meta = it.result ? (typeLabel(type) || 'Type ?') + ' · ' + plural(inf.pics, 'photo') + ' · ' + plural(inf.specs, 'spec') + lines : it.message || host(it.url);
    let secChip = '';
    if (it.result && inf.state !== 'failed') {
      if (!siteOn()) secChip = '<button type="button" class="chip" data-sec title="Connect your site to choose the section">→ Site section</button>';
      else if (inf.sec) secChip = '<button type="button" class="chip" data-sec title="Change the section">→ ' + esc(inf.sec.name) + '</button>';
      else secChip = '<button type="button" class="chip none" data-sec>→ Choose a section</button>';
    }
    const sel = S.sel.has(it.id);
    return (
      '<div class="card-item' + (sel ? ' sel' : '') + (S.focusId === it.id ? ' focus' : '') + '" data-id="' + it.id + '" role="option" aria-selected="' + sel + '" style="top:' + row.top + 'px">' +
      '<label class="ck" title="Select"><input type="checkbox" data-ck' + (sel ? ' checked' : '') + ' aria-label="Select"></label>' +
      '<div class="ph">' + (pic ? '<img loading="lazy" referrerpolicy="no-referrer" src="' + esc(pic) + '" alt="">' : '<span class="noimg">🖼</span>') + (type ? '<span class="ticon" title="' + esc(typeLabel(type)) + '">' + esc(typeIcon(type)) + '</span>' : '') + '</div>' +
      '<div class="bd"><div class="nm" title="' + esc(nameOf(it)) + '">' + esc(nameOf(it) || it.url) + '</div>' +
      '<div class="bm">' + (brand ? '<span class="br">' + esc(brand) + '</span>' : '') + (inf.model ? '<span class="md" title="Model code">' + esc(inf.model) + '</span>' : '') + '</div>' +
      '<div class="meta">' + esc(meta) + '</div>' +
      '<div class="probs">' + chipsHtml(it, inf) + '</div>' +
      '<div class="sec">' + secChip + '<span class="st ' + inf.state + '">' + STATE_LABEL[inf.state] + '</span></div></div></div>'
    );
  }
  let lastWindow = '';
  function renderList(force) {
    const box = $('list');
    if (!force && box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && document.activeElement.dataset.fixmodel !== undefined) return;
    const top = box.scrollTop;
    const h = box.clientHeight || 600;
    const rows = MODEL.rows;
    const vis = rows.filter((r) => r.top + r.h >= top - 400 && r.top <= top + h + 400);
    const html = vis
      .map((r) => {
        if (r.kind === 'head') return '<div class="group-head" style="top:' + r.top + 'px">' + esc(r.label) + ' <span class="pill">' + r.n + '</span></div>';
        const it = S.items.get(r.id);
        return it ? cardHtml(it, r) : '';
      })
      .join('');
    const sp = $('spacer');
    sp.style.height = MODEL.height + 'px';
    const sig = top + '|' + html.length + '|' + html.slice(0, 200) + html.slice(-200);
    if (force || sig !== lastWindow || sp.innerHTML.length !== html.length) {
      sp.innerHTML = html;
      lastWindow = sig;
    }
  }

  function renderTools() {
    const c = MODEL.counts || {};
    document.querySelectorAll('#filters [data-f]').forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.f === S.filter));
      b.querySelector('span').textContent = c[b.dataset.f] ? c[b.dataset.f] : '';
    });
    const n = S.sel.size;
    $('bulk').hidden = !n;
    $('bulkN').textContent = n + ' selected';
    const empty = $('empty');
    if (!S.order.length) {
      empty.hidden = false;
      empty.innerHTML = '<b>Your list is empty</b>Open a product page or a category page of a brand, then use the big button above.';
    } else if (!MODEL.rows.length) {
      empty.hidden = false;
      const say = { check: 'Nothing to check. 👍', ready: 'Nothing ready yet.', sent: 'Nothing sent yet.', failed: 'No failures. 👍', all: 'No products match.' };
      empty.innerHTML = '<b>' + (S.q ? 'No product matches “' + esc(S.q) + '”.' : say[S.filter] || '') + '</b>';
    } else empty.hidden = true;
  }

  function renderFoot() {
    const btn = $('sendAll');
    if (S.sending) return;
    if (!siteOn()) {
      btn.textContent = 'Connect my site to send';
      btn.disabled = false;
      btn.dataset.mode = 'connect';
      return;
    }
    const ready = MODEL.counts ? MODEL.counts.ready : 0;
    btn.dataset.mode = 'send';
    btn.disabled = !ready;
    btn.textContent = ready ? 'Send ' + plural(ready, 'ready product') : 'Nothing ready to send yet';
  }

  function renderSite() {
    const on = siteOn();
    $('siteChip').classList.toggle('on', on);
    $('siteName').textContent = on ? S.settings.siteName || 'My site' : 'Site not connected';
    const dl = $('sectionList');
    const html = (S.sections || []).map((x) => '<option value="' + esc(x.path || x.name) + '"></option>').join('');
    if (dl.innerHTML !== html) dl.innerHTML = html;
  }

  // ------------------------------------------------------------ SMART START (the tab you are on)
  async function refreshTab() {
    let tab = null;
    try {
      const act = await chrome.tabs.query({ active: true, lastFocusedWindow: true, windowType: 'normal' });
      tab = act.find((t) => /^https?:/i.test(t.url || '')) || null;
      if (!tab) {
        const all = await chrome.tabs.query({ windowType: 'normal' });
        const web = all.filter((t) => /^https?:/i.test(t.url || '')).sort((x, y) => (y.lastAccessed || 0) - (x.lastAccessed || 0));
        tab = web[0] || null;
      }
    } catch (e) {
      tab = null;
    }
    S.tab = tab;
    renderStart();
    if (tab) countLinks(tab);
  }
  function tabKind(tab) {
    if (!tab) return { kind: 'none' };
    const r = recipeFor(tab.url);
    if (!r && S.settings.recipeId !== 'generic') return { kind: 'unknown', product: looksLikeProduct(tab.url, null) };
    return { kind: looksLikeProduct(tab.url, r) ? 'product' : 'list', recipe: r };
  }
  // how many products the open list page shows (read without clicking anything)
  async function countLinks(tab) {
    const k = tabKind(tab);
    if (k.kind !== 'list' && k.kind !== 'unknown') return;
    const key = tab.url;
    const old = S.preview[key];
    if (old && Date.now() - old.at < 30000) return;
    S.preview[key] = { at: Date.now(), n: null };
    try {
      const files = ['scraper/core.js'].concat(RECIPE_FILES, ['scraper/links.js']);
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files });
      const res = await Promise.race([
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (rid) => window.GHANDI.collectLinks({ static: true, recipeId: rid || undefined, timeoutMs: 4000 }).then((r) => ({ n: r.links.length, expected: r.expected || 0, more: !!r.hasLoadMore, next: !!r.next })), args: [S.settings.recipeId && S.settings.recipeId !== 'auto' ? S.settings.recipeId : null] }),
        new Promise((res) => setTimeout(() => res(null), 7000)),
      ]);
      const v = res && res[0] && res[0].result;
      S.preview[key] = Object.assign({ at: Date.now() }, v || { n: -1 });
    } catch (e) {
      S.preview[key] = { at: Date.now(), n: -1 };
    }
    if (S.tab && S.tab.url === key) renderStart();
  }
  function renderStart() {
    const tab = S.tab;
    const k = tabKind(tab);
    const busy = (S.crawl || {}).state === 'running';
    const card = $('start');
    card.classList.toggle('compact', S.order.length > 0);
    const pill = $('startBrand');
    const go = $('startGo');
    const alt = $('startAlt');
    $('siteChips').hidden = k.kind !== 'none';
    $('startTypeRow').hidden = k.kind === 'none';
    $('startType').textContent = (S.startType === 'auto' ? 'Detect by itself' : typeIcon(S.startType) + ' ' + typeLabel(S.startType)) + ' ▾';
    go.hidden = alt.hidden = k.kind === 'none';
    go.disabled = busy;
    let shown = '';
    if (tab) {
      try {
        const u = new URL(tab.url);
        shown = u.hostname.replace(/^www\./, '') + decodeURIComponent(u.pathname);
      } catch (e) {
        shown = tab.url;
      }
    }
    $('startWhere').textContent = shown || 'No web page open';
    const have = tab ? list().find((it) => it.key === keyOfUrl(tab.url)) : null;
    if (k.kind === 'none') {
      pill.textContent = 'Start';
      pill.className = 'brand-pill';
      $('startTitle').textContent = 'Open a brand website';
      $('startText').textContent = 'Go to a product page or a category page. Your brands:';
      return;
    }
    const brand = k.recipe ? k.recipe.brand.replace(/\s*\(.*\)$/, '') : 'Unknown site';
    pill.textContent = brand;
    pill.className = 'brand-pill' + (k.recipe ? '' : ' none');
    if (k.kind === 'product') {
      go.dataset.act = 'grab';
      alt.dataset.act = 'find';
      $('startTitle').textContent = 'This is a product page';
      $('startText').textContent = have ? 'It is already in your list (' + STATE_LABEL[info(have).state] + '). You can grab it again.' : 'One click and it is in your list.';
      go.textContent = have ? 'Grab this product again' : 'Grab this product';
      alt.textContent = 'No, it is a list: find all products here';
    } else if (k.kind === 'list') {
      const p = S.preview[tab.url];
      const n = p && p.n != null && p.n >= 0 ? p.n : null;
      const tot = p && p.expected > (n || 0) ? p.expected : n;
      go.dataset.act = 'find';
      alt.dataset.act = 'grab';
      $('startTitle').textContent = 'This is a category page';
      $('startText').textContent =
        n == null ? 'Counting the products on this page…' : n === 0 ? 'I see no products yet (the page may still be loading). Try anyway.' : (tot > n ? 'The page says ' + tot + ' products (' + n + ' visible now). ' : n + ' products on this page. ') + 'I will find them all and grab them.';
      go.textContent = n ? 'Find all ' + (tot || n) + ' products' : 'Find all products on this page';
      alt.textContent = 'No, it is one product: grab it';
    } else {
      go.dataset.act = k.product ? 'grab' : 'find';
      alt.dataset.act = k.product ? 'find' : 'grab';
      $('startTitle').textContent = 'I do not know this website yet';
      $('startText').textContent = 'I can still try with my general method. Check every result.';
      go.textContent = k.product ? 'Try: grab this product' : 'Try: find products here';
      alt.textContent = k.product ? 'It is a list: find products' : 'It is one product: grab it';
    }
  }
  async function startAct(act) {
    const tab = S.tab;
    if (!tab) return;
    const ptype = S.startType || 'auto';
    if (act === 'grab') {
      toast('Reading this page…');
      const res = await send('grab-tab', { tabId: tab.id, recipeId: S.settings.recipeId, category: S.settings.category, ptype });
      if (res.ok) {
        S.focusId = res.id;
        toast('Done: the product is in your list.');
        if (S.filter !== 'all') S.filter = 'all';
        render();
      } else toast(res.error || 'Could not read that tab.');
    } else {
      const res = await send('crawl-tab', { tabId: tab.id, recipeId: S.settings.recipeId, category: S.settings.category, autoStart: true, ptype });
      if (!res.ok) toast(res.error || 'Could not start.');
    }
  }
  function parseLinks(text) {
    return Array.from(new Set((text.match(/https?:\/\/[^\s"'<>]+/g) || []).map((u) => u.replace(/[),.;]+$/, ''))));
  }
  async function addLinks() {
    const urls = parseLinks($('linksBox').value);
    if (!urls.length) return toast('Paste at least one product link first.');
    const res = await send('add-links', { urls, category: S.settings.category, queue: true, ptype: S.startType || 'auto' });
    if (res.ok) {
      $('linksBox').value = '';
      $('pasteBox').open = false;
      toast('Added ' + res.added + (res.skipped ? ', ' + res.skipped + ' were already in the list' : '') + '. Grabbing…');
    } else toast(res.error || 'Could not add.');
  }

  // ------------------------------------------------------------ PROGRESS (live)
  function renderProg() {
    const crawl = S.crawl || {};
    const run = S.run || {};
    const finding = crawl.state === 'running';
    const grabbing = run.state === 'running';
    $('prog').hidden = !(finding || grabbing);
    if (!(finding || grabbing)) return;
    const fill = $('progFill');
    if (finding && !grabbing) {
      $('progTitle').textContent = 'Finding products…';
      fill.classList.add('indet');
      $('progText').textContent = crawl.message || '';
      $('progThumbs').innerHTML = '';
      return;
    }
    fill.classList.remove('indet');
    const total = run.total || 0;
    const done = run.done || 0;
    fill.style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
    $('progTitle').textContent = 'Grabbing ' + Math.min(done + 1, total) + ' of ' + total;
    let left = '';
    if (done >= 2 && run.startedAt) {
      const sec = ((Date.now() - run.startedAt) / done) * (total - done) / 1000;
      left = sec < 60 ? ' · less than a minute left' : ' · about ' + Math.round(sec / 60) + ' min left';
    }
    $('progText').textContent = (run.message || '') + left + (finding ? ' · still finding more…' : '');
    const recent = list()
      .filter((it) => it.finishedAt && it.finishedAt >= (run.startedAt || 0) && picOf(it))
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .slice(0, 12);
    const html = recent.map((it) => '<img src="' + esc(picOf(it)) + '" referrerpolicy="no-referrer" alt="" title="' + esc(nameOf(it)) + '">').join('');
    if ($('progThumbs').dataset.sig !== recent.map((it) => it.id).join()) {
      $('progThumbs').innerHTML = html;
      $('progThumbs').dataset.sig = recent.map((it) => it.id).join();
    }
  }

  // ------------------------------------------------------------ draw everything
  let renderTimer = null;
  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      render();
    }, 150);
  }
  let lastRunState = 'idle';
  function render() {
    for (const id of Array.from(S.sel)) if (!S.items.has(id) || S.hidden.has(id)) S.sel.delete(id);
    buildModel();
    renderTools();
    renderList();
    renderProg();
    renderFoot();
    renderSite();
    renderStart();
    const rs = (S.run || {}).state || 'idle';
    if (lastRunState === 'running' && rs !== 'running') {
      const c = MODEL.counts;
      toast('Finished: ' + c.ready + ' ready, ' + c.check + ' to check' + (c.failed ? ', ' + c.failed + ' failed' : '') + '.', 5000);
      S.filter = c.check ? 'check' : 'ready';
      buildModel();
      renderTools();
      renderList(true);
    }
    lastRunState = rs;
    if (S.openId && !S.ed.dirty) {
      const it = S.items.get(S.openId);
      if (it && stampOf(it) !== S.ed.stamp) fillEditor(it);
    }
  }

  // ------------------------------------------------------------ remove with a 10-second "Undo" (no question asked)
  let undoTimer = null;
  let undoIds = [];
  function softRemove(ids, what) {
    commitRemove();
    ids = ids.filter((id) => S.items.has(id));
    if (!ids.length) return;
    undoIds = ids;
    ids.forEach((id) => {
      S.hidden.add(id);
      S.sel.delete(id);
    });
    let left = 10;
    $('undoText').textContent = what || 'Removed ' + plural(ids.length, 'product') + '.';
    $('undoSec').textContent = left;
    $('undo').hidden = false;
    undoTimer = setInterval(() => {
      left--;
      $('undoSec').textContent = left;
      if (left <= 0) commitRemove();
    }, 1000);
    render();
  }
  function commitRemove() {
    clearInterval(undoTimer);
    undoTimer = null;
    $('undo').hidden = true;
    if (!undoIds.length) return;
    const ids = undoIds;
    undoIds = [];
    const all = S.order.filter((id) => S.items.has(id));
    if (ids.length === all.length) send('clear-all');
    else send('remove', { ids });
    ids.forEach((id) => S.hidden.delete(id));
  }
  function undoRemove() {
    clearInterval(undoTimer);
    undoTimer = null;
    undoIds.forEach((id) => S.hidden.delete(id));
    undoIds = [];
    $('undo').hidden = true;
    toast('Back in the list.');
    render();
  }
  window.addEventListener('pagehide', commitRemove);

  // ------------------------------------------------------------ small menus (type, section, picture link)
  function closeMenu() {
    $('menu').hidden = true;
    $('menu').innerHTML = '';
  }
  function openMenu(anchor, html, onPick) {
    const m = $('menu');
    m.innerHTML = html;
    m.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 20);
    m.style.width = w + 'px';
    m.style.left = Math.max(10, Math.min(r.left, window.innerWidth - w - 10)) + 'px';
    const below = r.bottom + 6;
    m.style.top = below + 'px';
    const mh = m.offsetHeight;
    if (below + mh > window.innerHeight - 10) m.style.top = Math.max(10, r.top - mh - 6) + 'px';
    m.onclick = (e) => {
      const b = e.target.closest('[data-v]');
      if (b) {
        closeMenu();
        onPick(b.dataset.v);
      }
    };
    const first = m.querySelector('input') || m.querySelector('button');
    if (first) first.focus();
    return m;
  }
  function typeMenu(anchor, onPick, withAuto) {
    const ids = Object.keys(TYPE_NAMES);
    const html =
      (withAuto ? '<button type="button" data-v="auto">✨ Detect by itself</button>' : '') +
      ids.map((id) => '<button type="button" data-v="' + id + '">' + esc(TYPE_NAMES[id].icon + ' ' + TYPE_NAMES[id].label) + '</button>').join('') +
      '<button type="button" data-v="other">📦 Something else (brand lines)</button>';
    openMenu(anchor, html, onPick);
  }
  function sectionMenu(anchor, items, onPick) {
    if (!siteOn()) {
      openSheet('settings');
      return toast('Connect your site first: then I know its sections.');
    }
    const draw = (q) => {
      const t = foldText(q);
      let opts = (S.sections || []).filter((x) => !t || foldText(x.path || x.name).indexOf(t) !== -1);
      const guess = items.length === 1 ? sectionFor(Object.assign({}, items[0], { category: '' })) : null;
      if (!t && guess) opts = [guess].concat(opts.filter((x) => x.id !== guess.id));
      return opts
        .slice(0, 40)
        .map((x) => '<button type="button" data-v="' + esc(x.path || x.name) + '">' + (guess && x.id === guess.id && !t ? '✨ ' : '') + esc(x.path || x.name) + '</button>')
        .join('') || '<p class="mhint">No section with that name.</p>';
    };
    const m = openMenu(anchor, '<input type="search" placeholder="Search a section…" data-secq><div data-secl>' + draw('') + '</div><p class="mhint">✨ = what I would choose by myself</p>', onPick);
    const q = m.querySelector('[data-secq]');
    q.addEventListener('input', () => (m.querySelector('[data-secl]').innerHTML = draw(q.value)));
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const b = m.querySelector('[data-v]');
        if (b) b.click();
      }
    });
  }

  // ------------------------------------------------------------ list actions
  const idsForAction = (id) => (S.sel.has(id) && S.sel.size > 1 ? Array.from(S.sel) : [id]);
  async function fix(id, code, el) {
    const it = S.items.get(id);
    if (!it) return;
    if (code === 'grab') {
      await send('retry', { ids: [id] });
      toast('Grabbing it again…');
    } else if (code === 'open') openEditor(id);
    else if (code === 'model') {
      S.fixing = { id, code: 'model' };
      renderList(true);
      const inp = $('list').querySelector('[data-fixmodel]');
      if (inp) inp.focus();
    } else if (code === 'type')
      typeMenu(el, async (ptype) => {
        await send('set-type', { ids: idsForAction(id), ptype });
        toast('Type saved.');
      });
    else if (code === 'section') pickSection(el, idsForAction(id));
    else if (code === 'okay') {
      await send('edit-item', { id, patch: { name: nameOf(it) } });
      toast('Marked as checked.');
    }
  }
  async function saveFixModel() {
    const inp = $('list').querySelector('[data-fixmodel]');
    const f = S.fixing;
    S.fixing = null;
    if (inp && f && inp.value.trim()) {
      await send('edit-item', { id: f.id, patch: { model: inp.value.trim() } });
      toast('Model code saved.');
    }
    renderList(true);
  }
  function pickSection(anchor, ids) {
    const items = ids.map((i) => S.items.get(i)).filter(Boolean);
    sectionMenu(anchor, items, async (path) => {
      await send('set-category', { ids, category: path });
      toast(plural(ids.length, 'product') + ' → ' + path.split('>').pop().trim());
    });
  }
  function toggleSel(id, on) {
    if (on === undefined) on = !S.sel.has(id);
    if (on) S.sel.add(id);
    else S.sel.delete(id);
    renderTools();
    renderList(true);
  }
  async function bulk(act, el) {
    const ids = Array.from(S.sel);
    if (act === 'none') {
      S.sel.clear();
      return render();
    }
    if (!ids.length) return;
    if (act === 'grab') {
      await send('retry', { ids });
      toast('Grabbing ' + plural(ids.length, 'product') + ' again…');
    } else if (act === 'type')
      typeMenu(el, async (ptype) => {
        await send('set-type', { ids, ptype });
        toast('Type saved for ' + plural(ids.length, 'product') + '.');
      });
    else if (act === 'section') pickSection(el, ids);
    else if (act === 'remove') softRemove(ids);
    else if (act === 'send') sendToSite(ids.map((i) => S.items.get(i)).filter(Boolean));
  }
  function moveFocus(d) {
    const ids = MODEL.ids;
    if (!ids.length) return;
    let i = ids.indexOf(S.focusId);
    i = i === -1 ? 0 : Math.max(0, Math.min(ids.length - 1, i + d));
    S.focusId = ids[i];
    const row = MODEL.rows.find((r) => r.id === S.focusId);
    const box = $('list');
    if (row) {
      if (row.top < box.scrollTop) box.scrollTop = row.top;
      else if (row.top + row.h > box.scrollTop + box.clientHeight) box.scrollTop = row.top + row.h - box.clientHeight;
    }
    renderList(true);
  }

  // ------------------------------------------------------------ PRODUCT EDITOR
  S.ed = { dirty: false, pics: [], cur: 0, view: 'sheet', stamp: '' };
  const stampOf = (it) => [it.status, it.finishedAt || 0, it.ptype || '', it.category || '', (it.sheet && it.sheet.at) || 0, it.edited ? 1 : 0].join('|');
  function openEditor(id) {
    const it = S.items.get(id);
    if (!it) return;
    S.openId = id;
    S.focusId = id;
    S.ed.view = it.sheet && (it.sheet.groups || []).length && S.settings.sheetStyle !== 'brand' ? 'sheet' : 'brand';
    fillEditor(it);
    openSheet('editor');
  }
  function fillEditor(it) {
    const r = it.result || { name: '', brand: '', mainImage: '', otherImages: [], specs: [], specGroups: [], warnings: [] };
    S.ed.stamp = stampOf(it);
    S.ed.dirty = false;
    S.ed.pics = [r.mainImage].concat(r.otherImages || []).filter((u, i, a) => u && a.indexOf(u) === i);
    S.ed.cur = 0;
    $('edTitle').textContent = nameOf(it) || 'Product';
    $('edLink').href = it.url;
    $('fName').value = r.name || '';
    $('fModel').value = it.result ? guessModel(it) : '';
    $('fBrand').value = r.brand || '';
    const sec = sectionFor(it);
    $('fCat').value = it.category || '';
    $('fCat').placeholder = sec ? 'Automatic: ' + (sec.path || sec.name) : 'Automatic';
    const ids = Object.keys(TYPE_NAMES);
    const auto = it.ptypeAuto && TYPE_NAMES[it.ptypeAuto] ? ' (' + TYPE_NAMES[it.ptypeAuto].label + ')' : '';
    $('fType').innerHTML =
      '<option value="auto">Detect by itself' + esc(auto) + '</option>' +
      ids.map((id) => '<option value="' + id + '">' + esc(TYPE_NAMES[id].icon + ' ' + TYPE_NAMES[id].label) + '</option>').join('') +
      '<option value="other">Something else (brand lines)</option>';
    $('fType').value = it.ptype || 'auto';
    const inf = info(it);
    const notes = inf.probs.map((p) => p.t).concat((r.warnings || []).slice(0, 3));
    $('edWarn').hidden = !notes.length;
    $('edWarn').innerHTML = notes.length ? '<b>To check:</b><ul>' + Array.from(new Set(notes)).map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '';
    $('edSaved').textContent = '';
    renderPics();
    renderSpecs(it);
  }
  function renderPics() {
    const pics = S.ed.pics;
    if (S.ed.cur >= pics.length) S.ed.cur = 0;
    $('edBig').src = pics[S.ed.cur] || '';
    $('edBig').hidden = !pics.length;
    $('edPics').innerHTML = pics
      .map((u, i) => '<span class="pic' + (i === 0 ? ' main' : '') + (i === S.ed.cur ? ' cur' : '') + '" draggable="true" data-i="' + i + '" title="Drag to move. Click to see it big."><img src="' + esc(u) + '" referrerpolicy="no-referrer" alt=""><button type="button" data-xp="' + i + '" aria-label="Remove this picture">×</button></span>')
      .join('') || '<p class="small muted">No pictures.</p>';
  }
  const specRow = (r) => '<div class="srow"><input type="text" data-l value="' + esc(r.label) + '" aria-label="Label"><input type="text" data-v value="' + esc(r.value) + '" aria-label="Value"><button type="button" data-sdel aria-label="Delete this line" title="Delete this line">✕</button></div>';
  function renderSpecs(it) {
    const r = it.result || {};
    const sheetOn = S.ed.view === 'sheet' && it.sheet && (it.sheet.groups || []).length;
    $('vSheet').setAttribute('aria-pressed', String(!!sheetOn));
    $('vBrand').setAttribute('aria-pressed', String(!sheetOn));
    $('vSheet').disabled = !(it.sheet && (it.sheet.groups || []).length);
    const groups = sheetOn ? it.sheet.groups : groupsOf(r);
    $('edSpecs').innerHTML =
      groups.map((g) => '<div class="sgroup"><input type="text" data-gt value="' + esc(g.title || '') + '" placeholder="Section title" aria-label="Section title">' + (g.rows || []).map(specRow).join('') + '<button type="button" class="addrow" data-addrow>+ add a line</button></div>').join('') ||
      '<p class="small muted">No specifications yet.</p>';
    const t = it.sheet && it.sheet.type;
    const total = t && t !== 'other' ? sheetLines(t) : 0;
    $('sheetCount').hidden = !total;
    $('sheetCount').textContent = total ? (it.sheet.filled || 0) + '/' + total + ' Electroplanet lines filled' : '';
    $('sheetNote').textContent = sheetOn
      ? 'The same lines as on Electroplanet for a ' + (typeLabel(t) || 'product').toLowerCase() + '. ' + (it.sheet.edited ? 'You edited these lines.' : 'Made from the brand page.')
      : it.sheet
      ? "The brand's own lines, as written on its website."
      : '';
    filterSpecs();
  }
  function filterSpecs() {
    const q = foldText($('specQ').value);
    $('edSpecs').querySelectorAll('.sgroup').forEach((g) => {
      let any = false;
      g.querySelectorAll('.srow').forEach((row) => {
        const hay = foldText(row.querySelector('[data-l]').value + ' ' + row.querySelector('[data-v]').value);
        const hit = !q || hay.indexOf(q) !== -1;
        row.hidden = !hit;
        row.classList.toggle('hit', !!q && hit);
        any = any || hit;
      });
      g.hidden = !!q && !any;
    });
  }
  function readGroups() {
    return Array.from($('edSpecs').querySelectorAll('.sgroup'))
      .map((g) => ({
        title: g.querySelector('[data-gt]').value.trim(),
        rows: Array.from(g.querySelectorAll('.srow'))
          .map((r) => ({ label: r.querySelector('[data-l]').value.trim(), value: r.querySelector('[data-v]').value.trim() }))
          .filter((r) => r.label || r.value),
      }))
      .filter((g) => g.rows.length || g.title);
  }
  let saveTimer = null;
  function edChanged() {
    S.ed.dirty = true;
    $('edSaved').textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveEditor, 700);
  }
  async function saveEditor() {
    clearTimeout(saveTimer);
    const it = S.items.get(S.openId);
    if (!it || !S.ed.dirty) return;
    const groups = readGroups();
    const pics = S.ed.pics;
    const patch = {
      name: $('fName').value.trim(),
      model: $('fModel').value.trim(),
      brand: $('fBrand').value.trim(),
      category: $('fCat').value.trim(),
      price: '',
      priceValue: null,
      mainImage: pics[0] || '',
      otherImages: pics.slice(1),
      specGroups: groups,
      specs: flatSpecs(groups),
    };
    if (S.ed.view === 'sheet' && it.sheet && (it.sheet.groups || []).length) {
      delete patch.specGroups;
      delete patch.specs;
      await send('edit-sheet', { id: it.id, groups });
    }
    const res = await send('edit-item', { id: it.id, patch });
    S.ed.dirty = false;
    const fresh = S.items.get(it.id);
    if (fresh) S.ed.stamp = stampOf(fresh);
    $('edSaved').textContent = res.ok ? 'Saved ✓' : 'Not saved: ' + (res.error || '');
  }
  async function closeEditor() {
    await saveEditor();
    S.openId = null;
    closeSheet('editor');
    render();
  }
  function problemReport(it) {
    const r = it.result || {};
    return {
      tool: VERSION_NAME + ' — problem report',
      page: it.url,
      status: it.status,
      message: it.message,
      recipeChosen: S.settings.recipeId,
      brand: r.brand || '',
      found: { name: r.name || '', model: r.model || '', pictures: r.mainImage ? 1 + (r.otherImages || []).length : 0, specRows: (r.specs || []).length, sections: (r.specGroups || []).map((g) => g.title + ' (' + g.rows.length + ')') },
      warnings: r.warnings || [],
      productType: typeOf(it) || '',
      sheet: it.sheet ? { type: it.sheet.type, lines: it.sheet.filled, sections: (it.sheet.groups || []).map((g) => g.title + ' (' + g.rows.length + ')'), brandLinesLeftOut: (it.sheet.extra || []).length } : null,
      debug: it.debug || '(none saved)',
    };
  }
  async function showReport(id) {
    let it = S.items.get(id);
    if (!it) return;
    const fresh = it.debug && it.debug.xray && Date.now() - (it.xrayAt || 0) < 30 * 60 * 1000;
    if (!fresh) {
      toast('Making a fresh report: a small window opens for a few seconds…');
      $('edReport').disabled = true;
      try {
        await send('xray', { id });
        for (let i = 0; i < 20; i++) {
          it = S.items.get(id) || it;
          if (it.xrayAt && Date.now() - it.xrayAt < 60000) break;
          await new Promise((res) => setTimeout(res, 150));
        }
      } finally {
        $('edReport').disabled = false;
      }
    }
    $('reportText').value = JSON.stringify(problemReport(S.items.get(id) || it), null, 1);
    $('reportDlg').showModal();
  }

  // ------------------------------------------------------------ sheets (editor / history / settings)
  function openSheet(name) {
    ['editor', 'history', 'settings'].forEach((n) => ($(n).hidden = n !== name));
    if (name === 'history') renderHistory();
    if (name === 'settings') showSettings(true);
  }
  function closeSheet(name) {
    $(name).hidden = true;
    $('list').focus({ preventScroll: true });
  }
  function renderHistory() {
    const h = S.history || [];
    $('histList').innerHTML = h.length
      ? h
          .map((e) => {
            const d = new Date(e.at);
            const when = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            return '<div class="hist"><div class="row"><span class="when">' + esc(when) + '</span><span class="pill">' + plural(e.count, 'product') + '</span>' + (e.added != null && e.added < e.count ? '<span class="prob bad">' + (e.count - e.added) + ' refused</span>' : '') + '</div><ul>' +
              (e.sections || []).map((s) => '<li>' + esc(s.name) + ' — ' + s.n + '</li>').join('') + '</ul><p class="small muted">' + esc((e.names || []).join(' · ')) + '</p></div>';
          })
          .join('')
      : '<p class="muted">Nothing sent yet. When you send products to your site, they are written here.</p>';
  }

  // ------------------------------------------------------------ settings
  function applyTheme() {
    const t = S.settings.theme || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }
  function saveSettings() {
    const st = S.settings;
    st.recipeId = $('recipe').value || 'auto';
    st.workers = Number($('workers').value) || 4;
    st.lightLoad = $('lightLoad').checked;
    st.quickRead = $('quickRead').checked;
    st.slideshowMode = $('slideshowMode').value || 'ac-specs';
    st.sheetStyle = $('sheetStyle').value || 'electroplanet';
    st.keepExtra = $('keepExtra').checked;
    st.theme = $('theme').value || 'auto';
    st.v = 2;
    st.delayMs = Math.max(0, Math.round((Number($('delay').value) || 0) * 1000));
    st.maxPages = Math.max(1, Math.min(60, Number($('maxPages').value) || 10));
    chrome.storage.local.set({ settings: st });
    applyTheme();
  }
  function showSettings(force) {
    const st = S.settings;
    $('workers').value = String(st.workers);
    $('lightLoad').checked = st.lightLoad !== false;
    $('quickRead').checked = st.quickRead !== false;
    $('slideshowMode').value = st.slideshowMode || 'ac-specs';
    $('sheetStyle').value = st.sheetStyle || 'electroplanet';
    $('keepExtra').checked = !!st.keepExtra;
    $('theme').value = st.theme || 'auto';
    if (force || document.activeElement !== $('delay')) $('delay').value = String(st.delayMs / 1000);
    if (force || document.activeElement !== $('maxPages')) $('maxPages').value = String(st.maxPages);
    if ($('recipe').options.length) $('recipe').value = st.recipeId || 'auto';
    if (force) {
      $('siteUrl').value = st.siteUrl || '';
      $('siteKey').value = st.siteKey || '';
      $('siteMsg').textContent = siteOn() ? '✓ Connected to ' + (st.siteName || 'your site') + ' — ' + (S.sections || []).length + ' sections.' : '';
    }
  }
  async function testSite() {
    const url = $('siteUrl').value.trim();
    const key = $('siteKey').value.trim();
    const msg = $('siteMsg');
    if (!/^https?:\/\//i.test(url) || !key) return (msg.textContent = 'Paste both lines from your site first.');
    S.settings.siteUrl = url;
    S.settings.siteKey = key;
    msg.textContent = 'Testing…';
    try {
      const r = await api({ action: 'ping' }, 20000);
      S.settings.siteName = r.site || 'my site';
      S.sections = Array.isArray(r.sections) ? r.sections : [];
      chrome.storage.local.set({ settings: S.settings, siteSections: S.sections });
      msg.textContent = '✓ Connected to ' + S.settings.siteName + ' — ' + S.sections.length + ' sections found.';
    } catch (e) {
      S.settings.siteName = '';
      chrome.storage.local.set({ settings: S.settings });
      msg.textContent = e.message;
    }
    render();
  }
  function forgetSite() {
    S.settings.siteUrl = '';
    S.settings.siteKey = '';
    S.settings.siteName = '';
    S.sections = [];
    chrome.storage.local.set({ settings: S.settings, siteSections: [] });
    $('siteUrl').value = '';
    $('siteKey').value = '';
    $('siteMsg').textContent = 'Disconnected.';
    render();
  }

  // ------------------------------------------------------------ updates (updater/updater.js)
  function showUpdate(u) {
    const asked = /[?&]update=1/.test(location.search);
    const really = !!(u && u.latest && GHANDI_UPDATER.newer(u.latest, chrome.runtime.getManifest().version));
    const show = really && (u.dismissed !== u.latest || asked);
    $('updBar').hidden = !show;
    if (!show) return;
    $('updVer').textContent = u.latest;
    $('updNotes').innerHTML = (u.notes || []).map((n) => '<li>' + esc(n) + '</li>').join('');
  }
  // automatic install (no click): when a new version appears while this page is open, or when the owner's
  // site asks for it (bridge "update"). Needs the folder already allowed; else the blue box stays for a click.
  let autoUpdTried = '';
  async function autoUpdate(u, forced) {
    if (!u || !u.latest || !GHANDI_UPDATER.newer(u.latest, chrome.runtime.getManifest().version)) return;
    if ((S.settings || {}).autoUpdate === false && !forced) return;
    if (autoUpdTried === u.latest) return;
    autoUpdTried = u.latest;
    const say = (m) => ($('updMsg').textContent = m);
    try {
      const r = await GHANDI_UPDATER.installSilently(say);
      await chrome.storage.local.set({ autoUpdateResult: { at: Date.now(), to: u.latest, ok: !!r.ok, message: r.skipped || '' } });
    } catch (e) {
      await chrome.storage.local.set({ autoUpdateResult: { at: Date.now(), to: u.latest, ok: false, message: (e && e.message) || String(e) } });
    } finally {
      chrome.storage.local.remove('autoUpdateNow');
    }
  }
  async function installUpdate() {
    const say = (m) => ($('updMsg').textContent = m);
    $('updInstall').disabled = true;
    try {
      await GHANDI_UPDATER.install(say);
    } catch (e) {
      $('updInstall').disabled = false;
      if (e && e.name === 'AbortError') return say('You closed the folder window. Click "Install update" when you are ready.');
      if (e && (e.code === 'NO_PICKER' || e.name === 'SecurityError' || e.name === 'NotAllowedError') && !/[?&]update=1/.test(location.search)) {
        say('Opening a bigger window to finish…');
        chrome.tabs.create({ url: chrome.runtime.getURL('app/app.html?update=1') });
        return;
      }
      say((e && e.message) || String(e));
    }
  }
  async function wireUpdates() {
    $('verNow').textContent = chrome.runtime.getManifest().version;
    $('updInstall').addEventListener('click', installUpdate);
    $('updLater').addEventListener('click', async () => {
      const { update } = await chrome.storage.local.get('update');
      if (update) await chrome.storage.local.set({ update: Object.assign(update, { dismissed: update.latest }) });
      $('updBar').hidden = true;
      toast('OK. You can install it later in Settings → Updates.');
    });
    $('updCheck').addEventListener('click', async () => {
      $('updCheckMsg').textContent = 'Looking…';
      const r = await send('check-update');
      if (!r || !r.ok) return ($('updCheckMsg').textContent = 'I could not check: ' + ((r && r.error) || 'no answer'));
      const u = r.update;
      if (u.available) {
        await chrome.storage.local.set({ update: Object.assign(u, { dismissed: '' }) });
        $('updCheckMsg').textContent = 'Version ' + u.latest + ' is ready: see the blue box at the top.';
        showUpdate(u);
        closeSheet('settings');
        $('updBar').classList.add('flash');
      } else $('updCheckMsg').textContent = 'You have the newest version (' + u.current + ').';
    });
    $('updUndo').addEventListener('click', async () => {
      try {
        await GHANDI_UPDATER.undo((m) => ($('updCheckMsg').textContent = m));
      } catch (e) {
        $('updCheckMsg').textContent = (e && e.message) || String(e);
      }
    });
    try {
      const b = await GHANDI_UPDATER.hasBackup();
      $('updUndo').hidden = !(b && b.version);
    } catch (e) {
      /* fine */
    }
    const { update, justUpdated, autoUpdateNow } = await chrome.storage.local.get(['update', 'justUpdated', 'autoUpdateNow']);
    showUpdate(update);
    autoUpdate(update, !!autoUpdateNow);
    if (justUpdated && Date.now() - justUpdated.at < 10 * 60 * 1000 && justUpdated.to === chrome.runtime.getManifest().version) {
      toast(justUpdated.undo ? 'Back to version ' + justUpdated.to + '.' : 'Updated to version ' + justUpdated.to + ' ✓');
      chrome.storage.local.remove('justUpdated');
    }
    if (/[?&]update=1/.test(location.search) && !$('updBar').hidden) {
      $('updBar').classList.add('flash');
      $('updMsg').textContent = 'Click "Install update" to finish.';
    }
    if (!update || Date.now() - (update.checkedAt || 0) > 3600 * 1000) send('check-update');
  }

  // ------------------------------------------------------------ wiring
  function wire() {
    $('setBtn').addEventListener('click', () => openSheet('settings'));
    $('histBtn').addEventListener('click', () => openSheet('history'));
    $('siteChip').addEventListener('click', () => {
      openSheet('settings');
      $('setSite').scrollIntoView();
      if (!siteOn()) $('siteUrl').focus();
    });
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeSheet(b.closest('.sheet').id)));
    // smart start
    $('startGo').addEventListener('click', () => startAct($('startGo').dataset.act));
    $('startAlt').addEventListener('click', () => startAct($('startAlt').dataset.act));
    $('startType').addEventListener('click', (e) => typeMenu(e.currentTarget, (v) => {
      S.startType = v;
      renderStart();
    }, true));
    $('siteChips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-home]');
      if (b) chrome.tabs.create({ url: b.dataset.home });
    });
    $('linksGo').addEventListener('click', addLinks);
    $('progStop').addEventListener('click', async () => {
      await send('stop');
      toast('Stopping…');
    });
    // review tools
    $('filters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      S.filter = b.dataset.f;
      $('list').scrollTop = 0;
      render();
    });
    let qTimer;
    $('q').addEventListener('input', () => {
      clearTimeout(qTimer);
      qTimer = setTimeout(() => {
        S.q = $('q').value.trim().toLowerCase();
        $('list').scrollTop = 0;
        render();
      }, 120);
    });
    $('groupBy').addEventListener('change', () => {
      S.group = $('groupBy').value;
      render();
    });
    $('selAll').addEventListener('click', () => {
      const all = MODEL.ids.every((id) => S.sel.has(id));
      MODEL.ids.forEach((id) => (all ? S.sel.delete(id) : S.sel.add(id)));
      render();
    });
    $('bulk').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bulk]');
      if (b) bulk(b.dataset.bulk, b);
    });
    // the list
    const box = $('list');
    let raf = 0;
    box.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        renderList();
      });
    });
    window.addEventListener('resize', () => {
      buildModel();
      renderList(true);
    });
    box.addEventListener('click', (e) => {
      const card = e.target.closest('.card-item');
      if (!card) return;
      const id = card.dataset.id;
      S.focusId = id;
      if (e.target.closest('[data-ck]')) return toggleSel(id, e.target.checked);
      if (e.target.closest('.ck')) return;
      if (e.target.closest('[data-fixsave]')) return saveFixModel();
      if (e.target.closest('.fixin')) return;
      const f = e.target.closest('[data-fix]');
      if (f) return fix(id, f.dataset.fix, f);
      if (e.target.closest('[data-sec]')) return pickSection(e.target.closest('[data-sec]'), idsForAction(id));
      if (e.shiftKey || e.ctrlKey || e.metaKey) return toggleSel(id);
      openEditor(id);
    });
    box.addEventListener('keydown', (e) => {
      if (e.target.dataset && e.target.dataset.fixmodel !== undefined) {
        if (e.key === 'Enter') saveFixModel();
        if (e.key === 'Escape') {
          S.fixing = null;
          renderList(true);
          box.focus();
        }
        return;
      }
      if (e.target !== box && e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(-1);
      } else if (e.key === 'Enter' && S.focusId) {
        e.preventDefault();
        openEditor(S.focusId);
      } else if (e.key === ' ' && S.focusId) {
        e.preventDefault();
        toggleSel(S.focusId);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && S.focusId) {
        e.preventDefault();
        const ids = idsForAction(S.focusId);
        const i = MODEL.ids.indexOf(S.focusId);
        softRemove(ids);
        S.focusId = MODEL.ids[Math.min(i, MODEL.ids.length - 1)] || null;
        renderList(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        MODEL.ids.forEach((id) => S.sel.add(id));
        render();
      }
    });
    box.addEventListener('focus', () => {
      if (!S.focusId && MODEL.ids.length) {
        S.focusId = MODEL.ids[0];
        renderList(true);
      }
    });
    // footer
    $('sendAll').addEventListener('click', () => {
      if ($('sendAll').dataset.mode === 'connect') {
        openSheet('settings');
        return $('siteUrl').focus();
      }
      sendToSite(list().filter((it) => (MODEL.infos.get(it.id) || info(it)).state === 'ready'));
    });
    $('undoBtn').addEventListener('click', undoRemove);
    // editor
    $('edBack').addEventListener('click', closeEditor);
    ['fName', 'fModel', 'fBrand', 'fCat'].forEach((id) => $(id).addEventListener('input', edChanged));
    $('fType').addEventListener('change', async () => {
      await send('set-type', { ids: [S.openId], ptype: $('fType').value });
      S.ed.view = 'sheet';
      toast('Type saved.');
    });
    $('edSpecs').addEventListener('input', edChanged);
    $('edSpecs').addEventListener('click', (e) => {
      if (e.target.closest('[data-sdel]')) {
        e.target.closest('.srow').remove();
        edChanged();
      } else if (e.target.closest('[data-addrow]')) {
        e.target.closest('[data-addrow]').insertAdjacentHTML('beforebegin', specRow({ label: '', value: '' }));
        const rows = e.target.closest('.sgroup').querySelectorAll('.srow');
        rows[rows.length - 1].querySelector('input').focus();
      }
    });
    $('edAddGroup').addEventListener('click', () => {
      $('edSpecs').insertAdjacentHTML('beforeend', '<div class="sgroup"><input type="text" data-gt value="" placeholder="Section title">' + specRow({ label: '', value: '' }) + '<button type="button" class="addrow" data-addrow>+ add a line</button></div>');
      $('edSpecs').lastElementChild.querySelector('input').focus();
    });
    $('specQ').addEventListener('input', filterSpecs);
    $('vSheet').addEventListener('click', async () => {
      await saveEditor();
      S.ed.view = 'sheet';
      renderSpecs(S.items.get(S.openId));
    });
    $('vBrand').addEventListener('click', async () => {
      await saveEditor();
      S.ed.view = 'brand';
      renderSpecs(S.items.get(S.openId));
    });
    // pictures: click = big preview, × = remove, drag = new order
    const pics = $('edPics');
    let dragFrom = -1;
    pics.addEventListener('click', (e) => {
      const x = e.target.closest('[data-xp]');
      if (x) {
        S.ed.pics.splice(Number(x.dataset.xp), 1);
        renderPics();
        return edChanged();
      }
      const p = e.target.closest('.pic');
      if (p) {
        S.ed.cur = Number(p.dataset.i);
        renderPics();
      }
    });
    pics.addEventListener('dragstart', (e) => {
      const p = e.target.closest('.pic');
      if (!p) return;
      dragFrom = Number(p.dataset.i);
      p.classList.add('drag');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragFrom));
    });
    pics.addEventListener('dragover', (e) => {
      const p = e.target.closest('.pic');
      if (!p) return;
      e.preventDefault();
      pics.querySelectorAll('.over').forEach((x) => x.classList.remove('over'));
      p.classList.add('over');
    });
    pics.addEventListener('drop', (e) => {
      const p = e.target.closest('.pic');
      if (!p || dragFrom < 0) return;
      e.preventDefault();
      const to = Number(p.dataset.i);
      const [moved] = S.ed.pics.splice(dragFrom, 1);
      S.ed.pics.splice(to, 0, moved);
      S.ed.cur = to;
      dragFrom = -1;
      renderPics();
      edChanged();
    });
    pics.addEventListener('dragend', () => {
      dragFrom = -1;
      pics.querySelectorAll('.drag,.over').forEach((x) => x.classList.remove('drag', 'over'));
    });
    $('edAddPic').addEventListener('click', (e) => {
      const m = openMenu(e.currentTarget, '<input type="url" placeholder="Paste a picture link (https://…)" data-picurl><button type="button" data-v="add">Add this picture</button>', () => {
        const u = (m.querySelector('[data-picurl]') || {}).value || '';
        if (/^https?:\/\//i.test(u.trim())) {
          S.ed.pics.push(u.trim());
          renderPics();
          edChanged();
        }
      });
      m.querySelector('[data-picurl]').addEventListener('keydown', (ev) => ev.key === 'Enter' && m.querySelector('[data-v]').click());
    });
    $('edRegrab').addEventListener('click', async () => {
      await send('retry', { ids: [S.openId] });
      toast('Grabbing it again… the editor updates by itself.');
    });
    $('edReport').addEventListener('click', () => showReport(S.openId));
    $('reportCopy').addEventListener('click', () => copyText($('reportText').value, 'Report copied. Paste it in your message to Claude.'));
    $('reportClose').addEventListener('click', () => $('reportDlg').close());
    // settings
    ['workers', 'lightLoad', 'quickRead', 'slideshowMode', 'sheetStyle', 'keepExtra', 'theme', 'recipe', 'delay', 'maxPages'].forEach((id) => $(id).addEventListener('change', saveSettings));
    $('siteTest').addEventListener('click', testSite);
    $('siteForget').addEventListener('click', forgetSite);
    $('exportBtn').addEventListener('click', download);
    $('clearSent').addEventListener('click', () => {
      const ids = list().filter((it) => it.sentAt).map((it) => it.id);
      if (!ids.length) return toast('No sent products in the list.');
      closeSheet('settings');
      softRemove(ids, 'Removed ' + plural(ids.length, 'sent product') + '.');
    });
    $('clearAll').addEventListener('click', () => {
      const ids = list().map((it) => it.id);
      if (!ids.length) return toast('The list is already empty.');
      closeSheet('settings');
      softRemove(ids, 'The list is empty now (' + plural(ids.length, 'product') + ').');
    });
    // keyboard everywhere
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('menu').hidden) return closeMenu();
        if ($('reportDlg').open) return;
        if (!$('editor').hidden) return closeEditor();
        ['history', 'settings'].forEach((n) => !$(n).hidden && closeSheet(n));
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (!$('menu').hidden && !e.target.closest('#menu')) closeMenu();
    });
    try {
      chrome.tabs.onActivated.addListener(scheduleTab);
      chrome.tabs.onUpdated.addListener((id, inf) => (inf.url || inf.status === 'complete') && scheduleTab());
      chrome.windows.onFocusChanged.addListener(scheduleTab);
    } catch (e) {
      /* no tab events */
    }
  }
  let tabTimer = null;
  const scheduleTab = () => {
    clearTimeout(tabTimer);
    tabTimer = setTimeout(refreshTab, 200);
  };

  // ------------------------------------------------------------ storage -> screen
  function ingest(all) {
    S.items.clear();
    Object.keys(all).forEach((k) => {
      if (k.indexOf('it:') === 0) S.items.set(k.slice(3), all[k]);
    });
    S.order = all.ids || [];
    S.settings = Object.assign({}, DEFAULTS, all.settings || {});
    if (all.settings && all.settings.v !== 2) {
      S.settings = Object.assign({}, S.settings, { v: 2, workers: 4, delayMs: 300, lightLoad: true });
      chrome.storage.local.set({ settings: S.settings });
    }
    S.run = all.run || {};
    S.crawl = all.crawl || {};
    S.sections = all.siteSections || [];
    S.history = all.sendHistory || [];
  }
  function onChanged(changes, area) {
    if (area !== 'local') return;
    Object.keys(changes).forEach((k) => {
      const nv = changes[k].newValue;
      if (k.indexOf('it:') === 0) {
        if (nv === undefined) {
          S.items.delete(k.slice(3));
          S.sel.delete(k.slice(3));
        } else S.items.set(k.slice(3), nv);
      } else if (k === 'ids') S.order = nv || [];
      else if (k === 'update') {
        showUpdate(nv);
        autoUpdate(nv);
      } else if (k === 'autoUpdateNow' && nv) chrome.storage.local.get('update').then((o) => autoUpdate(o.update, true));
      else if (k === 'run') S.run = nv || {};
      else if (k === 'crawl') S.crawl = nv || {};
      else if (k === 'autoSend' && nv) setTimeout(() => autoSend(nv), 300);
      else if (k === 'siteSections') S.sections = nv || [];
      else if (k === 'sendHistory') S.history = nv || [];
      else if (k === 'settings') {
        S.settings = Object.assign({}, DEFAULTS, nv || {});
        applyTheme();
      }
    });
    scheduleRender();
  }

  // ------------------------------------------------------------ "send" asked from the owner's site (bridge/bridge.js)
  // The site's admin page asks; this page (side panel or tab) does the normal send, then writes the answer.
  let autoBusy = false;
  async function autoSend(req) {
    if (!req || !req.token || autoBusy || Date.now() - (req.at || 0) > 5 * 60 * 1000) return;
    const mine = Math.random().toString(36).slice(2);
    const cur = (await chrome.storage.local.get('autoSendClaim')).autoSendClaim;
    if (cur && cur.token === req.token) return; // another open copy of this page took it
    await chrome.storage.local.set({ autoSendClaim: { token: req.token, by: mine } });
    await new Promise((r) => setTimeout(r, 250));
    const claim = (await chrome.storage.local.get('autoSendClaim')).autoSendClaim;
    if (!claim || claim.by !== mine) return;
    autoBusy = true;
    const before = (S.history || [])[0];
    try {
      const all = await chrome.storage.local.get((req.ids || []).map((id) => 'it:' + id));
      const items = (req.ids || []).map((id) => all['it:' + id]).filter(Boolean);
      await sendToSite(items);
      const entry = (S.history || [])[0];
      await chrome.storage.local.set({ autoSendResult: { token: req.token, at: Date.now(), ok: !!(entry && entry !== before), entry: entry !== before ? entry : null, message: $('footMsg').textContent || $('toast').textContent || '' } });
    } catch (e) {
      await chrome.storage.local.set({ autoSendResult: { token: req.token, at: Date.now(), ok: false, message: e.message } });
    } finally {
      autoBusy = false;
      chrome.storage.local.remove('autoSend');
    }
  }

  async function init() {
    wire();
    wireUpdates();
    const all = await chrome.storage.local.get(null);
    ingest(all);
    applyTheme();
    await loadRecipes();
    showSettings(true);
    render();
    await refreshTab();
    chrome.storage.onChanged.addListener(onChanged);
    // the progress text (time left) moves even when nothing new arrives
    setInterval(() => {
      if ((S.run || {}).state === 'running') renderProg();
    }, 2000);
    window.GHANDI_APP = { S, render, info, sectionFor }; // for the UI test
    if (all.autoSend) autoSend(all.autoSend);
  }
  init();
})();
