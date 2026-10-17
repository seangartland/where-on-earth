"""Trivia promotion pilot: add or replace verdict records in
docs/trivia-promotion-pilot-verdicts.json from a compact spec file.
`before` values are copied from the bank at the pilot base commit, so a record
can never misquote the text it changes.
Usage: python3 scripts/trivia-promotion/record.py <spec.json>
Spec: [{id, fact:{v,note,source,changes:{field: [after, why]}}, unique:{...,competitors}, photo:{v,file,note,searched}}]
"""
import json, subprocess, sys, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'docs', 'trivia-promotion-pilot-verdicts.json')
base = {e['id']: e for e in json.loads(subprocess.check_output(['git', 'show', '47cbe5e:assets/trivia-bank.json'], cwd=ROOT))}
recs = json.load(open(OUT)) if os.path.exists(OUT) else []
order = json.loads(subprocess.check_output(['node', 'scripts/trivia-promotion/pilot-list.mjs'], cwd=ROOT))
band_of = {i: g['band'] for g in order for i in g['ids']}
for s in json.load(open(sys.argv[1])):
    e = base[s['id']]
    cur = {'fact': e['fact'], 'clue': e['clue']}
    gates = {}
    for g in ('fact', 'unique', 'photo'):
        spec = dict(s.get(g) or {'v': 'NOT RUN', 'note': 'an earlier gate failed'})
        if 'changes' in spec:
            ch = []
            for field, (after, why) in spec['changes'].items():
                assert '—' not in after, (s['id'], 'em dash')
                ch.append({'field': field, 'before': cur[field], 'after': after, 'why': why})
                cur[field] = after
            spec['changes'] = ch
        gates[g] = spec
    old = next((r for r in recs if r['id'] == s['id']), None)
    if old and old['gates']['photo'].get('url') and gates['photo'].get('file') == old['gates']['photo'].get('file'):
        for k in ('url', 'license', 'author', 'attributionRequired', 'source'):
            gates['photo'][k] = old['gates']['photo'][k]
    rec = {'id': s['id'], 'band': band_of[s['id']], 'difficulty': e['difficulty'], 'short': e['short'], 'gates': gates,
           'promoted': all(gates[g]['v'] == 'PASS' for g in gates)}
    recs = [r for r in recs if r['id'] != s['id']] + [rec]
pos = {i: n for n, i in enumerate(i for g in order for i in g['ids'])}
recs.sort(key=lambda r: pos[r['id']])
json.dump(recs, open(OUT, 'w'), indent=1, ensure_ascii=False)
open(OUT, 'a').write('\n')
print(len(recs), 'records;', sum(r['promoted'] for r in recs), 'promoted')
