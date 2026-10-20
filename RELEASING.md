# Releasing an update (for Claude / whoever changes the code)

The installed extension checks `https://raw.githubusercontent.com/Larxyzs/ghandi-grabber/main/version.json`
when Chrome starts and every 6 hours. If `version` there is higher than its own, the side tab shows
"New version X is ready" and the owner clicks **Install update**. The extension then downloads each
file from `https://raw.githubusercontent.com/Larxyzs/ghandi-grabber/<commit>/<path>`, checks the sha256,
backs up the old files into `backup-previous/`, writes the new files into the folder Chrome loaded,
and reloads itself (`updater/updater.js`).

Steps for a new version:
1. Change the code. Bump `"version"` in `manifest.json` (and the "Ghandi Product Grabber X.Y" strings in `app/app.js`).
2. Test it (the e2e tests live outside this repo, in the session scratchpad).
3. `git add -A && git commit -m "X.Y.Z: what changed"`
4. `python3 tools/release.py $(git rev-parse HEAD) "Plain sentence 1 for the owner" "Plain sentence 2"`
5. `git add version.json && git commit -m "version.json X.Y.Z" && git push origin main`

Rules:
- Never edit `version.json` by hand, and never point it at a commit whose files are not pushed.
- `manifest.json` is always written last by the updater; a broken manifest would stop the extension
  from loading, so test before releasing.
- Notes are shown to a non-technical owner: short, plain French/English sentences, no jargon.
- Adding a NEW permission to manifest.json may make Chrome disable the extension until the owner
  accepts it in chrome://extensions — avoid it, or warn in the notes.
