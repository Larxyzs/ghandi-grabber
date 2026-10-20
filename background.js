/*
  background.js  —  the HELPER that works behind the scenes.

  The dashboard (app/app.html) asks. This helper does the work:

    1. FIND LINKS  : opens a category page, clicks "Charger plus", flips through
                     the pages, and writes down every product link it sees.
    2. GRAB        : opens each product link in a small window, reads it with
                     the "brain" (scraper/core.js + the brand recipes), saves it.
    3. KEEP SAFE   : everything is saved inside Chrome after every product, so
                     nothing is lost if you close the dashboard.

  Where things are saved (chrome.storage.local):
    settings   how the person likes it (recipe, category, pages, speed)
    ids        the list of product ids, in order
    it:<id>    one product: link, status, and what was read
    run        what the grabbing queue is doing right now
    crawl      what the link finder is doing right now
*/

importScripts('recipe-list.js'); // gives us RECIPE_FILES
importScripts('updater/updater.js'); // gives us GHANDI_UPDATER (updates without uninstalling)
importScripts('sheets/engine.js', 'sheets/templates.js'); // GHANDI_SHEETS: the Electroplanet-style spec sheet

const CORE_FILE = 'scraper/core.js';
const LINKS_FILE = 'scraper/links.js';
const SCRAPE_FILES = [CORE_FILE, ...RECIPE_FILES];
const LINK_FILES = [CORE_FILE, ...RECIPE_FILES, LINKS_FILE];
const APP_PAGE = 'app/app.html';

const PAGE_TIMEOUT_MS = 35000; // the brain gives up after this long (product page)
const LIST_TIMEOUT_MS = 80000; // ... and this long (category page)
const DEFAULT_SETTINGS = { quickRead: true, autoGrab: true, v: 2, recipeId: 'auto', category: '', maxPages: 10, delayMs: 300, workers: 4, lightLoad: true, slideshowMode: 'ac-specs' };
const TRACKING = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'mc_cid', 'mc_eid'];

// ---------------------------------------------------------------- small tools
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || lo));

