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

  function judge(r, recipe) {
    const q = (recipe && recipe.quickRead) || {};
    if (recipe && recipe.quickRead === false) return 'this brand needs a real window';
    if (!r || !r.ok) return 'nothing found';
    if (!r.name) return 'no name';
    const pics = (r.mainImage ? 1 : 0) + (r.otherImages || []).length;
    if (pics < (q.minPictures || 2)) return 'only ' + pics + ' picture(s)';
    const min = r.slideshowMode === 'nospecs' ? 0 : q.minSpecs || (recipe ? 8 : 12);
    if ((r.specs || []).length < min) return 'only ' + (r.specs || []).length + ' spec rows';
    if ((r.warnings || []).length) return 'warning: ' + r.warnings[0];
    return '';
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.target !== 'offscreen' || (msg.type !== 'quick-read' && msg.type !== 'quick-list')) return;
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
        else if (r.expected && r.links.length < r.expected) why = 'only ' + r.links.length + ' of ' + r.expected;
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
      const r = await G2.run({ static: true, recipeId: msg.recipeId, timeoutMs: 5000, slideshowMode: msg.slideshowMode });
      const recipe = G2.pickRecipeFor(new URL(msg.url).hostname, msg.recipeId);
      const why = judge(r, recipe);
      sendResponse({ ok: true, good: !why, why, result: r });
    })().catch((e) => sendResponse({ ok: false, good: false, why: String((e && e.message) || e) }));
    return true;
  });
})();
