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
| `scraper/recipes/*.js` | One recipe per site: `whirlpool` (whirlpool.ma, Beko AEM platform), `lg` (lg.com/ma), `candy` (candy-home.com/fr_MA), `tcl` (tcl.com/ma/fr), `samsung` (samsung.com/n_africa), `haier` (haier-europe.com/fr_MA), `bosch` (bosch-home.ma), `electrobousfiha` (a **shop**: PrestaShop, brand read per product), `electroplanet` (a **shop**: Magento 2, brand from the "Marque" row, model code from "Code produit"/the short name, readable name = category + brand + short name, pictures from the `x-magento-init` gallery JSON, originals = address without `/cache/<32hex>/`). Shared brand list: `scraper/brands.js` (FIRST in recipe-list.js). Options are documented in `_template.js` and in each file. Recipe list: `recipe-list.js`. |
| `sheets/engine.js` + `sheets/templates.js` | Turns brand spec rows into **Electroplanet-style sheets** per type: fridge, ac, washer, tv, hob, oven, microwave, sink, fan, dishwasher. Type auto-detected or chosen by the owner. Output `specGroups` (clean) + `brandSpecGroups` (original). |
| `app/app.html/.css/.js` | The side panel (4.0 design, 1.8k lines JS). **Smart start** card reads the open tab (product page → "Grab this product", list → "Find all N products" with a count read by `collectLinks({static:true})`, unknown site → general method), live **progress** (bar, photos, time left), **review** list of big cards (virtual list, fixed card height `--card-h`; filters To check / Ready / Sent / Failed / All; group by brand/type; search; problems in plain words with a fix on the card: type the model, choose type/section, grab again, "It is fine"), selection bar (Grab again, Set type, Set section, Remove, Send), remove = 10 s **Undo** bar (no confirm), big **Send N ready products** (no dialog; each card shows its section chip = `sectionFor(it)`: the card's own `category`, else type → `TYPE_SECTION`/`fridgeSections`; sent products now STAY in the list as "Sent"), **editor** (drag pictures, big preview, spec search, "18/38 Electroplanet lines filled" via `GHANDI_SHEETS.lines()`, autosave), **History** (`sendHistory` storage key), **Settings** drawer (site, speed, recipe, sheet style, theme, updates). Keys: ↑↓ Enter Space Delete Ctrl+A Esc. `tests/test_sections.js` reads the code between `const foldText` and `async function sendToSite()`: keep that marker. |
| `bridge/bridge.js` | Content script on ghandihomeelectro.com only: the owner's site (or Claude driving his browser) can postMessage `hello / crawl {url, ptype} / status / send {ids} / sendResult`. Crawl only accepts the known shop/brand hosts; send is done by the extension's own page (`autoSend` in app.js), so the site key never leaves the extension. Test: `tests/test_bridge.py`. |
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
- `python tests/run_all.py` → list pages, model codes, section choice, the full extension end-to-end on a
  fake PrestaShop shop (30 products) and a fake Electroplanet/Magento shop (32 products, 20 product types), and the
  side panel (`test_ui.py`: fake products + fake site, every screen; `--shots` saves screenshots in training/tmp).
  `python tests/run_all.py --window` also tests reading windows (headed).
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
- Electroplanet: the h1 brand link can be wrong ("LAV" for a Franke dishwasher) → the "Marque" row wins;
  "Code produit" is sometimes the whole short name ("MAL 10KG ELX-AWMF-1003 ELEXIA") or a fragment ("E5P") →
  `modelFrom()` digs the model out of it, then out of the short name. Some products have no model code at all
  (Taurus "TMAX"): leave it empty so the owner types it. The browser blocks fetching GitHub from electroplanet pages (CSP).
- On a Linux container, `--window` tests sometimes die with Playwright "Target crashed" (also on old code): rerun.

## Filling the shop through the owner's browser (Nov 2026)
- Claude drives the owner's Edge (claude-in-chrome) on `ghandihomeelectro.com/admin`: `bridge/bridge.js` commands
  (`crawl {url, ptype, category}` lets the extension find+grab a whole list; `add`, `retry`, `status`, `send`).
  The extension's own crawl works on Whirlpool, Candy, Haier, Bosch, TCL, Samsung lists; LG lists need the page-2
  click (`a.c-page__link`) — check counts against "N Résultats".
- Before sending, skip products whose model code is already on the site (read `products.model` with the public key)
  so the owner's hand-sorted copies are not moved.
- Site folders are created/moved with the site's own admin server functions (called from the admin tab, cookie
  session): POST `/_serverFn/<id>` with a seroval body; ids are stable per build (`adminCreateNode`,
  `adminMoveProductToNode`, read them from `.output/server/*server-fn-resolver*.mjs` after `npm run build`).
- `preciseSections()` in app.js puts products straight into the Electroplanet-style sub-folders.
- Updates: from 3.7.26 the side panel installs new versions by itself when Chrome already allowed the folder
  (`installSilently`); the bridge `update` command opens the side panel page to do it.
- The cloud session cannot reach brand sites or the shop (egress allowlist): all grabbing needs the owner's PC on.

## Training environment
- Built in session 1 (Nov 2026): `training/` (find, snapshot, audit + audit_sites, check, score, evaluate, replay),
  111 products from 7 sites in `corpus.jsonl`, verified `expected/`, `JOURNAL.md` (what each site looks like, the
  owner's decisions about the truth), `leaderboard.md`. Replay baseline: `replay_baseline.json`.
- The owner wants SHORT sessions: he cut /train from 4 h to 30 min. Give time estimates up front, ship fixes early.
- Cloud sessions: Whirlpool blocks automated visits (Akamai) → not in the corpus, do not work around it; LG refuses
  plain downloads (quick read gets nothing, windows work); lg.com is HSTS → replay cannot serve LG windows yet
  (needs a local https server); Samsung list grids need a host the cloud blocks (products picked from its sitemap).
- "Find products" is wrong on LG and Samsung lists (sub-category links, "Très bien noté" strip) → next training target.
See `.claude/skills/train/SKILL.md` (`/train <hours>`) and `training/README.md`. The training loop measures the
scanners on real pages against carefully audited "expected" results, fixes the weakest spots, proves nothing got
worse (offline replay of saved pages + tests), commits, and repeats until the time is up.
