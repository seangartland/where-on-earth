"""Trivia promotion pilot: render the report's tables from
docs/trivia-promotion-pilot-verdicts.json into a template.
Usage: python3 scripts/trivia-promotion/report-tables.py <template.md> <out.md>
Placeholders: {{ENTRIES}} {{RATES}} {{TEXT}} {{PHOTOS}} {{COMPETITORS}}"""
import json, sys, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
R = json.load(open(os.path.join(ROOT, 'docs', 'trivia-promotion-pilot-verdicts.json')))
cell = lambda s: str(s).replace('|', '/').replace('\n', ' ')
def reason(r):
    for g, name in (('fact', 'gate 1'), ('unique', 'gate 2'), ('photo', 'gate 3')):
        if r['gates'][g]['v'] == 'FAIL':
            return name + ': ' + '. '.join(r['gates'][g]['note'].split('. ')[:2]).rstrip('.') + '.'
    return ''
t = {}
rows = ['| # | Entry | Band (d) | Gate 1 fact | Gate 2 unique | Gate 3 photo | Promoted | Failure reason |', '|---|---|---|---|---|---|---|---|']
for i, r in enumerate(R, 1):
    g = r['gates']
    rows.append(f"| {i} | `{r['id']}` | {r['band']} ({r['difficulty']}) | {g['fact']['v']} | {g['unique']['v']} | {g['photo']['v']} | {'yes' if r['promoted'] else 'no'} | {cell(reason(r))} |")
t['ENTRIES'] = '\n'.join(rows)
rows = ['| Band | Gate 1 fact | Gate 2 unique | Gate 3 photo | Promoted | Entries with text changes | Clues flagged at gate 2 |', '|---|---|---|---|---|---|---|']
for band in ('9-10', '7-8', '3-4', 'All'):
    rs = [r for r in R if band == 'All' or r['band'] == band]
    cells = []
    for g in ('fact', 'unique', 'photo'):
        ran = [r for r in rs if r['gates'][g]['v'] != 'NOT RUN']
        p = sum(r['gates'][g]['v'] == 'PASS' for r in ran)
        cells.append(f'{p} of {len(ran)} ({round(100 * p / len(ran))}%)')
    prom = sum(r['promoted'] for r in rs)
    tc = sum(1 for r in rs if any(r['gates'][g].get('changes') for g in ('fact', 'unique')))
    fl = sum(1 for r in rs if r['gates']['unique'].get('competitors'))
    rows.append(f"| {band} | {' | '.join(cells)} | {prom} of {len(rs)} ({round(100 * prom / len(rs))}%) | {tc} | {fl} |")
t['RATES'] = '\n'.join(rows)
rows = ['| Entry | Gate | Field | Before | After | Why |', '|---|---|---|---|---|---|']
for r in R:
    for g, name in (('fact', '1'), ('unique', '2')):
        for c in r['gates'][g].get('changes', []):
            note = '' if r['promoted'] else ' (not applied: entry held)'
            rows.append(f"| `{r['id']}` | {name} | {c['field']} | {cell(c['before'])} | {cell(c['after'])} | {cell(c['why'])}{note} |")
t['TEXT'] = '\n'.join(rows)
rows = ['| Entry | Commons file | License | Author |', '|---|---|---|---|']
for r in R:
    p = r['gates']['photo']
    if p['v'] == 'PASS':
        rows.append(f"| `{r['id']}` | [{cell(p['file'])}]({p['source']}) | {p['license']} | {cell(p['author'])} |")
t['PHOTOS'] = '\n'.join(rows)
rows = ['| Entry | Gate 2 | Competitors named | Note |', '|---|---|---|---|']
for r in R:
    u = r['gates']['unique']
    if u['v'] == 'NOT RUN':
        continue
    rows.append(f"| `{r['id']}` | {u['v']}{' (rewritten)' if u.get('changes') else ''} | {cell('; '.join(u['competitors']) or 'none')} | {cell(u['note'])} |")
t['COMPETITORS'] = '\n'.join(rows)
s = open(sys.argv[1]).read()
for k, v in t.items():
    s = s.replace('{{' + k + '}}', v)
assert '—' not in s, 'em dash in report'
open(sys.argv[2], 'w').write(s)
print('written', sys.argv[2])
