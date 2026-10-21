/*
  LG RECIPE  (lg.com/ma, lg.com/fr ... all LG country sites)
  ---------
  What I learned about lg.com product pages:
    - The page title (h1) is a long text with "|" bars. The short model
      (for example GR-X257CSES) is in the web address and on a line above the title.
    - lg.com/ma (Morocco) shows a price on many products since 2026 (6.399,00DH, with the old
      price crossed out and "Économiser 200,00DH" next to it). The price is added by the page
      after it opens, so for lg.com/ma the quick read is not enough: a small window reads it.
    - The specifications live in a section with the id "pdp-specs-section".
      At first the page shows only about 6 key specs under
      "Caractéristiques principales". A link "Voir toutes les caractéristiques"
      opens the full list, split in sections written in capital letters
      (SPECIFICATIONS GENERALES, DIMENSIONS, PERFORMANCE ...). We always click it.
    - Slideshow pictures live in a "gallery" folder in their web address (2025 pages: "gallery-",
      once in ".../gallery-/1044/" and once in ".../gallery-/" — the same pictures twice).
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
  // the full list is often already in the page text; if not, a window is used.
  // lg.com/ma: the price only appears in a real window -> no quick read there
  quickRead: {
    minSpecs: 12,
    minPictures: 2,
    needPrice: function (host, path) {
      return /^\/ma\//i.test(path);
    },
  },
  home: 'https://www.lg.com/ma/', // the brand's Morocco website (button in the side tab)

  nameSelectors: [
    '[class*="pdp-info" i] h1',
    '[class*="model-name" i]',
    'h1',
  ],

  priceFrom: ['jsonld', 'dom'],
  // the price to pay (never the crossed-out old price or "Économiser 200,00DH": those are skipped)
  priceSelectors: [
    '[class*="purchase-price" i]',
    '[class*="price" i] [class*="sale" i]',
    '[class*="price" i] [class*="current" i]',
    '[class*="price" i] [class*="now" i]',
    '[itemprop="price"]',
    '[class*="price" i]',
  ],

  imagePriority: ['gallery', 'jsonld', 'meta'],
  // every slideshow picture of an LG product lives in a ".../gallery/..." folder
  // (feature banners, awards and lifestyle photos of the page live elsewhere)
  // (2025 pages: ".../gallery-/1044/..." and ".../gallery-/...")
  slideshowPattern: /\/gallery(?:-[a-z0-9]*)?\//i,
  imageSelectors: [
    // pictures whose web address contains "/gallery/" (or "/gallery-/")
    'img[src*="/gallery/"], img[data-src*="/gallery/"], img[srcset*="/gallery/"], img[src*="/gallery-"], img[data-src*="/gallery-"], img[data-lazy*="/gallery"]',
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
    // energy labels and drawings (a slide ABOUT saving energy, "...-gallery-enhanced-energy-efficiency-10...", is kept)
    if (/eprel|energy[-_ ]?(label|class|grade|sheet|fiche)|\/energy\/|[-_]energy\.(jpe?g|png)|[-_/]label|\/spec\/|MDI_|icon|badge|logo/i.test(url)) return false;
    if (/\/gallery\/(?:\d+\/)?S-?\d|\/gallery\/S-180|New_S\d|[_-]180x180|mobile\d*[-_.]|_thumb|thumbnail|thum-/i.test(url)) return false;
    // small "zoom strip" copies: ..._S1.jpg, ...-S-02.jpg (the big ones are ..._DZ1.jpg)
    if (/[_-]S-?\d{1,2}\.(jpe?g|png|webp|avif)(\?|$)/i.test(url)) return false;
    if (/basic--?450|[-_/]450\.(jpe?g|png)|medium\d+\.|\/null(\?|$)/i.test(url)) return false;
    // the small share copy (".../gallery/450/...-gallery-large.jpg") and the thumbnail folder (".../gallery/350/...")
    if (/\/gallery\/(450|350|180)\/|-gallery-large\.|gallery-thumbnail/i.test(url)) return false;
    return true;
  },

  // the same slide twice (".../gallery-/1044/x.jpg" and ".../gallery-/x.jpg") = one picture
  imageKey: function (url) {
    var u = String(url).split('#')[0].split('?')[0].replace(/\/jcr:content\/renditions\/.*$/i, '').toLowerCase();
    var m = /^(.*?\/gallery(?:-[a-z0-9]*)?\/)(?:[^/]+\/)*([^/]+)$/i.exec(u.replace(/^https?:\/\//, ''));
    return m ? m[1] + m[2] : u.replace(/^https?:\/\//, '');
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
  // (written "CAPACITÉ - Total du volume  333"). Lines already in the full list are removed from it;
  // lines found nowhere else stay. (The short copy may also come without a title.)
  custom: function (ctx) {
    var r = ctx.result;
    var g = r.specGroups || [];
    if (g.length < 2) return;
    var PREFIX = /^[^a-z]*[A-ZÀ-Ý][A-ZÀ-Ý '’&()\/-]{3,}\s+-\s+/;
    var key = function (l, v) {
      return (String(l).replace(PREFIX, '') + '|' + v).toLowerCase();
    };
    // the short copy: the first section called "Caractéristiques principales" (the full list may have
    // its own "CARACTÉRISTIQUES PRINCIPALES" section later: that one is real), or a section without
    // a title whose lines start with "SECTION - "
    var titled = -1;
    g.forEach(function (x, i) {
      if (titled === -1 && /^(caract[ée]ristiques principales|key spec)/i.test(x.title || '')) titled = i;
    });
    var isShortAt = function (x, i) {
      if (i === titled) return true;
      var pre = x.rows.filter(function (row) {
        return PREFIX.test(row.label);
      }).length;
      return !x.title && x.rows.length > 0 && pre >= x.rows.length / 2;
    };
    var shortOnes = g.filter(isShortAt);
    if (!shortOnes.length || shortOnes.length === g.length) return;
    var elsewhere = {};
    g.forEach(function (x, i) {
      if (!isShortAt(x, i))
        x.rows.forEach(function (row) {
          elsewhere[key(row.label, row.value)] = 1;
        });
    });
    shortOnes.forEach(function (x) {
      x.rows = x.rows.filter(function (row) {
        return !elsewhere[key(row.label, row.value)];
      });
    });
    for (var i = g.length - 1; i >= 0; i--) if (!g[i].rows.length) g.splice(i, 1);
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

  // lg.com/ma: the price arrives from LG's shop a moment after the page opens
  waitForPrice: function (host, path) {
    return /^\/ma\//i.test(path) ? 1500 : 0;
  },
  // not every product has a price (some are only "Se renseigner pour acheter"): no warning when missing.
  // LG Algeria / Tunisia / Africa show no price (never pick up a random number)
  expectPrice: false,
  noPrice: function (host, path) {
    return /^\/(dz|tn|africa)\//i.test(path);
  },

  specContainerSelectors: ['#pdp-specs-section', '[class*="tech-spacs" i]', '[class*="all-spec" i]', '[class*="spec-wrap" i]', '[class*="specs-wrap" i]'],
  // where the specifications start when none of the boxes above is on the page. The full list may also
  // open in a pop-up far from them: its own section titles (CAPACITÉ, DIMENSIONS ET POIDS...) lead to it
  specHeadings: [
    /^caract[ée]ristiques principales$/i,
    /^(voir )?toutes les caract[ée]ristiques$/i,
    /^sp[ée]cifications( techniques| de base| g[ée]n[ée]rales| communes)?$/i,
    /^(dimensions( et poids)?|capacit[ée]|caract[ée]ristiques g[ée]n[ée]rales|performances?|fonctions)$/i,
  ],
  // label and value often sit several boxes deep (<li><div><p>Volume</p></div><div><p>113</p></div></li>)
  textRows: 'compare',
  // the full list is cut in sections by titles in capital letters (CAPACITÉ, DIMENSIONS ET POIDS...)
  splitUnderHeading: true,

  // ALWAYS click these (even if some specs are already visible)
  alwaysClick: [/^voir (toutes )?(les )?caract[ée]ristiques/i, /^(tout|toutes les) (voir|afficher)/i],
  // the full list can take a moment to arrive after that click: wait up to 3 s while only the short list is there
  alwaysClickWait: 3000,
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
