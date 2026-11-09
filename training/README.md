# Training environment (design)

Goal: make every scanner (recipe + core + Electroplanet sheets) read **everything** a product page offers,
correctly, and prove it with numbers. Used by `/train <hours>` (`.claude/skills/train/SKILL.md`).

> Status: this file is the plan. The first Claude Code session builds the scripts below (see
> `docs/BOOTSTRAP-PROMPT.md`), then keeps them up to date.

## Folder layout
```
training/
  README.md          this file
  sites.json         every site: home, category pages per product type, delay between pages, notes
  corpus.jsonl       one line per product: {id, site, type, url, listUrl, addedAt, verified}
  snapshots/<site>/<id>/
      raw.html.gz        the page exactly as downloaded (what "quick read" sees)
      rendered.html.gz   the page after a real browser ran it, opened every tab/accordion/"voir plus",
                         scrolled the gallery (scripts removed) — what a reading window sees
      xhr/*.json         JSON answers the page fetched (spec APIs), with their URLs
      shots/*.jpg        screenshots: gallery (each slide), every spec section opened (for human checking)
  expected/<id>.json  THE TRUTH for that product (see below), written by audit.py then checked by Claude
  runs/<timestamp>/   extension outputs (<id>.json) + scores.json + report.md
  report.md          latest report (copy of the last run)
  leaderboard.md     score history: date, iteration, total, per site, what changed
  JOURNAL.md         what each iteration tried, learned, and decided
  state.json         current /train session clock
  tmp/               scratch (git-ignored)
```

## Scripts
| Script | Job |
|---|---|
| `snapshot.py <url>...` | Opens each page in Playwright Chromium (headed), saves raw + rendered HTML, XHR JSON, screenshots. Polite: ≥2 s between pages of one site, real browser, no logins. |
| `audit.py <id>...` | Independent of the extension code (do not import `scraper/`). From the rendered page + XHR JSON it lists the gallery pictures in order (main first, biggest size), every spec row (group, label, value), the model code, brand, name, product type. Writes `expected/<id>.json` with `"verified": false`. Claude then checks it against the screenshots and fixes it. |
| `evaluate.py [--live] [--new] [--site X] [--type Y]` | Loads the real extension (Playwright Chromium, headed, `--load-extension`) and grabs the corpus products on the real sites (`--live`) through the extension's own messages (`add-links`, `start`), then scores every result against `expected/`. Writes `runs/<ts>/` and `report.md`. |
| `replay.py` | Same as evaluate, offline and fast: a local server serves the saved snapshots under the original hostnames (`--host-resolver-rules`), raw.html for quick read and rendered.html for windows. This is the regression gate: a change is accepted only if replay does not lose points. Dynamic behaviour (clicks, lazy loading) is covered by live runs. |
| `score.py` | The grading rules (used by evaluate and replay). |

## Score of one product (100 points)
| Field | Points | Rule |
|---|---|---|
| Model code | 15 | exact after removing spaces/case (`RB34C600ES9/MA`) |
| Brand | 10 | exact canonical name |
| Name | 5 | same text (spaces/case ignored) |
| Type | 5 | right product type (fridge, washer, ac, tv…) |
| Pictures recall | 10 | share of the real gallery found |
| Pictures precision | 10 | no foreign pictures (logos, badges, other products, duplicates) |
| Main picture | 5 | the page's first/main picture is first |
| Picture order | 5 | same order as the page's slideshow |
| Spec recall | 20 | share of expected rows found (label + value match after normalising accents, case, units "395 L" = "395L", ticks = "Oui") |
| Spec precision | 10 | no junk rows (marketing sentences, buttons, duplicates, other products) |
| Sheet coverage | 5 | share of the Electroplanet sheet lines filled when the brand data has the information |

Also reported (not scored): seconds per product, quick-read rate (no window needed), warnings.

## Rules
- Expected files are the truth: be strict, complete, and look at the screenshots before setting `verified: true`.
- Never weaken an expected file to make a score go up. If the extension is more correct than the expected file,
  fix the expected file after looking at the page and write why in `JOURNAL.md`.
- Keep the repo reasonable: gzip HTML, JPEG screenshots (quality ~60, max 1280 px), skip videos/fonts.
- No prices are graded (prices are off on purpose).
