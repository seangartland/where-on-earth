"""Regions plan analysis: GeoNames admin-1 for every location, cross-checked against the NE admin-1 PIP.
GeoNames admin1 = the unit set score_v2.py already uses for clue-unit centres (US/OR etc.).
Inputs: pip-a1.json (pip.py), scripts/difficulty/v2-data/cities15000.txt, admin1CodesASCII.txt (download.geonames.org/export/dump/).
Output: gn-a1.json  {id: {gnCity, gnKm, a1, a1name, neName, neRegion, agree}}"""
import json, math, os, collections as C
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '../..')
P = json.load(open(os.path.join(HERE, 'pip-a1.json')))
A1N = {}
for l in open(os.path.join(ROOT, '.build-tmp/regions/admin1CodesASCII.txt'), encoding='utf-8'):
    c, n, a, g = l.rstrip('\n').split('\t'); A1N[c] = (n, a, g)
cities = []
for l in open(os.path.join(ROOT, 'scripts/difficulty/v2-data/cities15000.txt'), encoding='utf-8'):
    p = l.rstrip('\n').split('\t')
    cities.append((p[1], p[8], p[10], float(p[4]), float(p[5]), int(p[14] or 0)))

def hav(a, b, c, d):
    p = math.pi / 180; h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(min(1, h)))

out = {}
for i, o in P.items():
    la, lo = o['lat'], o['lng']
    near = [(hav(la, lo, c[3], c[4]), c) for c in cities if abs(c[3] - la) < 1 and abs(c[4] - lo) < 1.5]
    d, c = min(near) if near else (1e9, None)
    code = f'{c[1]}.{c[2]}' if c else None
    out[i] = dict(key=o['key'], gnCity=c and c[0], gnPop=c and c[5], gnKm=round(d, 1), a1=code,
                  a1name=A1N.get(code, (None,))[0], neName=o['name'], neRegion=o['region'], neType=o['type_en'])
json.dump(out, open(os.path.join(HERE, 'gn-a1.json'), 'w'), indent=1, ensure_ascii=False)
far = [(i, v['gnKm'], v['gnCity']) for i, v in out.items() if v['gnKm'] > 15]
print('GeoNames city within 15 km:', len(out) - len(far), '/', len(out)); print('farther:', far)
