"""Regions plan analysis: SIMULATED re-score of region-clued locations under difficulty v2 (score_v2.py) with the
region extension proposed in docs/regions-plan-opus.md §4. Prints only; writes rescore-sim.json. Never touches
locations.json.
Inputs (all measured): scripts/difficulty/v2-data/rated-v2-final.json (views, p, K, d1M, dFb exactly as scored),
regions.json (GeoNames admin-1 region + its population centre), regviews.json (region en.wikipedia views/day),
dispersion.json (applicability rule).
Gate: the baseline recomputed here must reproduce every current level (754/754)."""
import json, math, os, re, sys, unicodedata, collections as C
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '../..')
RV2 = json.load(open(os.path.join(ROOT, 'scripts/difficulty/v2-data/rated-v2-final.json')))
LOC = json.load(open(os.path.join(ROOT, 'assets/locations.json')))
R = json.load(open(os.path.join(HERE, 'regions.json'))); V = json.load(open(os.path.join(HERE, 'regviews.json')))
D = json.load(open(os.path.join(HERE, 'dispersion.json')))
V0, V1, KNOWN_KM, FLOOR_KM, K_FLOOR = 30, 2500, (20, 100), 100, 800
CUTS = [4.7, 7.0, 9.6, 15.2, 24.3, 44.5, 78.9, 112.9, 201.7]
APPLY_KM = float(sys.argv[1]) if len(sys.argv) > 1 else 200
UK = {'England', 'Scotland', 'Wales', 'Northern Ireland'}
TERRITORY = {'ilulissat-greenland', 'nuuk-greenland', 'qaqortoq-greenland', 'nanortalik-greenland', 'san-juan',
             'noumea-new-caledonia', 'papeete-tahiti', 'hong-kong', 'macau', 'longyearbyen-svalbard'}
L = lambda km: 1000 - 1000 * math.exp(-((km / 3500) ** 1.13))
pk = lambda v: 0.99 * min(1, max(0, math.log(max(v, 1) / V0) / math.log(V1 / V0)))
lvl = lambda loss: 1 + sum(loss >= c for c in CUTS)
STOP = r'\b(city|region|province|state|oblast|krai|department|governorate|prefecture|district|federal|capital|f d|d c|municipality|autonomous|metropolitan|of|the|special)\b'
def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', '', re.sub(STOP, ' ', re.sub(r'[^a-z ]', ' ', s)))

def hav(a, b, c, d):
    p = math.pi / 180; h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(min(1, h)))

app = {k for k, d in D.items() if d and d['dCountry'] >= APPLY_KM and k not in UK}
out, bad = {}, []
for x in LOC:
    i = x['id']; r = RV2[i]; g = R[i]
    p, k, d1m = pk(r['views']), r['K'], r['d1M']
    known = KNOWN_KM[0] + (KNOWN_KM[1] - KNOWN_KM[0]) * (1 - p)
    def loss_with(dfb_c, dfb_r, q):
        miss_c = max(FLOOR_KM, math.hypot(dfb_c, k * max(K_FLOOR, d1m)))
        miss_r = max(FLOOR_KM, dfb_r) if dfb_r is not None else miss_c
        miss_r = min(miss_r, miss_c)              # the region never makes a guess worse than the country alone
        nonk = q * L(miss_r) + (1 - q) * L(miss_c)
        knw = L(min(known, miss_r if q > 0 else miss_c))
        return p * knw + (1 - p) * nonk
    base = loss_with(r['dFb'], None, 0)           # exactly score_v2 (dFb as scored, incl. existing clue units)
    if round(base, 1) != r['loss'] or lvl(round(base, 1)) != x['difficulty']: bad.append((i, round(base, 1), r['loss']))
    status = 'not-applicable'
    if i in TERRITORY: status = 'territory-unit'
    elif x['country'] in app:
        if not g['gn'] or g['dFbRegion'] is None: status = 'no-region'
        elif norm(x['short']) == norm(g['gnName']) and x['country'] != 'United States': status = 'same-name'
        else: status = 'region'
    q = rv = None; new = base
    if status == 'region':
        rv = V.get(g['gn'], {}).get('views')
        q = pk(rv) if rv is not None else None
        dfb_c = g['dFbCountry']                    # country centre: the fallback WITHOUT the region
        if q is not None: new = loss_with(dfb_c, g['dFbRegion'], q)
    out[i] = dict(id=i, key=x['country'], status=status, region=g['gnName'], regionViews=rv, q=q and round(q, 2),
                  dFbC=g['dFbCountry'], dFbR=g['dFbRegion'], dFbScored=r['dFb'], p=round(p, 2), K=k,
                  old=x['difficulty'], oldLoss=r['loss'], newLoss=round(new, 1), new=lvl(round(new, 1)))
print('baseline reproduction failures:', len(bad), bad[:5])
st = C.Counter(o['status'] for o in out.values()); print('APPLY_KM', APPLY_KM, 'countries', len(app), dict(st))
reg = [o for o in out.values() if o['status'] == 'region']
unm = [o['id'] for o in reg if o['q'] is None]
print('region-clued:', len(reg), ' of which region views unmeasured:', len(unm))
mv = C.Counter(o['new'] - o['old'] for o in reg if o['q'] is not None); print('level change histogram:', sorted(mv.items()))
h0 = C.Counter(o['old'] for o in out.values()); h1 = C.Counter(o['new'] for o in out.values())
print('dist before', [h0[k] for k in range(1, 11)]); print('dist after ', [h1[k] for k in range(1, 11)])
json.dump(out, open(os.path.join(HERE, 'rescore-sim.json'), 'w'), indent=1, ensure_ascii=False)
