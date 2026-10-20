/*
  LG RECIPE  (lg.com/ma, lg.com/fr ... all LG country sites)
  ---------
  What I learned about lg.com product pages:
    - The page title (h1) is a long text with "|" bars. The short model
      (for example GR-X257CSES) is in the web address and on a line above the title.
    - lg.com/ma (Morocco) shows NO PRICE. That is normal, not a bug.
    - The specifications live in a section with the id "pdp-specs-section".
      At first the page shows only about 6 key specs under
      "Caractéristiques principales". A link "Voir toutes les caractéristiques"
      opens the full list, split in sections written in capital letters
      (SPECIFICATIONS GENERALES, DIMENSIONS, PERFORMANCE ...). We always click it.
    - Slideshow pictures live in a "gallery" folder in their web address.
      There are big ones (DZ-01.jpg, ...Zoom01...) and small copies of the same
      pictures (S-01.jpg, ...mobile01..., _180x180). We keep only the big ones.
    - There is also a drawing with sizes (folder "spec", file MDI_...) and
      energy labels. We skip those.

  NOTE: written from the page description, not tested on the live site.
  If something is missing, use "Copy problem report" and send it to Claude.
*/
GHANDI.register({
  id: 'lg',
  brand: 'LG',
  match: ['lg.com'],
  quickRead: { minSpecs: 12, minPictures: 2 }, // the full list is often already in the page text; if not, a window is used
  home: 'https://www.lg.com/ma/', // the brand's Morocco website (button in the side tab)

  nameSelectors: [
    '[class*="pdp-info" i] h1',
    '[class*="model-name" i]',
    'h1',
  ],

  priceFrom: ['jsonld', 'dom'],
  priceSelectors: [
    '[class*="price" i] [class*="sale" i]',
    '[class*="price" i] [class*="current" i]',
    '[itemprop="price"]',
    '[class*="price" i]',
  ],

  imagePriority: ['gallery', 'jsonld', 'meta'],
  // every slideshow picture of an LG product lives in a ".../gallery/..." folder
  // (feature banners, awards and lifestyle photos of the page live elsewhere)
  slideshowPattern: /\/gallery\//i,
  imageSelectors: [
    // pictures whose web address contains "/gallery/"
    'img[src*="/gallery/"], img[data-src*="/gallery/"], img[srcset*="/gallery/"]',
    '[class*="gallery" i] img',
    '[class*="pdp-visual" i] img',
  ],
  // keep the BIG slideshow pictures. Each gallery exists twice: big (DZ-01, 1600x1062_1,
  // av-...-gallery-01, New_DZ1) and small "zoom" copies (S-01, S1, 350/S-01, New_S1) -> skip the small ones.
  imageFilter: function (url) {
    // the first slide is often a "rendition": New_DZ1.jpg/jcr:content/renditions/thum-1600x1062.jpeg -> judge New_DZ1.jpg
    url = String(url).replace(/\/jcr:content\/renditions\/[^?#]*/i, '');
    if (/[_-]m\d{1,2}_\d{6}\.(jpe?g|png|webp)/i.test(url)) return false; // mobile copy of a slide (_m1_020817.jpg = _z1_020817.jpg)
    if (/[_-]d\d{1,2}_\d{6}\.(jpe?g|png|webp)/i.test(url)) return false; // share picture copy (_d1_)
    if (/energy|eprel|[-_/]label|\/spec\/|MDI_|icon|badge|logo/i.test(url)) return false;
    if (/\/gallery\/(?:\d+\/)?S-?\d|\/gallery\/S-180|New_S\d|[_-]180x180|mobile\d*[-_.]|_thumb|thumbnail|thum-/i.test(url)) return false;
    // small "zoom strip" copies: ..._S1.jpg, ...-S-02.jpg (the big ones are ..._DZ1.jpg)
    if (/[_-]S-?\d{1,2}\.(jpe?g|png|webp|avif)(\?|$)/i.test(url)) return false;
    if (/basic--?450|[-_/]450\.(jpe?g|png)|medium\d+\.|\/null(\?|$)/i.test(url)) return false;
    // the small share copy (".../gallery/450/...-gallery-large.jpg") and the thumbnail folder (".../gallery/350/...")
    if (/\/gallery\/(450|350|180)\/|-gallery-large\.|gallery-thumbnail/i.test(url)) return false;
    return true;
  },

  // the full-size picture: no rendition, no "?w=800"
  imageUpgrade: function (url) {
    try {
      var u = new URL(String(url).replace(/\/jcr:content\/renditions\/[^?#]*/i, ''));
      u.searchParams.delete('w');
      u.searchParams.delete('h');
      return u.href;
    } catch (e) {
      return url;
    }
  },

  // "Caractéristiques principales" is mostly a short copy of lines from the full list
  // (sometimes written "CARACTÉRISTIQUES GÉNÉRALES - Capacité ..."). Lines already in the
  // full list are removed from it; lines found nowhere else stay.
  custom: function (ctx) {
    var r = ctx.result;
    var g = r.specGroups || [];
    var at = -1;
    g.forEach(function (x, i) {
      if (at === -1 && /^(caract[ée]ristiques principales|key spec)/i.test(x.title || '')) at = i;
    });
    if (at === -1 || g.length < 2) return;
    var key = function (l, v) {
      return (String(l).replace(/^[^a-z]*[A-ZÀ-Ý][A-ZÀ-Ý '’&()\/-]{3,}\s+-\s+/, '') + '|' + v).toLowerCase();
    };
    var elsewhere = {};
    g.forEach(function (x, i) {
      if (i !== at)
        x.rows.forEach(function (row) {
          elsewhere[key(row.label, row.value)] = 1;
        });
    });
    g[at].rows = g[at].rows.filter(function (row) {
      return !elsewhere[key(row.label, row.value)];
    });
    if (!g[at].rows.length) g.splice(at, 1);
    var seen = {};
    r.specs = [];
    g.forEach(function (x) {
      x.rows.forEach(function (row) {
        var k = (row.label + '|' + row.value).toLowerCase();
        if (!seen[k]) {
          seen[k] = 1;
          r.specs.push(row);
        }
      });
    });
  },

  // LG Morocco / France show no price (never pick up a random number)
  expectPrice: false,
  noPrice: function (host, path) {
    return /^\/(ma|fr|dz|tn|africa)\//i.test(path);
  },

  specContainerSelectors: ['#pdp-specs-section', '[class*="all-spec" i]', '[class*="spec-wrap" i]', '[class*="specs-wrap" i]'],

  // ALWAYS click these (even if some specs are already visible)
  alwaysClick: [/^voir (toutes )?(les )?caract[ée]ristiques/i, /^(tout|toutes les) (voir|afficher)/i],
  expandText: [/^voir (toutes )?(les )?sp[ée]cifications/i],

  // ---- category / list pages ----
  // product pages:  /ma/lave-vaisselle/dfb512fp/            (3 parts)
  //                 /ma/tv-barres-de-son/oled/oled55b56la/  (4 parts)
  // The last part is a MODEL CODE (letters + numbers). Category parts like "uhd-4k-tvs"
  // or "32-inch-and-smaller" are not models.
  productLinks: {
    sameSection: 2, // only products from the same family as the list page (not the menu)
    test: function (path) {
      var segs = path.split('/').filter(Boolean);
      if (segs.length < 3) return false;
      if (/\/(support|business|about|a-propos-de-lg|careers|promotions?|inspiration|accessoires?|accessories|presse-et-medias)(\/|$)/i.test(path)) return false;
      var last = segs[segs.length - 1].toLowerCase();
      if (/^(tous|toutes|all-|tv-by|by-)/.test(last)) return false;
      return last.split('-').some(function (p) {
        return /[a-z]/.test(p) && /\d/.test(p) && !/^\d+k$/.test(p) && !/^\d+(inch|inches|pouces?|po|hz)$/.test(p);
      });
    },
    loadMore: /^(voir|afficher|charger)\s+plus|^plus de produits/i,
  },
});
