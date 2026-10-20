/*
  BOSCH RECIPE
  ------------
  Bosch Morocco = bosch-home.ma/fr   (sells online, prices in MAD like "6.999,00 MAD TTC")
    - Two kinds of category pages:
        /fr/category-page/...  = a "shop window" with only 4 products and a link
                                 "Voir tous les produits" -> we follow that link by ourselves
        /fr/category/...       = the full list ("Produits correspondants (10)")
    - Product page: /fr/product/<...>/<MODEL>      e.g. .../WGK244ZXME
      (sometimes with an empty part: /fr/product//KGN86AI32U)
    - Title ends with the model, sometimes followed by stars "0.0 (0)" (we remove them).
    - Pictures: media3.bsh-group.com/Product_Shots/..._def.webp
      Technical drawings ("Line_Drawings") and payment logos are skipped.
    - Specifications: "Caractéristiques" -> "Aperçu technique" + boxes that open:
      Général, Taille et poids, Confort, Programmes, Connectivité, Sécurité ...
  NOTE: written from the real pages' text; check 2-3 products the first time.
*/
GHANDI.register({
  id: 'bosch',
  brand: 'Bosch',
  match: ['bosch-home'],
  quickRead: false, // spec boxes are filled only when opened
  home: 'https://www.bosch-home.ma/fr', // the brand's Morocco website (button in the side tab)

  nameSelectors: ['main h1', 'h1', '[class*="product-title" i]'],

  priceFrom: ['dom', 'jsonld'],
  priceSelectors: [
    '[class*="price" i][class*="current" i]',
    '[class*="price" i][class*="sale" i]',
    '[class*="price" i][class*="final" i]',
    '[itemprop="price"]',
    '[data-testid*="price" i]',
    '[class*="price" i]',
  ],

  imagePriority: ['gallery', 'jsonld', 'nearName', 'meta'],
  imageSelectors: [
    'img[src*="bsh-group.com/Product_Shots"], img[data-src*="bsh-group.com/Product_Shots"], img[srcset*="bsh-group.com/Product_Shots"]',
    '[class*="gallery" i] img',
    '[class*="carousel" i] img[src*="bsh-group.com"]',
  ],
  imageFilter: function (url) {
    return !/Line_Drawings|Feature_Icons|\/Images\/\d+x\/|_logo|Visa|mastercard|Energy|EEK|Icon|supergraphic|_next\/static/i.test(url);
  },

  specContainerSelectors: [
    '#specifications',
    '[id*="specification" i]',
    '[class*="specification" i]',
    '[class*="technical" i]',
    '[class*="tech-info" i]',
  ],

  alwaysClick: [/^informations? techniques?$/i, /^caract[ée]ristiques techniques$/i, /^tout (ouvrir|afficher|d[ée]velopper)$/i],
  expandText: [/^voir toutes les (donn[ée]es|caract[ée]ristiques)/i, /^afficher plus$/i],

  // Bosch galleries also use pictures named after sister models or with no model at all:
  // do NOT keep only pictures that carry the model code.
  modelFilter: false,
  defaultGroupTitle: 'Caractéristiques',

  // The title is glued to the model and to the stars: "Bouilloire Acier inoxydableTWK72031.5 (2)".
  // The model is the last part of the web address: rebuild "name MODEL".
  custom: function (ctx) {
    var r = ctx.result;
    var m = String(r.url || '').split('?')[0].split('/').filter(Boolean).pop() || '';
    if (!m || !r.name) return;
    var i = r.name.toUpperCase().lastIndexOf(m.toUpperCase());
    if (i === -1) return;
    var j = i + m.length;
    while (j < r.name.length && /[A-Za-z0-9]/.test(r.name.charAt(j))) j++; // the address may cut the model short
    r.name = (r.name.slice(0, i).trim() + ' ' + r.name.slice(i, j)).replace(/\s+/g, ' ').trim();
  },

  productLinks: {
    pattern: [/\/product\/.*[a-z0-9]{6,}\/?$/i],
    exclude: [/\/(support|service|contact|blog|manuel|assistance|pieces|accessoires|checkout|cart)(\/|$)/i],
    loadMore: /^(charger|voir|afficher) plus( de produits)?$/i,
    fullListText: /^(voir|afficher) tous les produits$/i,
  },
});
