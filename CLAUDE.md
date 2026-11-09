# Ghandi Product Grabber: project notes for Claude Code

Read this whole file before doing anything. It is the memory of months of work.

## Who this is for
- Owner: Ghandi Home Electro, an appliance shop in Casablanca (41 Boulevard Ghandi), site **ghandihomeelectro.com**
  (Lovable: TanStack Start + React + Supabase, separate repo `Larxyzs/ghandi-electro-showcase`).
- The owner is **not a developer**. Talk to him in short, simple English (he sometimes writes French: answer in
  French then). No jargon, no walls of text, no "are you sure?" dialogs in the product. He hates confirmations,
  extra clicks and things that are slow. Concrete tables and screenshots beat explanations.
- This repo is a **Chrome extension (Manifest V3)** that reads product pages on brand/shop websites and sends
  clean products (name, model code, brand, pictures, specifications in Electroplanet style) to his site.

## How the extension reaches the owner (IMPORTANT)
- The owner loaded the extension once from a folder on his PC. It **updates itself from this GitHub repo**:
  `updater/updater.js` reads `https://raw.githubusercontent.com/Larxyzs/ghandi-grabber/main/version.json`
  every 30 seconds; when the version is higher, the side tab shows "Install update" and he clicks it.
- So: **pushing code to `main` changes nothing for him until `version.json` is regenerated**. Release steps are in
  `RELEASING.md` (`tools/release.py`). `tests/`, `training/`, `.claude/`, `docs/`, `CLAUDE.md` are never shipped.
- Never release with a failing test. Bump `manifest.json` version, commit, `python tools/release.py <sha> "note"`,
  commit `version.json`, push. Release notes are read by the owner: 1–2 plain sentences.
- Never add a new permission to `manifest.json` without warning (Chrome may disable the extension).
- Never rename/delete files or folders whose name starts with `_` or `.` inside shipped folders (Chrome refuses
  to load an extension with a file starting with `_` except `_locales`).

## Map of the code (≈10k lines)
| File | What it does |
|---|---|
| `manifest.json` | MV3, side panel `app/app.html`, background service worker, offscreen doc, permissions (sidePanel, offscreen, alarms, contextMenus, notifications, declarativeNetRequest, webNavigation, scripting, storage), host `<all_urls>`. |
| `background.js` | The worker. Queue of products, N workers, **quick read** (download page, parse in offscreen DOMParser) with fallback to a **reading window** (reusable popup "slots", optional "light load" DNR rules that block images/fonts/trackers), retry once, link finder (`crawlList`), type detection + sheet building (`applySheet`), X-ray/problem report, messages from the side tab (`add-links, crawl, crawl-tab, grab-tab, start, retry, stop, edit-item, set-category, mark-exported, mark-sent, remove, clear-all, set-type, xray, edit-sheet, check-update, open-app`), update alarm (30 s). Storage keys: `settings, ids, it:<id>, run, crawl, update, justUpdated, siteSections`. |
| `offscreen/offscreen.js` | Quick read: runs the scraper on a downloaded page; `judge()` decides if the quick result is good enough or a window is needed (per-recipe `quickRead: {minSpecs, minPictures, needPrice, okWarnings}`). Also quick list read (rejects filtered addresses, more links than the page says, etc.). |
| `scraper/core.js` | The brain (2k lines): name, price (currently OFF: `PRICES_ON=false`), model code (`readModel`), pictures (gallery detection, slideshow order `inSlideOrder`, loop-clone removal, size upgrade, de-dupe by `imageKey`, other-products boxes excluded), specs (tables, dl, li, deep label/value pairs, headings → groups, clicks on tabs/accordions/"voir plus"), X-ray, `forDocument()` for quick read. |
| `scraper/links.js` | "Find products" on category pages: product link rules per recipe, hidden links skipped (closed menus, filtered-out cards), "N Résultats" box trimming, load-more clicking, next page, expected count. |
| `scraper/recipes/*.js` | One recipe per site: `whirlpool` (whirlpool.ma, Beko AEM platform), `lg` (lg.com/ma), `candy` (candy-home.com/fr_MA), `tcl` (tcl.com/ma/fr), `samsung` (samsung.com/n_africa), `haier` (haier-europe.com/fr_MA), `bosch` (bosch-home.ma), `electrobousfiha` (a **shop**: PrestaShop, brand read per product). Options are documented in `_template.js` and in each file. Recipe list: `recipe-list.js`. |
| `sheets/engine.js` + `sheets/templates.js` | Turns brand spec rows into **Electroplanet-style sheets** per type: fridge, ac, washer, tv, hob, oven, microwave, sink, fan, dishwasher. Type auto-detected or chosen by the owner. Output `specGroups` (clean) + `brandSpecGroups` (original). |
| `app/app.html/.css/.js` | The side panel UI (1.6k lines JS). Tabs "Product links" / "Find products", product list (select all, search, statuses), product editor (pictures, specs, type, sheet/brand toggle), type dialog, problem report dialog, **send to site** dialog (section box auto-focused, Enter sends and closes, sent products leave the list, section guessed from type: `TYPE_SECTION`, `fridgeSections`), site connection, update banner. |
| `updater/updater.js` | Self-update with File System Access (folder handle in IndexedDB), sha256 check, backup + undo. |
| `tools/release.py` | Writes `version.json`. |
| `tests/` | `run_all.py` runs everything (see below). |

