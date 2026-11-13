/*
  TCL RECIPE
  ----------
  TCL Morocco = tcl.com/ma/fr
    - Category pages: /ma/fr/tvs , /ma/fr/air-conditioners , /ma/fr/refrigerators ,
      /ma/fr/washing-machine ...   All products on ONE page (no "Voir plus").
    - Product page: /ma/fr/<category>/<model>     e.g. /ma/fr/tvs/c745
    - Tabs: CARACTÉRISTIQUES, SPÉCIFICATIONS, TÉLÉCHARGER, À DÉCOUVRIR.
      The specs only appear after clicking "SPÉCIFICATIONS" -> we always click it.
    - Pictures load late (only when you scroll) from aws-obg-image-lb-N.tcl.com
      or static-obg.tcl.com. The "share" picture and the logo are skipped.
    - NO price on TCL's site.
    - Each block is in the page twice (computer + phone version): doubles are removed.
  NOTE: written from the real pages' text; check 2-3 products the first time.
*/
GHANDI.register({
  id: 'tcl',
  brand: 'TCL',
  match: ['tcl.com'],
  quickRead: false, // specs and pictures are added by the page's scripts
  home: 'https://www.tcl.com/ma/fr', // the brand's Morocco website (button in the side tab)

  noPrice: true,
  // MODEL CODE: the address ends with it (/ma/fr/tvs/85c8l -> 85C8L). Series pages (air conditioners:
  // /air-conditioners/freshin-3-0) have no single model: then nothing is invented.
  model: function (ctx) {
    // air conditioner pages (series): the product's own header names its model ("TAC-09CHSA/XA73I THE ELITE SERIES")
    var own = ctx.qa('.relation .head .machine-model, .relation .machine-model')[0];
    var ownCode = own ? ctx.clean(own.textContent) : '';
    if (/^TAC-[A-Z0-9][A-Z0-9\/-]{4,}$/i.test(ownCode)) return ownCode;
    var last = (String(ctx.url).split('?')[0].split('/').filter(Boolean).pop() || '').toLowerCase();
    var slug = /^[a-z0-9]{4,16}$/.test(last) && /[a-z]/.test(last) && /\d/.test(last) ? last.toUpperCase() : '';
    var ld = ctx.jsonld && ctx.jsonld.model;
    if (ld && ctx.looksLikeModel(ld)) {
      // a series page (/tvs/c755) whose data names the exact model (55C755): take it
      if (slug && String(ld).toUpperCase().replace(/[^A-Z0-9]/g, '').indexOf(slug) !== -1) return ld;
      return ''; // a code of another product: trust nothing here
    }
    return slug;
  },
  defaultGroupTitle: 'Spécifications',

  nameSelectors: ['main h1', 'h1', '[class*="product-name" i]', '[class*="productName" i]'],
  // air conditioners: "THE ELITE SERIES" / "Free Standing" alone say nothing -> "Climatiseur TCL THE ELITE SERIES"
  custom: function (ctx) {
    var r = ctx.result;
    if (!/\/air-conditioners\//i.test(String(r.url || location.pathname)) || !r.name) return;
    var name = r.name.replace(/\s*\|\s*[A-Z0-9]+$/, '').trim();
    if (!/climati/i.test(name)) name = 'Climatiseur ' + (/\bTCL\b/i.test(name) ? name : 'TCL ' + name);
    else if (!/\bTCL\b/i.test(name)) name = name.replace(/(climatiseurs?)/i, '$1 TCL');
    r.name = name;
  },

  imagePriority: ['gallery', 'nearName', 'jsonld', 'meta'],
  imageSelectors: [
    '[class*="gallery" i] img',
    '[class*="swiper" i] img[src*="/content/dam/"], [class*="swiper" i] img[data-src*="/content/dam/"]',
    '[class*="product-detail" i] img',
    '[class*="kv" i] img, [class*="banner" i][class*="product" i] img',
  ],
  imageFilter: function (url) {
    if (/it-resources|navigation|logo|energy|label|icon|share\.(jpe?g|png)/i.test(url)) return false;
    return /tcl\.com/i.test(url);
  },

  specContainerSelectors: [
    '[class*="specification" i] table',
    '[class*="spec" i] table',
    '[class*="specification" i]',
    '[class*="spec-" i]',
  ],

  // Open the SPÉCIFICATIONS tab (it is a plain list item, not a link).
  alwaysClick: [/^sp[ée]cifications?$/i],
  expandText: [/^voir (toutes )?(les )?sp[ée]cifications/i, /^voir plus$/i, /^afficher plus$/i],

  productLinks: {
    sameSection: 3, // only products from the same category as the list page
    pattern: [/^\/[a-z]{2}(?:\/[a-z]{2})?\/(tvs?|air-conditioners?|refrigerators?|washing-machines?|monitors?|soundbars?|audio|projectors?|home-appliances?|smartphones?|tablets?|dishwashers?|dryers?|freezers?)\/[a-z0-9][a-z0-9-]*\/?$/i],
    exclude: [/\/(support|news|about|blog|service|where-to-buy|compare)(\/|$)/i],
    loadMore: /^(voir|afficher|charger)\s+plus|^plus de produits$/i,
  },
});
