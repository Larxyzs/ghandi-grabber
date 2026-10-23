/*
  offscreen.js — the "QUICK READ".

  Opening a real window for every product is slow (the page must load its
  pictures, scripts, ads...). Most brand pages already contain everything in
  their HTML text. So background.js first DOWNLOADS the page as text, and this
  invisible page reads it with the same brain (core.js) and the same recipes,
  without running any of the website's scripts. It takes a fraction of a second.

  If something is missing (a part of the page that only appears after a click,
  or pictures added later by the website), background.js falls back to the
  normal small window. So quick read never makes the result worse.
*/
(function () {
  'use strict';

  // load the brand recipes listed in recipe-list.js
  const ready = (async () => {
    for (const f of RECIPE_FILES) {
      await new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = '../' + f;
        s.onload = s.onerror = resolve;
        document.head.appendChild(s);
      });
    }
  })();

  function judge(r, recipe, url) {
    const q = (recipe && recipe.quickRead) || {};
    if (recipe && recipe.quickRead === false) return 'this brand needs a real window';
    if (!r || !r.ok) return 'nothing found';
    if (!r.name) return 'no name';
    // some pages add their price only after they open (lg.com/ma): the text alone is not enough
    if (q.needPrice && !r.price && false /* prices are off since 3.7.16 */) {
      let need = q.needPrice === true;
      try {
        const u = new URL(url);
        if (typeof q.needPrice === 'function') need = !!q.needPrice(u.hostname.replace(/\.localhost$/, ''), u.pathname);
      } catch (e) {
        /* keep the plain answer */
      }
      if (need) return 'the price appears only in a real window';
    }
    const pics = (r.mainImage ? 1 : 0) + (r.otherImages || []).length;
    if (pics < (q.minPictures || 2)) return 'only ' + pics + ' picture(s)';
    const min = r.slideshowMode === 'nospecs' ? 0 : q.minSpecs || (recipe ? 8 : 12);
    if ((r.specs || []).length < min) return 'only ' + (r.specs || []).length + ' spec rows';
    if ((r.warnings || []).length) return 'warning: ' + r.warnings[0];
    return '';
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.target !== 'offscreen' || (msg.type !== 'quick-read' && msg.type !== 'quick-list')) return;
    // "?page=3", "?p=3", ".../page/3": the last page of a list has fewer products, that is normal
    function pageNumber(url) {
      try {
        const u = new URL(url);
        const q = u.searchParams.get('page') || u.searchParams.get('p') || u.searchParams.get('pg') || (u.pathname.match(/\/page\/(\d+)/) || [])[1];
        return parseInt(q, 10) || 1;
      } catch (e) {
        return 1;
      }
    }
    // "?tvs-for-gaming", "?brand=lg&sort=price" ... but not page numbers or tracking
    function filtersInAddress(url) {
      try {
        const u = new URL(url);
        const keys = Array.from(u.searchParams.keys()).filter((k) => !/^(p|page|pg|pagenumber|utm_.*|gclid|fbclid)$/i.test(k));
        return keys.length > 0;
      } catch (e) {
        return false;
      }
    }
    if (msg.type === 'quick-list') {
      (async () => {
        await ready;
        const doc = new DOMParser().parseFromString(msg.html, 'text/html');
        const base = doc.createElement('base');
        base.href = msg.url;
        (doc.head || doc.documentElement).prepend(base);
        const G2 = window.GHANDI.forDocument(doc, msg.url);
        const r = await G2.collectLinks({ static: true, recipeId: msg.recipeId });
        let why = '';
        if (!r.ok || r.links.length < 2) why = 'no product links in the page text';
        else if (r.hasLoadMore) why = 'has a "show more" button';
        else if (r.expected && r.links.length < r.expected && !r.next && pageNumber(msg.url) <= 1) why = 'only ' + r.links.length + ' of ' + r.expected;
        else if (r.expected && r.links.length > r.expected) why = 'more links (' + r.links.length + ') than the page says (' + r.expected + ')';
        else if (filtersInAddress(msg.url)) why = 'filters in the address (the page applies them with its scripts)';
        sendResponse({ ok: true, good: !why, why, result: r });
      })().catch((e) => sendResponse({ ok: false, good: false, why: String((e && e.message) || e) }));
      return true;
    }
    (async () => {
      await ready;
      const doc = new DOMParser().parseFromString(msg.html, 'text/html');
      // make relative links (pictures!) point to the brand website, not to the extension
      const base = doc.createElement('base');
      base.href = msg.url;
      (doc.head || doc.documentElement).prepend(base);
      const G2 = window.GHANDI.forDocument(doc, msg.url);
      const r = await G2.run({ static: true, recipeId: msg.recipeId, timeoutMs: 5000, slideshowMode: msg.slideshowMode, productType: msg.productType || '' });
      const recipe = G2.pickRecipeFor(new URL(msg.url).hostname, msg.recipeId);
      const why = judge(r, recipe, msg.url);
      sendResponse({ ok: true, good: !why, why, result: r });
    })().catch((e) => sendResponse({ ok: false, good: false, why: String((e && e.message) || e) }));
    return true;
  });
})();
