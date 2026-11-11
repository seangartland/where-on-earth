"""Mountain-ranges batch: write staged entries into the bank and the extent sidecar the game loads.
Appends staged entries (in brief order) to assets/locations-landmarks-sol.json and their records to assets/extents.json
(src/main.js passes that file to setExtentData). Idempotent: an id already present is replaced in place, never doubled.
Formats preserved byte-for-byte for untouched records (landmarks: indent 1, no trailing newline; extents: indent 2,
trailing newline; both UTF-8 unescaped). Bulk-safe: each file is written to a temp path and renamed.
Usage (from demo/): python3 scripts/mountain-ranges/merge.py [<id> ...]   (no ids: every staged id)"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT, HERE, RANGES

LF = os.path.join(ROOT, 'assets/locations-landmarks-sol.json')
EF = os.path.join(ROOT, 'assets/extents.json')
staged = json.load(open(os.path.join(HERE, 'staged.json'), encoding='utf-8'))
ids = sys.argv[1:] or [i for i in RANGES if i in staged]

L = json.load(open(LF, encoding='utf-8'))
E = json.load(open(EF, encoding='utf-8'))
at = {x['id']: k for k, x in enumerate(L)}
for i in ids:
    e = staged[i]['entry']
    if i in at: L[at[i]] = e
    else: L.append(e); at[i] = len(L) - 1
    E[i] = staged[i]['extent']


def write(path, text):
    tmp = path + '.tmp'
    open(tmp, 'w', encoding='utf-8').write(text); os.replace(tmp, path)


write(LF, json.dumps(L, indent=1, ensure_ascii=False))
write(EF, json.dumps(E, indent=2, ensure_ascii=False) + '\n')
print(f'merged {len(ids)}: bank {len(L)} entries, extents {len(E)} records')
