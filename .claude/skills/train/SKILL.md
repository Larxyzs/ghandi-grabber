---
name: train
description: Train the product scanners for a number of hours, e.g. "/train 3h". Measures every recipe on real product pages against audited expected results, fixes the weakest spots, proves nothing got worse, commits, repeats until the time is up, then releases.
disable-model-invocation: true
---

# /train $ARGUMENTS

You are running a **training session** on the Ghandi Product Grabber scanners (recipes + core + sheets).
"Training" = a measured improvement loop, not machine learning: measure → find the weakest spot → understand it
on the real page → fix → prove nothing got worse → commit → repeat. Read `CLAUDE.md` and `training/README.md` first.

## 0. Time budget
- `$ARGUMENTS` is the duration ("3h", "90m", "2" = hours). Default 2 hours if empty.
- Right now, run a command that prints the current time and write `training/state.json`:
  `{ "startedAt": ..., "endsAt": ..., "budget": "...", "iteration": 0 }`.
- **Before every step below, check the clock.** When less than 20 minutes remain, jump to step 7 (wrap-up).
  Never stop early because things look good: if you run out of ideas, go deeper (step 5) or widen the corpus.
- Keep working without asking the owner questions. If something truly needs him (a login, a captcha, a site
  that blocks you), write it in the final summary and move on to another site.

## 1. Health check (first iteration only)
- `git pull`, `python tests/run_all.py` (must pass). If it fails, fixing it is iteration 1.
- `python training/replay.py` (offline replay of all saved pages) to get the starting score. Save it.

## 2. Refresh the corpus (every iteration, small)
- Add 5–10 NEW real products to `training/corpus.jsonl`, rotating sites and product types (fridge, freezer,
  washer, washer-dryer, dishwasher, AC, fan, TV, soundbar, hob, cooker, hood, built-in oven, built-in microwave,
  sink…), using the extension's own "Find products" on real category pages (`training/sites.json`).
- For each new product: save the page (`training/snapshot.py`) and build its expected result with the
  independent auditor (`training/audit.py`), then **look at the page yourself** (screenshots of the gallery and
  of every spec section, opened) and correct the expected file. Set `"verified": true` only after you looked.
  The expected file is the truth the scanners are graded against: be strict and complete.

## 3. Measure
- `python training/evaluate.py --live --new` (new products, real sites, polite delays) and
  `python training/replay.py` (everything saved, offline, fast).
- Read `training/report.md`: score per site × type × field (name, brand, model, pictures, picture order, main
  picture, spec recall, spec precision, groups, sheet coverage, type detection, speed, quick-read rate).

## 4. Pick the weakest spot
- Choose the problem that loses the most points across the corpus (score gap × number of products), not the
  easiest one. Write in `training/JOURNAL.md`: iteration number, the problem, the products, your hypothesis.

## 5. Understand it on the real page, go deep
- Open the real page in a real browser (Playwright Chromium, headed). Use the extension's X-ray / problem report.
- Look for **richer sources** of specs and pictures than the visible HTML: hidden tabs, "Voir toutes les
  caractéristiques", accordions, comparison tables, the site's own JSON (`__NEXT_DATA__`, `window.digitalData`,
  `dataLayer`, JSON-LD, inline `<script type="application/json">`), the XHR/fetch calls the page makes for specs
  (record them), product data sheets (PDF "fiche produit"), energy label data. Prefer structured data when it is
  complete and matches the visible page.
- Check the Electroplanet-style sheet for that type: which clean lines stay empty although the brand data has
  the information? Add synonyms/rules in `sheets/templates.js`.

## 6. Fix, prove, commit
- Fix in the recipe first; change `scraper/core.js` only for problems shared by several sites.
- Add a regression check for this exact case (a saved snapshot in the corpus, or a small fixture test in
  `tests/`).
- Run `python training/replay.py` and `python tests/run_all.py`. **Accept the change only if** the total score
  goes up and no product loses points (if one does, either fix it or explain why the new result is more
  correct and update its expected file after looking at the page).
- Commit: `train: <site/type> <what> (+X.X pts)`. Update `training/leaderboard.md`. Increment the iteration in
  `training/state.json`. Back to step 2.
- Every 3 iterations, also run the windows test (`python tests/run_all.py --window`).

## 7. Wrap-up (last 20 minutes)
- Full `replay.py` + `run_all.py` (+ `--window`). If everything passes and the score went up: bump the version
  and release (`RELEASING.md`), with 1–2 plain-language notes for the owner (what got better, in his words).
- Push.
- Final message to the owner, short and simple: hours trained, score before → after, what got better (3–6
  bullets, concrete: "LG fridges: 40 → 62 spec lines, model code always found"), what still needs him (if
  anything), and "click Install update in the side tab" if you released.
