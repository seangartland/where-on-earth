# Write sliceN.json: every playable entry in slice N (108 per slice, playable-list
# order at the fact-pass head) gets PASS unless it appears in flags-sliceN.json,
# which holds { id: { competitors: [...], v: REWRITE|PULL, clue?, note? } }.
# Usage: python3 mkslice.py N
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
n = int(sys.argv[1])
base = json.loads(subprocess.check_output(['git', 'show', 'fb4af2a:assets/trivia-bank.json'], cwd=HERE))
playable = [e for e in base if e.get('photo') == 'verified']
ids = playable[(n - 1) * 108: n * 108]
flags = json.load(open(os.path.join(HERE, f'flags-slice{n}.json')))
out = {}
for e in ids:
    f = flags.pop(e['id'], None)
    out[e['id']] = {'v': 'PASS'} if f is None else {'v': f['v'], 'clue_before': e['clue'], **{k: f[k] for k in ('clue', 'competitors', 'note') if k in f}}
if flags: sys.exit(f'flags for ids outside slice {n}: {list(flags)}')
json.dump(out, open(os.path.join(HERE, f'slice{n}.json'), 'w'), ensure_ascii=False, indent=1)
c = {}
for v in out.values(): c[v['v']] = c.get(v['v'], 0) + 1
print(f'slice{n}.json: {len(out)} entries', c)