function hash(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

function normalizeUrl(href) {
  try {
    const u = new URL(String(href).trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    TRACKING.forEach((k) => u.searchParams.delete(k));
    return u.href;
  } catch (e) {
    return null;
  }
}

function keyOf(href) {
  try {
    const u = new URL(href);
    return (u.host + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
  } catch (e) {
    return String(href).toLowerCase();
  }
}

// One thing at a time may change the saved list (so two helpers never overwrite each other).
let lock = Promise.resolve();
function locked(fn) {
  const p = lock.then(fn, fn);
  lock = p.catch(() => {});
  return p;
}

const store = {
  async get(keys) {
    return chrome.storage.local.get(keys);
  },
  async set(obj) {
    return chrome.storage.local.set(obj);
  },
};

async function getSettings() {
  const { settings } = await store.get('settings');
  return Object.assign({}, DEFAULT_SETTINGS, settings || {});
}
async function getIds() {
  const { ids } = await store.get('ids');
  return Array.isArray(ids) ? ids : [];
}
async function getItem(id) {
  const k = 'it:' + id;
  const o = await store.get(k);
  return o[k] || null;
}
// read -> change -> save, safely
function updateItem(id, fn) {
  return locked(async () => {
    const it = await getItem(id);
    if (!it) return null;
    const out = fn(it);
    const next = out === undefined ? it : out;
    await store.set({ ['it:' + id]: next });
    return next;
  });
}

// ---------------------------------------------------------------- the little number on the icon
async function setBadge(text, color) {
  try {
    await chrome.action.setBadgeText({ text: text || '' });
    if (color) await chrome.action.setBadgeBackgroundColor({ color });
  } catch (e) {
    /* fine */
  }
}
function notifyDone(title, message) {
  try {
    chrome.notifications.create('ghandi-' + Date.now(), { type: 'basic', iconUrl: 'icons/icon128.png', title, message, priority: 1 });
  } catch (e) {
    /* notifications not allowed: fine */
  }
}

async function setRun(patch) {
  const { run } = await store.get('run');
  await store.set({ run: Object.assign({ state: 'idle', message: '' }, run || {}, patch, { updatedAt: Date.now() }) });
}
async function setCrawl(patch) {
  const { crawl } = await store.get('crawl');
  await store.set({ crawl: Object.assign({ state: 'idle', message: '' }, crawl || {}, patch, { updatedAt: Date.now() }) });
}

// ---------------------------------------------------------------- adding items
// links: [{url,title,image}]   returns { added, skipped }
function addItems(links, opts) {
  opts = opts || {};
  return locked(async () => {
    const ids = await getIds();
    const have = new Set(ids);
    const batch = {};
    let added = 0;
    let skipped = 0;
    const retype = [];
    const settings = await getSettings();
    for (const l of links) {
      const url = normalizeUrl(l && l.url);
      if (!url) {
        skipped++;
        continue;
      }
      const key = keyOf(url);
      const id = hash(key);
      if (have.has(id)) {
        skipped++;
        if (opts.ptype && opts.ptype !== 'auto') retype.push(id); // you told me the type: use it for this one too
        continue;
      }
      have.add(id);
      ids.push(id);
      batch['it:' + id] = {
        id,
        url,
        key,
        title: (l.title || '').slice(0, 200),
        image: l.image || '',
        listing: opts.listing || '',
        listingTitle: opts.listingTitle || '',
        category: (opts.category != null && opts.category !== '' ? opts.category : settings.category) || opts.listingTitle || '',
        status: opts.queue ? 'queued' : 'found',
        message: '',
        ptype: opts.ptype && opts.ptype !== 'auto' ? opts.ptype : '',
        ptypeBy: opts.ptype && opts.ptype !== 'auto' ? 'you' : '',
        attempts: 0,
        result: null,
        addedAt: Date.now(),
        finishedAt: 0,
      };
      added++;
    }
    batch.ids = ids;
    if (retype.length) {
      const old = await store.get(retype.map((i) => 'it:' + i));
      retype.forEach((i) => {
        const it = old['it:' + i];
        if (!it) return;
        it.ptype = opts.ptype;
        it.ptypeBy = 'you';
        applySheet(it);
        batch['it:' + i] = it;
      });
    }
    await store.set(batch);
    return { added, skipped, ids: Object.keys(batch).filter((k) => k.startsWith('it:') && retype.indexOf(k.slice(3)) === -1).map((k) => k.slice(3)) };
  });
}

// ---------------------------------------------------------------- opening pages
// Speed tricks for the little reading windows:
//   * pictures, videos and fonts are NOT downloaded (we only need the picture LINKS)
//   * known trackers / ads are not loaded
//   * we start reading as soon as the page structure is there, not when the last
//     picture has arrived
const TRACKERS = [
  'google-analytics.com', 'googletagmanager.com', 'googleadservices.com', 'doubleclick.net', 'googlesyndication.com',
  'facebook.net', 'hotjar.com', 'clarity.ms', 'criteo.com', 'taboola.com', 'outbrain.com', 'tiktok.com', 'snapchat.com',
  'youtube.com', 'vimeo.com', 'adsrvr.org', 'bing.com', 'pinterest.com', 'optimizely.com', 'fullstory.com',
];
let ruleSeq = 1;
const rulesByTab = new Map();

async function addLightRules(tabId) {
  const a = ruleSeq++;
  const b = ruleSeq++;
  const rules = [
    { id: a, priority: 1, action: { type: 'block' }, condition: { tabIds: [tabId], resourceTypes: ['image', 'media', 'font', 'ping'] } },
    { id: b, priority: 1, action: { type: 'block' }, condition: { tabIds: [tabId], requestDomains: TRACKERS } },
  ];
  await chrome.declarativeNetRequest.updateSessionRules({ addRules: rules });
  rulesByTab.set(tabId, [a, b]);
}
async function dropLightRules(tabId) {
  const ids = rulesByTab.get(tabId);
  if (!ids) return;
  rulesByTab.delete(tabId);
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
  } catch (e) {
    /* fine */
  }
}

// resolves when the page structure is ready (or rejects if the page cannot be opened)
function waitForDom(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const end = (fn, arg) => {
      if (done) return;
      done = true;
      chrome.webNavigation.onDOMContentLoaded.removeListener(onDcl);
      chrome.webNavigation.onErrorOccurred.removeListener(onErr);
      chrome.tabs.onUpdated.removeListener(onUpd);
      clearTimeout(timer);
      fn(arg);
    };
    const onDcl = (d) => {
      if (d.tabId === tabId && d.frameId === 0 && /^https?:/i.test(d.url)) end(resolve);
    };
    const onErr = (d) => {
      if (d.tabId === tabId && d.frameId === 0 && !/ERR_ABORTED/.test(d.error || '')) end(reject, new Error('Chrome could not open that page (' + d.error + ')'));
    };
    const onUpd = (id, info, tab) => {
      if (id === tabId && info.status === 'complete' && tab && /^https?:/i.test(tab.url || '')) end(resolve);
    };
    chrome.webNavigation.onDOMContentLoaded.addListener(onDcl);
    chrome.webNavigation.onErrorOccurred.addListener(onErr);
    chrome.tabs.onUpdated.addListener(onUpd);
    const timer = setTimeout(() => end(resolve), timeoutMs); // go on anyway after a while
  });
}

