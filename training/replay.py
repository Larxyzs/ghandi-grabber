"""Offline replay: the REAL extension grabs every saved page from a local server that pretends to be the brand sites.

  python training/replay.py                  # everything saved, compare with the baseline
  python training/replay.py --site lg
  python training/replay.py --accept         # this run becomes the new baseline (after a change was accepted)

The local server answers under the original host names (Chromium --host-resolver-rules), over http:
  - the extension's quick read (a download, not a page visit)  -> raw.html       (the page as downloaded)
  - a reading window (a page visit, Sec-Fetch-Mode: navigate)    -> rendered.html  (the page after the browser ran it)
Everything else (pictures, CSS, other hosts) is refused at once. This is the regression gate: a change is accepted
only if the total goes up and no product loses points (see .claude/skills/train/SKILL.md).
"""
import argparse, asyncio, json, os, sys, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import evaluate as E  # noqa: E402

PORT = 8899
BASELINE = os.path.join(C.HERE, 'replay_baseline.json')
ROUTES = {}  # (host, path?query) -> snapshot dir


def route_key(url):
    u = urlparse(url)
    return (u.hostname or '').lower(), (u.path.rstrip('/') or '/') + ('?' + u.query if u.query else '')


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass

    def do_GET(self):
        host = (self.headers.get('Host') or '').split(':')[0].lower()
        u = urlparse(self.path)
        key = (host, (u.path.rstrip('/') or '/') + ('?' + u.query if u.query else ''))
        d = ROUTES.get(key)
        if not d:
            self.send_response(404)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        nav = self.headers.get('Sec-Fetch-Mode') == 'navigate'
        f = os.path.join(d, 'rendered.html.gz' if nav else 'raw.html.gz')
        body = C.read_gz(f).encode('utf-8')
        status = 200
        if not nav:  # the download answer the site really gave (a bot wall says 403)
            try:
                with open(os.path.join(d, 'meta.json'), encoding='utf-8') as fh:
                    status = int(json.load(fh).get('rawStatus') or 200)
            except Exception:
                pass
        if status == 0:  # the real site dropped the connection
            self.close_connection = True
            return
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def as_local(url):
    u = urlparse(url)
    return 'http://' + u.netloc + u.path + ('?' + u.query if u.query else '')


def compare(scores, base):
    lost, won = [], []
    for pid, p in scores.items():
        b = base.get(pid)
        if b is None:
            continue
        d = p['total'] - b
        if d < -0.05:
            lost.append((d, pid))
        elif d > 0.05:
            won.append((d, pid))
    return sorted(lost), sorted(won, reverse=True)


async def main(args):
    C.drop_proxy_env()
    corpus = C.filter_items(C.load_corpus(), args)
    corpus = [c for c in corpus if C.load_expected(c['id']) and os.path.exists(os.path.join(C.snap_dir(c), 'rendered.html.gz'))]
    if not corpus:
        print('nothing saved yet')
        return
    hosts = set()
    for c in corpus:
        ROUTES[route_key(c['url'])] = C.snap_dir(c)
        hosts.add(urlparse(c['url']).hostname)
    rules = ','.join(f'MAP {h}:80 127.0.0.1:{PORT}' for h in sorted(hosts)) + ',MAP * ~NOTFOUND,EXCLUDE localhost,EXCLUDE 127.0.0.1'
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        async with C.Extension(live=False, host_rules=rules) as ext:
            await ext.settings(quickRead=True, workers=args.workers, delayMs=0, lightLoad=True)
            items, secs = await E.grab_items(ext, corpus, lambda it: as_local(it['url']), 'replay')
    finally:
        srv.shutdown()
    base = {}
    if os.path.exists(BASELINE):
        with open(BASELINE) as f:
            base = json.load(f)
    run, scores, txt = E.save_run('replay', items, corpus, secs)
    lost, won = compare(scores, base)
    total = sum(p['total'] for p in scores.values()) / max(1, len(scores))
    btotal = sum(base[k] for k in scores if k in base) / max(1, len([k for k in scores if k in base])) if base else None
    lines = [f'REPLAY total {total:.2f}' + (f' (baseline {btotal:.2f}, {total - btotal:+.2f})' if btotal is not None else ' (no baseline yet)')]
    if lost:
        lines.append('LOST points: ' + ', '.join(f'{pid} {d:+.1f}' for d, pid in lost))
    if won:
        lines.append('won points: ' + ', '.join(f'{pid} {d:+.1f}' for d, pid in won[:30]))
    summary = '\n'.join(lines)
    with open(os.path.join(run, 'compare.txt'), 'w') as f:
        f.write(summary + '\n')
    print(txt[:1800])
    print(summary)
    print('saved', run)
    if args.accept:
        base.update({pid: p['total'] for pid, p in scores.items()})
        C.save_json(BASELINE, base)
        print('baseline updated')
    sys.exit(2 if lost and not args.accept else 0)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--site')
    ap.add_argument('--type')
    ap.add_argument('--ids', nargs='*')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--accept', action='store_true')
    a = ap.parse_args()
    C.ensure_display()
    asyncio.run(main(a))
