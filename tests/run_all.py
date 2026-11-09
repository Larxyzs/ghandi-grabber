"""Runs every test. Exit code 0 = all passed.   python tests/run_all.py   (add --window to also test reading windows)"""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
runs = [
    [sys.executable, os.path.join(HERE, 'test_list_pages.py')],
    [sys.executable, os.path.join(HERE, 'test_model_codes.py')],
    ['node', os.path.join(HERE, 'test_sections.js')],
    [sys.executable, os.path.join(HERE, 'test_shop_e2e.py')],
]
if '--window' in sys.argv:
    runs.append([sys.executable, os.path.join(HERE, 'test_shop_e2e.py'), '--window', '--headed'])
failed = []
for cmd in runs:
    name = ' '.join(os.path.basename(c) for c in cmd[1:])
    print('==>', name, flush=True)
    if subprocess.call(cmd) != 0:
        failed.append(name)
print('\nALL TESTS PASSED' if not failed else '\nFAILED: ' + ', '.join(failed))
sys.exit(1 if failed else 0)
