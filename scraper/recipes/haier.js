/*
  HAIER RECIPE
  ------------
  Haier Morocco = haier-europe.com/fr_MA/   (same website system as Candy)
    - Category page: /fr_MA/<category>/        e.g. /fr_MA/refrigerateurs-congelateurs/
      All products are on ONE page ("Afficher 6 De 6 Résultats"). No "Voir plus".
      The title glues "Série 3 PRO", the model and "A++": we keep spaces between them.
      (Buttons "Comparer", "Acheter maintenant" are never clicked.)
    - Product page: /fr_MA/<category>/<8-digit code>/<model>/
        e.g. /fr_MA/refrigerateurs/34005895/hdpr3618dnpkma/
    - NO price (only "Acheter maintenant" -> list of shops).
    - Pictures: /h-image/haier-product/... Each picture exists 3 times:
      tiny (w=85), medium ("640-..." w=640) and big (w=1000). We keep the BIG one.
      Marketing pictures ("families-and-triples") are skipped.
    - Specifications: label / value lines under titles:
      Caractéristiques principales, Programmes et fonctions, Esthetique,
      Performance, Dimensions ...  (the block is in the page twice: we remove doubles)

  Haier France (haier-europe.com/fr_FR) also works.
  NOTE: written from the real pages' text; check 2-3 products the first time.
*/
GHANDI.register({
  id: 'haier',
  brand: 'Haier',
  match: ['haier'],
  quickRead: { minSpecs: 6, minPictures: 2 },
  home: 'https://www.haier-europe.com/fr_MA/', // the brand's Morocco website (button in the side tab)

  // Morocco shows no price -> no warning, and do not pick up a random number
  noPrice: function (host, path) {
    return /\/fr_MA\//i.test(path) || /\.ma$/i.test(host);
  },

  nameSelectors: ['main h1', 'h1', '[class*="product__title" i]', '[class*="product-title" i]'],

  priceFrom: ['jsonld', 'dom'],
  priceSelectors: ['[class*="price-item--sale" i]', '[class*="price-item--regular" i]', '[itemprop="price"]', '[class*="price" i]'],

  imagePriority: ['gallery', 'jsonld', 'nearName', 'meta'],
  imageSelectors: [
    'img[src*="/h-image/haier-product/"], img[srcset*="/h-image/haier-product/"], img[data-src*="/h-image/haier-product/"]',
    'source[srcset*="/h-image/haier-product/"]',
    '[class*="product__media" i] img',
    'main img[src*="/cdn/shop/files/"], main img[data-src*="/cdn/shop/files/"]',
  ],
  imageFilter: function (url) {
    if (/families-and-triples|candy-triplet|haier-triplet|haier-lf\/|placeholder/i.test(url)) return false;
    return /\/h-image\/haier-product\/|\/files\//i.test(url);
  },
  // "640-1_3102...jpg" and "1_3102...jpg" are the same picture in two sizes
  imageKey: function (u) {
    try {
      var x = new URL(u);
      return x.host + x.pathname.replace(/\/\d{2,4}-([^/]+)$/, '/$1');
    } catch (e) {
      return u;
    }
  },

  specContainerSelectors: [
    '#caracteristiques-techniques',
    '[id*="technical-spec" i]',
    '[id*="caracteristiques" i]',
    '[class*="technical" i][class*="spec" i]',
    '[class*="TechnicalSpec" i]',
    'main table',
  ],

  alwaysClick: [
    /^caract[ée]ristiques( techniques)?$/i,
    /^environnement$/i,
    /^sp[ée]cifications( techniques)?$/i,
    /^donn[ée]es techniques$/i,
  ],

  // Keep only the pictures of THIS product: their file names contain the product's
  // 8-digit code (also in the web address). Pictures of "Produits similaires" are dropped.
  // The page prints the specification list twice (once with titles, once without)
  dedupeAcrossSections: true,

  custom: function (ctx) {
    var r = ctx.result;
    // The title glues family + model + energy class ("Fours ID Série 2H6 ID23B3HTBA++").
    // The spec line "Référence commerciale" / "Modèle" gives the model: put spaces around it.
    var ref = (r.specs || []).filter(function (x) {
      return /^(r[ée]f[ée]rence commerciale|mod[èe]le)$/i.test(x.label);
    })[0];
    if (ref && ref.value && r.name) {
      var m = ref.value.trim();
      var i = r.name.toUpperCase().indexOf(m.toUpperCase());
      if (i !== -1) r.name = (r.name.slice(0, i) + ' ' + r.name.slice(i, i + m.length) + ' ' + r.name.slice(i + m.length)).replace(/\s+/g, ' ').trim();
    }
    var m = String(r.url || '').match(/\/(\d{6,9})\//);
    if (!m) return;
    var code = m[1];
    var all = [r.mainImage].concat(r.otherImages || []).filter(Boolean);
    var mine = all.filter(function (u) {
      return u.indexOf(code) !== -1;
    });
    if (mine.length) {
      r.mainImage = mine[0];
      r.otherImages = mine.slice(1);
    }
  },

  productLinks: {
    pattern: [/\/\d{6,9}\/[a-z0-9][a-z0-9-]*(\/[a-z0-9-]+)?\/?$/i, /\/products\/\d+-/i], // .../33803220/havg6bf4hb/1/ too
    exclude: [/\/(support|blog|pages|cart|account|compare|where-to-find-us|trouvez-un-point-de-vente)(\/|$)/i],
    loadMore: /^(charger|voir|afficher) plus( de produits)?$/i,
  },
});
