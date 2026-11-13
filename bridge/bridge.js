/*
  BRIDGE: lets the owner's own site (ghandihomeelectro.com) drive the extension.
  Runs only on ghandihomeelectro.com. The page sends window.postMessage({ghandi:'bridge', id, cmd, args});
  the answer comes back as {ghandi:'bridge-reply', id, ok, data|error}.
  Commands: hello, crawl {url, ptype, category} (only lists of the known shops/brands),
            add {urls, ptype, category}, retry {ids}, remove {ids}, setCategory {ids, category},
            setType {ids, ptype}, update, updateResult, status {since}, send {ids}, sendResult.
  The site's secret key never leaves the extension: sending is done by the extension's own page.
*/
(function () {
  if (window.__ghandiBridge) return;
  window.__ghandiBridge = true;
  var HOSTS = /(^|\.)(lg\.com|samsung\.com|tcl\.com|haier-europe\.com|whirlpool\.ma|candy-home\.com|bosch-home\.ma|electrobousfiha\.com|electroplanet\.ma)$/i;
  var get = function (keys) {
    return new Promise(function (r) {
      chrome.storage.local.get(keys, r);
    });
  };
  var msg = function (m) {
    return new Promise(function (r) {
      chrome.runtime.sendMessage(m, r);
    });
  };
  function summary(it) {
    var r = it.result || {};
    var main = r.mainImage || '';
    return {
      id: it.id,
      url: it.url,
      status: it.status,
      sent: !!it.sentAt,
      name: r.name || '',
      brand: r.brand || '',
      model: r.model || (it.sheet && it.sheet.model) || '',
      type: (it.sheet && it.sheet.type) || it.ptype || it.ptypeAuto || '',
      pictures: (main ? 1 : 0) + (r.otherImages || []).filter(function (u) { return u && u !== main; }).length,
      images: (main ? [main] : []).concat((r.otherImages || []).filter(function (u) { return u && u !== main; })),
      specs: (r.specs || []).length,
      sheetRows: it.sheet && it.sheet.groups ? it.sheet.groups.reduce(function (n, g) { return n + (g.rows || []).length; }, 0) : 0,
      warnings: (r.warnings || []).slice(0, 3),
      message: it.message || '',
      addedAt: it.addedAt || 0,
    };
  }
  var COMMANDS = {
    hello: function () {
      return { version: chrome.runtime.getManifest().version };
    },
    crawl: function (a) {
      var u;
      try {
        u = new URL(String(a.url || ''));
      } catch (e) {
        throw new Error('bad address');
      }
      if (u.protocol !== 'https:' || !HOSTS.test(u.hostname)) throw new Error('not a known shop or brand site');
      return msg({ type: 'crawl', url: u.href, autoStart: true, ptype: a.ptype || undefined, category: a.category || undefined });
    },
    add: function (a) {
      var urls = (a.urls || []).slice(0, 300).map(function (x) {
        var u = new URL(String(x));
        if (u.protocol !== 'https:' || !HOSTS.test(u.hostname)) throw new Error('not a known shop or brand site: ' + u.hostname);
        return u.href;
      });
      return msg({ type: 'add-links', urls: urls, queue: true, ptype: a.ptype || undefined, category: a.category || undefined });
    },
    retry: function (a) {
      return msg({ type: 'retry', ids: (a.ids || []).slice(0, 500) });
    },
    remove: function (a) {
      return msg({ type: 'remove', ids: (a.ids || []).slice(0, 500) });
    },
    setCategory: function (a) {
      return msg({ type: 'set-category', ids: (a.ids || []).slice(0, 500), category: String(a.category || '') });
    },
    setType: function (a) {
      return msg({ type: 'set-type', ids: (a.ids || []).slice(0, 500), ptype: String(a.ptype || 'auto') });
    },
    // install a waiting update without anyone clicking (works when Chrome already allowed the folder)
    update: async function () {
      var r = await msg({ type: 'check-update' });
      var u = r && r.update;
      if (!u || !u.available) return { current: chrome.runtime.getManifest().version, latest: u && u.latest, nothing: true };
      await chrome.storage.local.set({ autoUpdateNow: { at: Date.now(), to: u.latest } });
      await new Promise(function (res) { setTimeout(res, 1500); });
      var o = await get(['autoUpdateNow']);
      if (o.autoUpdateNow) await msg({ type: 'open-app' });
      return { current: chrome.runtime.getManifest().version, latest: u.latest };
    },
    updateResult: async function () {
      return (await get(['autoUpdateResult'])).autoUpdateResult || null;
    },
    status: async function (a) {
      var o = await get(['ids', 'run', 'crawl']);
      var ids = o.ids || [];
      var its = await get(ids.map(function (id) { return 'it:' + id; }));
      var since = Number(a.since || 0);
      var items = ids.map(function (id) { return its['it:' + id]; }).filter(function (it) { return it && (it.addedAt || 0) >= since; }).map(summary);
      return { run: o.run || {}, crawl: o.crawl || {}, items: items };
    },
    send: async function (a) {
      var token = Math.random().toString(36).slice(2);
      await chrome.storage.local.set({ autoSend: { token: token, at: Date.now(), ids: (a.ids || []).slice(0, 500) } });
      await new Promise(function (r) { setTimeout(r, 1500); });
      // no copy of the extension's page open to take it: open one
      var o = await get(['autoSend']);
      if (o.autoSend && o.autoSend.token === token) await msg({ type: 'open-app' });
      return { token: token };
    },
    sendResult: async function () {
      return (await get(['autoSendResult'])).autoSendResult || null;
    },
  };
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source !== window || e.origin !== location.origin || !d || d.ghandi !== 'bridge' || !COMMANDS[d.cmd]) return;
    Promise.resolve()
      .then(function () { return COMMANDS[d.cmd](d.args || {}); })
      .then(
        function (data) { window.postMessage({ ghandi: 'bridge-reply', id: d.id, ok: true, data: data }, location.origin); },
        function (err) { window.postMessage({ ghandi: 'bridge-reply', id: d.id, ok: false, error: String((err && err.message) || err) }, location.origin); }
      );
  });
  document.documentElement.setAttribute('data-ghandi-bridge', chrome.runtime.getManifest().version);
})();
