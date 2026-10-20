/*
  sheets/engine.js — THE "ELECTROPLANET STYLE" SPEC SHEET

  Every brand writes the same facts in its own words:
      LG       "Réservation marche/arrêt (24 heures) = Oui"
      Samsung  "Minuterie 24 heures = Oui"
      Bosch    "Minuteur = Pas applicable"
  Electroplanet shows ONE clean sheet for every brand, with the same sections and the
  same labels for a product type:  "Minuteur = Oui".

  This file is the translator. For each product TYPE (fridge, air conditioner, washing
  machine, TV, hob, built-in oven, built-in microwave, sink) a template (templates.js) lists
  the sections and the lines of the clean sheet, and for each line WHERE to find it in the
  brand's specs (several spellings, French and English), plus small rules
  (BTU from the name, "Oui (6 niveaux)" -> "Oui", "597 x 1 860 x 674" -> width, height, depth...).

  Nothing is invented: a line appears only when the brand page says it (or the name says it).
  The brand's original specs are always kept too (brandSpecGroups in the file).
*/
var GHANDI_SHEETS = (function () {
  'use strict';

  const TEMPLATES = {};
  const ORDER = [];

  // ---------------------------------------------------------------- text tools
  const tidy = (s) =>
    String(s == null ? '' : s)
      .replace(/[   ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  // lower case, no accents, straight quotes: "Capacité nette (réfrigérateur)" -> "capacite nette (refrigerateur)"
  const key = (s) =>
    tidy(s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[’‘`´]/g, "'")
      .replace(/[‐‑–—]/g, '-')
      .toLowerCase();
  const toArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

  // values that mean "nothing"
  const EMPTY = /^(n\/?a|n\.a\.?|na|-+|\?|pas applicable|non applicable|not applicable|general\.n_a.*|aucune valeur|null|undefined|\(empty\)|ea|tbd|0 ea)$/i;
  const isEmpty = (v) => !tidy(v) || EMPTY.test(key(v)) || /^general\.n_a/i.test(tidy(v)) || /^\s*n_a\b/i.test(tidy(v));

  // "Oui", "Oui (6 niveaux)", "Yes", "✓", "Auto" -> true ; "Non", "No", "Aucune", "sans" -> false
  function yesOf(v) {
    const k = key(v);
    if (!k || isEmpty(v)) return null;
    if (/^(non|no|false|faux|aucune?|none|sans|absent|indisponible|not available|not supported|0|off|non disponible|impossible)\b/.test(k)) return false;
    return true; // "Oui", "Yes", "Auto", "Haut-bas", "LED", "2", "Wi-Fi 5"... = the product has it
  }

  // "1 860" -> 1860 ; "10,8 kg" -> 10.8 ; "3.50 kW" -> 3.5
  function numOf(v) {
    const s = String(v == null ? '' : v)
      .replace(/[   ]/g, ' ')
      .replace(/(\d)[ '](?=\d{3}(?!\d))/g, '$1');
    const m = s.match(/-?\d+(?:[.,]\d+)?/);
    return m ? parseFloat(m[0].replace(',', '.')) : null;
  }
  function numsOf(v) {
    const s = String(v == null ? '' : v)
      .replace(/[   ]/g, ' ')
      .replace(/(\d)[ '](?=\d{3}(?!\d))/g, '$1');
    return (s.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(',', '.')));
  }
  // French number: 10.8 -> "10,8" ; 333 -> "333"
  function fr(n, dec) {
    if (n == null || isNaN(n)) return '';
    const x = dec == null ? Math.round(n * 100) / 100 : Number(Number(n).toFixed(dec));
    return String(x).replace('.', ',');
  }

  // English colour words -> French (LG / Samsung write "White", "Silver", "Refined Inox"...)
  const COLORS = [
    [/\b(stainless( steel)?|inox(ydable)?|acier inox(ydable)?|refined inox|steel)\b/i, 'Inox'],
    [/\b(white|blanc|blanche)\b/i, 'Blanc'],
    [/\b(black|noir|noire|carbone?|graphite black)\b/i, 'Noir'],
    [/\b(silver|argent(e)?|platinum|platine|metal)\b/i, 'Argent'],
    [/\b(gr[ae]y|gris|anthracite|graphite|dark ?grey|titan(e|ium)?)\b/i, 'Gris'],
    [/\b(beige|cream|creme)\b/i, 'Beige'],
    [/\b(gold|dore|doree|champagne)\b/i, 'Doré'],
    [/\b(blue|bleu)\b/i, 'Bleu'],
    [/\b(red|rouge)\b/i, 'Rouge'],
    [/\b(green|vert)\b/i, 'Vert'],
    [/\b(brown|marron)\b/i, 'Marron'],
    [/\b(pink|rose)\b/i, 'Rose'],
  ];
  function colorFr(v) {
    const k = key(v);
    if (!k) return '';
    const out = [];
    COLORS.forEach(([re, fr]) => {
      if (re.test(k) && out.indexOf(fr) === -1) out.push(fr);
    });
    if (!out.length) return tidy(v).replace(/^./, (c) => c.toUpperCase());
    return out.slice(0, 2).join(' / ');
  }
  const cap = (s) => tidy(s).replace(/^./, (c) => c.toUpperCase());

  // ---------------------------------------------------------------- the product's rows
  function makeCtx(result, opts) {
    const r = result || {};
    const groups = r.specGroups && r.specGroups.length ? r.specGroups : r.specs && r.specs.length ? [{ title: '', rows: r.specs }] : [];
    const rows = [];
    groups.forEach((g) =>
      (g.rows || []).forEach((row) => {
        const label = tidy(row.label);
        const value = tidy(row.value);
        if (!label) return;
        // LG summary lines: "CARACTÉRISTIQUES GÉNÉRALES - Capacité ..." -> "Capacité ..."
        const clean = label.replace(/^[^a-z]*[A-ZÀ-Ý][A-ZÀ-Ý '’&()\/-]{3,}\s+-\s+/, '');
        rows.push({ label: clean, value, group: tidy(g.title), k: key(clean), gk: key(g.title), used: false, empty: isEmpty(value) });
      })
    );
    const name = tidy(r.name);
    const url = tidy((opts && opts.url) || r.url || '');
    let path = '';
    try {
      path = decodeURIComponent(new URL(url).pathname);
    } catch (e) {
      path = url;
    }
    const textAll = key(name + ' ' + path + ' ' + rows.map((x) => x.label + ' ' + x.value).join(' '));
    const c = {
      r,
      rows,
      name,
      nk: key(name),
      url,
      pk: key(path.replace(/[-_/]+/g, ' ')),
      brand: tidy(r.brand),
      bk: key(r.brand),
      textAll,
      // first row (with a real value) whose label matches one of the patterns, in pattern order
      find(res, opts2) {
        const o = opts2 || {};
        for (const re of toArray(res)) {
          for (const x of rows) {
            if (x.empty && !o.allowEmpty) continue;
            if (o.group && !o.group.test(x.gk)) continue;
            if (o.not && o.not.test(x.k)) continue;
            if (re.test(x.k)) return x;
          }
        }
        return null;
      },
      all(res, opts2) {
        const o = opts2 || {};
        const out = [];
        for (const re of toArray(res)) {
          for (const x of rows) {
            if (x.empty || out.indexOf(x) !== -1) continue;
            if (o.group && !o.group.test(x.gk)) continue;
            if (o.not && o.not.test(x.k)) continue;
            if (re.test(x.k)) out.push(x);
          }
        }
        return out;
      },
      val(res, opts2) {
        const x = c.find(res, opts2);
        if (!x) return '';
        x.used = true;
        return x.value;
      },
      // true if ANY matching row says yes, false if they all say no, null if none
      yes(res, opts2) {
        const list = c.all(res, opts2);
        if (!list.length) return null;
        let seenNo = false;
        for (const x of list) {
          const y = yesOf(x.value);
          if (y === true) {
            list.forEach((z) => (z.used = true));
            return true;
          }
          if (y === false) seenNo = true;
        }
        if (seenNo) {
          list.forEach((z) => (z.used = true));
          return false;
        }
        return null;
      },
      num(res, opts2) {
        const x = c.find(res, opts2);
        if (!x) return null;
        const n = numOf(x.value);
        if (n != null) x.used = true;
        return n;
      },
      has: (re) => re.test(c.textAll),
      inName: (re) => re.test(c.nk) || re.test(c.pk),
      model: '',
    };
    c.model = (opts && opts.model) || modelOf(r, url, c);
    return c;
  }

  // ---------------------------------------------------------------- model code ("Code produit")
  function modelOf(r, url, ctx) {
    const c = ctx || makeCtx(r, { url, model: 'x' });
    // the page says it (Haier / Candy "Référence commerciale", Whirlpool "Modèle"...)
    const ref = c.find([/^reference commerciale$/, /^(modele|model|nom du modele|nom de modele|code modele|reference du modele|reference)$/]);
    if (ref && /\d/.test(ref.value) && ref.value.length <= 30) return ref.value.trim();
    const name = c.name;
    // "WBMF 606374 XNA: Lave-linge..." (the model first, in capitals)
    let m = name.match(/^([A-Z0-9][A-Z0-9 \-\/.]{3,28}?)\s*[:|–-]\s/);
    if (m && /\d/.test(m[1]) && /[A-Z]/.test(m[1])) return m[1].trim();
    // "Lave-Linge EcoBubble 8 kg - WW80TA046AX" (the model last)
    m = name.match(/[-–|:]\s*([A-Z0-9][A-Z0-9\-\/.]{4,24})\s*$/);
    if (m && /\d/.test(m[1]) && /[A-Z]/.test(m[1])) return m[1].trim();
    try {
      const segs = new URL(url).pathname.split('/').filter(Boolean);
      for (let i = segs.length - 1; i >= 0; i--) {
        const seg = decodeURIComponent(segs[i]);
        if (/^(p|\d)$/i.test(seg)) continue;
        if (/\d/.test(seg) && /[a-z]/i.test(seg) && !/\.(html?|php)$/i.test(seg)) {
          // samsung: ".../ar9500t-non-windfree-ar50f12c1rhnrc" -> the LAST piece with letters + digits
          const parts = seg.split('-').filter((p) => /\d/.test(p) && /[a-z]/i.test(p) && p.length >= 6);
          if (seg.length > 20 && parts.length) return parts[parts.length - 1].toUpperCase();
          if (seg.length <= 32) return seg.toUpperCase();
        }
        break;
      }
    } catch (e) {
      /* no address */
    }
    m = name.match(/\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9][A-Z0-9-]{4,}\b/);
    return m ? m[0] : '';
  }

  // ---------------------------------------------------------------- product type
  function detect(result, url) {
    const r = result || {};
    let path = '';
    try {
      path = decodeURIComponent(new URL(url || r.url || '').pathname);
    } catch (e) {
      path = String(url || r.url || '');
    }
    const pk = key(path.replace(/[-_/]+/g, ' '));
    const nk = key(r.name);
    const tk = key((r.specGroups || []).map((g) => g.title + ' ' + (g.rows || []).map((x) => x.label).join(' ')).join(' '));
    const scores = {};
    ORDER.forEach((id) => {
      const t = TEMPLATES[id];
      let s = 0;
      toArray(t.detect).forEach((re) => {
        if (re.test(pk)) s += 3;
        if (re.test(nk)) s += 3;
      });
      toArray(t.detectSpecs).forEach((re) => {
        if (re.test(tk)) s += 1;
      });
      toArray(t.notIf).forEach((re) => {
        if (re.test(pk) || re.test(nk)) s -= 6;
      });
      scores[id] = s;
    });
    let best = '';
    ORDER.forEach((id) => {
      if (scores[id] > 0 && (!best || scores[id] > scores[best])) best = id;
    });
    const second = ORDER.filter((id) => id !== best).reduce((m, id) => Math.max(m, scores[id]), 0);
    return { id: best || 'other', sure: !!best && scores[best] >= 3 && scores[best] > second, scores };
  }

  // ---------------------------------------------------------------- build the sheet
  function fieldValue(f, c) {
    if (f.when && !f.when(c)) return '';
    let v = '';
    if (f.get) v = f.get(c);
    else if (f.yes) {
      const y = c.yes(f.yes, f.opts);
      v = y === true ? 'Oui' : y === false ? 'Non' : '';
    } else if (f.num) {
      const x = c.find(f.num, f.opts);
      if (x) {
        let n = f.pick ? f.pick(numsOf(x.value), x) : numOf(x.value);
        if (n != null && f.conv) n = f.conv(n, x);
        if (n != null && !isNaN(n)) {
          x.used = true;
          v = fr(n, f.dec) + (f.unit ? ' ' + f.unit : '');
        }
      }
    } else if (f.text) {
      const x = c.find(f.text, f.opts);
      if (x) {
        x.used = true;
        v = x.value;
        if (f.map === 'color') v = colorFr(v);
        else if (typeof f.map === 'function') v = f.map(v, c, x);
      }
    }
    if (v == null) return '';
    v = tidy(v);
    if (!v || isEmpty(v)) return '';
    return v;
  }

  function build(result, typeId, opts) {
    const o = opts || {};
    const t = TEMPLATES[typeId];
    const c = makeCtx(result, o);
    c.type = typeId;
    const out = { type: t ? typeId : 'other', label: t ? t.label : 'Autre', groups: [], filled: 0, extra: [], model: c.model };
    // "Autre Caractéristique": brand + product code, like Electroplanet
    const head = [];
    if (c.brand) head.push({ label: 'Marque', value: c.brand });
    if (c.model) head.push({ label: 'Code produit', value: c.model });
    if (head.length) out.groups.push({ title: 'Autre Caractéristique', rows: head });
    if (!t) {
      // unknown type: the brand's own sections, cleaned (no "N/A", no doubles)
      const seen = new Set();
      ((result && result.specGroups) || []).forEach((g) => {
        const rows = (g.rows || []).filter((x) => {
          const k = key(x.label) + '|' + key(x.value);
          if (!tidy(x.label) || isEmpty(x.value) || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        if (rows.length) out.groups.push({ title: g.title || 'Caractéristiques', rows: rows.map((x) => ({ label: tidy(x.label), value: tidy(x.value) })) });
      });
      return out;
    }
    t.groups.forEach((g) => {
      const rows = [];
      g.fields.forEach((f) => {
        let v = '';
        try {
          v = fieldValue(f, c);
        } catch (e) {
          v = '';
        }
        if (v && !rows.some((x) => x.label === f.l)) rows.push({ label: f.l, value: v });
      });
      if (rows.length) {
        out.groups.push({ title: g.title, rows });
        out.filled += rows.length;
      }
    });
    // lines of the brand that found no place in the clean sheet
    out.extra = c.rows.filter((x) => !x.used && !x.empty).map((x) => ({ label: x.label, value: x.value }));
    if (o.keepExtra && out.extra.length) {
      const seen = new Set();
      const rows = out.extra.filter((x) => {
        const k = key(x.label) + '|' + key(x.value);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      out.groups.push({ title: 'Autres Caractéristiques', rows });
    }
    return out;
  }

  function register(t) {
    TEMPLATES[t.id] = t;
    if (ORDER.indexOf(t.id) === -1) ORDER.push(t.id);
  }
  // the order of the buttons in "What are you grabbing?"
  const PICK = ['fridge', 'ac', 'washer', 'tv', 'hob', 'oven', 'microwave', 'sink', 'dishwasher', 'fan'];
  function types() {
    const ids = ORDER.slice().sort((a, b) => (PICK.indexOf(a) === -1 ? 99 : PICK.indexOf(a)) - (PICK.indexOf(b) === -1 ? 99 : PICK.indexOf(b)));
    return ids.map((id) => ({ id, label: TEMPLATES[id].label, icon: TEMPLATES[id].icon || '' }));
  }

  return {
    register,
    types,
    detect,
    build,
    model: (r, url) => modelOf(r, url),
    tools: { tidy, key, yesOf, numOf, numsOf, fr, colorFr, cap, isEmpty, toArray },
  };
})();
if (typeof module !== 'undefined') module.exports = GHANDI_SHEETS;
