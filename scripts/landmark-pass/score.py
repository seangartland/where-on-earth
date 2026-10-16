"""Landmark data pass, phase 3 step 2: v2 difficulty for landmarks-file entries through the FROZEN scorer.
Executes scripts/difficulty/v2-data/score_v2.py's own definitions (constants, frozen CUTS, centre(), L(), p_know(),
level(), K tables, FAME_VIA, views()) by exec'ing its source up to the production loop, then runs the identical
per-entry loop body on landmarks-file entries (the .batch2/score_batch.py method). score_v2.py is never modified.
Inputs: scripts/landmark-pass/resolved.json (resolve.py). Fallback centre, as in score_v2: the clue's unit when the
clue displays one (UNIT below, same meaning as score_v2's UNIT), else the country's population centre.
Spike rule (skill: where-on-earth-locations, Difficulty rule 5): an entry is spike contaminated when its 12-month
mean is above its median month (a spike can only raise the mean) and either the mean is at least 3 times the median
or mean and median land in different rarity bands (Common 1-3, Uncommon 4-6, Rare 7-8, Legendary 9-10). A contaminated entry is scored on the median month; both are recorded.
Entries the frozen scorer cannot place (no fallback centre) or with no measured article are left unrated.
Usage (from demo/): python3 scripts/landmark-pass/score.py [--apply]
  --apply  write difficulty + difficultyWhy for rated entries into assets/locations-landmarks-sol.json"""
import json, math, os, sys

H = os.path.dirname(os.path.abspath(__file__))
V2 = os.path.join(H, '../difficulty/v2-data')
LF = os.path.join(H, '../../assets/locations-landmarks-sol.json')
src = open(os.path.join(V2, 'score_v2.py'), encoding='utf-8').read()
src = src[:src.index('via_views = ')]
cwd = os.getcwd(); os.chdir(V2); g = {'__name__': 'score_v2_defs'}; exec(src, g); os.chdir(cwd)

L = json.load(open(LF, encoding='utf-8'))
RES = json.load(open(os.path.join(H, 'resolved.json'), encoding='utf-8'))

# Clue displays a sub-unit (score_v2 UNIT meaning). US clues that show a state use the state's centre
# (skill rule 4; batch-2 STATE precedent). Reunion shows its own flag (noumea-new-caledonia precedent).
# None = fallback is the pin itself (measure.py precedent for tristan-da-cunha). CV: country centre by ISO code,
# because GeoNames names the country Cabo Verde and score_v2's name table has no Cape Verde alias.
UNIT = {'barringer-meteor-impact': 'US/AZ', 'hindenburg-lakehurst': 'US/NJ', 'little-bighorn-battlefield': 'US/MT',
        'migrant-mother-nipomo': 'US/CA', 'monterey-pop-festival': 'US/CA', 'transistor-bell-labs-murray-hill': 'US/NJ',
        'piton-de-la-fournaise': 'RE', 'tristan-da-cunha': None, 'pico-do-fogo-cape-verde': 'CV'}

BAND = lambda d: 'Common' if d <= 3 else 'Uncommon' if d <= 6 else 'Rare' if d <= 8 else 'Legendary'


def rate(x, v):
    """score_v2.py production loop body, verbatim in substance."""
    i = x['id']
    c = (g['centre'](UNIT[i]) if UNIT[i] else (x['lat'], x['lng'])) if i in UNIT else g['cent'].get(x['country'])
    if c is None: return None
    dfb = round(g['hav'](x['lat'], x['lng'], *c))
    d1m = round(min(d for d in (g['hav'](x['lat'], x['lng'], b[2], b[3]) for b in g['big']) if d > 15))
    p, k = g['p_know'](v), g['KID'].get(i, g['K'].get(x['country'], 0))
    miss_c = k * max(g['K_FLOOR'], d1m)
    miss_u = max(g['FLOOR_KM'], math.hypot(dfb, miss_c))
    known = g['KNOWN_KM'][0] + (g['KNOWN_KM'][1] - g['KNOWN_KM'][0]) * (1 - p)
    loss = round(p * g['L'](min(known, miss_u)) + (1 - p) * g['L'](miss_u), 1)
    D = g['level'](loss, g['CUTS'])
    via = '(via ' + g['FAME_VIA'][i].split(',')[0] + ')' if i in g['FAME_VIA'] else ''
    why = f"p{round(p, 2):.2f}".replace('p0.', 'p.').replace('p1.00', 'p1') + via + f"·fb{dfb}·K{k}·iso{d1m} → {loss:.1f} → {D}"
    return dict(p=round(p, 2), K=k, dFb=dfb, d1M=d1m, loss=loss, D=D, why=why)


out, unrated = {}, {}
for x in L:
    i, r = x['id'], RES[x['id']]
    if r.get('views') is None: unrated[i] = 'no measured article'; continue
    mean, med, vsrc = r['views'], r['medianPerDay'], r['title']
    if i in g['FAME_VIA']:   # district known through its parent city: parent's fame (score_v2 rule)
        parent = g['FAME_VIA'][i]
        mean, vsrc = g['views'](parent), f"{parent} (parent; own '{r['title']}' {r['views']})"
        med = None
    a = rate(x, mean)
    if a is None: unrated[i] = f"no fallback centre for country '{x['country']}'"; continue
    row = dict(title=vsrc, meanViews=mean, medianViews=med, meanD=a['D'], meanWhy=a['why'], spike=False, basis='mean', **a)
    if med:
        b = rate(x, med)
        row.update(medianD=b['D'], medianWhy=b['why'])
        if mean > med and (mean >= 3 * med or BAND(a['D']) != BAND(b['D'])):
            row.update(b, spike=True, basis='median month')
    out[i] = row

json.dump(dict(rated=out, unrated=unrated), open(os.path.join(H, 'scores.json'), 'w'), indent=1, ensure_ascii=False)

# Reproduction check: entries that already carry a v2 difficultyWhy must reproduce on the mean basis.
same = diff = 0
for x in L:
    if x['difficultyWhy'].startswith('p') and x['id'] in out:
        if out[x['id']]['meanWhy'] == x['difficultyWhy']: same += 1
        else: diff += 1; print(f"REPRO {x['id']}: stored {x['difficultyWhy']} | now {out[x['id']]['meanWhy']}")
print(f'reproduction of stored v2 values: {same} identical, {diff} different')
print(len(out), 'rated,', len(unrated), 'unrated,', sum(r['spike'] for r in out.values()), 'scored on the median month')
lvl_only = [i for i, r in out.items() if r.get('medianD') and not r['spike'] and r['medianD'] != r['meanD']]
print(len(lvl_only), 'more would move one or more levels on the median without crossing a rarity band')
for i, r in out.items():
    if r['spike']: print(f"SPIKE {i}: mean {r['meanViews']} -> {r['meanD']}, median {r['medianViews']} -> {r['medianD']}")
for i, why in unrated.items(): print(f'UNRATED {i}: {why}')

if '--apply' in sys.argv:
    for x in L:
        if x['id'] in out: x['difficulty'], x['difficultyWhy'] = out[x['id']]['D'], out[x['id']]['why']
    open(LF, 'w', encoding='utf-8').write(json.dumps(L, indent=1, ensure_ascii=False))
    print('applied to', LF)
