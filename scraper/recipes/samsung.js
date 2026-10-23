/*
  SAMSUNG RECIPE
  --------------
  Samsung Morocco = samsung.com/n_africa/   (Algeria, Morocco, Tunisia share it)
    - Category pages: /n_africa/refrigerators/all-refrigerators/ ,
      /n_africa/washers-and-dryers/all-washers-and-dryers/ , /n_africa/tvs/all-tvs/
      The product list is drawn by the page itself (JavaScript), we wait for it.
    - Product page: /n_africa/<category>/<sub-category>/<name-ending-with-model>/
    - The prices on n_africa are FAKE leftovers (in £ and $), so we never take them.
    - Specifications: an accordion under "Caractéristiques". The button
      "Agrandir tout" opens every box. Sections like Capacité, Spécification physique ...
    - Pictures: images.samsung.com/.../gallery/...?$1164_776_PNG$ . Small sizes are
      changed to that big size.
  NOTE: written from the real pages' text; check 2-3 products the first time.
*/
GHANDI.register({
  id: 'samsung',
  brand: 'Samsung',
  match: ['samsung.com'],
  quickRead: { minSpecs: 10, minPictures: 2 },
  home: 'https://www.samsung.com/n_africa/', // the brand's Morocco website (button in the side tab)

  // n_africa (Morocco) shows fake £/$ prices -> ignore prices there
  noPrice: function (host, path) {
    return /^\/(n_africa|africa_fr|ma|ma_fr|dz|tn)\//i.test(path);
  },

  // MODEL CODE ("RB34C600ES9/MA") — Samsung writes it in many places of the page.
  // The address always ends with it: .../rb34c600es9-340l-silver-rb34c600es9-ma/  ->  RB34C600ES9/MA
  model: function (ctx) {
    var squash = function (s) {
      return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    };
    // 1) from the address
    var fromUrl = '';
    try {
      var segs = new URL(ctx.url).pathname.split('/').filter(Boolean);
      var parts = (segs[segs.length - 1] || '').toLowerCase().split('-');
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        if (p.length >= 6 && /[a-z]/.test(p) && /\d/.test(p) && !/^\d+(k|hz|inch|kg|l|w|cm|mm|gb|tb|btu)$/.test(p)) {
          var next = parts[i + 1];
          fromUrl = p.toUpperCase() + (next && /^[a-z]{2,3}$/.test(next) ? '/' + next.toUpperCase() : '');
          break;
        }
      }
    } catch (e) {
      /* no address */
    }
    // 2) the code written on the page (only if it is THIS product: it must match the address when we have one)
    var fits = function (v) {
      return ctx.looksLikeModel(v) && (!fromUrl || squash(v).indexOf(squash(fromUrl.split('/')[0])) === 0);
    };
    var els = ctx.qa('[class*="sku-code" i], [class*="model-code" i], [class*="modelCode" i], [class*="pd-info__sku" i], [class*="product-code" i]');
    for (var j = 0; j < els.length; j++) {
      var t = ctx.clean(els[j].textContent).replace(/^(code (du )?mod[eè]le|mod[eè]le|model|sku|code)\s*[:.]?\s*/i, '');
      if (fits(t)) return t;
    }
    var attrs = ctx.qa('[data-modelcode], [data-model-code], [data-model_code]');
    for (var k = 0; k < attrs.length; k++) {
      var v = attrs[k].getAttribute('data-modelcode') || attrs[k].getAttribute('data-model-code') || attrs[k].getAttribute('data-model_code');
      if (fromUrl && fits(v)) return ctx.clean(v);
    }
    if (ctx.jsonld && fits(ctx.jsonld.model)) return ctx.jsonld.model;
    return fromUrl;
  },

  nameSelectors: [
    '[class*="product-details" i] h1',
    '[class*="pd-buying-tool" i] h1',
    '[class*="pd-info" i] h1',
    'h1',
  ],

  priceFrom: ['jsonld', 'dom'],
  priceSelectors: ['[class*="price" i][class*="current" i]', '[itemprop="price"]', '[class*="price" i]'],

  imagePriority: ['gallery', 'jsonld', 'nearName', 'meta'],
  imageSelectors: [
    'img[src*="/gallery/"][src*="samsung.com"], img[data-src*="/gallery/"][data-src*="samsung.com"], img[srcset*="/gallery/"]',
    '[class*="gallery" i] img',
  ],
  imageFilter: function (url) {
    return /samsung\.com/i.test(url) && /\/gallery\//i.test(url);
  },
  // the same picture comes in many sizes: ask for the big one seen on the real site
  imageUpgrade: function (url) {
    return url.replace(/\?\$[A-Z0-9_]+\$$/i, '?$1164_776_PNG$');
  },
  imageKey: function (u) {
    return u.split('?')[0];
  },

  specContainerSelectors: [
    '#specs',
    '[id*="spec" i]',
    '[class*="spec-highlight" i], [class*="specs" i][class*="list" i]',
    '[class*="spec" i]',
  ],

  alwaysClick: [/^agrandir tout$/i, /^tout (ouvrir|agrandir|afficher)$/i, /^(voir|afficher) toutes les (sp[ée]cifications|caract[ée]ristiques)$/i],
  expandText: [/^voir plus$/i],

  productLinks: {
    sameSection: 2, // only products from the same family as the list page (not the menu)
    // product: /n_africa/<family>/<type>/<name-ending-with-model>/  (the last part has letters + numbers)
    test: function (path) {
      var segs = path.split('/').filter(Boolean);
      if (segs.length < 4) return false;
      if (/\/(support|business|apps|offer|offers|discover|explore|sustainability|buy|compare|smartthings|shop-faq|info|accessories)(\/|$)/i.test(path)) return false;
      var last = segs[segs.length - 1].toLowerCase();
      if (/^(all-|\d+-inch)/.test(last)) return false;
      // a model-like piece: letters AND numbers, at least 4 long (c450, ww70ta046ax1mf),
      // but not sizes like 4k, 120hz, 55inch, 10kg
      return last.split('-').some(function (p) {
        return p.length >= 4 && /[a-z]/.test(p) && /\d/.test(p) && !/^\d+(k|hz|inch|kg|l|w|cm|mm|gb|tb|ch|btu)$/.test(p);
      });
    },
    loadMore: /^(voir|afficher|charger)\s+plus( de produits)?$|^plus de produits$/i,
  },
});
