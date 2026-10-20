/*
  NEW BRAND TEMPLATE  (this file is NOT used by the extension — it is a copy-me file)

  How to use it:
    1. Make a copy of this file.
    2. Rename the copy to the brand name, for example:  lg.js
    3. Fill in the parts marked  <<< CHANGE ME
    4. Add the file name to recipe-list.js
    5. Go to chrome://extensions and click the little round arrow on the extension.

  Every list is read from TOP to BOTTOM. The first one that works wins.
  You can leave a list empty ( [] ) — the brain will then use smart guessing.
*/
GHANDI.register({
  id: 'brandname', // <<< CHANGE ME  (same as file name, no spaces)
  brand: 'Brand Name', // <<< CHANGE ME  (shown in the "Brand recipe" menu)

  // Words that appear in the website address of this brand.
  match: ['brandname'], // <<< CHANGE ME  (example: 'lg.com')

  nameSelectors: ['h1'],

  priceFrom: ['dom', 'jsonld'],
  priceSelectors: [
    // '.price .current',
  ],

  imagePriority: ['gallery', 'jsonld', 'meta'],
  imageSelectors: [
    // '.product-gallery img',
  ],

  specContainerSelectors: [
    // '.specifications-table',
  ],

  // Words on buttons/tabs to click so the hidden table opens.
  expandText: [
    // /^voir les caract[ée]ristiques/i,
  ],

  // ---- category / list pages (optional but useful for "find all products") ----
  // Tell the helper what a PRODUCT link looks like. Use ONE or MORE of these:
  //   pattern:          [/regex on the address/]       e.g. [/\/products\/\d+-/]
  //   lastSegmentRegex: /regex/ on the LAST part of the address   e.g. /\d/ (has a number)
  //   minSegments:      how many "/parts" a product address has at least
  //   exclude:          [/addresses to ignore/]
  //   loadMore:         /text of the "show more" button/i
  productLinks: {
    lastSegmentRegex: /\d/,
    minSegments: 3,
  },
});