async function withPage(url, fn, say, light) {
  if (!/^https?:\/\//i.test(url)) throw new Error('That does not look like a web link. It must start with https://');
  if (light === undefined) light = (await getSettings()).lightLoad !== false;
  let win = null;
  let tabId = null;
  try {
    // A small window that is really there works best: some pages only load
    // their tables when they think a person is looking.
    win = await chrome.windows.create({ url: 'about:blank', type: 'popup', focused: false, width: 1280, height: 900, left: 0, top: 0 });
    tabId = win.tabs && win.tabs[0] && win.tabs[0].id;
  } catch (e) {
    const tab = await chrome.tabs.create({ url: 'about:blank', active: false }); // plan B
    tabId = tab.id;
  }
  try {
    if (light) {
      try {
        await addLightRules(tabId);
      } catch (e) {
        /* speed trick not available: carry on normally */
      }
    }
    if (say) say('waiting for the page to load…');
    const ready = waitForDom(tabId, 30000);
    await chrome.tabs.update(tabId, { url });
    await ready;
    if (say) say('reading the page…');
    try {
      return await fn(tabId);
    } catch (e) {
      // the page redirected itself while we were reading: wait for the new page and read again
      if (/context|navigat|removed|destroyed|Frame|closed/i.test(String(e && e.message))) {
        await waitForDom(tabId, 20000);
        return await fn(tabId);
      }
      throw e;
    }
  } finally {
    await dropLightRules(tabId);
    try {
      if (win && win.id != null) await chrome.windows.remove(win.id);
      else if (tabId != null) await chrome.tabs.remove(tabId);
    } catch (e) {
      /* already closed — fine */
    }
  }
}

// ---------------------------------------------------------------- QUICK READ (no window at all)
// Download the page as text and read it in an invisible page (offscreen/offscreen.html).
// 10x faster than a window. If anything is missing, the normal window is used instead.
let offscreenReady = null;
function ensureOffscreen() {
  if (!chrome.offscreen) return Promise.reject(new Error('no offscreen'));
  if (!offscreenReady) {
    offscreenReady = chrome.offscreen
      .createDocument({ url: 'offscreen/offscreen.html', reasons: ['DOM_PARSER'], justification: 'Read downloaded product pages quickly' })
      .catch((e) => {
        if (!/single offscreen|already/i.test(String(e && e.message))) {
          offscreenReady = null;
          throw e;
        }
      });
  }
  return offscreenReady;
}

async function quickRead(url, recipeId) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  let res;
  try {
    res = await fetch(url, { credentials: 'include', redirect: 'follow', signal: ctl.signal, headers: { accept: 'text/html,application/xhtml+xml' } });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404 || res.status === 410) {
    return { good: true, result: { ok: false, notFound: true, url, error: 'This page does not exist (404). The product was probably removed from the website.', warnings: [] } };
  }
  if (!res.ok) return { good: false, why: 'website answered ' + res.status };
  if (!/html/i.test(res.headers.get('content-type') || 'text/html')) return { good: false, why: 'not a web page' };
  const html = await res.text();
  if (html.length < 500) return { good: false, why: 'page almost empty' };
  await ensureOffscreen();
  const answer = await withTimeout(
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'quick-read', html, url: res.url || url, recipeId: recipeArg(recipeId), slideshowMode: (await getSettings()).slideshowMode || 'ac-specs' }),
    15000,
    'quick read too slow'
  );
  return answer || { good: false, why: 'no answer' };
}

async function quickList(url, recipeId) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  let res;
  try {
    res = await fetch(url, { credentials: 'include', redirect: 'follow', signal: ctl.signal, headers: { accept: 'text/html' } });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) return { good: false };
  const html = await res.text();
  await ensureOffscreen();
  const answer = await withTimeout(chrome.runtime.sendMessage({ target: 'offscreen', type: 'quick-list', html, url: res.url || url, recipeId: recipeArg(recipeId) }), 15000, 'slow');
  return answer || { good: false };
}

// ---------------------------------------------------------------- reusable reading windows
// Each worker keeps ONE small window and sends it from product to product
// (opening and closing a window for every product is slow).
async function openSlot(light, index) {
  let win = null;
  let tabId = null;
  // each window a little to the side of the previous one: a window that is
  // completely hidden behind another one is "asleep" in Chrome (lazy pictures never load)
  const off = (index || 0) * 36;
  try {
    win = await chrome.windows.create({ url: 'about:blank', type: 'popup', focused: false, width: 1100, height: 820, left: off, top: off });
    tabId = win.tabs && win.tabs[0] && win.tabs[0].id;
  } catch (e) {
    const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
    tabId = tab.id;
  }
  if (light) {
    try {
      await addLightRules(tabId);
    } catch (e) {
      /* speed trick not available */
    }
  }
  return { winId: win ? win.id : null, tabId };
}
async function closeSlot(slot) {
  if (!slot) return;
  await dropLightRules(slot.tabId);
  try {
    if (slot.winId != null) await chrome.windows.remove(slot.winId);
    else await chrome.tabs.remove(slot.tabId);
  } catch (e) {
    /* already closed */
  }
}
async function slotAlive(slot) {
  if (!slot) return false;
  try {
    await chrome.tabs.get(slot.tabId);
    return true;
  } catch (e) {
    return false;
  }
}
async function readInSlot(slot, url, fn, say) {
  if (!/^https?:\/\//i.test(url)) throw new Error('That does not look like a web link. It must start with https://');
  if (say) say('waiting for the page to load…');
  const ready = waitForDom(slot.tabId, 30000);
  await chrome.tabs.update(slot.tabId, { url });
  await ready;
  // make sure the window really moved to the new page
  const tab = await chrome.tabs.get(slot.tabId);
  if (!/^https?:/i.test(tab.url || '')) throw new Error('Chrome could not open that page.');
  if (say) say('reading the page…');
  try {
    return await fn(slot.tabId);
  } catch (e) {
    if (/context|navigat|removed|destroyed|Frame|closed/i.test(String(e && e.message))) {
      await waitForDom(slot.tabId, 20000);
      return await fn(slot.tabId);
    }
    throw e;
  }
}

function withTimeout(promise, ms, message) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

const recipeArg = (recipeId) => (recipeId && recipeId !== 'auto' ? recipeId : undefined);

async function scrapeTab(tabId, recipeId) {
  const slideshowMode = (await getSettings()).slideshowMode || 'ac-specs';
  await chrome.scripting.executeScript({ target: { tabId }, files: SCRAPE_FILES });
  const results = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId },
      func: (o) => window.GHANDI.run(o),
      args: [{ timeoutMs: PAGE_TIMEOUT_MS, recipeId: recipeArg(recipeId), slideshowMode }],
    }),
    PAGE_TIMEOUT_MS + 25000,
    'The page took too long. Try again later.'
  );
  const first = results && results[0];
  if (!first || !first.result) throw new Error('The page did not give me an answer. Try again.');
  return first.result;
}

