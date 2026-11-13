# The prompt to paste into Claude Code (first session only)

Copy everything inside the box. Change the number of hours on the last line if you want.

````
You are taking over my project: the "Ghandi Product Grabber" Chrome extension (repo https://github.com/Larxyzs/ghandi-grabber). It reads product pages on appliance brand/shop websites (Whirlpool, LG, Candy, TCL, Samsung, Haier, Bosch Morocco sites, and the shops Electrobousfiha and Electroplanet) and sends clean products to my shop ghandihomeelectro.com. I am not a developer: talk to me in short, simple English. Work on your own; only stop to ask me if you are truly blocked (a login, a captcha, a GitHub sign-in window).

You run on MY Windows computer, so you can reach the real brand websites and open a real browser. Use that: this is the whole point of running here.

PHASE 0 — SET UP (do it yourself)
1. Check that git, Python 3.11+ and Node.js LTS are installed (`git --version`, `python --version`, `node --version`). If one is missing, install it with winget (Git.Git, Python.Python.3.12, OpenJS.NodeJS.LTS) and tell me if Windows asks me to click "Yes".
2. Clone the repo into this folder: `git clone https://github.com/Larxyzs/ghandi-grabber .` (or into a subfolder if this folder is not empty), then `pip install playwright` and `python -m playwright install chromium`.
3. Set git's name/email for this repo (`git config user.name "Claude"`, `git config user.email "noreply@anthropic.com"`). The first `git push` will open a GitHub sign-in window: tell me then, I will sign in as Larxyzs.
4. Read CLAUDE.md completely (the project memory), then RELEASING.md, training/README.md, .claude/skills/train/SKILL.md, tests/, and skim every file in scraper/, sheets/, app/, background.js, offscreen/.
5. Run `python tests/run_all.py`. Everything must pass. Then `python tests/run_all.py --window` (a Chromium window will open; that is normal).

PHASE 1 — BUILD THE TRAINING ENVIRONMENT
Build everything described in training/README.md: sites.json, snapshot.py, audit.py, score.py, evaluate.py, replay.py, report.md, leaderboard.md, JOURNAL.md, state.json. Requirements:
- Use Playwright's own Chromium with --load-extension (Google Chrome ignores that flag). Headed for anything that uses the extension's reading windows (headless drops pages in its popup windows).
- evaluate.py drives the REAL extension through its own messages (open chrome-extension://<id>/app/app.html, then chrome.runtime.sendMessage add-links / crawl / start, read chrome.storage.local it:<id>), exactly like tests/test_shop_e2e.py does. Do not re-implement the scanners.
- audit.py must be independent of the extension code, so it can catch the extension's mistakes.
- Be polite to the websites: ≥2 seconds between pages of the same site, real browser, no logins or forms, reuse saved pages.
- Fill sites.json by exploring each real site: for every site, the category pages for each product type it sells (fridge, freezer, washer, washer-dryer, dishwasher, AC, fan, TV, soundbar, hob, cooker, hood, built-in oven, built-in microwave, sink…).
- Build a first corpus: about 8 products per site × main product types (aim for 100+ products, mixed brands on Electrobousfiha and Electroplanet). Snapshot them, audit them, then CHECK each expected file yourself against the screenshots (gallery + every spec section opened) and set verified: true. This is the foundation: be strict and complete.
- Run the first full evaluation and replay; write report.md and the first leaderboard line (starting score).
- Commit and push (no release: pushing alone changes nothing for me; only version.json does).

PHASE 2 — MAKE THE SIDE PANEL WAY EASIER TO USE
Redesign the UI in app/ (app.html, app.css, app.js) without breaking the background messages, the send-to-site behaviour or the rules in CLAUDE.md. My wishes:
- A "smart start" card at the top that understands the tab I am on: on a product page of a known site → one big "Grab this product" button; on a category page → "Find all products on this page" (with the number found); on an unknown site → say so simply.
- One flow without thinking: find → grab automatically → review → send. A clear progress bar with small photos appearing live and the time left.
- Review: big cards (main photo, name, BRAND, MODEL CODE, type icon, number of pictures/specs), problems written in plain words ("No model code", "Only 3 specs", "Check the pictures") with a one-click fix right there (type the model code, choose the type, grab again). Filters: To check / Ready / Sent / Failed; group by brand or type; search.
- When I select products: a bar with Grab again, Set type, Remove, Send. A big "Send all ready products" button; each card shows the site section it will go to (chip), changeable in one click. No confirmation pop-ups: use a 10-second "Undo" bar instead for removing/clearing.
- Product editor: drag to reorder pictures, big preview, search inside specs, show "18/24 Electroplanet lines filled".
- A small "History" of what I sent (date, how many, sections).
- Settings (site connection, speed, updates) tucked away in one drawer.
- Works from 360 to 600 px wide, big buttons, keyboard shortcuts (↑/↓ move, Enter open, Delete remove), dark mode, fast with 500+ products (virtualized list), never loses work.
- Check your work by taking screenshots of the side panel at 380 px and 560 px wide in every state (empty, grabbing, review, editor, send, history) and looking at them critically. Fix what looks confusing. Add a UI smoke test to tests/ and keep run_all.py green.
- Release it (follow RELEASING.md) with a short plain note, so I get "Install update" in my side tab.

PHASE 3 — TRAIN
Run /train for the time written on the last line (follow .claude/skills/train/SKILL.md exactly: clock check before every step, fix the weakest spot each iteration, prove nothing got worse with replay + tests, commit each improvement, release at the end, then give me a short simple summary with the score before → after).

Rules that never change: no prices (they are typed on my site), model code and real brand are very important, only the product's own pictures, every spec the page shows (hidden tabs, "voir toutes les caractéristiques", the site's own JSON data), never put my site's secret key anywhere, never release with a failing test, keep CLAUDE.md updated with anything important you learn.

Training time for Phase 3: 4h
````

## After this first session
To train again any time, open the same folder in Claude Code and type:

```
/train 3h
```

(Any duration: `/train 90m`, `/train 8h`.)
