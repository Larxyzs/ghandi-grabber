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