async function collectTab(tabId, recipeId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: LINK_FILES });
  const results = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId },
      func: (o) => window.GHANDI.collectLinks(o),
      args: [{ timeoutMs: LIST_TIMEOUT_MS - 10000, recipeId: recipeArg(recipeId) }],
    }),
    LIST_TIMEOUT_MS + 25000,
    'The list page took too long.'
  );
  const first = results && results[0];
  if (!first || !first.result) throw new Error('The page did not give me an answer. Try again.');
  return first.result;
}

async function pickUserTab(tabId) {
  if (tabId != null) {
    try {
      const t = await chrome.tabs.get(tabId);
      if (t && /^https?:\/\//i.test(t.url || '')) return t;
    } catch (e) {
      /* closed: fall back to the most recent page */
    }
  }
  const tabs = await chrome.tabs.query({ windowType: 'normal' }); // not our little reading windows
  const web = tabs.filter((t) => /^https?:\/\//i.test(t.url || ''));
  web.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return web[0] || null;
}

function friendlyError(err) {
  const m = String((err && err.message) || err || '');
  if (/error page|Frame with ID|Cannot access|cannot be scripted|extensions gallery|chrome-error|ERR_/i.test(m)) {
    return 'Chrome could not open that page. Check that the link works (it may not exist any more).';
  }
  if (/No tab with id|window was closed|Tabs cannot be edited/i.test(m)) {
    return 'The small window was closed too early. Leave the small windows alone while I work.';
  }
  return m || 'Something went wrong.';
}

// ---------------------------------------------------------------- the product queue
let running = false;
let stopRequested = false;
let pending = []; // ids waiting to be grabbed
let stats = { total: 0, done: 0, check: 0, failed: 0 };

function compact(r) {
  return {
    brand: r.brand || '',
    url: r.url || '',
    name: r.name || '',
    price: r.price || '',
    priceValue: r.priceValue == null ? null : r.priceValue,
    mainImage: r.mainImage || '',
    otherImages: r.otherImages || [],
    specs: r.specs || [],
    specGroups: r.specGroups || [],
    slideshowMode: r.slideshowMode || '',
    warnings: r.warnings || [],
  };
}

// THE ELECTROPLANET-STYLE SHEET (sheets/): the type you chose, or the one I detect
function applySheet(it) {
  if (!it || !it.result) return it;
  try {
    let type = it.ptype;
    if (!type) {
      const d = GHANDI_SHEETS.detect(it.result, it.url);
      type = d.id;
      it.ptypeAuto = d.id;
      it.ptypeSure = !!d.sure;
    }
    if (it.sheet && it.sheet.edited && it.sheet.type === type) return it; // your own edits stay
    const sh = GHANDI_SHEETS.build(it.result, type, { url: it.url, model: it.result.model || '' });
    it.sheet = { type: sh.type, label: sh.label, groups: sh.groups, extra: sh.extra, filled: sh.filled, model: sh.model, at: Date.now() };
  } catch (e) {
    it.sheet = null;
  }
  return it;
}

// an item that did not get its turn goes back to what it was: grabbed already, or just a link
function restState(it, message) {
  if (it.result && it.result.name) {
    it.status = it.result.warnings && it.result.warnings.length && !it.edited ? 'check' : 'done';
    it.message = it.status === 'check' ? it.result.warnings[0] : '';
  } else {
    it.status = 'found';
    it.message = message;
  }
  return it;
}

function runMessage() {
  const left = pending.length;
  const bits = [stats.done + ' done'];
  if (stats.check) bits.push(stats.check + ' to check');
  if (stats.failed) bits.push(stats.failed + ' failed');
  return bits.join(', ') + (left ? ', ' + left + ' waiting' : '');
}

async function processItem(id, settings, getSlot) {
  const started = await updateItem(id, (it) => {
    if (it.status !== 'queued') return it;
    it.status = 'working';
    it.message = 'Opening the page…';
    it.attempts = (it.attempts || 0) + 1;
    return it;
  });
  if (!started || started.status !== 'working') return;

  const say = (m) => updateItem(id, (it) => (it.status === 'working' ? Object.assign(it, { message: m.charAt(0).toUpperCase() + m.slice(1) }) : it));

  try {
    const t0 = Date.now();
    let r = null;
    let mode = 'window';
    // 1) quick read: download + read, no window
    if (settings.quickRead !== false) {
      try {
        const q = await quickRead(started.url, settings.recipeId);
        if (q && q.good && q.result) {
          r = q.result;
          mode = 'quick';
        }
      } catch (e) {
        /* quick read not possible: use the window */
      }
    }
    // 2) the normal way: a small window that really opens the page
    if (!r) {
      await say('opening the page…');
      const read = (tabId) => scrapeTab(tabId, settings.recipeId);
      // 2nd try: a brand-new window (a fresh window loads lazy pictures more reliably)
      const slot = getSlot && started.attempts < 2 ? await getSlot() : null;
      r = slot ? await readInSlot(slot, started.url, read, say) : await withPage(started.url, read, say);
    }
    const seconds = Math.round((Date.now() - t0) / 100) / 10;
    if (r && r.ok) {
      const c = compact(r);
      // pictures or specs missing? the page may have been slow: try once more at the end
      const shaky = c.warnings.some((w) => /picture|specification/i.test(w));
      if (shaky && started.attempts < 2 && !stopRequested) {
        await updateItem(id, (it) => Object.assign(it, { status: 'queued', message: 'Something was missing, I will try again at the end.' }));
        pending.push(id);
        await setRun({ message: runMessage() });
        return;
      }
      await updateItem(id, (it) => {
        it.result = c;
        it.debug = c.warnings.length ? r.debug || null : null;
        it.title = c.name || it.title;
        if (!it.image && c.mainImage) it.image = c.mainImage;
        if (it.sheet && it.sheet.edited) it.sheet.edited = false; // grabbed again: a fresh sheet
        applySheet(it);
        it.seconds = seconds;
        it.mode = mode;
        it.status = c.warnings.length ? 'check' : 'done';
        it.message = c.warnings[0] || '';
        it.finishedAt = Date.now();
        return it;
      });
      if (c.warnings.length) stats.check++;
      else stats.done++;
    } else {
      throw Object.assign(new Error((r && r.error) || 'I could not read this page.'), { debug: r && r.debug, notFound: !!(r && r.notFound) });
    }
  } catch (e) {
    const msg = friendlyError(e);
    const again = started.attempts < 2 && !stopRequested && !(e && e.notFound); // a missing page stays missing
    await updateItem(id, (it) => {
      it.status = again ? 'queued' : 'failed';
      it.message = again ? 'Will try again at the end. (' + msg + ')' : msg;
      it.debug = (e && e.debug) || it.debug || null;
      it.finishedAt = Date.now();
      return it;
    });
    if (again) pending.push(id);
    else stats.failed++;
  }
  await setRun({ message: runMessage(), done: stats.done + stats.check + stats.failed, total: stats.total });
  setBadge(String(Math.max(0, stats.total - (stats.done + stats.check + stats.failed))), '#1c6fc4');
}

async function worker(settings, index) {
  let slot = null;
  const light = settings.lightLoad !== false;
  try {
    while (!stopRequested) {
      const id = pending.shift();
      if (!id) break;
      // the small window is opened only if a product really needs it
      const getSlot = async () => {
        if (!(await slotAlive(slot))) {
          await closeSlot(slot);
          try {
            slot = await openSlot(light, index);
          } catch (e) {
            slot = null; // fall back to one window per product
          }
        }
        return slot;
      };
      await processItem(id, settings, getSlot);
      if (!stopRequested && pending.length && settings.delayMs) await sleep(settings.delayMs);
    }
  } finally {
    await closeSlot(slot);
  }
}

async function runQueue() {
  if (running) return;
  running = true;
  stopRequested = false;
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 10000);
  try {
    const settings = await getSettings();
    stats = { total: pending.length, done: 0, check: 0, failed: 0 };
    const runStarted = Date.now();
    await setRun({ state: 'running', message: 'Starting…', done: 0, total: stats.total, startedAt: runStarted });
    setBadge(String(stats.total), '#1c6fc4');
    const n = clamp(settings.workers, 1, 8);
    const pool = [];
    for (let i = 0; i < n; i++) {
      pool.push(sleep(i * 150).then(() => worker(settings, i))); // start them one after the other
    }
    // items added while we are running are picked up too
    await Promise.all(pool);
    while (!stopRequested && pending.length) await Promise.all(Array.from({ length: n }, (_, i) => worker(settings, i)));

    // anything we did not reach goes back to "ready"
    const leftOver = pending.slice();
    pending = [];
    for (const id of leftOver) await updateItem(id, (it) => (it.status === 'queued' ? restState(it, 'Not grabbed yet.') : it));
    await setRun({
      state: 'idle',
      message: stopRequested ? 'Stopped. ' + (pending.length + leftOver.length ? 'Some products are still waiting.' : '') : 'Finished.',
      done: stats.done + stats.check + stats.failed,
      total: stats.total,
      finishedAt: Date.now(),
    });
    if (stats.failed) setBadge(String(stats.failed), '#cf2a30');
    else setBadge('✓', '#1d9a52');
    // a desktop message when a long job ends (so you can do something else meanwhile)
    if (!stopRequested && Date.now() - runStarted > 30000) {
      notifyDone(
        'Ghandi Product Grabber: finished',
        stats.done + ' done' + (stats.check ? ', ' + stats.check + ' to check' : '') + (stats.failed ? ', ' + stats.failed + ' failed' : '') + '. Open the side tab to download the file.'
      );
    }
  } catch (err) {
    await setRun({ state: 'idle', message: friendlyError(err), finishedAt: Date.now() });
  } finally {
    clearInterval(keepAlive);
    running = false;
    stopRequested = false;
  }
}

async function queueItems(ids, statuses) {
  const queuedNow = await locked(async () => {
    const all = await getIds();
    const target = ids && ids.length ? all.filter((i) => ids.includes(i)) : all;
    const keys = target.map((i) => 'it:' + i);
    const got = await store.get(keys);
    const out = [];
    const write = {};
    for (const k of keys) {
      const it = got[k];
      if (!it || !statuses.includes(it.status)) continue;
      if (pending.includes(it.id)) continue;
      it.status = 'queued';
      it.attempts = 0;
      it.message = 'Waiting…';
      write[k] = it;
      out.push(it.id);
    }
    await store.set(write);
    return out;
  });
  pending.push(...queuedNow);
  if (running) stats.total += queuedNow.length;
  if (queuedNow.length || pending.length) runQueue();
  return queuedNow.length;
}

// ---------------------------------------------------------------- the link finder
let crawling = false;
let stopCrawl = false;

async function crawlList(opts) {
  if (crawling) return;
  crawling = true;
  stopCrawl = false;
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 10000);
  const settings = await getSettings();
  const recipeId = opts.recipeId || settings.recipeId;
  const maxPages = clamp(opts.maxPages || settings.maxPages, 1, 60);
  let found = 0;
  let newOnes = 0;
  let page = 0;
  let url = normalizeUrl(opts.url) || '';
  const visited = new Set();
  const newIds = [];
  let lastReport = null;
  try {
    if (!opts.tab && !url) throw new Error('Paste a category page link first.');
    await setCrawl({ state: 'running', message: 'Starting…', page: 0, found: 0, url: url || '(open tab)', report: null, startedAt: Date.now() });

    while ((opts.tab || url) && page < maxPages && !stopCrawl) {
      page++;
      const label = 'Page ' + page + (maxPages > 1 ? ' of up to ' + maxPages : '') + ': ';
      const say = (m) => setCrawl({ message: label + m, page });
      let tab = null;
      let r;
      if (opts.tab) {
        tab = await pickUserTab(opts.tabId);
        if (!tab) throw new Error('Open the category page in a normal Chrome tab first.');
        url = tab.url;
        await say('reading the tab you have open…');
        r = await collectTab(tab.id, recipeId);
      } else {
        visited.add(keyOf(url));
        await say('opening…');
        r = null;
        if (settings.quickRead !== false) {
          try {
            await say('quick read…');
            const q = await quickList(url, recipeId);
            if (q && q.good) r = q.result;
          } catch (e) {
            /* use the window */
          }
        }
        if (!r) r = await withPage(url, (tabId) => collectTab(tabId, recipeId), (m) => say(m));
      }
      lastReport = { url, brand: r.brand, how: r.how, expected: r.expected, warnings: r.warnings, diag: r.diag, linksFound: r.links.length };
      if (!r.ok) {
        if (page === 1) throw new Error(r.warnings[0] || 'I could not find product links on that page.');
        break;
      }
      const res = await addItems(r.links, {
        listing: url,
        listingTitle: r.title || '',
        category: opts.category != null ? opts.category : undefined,
        queue: !!opts.autoStart,
        ptype: opts.ptype,
      });
      newIds.push(...res.ids);
      found += r.links.length;
      newOnes += res.added;
      await setCrawl({ found, added: newOnes, page, message: label + r.links.length + ' links (' + res.added + ' new)', report: lastReport });

      if (opts.tab) break;
      const next = r.next ? normalizeUrl(r.next) : '';
      if (!next || visited.has(keyOf(next)) || res.added === 0) break; // no new pages, or nothing new -> stop
      url = next;
      await sleep(800);
    }

    await setCrawl({
      state: 'idle',
      message:
        (stopCrawl ? 'Stopped. ' : 'Done. ') +
        found +
        ' product links on ' +
        page +
        ' page' +
        (page === 1 ? '' : 's') +
        ' — ' +
        newOnes +
        ' new.',
      found,
      added: newOnes,
      page,
      report: lastReport,
      finishedAt: Date.now(),
    });
    if (opts.autoStart && newIds.length) {
      pending.push(...newIds.filter((i) => !pending.includes(i)));
      if (running) stats.total += newIds.length;
      runQueue();
    }
  } catch (err) {
    await setCrawl({ state: 'idle', error: true, message: friendlyError(err), report: lastReport, finishedAt: Date.now() });
  } finally {
    clearInterval(keepAlive);
    crawling = false;
    stopCrawl = false;
  }
}

