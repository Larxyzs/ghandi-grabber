/*
  app.js — the dashboard.
  It only SHOWS things and sends orders to background.js.
  Everything it shows comes from chrome.storage.local (see background.js).
*/
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const DEFAULTS = { quickRead: true, autoGrab: true, v: 2, recipeId: 'auto', category: '', maxPages: 10, delayMs: 300, workers: 4, lightLoad: true, slideshowMode: 'ac-specs', askType: true, sheetStyle: 'electroplanet', keepExtra: false };
  const S = {
    items: new Map(),
    order: [],
    settings: Object.assign({}, DEFAULTS),
    run: {},
    crawl: {},
    sel: new Set(),
    filter: 'all',
    q: '',
    recipes: [],
    openId: null,
    tab: null,
    sections: [],
    dirty: false,
    stamp: '',
  };

  // ------------------------------------------------------------ tiny helpers
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3800);
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
      /* the menu will just have fewer brands */
    }
    S.recipes = window.GHANDI.recipes.slice();
    const sel = $('recipe');
    sel.innerHTML =
      '<option value="auto">Auto — pick by website</option>' +
      S.recipes.map((r) => '<option value="' + esc(r.id) + '">' + esc(r.brand) + '</option>').join('') +
      '<option value="generic">General method (no recipe)</option>';
    sel.value = S.settings.recipeId;
    if (sel.value !== S.settings.recipeId) sel.value = 'auto';
    $('siteChips').innerHTML = S.recipes
      .filter((r) => r.home)
      .map((r) => '<button class="sitechip" type="button" data-home="' + esc(r.home) + '" title="' + esc(r.home) + '">' + esc(r.brand) + '</button>')
      .join('');
  }
  function detect(urlStr) {
    const h = host(urlStr);
    if (!h) return null;
    return S.recipes.find((r) => r.match.some((m) => h.indexOf(m) !== -1)) || null;
  }
  function updateHint() {
    const id = $('recipe').value;
    const hint = $('recipeHint');
    if (id === 'auto') {
      const url = ($('catUrl').value || '').trim() || (($('linksBox').value || '').match(/https?:\/\/\S+/) || [''])[0];
      const r = url && detect(url);
      hint.innerHTML = r
        ? 'Auto will use the <b>' + esc(r.brand) + '</b> recipe for this website.'
        : url
        ? 'I have no recipe for this website, so I will use the general method.'
        : 'Auto looks at the website name and picks the right recipe by itself.';
    } else if (id === 'generic') {
      hint.textContent = 'Using the general method for every page. It works everywhere, but a brand recipe is more exact.';
    } else {
      const r = S.recipes.find((x) => x.id === id);
      hint.innerHTML = 'Using the <b>' + esc(r ? r.brand : id) + '</b> recipe for every page, whatever the website.';
    }
  }

  // ------------------------------------------------------------ the page you are on
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

  async function refreshTab() {
    let tab = null;
    try {
      const act = await chrome.tabs.query({ active: true, lastFocusedWindow: true, windowType: 'normal' });
      tab = act.find((t) => /^https?:/i.test(t.url || '')) || null;
      if (!tab) {
        // full-page mode: this page IS the active tab -> use the last web page you looked at
        const all = await chrome.tabs.query({ windowType: 'normal' });
        const web = all.filter((t) => /^https?:/i.test(t.url || '')).sort((x, y) => (y.lastAccessed || 0) - (x.lastAccessed || 0));
        tab = web[0] || null;
      }
    } catch (e) {
      tab = null;
    }
    S.tab = tab;
    renderHere();
  }

  function renderHere() {
    const tab = S.tab;
    const chip = $('hereBrand');
    const find = $('hereFind');
    const grab = $('hereGrab');
    if (!tab) {
      $('hereUrl').textContent = 'Open a brand website in Chrome. I will see it here.';
      chip.hidden = true;
      find.disabled = grab.disabled = true;
      return;
    }
    const r = $('recipe').value === 'auto' ? detect(tab.url) : S.recipes.find((x) => x.id === $('recipe').value);
    chip.hidden = false;
    chip.textContent = r ? r.brand : 'No recipe';
    chip.className = 'brandchip' + (r ? '' : ' none');
    let shown = tab.url;
    try {
      const u = new URL(tab.url);
      shown = u.hostname.replace(/^www\./, '') + decodeURIComponent(u.pathname);
    } catch (e) {
      /* keep the full link */
    }
    const isProduct = looksLikeProduct(tab.url, r);
    $('hereUrl').innerHTML = esc(shown.length > 120 ? shown.slice(0, 117) + '…' : shown) + '<br><span class="kind">' + (isProduct ? 'Looks like a product page' : 'Looks like a list of products') + '</span>';
    // is this page already in my list?
    const key = keyOfUrl(tab.url);
    const have = list().find((it) => it.key === key);
    const hv = $('hereHave');
    if (have) {
      hv.hidden = false;
      hv.innerHTML = '✓ Already in your list (' + esc(LABEL[have.status]) + ') <button class="copylink" type="button" data-open="' + have.id + '">show it</button>';
    } else hv.hidden = true;
    const crawling = (S.crawl || {}).state === 'running';
    find.disabled = crawling;
    grab.disabled = false;
    find.className = isProduct ? 'ghost' : 'primary';
    grab.className = isProduct ? 'primary' : 'ghost';
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

  let tabTimer = null;
  const scheduleTab = () => {
    clearTimeout(tabTimer);
    tabTimer = setTimeout(refreshTab, 150);
  };

  // ------------------------------------------------------------ settings
  function saveSettings() {
    S.settings.recipeId = $('recipe').value;
    S.settings.category = $('category').value.trim();
    S.settings.workers = Number($('workers').value) || 4;
    S.settings.lightLoad = $('lightLoad').checked;
    S.settings.slideshowMode = $('slideshowMode').value || 'ac-specs';
    S.settings.sheetStyle = $('sheetStyle').value || 'electroplanet';
    S.settings.askType = $('askType').checked;
    S.settings.keepExtra = $('keepExtra').checked;
    S.settings.autoGrab = $('autoGrab').checked;
    S.settings.quickRead = $('quickRead').checked;
    S.settings.v = 2;
    S.settings.delayMs = Math.max(0, Math.round((Number($('delay').value) || 0) * 1000));
    S.settings.maxPages = Math.max(1, Math.min(60, Number($('maxPages').value) || 10));
    chrome.storage.local.set({ settings: S.settings });
  }
  function showSettings(force) {
    const st = S.settings;
    if (force || document.activeElement !== $('category')) $('category').value = st.category || '';
    $('workers').value = String(st.workers);
    $('lightLoad').checked = st.lightLoad !== false;
    $('slideshowMode').value = st.slideshowMode || 'ac-specs';
    $('sheetStyle').value = st.sheetStyle || 'electroplanet';
    $('askType').checked = st.askType !== false;
    $('keepExtra').checked = !!st.keepExtra;
    $('autoGrab').checked = st.autoGrab !== false;
    $('quickRead').checked = st.quickRead !== false;
    if (force || document.activeElement !== $('delay')) $('delay').value = String(st.delayMs / 1000);
    if (force || document.activeElement !== $('maxPages')) $('maxPages').value = String(st.maxPages);
    if ($('recipe').options.length) $('recipe').value = st.recipeId;
  }

  // ------------------------------------------------------------ item helpers
  const LABEL = { found: 'Not grabbed', queued: 'In line', working: 'Working…', done: 'Done', check: 'Check me', failed: 'Failed' };
  const list = () => S.order.map((id) => S.items.get(id)).filter(Boolean);
  const nameOf = (it) => (it.result && it.result.name) || it.title || '';
  const picOf = (it) => (it.result && it.result.mainImage) || it.image || '';

  function guessModel(it) {
    const r = it.result || {};
    if (r.model) return r.model;
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
  function currencyOf(price) {
    if (/€|eur/i.test(price)) return 'EUR';
    if (/mad|dh|dirham/i.test(price)) return 'MAD';
    if (/\$|usd/i.test(price)) return 'USD';
    return '';
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

  // ------------------------------------------------------------ the export file
  // the specifications to send: the Electroplanet-style sheet (default) or the brand's own lines
  const TYPE_NAMES = {};
  try {
    GHANDI_SHEETS.types().forEach((t) => (TYPE_NAMES[t.id] = t));
  } catch (e) {
    /* no sheets */
  }
  const typeOf = (it) => (it.sheet && it.sheet.type) || it.ptype || it.ptypeAuto || '';
  const typeLabel = (id) => (TYPE_NAMES[id] ? TYPE_NAMES[id].label : id === 'other' ? 'Autre' : '');
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
      price: r.price || '',
      priceValue: r.priceValue == null || r.priceValue === '' ? null : Number(r.priceValue),
      currency: currencyOf(r.price || ''),
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
  function buildExport() {
    const what = $('exportWhat').value;
    let items = list().filter((it) => it.result && (it.status === 'done' || it.status === 'check'));
    if (what === 'new') items = items.filter((it) => !it.exportedAt);
    if (what === 'done') items = items.filter((it) => it.status === 'done');
    if (what === 'selected') items = items.filter((it) => S.sel.has(it.id));
    const failed = what === 'all' ? list().filter((it) => it.status === 'failed').map((it) => ({ sourceUrl: it.url, error: it.message || '' })) : [];
    return {
      schema: 'ghandi-products/v1',
      generatedAt: new Date().toISOString(),
      generator: 'Ghandi Product Grabber 3.7',
      count: items.length,
      ids: items.map((it) => it.id),
      products: items.map(productOf),
      failed,
    };
  }
  // after a download/copy, remember which products were sent (for "New since my last download")
  function markSent(data) {
    const ids = data.ids || [];
    delete data.ids;
    if (ids.length) send('mark-exported', { ids });
  }
  function download() {
    const data = buildExport();
    if (data.count) markSent(data);
    if (!data.count) return toast($('exportWhat').value === 'new' ? 'No new products since your last download. Choose "Everything grabbed" to download all again.' : 'Nothing to send yet. Grab some products first.');
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const name = 'ghandi-products-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
    toast('Saved ' + data.count + ' products in ' + name);
  }
  function copyJson() {
    const data = buildExport();
    if (!data.count) return toast($('exportWhat').value === 'new' ? 'No new products since your last download.' : 'Nothing to copy yet. Grab some products first.');
    markSent(data);
    copyText(JSON.stringify(data, null, 2), 'Copied ' + data.count + ' products.');
  }

  // ------------------------------------------------------------ drawing the page
  let renderTimer = null;
  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      render();
    }, 120);
  }

  function counts() {
    const c = { all: 0, found: 0, progress: 0, done: 0, check: 0, failed: 0 };
    list().forEach((it) => {
      c.all++;
      if (it.status === 'found') c.found++;
      else if (it.status === 'queued' || it.status === 'working') c.progress++;
      else if (c[it.status] != null) c[it.status]++;
    });
    return c;
  }
  const FILTERS = [
    ['all', 'All', '#14201f'],
    ['found', 'Not grabbed', '#6d7a74'],
    ['progress', 'In progress', '#1c6fc4'],
    ['done', 'Done', '#1d9a52'],
    ['check', 'Check me', '#e5a200'],
    ['failed', 'Failed', '#cf2a30'],
  ];
  function matchFilter(it) {
    const f = S.filter;
    if (f === 'all') return true;
    if (f === 'progress') return it.status === 'queued' || it.status === 'working';
    return it.status === f;
  }
  function visibleItems() {
    const q = S.q.trim().toLowerCase();
    return list().filter((it) => {
      if (!matchFilter(it)) return false;
      if (!q) return true;
      const r = it.result || {};
      return [nameOf(it), it.url, r.brand, it.category, guessModel(it)].join(' ').toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderChips() {
    const c = counts();
    $('chips').innerHTML = FILTERS.map(
      ([key, label, color]) =>
        '<button class="chip" type="button" data-f="' + key + '" aria-pressed="' + (S.filter === key) + '"><span class="dot" style="background:' + color + '"></span>' +
        esc(label) + ' <b>' + c[key] + '</b></button>'
    ).join('');
  }

  function rowHtml(it) {
    const r = it.result || {};
    const pic = picOf(it);
    const nImgs = r.mainImage ? 1 + (r.otherImages || []).length : 0;
    const nSpecs = (r.specs || []).length;
    const sub = [host(it.url)];
    if (it.category) sub.unshift('<span class="cat">' + esc(it.category) + '</span>');
    const tid = typeOf(it);
    if (tid && tid !== 'other') sub.push('<span class="ptag' + (it.ptypeBy === 'you' ? '' : ' auto') + '" title="' + (it.ptypeBy === 'you' ? 'Type chosen by you' : 'Type guessed by the extension') + '">' + esc(((TYPE_NAMES[tid] || {}).icon || '') + ' ' + typeLabel(tid)) + '</span>');
    if (guessModel(it)) sub.push(esc(guessModel(it)));
    if (it.sentAt) sub.push('<span class="sent-tag">✓ sent to site</span>');
    return (
      '<tr data-id="' + it.id + '" class="' + (S.sel.has(it.id) ? 'sel' : '') + '">' +
      '<td class="c-check"><input type="checkbox" data-sel aria-label="Select" ' + (S.sel.has(it.id) ? 'checked' : '') + '></td>' +
      '<td class="c-pic">' + (pic ? '<img class="thumb" loading="lazy" referrerpolicy="no-referrer" src="' + esc(pic) + '" alt="">' : '<span class="thumb none"></span>') + '</td>' +
      '<td><div class="pname">' + (esc(nameOf(it)) || '<span class="dim">' + esc(it.url) + '</span>') + '</div><div class="psub">' + sub.join(' · ') + '</div>' +
      (r.mainImage || nSpecs ? '<div class="pmeta">' + [r.brand, nImgs ? nImgs + ' pictures' : '', nSpecs ? nSpecs + ' specs' : '', r.slideshowMode ? '❄ slideshow mode' : '', it.mode === 'quick' ? '⚡ quick read' : '', it.seconds ? it.seconds + ' s' : ''].filter(Boolean).join(' · ') + '</div>' : '') +
      '</td>' +
      '<td class="c-brand">' + (esc(r.brand) || '<span class="dim">—</span>') + '</td>' +
      '<td class="c-price"><span class="price">' + (esc(r.price) || '<span class="dim">—</span>') + '</span></td>' +
      '<td class="c-num">' + (r.mainImage ? nImgs : '<span class="dim">–</span>') + '</td>' +
      '<td class="c-num">' + (nSpecs || '<span class="dim">–</span>') + '</td>' +
      '<td class="c-status"><span class="st ' + it.status + '">' + LABEL[it.status] + '</span>' + (it.message && it.status !== 'done' ? '<span class="smsg">' + esc(it.message) + '</span>' : '') + '</td>' +
      '<td class="c-act">' +
      '<button class="act" data-act="retry" title="Grab again" aria-label="Grab again">↻</button>' +
      '<a class="act" data-act="open" title="Open the original page" aria-label="Open the original page" href="' + esc(it.url) + '" target="_blank" rel="noreferrer" style="display:inline-block;text-align:center;text-decoration:none;line-height:28px">↗</a>' +
      '<button class="act" data-act="remove" title="Remove from list" aria-label="Remove from list">✕</button>' +
      '</td></tr>'
    );
  }

  function renderRows() {
    const shown = visibleItems();
    const all = list();
    $('empty').hidden = all.length > 0;
    $('table').hidden = all.length === 0;
    $('rows').innerHTML = shown.map(rowHtml).join('');
    const ca = $('checkAll');
    ca.checked = shown.length > 0 && shown.every((it) => S.sel.has(it.id));
    const n = S.sel.size;
    $('bulkBar').hidden = n === 0;
    const allOn = shown.length > 0 && shown.every((it) => S.sel.has(it.id));
    $('selAll').textContent = allOn ? 'Select none' : 'Select all (' + shown.length + ')';
    renderSite();
    $('bulkCount').textContent = n + ' selected';
  }

  function renderDock() {
    const items = list();
    const run = S.run || {};
    const running = run.state === 'running';
    const crawling = (S.crawl || {}).state === 'running';

    // one LED per product (grouped when there are many)
    const MAX = 90;
    const per = Math.max(1, Math.ceil(items.length / MAX));
    const rank = { working: 6, failed: 5, check: 4, queued: 3, found: 2, done: 1 };
    let html = '';
    for (let i = 0; i < items.length; i += per) {
      const chunk = items.slice(i, i + per);
      const st = chunk.reduce((a, b) => (rank[b.status] > rank[a] ? b.status : a), chunk[0].status);
      html += '<i class="' + st + '"></i>';
    }
    if (!items.length) for (let i = 0; i < 30; i++) html += '<i></i>';
    $('leds').innerHTML = html;
    $('leds').classList.toggle('empty-leds', !items.length);
    $('leds').classList.toggle('big', items.length <= 40);

    const c = counts();
    $('counts').innerHTML =
      '<span><b>' + c.all + '</b> products</span><span><b>' + c.done + '</b> done</span>' +
      (c.check ? '<span><b>' + c.check + '</b> to check</span>' : '') +
      (c.failed ? '<span><b>' + c.failed + '</b> failed</span>' : '') +
      (c.found + c.progress ? '<span><b>' + (c.found + c.progress) + '</b> left</span>' : '');
    let msg = run.message || '';
    if (!running && !msg) msg = items.length ? 'Ready.' : 'Add some products to begin.';
    if (running && run.total) {
      msg = '[' + (run.done || 0) + '/' + run.total + '] ' + msg;
      const since = run.startedAt || Date.now();
      const doneNow = items.filter((it) => it.finishedAt && it.finishedAt >= since && it.status !== 'queued' && it.status !== 'working').length;
      const mins = (Date.now() - since) / 60000;
      const left = items.filter((it) => it.status === 'queued' || it.status === 'working').length;
      if (doneNow >= 2 && mins > 0) {
        const perMin = doneNow / mins;
        const eta = left / perMin;
        msg += ' · ' + Math.round(perMin) + '/min · ' + (eta < 1 ? 'under a minute left' : '~' + Math.ceil(eta) + ' min left');
      }
    }
    if (crawling && !running) msg = 'Finding products — ' + ((S.crawl || {}).message || '');
    $('runMsg').textContent = msg;

    // buttons
    const grabBtn = $('grabBtn');
    const nSel = S.sel.size;
    const nFound = c.found;
    if (running) {
      grabBtn.disabled = true;
      grabBtn.textContent = 'Working…';
    } else if (nSel) {
      grabBtn.disabled = false;
      grabBtn.textContent = 'Grab ' + nSel + ' selected';
    } else {
      grabBtn.disabled = nFound === 0;
      grabBtn.textContent = nFound ? 'Grab ' + nFound : 'Grab';
    }
    $('stopBtn').disabled = !(running || crawling);
    $('retryFailed').hidden = running || !c.failed;
    $('retryFailed').textContent = 'Try the ' + c.failed + ' failed again';
    const fresh = items.filter((it) => it.result && (it.status === 'done' || it.status === 'check') && !it.exportedAt).length;
    const optNew = $('exportWhat').querySelector('option[value="new"]');
    if (optNew) optNew.textContent = 'New since my last download (' + fresh + ')';
    const cats = Array.from(new Set(items.map((it) => it.category).filter(Boolean).concat(S.settings.category ? [S.settings.category] : []))).sort();
    const dl = $('catList');
    const catHtml = cats.map((x) => '<option value="' + esc(x) + '"></option>').join('');
    if (dl.innerHTML !== catHtml) dl.innerHTML = catHtml;
    const ready = c.done + c.check;
    $('downloadBtn').disabled = ready === 0;
    $('copyBtn').disabled = ready === 0;
  }

  function renderCrawl() {
    const cr = S.crawl || {};
    const box = $('crawlBox');
    const running = cr.state === 'running';
    box.hidden = !(cr.message || running);
    const led = $('crawlLed');
    led.className = 'led ' + (running ? 'on' : cr.error ? 'bad' : cr.found ? 'good' : '');
    $('crawlMsg').textContent = cr.message || '';
    $('crawlStop').hidden = !running;
    $('crawlReport').hidden = !(cr.report && !running);
    $('findBtn').disabled = running;
    $('findTabBtn').disabled = running;
  }

  let lastCount = -1;
  let lastCrawl = '';
  let lastRun = '';
  function announce() {
    const cr = (S.crawl || {}).state || 'idle';
    const rn = (S.run || {}).state || 'idle';
    if (lastCrawl === 'running' && cr !== 'running' && S.crawl.message) toast(S.crawl.message);
    if (lastRun === 'running' && rn !== 'running') {
      const c = counts();
      toast('Finished: ' + c.done + ' done' + (c.check ? ', ' + c.check + ' to check' : '') + (c.failed ? ', ' + c.failed + ' failed' : '') + '.');
    }
    lastCrawl = cr;
    lastRun = rn;
  }
  function render() {
    announce();
    lastCount = S.order.length;
    renderChips();
    renderRows();
    renderDock();
    renderCrawl();
    renderHere();
    // the open drawer: reload if the product changed under it and the person is not typing
    if (S.openId) {
      const it = S.items.get(S.openId);
      if (!it) closeDrawer();
      else {
        const stamp = stampOf(it);
        if (stamp !== S.stamp && !S.dirty) fillDrawer(it);
        else if (stamp !== S.stamp) S.stamp = stamp;
      }
    }
  }

  // ------------------------------------------------------------ drawer
  const stampOf = (it) => it.status + '|' + it.finishedAt + '|' + (it.ptype || '') + '|' + ((it.sheet && it.sheet.at) || '') + '|' + ((it.sheet && it.sheet.edited) || '');
  function specGroupHtml(g) {
    return (
      '<div class="sgroup"><div class="sgroup-head"><input type="text" data-gt placeholder="Section title" value="' + esc(g.title || '') + '">' +
      '<button class="act" type="button" data-sdel-group title="Delete this section" aria-label="Delete this section">✕</button></div>' +
      (g.rows || []).map(rowEdit).join('') +
      '<div class="sfoot"><button class="mini" type="button" data-sadd>Add a row</button></div></div>'
    );
  }
  const rowEdit = (r) =>
    '<div class="srow"><input type="text" data-l placeholder="Label" value="' + esc(r.label) + '"><input type="text" data-v placeholder="Value" value="' + esc(r.value) +
    '"><button class="act" type="button" data-sdel title="Delete this row" aria-label="Delete this row">✕</button></div>';

  function fillDrawer(it) {
    const r = it.result || { name: '', brand: '', price: '', priceValue: null, mainImage: '', otherImages: [], specs: [], specGroups: [], warnings: [] };
    S.stamp = stampOf(it);
    S.dirty = false;
    $('dTitle').textContent = nameOf(it) || 'Product';
    $('dLink').href = it.url;
    $('dLink').textContent = host(it.url) + ' — open the original page';
    $('fName').value = r.name || '';
    $('fModel').value = guessModel(it);
    $('fBrand').value = r.brand || '';
    $('fCat').value = it.category || '';
    $('fPrice').value = r.price || '';
    $('fPriceNum').value = r.priceValue == null ? '' : r.priceValue;
    $('fMain').value = r.mainImage || '';
    $('fOthers').value = (r.otherImages || []).join('\n');
    renderPics();
    const notes = [];
    if (it.status === 'failed' || it.status === 'check') notes.push(it.message);
    (r.warnings || []).forEach((w) => notes.push(w));
    const uniq = Array.from(new Set(notes.filter(Boolean)));
    $('dWarn').hidden = !uniq.length;
    $('dWarn').innerHTML = uniq.length ? '<b>Please look at this:</b><ul>' + uniq.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '';
    fillTypeSelect($('fType'), it.ptype ? it.ptype : 'auto', it.ptypeAuto);
    if (S.viewFor !== it.id || !S.view) {
      S.view = it.sheet && (it.sheet.groups || []).length && S.settings.sheetStyle !== 'brand' ? 'sheet' : 'brand';
      S.viewFor = it.id;
    }
    showSpecs(it);
  }
  function fillTypeSelect(sel, value, auto) {
    const opts = [['auto', 'Detect by itself' + (auto && TYPE_NAMES[auto] ? ' (' + TYPE_NAMES[auto].label + ')' : '')]]
      .concat(Object.keys(TYPE_NAMES).map((id) => [id, TYPE_NAMES[id].icon + ' ' + TYPE_NAMES[id].label]))
      .concat([['other', 'Something else (brand lines)']]);
    sel.innerHTML = opts.map(([v, l]) => '<option value="' + v + '"' + (v === value ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
  }
  function showSpecs(it) {
    const r = it.result || {};
    const sheetOn = S.view === 'sheet' && it.sheet;
    $('viewSheet').setAttribute('aria-pressed', String(!!sheetOn));
    $('viewBrand').setAttribute('aria-pressed', String(!sheetOn));
    $('viewSheet').disabled = !it.sheet;
    const groups = sheetOn ? it.sheet.groups || [] : groupsOf(r);
    $('dSpecs').innerHTML = groups.map(specGroupHtml).join('') || '<p class="hint">No specifications yet.</p>';
    let note = '';
    if (sheetOn) {
      note = 'The same lines as on Electroplanet for a ' + (typeLabel(it.sheet.type) || 'product').toLowerCase() + '. ' + (it.sheet.edited ? 'You edited this sheet.' : 'Made from the ' + (r.brand || 'brand') + ' page' + ((it.sheet.extra || []).length ? ' (' + it.sheet.extra.length + ' other brand lines are kept apart)' : '') + '.');
    } else if (it.sheet) note = "The brand's own lines, as written on its website.";
    $('sheetNote').textContent = note;
  }
  function renderPics() {
    const main = $('fMain').value.trim();
    const others = $('fOthers').value.split('\n').map((x) => x.trim()).filter(Boolean);
    $('dPics').innerHTML = (main ? [main] : [])
      .concat(others)
      .slice(0, 40)
      .map(
        (u, i) =>
          '<span class="pic"><img ' + (i === 0 && main ? 'class="main" ' : '') + 'data-i="' + i + '" referrerpolicy="no-referrer" loading="lazy" src="' + esc(u) + '" alt="" title="Make this the main picture">' +
          '<button type="button" data-x="' + i + '" aria-label="Remove this picture">×</button></span>'
      )
      .join('');
  }
  function openDrawer(id) {
    const it = S.items.get(id);
    if (!it) return;
    S.openId = id;
    fillDrawer(it);
    $('drawer').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
    $('scrim').hidden = false;
    $('dClose').focus();
  }
  function closeDrawer() {
    S.openId = null;
    S.viewFor = null;
    $('drawer').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
    $('scrim').hidden = true;
  }
  function readGroups() {
    return Array.from($('dSpecs').querySelectorAll('.sgroup'))
      .map((g) => ({
        title: g.querySelector('[data-gt]').value.trim(),
        rows: Array.from(g.querySelectorAll('.srow'))
          .map((r) => ({ label: r.querySelector('[data-l]').value.trim(), value: r.querySelector('[data-v]').value.trim() }))
          .filter((r) => r.label || r.value),
      }))
      .filter((g) => g.rows.length || g.title);
  }
  async function saveDrawer() {
    const it = S.items.get(S.openId);
    if (!it) return;
    const groups = readGroups();
    const num = $('fPriceNum').value.trim();
    const patch = {
      name: $('fName').value.trim(),
      model: $('fModel').value.trim(),
      brand: $('fBrand').value.trim(),
      category: $('fCat').value.trim(),
      price: $('fPrice').value.trim(),
      priceValue: num === '' ? null : Number(num),
      mainImage: $('fMain').value.trim(),
      otherImages: $('fOthers').value.split('\n').map((x) => x.trim()).filter(Boolean),
      specGroups: groups,
      specs: flatSpecs(groups),
    };
    if (S.view === 'sheet' && it.sheet) {
      // the Electroplanet-style lines are yours now; the brand's lines stay as they were
      delete patch.specGroups;
      delete patch.specs;
      await send('edit-sheet', { id: it.id, groups });
    }
    const res = await send('edit-item', { id: it.id, patch });
    if (res.ok) {
      S.dirty = false;
      toast('Saved.');
    } else toast('Could not save: ' + (res.error || ''));
  }
  function problemReport(it) {
    const r = it.result || {};
    return {
      tool: 'Ghandi Product Grabber 3.7 — problem report',
      page: it.url,
      status: it.status,
      message: it.message,
      recipeChosen: S.settings.recipeId,
      brand: r.brand || '',
      found: { name: r.name || '', price: r.price || '', pictures: r.mainImage ? 1 + (r.otherImages || []).length : 0, specRows: (r.specs || []).length, sections: (r.specGroups || []).map((g) => g.title + ' (' + g.rows.length + ')') },
      warnings: r.warnings || [],
      productType: typeOf(it) || '',
      sheet: it.sheet ? { type: it.sheet.type, lines: it.sheet.filled, sections: (it.sheet.groups || []).map((g) => g.title + ' (' + g.rows.length + ')'), brandLinesLeftOut: (it.sheet.extra || []).length } : null,
      debug: it.debug || '(none saved)',
    };
  }
  // "Copy problem report": a fresh X-ray of the page (a small window opens a few seconds), then a box to copy it
  async function showReport(id) {
    let it = S.items.get(id);
    if (!it) return;
    const fresh = it.debug && it.debug.xray && Date.now() - (it.xrayAt || 0) < 30 * 60 * 1000;
    if (!fresh) {
      toast('Making a fresh report: a small window opens for a few seconds…');
      $('dReport').disabled = true;
      try {
        const r = await send('xray', { id });
        if (!r.ok) toast('Could not make a fresh report: ' + (r.error || '') + '. Here is what I have.');
        for (let i = 0; i < 20; i++) {
          it = S.items.get(id) || it;
          if (it.xrayAt && Date.now() - it.xrayAt < 60000) break;
          await new Promise((res) => setTimeout(res, 150));
        }
      } finally {
        $('dReport').disabled = false;
      }
    }
    $('reportText').value = JSON.stringify(problemReport(S.items.get(id) || it), null, 1);
    $('reportDlg').showModal();
    $('reportCopy').focus();
  }

  // ------------------------------------------------------------ actions
  function parseLinks(text) {
    return Array.from(new Set((text.match(/https?:\/\/[^\s"'<>]+/g) || []).map((u) => u.replace(/[),.;]+$/, ''))));
  }
  // ------------------------------------------------------------ "What are you grabbing?"
  function askType(url, name) {
    if (S.settings.askType === false) return Promise.resolve('auto');
    let guess = '';
    try {
      const d = GHANDI_SHEETS.detect({ name: name || '' }, url || '');
      if (d.id !== 'other') guess = d.id;
    } catch (e) {
      /* no guess */
    }
    const dlg = $('typeDlg');
    $('typeGrid').innerHTML = Object.keys(TYPE_NAMES)
      .map((id) => '<button type="button" data-ptype="' + id + '"' + (id === guess ? ' class="guess"' : '') + '><span class="ti" aria-hidden="true">' + esc(TYPE_NAMES[id].icon) + '</span>' + esc(TYPE_NAMES[id].label) + '</button>')
      .join('');
    $('typeGuess').textContent = guess ? 'It looks like: ' + TYPE_NAMES[guess].label + '. Click it, or pick another type.' : 'Pick the type: it decides how the specifications are written (the same lines as on Electroplanet).';
    $('typeAskOff').checked = false;
    return new Promise((resolve) => {
      const done = (v) => {
        dlg.removeEventListener('click', onClick);
        dlg.removeEventListener('cancel', onCancel);
        if (dlg.open) dlg.close();
        if (v && $('typeAskOff').checked) {
          S.settings.askType = false;
          $('askType').checked = false;
          chrome.storage.local.set({ settings: S.settings });
        }
        resolve(v);
      };
      const onClick = (e) => {
        const b = e.target.closest('[data-ptype]');
        if (b) return done(b.dataset.ptype);
        if (e.target.id === 'typeCancel') return done(null);
      };
      const onCancel = (e) => {
        e.preventDefault();
        done(null);
      };
      dlg.addEventListener('click', onClick);
      dlg.addEventListener('cancel', onCancel);
      dlg.showModal();
      const first = dlg.querySelector('.guess') || dlg.querySelector('[data-ptype]');
      if (first) first.focus();
    });
  }

  async function actFind() {
    const url = $('catUrl').value.trim();
    if (!url) {
      // nothing pasted: use the brand page you have open, if there is one
      if (S.tab && /^https?:\/\//i.test(S.tab.url || '')) {
        toast('The link box is empty, so I use the page you have open.');
        return actFindTab();
      }
      return toast('The link box is empty. Paste the list page link in it first (copy it from the address bar).');
    }
    if (!/^https?:\/\//i.test(url)) return toast('That is not a web link. Copy it from the address bar: it starts with https://');
    saveSettings();
    const ptype = await askType(url, '');
    if (!ptype) return;
    const res = await send('crawl', { url, maxPages: S.settings.maxPages, recipeId: S.settings.recipeId, category: S.settings.category, autoStart: $('catAuto').checked, ptype });
    if (!res.ok) toast(res.error || 'Could not start.');
  }
  async function actFindTab() {
    saveSettings();
    const ptype = await askType(S.tab && S.tab.url, S.tab && S.tab.title);
    if (!ptype) return;
    const res = await send('crawl-tab', { tabId: S.tab && S.tab.id, recipeId: S.settings.recipeId, category: S.settings.category, autoStart: $('autoGrab').checked, ptype });
    if (!res.ok) toast(res.error || 'Could not start.');
  }
  async function actAdd() {
    const urls = parseLinks($('linksBox').value);
    if (!urls.length) return toast('Paste at least one product link first.');
    saveSettings();
    const ptype = await askType(urls.length === 1 ? urls[0] : '', '');
    if (!ptype) return;
    const res = await send('add-links', { urls, category: S.settings.category, queue: $('linksAuto').checked, ptype });
    if (res.ok) {
      $('linksBox').value = '';
      toast('Added ' + res.added + (res.skipped ? ', skipped ' + res.skipped + ' already in the list' : '') + '.');
    } else toast(res.error || 'Could not add.');
  }
  async function actGrabTab() {
    saveSettings();
    const ptype = await askType(S.tab && S.tab.url, S.tab && S.tab.title);
    if (!ptype) return;
    toast('Reading the tab you have open…');
    const res = await send('grab-tab', { tabId: S.tab && S.tab.id, recipeId: S.settings.recipeId, category: S.settings.category, ptype });
    toast(res.ok ? 'Done. Check the list.' : res.error || 'Could not read that tab.');
  }
  async function actGrab() {
    saveSettings();
    const ids = Array.from(S.sel);
    const res = ids.length ? await send('retry', { ids }) : await send('start', {});
    if (!res.ok) toast(res.error || 'Could not start.');
    else if (!res.queued) toast('Nothing to grab.');
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
        body: JSON.stringify(Object.assign({ source: 'Ghandi Product Grabber 3.7' }, body)),
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

  function renderSite() {
    const on = siteOn();
    $('siteState').textContent = on ? S.settings.siteName || 'connected' : 'not connected';
    $('siteBtn').classList.toggle('on', on);
    $('toSiteBtn').hidden = !on;
    $('downloadBtn').closest('.export').classList.toggle('has-site', on);
    const dl = $('sectionList');
    const html = (S.sections || []).map((x) => '<option value="' + esc(x.path || x.name) + '"></option>').join('');
    if (dl.innerHTML !== html) dl.innerHTML = html;
  }

  function openSiteDlg() {
    $('siteUrl').value = S.settings.siteUrl || '';
    $('siteKey').value = S.settings.siteKey || '';
    $('siteMsg').textContent = siteOn() ? 'Connected to ' + (S.settings.siteName || 'your site') + '.' : '';
    $('siteMsg').className = 'site-msg' + (siteOn() ? ' good' : '');
    $('siteDlg').showModal();
  }

  async function testSite() {
    const url = $('siteUrl').value.trim();
    const key = $('siteKey').value.trim();
    const msg = $('siteMsg');
    if (!/^https?:\/\//i.test(url) || !key) {
      msg.className = 'site-msg bad';
      msg.textContent = 'Paste both lines from your site first.';
      return;
    }
    S.settings.siteUrl = url;
    S.settings.siteKey = key;
    msg.className = 'site-msg';
    msg.textContent = 'Testing…';
    try {
      const r = await api({ action: 'ping' }, 20000);
      S.settings.siteName = r.site || 'my site';
      S.sections = Array.isArray(r.sections) ? r.sections : [];
      chrome.storage.local.set({ settings: S.settings, siteSections: S.sections });
      msg.className = 'site-msg good';
      msg.textContent = '✓ Connected to ' + S.settings.siteName + ' — ' + S.sections.length + ' sections found.';
    } catch (e) {
      S.settings.siteName = '';
      chrome.storage.local.set({ settings: S.settings });
      msg.className = 'site-msg bad';
      msg.textContent = e.message;
    }
    renderSite();
  }

  function forgetSite() {
    S.settings.siteUrl = '';
    S.settings.siteKey = '';
    S.settings.siteName = '';
    S.sections = [];
    chrome.storage.local.set({ settings: S.settings, siteSections: [] });
    $('siteUrl').value = '';
    $('siteKey').value = '';
    $('siteMsg').className = 'site-msg';
    $('siteMsg').textContent = 'Disconnected.';
    renderSite();
  }

  const grabbed = () => list().filter((it) => it.result && (it.status === 'done' || it.status === 'check'));
  function sendSets() {
    const g = grabbed();
    return { selected: g.filter((it) => S.sel.has(it.id)), new: g.filter((it) => !it.sentAt), all: g };
  }
  function openSendDlg() {
    const sets = sendSets();
    $('sendSelLbl').textContent = 'The ones I selected (' + sets.selected.length + ')';
    $('sendNewLbl').textContent = 'Not sent yet (' + sets.new.length + ')';
    $('sendAllLbl').textContent = 'Everything grabbed (' + sets.all.length + ')';
    const def = sets.selected.length ? 'selected' : sets.new.length ? 'new' : 'all';
    document.querySelectorAll('input[name="sendWhich"]').forEach((r) => {
      r.checked = r.value === def;
      r.disabled = !sets[r.value].length;
    });
    $('sendMsg').textContent = '';
    $('sendMsg').className = 'site-msg';
    $('sendBar').hidden = true;
    $('sendGo').disabled = false;
    if (!$('sendSection').value && S.settings.category) {
      const m = (S.sections || []).find((x) => (x.name || '').toLowerCase() === S.settings.category.toLowerCase());
      if (m) $('sendSection').value = m.path || m.name;
    }
    $('sendDlg').showModal();
    // the cursor is already in the section box: type, then Enter sends
    const box = $('sendSection');
    box.focus();
    box.select();
    // refresh the list of sections in the background
    api({ action: 'ping' }, 15000)
      .then((r) => {
        if (Array.isArray(r.sections)) {
          S.sections = r.sections;
          chrome.storage.local.set({ siteSections: r.sections });
          renderSite();
        }
      })
      .catch(() => {});
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
  const TYPE_SECTION = {
    fridge: 'refrigerateur congelateur',
    ac: 'climatiseur',
    fan: 'ventilateur',
    washer: 'lave linge',
    dishwasher: 'lave vaisselle',
    tv: 'television',
    hob: 'plaque cuisson',
    oven: 'four',
    microwave: 'micro onde',
    sink: 'evier',
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
      if (/\b(droit|vertical|armoire|upright)\b/.test(all)) return ['congelateurs vertical', 'congelateurs'];
      if (/\b(coffre|poitrine|horizontal|bahut|chest)\b/.test(all) || /^(wcf|cf\d|cmch)/.test(model.replace(/ /g, ''))) return ['congelateurs horizontal', 'congelateurs'];
      return ['congelateurs'];
    }
    const k = type + ' ' + name;
    if (/side by side|americain|\bsbs\b/.test(k)) return ['refrigerateurs side by side', 'refrigerateur congelateur'];
    if (/multi portes|[34] portes|[34] door|french door|cross door|multi door|\bcube\b|quatre portes|quatres portes|trois portes/.test(k)) return ['refrigerateurs multi portes', 'refrigerateur congelateur'];
    if (/combine|congelateur en bas|congelateur inferieur|bottom/.test(k)) return ['refrigerateurs combines', 'refrigerateur congelateur'];
    if (/congelateur en haut|double porte|double door|2 portes|deux portes|top freezer|top mount|monte sur le dessus/.test(k)) return ['refrigerateurs 2 portes', 'refrigerateur congelateur'];
    if (/table top|sous plan|top table|mini bar/.test(k)) return ['refrigerateurs table top', 'refrigerateur'];
    if (/une porte|1 porte|monoporte|one door|single door/.test(k)) return ['refrigerateurs 1 porte', 'refrigerateur'];
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

  async function sendToSite() {
    const which = (document.querySelector('input[name="sendWhich"]:checked') || {}).value || 'new';
    const items = sendSets()[which] || [];
    const msg = $('sendMsg');
    if (!items.length) {
      msg.className = 'site-msg bad';
      msg.textContent = 'Nothing to send.';
      return;
    }
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
    const typed = $('sendSection').value.trim();
    // every product goes to a section that really exists on the site, with no question asked:
    // the section you typed (or the closest one), else the product's own category, else its type
    const typedSec = typed ? (findSection(typed).exact || findSection(typed).guess || null) : null;
    const sectionFor = (it) => {
      if (typedSec) return typedSec;
      const c = findSection(it.category || '');
      if (c.exact || c.guess) return c.exact || c.guess;
      // the most precise section first, then its parent: "Réfrigérateurs Combinés" before "Réfrigérateurs - Congélateurs"
      let tries = TYPE_SECTION[typeOf(it)] ? [TYPE_SECTION[typeOf(it)]] : [];
      if (typeOf(it) === 'fridge') tries = fridgeSections(it);
      for (const words of tries) {
        const t = findSection(words);
        if (t.exact || t.guess) return t.exact || t.guess;
      }
      return null;
    };
    const groups = new Map();
    items.forEach((it) => {
      const sec = sectionFor(it);
      const k = sec ? sec.id : '';
      if (!groups.has(k)) groups.set(k, { sec, items: [] });
      groups.get(k).items.push(it);
    });
    if (groups.has('') && (S.sections || []).length) {
      const lost = groups.get('').items;
      msg.className = 'site-msg bad';
      msg.textContent = 'I do not know which section of your site ' + (lost.length === 1 ? 'this product goes' : 'these ' + lost.length + ' products go') + ' in (' + lost.slice(0, 3).map((it) => (it.result && it.result.name) || it.url).join(', ').slice(0, 140) + '). Type a section in the box, then press Send.';
      return;
    }
    const note = '';
    const CHUNK = 20;
    $('sendGo').disabled = true;
    $('sendBar').hidden = false;
    let sent = 0;
    let added = 0;
    let known = true;
    const where = [];
    const done = [];
    let closeAfter = false;
    try {
      for (const { sec, items: list } of groups.values()) {
        const batchId = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const brands = Array.from(new Set(list.map((it) => (it.result && it.result.brand) || ''))).filter(Boolean);
        const label = note || list.length + ' produits' + (brands.length ? ' – ' + brands.join(', ') : '');
        for (let i = 0; i < list.length; i += CHUNK) {
          const part = list.slice(i, i + CHUNK);
          msg.className = 'site-msg';
          msg.textContent = 'Sending ' + Math.min(sent + part.length, items.length) + ' of ' + items.length + '…';
          const answer = await api({
            action: 'push',
            batchId,
            label,
            note,
            total: list.length,
            final: i + CHUNK >= list.length,
            suggestedSectionId: sec ? sec.id : null,
            suggestedSectionPath: sec ? sec.path || sec.name : typed,
            products: part.map(productOf),
          });
          sent += part.length;
          if (answer && typeof answer.added === 'number') added += answer.added;
          else known = false;
          await send('mark-sent', { ids: part.map((it) => it.id), batchId });
          // in the shop now: they leave the list (a part the site did not fully take stays, to send again)
          if (!answer || typeof answer.added !== 'number' || answer.added >= part.length) done.push(...part.map((it) => it.id));
          $('sendFill').style.width = Math.round((sent / items.length) * 100) + '%';
        }
        if (sec) where.push('« ' + sec.name + ' » (' + list.length + ')');
      }
      if (known && added < sent) {
        msg.className = 'site-msg bad';
        msg.textContent = sent + ' products sent, but only ' + added + ' are in your shop. Your site did not accept the other ' + (sent - added) + '.';
        toast((sent - added) + ' products did not go into your shop.');
      } else {
        msg.className = 'site-msg good';
        msg.textContent = '✓ ' + sent + ' products are on your site' + (where.length ? ': ' + where.join(', ') : '') + '. I removed them from the list.';
        toast('✓ ' + sent + ' products are on your site' + (where.length ? ': ' + where.join(', ') : '') + '.');
        closeAfter = true; // all good: the window closes by itself
      }
    } catch (e) {
      msg.className = 'site-msg bad';
      msg.textContent = (sent ? sent + ' products were sent, then: ' : '') + e.message;
    }
    if (done.length) {
      await send('remove', { ids: done });
      done.forEach((id) => S.sel.delete(id));
    }
    $('sendGo').disabled = false;
    if (closeAfter) $('sendDlg').close();
  }

  // ------------------------------------------------------------ wiring
  function wire() {
    $('recipe').addEventListener('change', () => (saveSettings(), updateHint(), renderHere()));
    $('category').addEventListener('input', () => saveSettings());
    ['workers', 'delay', 'maxPages', 'lightLoad', 'autoGrab', 'quickRead', 'slideshowMode', 'sheetStyle', 'askType', 'keepExtra'].forEach((id) => $(id).addEventListener('change', saveSettings));
    $('catUrl').addEventListener('input', updateHint);
    $('linksBox').addEventListener('input', updateHint);
    $('helpBtn').addEventListener('click', () => $('help').showModal());
    $('siteBtn').addEventListener('click', openSiteDlg);
    $('siteTest').addEventListener('click', testSite);
    $('siteForget').addEventListener('click', forgetSite);
    $('siteShowKey').addEventListener('change', (e) => ($('siteKey').type = e.target.checked ? 'text' : 'password'));
    $('toSiteBtn').addEventListener('click', openSendDlg);
    $('sendGo').addEventListener('click', sendToSite);
    $('sendSection').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      if (!$('sendGo').disabled) sendToSite();
    });
    document.querySelectorAll('.dlg-close').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
    $('selAll').addEventListener('click', () => {
      const shown = visibleItems();
      const allOn = shown.length && shown.every((it) => S.sel.has(it.id));
      shown.forEach((it) => (allOn ? S.sel.delete(it.id) : S.sel.add(it.id)));
      render();
    });
    $('fullBtn').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('app/app.html') }));
    try {
      chrome.tabs.getCurrent((t) => {
        void chrome.runtime.lastError;
        if (t) $('fullBtn').hidden = true; // already a full tab
      });
    } catch (e) {
      /* keep the button */
    }

    const tabs = { tabCat: 'paneCat', tabLinks: 'paneLinks' };
    Object.keys(tabs).forEach((t) =>
      $(t).addEventListener('click', () => {
        Object.keys(tabs).forEach((o) => {
          $(o).setAttribute('aria-selected', String(o === t));
          $(tabs[o]).hidden = o !== t;
        });
      })
    );

    $('hereFind').addEventListener('click', actFindTab);
    $('hereGrab').addEventListener('click', actGrabTab);
    $('siteChips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-home]');
      if (b) chrome.tabs.create({ url: b.dataset.home });
    });
    try {
      chrome.tabs.onActivated.addListener(scheduleTab);
      chrome.tabs.onUpdated.addListener((id, info) => (info.url || info.status === 'complete') && scheduleTab());
      chrome.windows.onFocusChanged.addListener(scheduleTab);
    } catch (e) {
      /* no live page tracking */
    }
    $('findBtn').addEventListener('click', actFind);
    $('findTabBtn').addEventListener('click', actFindTab);
    $('addBtn').addEventListener('click', actAdd);
    $('grabTabBtn').addEventListener('click', actGrabTab);
    $('crawlStop').addEventListener('click', () => send('stop'));
    $('crawlReport').addEventListener('click', () => copyText(JSON.stringify((S.crawl || {}).report || {}, null, 2), 'List report copied. Paste it to Claude.'));
    $('catUrl').addEventListener('keydown', (e) => e.key === 'Enter' && actFind());

    $('grabBtn').addEventListener('click', actGrab);
    $('stopBtn').addEventListener('click', () => send('stop').then(() => toast('Stopping after the products being read now.')));
    $('downloadBtn').addEventListener('click', download);
    $('copyBtn').addEventListener('click', copyJson);

    $('chips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      S.filter = b.dataset.f;
      render();
    });
    $('search').addEventListener('input', (e) => {
      S.q = e.target.value;
      render();
    });
    $('clearAll').addEventListener('click', async () => {
      if (!S.order.length) return;
      if (!confirm('Remove all ' + S.order.length + ' products from this list? Files you already downloaded stay safe.')) return;
      S.sel.clear();
      await send('clear-all');
      toast('List cleared.');
    });

    $('checkAll').addEventListener('change', (e) => {
      visibleItems().forEach((it) => (e.target.checked ? S.sel.add(it.id) : S.sel.delete(it.id)));
      render();
    });
    $('rows').addEventListener('click', async (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const id = tr.dataset.id;
      if (e.target.matches('[data-sel]')) {
        e.target.checked ? S.sel.add(id) : S.sel.delete(id);
        render();
        return;
      }
      const act = e.target.closest('[data-act]');
      if (act) {
        if (act.dataset.act === 'retry') {
          const r = await send('retry', { ids: [id] });
          if (!r.ok) toast(r.error || 'Could not start.');
        } else if (act.dataset.act === 'remove') {
          S.sel.delete(id);
          await send('remove', { ids: [id] });
        }
        return;
      }
      openDrawer(id);
    });

    $('bulkGrab').addEventListener('click', actGrab);
    $('bulkRetry').addEventListener('click', actGrab);
    $('bulkNone').addEventListener('click', () => (S.sel.clear(), render()));
    $('bulkSetCat').addEventListener('click', async () => {
      await send('set-category', { ids: Array.from(S.sel), category: $('bulkCat').value.trim() });
      toast('Category set for ' + S.sel.size + ' products.');
    });
    fillTypeSelect($('bulkType'), 'auto');
    $('bulkSetType').addEventListener('click', async () => {
      const ptype = $('bulkType').value;
      await send('set-type', { ids: Array.from(S.sel), ptype });
      toast('Type set for ' + S.sel.size + ' products: ' + (ptype === 'auto' ? 'detected by itself' : typeLabel(ptype)) + '.');
    });
    $('fType').addEventListener('change', async () => {
      const it = S.items.get(S.openId);
      if (!it) return;
      if (it.sheet && it.sheet.edited && !confirm('Changing the type makes a new sheet. Your edits of this sheet will be replaced. Continue?')) return fillTypeSelect($('fType'), it.ptype || 'auto', it.ptypeAuto);
      S.view = 'sheet';
      S.dirty = false;
      await send('set-type', { ids: [it.id], ptype: $('fType').value });
    });
    $('viewSheet').addEventListener('click', () => {
      const it = S.items.get(S.openId);
      if (!it || (S.dirty && !confirm('You have changes that are not saved. Switch anyway?'))) return;
      S.view = 'sheet';
      S.dirty = false;
      showSpecs(it);
    });
    $('viewBrand').addEventListener('click', () => {
      const it = S.items.get(S.openId);
      if (!it || (S.dirty && !confirm('You have changes that are not saved. Switch anyway?'))) return;
      S.view = 'brand';
      S.dirty = false;
      showSpecs(it);
    });
    $('bulkRemove').addEventListener('click', async () => {
      const n = S.sel.size;
      if (!confirm('Remove ' + n + ' products from the list?')) return;
      await send('remove', { ids: Array.from(S.sel) });
      S.sel.clear();
    });

    // drawer
    $('dClose').addEventListener('click', closeDrawer);
    $('scrim').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => e.key === 'Escape' && S.openId && closeDrawer());
    $('drawer').addEventListener('input', (e) => {
      S.dirty = true;
      if (e.target.id === 'fMain' || e.target.id === 'fOthers') renderPics();
    });
    $('dSave').addEventListener('click', saveDrawer);
    $('dPics').addEventListener('click', (e) => {
      const all = [$('fMain').value.trim()].concat($('fOthers').value.split('\n').map((x) => x.trim())).filter(Boolean);
      const x = e.target.closest('[data-x]');
      const im = e.target.closest('img[data-i]');
      if (x) all.splice(Number(x.dataset.x), 1);
      else if (im) {
        const [pick] = all.splice(Number(im.dataset.i), 1);
        all.unshift(pick);
      } else return;
      $('fMain').value = all[0] || '';
      $('fOthers').value = all.slice(1).join('\n');
      S.dirty = true;
      renderPics();
    });
    $('drawer').addEventListener('click', (e) => {
      const b = e.target.closest('[data-copy]');
      if (!b) return;
      e.preventDefault();
      const what = b.dataset.copy;
      if (what === 'allPics') {
        const all = [$('fMain').value.trim()].concat($('fOthers').value.split('\n').map((x) => x.trim())).filter(Boolean);
        return copyText(all.join('\n'), all.length + ' picture links copied.');
      }
      if (what === 'specText') {
        const text = readGroups()
          .map((g) => (g.title ? '[' + g.title + ']\n' : '') + g.rows.map((r) => r.label + ': ' + r.value).join('\n'))
          .join('\n\n');
        return copyText(text, 'Specifications copied.');
      }
      copyText($(what).value, 'Copied.');
    });
    $('hereHave').addEventListener('click', (e) => {
      const b = e.target.closest('[data-open]');
      if (b) openDrawer(b.dataset.open);
    });
    $('retryFailed').addEventListener('click', async () => {
      const ids = list().filter((it) => it.status === 'failed').map((it) => it.id);
      const r = await send('retry', { ids });
      toast(r.ok ? 'Trying ' + ids.length + ' again…' : r.error || 'Could not start.');
    });
    $('dRetry').addEventListener('click', async () => {
      const r = await send('retry', { ids: [S.openId] });
      toast(r.ok ? 'Grabbing again…' : r.error || 'Could not start.');
    });
    $('dReport').addEventListener('click', () => {
      if (S.openId) showReport(S.openId);
    });
    $('reportCopy').addEventListener('click', () => copyText($('reportText').value, 'Problem report copied. Paste it to Claude.'));
    $('addSection').addEventListener('click', () => {
      if (!$('dSpecs').querySelector('.sgroup')) $('dSpecs').innerHTML = '';
      $('dSpecs').insertAdjacentHTML('beforeend', specGroupHtml({ title: '', rows: [{ label: '', value: '' }] }));
      S.dirty = true;
    });
    $('dSpecs').addEventListener('click', (e) => {
      const g = e.target.closest('.sgroup');
      if (!g) return;
      if (e.target.matches('[data-sadd]')) g.querySelector('.sfoot').insertAdjacentHTML('beforebegin', rowEdit({ label: '', value: '' }));
      else if (e.target.matches('[data-sdel]')) e.target.closest('.srow').remove();
      else if (e.target.matches('[data-sdel-group]')) g.remove();
      else return;
      S.dirty = true;
    });
  }

  // ------------------------------------------------------------ storage -> screen
  function ingest(all) {
    S.items.clear();
    Object.keys(all).forEach((k) => {
      if (k.indexOf('it:') === 0) S.items.set(k.slice(3), all[k]);
    });
    S.order = all.ids || [];
    S.settings = Object.assign({}, DEFAULTS, all.settings || {});
    if (all.settings && all.settings.v !== 2) {
      // older version: switch to the faster defaults once
      S.settings = Object.assign({}, S.settings, { v: 2, workers: 4, delayMs: 300, lightLoad: true });
      chrome.storage.local.set({ settings: S.settings });
    }
    S.run = all.run || {};
    S.crawl = all.crawl || {};
    S.sections = all.siteSections || [];
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
      else if (k === 'update') showUpdate(nv);
      else if (k === 'run') S.run = nv || {};
      else if (k === 'crawl') S.crawl = nv || {};
      else if (k === 'settings') {
        S.settings = Object.assign({}, DEFAULTS, nv || {});
        showSettings(false);
        updateHint();
      }
    });
    scheduleRender();
  }

  // ------------------------------------------------------------ updates (updater/updater.js)
  function showUpdate(u) {
    const asked = /[?&]update=1/.test(location.search); // the bigger window opened to finish an update
    const really = !!(u && u.latest && GHANDI_UPDATER.newer(u.latest, chrome.runtime.getManifest().version)); // already installed? then no box
    const show = really && (u.dismissed !== u.latest || asked);
    $('updBar').hidden = !show;
    if (!show) return;
    $('updVer').textContent = u.latest;
    $('updNotes').innerHTML = (u.notes || []).map((n) => '<li>' + esc(n) + '</li>').join('');
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
      toast('OK. You can install it later from "Speed & limits" → Check for updates.');
    });
    $('updCheck').addEventListener('click', async () => {
      $('updCheckMsg').textContent = 'Looking…';
      const r = await chrome.runtime.sendMessage({ type: 'check-update' });
      if (!r || !r.ok) return ($('updCheckMsg').textContent = 'I could not check: ' + ((r && r.error) || 'no answer'));
      const u = r.update;
      if (u.available) {
        await chrome.storage.local.set({ update: Object.assign(u, { dismissed: '' }) });
        $('updCheckMsg').textContent = 'Version ' + u.latest + ' is ready: see the blue box at the top.';
        showUpdate(u);
        $('updBar').classList.add('flash');
      } else $('updCheckMsg').textContent = 'You have the newest version (' + u.current + ').';
    });
    $('updUndo').addEventListener('click', async () => {
      if (!confirm('Go back to the version you had before the last update?')) return;
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
    const { update, justUpdated } = await chrome.storage.local.get(['update', 'justUpdated']);
    showUpdate(update);
    if (justUpdated && Date.now() - justUpdated.at < 10 * 60 * 1000 && justUpdated.to === chrome.runtime.getManifest().version) {
      toast(justUpdated.undo ? 'Back to version ' + justUpdated.to + '.' : 'Updated to version ' + justUpdated.to + ' ✓');
      chrome.storage.local.remove('justUpdated');
    }
    if (/[?&]update=1/.test(location.search) && !$('updBar').hidden) {
      $('updBar').classList.add('flash');
      $('updMsg').textContent = 'Click "Install update" to finish.';
    }
    // look for a new version now if the last look is old (more than 1 hour)
    if (!update || Date.now() - (update.checkedAt || 0) > 3600 * 1000) chrome.runtime.sendMessage({ type: 'check-update' }).catch(() => {});
  }

  async function init() {
    wire();
    wireUpdates();
    const all = await chrome.storage.local.get(null);
    ingest(all);
    await loadRecipes();
    showSettings(true);
    updateHint();
    lastCount = S.order.length;
    lastCrawl = (S.crawl || {}).state || 'idle';
    lastRun = (S.run || {}).state || 'idle';
    await refreshTab();
    render();

    chrome.storage.onChanged.addListener(onChanged);
    window.matchMedia('(max-width: 720px)').addEventListener('change', (e) => {
      if (!e.matches) $('sourceBox').open = true;
    });
  }
  init();
})();
