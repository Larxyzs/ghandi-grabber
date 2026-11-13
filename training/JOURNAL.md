# Training journal

What each session tried, learned and decided. Newest at the bottom.

## 2026-11-09 — Session 1: building the training environment

### How the tools work (as built)
- `find.py` runs the extension's own "Find products" on the category pages of `sites.json` → `tmp/found.json`;
  `find.py --pick N` adds new products to `corpus.jsonl`.
- `snapshot.py` saves each page with Playwright's Chromium (headed, real browser, ≥ the site's delay between pages):
  `raw.html.gz` (plain download = what quick read gets, its HTTP status is in `meta.json`), `rendered.html.gz`
  (after scrolling and opening tabs/accordions; scripts removed; hidden parts marked `display:none` because the CSS
  is not saved), the product's own JSON (`xhr/*.json.gz`), `gallery.json`, `spec.txt`, screenshots.
- `audit.py` + `audit_sites.py` build `expected/<id>.json` without the extension's code, from the site's own
  structured data first. `check.py` makes one picture sheet per site (`tmp/check-<site>-N.jpg`) and cross-checks
  every expected spec row with the page text; `check.py --verify` marks files verified.
- `evaluate.py` (live, polite, 1 worker) and `replay.py` (offline, local server under the real host names) drive the
  REAL extension with `add-links` + `start` and read `it:<id>`; `score.py` grades (README table).
- Replay limits: rendered pages have no scripts, so things that need clicks at reading time (TCL spec sub-tabs,
  sliders) only show what was open when the page was saved. Live runs cover those.

### What each site looks like (for the auditor)
| Site | Truth source | Notes |
|---|---|---|
| Candy / Haier | Gatsby `page-data.json` of the product (`result.data.babelProdotto`): `specifications[]` (category → children fieldName/fieldValue), `primaryimage` + `otherImages` (type "M" = big) | Model = spec "Référence commerciale" (the JSON `productName` can be an internal code: `HW100B14959S8U1U` vs shown `HW100-B14959S8U1`). Pictures `_n_` = technical drawing (left out). Same picture exists in other date folders and sizes (`640-` prefix) → compare by file name. Some rows (recycling/AGEC) are only in the JSON. |
| TCL | JSON fetched by the page: `.../product_spec.<base64>.json` → `data[].tab` + `specItems[]` | Specs are in sub-tabs (only one in the page at a time). Gallery = `.thumbsSlider img` (the big slider is a looping swiper with a clone first). Some products have English labels (the page shows them so). ACs are "series" pages without one model code. |
| Bosch | Next.js flight data (`self.__next_f.push`): groups `{name, key, specifications:[{name.text, value.text, unit}]}`; JSON-LD `additionalProperty` has the same list | Booleans are keys `specifications.translatedBoolean.yes/no` → Oui/Non. "Aperçu technique" box adds e.g. "Dimensions du produit avec poignée". Gallery `[data-testid=product-gallery-slider]`; sister-model file names are normal. |
| Electrobousfiha | PrestaShop `dl.data-sheet` (Fiche technique), `.product-reference`, `h1.productpage_title` | The short description puts "MARQUE : X" lines inside `<h1>` tags. Description prose is not specs (and sometimes contradicts the data sheet: 420 L vs 367 L). |
| Samsung | `#specs .pdd32-product-spec__item` (title + content-item title/desc), `[class*=sku]` | Gallery `.hdd02-gallery__item` (main slides; thumbnails have other file ids). Category grids come from a host this cloud session cannot reach → products picked from the public sitemap. |
| LG | (in progress) | Plain downloads are refused ("socket hang up") but real browser visits work. Category grids come from coveo.com. |
| Whirlpool | — | **Not in the corpus**: the site blocks automated visits from this cloud computer (Akamai "Access Denied" after the first page; plain downloads get 403). Not worked around. To train Whirlpool, run the training on the owner's PC. |

### Decisions about the truth (expected files)
- "Marque" is never a spec row (rule 5). Values that mean nothing ("Pas applicable", "N/A", "-") are not rows.
- Technical size drawings are not product pictures (owner's choice already in the Bosch/LG recipes) → left out
  everywhere they can be recognised (Bosch `Line_Drawings`, LG `MDI_`, Candy/Haier `_n_`). Shop galleries
  (Electrobousfiha) are kept as the shop shows them.
- Name: the same text; the model code or brand added around it does not change the name (Bosch recipe adds the model).
- Rows that exist only in the site's own JSON (not written on the page) are still the truth (owner: "the site's own
  JSON data").

### Real extension problems already seen (to fix in training)
1. **Candy, Haier, TCL: no model code at all** (15 pts × 44 products).
2. Candy: the same picture twice (other date folder) → duplicate.
3. Electrobousfiha: product name read as "MARQUE : BEKO" (`.product-information h1` matches the short description
   before `h1.productpage_title`).
4. Bosch: keeps "Pas applicable" rows.
5. **"Find products" is wrong on LG and Samsung lists**: it returns sub-category links, the "Très bien noté"
   strip and support links instead of the grid (seen live; LG grid needs coveo.com which loads late).
6. **Whirlpool**: quick read downloads the page without a browser → the site answers 403, and right after that
   the site blocks the reading window too ("Access Denied"). On the owner's PC this may also happen.

## 2026-11-13 — /train (owner cut it to 30 min)
- Start (replay, 102 products): **73.6**. LG scores ~10 in replay only: lg.com is HSTS-preloaded, so the reading
  window upgrades the local http copy to https, which the replay server does not serve → "no product". To fix in
  replay.py (local https server + `--ignore-certificate-errors`). Live runs are not affected.
- Iteration 1 (weakest spot = model code, 15 pts × 44 products): Candy/Haier `custom` now copies the
  "Référence commerciale" line into the model; TCL `model()` takes the address (`/tvs/85c8l` → 85C8L) or the page
  data when it names the exact model of a series page (`/tvs/c755` → 55C755, test kept); Candy/Haier `imageKey` = file
  name without size prefix / date folder / letter; Electrobousfiha title selector first; Bosch drops "Pas applicable".
  Replay 73.6 → **80.3**, no product lost points; `tests/run_all.py` green.
- Iteration 2 (Samsung pictures precision 4/10): the extension took the thumbnail strip too (`...-thumb-548262623`
  files = the same slides again). `samsung.js` imageFilter skips `-thumb-N`. score.py now decodes picture paths
  (`%E2%84%A2` = `™`). Samsung 88.9 → 98.0, total 80.3 → **83.6**, nothing lost, tests green.