// ---------------------------------------------------------------- grab the page you have open
async function grabOpenTab(opts) {
  const tab = await pickUserTab(opts.tabId);
  if (!tab) throw new Error('Open a product page in a normal Chrome tab first.');
  const url = normalizeUrl(tab.url);
  const added = await addItems([{ url, title: tab.title || '' }], { category: opts.category, ptype: opts.ptype });
  const id = hash(keyOf(url));
  await updateItem(id, (it) => Object.assign(it, { status: 'working', message: 'Reading the tab you have open…' }));
  try {
    const settings = await getSettings();
    const r = await scrapeTab(tab.id, opts.recipeId || settings.recipeId);
    if (!r.ok) throw new Error(r.error || 'I could not read this page.');
    const c = compact(r);
    await updateItem(id, (it) => {
      it.result = c;
      it.debug = c.warnings.length ? r.debug || null : null;
      it.title = c.name || it.title;
      it.image = c.mainImage || it.image;
      if (it.sheet) it.sheet.edited = false;
      applySheet(it);
      it.status = c.warnings.length ? 'check' : 'done';
      it.message = c.warnings[0] || '';
      it.finishedAt = Date.now();
      return it;
    });
    return { id, added: added.added };
  } catch (e) {
    await updateItem(id, (it) => Object.assign(it, { status: 'failed', message: friendlyError(e), finishedAt: Date.now() }));
    throw e;
  }
}

