"""Regions plan analysis: crosswalk EVERY NE admin-1 feature of the applicable countries to a GeoNames admin-1
code (population-majority of cities15000 inside it), so features can be dissolved to first-level regions
(FR departments -> 13+5 regions, IT provinces -> 20 regions, ES provinces -> 17+2, ...).
Writes two GeoJSON inputs for size measurement (scratch, .build-tmp/regions/): regions-all.geojson (every region
of every applicable country) and regions-used.geojson (only regions holding a location), plus xwalk-all.json.
Feature property r = dissolve key (GeoNames code, or 'NE:<adm1_code>' when no GeoNames city falls inside)."""
import json, os, sys, collections as C, numpy as np
from matplotlib.path import Path
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '../..'); TMP = os.path.join(ROOT, '.build-tmp/regions')
APPLY_KM = 200
D = json.load(open(os.path.join(HERE, 'dispersion.json'))); S = json.load(open(os.path.join(HERE, 'rescore-sim.json')))
KEYS = json.load(open(os.path.join(ROOT, 'assets/country-outlines.topo.json')))['keys']
UK = {'England', 'Scotland', 'Wales', 'Northern Ireland'}
app = sorted(k for k, d in D.items() if d and d['dCountry'] >= APPLY_KM and k not in UK)
units = {u: k for k in app for u in KEYS[k] if u not in ('HKG', 'MAC', 'PRI', 'NCL', 'PYF', 'GRL', 'FRO', 'SOL')}  # territory members stay out
FE = json.load(open(os.path.join(TMP, 'ne_10m_admin_1.geojson')))['features']
cities = C.defaultdict(list)
for l in open(os.path.join(ROOT, 'scripts/difficulty/v2-data/cities15000.txt'), encoding='utf-8'):
    p = l.rstrip('\n').split('\t'); cities[p[8]].append((float(p[5]), float(p[4]), p[10], max(int(p[14] or 0), 1)))
xw, feats = {}, []
for f in FE:
    p = f['properties']
    if p['adm0_a3'] not in units: continue
    cc = p['iso_a2']; pts = cities.get(cc, [])
    g = f['geometry']; polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    w = C.Counter()
    if pts:
        XY = np.array([(a, b) for a, b, _, _ in pts]); hit = np.zeros(len(pts), int)
        for poly in polys:
            for r in poly: hit ^= Path(np.asarray(r)).contains_points(XY).astype(int)
        for k in np.nonzero(hit)[0]: w[pts[k][2]] += pts[k][3]
    r = f'{cc}.{w.most_common(1)[0][0]}' if w else 'NE:' + p['adm1_code']
    xw[p['adm1_code']] = dict(key=units[p['adm0_a3']], name=p['name'], neRegion=p['region'], r=r,
                              share=round(w.most_common(1)[0][1] / sum(w.values()), 2) if w else None)
    feats.append({'type': 'Feature', 'properties': {'r': r, 'key': units[p['adm0_a3']]}, 'geometry': g})
R =json.load(open(os.path.join(HERE, 'regions.json')))
used = {R[i]['gn'] for i, o in S.items() if o['status'] in ('region', 'same-name')}
json.dump(xw, open(os.path.join(HERE, 'xwalk-all.json'), 'w'), indent=1, ensure_ascii=False)
for name, fs in (('all', feats), ('used', [f for f in feats if f['properties']['r'] in used])):
    json.dump({'type': 'FeatureCollection', 'features': fs}, open(os.path.join(TMP, f'regions-{name}.geojson'), 'w'))
    print(name, len(fs), 'NE features ->', len({f['properties']['r'] for f in fs}), 'regions')
print('applicable countries', len(app), '| NE features with no GeoNames city inside:', sum(1 for v in xw.values() if v['r'].startswith('NE:')))
print('used region codes not found among features:', sorted(used - {f['properties']['r'] for f in feats}))