## Hard rules (the owner asked for these, do not undo them)
1. **No prices.** The extension never reads or sends prices (`PRICES_ON=false` in core.js, price column hidden,
   `productOf` sends `price:'' priceValue:null`). Prices are typed by the owner's father on the site ("Prix & stock").
2. **Model code is very important** (e.g. Samsung `RB34C600ES9/MA`, LG `GR-B499NQLM`). Never lose it.
3. **Brand** must be the real brand of the product (for shops like Electrobousfiha it is read on each page).
4. Pictures: only the product's own slideshow, main picture first, biggest size, no duplicates, no "recommended
   products", no logos/badges/banners. AC/fan pages: "slideshow mode" (slideshow pictures + specs box only).
5. Specs: everything the page shows (including hidden tabs, accordions, "Voir toutes les caractéristiques"),
   as label/value rows in groups. No marketing sentences as rows. "Marque" is not repeated as a spec.
6. Sending to the site: products go straight into the shop, no confirmation; re-sent products REPLACE the old
   copy (site side keeps price/stock/hand-edited name). Sections are the site's Electroplanet-style tree
   ("Réfrigérateur avec congélateur en bas", "Congélateur armoire", "Machine à laver à hublot", "Téléviseur",
   "Four encastrable", "Climatiseur"…); old names kept as fallbacks in `app.js`.
7. Never put the site's secret key or import address in this repo, a test, a log or a chat. The owner pastes
   them only into the extension.
8. Be polite to websites: real browser, delays (≥2 s between pages of the same site), no logins, no forms,
   no hammering. Cache pages you already saved instead of re-downloading.

## Tests (run before every commit that touches code)
- `python tests/run_all.py` → list pages, model codes, section choice, and the full extension end-to-end on a
  fake PrestaShop shop (30 products). `python tests/run_all.py --window` also tests reading windows (headed).
- Needs `pip install playwright` + `playwright install chromium`, and Node.
- **Use Playwright's Chromium, not Google Chrome**: branded Chrome ignores `--load-extension` since v137.
- Headless Chromium drops pages in the extension's popup windows (`net::ERR_ABORTED`) → test windows headed
  (or `xvfb-run -a` on Linux). Remove HTTP(S)_PROXY env vars for local test servers.
- Fake sites: map a real hostname to a local server with `--host-resolver-rules=MAP host:80 127.0.0.1:PORT`
  so recipes match (they match on hostname).

## History of real bugs (so you don't reintroduce them)
- LG: slide names like `-2010-01.jpg` mistaken for sizes; gallery folder `/gallery-1044/` vs `/gallery/` dupes;
  2025 spec pages nest label/value deep and put the whole product inside a "compare" box (h1 exemption);
  Morocco prices inside crossed-out/"Économiser" blocks.
- Looping carousels put the LAST slide first → `inSlideOrder()` drops clones and sorts by slide index.
- Haier/Candy/Bosch took pictures/prices from "recommended products" → other-products box detection.
- Samsung "Voir plus" inside filters was clicked; model code never read (long URLs) → recipe `model()`.
- TCL filtered list ("?tvs-for-gaming") gave hidden mega-menu TVs → hidden links skipped, "N Résultats" box.
- Whirlpool.ma is Beko's AEM platform, not VTEX (`product-info-image-N`, `PropertyTable` rows, ticks = "Oui").
- Paginated lists ("Il y a 23 produits", 12 per page) must not count as incomplete.

## Training environment
See `.claude/skills/train/SKILL.md` (`/train <hours>`) and `training/README.md`. The training loop measures the
scanners on real pages against carefully audited "expected" results, fixes the weakest spots, proves nothing got
worse (offline replay of saved pages + tests), commits, and repeats until the time is up.
