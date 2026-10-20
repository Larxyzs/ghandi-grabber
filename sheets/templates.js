/*
  sheets/templates.js — ONE CLEAN SHEET PER PRODUCT TYPE (Electroplanet style)

  How to read a line:
     { l: 'Minuteur', yes: [/minut/, /timer/] }
        -> the clean sheet line "Minuteur" = "Oui"/"Non", taken from any brand line whose
           name matches one of the patterns (patterns are lower case, without accents).
     { l: 'Couleur du produit', text: [/couleur/], map: 'color' }   -> the text, colours in French
     { l: 'Poids', num: [/^poids/], unit: 'kg' }                     -> "68 kg"
     { l: 'Type', get: (c) => ... }                                  -> a small rule
  A line with nothing found is simply not shown.
*/
(function (S) {
  'use strict';
  const T = S.tools;
  const { numOf, numsOf, fr, key, tidy, cap } = T;

  // ---------------------------------------------------------------- shared little rules
  const yesNo = (b) => (b === true ? 'Oui' : b === false ? 'Non' : '');
  const firstNum = (v) => numOf(v);
  const withUnit = (n, unit, dec) => (n == null || isNaN(n) ? '' : fr(n, dec) + ' ' + unit);

  // dimensions: separate lines first, else "597 x 1 860 x 674" with the order written in the label
  function dim(c, which, opts) {
    const o = opts || {};
    const W = [/^largeur( du produit| de l'appareil| produit| nette| net| sans emballage)?( \(mm\)| \(cm\))?$/, /^largeur (appareil|du produit|produit)/, /^width/];
    const H = [/^hauteur( du produit| de l'appareil| produit| nette| net)?( \(mm\)| \(cm\))?$/, /^hauteur (appareil|du produit|produit)( \(charnieres incluses\))?/, /^height/];
    const D = [/^profondeur( du produit| de l'appareil| produit| nette| net)?( \(mm\)| \(cm\))?$/, /^profondeur (appareil|du produit|produit)( \(hors poignees\))?/, /^depth/];
    const res = which === 'w' ? W : which === 'h' ? H : D;
    const not = /emball|colis|caisse|brut|niche|encastrement|compartiment|support|pied|porte ouverte|hors porte|sans porte|sans poignee|lorsque/;
    const x = o.triFirst ? null : c.find(o.only || res, { not: o.not || not, group: o.group });
    if (x) {
      const n = numOf(x.value);
      if (n != null) {
        x.used = true;
        return withUnit(toMm(n, x), 'mm');
      }
    }
    // a triple "L x H x P"
    const tri = c.find(o.tri || [/^dimensions? (de l'appareil|du produit|nette?s?|produit|net)( \(.*\))?$/, /^dimensions?( \(.*\))?$/, /^dimension nette/, /^taille sans (support|pied)/], {
      not: o.triNot || /emball|colis|caisse|brut|niche|encastrement|exterieur|outdoor/,
      group: o.group,
    });
    if (tri) {
      const ns = numsOf(tri.value);
      if (ns.length >= 3) {
        const order = tripleOrder(tri, c);
        const i = order.indexOf(which);
        if (i !== -1) {
          tri.used = true;
          return withUnit(toMm(ns[i], tri), 'mm');
        }
      }
    }
    if (o.triFirst) return dim(c, which, Object.assign({}, o, { triFirst: false }));
    return '';
  }
  function toMm(n, x) {
    const k = key(x.label + ' ' + x.value);
    if (/\bcm\b|\(cm\)/.test(k) && !/mm/.test(k)) return Math.round(n * 10);
    if (/\bm\b/.test(key(x.value)) && n < 5) return Math.round(n * 1000);
    return n;
  }
  // which number is width / height / depth in "a x b x c"
  function tripleOrder(x, c) {
    const k = key(x.label + ' ' + x.value).replace(/\s+/g, '');
    if (/hxlxp|hxwxd|\(h\)x/.test(k)) return ['h', 'w', 'd'];
    if (/lxhxp|wxhxd|lxlxp|lxhxd/.test(k)) return ['w', 'h', 'd'];
    if (/lxpxh|wxdxh/.test(k)) return ['w', 'd', 'h'];
    if (/bosch|siemens/.test(c.bk)) return ['h', 'w', 'd']; // bosch: "Dimensions du produit" = H x L x P
    if (/haier|candy|hoover/.test(c.bk) && c.type === 'hob') return ['w', 'd', 'h'];
    return ['w', 'h', 'd'];
  }
  function weight(c, opts) {
    const o = opts || {};
    const x = c.find(o.only || [/^poids( net| du produit| de l'appareil| net de l'appareil| produit)?( \(kg\))?$/, /^poids net( \(kg\))?$/, /^poids \(kg\)$/, /^poids de l'appareil sans (pied|support)/, /^weight/], {
      not: o.not || /emball|colis|caisse|brut|package|gross|exterieur|outdoor/,
      group: o.group,
    });
    if (!x) return '';
    const n = numOf(x.value);
    if (n == null) return '';
    x.used = true;
    return withUnit(n, 'kg');
  }
  // "A+++", "A++", "A", "F" (the letter + its plus signs)
  const classOf = (v) => {
    const m = String(v || '').match(/(?:^|[^A-Za-z0-9])([A-G])(\+{0,3})(?![A-Za-z0-9+])/);
    return m ? m[1] + m[2] : '';
  };
  const color = (c) => {
    const v = c.val([/^couleur( du produit| principale| de l'appareil| du materiau principal)?$/, /^couleur$/, /^color/, /^finition( \(porte\))?$/, /^couleur de la face avant$/, /^colou?r ?\(body\)/, /^aspect/]);
    return v ? T.colorFr(v) : '';
  };
  const energyClass = (c, extra) => {
    const v = c.val([/^classe (d'efficacite )?energetique( \(sdr\))?$/, /^classe d'efficacite energetique.*(nouveau|new|2010|2017|2019)?/, /energy (efficiency )?class/, /^classe energie/].concat(extra || []), { not: /plage|hdr|chauffage|heating|essorage|sonore|bruit/ });
    return classOf(v);
  };
  const noise = (c, re) => {
    const x = c.find(re || [/^niveau sonore( \(db.*\))?$/, /^niveau sonore/, /^bruit/, /^noise/], { not: /classe|essorage|lavage|exterieur|outdoor|emission/ });
    if (!x) return '';
    const n = numOf(x.value);
    if (n == null) return '';
    x.used = true;
    return withUnit(n, 'dB');
  };
  // "1 / 220~240 / 50", "220-240 V, 50/60 Hz", "CA 100 à 240 V, 50/60 Hz", "220 ~ 240, 50"
  function voltage(c) {
    const x = c.find([/^tension( d'entree)?( nominale)?( ac)?( \(v.*\))?$/, /^tension/, /source d'alimentation/, /alimentation (electrique)?$/, /^informations electriques/, /^voltage/, /power supply/, /^tension d'entree nominale/]);
    if (!x) return '';
    const v = tidy(x.value);
    const m = v.match(/(\d{2,3})\s*(?:[-~à]|a)\s*(\d{2,3})(?=\s*(?:v|\/|,|$|\s))/i) || v.match(/(\d{3})\s*v/i);
    x.used = true;
    if (m && m[2]) return m[1] + ' - ' + m[2] + ' V';
    if (m) return m[1] + ' V';
    const n = numsOf(v).filter((k) => k >= 100 && k <= 400);
    return n.length >= 2 ? n[0] + ' - ' + n[1] + ' V' : n.length ? n[0] + ' V' : '';
  }
  function frequency(c) {
    const x = c.find([/frequence( d'entree)?( ac)?/, /source d'alimentation/, /^tension( d'entree)? nominale \(v, ?hz\)/, /alimentation/, /^informations electriques/, /\bhz\b/, /power supply/]);
    if (!x) return '';
    const v = tidy(x.value);
    let m = v.match(/(50\s*\/\s*60|60\s*\/\s*50)\s*hz/i) || v.match(/(50|60)\s*hz/i);
    if (!m && /hz/.test(key(x.label))) m = v.match(/\b(50|60)\b/);
    if (!m && /\(.*v.*hz.*\)|φ\/v\/hz|v\/hz/.test(key(x.label))) {
      const ns = numsOf(v);
      if (ns.length && (ns[ns.length - 1] === 50 || ns[ns.length - 1] === 60)) m = [0, String(ns[ns.length - 1])];
    }
    return m ? m[1].replace(/\s+/g, '') + ' Hz' : '';
  }
  const program = (re) => re;
  const join = (arr) => arr.filter(Boolean).join(', ');

  // ================================================================ AIR CONDITIONER (from the Electroplanet sheet you sent)
  function acBtu(c, heating) {
    const word = heating ? /(chauffage|heating|chaud)/ : /(refroidissement|cooling|froid|rafraichissement)/;
    const other = heating ? /(refroidissement|cooling|froid)/ : /(chauffage|heating)/;
    // 1) a line in BTU
    for (const x of c.rows) {
      if (x.empty || !/btu/.test(x.k + ' ' + key(x.value))) continue;
      if (/min|max/.test(x.k) && !/nominal/.test(x.k)) continue;
      if (heating ? !word.test(x.k) : other.test(x.k) && !word.test(x.k)) continue;
      const n = numOf(x.value);
      if (n && n >= 5000 && n <= 60000) {
        x.used = true;
        return Math.round(n);
      }
    }
    if (heating) return null;
    // 2) the name: "24000 BTU", "12000BTU", "18K BTU"
    let m = (c.name + ' ' + c.pk).match(/(\d{1,2}[ .]?000)\s*btu/i) || (c.name + ' ' + c.pk).match(/\b(\d{1,2})\s?k\s*btu/i);
    if (m) {
      const n = parseInt(m[1].replace(/[ .]/g, ''), 10);
      return n < 100 ? n * 1000 : n;
    }
    // 3) the nominal cooling power in W / kW -> the usual class (2.6 kW = 9000 BTU/h ...)
    const kw = acWatts(c, false);
    if (kw) {
      const k = kw / 1000;
      if (k >= 1.8 && k < 3.1) return 9000;
      if (k >= 3.1 && k < 4.4) return 12000;
      if (k >= 4.4 && k < 6.0) return 18000;
      if (k >= 6.0 && k < 8.0) return 24000;
    }
    return null;
  }
  // nominal power in watts: "Capacité (refroidissement, kW) = 3.50 kW", "Capacité de refroidissement nominale/min (W) = 6 450 / 1 026"
  function acWatts(c, heating) {
    const word = heating ? /(chauffage|heating)/ : /(refroidissement|cooling|rafraichissement)/;
    let best = null;
    for (const x of c.rows) {
      if (x.empty || !/(capacite|puissance|capacity)/.test(x.k) || !word.test(x.k)) continue;
      if (/consommation|absorbee|input|courant|sonore|btu/.test(x.k + ' ' + key(x.value))) continue;
      const kwUnit = /\bkw\b/.test(x.k + ' ' + key(x.value));
      const wUnit = /\(w\)|\bw\b|watt/.test(x.k + ' ' + key(x.value));
      if (!kwUnit && !wUnit) continue;
      const isMax = /max/.test(x.k) && !/nominal/.test(x.k);
      if (/min - max|min-max|min\/max/.test(x.k)) continue;
      let n = numOf(x.value);
      if (n == null) continue;
      if (kwUnit && n < 50) n = n * 1000;
      const pick = { n, nominal: /nominal/.test(x.k) || (!isMax && !/min/.test(x.k)), x };
      if (!best || (pick.nominal && !best.nominal)) best = pick;
    }
    if (best) best.x.used = true;
    return best ? Math.round(best.n) : null;
  }
  const acHeats = (c) =>
    c.yes([/^(alimentation )?chauffage$/, /^mode chauffage/, /heating/, /pompe a chaleur/, /^reversible/]) === true ||
    /\bh\/p\b|heat ?pump|pompe a chaleur/.test(key(c.val([/^hvac type/, /^type (de )?(hvac|cvc)/]))) ||
    c.rows.some((x) => !x.empty && /(capacite|capacity|cop)/.test(x.k) && /(chauffage|heating)/.test(x.k)) ||
    c.inName(/chauffage|reversible|chaud ?\/ ?froid|heat|froid et chaud/);
  const acSplitKind = (c) => {
    const all = c.textAll;
    if (/multi[- ]?split/.test(all)) return 'multi';
    if (/mono[- ]?split|monosplit|single (wall|split)|sinlge wall|mono bloc split/.test(all)) return 'mono';
    if (/mobile|monobloc|portable|fenetre|window/.test(c.nk + ' ' + c.pk)) return '';
    if (/mural|wall[- ]?mount|montage mural|split/.test(all)) return 'mono';
    return '';
  };

  S.register({
    id: 'ac',
    label: 'Climatiseur',
    icon: '❄',
    detect: [/climati[sz]|air ?condition|\bclims?\b|\bbtu\b|windfree|wind-free|split (mural|system|inverter)|\bac\b mural/],
    detectSpecs: [/refroidissement|cooling|btu|deshumidification/],
    groups: [
      {
        title: 'Caractéristiques',
        fields: [
          {
            l: 'Type',
            get: (c) => {
              const t = key(c.name + ' ' + c.pk + ' ' + c.val([/^type de produit$/, /^type$/, /^product type$/]));
              if (/mobile|monobloc|portable/.test(t)) return 'Climatiseur mobile';
              if (/fenetre|window/.test(t)) return 'Climatiseur de fenêtre';
              if (/cassette/.test(t)) return 'Climatiseur cassette';
              if (/gainable|ducted|conduit/.test(t)) return 'Climatiseur gainable';
              if (/armoire|colonne|floor standing|sur pied/.test(t)) return 'Climatiseur armoire';
              if (/console/.test(t)) return 'Climatiseur console';
              return 'Climatiseur à système split';
            },
          },
          { l: 'Minuteur', yes: [/minut/, /timer/, /reservation/, /programmat/, /marche\/arret/, /on\/off/, /arret differe|depart differe|mise en veille programm/, /^sleep timer/] },
          {
            l: 'Support smartphone à distance',
            get: (c) => (c.yes([/smartthings/, /thinq/, /application|appli\b|\bapp\b|smartphone|smart ?life|hon\b|ac freedom|tcl home/, /wi-?fi/, /controle a distance/]) === true ? 'Oui' : ''),
          },
          { l: 'Télécommandé', yes: [/^telecommande( \(.*\))?$/, /^telecommande (sans fil|infrarouge|ir|lcd)/, /^remote control/, /^telecommande incluse|^telecommande fournie/], opts: { not: /filaire|wired|cable/ } },
          { l: 'Filtre à air', yes: [/filtre|filter/], opts: { not: /indicateur|alarm|nettoyage du filtre|filter alarm/ } },
          { l: 'Technologie de convertisseur', get: (c) => (c.has(/inverter|onduleur/) ? 'Oui' : yesNo(c.yes([/convertisseur|inverter/]))) },
          {
            l: "Fonctions de conditionnement d'air",
            get: (c) => {
              const f = ['Refroidissement'];
              if (acHeats(c)) f.push('Chauffage');
              if (c.yes([/deshumidif/, /dehumid/, /^dry\b/, /mode sec/]) === true) f.push('Déshumidification');
              if (c.yes([/ventilat/, /fan mode/, /mode ventilateur/, /vitesse du ventilateur/, /fan speed/]) === true) f.push('Ventilation');
              return f.join(', ');
            },
          },
          { l: 'Capacité de rafraîchissement (nominale)', get: (c) => withUnit(acBtu(c, false), 'BTU/h') },
          { l: 'Capacité de chauffage (nominale)', get: (c) => (acHeats(c) ? withUnit(acBtu(c, true), 'BTU/h') : '') },
          { l: 'Type de pompe à chaleur', get: (c) => (acHeats(c) ? 'Reversible' : '') },
          { l: 'Commandes vocales', yes: [/vocal|voice|alexa|google assistant|bixby/] },
          {
            l: 'Réglage du déflecteur de vent',
            get: (c) => {
              const dir = /(direction|deflect|volet|swing|oscill|balayage|ailette|flux d'air|debit d'air|air flow|airflow)/;
              const up = c.rows.some((x) => !x.empty && dir.test(x.k) && /(haut.{0,4}bas|up.{0,4}down|vertical)/.test(x.k) && T.yesOf(x.value) && (x.used = true));
              const lr = c.rows.some((x) => !x.empty && dir.test(x.k) && /(gauche.{0,4}droite|left.{0,4}right|horizontal)/.test(x.k) && T.yesOf(x.value) && (x.used = true));
              if (up && lr) return 'Horizontal/Vertical';
              if (up) return 'Vertical';
              if (lr) return 'Horizontal';
              return '';
            },
          },
          { l: 'Type de système à double flux', get: (c) => ({ multi: 'Multi split', mono: 'Mono split' })[acSplitKind(c)] || '' },
          { l: 'Multi split', get: (c) => ({ multi: 'Oui', mono: 'Non' })[acSplitKind(c)] || '' },
          { l: 'Capacité de refroidissement en watts (nominale)', get: (c) => withUnit(acWatts(c, false), 'W') },
          { l: 'Capacité de chauffage en watts (nominale)', get: (c) => (acHeats(c) ? withUnit(acWatts(c, true), 'W') : '') },
          { l: 'Efficacité énergétique (EER)', num: [/^eer( \(refroidissement, w\/w\))?$/, /^eer\b/, /coefficient d'efficacite frigorifique/], opts: { not: /btu/ }, dec: 2 },
          { l: 'Efficacité énergétique (SEER)', num: [/^seer\b/], dec: 2 },
          { l: 'Coefficient de performance (COP)', num: [/^cop( \(chauffage, w\/w\))?$/, /^cop\b/, /^scop\b/], opts: { not: /btu/ }, dec: 2 },
          {
            l: "Classe d'efficacité énergétique (refroidissement)",
            get: (c) => {
              const v = c.val([/energy efficiency class/, /classe (d'efficacite )?energetique( \(refroidissement\)| refroidissement)?$/, /classe energetique/], { not: /chauffage/ });
              const m = String(v).match(/c\s*:\s*(A\+{0,3}|[B-G])/i);
              return m ? m[1].toUpperCase() : classOf(v);
            },
          },
          {
            l: "Classe d'efficacité énergétique (chauffage)",
            get: (c) => {
              const x = c.find([/energy efficiency class/, /classe (d'efficacite )?energetique.*chauffage/]);
              if (!x) return '';
              const m = String(x.value).match(/h\s*:\s*(A\+{0,3}|[B-G])/i);
              if (m) return m[1].toUpperCase();
              return /chauffage/.test(x.k) ? classOf(x.value) : '';
            },
          },
          {
            l: 'Niveau sonore (unité intérieure)',
            get: (c) => {
              const x = c.find([/niveau sonore.*int/, /pression sonore.*int/, /^niveau sonore/, /^puissance sonore \(refroidissement\)/, /noise level.*indoor/], { not: /exterieur|outdoor|ext\)/ });
              if (!x) return '';
              x.used = true;
              return withUnit(numOf(x.value), 'dB');
            },
          },
          { l: 'Gaz réfrigérant', get: (c) => ((c.val([/refrigerant|frigorigene|^gaz|refrigeration moyenne|type de gaz/], { not: /charge|tco2|poids|quantite/ }).match(/R\s?-?\d{2,4}[A-Z]?/i) || [''])[0].replace(/\s|-/g, '').toUpperCase()) },
          { l: 'Approprié pour une salle jusqu’à', num: [/surface (recommandee|conseillee|de la piece|couverte)/, /approprie pour une salle/, /room size/, /superficie/], unit: 'm²' },
          { l: 'Nettoyage automatique', yes: [/nettoyage automatique|auto[- ]?nettoyage|auto clean|self clean|freeze wash/] },
          { l: 'Redémarrage automatique', yes: [/redemarrage auto|auto restart|auto-restart/] },
          { l: 'Couleur du produit', get: color },
        ],
      },
      {
        title: 'Puissance',
        fields: [
          { l: "Tension d'entrée AC", get: voltage },
          { l: "Fréquence d'entrée AC", get: frequency },
          {
            l: 'Consommation électrique (refroidissement)',
            get: (c) => {
              const x = c.find([/consommation d'energie ?\(refroidissement/, /consommation (electrique|d'energie) (de )?refroidissement/, /puissance absorbee.*(froid|refroid)/, /power input.*cool/]);
              if (!x) return '';
              x.used = true;
              return withUnit(numOf(x.value), 'W');
            },
          },
        ],
      },
      {
        title: 'Poids Et Dimensions',
        fields: [
          {
            l: "Dimensions de l'unité intérieure (L x H x P)",
            get: (c) => {
              const x = c.find([/dimension (nette )?(de l'unite )?interieure/, /dimension nette \(interieure/, /unite interieure.*(dimension|l ?x ?h)/, /indoor.*dimension/], { not: /brut|emball/ });
              if (!x) return '';
              const n = numsOf(x.value);
              if (n.length < 3) return '';
              x.used = true;
              return n[0] + ' x ' + n[1] + ' x ' + n[2] + ' mm';
            },
          },
          { l: "Poids de l'unité intérieure", num: [/poids (net )?(de l'unite )?interieure/, /poids net \(interieur/, /indoor.*weight/], opts: { not: /brut|emball/ }, unit: 'kg' },
          {
            l: "Dimensions de l'unité extérieure (L x H x P)",
            get: (c) => {
              const x = c.find([/dimension (nette )?(de l'unite )?exterieure/, /dimension nette \(exterieure/, /unite exterieure.*(dimension|l ?x ?h)/, /outdoor.*dimension/], { not: /brut|emball/ });
              if (!x) return '';
              const n = numsOf(x.value);
              if (n.length < 3) return '';
              x.used = true;
              return n[0] + ' x ' + n[1] + ' x ' + n[2] + ' mm';
            },
          },
          { l: "Poids de l'unité extérieure", num: [/poids (net )?(de l'unite )?exterieure/, /poids net \(exterieur/, /outdoor.*weight/], opts: { not: /brut|emball/ }, unit: 'kg' },
        ],
      },
      {
        title: "Contenu De L'emballage",
        fields: [{ l: 'Télécommande incluse', yes: [/^telecommande( \(.*\))?$/, /^telecommande (incluse|fournie|sans fil|infrarouge)/, /^remote control/], opts: { not: /filaire|wired/ } }],
      },
      {
        title: 'Réseau',
        fields: [
          { l: 'Wifi', get: (c) => (c.yes([/wi-?fi/, /thinq/, /wlan/, /smartthings/]) === true || c.inName(/wi-?fi/) ? 'Oui' : yesNo(c.yes([/wi-?fi/]))) },
          { l: 'Compatible wi-fi', get: (c) => (c.yes([/wi-?fi/, /thinq/, /wlan/, /smartthings/]) === true || c.inName(/wi-?fi/) ? 'Oui' : '') },
        ],
      },
    ],
  });

  // ================================================================ shared helpers for the next types
  const placement = (c, builtInDefault) => {
    const t = c.nk + ' ' + c.pk + ' ' + key(c.val([/^placement de l'appareil$/, /^encastrable \/ pose[- ]libre$/, /^type d'installation$/, /^pose \/ installation$/, /^installation$/]));
    if (/pose[- ]?libre|freestanding|free standing|autonome|posable|pose-libre/.test(t)) return 'Pose libre';
    if (/encastr|integr|built[- ]?in|sous plan/.test(t)) return 'Intégré';
    return builtInDefault ? 'Intégré' : '';
  };
  const wifi = (c) => {
    const y = c.yes([/wi-?fi/, /wlan/, /thinq/, /smartthings/, /home ?connect/, /^connectivite$/, /simply-?fi/, /\bhon\b/], { not: /bluetooth/ });
    if (y === true) return 'Oui';
    if (c.inName(/wi-?fi|thinq|smartthings|home connect/)) return 'Oui';
    return yesNo(y);
  };
  const appName = (c) => {
    const t = c.textAll;
    const out = [];
    if (/smartthings/.test(t)) out.push('SmartThings');
    if (/thinq/.test(t)) out.push('LG ThinQ');
    if (/home ?connect/.test(t) && c.yes([/home ?connect/]) === true) out.push('Home Connect');
    if (/\bhon\b/.test(t) && !/application disponible (→ )?non/.test(t)) {
      const v = c.val([/^application disponible$/]);
      if (/hon/i.test(v)) out.push('hOn');
    }
    if (/simply-?fi/.test(t)) out.push('Simply-Fi');
    return join(out);
  };
  const capacityL = (c, res, opts) => {
    const x = c.find(res, opts);
    if (!x) return '';
    const n = numOf(x.value);
    if (n == null) return '';
    x.used = true;
    return withUnit(n, 'L');
  };
  const listOf = (c, re, opts) => {
    // a list written in one line ("Coton, Laine, Mix") or many "Oui" lines (Samsung: "Coton = Oui", "Laine = Oui")
    const x = c.find(re, opts);
    if (x) {
      x.used = true;
      return tidy(x.value);
    }
    return '';
  };

  // ================================================================ FRIDGE
  const fridgeKind = (c) => {
    const t = c.nk + ' ' + c.pk + ' ' + key(c.val([/^refrigerator type$/, /^type de produit$/, /^type de refrigerateur$/, /^type$/]));
    if (/side by side|side-by-side|\bsbs\b|americain/.test(t)) return 'side';
    if (/multi[- ]?portes?|4 portes|quatro|french door|\bfdr\b|multi door|cross door/.test(t)) return 'multi';
    if (/combine|congelateur en bas|bottom|\bbmf\b|^b \/|\bb \/ congelateur|refrigerateur congelateur|refrigerateurs-congelateurs/.test(t)) return 'bottom';
    if (/congelateur en haut|top|\btmf\b|^t \/|double porte|2 portes|deux portes/.test(t)) return 'top';
    if (/1 porte|une porte|table top|top ?table|mini ?bar|single door/.test(t)) return 'one';
    return '';
  };
  S.register({
    id: 'fridge',
    label: 'Réfrigérateur',
    icon: '🧊',
    detect: [/refrig|frigo|fridge|combine[s]? |side by side|side-by-side|americain|multi[- ]?portes|congelateur en (haut|bas)|\bno ?frost\b.*\d+ ?l\b/],
    detectSpecs: [/congelateur|refrigerateur|freezer|bac a legumes|clayette/],
    notIf: [/lave|four\b|micro|climati|cave a vin/],
    groups: [
      {
        title: 'Caractéristiques',
        fields: [
          {
            l: 'Type',
            get: (c) =>
              ({ side: 'Réfrigérateur américain (side by side)', multi: 'Réfrigérateur multi-portes', bottom: 'Réfrigérateur combiné (congélateur en bas)', top: 'Réfrigérateur double porte (congélateur en haut)', one: 'Réfrigérateur une porte' })[fridgeKind(c)] || '',
          },
          { l: "Placement de l'appareil", get: (c) => placement(c, false) || 'Pose libre' },
          { l: 'Capacité nette totale', get: (c) => capacityL(c, [/^capacite nette totale/, /^nette totale/, /^volume net total/, /^total du volume$/, /^capacite totale nette/, /^volume total net/, /^capacite utile totale/, /^capacite nette$/, /^volume net$/, /^capacite totale$/, /^volume total$/], { not: /brut/ }) },
          { l: 'Capacité nette du réfrigérateur', get: (c) => capacityL(c, [/^capacite nette (du )?refrigerateur/, /^net refrigerateur/, /^volume (net )?du refrigerateur$/, /^volume net (du )?refrigerateur/, /^capacite (utile )?(du )?refrigerateur$/, /^volume refrigerateur/], { not: /brut/ }) },
          { l: 'Capacité nette du congélateur', get: (c) => capacityL(c, [/^capacite net(te)? (du )?congelateur/, /^net congelateur/, /^volume (net )?du congelateur$/, /^volume net (du )?congelateur/, /^capacite (utile )?(du )?congelateur$/, /^volume congelateur/], { not: /brut|congelation \(/ }) },
          { l: 'Capacité brute totale', get: (c) => capacityL(c, [/^capacite brute totale/, /^brut total/, /^volume brut total/, /^capacite totale brute/]) },
          {
            l: 'No Frost',
            get: (c) => {
              if (c.yes([/no ?frost/, /froid ventile/, /total no frost/, /multi[- ]?air ?flow/, /^degivrage automatique$/]) === true) return 'Oui';
              if (/(^|\W)(total )?no ?frost(\W|$)|\bnf\b|nofrost|froid ventile/.test(c.nk + ' ' + c.pk)) return 'Oui';
              const sys = key(c.val([/^systeme de froid$/, /^type de (froid|refroidissement|degivrage)$/, /^systeme de degivrage$/]));
              if (/no ?frost|ventile/.test(sys)) return 'Oui';
              if (/statique|manuel/.test(sys)) return 'Non';
              return '';
            },
          },
          { l: 'Technologie de convertisseur', get: (c) => (c.has(/inverter/) ? 'Oui' : '') },
          { l: 'Classe climatique', text: [/^classe climatique/, /^climate class/] },
          { l: 'Niveau sonore', get: (c) => noise(c) },
          { l: 'Gaz réfrigérant', get: (c) => ((c.val([/refrigerant|frigorigene|^gaz|refrigeration moyenne/], { not: /charge|quantite|poids/ }).match(/R\s?-?\d{2,4}[A-Z]?/i) || [''])[0].replace(/\s|-/g, '').toUpperCase()) },
          { l: 'Capacité de congélation', num: [/capacite de congelation/, /pouvoir de congelation/, /freezing capacity/], unit: 'kg/24h' },
          { l: "Nombre d'étoiles", get: (c) => { const v = c.val([/nombre d'etoiles/, /etoiles/, /star rating/]); const n = numOf(v); return n ? n + '*' : ''; } },
          { l: 'Fonction congélation rapide', yes: [/power freeze/, /super ?freez/, /congelation rapide/, /fast freez/, /super congelation/, /quick freeze/, /express freez/] },
          { l: 'Fonction de refroidissement rapide', yes: [/power cool/, /super ?cool/, /refroidissement rapide/, /fast cool/, /express cool/, /quick cool/] },
          { l: 'Machine à glaçons', yes: [/machine a glacons?/, /ice ?maker/, /glacons? automatique/], opts: { not: /bac/ } },
          { l: "Distributeur d'eau", yes: [/distributeur d'eau/, /water dispenser/, /^distributeur$/] },
          { l: 'Bac à glaçons', get: (c) => { const y = c.yes([/bac a glacons/, /^nombre de bacs a glacons/, /ice tray/]); return yesNo(y); } },
          { l: 'Nombre de clayettes (réfrigérateur)', get: (c) => { const n = c.num([/nombre de clayettes( dans le refrigerateur| du refrigerateur)?$/, /^nombre de clayettes$/, /clayettes\/bacs du refrigerateur/, /etagere_verre trempe/, /nombre d'etageres/], { group: /^(?!.*congel).*$/ }); return n ? String(n) : ''; } },
          { l: 'Nombre de tiroirs à légumes', get: (c) => { const x = c.find([/tiroirs? (a |fruits (et|&) )?legumes/, /bac a legumes$/, /^bac a legumes/, /^nombre de bacs a legumes/]); if (!x) return ''; const n = numOf(x.value); x.used = true; return n ? String(n) : T.yesOf(x.value) ? '1' : ''; } },
          { l: 'Balconnets de porte (réfrigérateur)', get: (c) => { const n = c.num([/logement de porte/, /compartiments de la porte/, /balconnets?/, /^nombre de porte -refrigerateur/, /door (bins|shelves)/]); return n ? String(n) : ''; } },
          { l: 'Compartiment à œufs', yes: [/oeufs|œufs/] },
          { l: 'Éclairage intérieur', get: (c) => { const v = c.val([/eclairage|lumiere (interieure|refrigerateur)|lampe|light/], { not: /congelateur et|^eclairage led refrigerateur et congelateur/ }); if (!v) return ''; return /led/i.test(v) ? 'LED' : T.yesOf(v) ? 'Oui' : ''; } },
          { l: 'Nombre de tiroirs (congélateur)', get: (c) => { const n = c.num([/nombre de tiroirs de congelation/, /tiroirs? (du )?congelateur/, /clayettes\/bacs du congelateur/, /^nombre de bacs$/], { group: /congel|freez|^$/ }); return n ? String(n) : ''; } },
          { l: 'Portes réversibles', get: (c) => { const v = c.val([/portes? reversibles?/, /charnieres de porte/, /reversible door/]); if (!v) return ''; const k = key(v); return /reversib|oui|yes/.test(k) ? 'Oui' : /^(non|no)\b/.test(k) ? 'Non' : ''; } },
          { l: 'Alarme porte ouverte', get: (c) => (c.yes([/alarme.*porte|porte ouverte|door alarm/]) === true || /porte ouverte/.test(key(c.val([/liste des avertissements/]))) ? 'Oui' : '') },
          { l: 'Autonomie en cas de coupure de courant', num: [/autonomie|conservation en cas de panne|coupure de courant/], unit: 'h' },
        ],
      },
      {
        title: 'Design',
        fields: [
          { l: 'Couleur du produit', get: color },
          { l: 'Type de poignée', text: [/type de poignee/, /type d'ouverture de porte/] },
          { l: 'Écran intégré', get: (c) => { const v = c.val([/^affichage$/, /type d'affichage/, /ecran/, /^display/]); if (!v) return ''; return /non|aucun|none|no\b/i.test(v) ? 'Non' : 'Oui'; } },
        ],
      },
      {
        title: 'Gestion Énergétique',
        fields: [
          { l: "Classe d'efficacité énergétique", get: (c) => energyClass(c) },
          { l: "Consommation annuelle d'énergie", num: [/consommation (annuelle )?d'energie/, /consommation annuelle/, /consommation energetique/, /energy consumption/], opts: { not: /veille|arret|mode/ }, unit: 'kWh' },
        ],
      },
      {
        title: 'Poids Et Dimensions',
        fields: [
          { l: 'Largeur', get: (c) => dim(c, 'w') },
          { l: 'Profondeur', get: (c) => dim(c, 'd') },
          { l: 'Hauteur', get: (c) => dim(c, 'h') },
          { l: 'Poids', get: (c) => weight(c) },
        ],
      },
      {
        title: 'Réseau',
        fields: [
          { l: 'Wifi', get: wifi },
          { l: 'Application', get: appName },
        ],
      },
    ],
  });

  // ================================================================ WASHING MACHINE
  const washKg = (c) => {
    const x = c.find([/capacite de (lavage|chargement)/, /^capacite nominale/, /^capacite \(kg\)$/, /^capacite de linge/, /washing capacity/, /^capacite$/], { not: /sechage|drying|tambour/ });
    if (x) {
      const n = numOf(x.value);
      if (n && n < 30) {
        x.used = true;
        return withUnit(n, 'kg');
      }
    }
    const m = (c.name + ' ' + c.pk).match(/(\d{1,2}(?:[.,]5)?)\s*kg/i);
    return m ? withUnit(parseFloat(m[1].replace(',', '.')), 'kg') : '';
  };
  const WASH_PROGRAMS = [
    [/^coton/, 'Coton'], [/^e ?cotton|eco ?40|eco 40-60/, 'Eco 40-60'], [/^synthetique/, 'Synthétique'], [/^laine/, 'Laine'], [/^(linge )?delicat|soie/, 'Délicat'],
    [/^mix|^mixte/, 'Mix'], [/^rapide|^quick|lavage rapide|15 ?min|cycle lavage rapide/, 'Rapide'], [/^literie|couette|duvet/, 'Literie'], [/^chemises?/, 'Chemises'],
    [/^jeans?/, 'Jeans'], [/^sport/, 'Sport'], [/^bebe|baby/, 'Bébé'], [/assainissant vapeur|^vapeur|steam/, 'Vapeur'], [/^rincage/, 'Rinçage + Essorage'], [/^drain|vidange|^essorage/, 'Essorage'],
    [/^intensif/, 'Intensif'], [/lavage quotidien|^quotidien|daily/, 'Quotidien'], [/^colou?rs|^couleurs/, 'Couleurs'], [/^prelavage/, 'Prélavage'], [/drum clean|nettoyage (du )?tambour/, 'Nettoyage du tambour'],
  ];
  S.register({
    id: 'washer',
    label: 'Lave-linge',
    icon: '🫧',
    detect: [/lave[- ]?linge|machines? a laver|lavante|washing|washer|washtower|lave linge sechant/],
    detectSpecs: [/essorage|tambour|programmes de lavage/],
    notIf: [/lave[- ]?vaisselle|dishwasher/],
    groups: [
      {
        title: 'Caractéristiques',
        fields: [
          {
            l: 'Type de chargement',
            get: (c) => {
              const v = key(c.val([/type de chargement/, /^chargement$/, /loading type/]) + ' ' + c.nk + ' ' + c.pk);
              if (/frontal|front|hublot|avant/.test(v)) return 'Chargement frontal';
              if (/top|dessus|haut/.test(v)) return 'Chargement par le dessus';
              return '';
            },
          },
          { l: "Placement de l'appareil", get: (c) => placement(c, false) },
          { l: 'Capacité de lavage', get: washKg },
          {
            l: 'Capacité de séchage',
            get: (c) => {
              const x = c.find([/capacite de sechage/, /drying capacity/, /^sechage \(kg\)/]);
              if (x) {
                x.used = true;
                return withUnit(numOf(x.value), 'kg');
              }
              const m = (c.name + ' ' + c.pk).match(/\d{1,2}\s*(?:kg)?\s*\/\s*(\d{1,2})\s*kg/i) || (c.name).match(/s[ée]che-linge de (\d{1,2}) ?kg/i);
              return m ? withUnit(parseFloat(m[1]), 'kg') : '';
            },
          },
          {
            l: "Vitesse d'essorage maximale",
            get: (c) => {
              const x = c.find([/vitesse (maximale |maximum |max )?d'essorage/, /vitesse (de rotation|maximale de rotation|d'essorage max)/, /^essorage/, /spin speed/, /^vitesse d'essorage/], { not: /minim|classe/ });
              if (x) {
                const n = numOf(x.value);
                if (n && n >= 400) {
                  x.used = true;
                  return n + ' tr/min';
                }
              }
              const m = (c.name + ' ' + c.pk).match(/(1[0-6]00|[89]00)\s*(?:tr|t\/min|rpm|trs)/i);
              return m ? m[1] + ' tr/min' : '';
            },
          },
          { l: 'Nombre de programmes', get: (c) => { const n = c.num([/nombre de programmes/, /programmes? de lavage \(nombre\)/, /number of programs/]); return n ? String(n) : ''; } },
          {
            l: 'Programmes de lavage',
            get: (c) => {
              const one = listOf(c, [/^programmes de lavage$/, /^programmes$/, /^liste des programmes/]);
              if (one && /,/.test(one)) return one;
              const out = [];
              c.rows.forEach((x) => {
                if (x.empty || T.yesOf(x.value) !== true || !/^(oui|yes)/i.test(x.value)) return;
                for (const [re, nm] of WASH_PROGRAMS) {
                  if (re.test(x.k)) {
                    if (out.indexOf(nm) === -1) out.push(nm);
                    x.used = true;
                    break;
                  }
                }
              });
              return out.length >= 3 ? out.join(', ') : '';
            },
          },
          {
            l: 'Type de moteur',
            get: (c) => {
              const v = c.val([/^moteur$/, /type de moteur/, /^motor/]);
              const t = key(v + ' ' + c.nk);
              if (/direct ?drive|\bdd\b|direct motion/.test(t)) return 'Direct Drive (Inverter)';
              if (/dit|digital inverter|inverter|brushless|bldc/.test(t)) return 'Inverter';
              return v ? cap(v) : '';
            },
          },
          { l: 'Technologie de convertisseur', get: (c) => (c.has(/inverter|direct ?drive|\bai dd\b|\bdit\b|direct motion|brushless/) ? 'Oui' : '') },
          { l: 'Fonction vapeur', yes: [/vapeur|steam/], opts: { not: /assainissant vapeur/ } },
          { l: 'Départ différé', yes: [/depart differe|fin differee|arret differe|delay|minuterie, depart differe|option de fin differee/] },
          { l: 'Sécurité enfant', yes: [/securite enfant|verrouillage (d'|parental|enfant)|child lock/] },
          { l: 'Volume du tambour', get: (c) => capacityL(c, [/volume du tambour/, /drum volume/]) },
          { l: 'Matériau du tambour', text: [/materiau du tambour/, /drum material/], map: (v) => (/inox|stainless|acier/i.test(v) ? 'Acier inoxydable' : cap(v)) },
          { l: 'Température de lavage maximum', num: [/temperature (de lavage )?max/], unit: '°C' },
          { l: 'Niveau sonore (lavage)', num: [/niveau sonore.*lavage/, /bruit.*lavage/, /noise.*wash/], opts: { not: /essorage/ }, unit: 'dB' },
          { l: 'Niveau sonore (essorage)', num: [/niveau sonore.*essorage/, /bruit.*essorage/, /noise.*spin/], unit: 'dB' },
        ],
      },
      {
        title: 'Design',
        fields: [
          { l: 'Couleur du produit', get: color },
          { l: 'Couleur de la porte', text: [/^porte$/, /couleur (de la )?porte/], map: (v) => T.colorFr(v) },
          { l: "Type d'écran", text: [/panneau d'affichage/, /type d'ecran/, /^affichage$/, /^ecran$/], map: (v) => (/led/i.test(v) ? 'LED' : /lcd/i.test(v) ? 'LCD' : cap(v)) },
        ],
      },
      {
        title: 'Gestion Énergétique',
        fields: [
          { l: "Classe d'efficacité énergétique", get: (c) => energyClass(c) },
          { l: "Consommation d'énergie annuelle", num: [/consommation (d'energie )?annuelle/, /consommation d'energie annuelle/], opts: { not: /\b0\b/ }, unit: 'kWh' },
          { l: "Consommation d'énergie pour 100 cycles", num: [/100 cycles/], unit: 'kWh' },
          { l: "Consommation d'eau par cycle", num: [/consommation d'eau/, /water consumption/], unit: 'L' },
        ],
      },
      {
        title: 'Poids Et Dimensions',
        fields: [
          { l: 'Largeur', get: (c) => dim(c, 'w') },
          { l: 'Profondeur', get: (c) => dim(c, 'd') },
          { l: 'Hauteur', get: (c) => dim(c, 'h') },
          { l: 'Poids', get: (c) => weight(c) },
        ],
      },
      { title: 'Réseau', fields: [{ l: 'Wifi', get: wifi }, { l: 'Application', get: appName }] },
    ],
  });


  // ================================================================ TV
  function tvInches(c) {
    const x = c.find([/taille (de l'|d')?ecran/, /^diagonale/, /screen size/, /^taille$/, /surface d'ecran active/], { not: /emball/ });
    if (x) {
      let n = numOf(x.value);
      if (n && /cm/.test(key(x.value + ' ' + x.label)) && n > 80) n = Math.round(n / 2.54);
      if (n && n >= 15 && n <= 120) {
        x.used = true;
        return Math.round(n);
      }
    }
    let m = (c.name + ' ').match(/(\d{2,3})\s*(?:"|''|”|″|pouces|po\b|inch|inches|-inch)/i) || c.pk.match(/(\d{2,3})[ -]?(?:pouces|inch|inches)\b/);
    if (m) return parseInt(m[1], 10);
    // from the model code: OLED65C46LA, UA55U8000, 43P715, H55Q80FUX, QE65Q60
    const code = (c.model || '').toUpperCase();
    m = code.match(/^(?:OLED|QNED|NANO|UA|UE|QA|QE|GQ|GU|H|LED|TX-?)?(\d{2})(?=[A-Z])/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 19 && n <= 99) return n;
    }
    return null;
  }
  const tvRes = (c) => {
    const v = key(c.val([/^resolution( de l'ecran| d'affichage)?$/, /^resolution/, /definition de la dalle/, /type hd/]) + ' ' + c.nk);
    if (/7680|8k/.test(v)) return { hd: '8K Ultra HD', px: '7680 x 4320 pixels' };
    if (/3840|4k|uhd|ultra hd/.test(v)) return { hd: '4K Ultra HD', px: '3840 x 2160 pixels' };
    if (/1920|full ?hd|fhd|1080/.test(v)) return { hd: 'Full HD', px: '1920 x 1080 pixels' };
    if (/1366|1280|\bhd\b|720/.test(v)) return { hd: 'HD', px: /1280/.test(v) ? '1280 x 720 pixels' : '1366 x 768 pixels' };
    return null;
  };
  const tvTech = (c) => {
    const t = key(c.val([/technologie (de dalle|d'affichage)/, /^type de (dalle|panneau|produit|ecran)$/, /^type d'ecran/, /^technologie d'ecran/]) + ' ' + c.nk + ' ' + c.pk);
    if (/qd[- ]?oled/.test(t)) return 'QD-OLED';
    if (/\boled\b/.test(t)) return 'OLED';
    if (/neo ?qled/.test(t)) return 'Neo QLED';
    if (/mini[- ]?led|qd-mini/.test(t)) return 'Mini LED';
    if (/qned/.test(t)) return 'QNED';
    if (/nano ?cell/.test(t)) return 'NanoCell';
    if (/qled/.test(t)) return 'QLED';
    if (/\bled\b|d-led|crystal uhd|lcd/.test(t)) return 'LED';
    return '';
  };
  S.register({
    id: 'tv',
    label: 'TV',
    icon: '📺',
    detect: [/televiseur|\btv\b|\btvs\b|smart[- ]?tv|television|\boled\b|\bqled\b|\bqned\b|crystal uhd|google tv|webos|uhd 4k/],
    detectSpecs: [/hdmi|resolution|hdr|ecran/],
    notIf: [/barre de son|soundbar|moniteur|monitor|support mural|telecommande seule/],
    groups: [
      {
        title: 'Écran',
        fields: [
          { l: "Taille de l'écran", get: (c) => { const n = tvInches(c); return n ? fr(Math.round(n * 2.54 * 10) / 10) + ' cm (' + n + '")' : ''; } },
          { l: 'Type HD', get: (c) => (tvRes(c) || {}).hd || '' },
          { l: "Technologie d'affichage", get: tvTech },
          {
            l: "Résolution de l'écran",
            get: (c) => {
              const x = c.find([/^resolution( de l'ecran| d'affichage)?$/, /^resolution/]);
              const ns = x ? numsOf(x.value).filter((n) => n >= 480) : [];
              if (x && ns.length >= 2) {
                x.used = true;
                return ns[0] + ' x ' + ns[1] + ' pixels';
              }
              return (tvRes(c) || {}).px || '';
            },
          },
          {
            l: 'Taux de rafraîchissement natif',
            get: (c) => {
              const x = c.find([/taux de rafraichissement/, /frequence de rafraichissement/, /refresh rate/, /frequence d'affichage/, /^frequence( native)?$/, /motion rate|hz natif/], { not: /hdmi|high frame/ });
              if (x) {
                const n = numOf(x.value);
                if (n && n >= 30 && n <= 500) {
                  x.used = true;
                  return n + ' Hz';
                }
              }
              const m = (c.name + ' ' + c.pk).match(/(\d{2,3})\s*hz/i);
              return m ? m[1] + ' Hz' : '';
            },
          },
          {
            l: 'Technologie HDR (plage dynamique élevée)',
            get: (c) => {
              const t = c.textAll;
              const out = [];
              const add = (re, nm) => {
                if (re.test(t) && out.indexOf(nm) === -1) out.push(nm);
              };
              add(/dolby vision/, 'Dolby Vision');
              add(/hdr ?10 ?(\+|plus)/, 'HDR10+');
              add(/hdr ?10(?! ?(\+|plus))(\b|$)|hdr10 pro/, 'HDR10');
              add(/\bhlg\b|hybrid log/, 'HLG');
              c.all([/^hdr/, /dolby vision/, /^hlg/]).forEach((x) => (x.used = true));
              return out.join(', ');
            },
          },
        ],
      },
      {
        title: 'Smart TV',
        fields: [
          { l: 'Smart TV', get: (c) => (c.has(/smart ?tv|tizen|webos|google tv|android tv|vidaa|netflix/) ? 'Oui' : '') },
          {
            l: "Système d'exploitation installé",
            get: (c) => {
              const t = key(c.val([/systeme d'exploitation/, /^systeme$/, /^smart tv$/, /^os\b/, /plateforme/]) + ' ' + c.textAll);
              if (/tizen/.test(t)) return 'Tizen';
              if (/webos/.test(t)) return 'webOS';
              if (/google tv/.test(t)) return 'Google TV';
              if (/android tv|android/.test(t)) return 'Android TV';
              if (/vidaa/.test(t)) return 'VIDAA';
              if (/roku/.test(t)) return 'Roku TV';
              return '';
            },
          },
          { l: 'Commande vocale', get: (c) => (c.yes([/vocal|voice|assistant|bixby|alexa/]) === true || c.has(/commande vocale|google assistant|alexa|bixby|thinq ai/) ? 'Oui' : '') },
          { l: 'Chromecast intégré', yes: [/chromecast/] },
          { l: 'Apple AirPlay', yes: [/airplay/] },
        ],
      },
      {
        title: 'Audio',
        fields: [
          {
            l: 'Puissance de sortie audio (RMS)',
            get: (c) => {
              const x = c.find([/puissance (en )?sortie/, /puissance audio/, /puissance de sortie/, /sortie audio/, /puissance evaluee de rms/, /watts\/canal/, /puissance (totale )?(des )?haut-parleurs/, /audio output/]);
              if (!x) return '';
              const v = String(x.value).replace(/,/g, '.');
              let sum = 0;
              const re = /(\d+)\s*[*x×]\s*(\d+(?:\.\d+)?)\s*w/gi;
              let m;
              while ((m = re.exec(v))) sum += parseInt(m[1], 10) * parseFloat(m[2]);
              x.used = true;
              if (sum) return fr(sum) + ' W';
              const n = numOf(v);
              return n ? fr(n) + ' W' : '';
            },
          },
          { l: 'Canaux de sortie audio', get: (c) => { const v = c.val([/type de haut-parleur/, /canaux/, /^canal audio/, /channels?/]); const m = String(v).match(/(\d(?:\.\d){1,2})\s*(?:ch|canaux)?|(\d)\s*ch/i); return m ? (m[1] || m[2] + '.0') + ' canaux' : ''; } },
          { l: 'Dolby Atmos', get: (c) => (c.yes([/dolby atmos/]) === true || c.has(/dolby atmos/) ? 'Oui' : '') },
        ],
      },
      {
        title: 'Ports Et Interfaces',
        fields: [
          { l: 'Quantité de ports HDMI', get: (c) => { const n = c.num([/^hdmi$/, /ports? hdmi/, /entree hdmi/, /nombre (de )?(ports )?hdmi/, /^hdmi \(nombre\)/, /quantite de ports hdmi/], { not: /frame|cec|version|arc|audio return/ }); return n ? String(n) : ''; } },
          { l: 'Quantité de ports USB', get: (c) => { const n = c.num([/^usb$/, /ports? usb/, /nombre (de )?(ports )?usb/, /quantite de ports usb/]); return n ? String(n) : ''; } },
          { l: 'Canal de retour audio amélioré (eARC)', get: (c) => (c.has(/earc/) ? 'Oui' : '') },
          { l: 'Ethernet/LAN', get: (c) => { const y = c.yes([/ethernet|lan\b|rj-?45/]); return yesNo(y); } },
          { l: 'Sortie audio numérique (optique)', yes: [/optique|optical|sortie audio numerique/] },
        ],
      },
      {
        title: 'Réseau',
        fields: [
          { l: 'Wifi', get: (c) => yesNo(c.yes([/wi-?fi/, /wlan/])) || (c.inName(/wi-?fi/) ? 'Oui' : '') },
          { l: 'Bluetooth', yes: [/bluetooth/] },
        ],
      },
      {
        title: 'Design',
        fields: [
          { l: 'Couleur du produit', get: color },
          { l: 'Montage VESA', get: (c) => (c.find([/vesa/, /fixation murale/]) ? 'Oui' : '') },
          { l: 'Norme VESA', get: (c) => { const x = c.find([/vesa/, /fixation murale/]); if (!x) return ''; const n = numsOf(x.value).filter((k) => k >= 50); if (n.length < 2) return ''; x.used = true; return n[0] + ' x ' + n[1] + ' mm'; } },
        ],
      },
      {
        title: 'Gestion Énergétique',
        fields: [
          { l: "Classe d'efficacité énergétique (SDR)", get: (c) => classOf(c.val([/classe (d'efficacite )?energetique( \(sdr\)| sdr)?$/, /classe d'efficacite energetique$/, /energy class/], { not: /hdr\b|\(hdr|mode hdr|plage/ })) },
          { l: "Classe d'efficacité énergétique (HDR)", get: (c) => classOf(c.val([/classe.*hdr/])) },
          { l: 'Consommation électrique (SDR)', num: [/consommation.*sdr/, /consommation electrique typique/, /consommation en mode marche$/], unit: 'W' },
          { l: 'Consommation électrique (max)', num: [/consommation electrique \(max/, /consommation maximale/, /consommation max/], unit: 'W' },
          { l: "Tension d'entrée AC", get: voltage },
          { l: "Fréquence d'entrée AC", get: frequency },
        ],
      },
      {
        title: 'Poids Et Dimensions',
        fields: [
          { l: 'Largeur (sans support)', get: (c) => dim(c, 'w', { only: [/^largeur \(sans (support|pied)\)/, /^largeur sans (support|pied)/], tri: [/(taille|dimensions?) sans (support|pied)/], triNot: /emball|caisse/, not: /emball/ }) },
          { l: 'Hauteur (sans support)', get: (c) => dim(c, 'h', { only: [/^hauteur \(sans (support|pied)\)/, /^hauteur sans (support|pied)/], tri: [/(taille|dimensions?) sans (support|pied)/], triNot: /emball|caisse/, not: /emball/ }) },
          { l: 'Profondeur (sans support)', get: (c) => dim(c, 'd', { only: [/^profondeur \(sans (support|pied)\)/, /^profondeur sans (support|pied)/], tri: [/(taille|dimensions?) sans (support|pied)/], triNot: /emball|caisse/, not: /emball/ }) },
          { l: 'Poids (sans support)', get: (c) => weight(c, { only: [/poids (de l'appareil )?sans (pied|support)/, /poids net \(sans pied\)/, /^poids \(sans support\)/] }) },
          { l: 'Hauteur (avec support)', get: (c) => dim(c, 'h', { only: [/^hauteur du produit( \(mm\))?$/, /^hauteur \(avec (support|pied)\)/, /^hauteur avec (support|pied)/], tri: [/(taille|dimensions?) avec (support|pied)/], triNot: /emball|caisse/, not: /emball|sans/ }) },
          { l: 'Poids (avec support)', get: (c) => weight(c, { only: [/poids (de l'appareil )?avec (pied|support)/, /^poids net( \(kg\))?$/, /^poids \(avec support\)/], not: /sans|emball|brut/ }) },
        ],
      },
      {
        title: "Contenu De L'emballage",
        fields: [
          { l: 'Télécommande fournie', get: (c) => (c.find([/telecommande/, /remote/]) ? 'Oui' : '') },
          { l: 'Type de télécommande', text: [/modele de telecommande/, /type de telecommande/, /remote control model/] },
        ],
      },
    ],
  });

  // ================================================================ HOB (table de cuisson)
  const hobKind = (c) => {
    const t = key(c.val([/type de table de cuisson/, /type de (plaque|cuisiniere|table)/, /appellation produit/, /^type$/, /^plaque$/, /^energie$/]) + ' ' + c.nk + ' ' + c.pk);
    if (/gaz sur verre|gas ?on ?glass|gaz sous verre/.test(t)) return 'Gaz sur verre';
    if (/mixte|gaz.*induction|induction.*gaz|gaz.*electrique/.test(t)) return 'Mixte';
    if (/induction/.test(t)) return 'Induction';
    if (/vitroc|radiant|ceram/.test(t)) return 'Vitrocéramique';
    if (/electrique|fonte electrique/.test(t)) return 'Électrique';
    if (/gaz|gas/.test(t)) return 'Gaz';
    return '';
  };
  const ORD = ['premier', 'second', 'troisieme', 'quatrieme', 'cinquieme', 'sixieme'];
  S.register({
    id: 'hob',
    label: 'Table de cuisson',
    icon: '🔥',
    detect: [/tables? de cuisson|plaques? de cuisson|plaques? (a )?(gaz|induction)|table (a )?induction|table gaz|vitroceram|gas ?on ?glass|\bdomino\b|\bhobs?\b|gashobs|cooktop/],
    detectSpecs: [/bruleur|foyer|zone de cuisson/],
    notIf: [/four\b|cuisiniere|hotte/],
    groups: [
      {
        title: 'Caractéristiques',
        fields: [
          { l: 'Type de plaque', get: (c) => ({ Gaz: 'Table de cuisson au gaz', 'Gaz sur verre': 'Table de cuisson au gaz (gaz sur verre)', Induction: 'Table de cuisson à induction', Vitrocéramique: 'Table de cuisson vitrocéramique', Électrique: 'Table de cuisson électrique', Mixte: 'Table de cuisson mixte' })[hobKind(c)] || '' },
          { l: "Placement de l'appareil", get: () => 'Intégré' },
          {
            l: 'Nombre de brûleurs/zones de cuisson',
            get: (c) => {
              const n = c.num([/nombre (total )?de (bruleurs|foyers|zones)/, /nombre de bruleurs gaz/, /nombre total de positions simultanees/, /combien de foyers/, /nombre de zones de cuisson/, /^foyers$/]);
              if (n) return String(n);
              const m = (c.name + ' ' + c.pk).match(/(\d)\s*(?:feux|foyers|bruleurs|brûleurs|zones)/i);
              return m ? m[1] : '';
            },
          },
          { l: 'Largeur de la table', get: (c) => { const x = c.find([/^largeur$/], { not: /emball|niche/ }); const n = x ? numOf(x.value) : null; if (n && /cm/.test(key(x.value)) && n <= 120) { x.used = true; return n + ' cm'; } const m = (c.name + ' ' + c.pk).match(/(\d{2,3})\s*cm/i); return m ? m[1] + ' cm' : ''; } },
          { l: 'Type de commande', get: (c) => { const v = key(c.val([/systeme de commandes/, /^commandes$/, /type de commande/, /panneau de commandes/])); if (/tactile|touch|slider/.test(v)) return 'Tactile'; if (/manette|bouton|rotatif|knob/.test(v)) return 'Boutons rotatifs'; return ''; } },
          { l: 'Matériau du plan de cuisson', get: (c) => { const v = key(c.val([/materiau de base de la surface/, /^surface$/, /materiau (de la )?(surface|plaque|table)/, /^plaque$/])); if (/verre|glass/.test(v)) return 'Verre trempé'; if (/inox|stainless|acier/.test(v)) return 'Acier inoxydable'; if (/vitro|ceram/.test(v)) return 'Vitrocéramique'; if (/email/.test(v)) return 'Acier émaillé'; return v ? cap(v) : ''; } },
          { l: 'Matériau des grilles', get: (c) => { const v = key(c.val([/grille-support|grille support|type de grille|support casserole|supports? de casserole/])); if (/fonte|cast/.test(v)) return 'Fonte'; if (/email/.test(v)) return 'Acier émaillé'; if (/acier|inox/.test(v)) return 'Acier'; return v ? cap(v) : ''; } },
          {
            l: 'Type des brûleurs',
            get: (c) => {
              const out = [];
              c.rows.forEach((x) => {
                if (x.empty || !/^foyer n|^bruleur \d|^zone \d/.test(x.k)) return;
                x.used = true;
                out.push(tidy(x.value).replace(/^Brûleur gaz /i, '').replace(/^./, (ch) => ch.toUpperCase()));
              });
              return out.join(', ');
            },
          },
          {
            l: 'Puissance des brûleurs',
            get: (c) => {
              const one = c.find([/puissance des elements chauffants/, /puissance des (bruleurs|foyers)/]);
              if (one) {
                one.used = true;
                return tidy(one.value);
              }
              const out = [];
              ORD.forEach((o) => {
                const x = c.find([new RegExp('puissance du ' + o + ' element')]);
                if (x) {
                  x.used = true;
                  const n = numOf(x.value);
                  if (n) out.push(fr(n >= 100 ? n / 1000 : n) + ' kW');
                }
              });
              return out.join(', ');
            },
          },
          { l: 'Puissance totale (gaz)', num: [/puissance (maxi(male)? |totale )?(du )?gaz/, /puissance totale gaz/, /gas power/], conv: (n) => (n < 100 ? n * 1000 : n), unit: 'W' },
          { l: 'Allumage électrique', yes: [/allumage|ignition/], opts: { not: /securite/ } },
          { l: 'Sécurité gaz (thermocouple)', get: (c) => { const v = c.val([/securite gaz|dispositif de securite|thermocouple|flame failure|safety/]); if (!v) return ''; return /non|aucun|sans/i.test(v) ? 'Non' : 'Oui'; } },
          { l: 'Type de gaz', text: [/^type de gaz$/, /^gaz$/, /gas type/] },
          { l: 'Minuteur', yes: [/minut|timer/] },
          { l: 'Témoin de chaleur résiduelle', get: (c) => { const v = c.val([/chaleur residuelle/]); if (!v) return ''; return /sans|non|no\b/i.test(v) ? 'Non' : 'Oui'; } },
          { l: 'Fonction Booster', yes: [/booster|powerboost|power boost/] },
        ],
      },
      {
        title: 'Design',
        fields: [{ l: 'Couleur du produit', get: (c) => { const v = c.val([/couleur (principale|de l'appareil|du produit)/, /^couleur$/]); return v ? T.colorFr(v) : ''; } }],
      },
      {
        title: 'Puissance',
        fields: [
          { l: "Tension d'entrée AC", get: voltage },
          { l: "Fréquence d'entrée AC", get: frequency },
          { l: 'Puissance de raccordement (électrique)', num: [/puissance de raccordement|charge connectee|puissance electrique (totale|max)|puissance totale electrique/], unit: 'W' },
        ],
      },
      {
        title: 'Poids Et Dimensions',
        fields: [
          { l: 'Largeur', get: (c) => dim(c, 'w', { triFirst: /bosch|siemens/.test(c.bk) }) },
          { l: 'Profondeur', get: (c) => dim(c, 'd', { triFirst: /bosch|siemens/.test(c.bk) }) },
          { l: 'Hauteur', get: (c) => dim(c, 'h', { triFirst: /bosch|siemens/.test(c.bk) }) },
          { l: "Dimensions d'encastrement", get: (c) => { const x = c.find([/niche|decoupe|encastrement|cut-?out/], { not: /epaisseur/ }); if (!x) return ''; x.used = true; return tidy(x.value).replace(/\s*[xX×]\s*/g, ' x ') + (/mm/.test(x.value) ? '' : ' mm'); } },
          { l: 'Poids', get: (c) => weight(c) },
        ],
      },
    ],
  });


  // ================================================================ BUILT-IN OVEN (four encastrable)
  const cleaning = (c) => {
    const v = key(c.val([/systeme de nettoyage/, /type de nettoyage/, /mode de nettoyage/, /nettoyage/, /^autonettoyant/]) + ' ' + c.nk);
    const out = [];
    if (/pyrol/.test(v)) out.push('Pyrolyse');
    if (/catal/.test(v)) out.push('Catalyse');
    if (/hydrol|aqua ?clean|vapeur.*nettoy|steam clean/.test(v)) out.push('Hydrolyse');
    return out.join(' + ');
  };
  const ovenModes = (c) => {
    const v = c.val([/^mode de cuisson$/, /^modes de cuisson$/, /fonctions de cuisson/, /^programmes de cuisson/]);
    return v && /,/.test(v) ? tidy(v) : '';
  };
  S.register({
    id: 'oven',
    label: 'Four encastrable',
    icon: '♨',
    detect: [/\bfours?\b(?! (a |à )?micro)|four[s]? (encastrable|integrable|multifonction|electrique)|fours-et-fours|built[- ]?in oven|\boven\b/],
    detectSpecs: [/cavite|chaleur tournante|pyrolyse|catalyse|thermostat/],
    notIf: [/micro[- ]?onde|microwave|cuisiniere|mini[- ]?four|grille-pain/],
    groups: [
      {
        title: 'Caractéristiques',
        fields: [
          { l: 'Type de four', get: (c) => { const v = key(c.val([/type d'energie/, /type de four/, /^energie$/]) + ' ' + c.nk); if (/gaz|gas/.test(v)) return 'Four à gaz'; return 'Four électrique'; } },
          { l: "Placement de l'appareil", get: () => 'Intégré' },
          {
            l: 'Capacité nette du four',
            get: (c) => {
              const x = c.find([/volume utile/, /capacite (nette |utile |interieure )?(du four|de la cavite)/, /volume de la cavite/, /capacite nette du four/, /^capacite( \(l\))?$/, /^volume( \(l\))?$/, /cavity volume/]);
              if (x) {
                const n = numOf(x.value);
                if (n && n < 200) {
                  x.used = true;
                  return n + ' L';
                }
              }
              const m = (c.name + ' ' + c.pk).match(/(\d{2,3})\s*(?:l|litres?)\b/i);
              return m ? m[1] + ' L' : '';
            },
          },
          { l: 'Nombre de fonctions', get: (c) => { const n = c.num([/nombre de (modes|fonctions)/, /nombre de modes de chauffage/, /quantite de programmes/, /number of (functions|modes)/]); return n ? String(n) : ''; } },
          { l: 'Modes de cuisson', get: ovenModes },
          { l: 'Plage de températures', get: (c) => { const x = c.find([/plage de temperature/, /plage de thermostat/, /temperature (min|max)/]); if (!x) return ''; const n = numsOf(x.value); if (n.length < 2) return ''; x.used = true; return n[0] + ' - ' + n[1] + ' °C'; } },
          { l: 'Chaleur tournante', get: (c) => (c.has(/chaleur tournante|air pulse|hotair|hot air|convection forcee|multi-?niveaux|3d/) ? 'Oui' : '') },
          { l: 'Gril', get: (c) => (c.has(/\bgril|\bgrill/) ? 'Oui' : '') },
          { l: 'Cuisson vapeur', get: (c) => { const y = c.yes([/^vapeur$/, /technologie (de la )?vapeur/, /cuisson vapeur/, /steam/]); return yesNo(y); } },
          { l: 'Type de nettoyage', get: cleaning },
          { l: 'Rails télescopiques', get: (c) => { const v = c.val([/rails? telescopiques?|telescopiques?/]); if (!v) return ''; return /non|aucun|no\b/i.test(v) ? 'Non' : 'Oui'; } },
          { l: 'Préchauffage rapide', yes: [/prechauffage rapide|booster|fast pre-?heat/] },
          { l: 'Sonde de température', get: (c) => { const v = c.val([/sonde/, /meat probe/]); if (!v) return ''; return /non|no\b/i.test(v) ? 'Non' : 'Oui'; } },
          { l: 'Fermeture douce de la porte', yes: [/soft ?close|fermeture douce/] },
          { l: 'Sécurité enfant', get: (c) => (c.yes([/securite enfant|child lock|verrouillage/]) === true || /enfant/.test(key(c.val([/dispositif de securite/]))) ? 'Oui' : '') },
          { l: 'Accessoires inclus', text: [/accessoires (integres|inclus|fournis)/] },
          { l: 'Type de commande', get: (c) => { const v = key(c.val([/concept d'affichage/, /type de commande/, /bandeau de commandes/, /commandes?$/, /^technologie$/])); if (/tactile|touch/.test(v)) return 'Tactile'; if (/bouton|rotatif|manette|knob/.test(v)) return 'Boutons rotatifs'; return ''; } },
          { l: 'Écran intégré', get: (c) => (c.has(/affichage led|ecran|display|digital|digitale/) ? 'Oui' : '') },
        ],
      },
      { title: 'Design', fields: [{ l: 'Couleur du produit', get: (c) => { const v = c.val([/couleur (principale|de l'appareil|du produit)/, /^couleur$/]); return v ? T.colorFr(v) : ''; } }, { l: 'Matériau de la porte', text: [/materiau de la porte|couleur et materiau de la porte|design porte/] }] },
      {
        title: 'Gestion Énergétique',
        fields: [
          { l: "Classe d'efficacité énergétique", get: (c) => energyClass(c) },
          { l: "Consommation d'énergie (convection forcée)", num: [/consommation.*(chaleur tournante|convection forcee|forced)/], unit: 'kWh' },
          { l: "Consommation d'énergie (conventionnelle)", num: [/consommation.*(classique|conventionnel)/], unit: 'kWh' },
        ],
      },
      { title: 'Puissance', fields: [{ l: 'Puissance de raccordement', num: [/puissance de raccordement|charge connectee|puissance (totale|max)/], unit: 'W' }, { l: "Tension d'entrée AC", get: voltage }, { l: "Fréquence d'entrée AC", get: frequency }] },
      {
        title: 'Poids Et Dimensions',
        fields: [
          { l: 'Largeur', get: (c) => dim(c, 'w') },
          { l: 'Profondeur', get: (c) => dim(c, 'd') },
          { l: 'Hauteur', get: (c) => dim(c, 'h') },
          { l: 'Poids', get: (c) => weight(c) },
          { l: "Dimensions d'encastrement", get: nicheOf },
        ],
      },
      { title: 'Réseau', fields: [{ l: 'Wifi', get: wifi }, { l: 'Application', get: appName }] },
    ],
  });
  // niche: "590x560x560", or min/max lines (Bosch)
  function nicheOf(c) {
    const one = c.find([/taille requise de la niche/, /^niche d'encastrement$/, /dimensions? (de la )?niche/, /dim\. niche/]);
    if (one) {
      one.used = true;
      return tidy(one.value).replace(/\s*[xX×]\s*/g, ' x ') + (/mm/.test(one.value) ? '' : ' mm');
    }
    const h = c.num([/hauteur minimum de la niche/]);
    const h2 = c.num([/hauteur maximum de la niche/]);
    const w = c.num([/largeur minimum de la niche/]);
    const w2 = c.num([/largeur maximum de la niche/]);
    const d = c.num([/profondeur de la niche/]);
    if (!h && !w && !d) return '';
    const part = (a, b) => (a && b && a !== b ? a + '-' + b : a || b || '?');
    return 'H ' + part(h, h2) + ' x L ' + part(w, w2) + ' x P ' + (d || '?') + ' mm';
  }

  // ================================================================ BUILT-IN MICROWAVE
  S.register({
    id: 'microwave',
    label: 'Micro-ondes encastrable',
    icon: '〰',
    detect: [/micro[- ]?ondes?|microwave|\bmo encas/],
    detectSpecs: [/micro-ondes|plateau tournant/],
    groups: [
      {
        title: 'Caractéristiques',
        fields: [
          {
            l: 'Type de produit',
            get: (c) => {
              const t = key(c.val([/type de (four a )?micro-ondes/, /type de produit/, /^mode de cuisson$/]) + ' ' + c.nk);
              if (/combine|convection|chaleur tournante/.test(t)) return 'Micro-ondes combiné';
              if (/gril|grill/.test(t) || c.num([/puissance du gril/])) return 'Micro-ondes grill';
              return 'Micro-ondes simple';
            },
          },
          { l: "Placement de l'appareil", get: (c) => placement(c, true) },
          {
            l: 'Capacité intérieure',
            get: (c) => {
              const x = c.find([/capacite (de la cavite|interieure)/, /volume de la cavite/, /^capacite( \(l\))?$/, /^volume( \(l\))?$/]);
              if (x) {
                const n = numOf(x.value);
                if (n && n < 80) {
                  x.used = true;
                  return n + ' L';
                }
              }
              const m = (c.name + ' ' + c.pk).match(/(\d{2})\s*(?:l|litres?)\b/i);
              return m ? m[1] + ' L' : '';
            },
          },
          {
            l: 'Puissance du micro-ondes',
            get: (c) => {
              const x = c.find([/puissance (max(imum|\.)? )?(du )?micro-?ondes?/, /niveau de puissance max/, /puissance de sortie micro/, /^puissance micro-ondes/, /microwave power/]);
              if (x) {
                const ns = numsOf(x.value);
                const n = ns.length ? Math.max.apply(null, ns) : null;
                if (n) {
                  x.used = true;
                  return n + ' W';
                }
              }
              const lv = c.find([/niveaux de puissance des micro-ondes/]);
              if (lv) {
                const ns = numsOf(lv.value);
                if (ns.length) return Math.max.apply(null, ns) + ' W';
              }
              const m = (c.name + ' ' + c.pk).match(/(\d{3,4})\s*w\b/i);
              return m ? m[1] + ' W' : '';
            },
          },
          { l: 'Nombre de niveaux de puissance', get: (c) => { const n = c.num([/nombre de niveaux de puissance/]); if (n) return String(n); const lv = c.find([/niveaux de puissance des micro-ondes/]); const ns = lv ? numsOf(lv.value) : []; return ns.length > 1 ? String(ns.length) : ''; } },
          { l: 'Puissance du grill', num: [/puissance du gril/, /grill power/], unit: 'W' },
          { l: 'Plateau tournant', get: (c) => (c.has(/plateau tournant|turntable|platine/) ? 'Oui' : '') },
          { l: 'Type de commande', get: (c) => { const v = key(c.val([/concept d'affichage/, /^technologie$/, /type de commande/, /commandes?$/])); if (/tactile|touch/.test(v)) return 'Tactile'; if (/bouton|rotatif|manette|knob/.test(v)) return 'Boutons rotatifs'; return ''; } },
          { l: 'Fonction de décongélation', yes: [/decongelation|defrost/] },
          { l: 'Ouverture de la porte', text: [/ouverture de la porte/, /type d'ouverture/], map: (v) => (/lat/i.test(v) ? 'Latérale' : /abatt|bas/i.test(v) ? 'Abattante' : cap(v)) },
          { l: 'Accessoires inclus', text: [/accessoires (integres|inclus|fournis)/] },
        ],
      },
      { title: 'Design', fields: [{ l: 'Couleur du produit', get: (c) => { const v = c.val([/couleur (principale|de l'appareil|du produit|du materiau principal)/, /^couleur$/]); return v ? T.colorFr(v) : ''; } }] },
      { title: 'Puissance', fields: [{ l: 'Puissance de raccordement', num: [/puissance de raccordement|charge connectee/], unit: 'W' }, { l: "Tension d'entrée AC", get: voltage }, { l: "Fréquence d'entrée AC", get: frequency }] },
      {
        title: 'Poids Et Dimensions',
        fields: [
          { l: 'Largeur', get: (c) => dim(c, 'w') },
          { l: 'Profondeur', get: (c) => dim(c, 'd') },
          { l: 'Hauteur', get: (c) => dim(c, 'h') },
          { l: 'Poids', get: (c) => weight(c) },
          { l: "Dimensions d'encastrement", get: nicheOf },
        ],
      },
    ],
  });

  // ================================================================ SINK (évier)
  S.register({
    id: 'sink',
    label: 'Évier',
    icon: '🚰',
    detect: [/\beviers?\b|\bsinks?\b|evier (inox|granit|1 bac|2 bacs)/],
    detectSpecs: [/egouttoir|bac|cuve/],
    notIf: [/chauffe-eau|sur evier|sous-evier|sous evier|robinet seul/],
    groups: [
      {
        title: 'Caractéristiques',
        fields: [
          { l: "Type d'évier", get: (c) => { const t = key(c.val([/type d'evier/, /type d'installation/, /^installation$/, /^montage$/]) + ' ' + c.nk); if (/sous[- ]?plan|undermount/.test(t)) return 'Sous plan'; if (/a poser|pose libre|sur meuble/.test(t)) return 'À poser'; if (/affleurant|flush/.test(t)) return 'Affleurant'; if (/encastr|built/.test(t)) return 'À encastrer'; return ''; } },
          { l: 'Matériau', get: (c) => { const t = key(c.val([/^materiau/, /^matiere/, /material/]) + ' ' + c.nk); if (/granit|quartz|fragranit|silgranit|tectonite/.test(t)) return 'Granit / Quartz'; if (/ceram/.test(t)) return 'Céramique'; if (/compos|resine|synthet/.test(t)) return 'Composite'; if (/inox|stainless|acier/.test(t)) return 'Acier inoxydable'; return ''; } },
          { l: 'Nombre de bacs', get: (c) => { const v = c.val([/nombre de (bacs|cuves)/, /^bacs?$/, /^cuves?$/]); const n = numOf(v); if (n) return fr(n); const m = (c.name + ' ' + c.pk).match(/(\d(?:[.,]5)?)\s*(?:bacs?|cuves?)/i); return m ? m[1].replace('.', ',') : ''; } },
          { l: 'Égouttoir', get: (c) => { const y = c.yes([/egouttoir/]); if (y !== null) return yesNo(y); return c.inName(/egouttoir/) ? (c.inName(/sans egouttoir/) ? 'Non' : 'Oui') : ''; } },
          { l: "Position de l'égouttoir", get: (c) => { const v = key(c.val([/position de l'egouttoir|sens|orientation/]) + ' ' + c.nk); if (/reversible/.test(v)) return 'Réversible'; if (/gauche|left/.test(v)) return 'Gauche'; if (/droite|right/.test(v)) return 'Droite'; return ''; } },
          { l: 'Profondeur du bac', num: [/profondeur (du |de la )?(bac|cuve)/], unit: 'mm', conv: (n) => (n < 40 ? n * 10 : n) },
          { l: 'Dimensions du bac', text: [/dimensions? (du |de la )?(bac|cuve)/] },
          { l: 'Trou(s) pour robinet', text: [/trous? (pour |de )?(robinet|mitigeur)/, /percage robinet/] },
          { l: 'Robinet inclus', yes: [/robinet inclus|mitigeur inclus|avec robinet/] },
          { l: 'Vidage', text: [/vidage|bonde/] },
          { l: 'Trop-plein', yes: [/trop[- ]?plein/] },
          { l: 'Finition', text: [/finition|surface/] },
        ],
      },
      { title: 'Design', fields: [{ l: 'Couleur du produit', get: color }] },
      {
        title: 'Poids Et Dimensions',
        fields: [
          { l: 'Largeur', get: (c) => dim(c, 'w', { only: [/^largeur/, /^longueur/] }) },
          { l: 'Profondeur', get: (c) => dim(c, 'd') },
          { l: 'Hauteur', get: (c) => dim(c, 'h') },
          { l: 'Dimensions de découpe', text: [/decoupe|cut-?out|dimensions? d'encastrement/] },
          { l: 'Poids', get: (c) => weight(c) },
        ],
      },
    ],
  });

  // ================================================================ FAN (ventilateur)
  S.register({
    id: 'fan',
    label: 'Ventilateur',
    icon: '🌀',
    detect: [/ventilateur|\bfans?\b|brasseur d'air|tower fan|colonne d'air/],
    notIf: [/climati|split|btu|chauffage soufflant|purificateur/],
    groups: [
      {
        title: 'Caractéristiques',
        fields: [
          { l: 'Type', get: (c) => { const t = key(c.nk + ' ' + c.pk + ' ' + c.val([/^type/])); if (/colonne|tour|tower/.test(t)) return 'Ventilateur colonne'; if (/plafond|ceiling/.test(t)) return 'Ventilateur de plafond'; if (/table|bureau|desk/.test(t)) return 'Ventilateur de table'; if (/mural|wall/.test(t)) return 'Ventilateur mural'; if (/pied|stand/.test(t)) return 'Ventilateur sur pied'; return 'Ventilateur'; } },
          { l: 'Diamètre', num: [/diametre/, /taille (des )?pales/], unit: 'cm', conv: (n) => (n > 100 ? n / 10 : n) },
          { l: 'Nombre de vitesses', get: (c) => { const n = c.num([/nombre de vitesses|vitesses|speeds?/]); return n ? String(n) : ''; } },
          { l: 'Oscillation', yes: [/oscillation|oscillant/] },
          { l: 'Minuteur', yes: [/minut|timer/] },
          { l: 'Télécommandé', yes: [/telecommande|remote/] },
          { l: 'Débit d’air', num: [/debit d'air|air flow|airflow/], unit: 'm³/h' },
          { l: 'Niveau sonore', get: (c) => noise(c) },
        ],
      },
      { title: 'Design', fields: [{ l: 'Couleur du produit', get: color }] },
      { title: 'Puissance', fields: [{ l: 'Puissance', num: [/^puissance( \(w\))?$/, /^puissance nominale/, /power/], unit: 'W' }, { l: "Tension d'entrée AC", get: voltage }, { l: "Fréquence d'entrée AC", get: frequency }] },
      { title: 'Poids Et Dimensions', fields: [{ l: 'Hauteur', get: (c) => dim(c, 'h') }, { l: 'Poids', get: (c) => weight(c) }] },
    ],
  });


  // ================================================================ DISHWASHER (lave-vaisselle) — not in the first list, but sold by every brand
  S.register({
    id: 'dishwasher',
    label: 'Lave-vaisselle',
    icon: '🍽',
    detect: [/lave[- ]?vaisselle|dishwasher/],
    detectSpecs: [/couverts|panier/],
    groups: [
      {
        title: 'Caractéristiques',
        fields: [
          { l: "Placement de l'appareil", get: (c) => { const t = c.nk + ' ' + c.pk + ' ' + key(c.val([/placement|encastrable|installation/])); if (/tout[- ]?integr|full(y)? integrated|totalement integr/.test(t)) return 'Tout intégrable'; if (/integr|encastr|built/.test(t)) return 'Intégrable'; if (/pose[- ]?libre|freestanding|posable/.test(t)) return 'Pose libre'; return ''; } },
          { l: 'Nombre de couverts', get: (c) => { const n = c.num([/nombre de couverts|couverts|place settings/]); if (n) return String(n); const m = (c.name + ' ' + c.pk).match(/(\d{1,2})\s*couverts/i); return m ? m[1] : ''; } },
          { l: 'Largeur', get: (c) => { const m = (c.name + ' ' + c.pk).match(/\b(45|60)\s*cm\b/i); return m ? m[1] + ' cm' : ''; } },
          { l: 'Nombre de programmes', get: (c) => { const n = c.num([/nombre de programmes/]); return n ? String(n) : ''; } },
          { l: 'Programmes', text: [/^programmes( de lavage)?$/] },
          { l: 'Niveau sonore', get: (c) => noise(c) },
          { l: 'Départ différé', yes: [/depart differe|fin differee|delay/] },
          { l: 'Demi-charge', yes: [/demi[- ]charge|half load/] },
          { l: 'Troisième panier', yes: [/troisieme panier|3e panier|3eme panier|tiroir a couverts|third rack/] },
          { l: 'Technologie de convertisseur', get: (c) => (c.has(/inverter/) ? 'Oui' : '') },
          { l: 'Sécurité anti-fuite', yes: [/aquastop|anti[- ]?fuite|protection (contre les )?fuites|leak/] },
        ],
      },
      { title: 'Design', fields: [{ l: 'Couleur du produit', get: color }] },
      {
        title: 'Gestion Énergétique',
        fields: [
          { l: "Classe d'efficacité énergétique", get: (c) => energyClass(c) },
          { l: "Consommation d'eau par cycle", num: [/consommation d'eau/], unit: 'L' },
          { l: "Consommation d'énergie pour 100 cycles", num: [/100 cycles/], unit: 'kWh' },
        ],
      },
      { title: 'Poids Et Dimensions', fields: [{ l: 'Largeur', get: (c) => dim(c, 'w') }, { l: 'Profondeur', get: (c) => dim(c, 'd') }, { l: 'Hauteur', get: (c) => dim(c, 'h') }, { l: 'Poids', get: (c) => weight(c) }] },
      { title: 'Réseau', fields: [{ l: 'Wifi', get: wifi }, { l: 'Application', get: appName }] },
    ],
  });

})(GHANDI_SHEETS);
