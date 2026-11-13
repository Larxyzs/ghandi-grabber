"""Grade the REAL extension on the real websites (live), through its own messages.

  python training/evaluate.py --live                 # every corpus product that has an expected file
  python training/evaluate.py --live --new           # only products never graded live
  python training/evaluate.py --live --site lg --type fridge

It loads the extension in Playwright's Chromium (headed: reading windows need a real window), sends
add-links + start like the side tab does, waits, reads chrome.storage.local it:<id>, and grades every product
against training/expected/<id>.json (score.py). Writes training/runs/<ts>-live/ and training/report.md.
Polite: one product at a time, products of different sites interleaved, >= 2 s between pages.
"""
import argparse, asyncio, json, os, shutil, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import score as S  # noqa: E402

LIVE_LOG = os.path.join(C.HERE, 'live.json')


def interleave(items):
    by = {}
    for it in items:
        by.setdefault(it['site'], []).append(it)
    out = []
    while any(by.values()):
        for s in sorted(by, key=lambda k: -len(by[k])):
            if by[s]:
                out.append(by[s].pop(0))
    return out


async def grab_items(ext, items, url_of, label):
    """Grab every corpus item with the extension. Returns {corpus id: extension item}."""
    await ext.send({'type': 'clear-all'})
    urls = [url_of(it) for it in items]
    t0 = time.time()

    def progress(done, n):
        el = time.time() - t0
        print(f'  {label}: {done}/{n} grabbed, {el:.0f} s', flush=True)
    got = await ext.grab(urls, timeout=max(600, 60 * len(urls)), progress=progress)
    by_key = {C.url_key(g['url']): g for g in got}
    out = {}
    for it, u in zip(items, urls):
        g = by_key.get(C.url_key(u))
        if g:
            out[it['id']] = g
    return out, time.time() - t0


def save_run(kind, items_by_id, corpus, seconds, extra=()):
    ts = time.strftime('%Y%m%d-%H%M%S')
    run = os.path.join(C.RUNS, f'{ts}-{kind}')
    os.makedirs(run, exist_ok=True)
    for pid, it in items_by_id.items():
        C.save_json(os.path.join(run, pid + '.json'), it)
    graded = [c for c in corpus if C.load_expected(c['id'])]
    scores = S.score_run(items_by_id, graded)
    C.save_json(os.path.join(run, 'scores.json'), scores)
    lines = [f'Run `{os.path.basename(run)}` ({kind}), {len(items_by_id)} products grabbed in {seconds:.0f} s.', ''] + list(extra)
    txt = S.report(scores, f'Training report ({kind}, {time.strftime("%Y-%m-%d %H:%M")})', lines)
    with open(os.path.join(run, 'report.md'), 'w', encoding='utf-8') as f:
        f.write(txt)
    with open(os.path.join(C.HERE, 'report.md'), 'w', encoding='utf-8') as f:
        f.write(txt)
    return run, scores, txt


async def main(args):
    corpus = C.filter_items(C.load_corpus(), args)
    corpus = [c for c in corpus if C.load_expected(c['id'])]
    log = {}
    if os.path.exists(LIVE_LOG):
        with open(LIVE_LOG) as f:
            log = json.load(f)
    if args.new:
        corpus = [c for c in corpus if c['id'] not in log]
    if not corpus:
        print('nothing to grade')
        return
    corpus = interleave(corpus)
    print(len(corpus), 'products, live')
    async with C.Extension(live=True) as ext:
        await ext.settings(quickRead=True, workers=1, delayMs=args.delay, lightLoad=True)
        items, secs = await grab_items(ext, corpus, lambda it: it['url'], 'live')
    run, scores, txt = save_run('live', items, corpus, secs)
    for pid, p in scores.items():
        log[pid] = {'at': C.now_iso(), 'total': p['total'], 'run': os.path.basename(run)}
    C.save_json(LIVE_LOG, log)
    print(txt[:2500])
    print('saved', run)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--live', action='store_true', help='(always live: replay.py is the offline one)')
    ap.add_argument('--new', action='store_true')
    ap.add_argument('--site')
    ap.add_argument('--type')
    ap.add_argument('--ids', nargs='*')
    ap.add_argument('--delay', type=int, default=2000, help='ms between products')
    a = ap.parse_args()
    C.ensure_display()
    asyncio.run(main(a))
