/*
  updater.js — UPDATES WITHOUT UNINSTALLING

  How it works (simple):
    1. New versions are put on GitHub (github.com/Larxyzs/ghandi-grabber).
       The file "version.json" there says the newest version number, what changed,
       and the list of files (with a fingerprint for each one).
    2. The helper looks at that file when Chrome starts and every 6 hours.
       If there is a newer version, the side tab shows "New version ready".
    3. You click "Install update". The FIRST time, Chrome asks you to pick the
       extension's folder (the one you loaded in chrome://extensions) and to allow
       editing it. After that it remembers the folder.
    4. It downloads the new files, checks every fingerprint, keeps a copy of the old
       files in "backup-previous", writes the new files, and restarts itself.
       Your grabbed products and settings stay.

  Nothing is installed without your click.
*/
var GHANDI_UPDATER = (function () {
  'use strict';
  const DEFAULT_BASE = 'https://raw.githubusercontent.com/Larxyzs/ghandi-grabber/';
  const BACKUP = 'backup-previous';

  async function base() {
    const { settings } = await chrome.storage.local.get('settings');
    let b = (settings && settings.updateBase) || DEFAULT_BASE;
    if (!/\/$/.test(b)) b += '/';
    return b;
  }

  // "3.10.0" is newer than "3.9.2"
  function newer(a, b) {
    const x = String(a || '0').split('.').map(Number);
    const y = String(b || '0').split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0;
    }
    return false;
  }

  // ---------------------------------------------------------------- CHECK (also used by background.js)
  async function check() {
    const here = chrome.runtime.getManifest().version;
    const b = await base();
    const res = await fetch(b + 'main/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('The update server answered ' + res.status + '.');
    const info = await res.json();
    if (!info || !info.version || !Array.isArray(info.files) || !info.commit) throw new Error('The update file is not complete.');
    const update = {
      current: here,
      latest: info.version,
      notes: Array.isArray(info.notes) ? info.notes.slice(0, 12) : [],
      commit: info.commit,
      files: info.files,
      remove: Array.isArray(info.remove) ? info.remove : [],
      available: newer(info.version, here),
      checkedAt: Date.now(),
    };
    const old = (await chrome.storage.local.get('update')).update || {};
    update.dismissed = old.dismissed || '';
    update.notified = old.notified || '';
    await chrome.storage.local.set({ update });
    return update;
  }

  // ---------------------------------------------------------------- the remembered folder (IndexedDB)
  function db() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open('ghandi-updater', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function kv(key, value) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction('kv', value === undefined ? 'readonly' : 'readwrite');
      const st = t.objectStore('kv');
      const r = value === undefined ? st.get(key) : value === null ? st.delete(key) : st.put(value, key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function savedFolder() {
    try {
      return (await kv('folder')) || null;
    } catch (e) {
      return null;
    }
  }

  async function readText(dir, path) {
    try {
      const fh = await fileHandle(dir, path, false);
      return await (await fh.getFile()).text();
    } catch (e) {
      return null;
    }
  }

  // is this the folder Chrome loaded? (same name in manifest.json). Also accepts the folder ABOVE it.
  async function checkFolder(dir) {
    const mine = chrome.runtime.getManifest();
    const look = async (d) => {
      const t = await readText(d, 'manifest.json');
      if (!t) return null;
      try {
        const m = JSON.parse(t);
        return m.name === mine.name ? { dir: d, version: m.version } : null;
      } catch (e) {
        return null;
      }
    };
    let hit = await look(dir);
    if (!hit) {
      try {
        hit = await look(await dir.getDirectoryHandle('ghandi-product-grabber'));
      } catch (e) {
        /* not there */
      }
    }
    return hit;
  }

  // must be called straight from a click (Chrome asks the person)
  async function pickFolder() {
    if (typeof window.showDirectoryPicker !== 'function') throw Object.assign(new Error('This window cannot open the folder picker.'), { code: 'NO_PICKER' });
    const dir = await window.showDirectoryPicker({ id: 'ghandi-grabber', mode: 'readwrite' });
    const hit = await checkFolder(dir);
    if (!hit) throw new Error('That folder is not the extension. Pick the folder that has manifest.json inside (the one you chose in chrome://extensions → "Load unpacked").');
    await kv('folder', hit.dir);
    return hit;
  }

  async function allowWrite(dir) {
    if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
  }

  async function fileHandle(dir, path, create) {
    const parts = path.split('/').filter(Boolean);
    let d = dir;
    for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i], { create });
    return d.getFileHandle(parts[parts.length - 1], { create });
  }
  async function writeFile(dir, path, data) {
    const fh = await fileHandle(dir, path, true);
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
  }
  async function sha256(buf) {
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  async function readBytes(dir, path) {
    try {
      const fh = await fileHandle(dir, path, false);
      return await (await fh.getFile()).arrayBuffer();
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------- INSTALL (from a click)
  // say(text) shows progress. Ends with chrome.runtime.reload().
  async function install(say) {
    say = say || function () {};
    const update = (await chrome.storage.local.get('update')).update;
    if (!update || !newer(update.latest, chrome.runtime.getManifest().version)) throw new Error('There is no new version to install.');
    update.current = chrome.runtime.getManifest().version;

    // 1) the folder (asked only the first time) + the right to write in it
    let dir = await savedFolder();
    if (dir) {
      if (!(await allowWrite(dir))) throw new Error('Chrome did not allow me to change the files. Click "Install update" again and choose "Allow".');
      if (!(await checkFolder(dir))) dir = null; // the folder moved or was deleted
    }
    if (!dir) {
      say('Pick the extension folder…');
      dir = (await pickFolder()).dir;
    }

    // 2) download everything first and check each fingerprint (nothing is changed if one fails)
    const b = await base();
    const files = update.files.slice().sort((x, y) => (x.path === 'manifest.json') - (y.path === 'manifest.json')); // manifest LAST
    const got = [];
    let n = 0;
    for (const f of files) {
      if (!f.path || /(^|\/)\.\.(\/|$)/.test(f.path) || /^\//.test(f.path)) throw new Error('Bad file name in the update: ' + f.path);
      const old = await readBytes(dir, f.path);
      if (old && (await sha256(old)) === f.sha256) continue; // this file did not change
      say('Downloading ' + ++n + ' … ' + f.path);
      const res = await fetch(b + update.commit + '/' + f.path, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not download ' + f.path + ' (' + res.status + '). Nothing was changed.');
      const buf = await res.arrayBuffer();
      if ((await sha256(buf)) !== f.sha256) throw new Error('The file ' + f.path + ' arrived damaged. Nothing was changed. Try again later.');
      got.push({ path: f.path, buf, old });
    }

    // 3) keep the old files, then write the new ones
    say('Saving a copy of the old files…');
    try {
      await dir.removeEntry(BACKUP, { recursive: true });
    } catch (e) {
      /* no old copy */
    }
    const backed = [];
    for (const g of got) {
      if (g.old) {
        await writeFile(dir, BACKUP + '/' + g.path, g.old);
        backed.push(g.path);
      }
    }
    const added = got.filter((g) => !g.old).map((g) => g.path);
    await writeFile(dir, BACKUP + '/backup-info.json', JSON.stringify({ version: update.current, files: backed, added, at: new Date().toISOString() }, null, 2));
    say('Installing ' + update.latest + '…');
    for (const g of got) await writeFile(dir, g.path, g.buf);
    for (const p of update.remove) {
      try {
        const parts = p.split('/').filter(Boolean);
        let d = dir;
        for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i]);
        await d.removeEntry(parts[parts.length - 1], { recursive: true });
      } catch (e) {
        /* already gone */
      }
    }
    await chrome.storage.local.set({ justUpdated: { from: update.current, to: update.latest, at: Date.now() } });
    say('Done. Restarting… (if the side tab does not come back by itself, open chrome://extensions and press ↻ on Ghandi Product Grabber)');
    setTimeout(() => chrome.runtime.reload(), 600);
    return { changed: got.length };
  }

  // ---------------------------------------------------------------- UNDO the last update
  async function hasBackup() {
    const dir = await savedFolder();
    if (!dir) return null;
    try {
      if ((await dir.queryPermission({ mode: 'read' })) !== 'granted') return { unknown: true };
      const t = await readText(dir, BACKUP + '/backup-info.json');
      return t ? JSON.parse(t) : null;
    } catch (e) {
      return null;
    }
  }
  async function undo(say) {
    say = say || function () {};
    const dir = await savedFolder();
    if (!dir) throw new Error('No update was installed from this computer yet.');
    if (!(await allowWrite(dir))) throw new Error('Chrome did not allow me to change the files.');
    const t = await readText(dir, BACKUP + '/backup-info.json');
    if (!t) throw new Error('There is no copy of an older version.');
    const info = JSON.parse(t);
    const order = info.files.slice().sort((x, y) => (x === 'manifest.json') - (y === 'manifest.json'));
    for (const p of order) {
      say('Putting back ' + p);
      const buf = await readBytes(dir, BACKUP + '/' + p);
      if (buf) await writeFile(dir, p, buf);
    }
    await chrome.storage.local.set({ justUpdated: { from: chrome.runtime.getManifest().version, to: info.version, at: Date.now(), undo: true } });
    say('Done. Restarting…');
    setTimeout(() => chrome.runtime.reload(), 300);
  }

  return { check, install, undo, hasBackup, pickFolder, savedFolder, newer, DEFAULT_BASE };
})();