// ---------------------------------------------------------------- edits & cleaning
const EDITABLE = ['name', 'price', 'priceValue', 'brand', 'model', 'mainImage', 'otherImages', 'specs', 'specGroups', 'notes'];

function editItem(id, patch) {
  return updateItem(id, (it) => {
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'category')) it.category = String(patch.category || '');
    const body = Object.assign({}, patch);
    delete body.category;
    if (Object.keys(body).length) {
      it.result = it.result || { brand: '', url: it.url, name: '', price: '', priceValue: null, mainImage: '', otherImages: [], specs: [], specGroups: [], warnings: [] };
      EDITABLE.forEach((k) => {
        if (Object.prototype.hasOwnProperty.call(body, k)) it.result[k] = body[k];
      });
      it.edited = true;
      // you changed the brand's lines (or the name / model): the clean sheet follows, unless you edited the sheet itself
      if (!(it.sheet && it.sheet.edited) && (body.specGroups || body.name || body.model || body.brand)) applySheet(it);
      if (it.status === 'check' && it.result.name) {
        it.status = 'done'; // the person looked at it and fixed it
        it.message = 'Checked by you.';
      }
      if (body.name) it.title = body.name;
    }
    return it;
  });
}

function removeItems(ids) {
  return locked(async () => {
    const all = await getIds();
    const drop = new Set(ids);
    pending = pending.filter((i) => !drop.has(i));
    await chrome.storage.local.remove(ids.map((i) => 'it:' + i));
    await store.set({ ids: all.filter((i) => !drop.has(i)) });
  });
}

