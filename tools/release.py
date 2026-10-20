#!/usr/bin/env python3
"""
Makes version.json for an update (used by updater/updater.js inside the extension).

  python3 tools/release.py <commit-sha> "what changed 1" "what changed 2" ...

Run it from the extension folder AFTER committing the new files (the sha is that commit),
then commit version.json on top and push. The extension downloads every file from
https://raw.githubusercontent.com/Larxyzs/ghandi-grabber/<commit-sha>/<path>
and checks each fingerprint (sha256) before changing anything.
"""
import hashlib, json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'tools', 'backup-previous', '.github'}
SKIP_FILES = {'version.json', 'RELEASING.md', '.gitattributes', '.gitignore', 'README.md'}

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    sha = sys.argv[1]
    notes = sys.argv[2:]
    # only files that are in git at that commit (what raw.githubusercontent.com can serve)
    listed = subprocess.check_output(['git', '-C', ROOT, 'ls-tree', '-r', '--name-only', sha], text=True).split('\n')
    files = []
    for path in sorted(p for p in listed if p):
        parts = path.split('/')
        if parts[0] in SKIP_DIRS or path in SKIP_FILES:
            continue
        blob = subprocess.check_output(['git', '-C', ROOT, 'show', f'{sha}:{path}'])
        files.append({'path': path, 'size': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()})
    manifest = json.loads(subprocess.check_output(['git', '-C', ROOT, 'show', f'{sha}:manifest.json']))
    out = {'version': manifest['version'], 'commit': sha, 'notes': notes, 'files': files, 'remove': []}
    old = os.path.join(ROOT, 'version.json')
    if os.path.exists(old):  # files that existed in the previous version but are gone now
        prev = json.load(open(old))
        now = {f['path'] for f in files}
        out['remove'] = sorted({f['path'] for f in prev.get('files', []) if f['path'] not in now} | set(prev.get('remove', [])) - now)
    json.dump(out, open(old, 'w'), indent=1, ensure_ascii=False)
    print(f"version.json: {out['version']} — {len(files)} files, commit {sha[:10]}")

main()
