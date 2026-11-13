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
    // a series page (/washing-machine/f6-series): the product header names the model shown (F606FLW)
    if (!slug && ownCode && ctx.looksLikeModel(ownCode) && /^[A-Z0-9][A-Z0-9\/-]{3,20}$/i.test(ownCode)) return ownCode.toUpperCase();
    return slug;
  },
  defaultGroupTitle: 'Spécifications',

  nameSelectors: ['main h1', 'h1', '[class*="product-name" i]', '[class*="productName" i]'],
  // air conditioners: "THE ELITE SERIES" / "Free Standing" alone say nothing -> "Climatiseur TCL THE ELITE SERIES"
  custom: async function (ctx) {
    var r = ctx.result;
    // SPECIFICATIONS: the page shows one tab at a time (FEATURES / TECHNICAL SPECIFICATION / PHYSICAL
    // PARAMETER / PROGRAM) but downloads them all in one ".../product_spec.<code>.json" file: read that file.
    try {
      var specUrl = '';
      (performance.getEntriesByType('resource') || []).forEach(function (e) {
        if (!specUrl && /\/product_spec\.[^/]*\.json/i.test(e.name)) specUrl = e.name;
      });
      if (!specUrl) {
        var el = ctx.util.qa('[data-url*="product_spec"], [data-api*="product_spec"], [data-spec-url]')[0];
        var a = el && (el.getAttribute('data-url') || el.getAttribute('data-api') || el.getAttribute('data-spec-url'));
        if (a) specUrl = ctx.util.absUrl(a);
      }
      if (specUrl) {
        var res = await fetch(specUrl, { credentials: 'same-origin' });
        var json = res.ok ? await res.json() : null;
        var tabs = json && Array.isArray(json.data) ? json.data : [];
        var groups = tabs
          .map(function (t) {
            return {
              title: ctx.util.clean(t.tab || ''),
              rows: (t.specItems || [])
                .map(function (x) {
                  var v = ctx.util.clean(x.value == null ? '' : String(x.value));
                  if (/^[√✓✔]$/.test(v)) v = 'Oui';
                  if (/^[×✗✘-]$/.test(v)) v = 'Non';
                  return { label: ctx.util.clean(x.name || ''), value: v };
                })
                .filter(function (x) { return x.label && x.value; }),
            };
          })
          .filter(function (g) { return g.rows.length; });
        var n = groups.reduce(function (k, g) { return k + g.rows.length; }, 0);
        if (n > (r.specs || []).length) {
          r.specGroups = groups;
          r.specs = [].concat.apply([], groups.map(function (g) { return g.rows; }));
          r.warnings = (r.warnings || []).filter(function (w) { return !/specification/i.test(w); });
          r.debug.specsFrom = 'tcl product_spec json (' + n + ')';
        }
      }
    } catch (e) {
      r.debug.tclSpecJson = String(e && e.message);
    }
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
