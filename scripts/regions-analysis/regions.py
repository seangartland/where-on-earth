"""Regions plan analysis: per-location GeoNames admin-1 region via a measured NE->GeoNames crosswalk,
region population centres (same centre() method as score_v2.py), dFb to country vs region centre,
and per-country dispersion (how far a 'tap the country centre' guess lands, population-weighted).
Crosswalk: the GeoNames admin-1 code held by the majority (by population) of cities15000 that fall inside the
location's NE admin-1 polygon. Fallback: nearest GeoNames city of the same country within 15 km.
Outputs: regions.json (per location), dispersion.json (per game key)."""
import json, math, os, collections as C, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '../..'); V2 = os.path.join(ROOT, 'scripts/difficulty/v2-data')
P = json.load(open(os.path.join(HERE, 'pip-a1.json')))
FE = {f['properties']['adm1_code']: f for f in json.load(open(os.path.join(ROOT, '.build-tmp/regions/ne_10m_admin_1.geojson')))['features']}
A1N = {}
for l in open(os.path.join(ROOT, '.build-tmp/regions/admin1CodesASCII.txt'), encoding='utf-8'):
    c, n, a, g = l.rstrip('\n').split('\t'); A1N[c] = a
ci = {}
for l in open(os.path.join(V2, 'countryInfo.txt'), encoding='utf-8'):
    if not l.startswith('#'): p = l.split('\t'); ci[p[4]] = p[0]
ci.update({'Congo': 'CG', 'Czech Republic': 'CZ', "Côte d'Ivoire": 'CI', 'DR Congo': 'CD', 'Netherlands': 'NL',
           'Palestine': 'PS', 'Timor-Leste': 'TL', 'Vatican City': 'VA', 'England': 'GB', 'Scotland': 'GB',
           'Wales': 'GB', 'Northern Ireland': 'GB'})
cities = []
for l in open(os.path.join(V2, 'cities15000.txt'), encoding='utf-8'):
    p = l.rstrip('\n').split('\t'); cities.append((p[8], p[10], float(p[4]), float(p[5]), int(p[14] or 0), p[1]))
bycc = C.defaultdict(list)
for c in cities: bycc[c[0]].append(c)

def xyz(la, lo):
    la, lo = math.radians(la), math.radians(lo); return math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)
def hav(a, b, c, d):
    p = math.pi / 180; h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(min(1, h)))
def centre_of(sel):
    if not sel: return None
    if not sum(c[4] for c in sel): sel = [c[:4] + (1,) + c[5:] for c in sel]
    w = sum(c[4] for c in sel); X = [sum(c[4] * xyz(c[2], c[3])[k] for c in sel) / w for k in range(3)]
    return math.degrees(math.atan2(X[2], math.hypot(X[0], X[1]))), math.degrees(math.atan2(X[1], X[0]))
def inside(x, y, r):
    xi, yi = r[:, 0], r[:, 1]; xj, yj = np.roll(xi, 1), np.roll(yi, 1)
    return (((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / (yj - yi + 1e-300) + xi)).sum() % 2 == 1
def in_feature(f, x, y):
    g = f['geometry']; polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    return sum(inside(x, y, np.asarray(r)) for p in polys for r in p) % 2 == 1

xw = {}
def crosswalk(code):
    if code in xw: return xw[code]
    f = FE[code]; cc = f['properties']['iso_a2']
    w = C.Counter()
    for c in bycc.get(cc, []):
        if in_feature(f, c[3], c[2]): w[c[1]] += max(c[4], 1)
    xw[code] = (cc, w.most_common(1)[0][0], round(w.most_common(1)[0][1] / sum(w.values()), 2)) if w else (cc, None, 0)
    return xw[code]

out = {}
for i, o in P.items():
    cc, a1, share = crosswalk(o['assigned'])
    how = 'xwalk'
    if a1 is None:   # no GeoNames city inside the polygon: nearest same-country city <= 15 km
        near = min(((hav(o['lat'], o['lng'], c[2], c[3]), c) for c in bycc.get(cc, [])), default=(1e9, None))
        if near[0] <= 15: a1, how = near[1][1], 'nearest'
        else: how = 'none'
    code = f'{cc}.{a1}' if a1 else None
    rc = centre_of([c for c in bycc.get(cc, []) if c[1] == a1]) if a1 else None
    kc = centre_of(bycc.get(ci.get(o['key'], ''), []))
    if o['key'] in ('England', 'Scotland', 'Wales', 'Northern Ireland'):
        kc = centre_of([c for c in bycc['GB'] if c[1] == {'England': 'ENG', 'Scotland': 'SCT', 'Wales': 'WLS', 'Northern Ireland': 'NIR'}[o['key']]])
    out[i] = dict(key=o['key'], clue=o['clue'], ne=o['assigned'], neName=o['name'], neRegion=o['region'], km=o['km'],
                  gn=code, gnName=A1N.get(code), how=how, share=share,
                  dFbCountry=kc and round(hav(o['lat'], o['lng'], *kc)), dFbRegion=rc and round(hav(o['lat'], o['lng'], *rc)),
                  regionCentre=rc and [round(rc[0], 3), round(rc[1], 3)])
json.dump(out, open(os.path.join(HERE, 'regions.json'), 'w'), indent=1, ensure_ascii=False)
print('how:', C.Counter(v['how'] for v in out.values()))
print('no region:', [(i, v['key']) for i, v in out.items() if not v['gn']])
print('low-share crosswalk (<0.6):', [(i, v['neName'], v['gnName'], v['share']) for i, v in out.items() if v['how'] == 'xwalk' and v['share'] < 0.6])

# per-key dispersion: population-weighted mean km from each GeoNames city to the key's centre / to its own admin-1 centre
disp = {}
for k in sorted({v['key'] for v in out.values()}):
    cc = ci.get(k)
    sel = bycc.get(cc, [])
    if k in ('England', 'Scotland', 'Wales', 'Northern Ireland'):
        sel = [c for c in bycc['GB'] if c[1] == {'England': 'ENG', 'Scotland': 'SCT', 'Wales': 'WLS', 'Northern Ireland': 'NIR'}[k]]
    if not sel: disp[k] = None; continue
    kc = centre_of(sel); W = sum(max(c[4], 1) for c in sel)
    dc = sum(max(c[4], 1) * hav(c[2], c[3], *kc) for c in sel) / W
    rcs = {a: centre_of([c for c in sel if c[1] == a]) for a in {c[1] for c in sel}}
    dr = sum(max(c[4], 1) * hav(c[2], c[3], *rcs[c[1]]) for c in sel) / W
    disp[k] = dict(cc=cc, cities=len(sel), gnA1=len(rcs), dCountry=round(dc), dRegion=round(dr))
json.dump(disp, open(os.path.join(HERE, 'dispersion.json'), 'w'), indent=1, ensure_ascii=False)
