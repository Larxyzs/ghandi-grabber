/*
  ELECTROBOUSFIHA RECIPE  (a SHOP, not a brand)
  ---------------------------------------------
  electrobousfiha.com sells many brands. It is a PrestaShop shop:
    - Category pages: /137-refrigerateur- , /319-machine-a-laver-automatique- , /brand/2-lg
      Cards are ".product-miniature" inside "#js-product-list", 12 or more per page,
      pages with "?page=2" and a "Suivant" link (rel="next").
    - Product page: /<category>/<number>-<name>.html   e.g. /2-portes/5107-refrigerateur-lg-2-portes-395l-net-inox.html
    - Pictures: /<number>-large_default/<name>.jpg  (small copies: -home_default, -small_default, -medium_default)
    - Brand: the manufacturer logo / "/brand/" link on the product, else the "Marque" line, else the
      brand written in the product name ("REFRIGERATEUR SAMSUNG 2 PORTES" -> Samsung).
    - Specifications: "Fiche technique" (dl.data-sheet), else a table or "Label : valeur" lines
      in the description.
  The BRAND of each product is found on the page (see custom below), so a list can mix brands.
  NOTE: written from PrestaShop's standard pages; check 2-3 products the first time.
*/
(function () {
  // Brands sold in Morocco, as they should be written. Longest names are tried first.
  var BRANDS = [
    'Arthur Martin', 'De Dietrich', 'Russell Hobbs', 'Black & Decker', 'Black+Decker', 'Continental Edison', 'Saunier Duval', 'Bosch', 'Siemens', 'Neff',
    'LG', 'Samsung', 'Whirlpool', 'Candy', 'Hoover', 'Haier', 'TCL', 'Hisense', 'Midea', 'Beko', 'Grundig', 'Electrolux', 'AEG', 'Zanussi',
    'Indesit', 'Ariston', 'Hotpoint', 'Franke', 'Teka', 'Smeg', 'Brandt', 'Sauter', 'Faure', 'Thomson', 'Sharp', 'Panasonic', 'Sony', 'Philips',
    'Toshiba', 'Daewoo', 'Condor', 'Vestel', 'Kenwood', 'Moulinex', 'Tefal', 'Rowenta', 'Krups', 'Seb', 'Calor', 'Braun', 'Babyliss', 'Remington',
    'Dyson', 'Jata', 'Taurus', 'Ufesa', 'Sencor', 'Elexia', 'Ocean', 'Siera', 'Carrier', 'Gree', 'Daikin', 'Mitsubishi', 'Fujitsu', 'Westpoint',
    'Nikai', 'Logitech', 'HP', 'Lenovo', 'Asus', 'Acer', 'Dell', 'Apple', 'Xiaomi', 'Huawei', 'Oppo', 'Realme', 'Infinix', 'Tecno', 'Honor',
    'Nokia', 'JBL', 'Bose', 'Marshall', 'PlayStation', 'Microsoft', 'Nintendo', 'Tornado', 'KitchenAid', "De'Longhi", 'Delonghi', 'Nespresso',
    'Bomann', 'Clatronic', 'Severin', 'Princess', 'Cecotec', 'Cata', 'Elica', 'Pyramis', 'Blanco', 'Grohe', 'Chaffoteaux', 'Atlantic', 'Junkers',
    'Vaillant', 'Thermor', 'Glem', 'Elba', 'Bertazzoni', 'Iris', 'Biolux', 'Starlight', 'Kiwi', 'Royal', 'Felicia', 'Sanford', 'Geepas',
  ];
  var fold = function (s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  };
  var SORTED = BRANDS.slice().sort(function (a, b) {
    return fold(b).length - fold(a).length;
  });
  // "LG", "lg", "2-lg" (brand page address), "ARTHUR MARTIN" -> the brand as it should be written
  function canonical(raw) {
    var f = fold(String(raw || '').replace(/^\d+-/, ''));
    if (!f) return '';
    for (var i = 0; i < SORTED.length; i++) if (fold(SORTED[i]) === f) return SORTED[i] === 'Delonghi' ? "De'Longhi" : SORTED[i] === 'Black+Decker' ? 'Black & Decker' : SORTED[i];
    if (f.length > 30) return '';
    // unknown brand: "SOME BRAND" -> "Some Brand" (short ones like "AUX" stay in capitals)
    return f
      .split(' ')
      .map(function (w) {
        return w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(' ');
  }
  // the first known brand written in a text ("REFRIGERATEUR SAMSUNG 2 PORTES" -> Samsung)
  function brandInText(text) {
    var f = ' ' + fold(text) + ' ';
    var best = null;
    SORTED.forEach(function (b) {
      var at = f.indexOf(' ' + fold(b) + ' ');
      if (at !== -1 && (!best || at < best.at)) best = { at: at, b: b };
    });
    if (!best) return '';
    return best.b === 'Delonghi' ? "De'Longhi" : best.b === 'Black+Decker' ? 'Black & Decker' : best.b;
  }

  GHANDI.register({
    id: 'electrobousfiha',
    brand: 'Electrobousfiha (shop: many brands)',
    match: ['electrobousfiha'],
    home: 'https://electrobousfiha.com/',
    shop: true, // the brand of each product is read on its page
    quickRead: { minSpecs: 3, minPictures: 1 }, // PrestaShop pages come complete: no need to open a window

    nameSelectors: ['h1[itemprop="name"]', '.product-information h1', 'h1.productpage_title', '#main h1', 'h1'],

    priceFrom: ['dom', 'jsonld'],
    priceSelectors: ['.current-price [itemprop="price"]', '.current-price .price', '.current-price', '.product-price'],

    imagePriority: ['gallery', 'jsonld', 'meta'],
    imageSelectors: [
      '.product-cover img, .js-qv-product-images img, .product-images img',
      '#product-images-large img, #product-images-thumbs img, .images-container img',
      '#content [class*="product-image" i] img, #content [class*="additional" i] img',
    ],
    // only the product's own photos (not the brand logos /img/m/, the theme or the shop's banners)
    imageFilter: function (url) {
      return /electrobousfiha/i.test(url) && /\/\d+-[a-z0-9]+_default\//i.test(url) && !/\/(img\/(m|cms|su|c)|modules|themes)\//i.test(url);
    },
    // ask for the big copy of each photo
    imageUpgrade: function (url) {
      return url.replace(/\/(\d+)-[a-z0-9]+_default\//i, '/$1-large_default/');
    },
    imageKey: function (url) {
      var m = String(url).match(/\/(\d+)-[a-z0-9]+_default\//i);
      return m ? 'img-' + m[1] : url.split('?')[0];
    },
    modelFilter: false, // all photos of a product share its name, never a model code

    // cards of OTHER products: "16 autres produits dans la même catégorie", accessories, best sellers
    otherProductsSelectors: [
      '.product-miniature', '.product-accessories', '.featured-products', '#categoryproducts', '.categoryproducts',
      '[class*="crossselling" i]', '[class*="viewed" i]', '#left-column', '#right-column', '.quickview',
    ],

    modelSelectors: ['.product-reference [itemprop="sku"]', '.product-reference span', '[itemprop="sku"]'],

    specContainerSelectors: [
      '.product-features dl.data-sheet',
      '#product-details .data-sheet, .product-features',
      '#description table, .product-description table',
    ],
    defaultGroupTitle: 'Fiche technique',
    alwaysClick: [/^d[ée]tails du produit$/i, /^fiche technique$/i, /^caract[ée]ristiques( techniques)?$/i],

    custom: function (ctx) {
      var r = ctx.result;
      var qa = ctx.util.qa;
      var clean = ctx.util.clean;
      var notOther = function (el) {
        return !el.closest('header,footer,nav,#header,#footer,.product-miniature,.product-accessories,.featured-products,#categoryproducts,.categoryproducts,#left-column,#right-column');
      };

      // ---- 1) the BRAND of this product ----
      var brand = '';
      var how = '';
      var h1 = qa('h1').filter(notOther)[0];
      // a) the manufacturer logo / link on the product
      var mf = qa('.product-manufacturer img[alt], .product-manufacturer a, [itemprop="brand"]').filter(notOther);
      for (var i = 0; i < mf.length && !brand; i++) {
        var el = mf[i];
        var v = el.getAttribute('content') || el.getAttribute('alt') || clean(el.textContent);
        if (!v && el.querySelector) {
          var n = el.querySelector('[itemprop="name"]');
          v = n ? n.getAttribute('content') || clean(n.textContent) : '';
        }
        if (!v && el.getAttribute('href')) v = (el.getAttribute('href').match(/\/brand\/([^/?#]+)/) || [])[1] || '';
        brand = canonical(v);
        how = 'manufacturer';
      }
      // b) a "/brand/..." link close to the product name
      if (!brand && h1) {
        var box = h1;
        for (var up = 0; up < 6 && box && !brand; up++) {
          box = box.parentElement;
          if (!box || /^(BODY|HTML)$/.test(box.tagName)) break;
          var links = qa('a[href*="/brand/"]', box).filter(notOther);
          if (links.length === 1 || (links.length && links.every(function (a) { return a.getAttribute('href') === links[0].getAttribute('href'); }))) {
            var a = links[0];
            var img = a.querySelector('img[alt]');
            brand = canonical((img && img.getAttribute('alt')) || clean(a.textContent) || (a.getAttribute('href').match(/\/brand\/([^/?#]+)/) || [])[1]);
            how = 'brand link';
          }
        }
      }
      // c) the shop's hidden data card (JSON-LD)
      if (!brand) {
        qa('script[type="application/ld+json"]').forEach(function (s) {
          if (brand) return;
          try {
            var list = [].concat(JSON.parse(s.textContent));
            list.forEach(function (d) {
              (d && d['@graph'] ? d['@graph'] : [d]).forEach(function (x) {
                if (brand || !x || !/Product/i.test(String(x['@type']))) return;
                var b = x.brand && typeof x.brand === 'object' ? x.brand.name : x.brand;
                if (b) {
                  brand = canonical(b);
                  how = 'json-ld';
                }
              });
            });
          } catch (e) {
            /* bad data card */
          }
        });
      }
      // d) a "Marque" line in the specifications
      if (!brand) {
        (r.specs || []).some(function (row) {
          if (/^(marque|fabricant|brand)$/i.test(clean(row.label))) {
            brand = canonical(row.value);
            how = 'spec line';
          }
          return !!brand;
        });
      }
      // e) the brand written in the product name, then in the address
      if (!brand) {
        brand = brandInText(r.name);
        how = 'name';
      }
      if (!brand) {
        var path = '';
        try {
          path = decodeURIComponent(new URL(r.url).pathname);
        } catch (e) {
          path = '';
        }
        brand = brandInText(path.replace(/[-_/]/g, ' '));
        how = 'address';
      }
      r.brand = brand;
      r.debug.brandFrom = brand ? how + ': ' + brand : 'not found';
      if (!brand) r.warnings.push('I could not find the brand of this product. Please type it.');

      // ---- 2) specifications written as "Label : valeur" lines in the description ----
      if ((r.specs || []).length < 3) {
        var desc = qa('#description .product-description, .product-description, #description').filter(notOther)[0];
        if (desc) {
          // the text with one line per <br>, paragraph, list item or table row (works on a downloaded page too)
          var text = '';
          var walk = function (node) {
            if (node.nodeType === 3) {
              text += node.nodeValue;
              return;
            }
            if (node.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(node.tagName)) return;
            if (node.tagName === 'BR') {
              text += '\n';
              return;
            }
            var block = /^(P|DIV|LI|TR|H[1-6]|UL|OL|TABLE|SECTION)$/.test(node.tagName);
            if (block) text += '\n';
            if (node.tagName === 'TD' || node.tagName === 'TH') text += node.previousElementSibling ? ' : ' : '';
            for (var c = node.firstChild; c; c = c.nextSibling) walk(c);
            if (block) text += '\n';
          };
          walk(desc);
          var rows = [];
          var seen = {};
          text.split(/\n|•|·|;\s+(?=[A-ZÀ-Ý])/).forEach(function (line) {
            var m = clean(line).replace(/^[-–*✓✔]+\s*/, '').match(/^([^:]{2,60}?)\s*:\s*(.{1,200})$/);
            if (!m) return;
            var label = clean(m[1]);
            var value = clean(m[2]);
            if (!value || /^https?$/i.test(label) || seen[label.toLowerCase()]) return;
            seen[label.toLowerCase()] = true;
            rows.push({ label: label, value: value });
          });
          if (rows.length > (r.specs || []).length && rows.length >= 2) {
            r.specs = rows;
            r.specGroups = [{ title: 'Caractéristiques', rows: rows }];
            r.warnings = r.warnings.filter(function (w) {
              return !/specification/i.test(w);
            });
            r.debug.specsFrom = 'description lines';
          }
        }
      }
      // a "Marque" line is the brand, not a specification to show twice
      if (r.brand) {
        var keep = function (row) {
          return !/^(marque|fabricant|brand)$/i.test(clean(row.label));
        };
        r.specs = (r.specs || []).filter(keep);
        (r.specGroups || []).forEach(function (g) {
          g.rows = (g.rows || []).filter(keep);
        });
        r.specGroups = (r.specGroups || []).filter(function (g) {
          return g.rows.length;
        });
      }
    },

    productLinks: {
      // the product cards of the list (not the "best sellers" block on the side)
      selectors: ['#js-product-list .product-miniature a.product-thumbnail', '#js-product-list .product-miniature .product-title a', '#js-product-list .product-miniature a[href$=".html"]'],
      // .../2-portes/5107-refrigerateur-lg-2-portes-395l-net-inox.html
      pattern: [/^\/(?:[a-z0-9-]+\/)?\d+-[a-z0-9-]+\.html$/i],
      exclude: [/\/(content|module|modules|brand|supplier|panier|commande|mon-compte|connexion|contact|nous-contacter)\b/i],
      loadMore: /^(voir|afficher|charger)\s+plus( de produits)?$|^plus de produits$/i,
    },
  });
})();
