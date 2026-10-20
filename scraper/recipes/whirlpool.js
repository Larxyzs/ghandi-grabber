/*
  WHIRLPOOL RECIPE
  ----------------
  Whirlpool has DIFFERENT website types in different countries:

    whirlpool.ma  (Morocco)  -> built like the Beko sites. Seen with a real problem report:
         - slideshow pictures:  <img id="product-info-image-1"> , "-2", "-3" ...
         - specifications:      rows with class "PropertyTable__row",
                                each row has 2 "PropertyTable__column" boxes
                                (label on the left, value on the right).
                                A green tick instead of text means "Oui".
         - NO price on the page.

    whirlpool.fr  (France)   -> a shop built on a system called VTEX.
         (these names are a good guess, not confirmed yet)

  This recipe knows both. Every list below is read from TOP to BOTTOM.
  The first one that works wins.
*/
GHANDI.register({
  id: 'whirlpool',
  brand: 'Whirlpool',

  // If ANY of these words appear in the website address, this recipe is used.
  match: ['whirlpool'],
  quickRead: { minSpecs: 4, minPictures: 2 }, // read without a window when the page text has everything
  home: 'https://www.whirlpool.ma/ma-fr', // the brand's Morocco website (button in the side tab)

  // The Morocco site shows no prices. Everywhere else we still expect one.
  expectPrice: function (hostname) {
    return !/\.ma$/i.test(hostname);
  },
  // a spec line with a name but no value means "this product has it"
  emptyValueAs: 'Oui',
  noPrice: function (hostname) {
    return /\.ma$/i.test(hostname); // "Ce produit n'est pas disponible chez les vendeurs en ligne"
  },

  // ---------- PRODUCT NAME ----------
  nameSelectors: [
    'h1[class*="ProductInfo__title"]',
    '[class*="productNameContainer"]',
    '[class*="productName" i]',
    'h1',
  ],

  // ---------- PRICE ----------
  priceFrom: ['dom', 'jsonld'],
  priceSelectors: [
    '[class*="ProductInfo__price" i]',
    '[class*="sellingPriceValue"]',
    '[class*="sellingPrice"]',
    '[class*="currencyContainer"]',
    '[itemprop="price"]',
  ],

  // ---------- PICTURES ----------
  //   'gallery'  = the pictures in the slideshow (our selectors below)
  //   'jsonld'   = the hidden data card
  //   'nearName' = smart guess: pictures sitting next to the product name
  //   'meta'     = the single "share" picture (last resort)
  imagePriority: ['gallery', 'jsonld', 'nearName', 'meta'],

  imageSelectors: [
    // whirlpool.ma
    'img[id^="product-info-image-"]',
    '[class*="ProductInfo__imagesInner"] img',
    '[class*="ProductInfo__views"] img',
    // whirlpool.fr (VTEX)
    '[class*="productImagesGallery"] img, [class*="productImagesThumb"] img, [class*="carouselGaleryThumbs"] img',
    '[class*="productImageTag"]',
    '[class*="productImages"] img',
    '[class*="gallery" i] img',
  ],

  // skip energy labels / rating labels / badges that sit in the same folders
  imageFilter: function (url) {
    return !/RATING-LABEL|ENERGY|EPREL|energy-?class|badge/i.test(url);
  },

  // VTEX gives small pictures by default (like "-500-auto" in the address).
  // This asks for the full-size picture instead. (No effect on whirlpool.ma.)
  // If pictures ever look broken, change `true` to `false`.
  imageUpgrade: function (url) {
    var WANT_BIG_PICTURES = true;
    if (!WANT_BIG_PICTURES) return url;
    try {
      var u = new URL(url);
      u.pathname = u.pathname.replace(/(\/arquivos\/ids\/\d+)-\d+-(?:\d+|auto)/, '$1');
      ['width', 'height', 'aspect'].forEach(function (p) {
        u.searchParams.delete(p);
      });
      return u.href;
    } catch (e) {
      return url;
    }
  },

  // ---------- SPECIFICATIONS TABLE ----------
  // Where the specification rows live. All matching boxes are merged.
  specContainerSelectors: [
    '[class*="PropertyTable__root"]', // whirlpool.ma
    '[class*="tech__spec"]', // whirlpool.ma (the big box around them)
    '[class*="specificationsTable"]', // whirlpool.fr
    '[class*="productSpecifications" i]',
    '[class*="ProductSpecification" i]',
  ],

  // How to read ONE row: the row box, the label box, the value box.
  // (Used first. If it finds nothing, the brain tries table / list / guessing.)
  specRowSelector: '[class*="PropertyTable__row"]',
  specLabelSelector: '[class*="PropertyTable__column"]:nth-child(1)',
  specValueSelector: '[class*="PropertyTable__column"]:nth-child(2)',

  // The page has boxes that open with a "+" : Caractéristiques principales,
  // Performances et consommation, Volume brut et net, Conception, Dimensions et poids...
  // The brain opens every closed box by itself. These words are a second way to
  // make sure the boxes are opened (titles differ a little for each product type).
  alwaysClick: [
    /^(caract[ée]ristiques principales|performances( et consommation)?|volume( brut)?( et net)?|conception|dimensions( et poids)?|caract[ée]ristiques du (r[ée]frig[ée]rateur|cong[ée]lateur)|programmes?|fonctions?( et options)?|s[ée]curit[ée]|connectivit[ée])$/i,
  ],

  // Words on buttons/tabs that we should CLICK to open a hidden table.
  expandText: [
    /^voir (toutes )?(les )?caract[ée]ristiques/i,
    /^afficher (plus|tout)/i,
    /^voir plus/i,
  ],

  // ---- category / list pages: how to spot a product link ----
  // whirlpool.fr (VTEX): product addresses end in /p
  // whirlpool.ma: /ma-fr/produits/<category>/<name-with-model>
  // whirlpool.ma also still has OLDER pages (air conditioners live there):
  //   product   /w/climatisation-whirlpool-spicr-312w1/859991663390   (name + 12-digit code)
  //   category  /produits/air-conditionne/air-conditionne--split--ab12   ("--ab12", "--cc02": a category code, not a product)
  productLinks: {
    sameSection: 3, // only products from the same category as the list page
    pattern: [/\/p\/?$/i, /\/produits\/[^/]+\/[^/]*\d[^/]*\/?$/i, /\/w\/[^/]+\/\d{9,14}\/?$/i],
    exclude: [/\/(support|service|contact|blog|manuel|assistance|pieces|accessoires)(\/|$)/i, /--[a-z]{2}\d{2}([a-z]{2}\d{2})*\/?$/i],
    loadMore: /^(charger|voir|afficher)\s+plus/i,
  },
});
