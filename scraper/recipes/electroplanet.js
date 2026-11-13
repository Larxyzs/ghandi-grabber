/*
  ELECTROPLANET RECIPE  (a SHOP, not a brand)
  -------------------------------------------
  electroplanet.ma is a Magento 2 shop selling many brands. Checked on the real site (Nov 2026):
    - Category pages: /gros-electromenager/refrigerateur/refrigerateur-avec-congelateur-en-bas
      Cards ".products-grid .product-item" (40 per page), "140 articles", next pages "?p=2" (+ <link rel="next">).
    - Product page: /p3124345-comb-gr-b499nqlm-333l-silver-nf-lg.html   (/p<number>[-name].html)
      h1 = a.manufacturer (brand) + span.ref ("COMB GR-B499NQLM 333L SILVER NF LG")
           + a.category-name ("Réfrigérateur avec congélateur en bas") + the shop's number.
    - Pictures: Magento "fotorama" gallery. The downloaded page has the gallery list in a
      text/x-magento-init script ("full" pictures, "position", "isMain", "type": image|video).
      In an open page those scripts are gone: the thumbnails strip (.fotorama__nav__frame) keeps the order.
      Big original picture = the cache address without "/cache/<32 letters>/".
    - Specifications: ".additional-attributes-wrapper" boxes = group title (.attr-group) + table th/td.
      Group "Autre Caractéristique" holds Marque (the BRAND), Code produit (usually the MODEL code),
      Code (the shop's own number), Reference fournisseur. Some rows are empty; some say Y/N.
  The brand, model code and a readable name are worked out in custom() below.
*/
(function () {
  var canonical = GHANDI.brands.canonical;
  var brandInText = GHANDI.brands.inText;

  // the first words of Electroplanet's short names: product kind, not the product itself
  var KIND =
    /^(REF|REFRIG|REFRIGERATEUR|COMB|COMBINE|SBS|QUATRO|CONG|CONGELATEUR|VERT|VER|HORIZ|COFFRE|MAL|MACHINE|A|LAVER|FRONT|TOP|L\.S|LS|SL|SECHE|LINGE|LV|LAVE|VAISSELLE|ENCASTRABLE|ENC|CLIM|CLIMATISEUR|PORTABLE|INVERT|INVERTER|LED|QLED|QNED|OLED|UHD|TV|SMART|MINI|BAR|TABLE|DE|CUISSON|CUIS|CUISINIERE|PLAQUE|TC|ELECT|VITRO|VITROCERAMIQUE|DOMINO|INDUCTION|GAZ|HOTTE|T|DECORATIVE|FOUR|SERIE|MICRO|ONDE|MO|GRILL|VENTILATEUR|PIED|BARRE|SON|CHAUFFE|EAU|INSTANTANE|IX|INOX|INOXX|DUAL|NOFROST|NF|DNF|PRO|DUALCOOL|ELEGANCE|GO|BOREAL)$/;
  // sizes, capacities, energy classes: never a model code
  var SIZE = /^(\d+([.,]\d+)?(L|KG|CM|MM|W|KW|BTU|K|T|P|PRG|V|HZ|CV|F|IN|EA|"|”|POUCES)?|\d+[.,*X/]\d+.*|A\+*|[A-G]|\d+K)$/i;
  var COLOR = /^(INOX|INOXX|SLV|SILVER|BLC|BLANC|NOIR|BLACK|GRIS|GREY|T\.GREY|BK|DG|XS|ARGENT|WHITE|BEIGE|ROUGE|BLEU|BLA)$/i;
  // the words that start a name, to remove when the category already says it
  var NAME_KIND =
    /^(REF|REFRIG|COMB|SBS|CONG|VERT|VER|HORIZ|COFFRE|MAL|L\.S|LS|SL|LV|LAVE|VAISSELLE|ENCASTRABLE|ENC|CLIM|CUIS|PLAQUE|TC|ELECT|VITRO|HOTTE|T|FOUR|MICRO|ONDE|MO|MINI|BAR|TABLE|DE|CUISSON|VENTILATEUR|BARRE|SON|CHAUFFE|EAU)$/;

  var clean = function (s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  };

  // "WTMF 700460 XNA" -> itself ; "REF ELXRFG751 245L NF SLV ELEXIA" -> "ELXRFG751"
  function modelFrom(code, ref, brand) {
    var brandU = String(brand || '').toUpperCase();
    var isBrand = function (t) {
      return !!brandU && (t === brandU || (t.length >= 2 && brandU.indexOf(t) === 0) || ((t === 'WHP' || t === 'WH') && /WHIRLPOOL/.test(brandU)));
    };
    var hasLD = function (t) {
      return /[A-Z]/i.test(t) && /\d/.test(t);
    };
    var c = clean(code).toUpperCase();
    // 1) "Code produit" is already a clean model code
    if (c && !c.split(' ').some(function (t) { return KIND.test(t); })) {
      if (/^[A-Z0-9][A-Z0-9\-/.]{3,}$/.test(c) && (hasLD(c) || /^\d{6,}$/.test(c))) return clean(code);
      if (/^[A-Z]{2,6} ?\d{2,7}( ?[A-Z0-9/-]{1,6}){0,3}$/.test(c) && c.length <= 24) return clean(code);
    }
    // 2) find it inside "Code produit", then inside the name
    var texts = [code, ref];
    for (var k = 0; k < texts.length; k++) {
      var toks = clean(texts[k]).toUpperCase().split(' ');
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i];
        if (!t || KIND.test(t) || SIZE.test(t) || COLOR.test(t) || isBrand(t)) continue;
        if (hasLD(t) && t.length >= 5) return t;
        if (/^[A-Z]{2,6}$/.test(t) && /^\d{2,7}(\/[A-Z]+)?$/.test(toks[i + 1] || '')) {
          // a spaced model: "WTZ 551101 SNA", "HIAG 64223 B", "FPJ 915 V"
          var parts = [t, toks[i + 1]];
          var nx = toks[i + 2] || '';
          if (/^[A-Z]{1,4}$/.test(nx) && !COLOR.test(nx) && !KIND.test(nx) && !isBrand(nx)) parts.push(nx);
          return parts.join(' ');
        }
      }
    }
    return '';
  }

  // "COMB GR-B499NQLM 333L SILVER NF LG" + category + brand -> "Réfrigérateur avec congélateur en bas LG GR-B499NQLM 333L SILVER NF"
  function niceName(ref, category, brand) {
    var toks = clean(ref).split(' ');
    var brandU = String(brand || '').toUpperCase();
    if (category) while (toks.length > 1 && NAME_KIND.test(toks[0].toUpperCase())) toks.shift();
    // the brand written again at the end (sometimes cut: "SAMSU", "WHP")
    while (toks.length > 1) {
      var last = toks[toks.length - 1].toUpperCase();
      if (brandU && (last === brandU || (last.length >= 2 && brandU.indexOf(last) === 0) || ((last === 'WHP' || last === 'WH') && /WHIRLPOOL/.test(brandU)))) toks.pop();
      else break;
    }
    // the brand written at the start
    if (brandU && toks.length > 1 && toks[0].toUpperCase() === brandU) toks.shift();
    return clean([category, brand, toks.join(' ')].join(' '));
  }

  // the big original picture: drop "/cache/<32 letters>/"
  function original(url) {
    return String(url || '').split('?')[0].replace(/\/cache\/[0-9a-f]{32}\//i, '/');
  }

  GHANDI.register({
    id: 'electroplanet',
    brand: 'Electroplanet (shop: many brands)',
    match: ['electroplanet.ma'],
    home: 'https://www.electroplanet.ma/',
    shop: true,
    // the downloaded page holds everything (gallery list + all spec tables): no window needed
    quickRead: { minSpecs: 0, minPictures: 1, okWarnings: /specification|picture/i },

    nameSelectors: ['h1.page-title .ref', 'h1 .ref', 'h1.page-title', 'h1'],
    priceSelectors: ['.product-info-main .special-price .price', '.product-info-price .price', '.price-box .price'],
    imagePriority: ['gallery', 'meta'],
    imageSelectors: ['.fotorama__nav__frame img', '.gallery-placeholder img', '.product.media img'],
    imageFilter: function (url) {
      return /\/media\/catalog\/product\//i.test(url);
    },
    imageUpgrade: original,
    imageKey: function (url) {
      return original(url).replace(/^.*\/media\/catalog\/product\//i, '');
    },
    modelFilter: false,
    otherProductsSelectors: ['.product-item', '.products-grid', '.block.related', '.block.upsell', '.block.crosssell', '[class*="recently" i]', '.ins-preview-wrapper'],
    specContainerSelectors: ['.additional-attributes-container', '#additional'],
    defaultGroupTitle: 'Caractéristiques',

    custom: function (ctx) {
      var r = ctx.result;
      var qa = ctx.util.qa;

      // ---- 1) specifications, group by group ----
      var groups = [];
      qa('.additional-attributes-wrapper').forEach(function (w) {
        var t = w.querySelector('.attr-group');
        var title = clean(t && t.textContent) || 'Caractéristiques';
        var rows = [];
        Array.prototype.forEach.call(w.querySelectorAll('tr'), function (tr) {
          var th = tr.querySelector('th');
          var td = tr.querySelector('td');
          var label = clean(th && th.textContent);
          var value = clean(td && td.textContent);
          if (!label || !value) return; // Electroplanet leaves some lines empty
          if (value === 'Y') value = 'Oui';
          if (value === 'N') value = 'Non';
          rows.push({ label: label, value: value });
        });
        if (rows.length) {
          var same = groups.filter(function (g) { return g.title === title; })[0];
          if (same) same.rows = same.rows.concat(rows);
          else groups.push({ title: title, rows: rows });
        }
      });
      var all = [].concat.apply([], groups.map(function (g) { return g.rows; }));
      var find = function (re) {
        var row = all.filter(function (x) { return re.test(x.label); })[0];
        return row ? row.value : '';
      };

      // ---- 2) brand, model code, name ----
      var h1 = qa('h1.page-title, h1')[0];
      var refEl = h1 && h1.querySelector('.ref');
      var ref = clean(refEl ? refEl.textContent : h1 ? h1.textContent : r.name);
      var catEl = h1 && h1.querySelector('.category-name');
      var category = clean(catEl && catEl.textContent);
      var linkBrand = h1 && h1.querySelector('a.manufacturer');
      var brand = canonical(find(/^marque$/i)) || canonical(clean(linkBrand && linkBrand.textContent)) || brandInText(ref);
      var model = modelFrom(find(/^code produit$/i), ref, brand) || modelFrom(find(/^r[ée]f[ée]rence fournisseur$/i), '', brand);
      r.brand = brand;
      if (model) r.model = model;
      if (ref) r.name = niceName(ref, category, brand);
      r.debug.brandFrom = brand || 'not found';
      r.debug.modelFrom = model ? 'electroplanet: ' + model : r.debug.modelFrom;
      if (!brand) r.warnings.push('I could not find the brand of this product. Please type it.');

      // the shop's own lines are not product specifications
      var dropLabel = /^(marque|code|code produit|r[ée]f[ée]rence fournisseur)$/i;
      groups.forEach(function (g) {
        g.rows = g.rows.filter(function (x) { return !dropLabel.test(x.label); });
      });
      groups = groups.filter(function (g) { return g.rows.length; });
      if (groups.length) {
        r.specGroups = groups;
        r.specs = [].concat.apply([], groups.map(function (g) { return g.rows; }));
        r.debug.specsFrom = 'electroplanet tables';
        r.warnings = r.warnings.filter(function (w) { return !/specification/i.test(w); });
      }

      // ---- 3) pictures, in the shop's order, big originals, no videos ----
      var pics = [];
      qa('script[type="text/x-magento-init"]').some(function (s) {
        if (!/mage\/gallery\/gallery/.test(s.textContent)) return false;
        try {
          var j = JSON.parse(s.textContent);
          Object.keys(j).forEach(function (k) {
            var g = j[k] && j[k]['mage/gallery/gallery'];
            if (!g || !g.data || pics.length) return;
            g.data
              .filter(function (x) { return x && x.type !== 'video' && (x.full || x.img); })
              .sort(function (a, b) { return (b.isMain ? 1 : 0) - (a.isMain ? 1 : 0) || (parseInt(a.position, 10) || 0) - (parseInt(b.position, 10) || 0); })
              .forEach(function (x) { pics.push(original(x.full || x.img)); });
          });
        } catch (e) {
          /* not the gallery */
        }
        return pics.length > 0;
      });
      if (!pics.length) {
        // an open page: the thumbnails strip keeps the order (the big frames load in any order)
        qa('.fotorama__nav__frame').forEach(function (f) {
          if (/video/i.test(f.className)) return;
          var img = f.querySelector('img');
          if (img && img.getAttribute('src')) pics.push(original(ctx.util.absUrl ? ctx.util.absUrl(img.getAttribute('src')) : img.src));
        });
      }
      if (!pics.length) {
        qa('.gallery-placeholder img, .product.media img').forEach(function (img) {
          var s = img.getAttribute('src') || '';
          if (/\/media\/catalog\/product\//.test(s)) pics.push(original(ctx.util.absUrl ? ctx.util.absUrl(s) : img.src));
        });
      }
      var seen = {};
      pics = pics.filter(function (u) {
        var k = u.replace(/^.*\/media\/catalog\/product\//i, '');
        if (!u || seen[k]) return false;
        seen[k] = true;
        return true;
      });
      if (pics.length) {
        r.mainImage = pics[0];
        r.otherImages = pics.slice(1);
        r.debug.imagesFrom = 'electroplanet gallery';
        r.warnings = r.warnings.filter(function (w) { return !/picture|image/i.test(w); });
      }
    },

    productLinks: {
      selectors: ['.products-grid .product-item a.product-item-link', '.products.list .product-item a.product-item-link', '.products-grid .product-item a.product-item-photo'],
      // /p3124345-comb-gr-b499nqlm-333l-silver-nf-lg.html  or  /p3086918.html
      pattern: [/^\/p\d{5,9}(-[a-z0-9-]+)?\.html$/i],
      exclude: [/\/(depliant|marques|magasins|conseils|besoin-aide|customer|checkout)\b/i],
    },
  });
})();