function clearAll() {
  return locked(async () => {
    const all = await getIds();
    pending = [];
    await chrome.storage.local.remove(all.map((i) => 'it:' + i).concat(['ids', 'run', 'crawl']));
  });
}

// ---------------------------------------------------------------- messages from the dashboard
async function handle(msg) {
  switch (msg.type) {
    case 'add-links': {
      const links = (msg.urls || []).map((u) => ({ url: u })).concat(msg.links || []);
      const res = await addItems(links, { category: msg.category, queue: !!msg.queue, ptype: msg.ptype });
      if (msg.queue && res.ids.length) {
        pending.push(...res.ids.filter((i) => !pending.includes(i)));
        if (running) stats.total += res.ids.length;
        runQueue();
      }
      return { ok: true, added: res.added, skipped: res.skipped };
    }
    case 'crawl':
      crawlList({ url: msg.url, maxPages: msg.maxPages, recipeId: msg.recipeId, category: msg.category, autoStart: !!msg.autoStart, ptype: msg.ptype });
      return { ok: true };
    case 'crawl-tab':
      crawlList({ tab: true, tabId: msg.tabId, recipeId: msg.recipeId, category: msg.category, autoStart: !!msg.autoStart, ptype: msg.ptype });
      return { ok: true };
    case 'grab-tab':
      return Object.assign({ ok: true }, await grabOpenTab({ tabId: msg.tabId, recipeId: msg.recipeId, category: msg.category, ptype: msg.ptype }));
    case 'start':
      return { ok: true, queued: await queueItems(msg.ids, ['found', 'queued']) };
    case 'retry':
      return { ok: true, queued: await queueItems(msg.ids, msg.ids ? ['failed', 'check', 'found', 'done'] : ['failed', 'check']) };
    case 'stop':
      stopRequested = true;
      stopCrawl = true;
      return { ok: true };
    case 'edit-item':
      await editItem(msg.id, msg.patch || {});
      return { ok: true };
    case 'set-category': {
      for (const id of msg.ids || []) await updateItem(id, (it) => Object.assign(it, { category: String(msg.category || '') }));
      return { ok: true };
    }
    case 'mark-exported': {
      const when = Date.now();
      for (const id of msg.ids || []) await updateItem(id, (it) => Object.assign(it, { exportedAt: when }));
      return { ok: true };
    }
    case 'mark-sent': {
      const when = Date.now();
      for (const id of msg.ids || []) await updateItem(id, (it) => Object.assign(it, { sentAt: when, sentBatch: msg.batchId || '' }));
      return { ok: true };
    }
    case 'remove':
      await removeItems(msg.ids || []);
      return { ok: true };
    case 'clear-all':
      await clearAll();
      return { ok: true };
    case 'set-type': {
      const ids = msg.ids || [];
      for (const id of ids) {
        await updateItem(id, (it) => {
          it.ptype = msg.ptype === 'auto' ? '' : msg.ptype || '';
          it.ptypeBy = msg.ptype === 'auto' ? '' : 'you';
          if (it.sheet) it.sheet.edited = false;
          return applySheet(it);
        });
      }
      return { ok: true, changed: ids.length };
    }
    case 'edit-sheet':
      await updateItem(msg.id, (it) => {
        if (!it.sheet) it.sheet = { type: it.ptype || 'other', label: '', groups: [], extra: [] };
        it.sheet.groups = msg.groups || [];
        it.sheet.edited = true;
        return it;
      });
      return { ok: true };
    case 'check-update':
      return { ok: true, update: await checkForUpdate(true) };
    case 'open-app':
      await openApp();
      return { ok: true };
    default:
      return { ok: false, error: 'unknown message' };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;
  handle(msg).then(sendResponse, (err) => sendResponse({ ok: false, error: friendlyError(err) }));
  return true; // answer comes later
});

// ---------------------------------------------------------------- right-click menu
function makeMenus() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: 'ghandi-find', title: 'Ghandi: find all products on this page', contexts: ['page'] });
      chrome.contextMenus.create({ id: 'ghandi-grab', title: 'Ghandi: grab this product', contexts: ['page'] });
      chrome.contextMenus.create({ id: 'ghandi-link', title: 'Ghandi: grab this product link', contexts: ['link'] });
      chrome.contextMenus.create({ id: 'ghandi-links', title: 'Ghandi: grab all products in my selection', contexts: ['selection'] });
    });
  } catch (e) {
    /* no right-click menu: fine */
  }
}
chrome.runtime.onInstalled.addListener(makeMenus);
chrome.runtime.onStartup.addListener(makeMenus);

try {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // show the side tab so you see what happens (allowed because you clicked)
    try {
      if (chrome.sidePanel && tab && tab.windowId != null) chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (e) {
      /* fine */
    }
    const settings = await getSettings();
    if (info.menuItemId === 'ghandi-find' && tab) {
      crawlList({ tab: true, tabId: tab.id, autoStart: settings.autoGrab !== false });
    } else if (info.menuItemId === 'ghandi-grab' && tab) {
      grabOpenTab({ tabId: tab.id }).catch(() => {});
    } else if (info.menuItemId === 'ghandi-link' && info.linkUrl) {
      await handle({ type: 'add-links', urls: [info.linkUrl], queue: true });
    } else if (info.menuItemId === 'ghandi-links' && tab) {
      // every link inside the text you selected
      try {
        const res = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const sel = window.getSelection();
            const out = [];
            for (let i = 0; i < sel.rangeCount; i++) {
              const frag = sel.getRangeAt(i).cloneContents();
              frag.querySelectorAll('a[href]').forEach((a) => {
                const u = new URL(a.getAttribute('href'), location.href);
                if (u.host === location.host && !out.includes(u.href)) out.push(u.href);
              });
            }
            return out;
          },
        });
        const urls = (res && res[0] && res[0].result) || [];
        if (urls.length) await handle({ type: 'add-links', urls, queue: true });
      } catch (e) {
        /* page not readable */
      }
    }
  });
} catch (e) {
  /* fine */
}

// ---------------------------------------------------------------- open the dashboard
async function openApp() {
  const url = chrome.runtime.getURL(APP_PAGE);
  const tabs = await chrome.tabs.query({ url });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}
// The icon opens a little side panel (a tab docked at the side of Chrome).
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
} else {
  chrome.action.onClicked.addListener(() => openApp()); // very old Chrome: full page instead
}

// ---------------------------------------------------------------- if Chrome restarted us in the middle of work
async function recover() {
  await locked(async () => {
    const ids = await getIds();
    if (!ids.length) return;
    const keys = ids.map((i) => 'it:' + i);
    const got = await store.get(keys);
    const write = {};
    keys.forEach((k) => {
      const it = got[k];
      if (it && (it.status === 'working' || it.status === 'queued')) {
        write[k] = restState(it, 'Was interrupted. Press "Grab" again.');
      }
    });
    if (Object.keys(write).length) await store.set(write);
    await store.set({
      run: { state: 'idle', message: Object.keys(write).length ? 'Chrome restarted. Unfinished products are ready to grab again.' : '', updatedAt: Date.now() },
      crawl: { state: 'idle', message: '', updatedAt: Date.now() },
    });
  });
}
try {
  chrome.declarativeNetRequest.getSessionRules().then((rs) => rs.length && chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: rs.map((r) => r.id) })).catch(() => {});
} catch (e) {
  /* fine */
}
recover();

// ---------------------------------------------------------------- updates (see updater/updater.js)
// Look for a new version when Chrome starts and every 6 hours. Tell the person once per version.
async function checkForUpdate(fromPanel) {
  let u;
  try {
    u = await GHANDI_UPDATER.check();
  } catch (e) {
    if (fromPanel) throw e;
    return null;
  }
  if (u.available && u.notified !== u.latest && !fromPanel) {
    try {
      chrome.notifications.create('ghandi-update', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Ghandi Product Grabber ' + u.latest + ' is ready',
        message: (u.notes[0] || 'A new version is ready.') + ' Open the side tab and click "Install update".',
        priority: 1,
      });
    } catch (e) {
      /* no notification: the side tab still shows it */
    }
    u.notified = u.latest;
    await chrome.storage.local.set({ update: u });
  }
  return u;
}
try {
  chrome.alarms.get('ghandi-update-check', (a) => {
    if (!a) chrome.alarms.create('ghandi-update-check', { delayInMinutes: 1, periodInMinutes: 360 });
  });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === 'ghandi-update-check') checkForUpdate(false);
  });
} catch (e) {
  /* no alarms: the side tab checks when it opens */
}
chrome.runtime.onStartup.addListener(() => checkForUpdate(false));
chrome.runtime.onInstalled.addListener(async (d) => {
  if (d.reason !== 'update') return;
  const { justUpdated } = await chrome.storage.local.get('justUpdated');
  const v = chrome.runtime.getManifest().version;
  try {
    chrome.notifications.create('ghandi-updated', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: justUpdated && justUpdated.undo ? 'Back to version ' + v : 'Updated to version ' + v + ' ✓',
      message: 'Your products and settings are still there.',
      priority: 0,
    });
  } catch (e) {
    /* fine */
  }
  checkForUpdate(false);
});
try {
  chrome.notifications.onClicked.addListener(async (id) => {
    if (id !== 'ghandi-update') return;
    try {
      const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
      await chrome.sidePanel.open({ windowId: w.id });
    } catch (e) {
      chrome.tabs.create({ url: chrome.runtime.getURL('app/app.html') });
    }
  });
} catch (e) {
  /* fine */
}
