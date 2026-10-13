"""Regions plan analysis: assign every location to a Natural Earth 10m Admin 1 polygon.
Inputs: assets/locations.json, assets/country-outlines.topo.json (topo.keys: game key -> NE adm0/gu units),
        NE ne_10m_admin_1_states_provinces.geojson (download: github nvkelso/natural-earth-vector, geojson/),
        path in NE_A1 below (gitignored scratch; re-downloadable).
Output: pip-a1.json  {id: {key, inside: adm1_code|None, nearest, km, ...}}
Planar PIP in lng/lat (NE rings don't cross 180). Off-polygon pins: nearest ring segment of an admin-1 unit
belonging to the location's own game key, distance on a local equirectangular projection (fine at < 100 km)."""
import json, math, numpy as np, collections as C, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '../..')
NE_A1 = os.path.join(ROOT, '.build-tmp/regions/ne_10m_admin_1.geojson')
LOC = json.load(open(os.path.join(ROOT, 'assets/locations.json')))
KEYS = json.load(open(os.path.join(ROOT, 'assets/country-outlines.topo.json')))['keys']
FE = json.load(open(NE_A1))['features']

def rings(g):
    polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    return [np.asarray(r, float) for p in polys for r in p]   # holes included: even-odd rule handles them

F = []
for f in FE:
    p = f['properties']; rs = rings(f['geometry'])
    allp = np.vstack(rs)
    F.append(dict(p=p, rings=rs, bbox=(allp[:, 0].min(), allp[:, 1].min(), allp[:, 0].max(), allp[:, 1].max())))

def inside(x, y, r):
    xi, yi = r[:, 0], r[:, 1]; xj, yj = np.roll(xi, 1), np.roll(yi, 1)
    c = ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / (yj - yi + 1e-300) + xi)
    return c.sum() % 2 == 1

def seg_km(x, y, r):
    k = math.cos(math.radians(y)) * 111.32
    ax, ay = (r[:-1, 0] - x) * k, (r[:-1, 1] - y) * 110.57; bx, by = (r[1:, 0] - x) * k, (r[1:, 1] - y) * 110.57
    dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy + 1e-12
    t = np.clip(-(ax * dx + ay * dy) / L2, 0, 1)
    return float(np.sqrt((ax + t * dx) ** 2 + (ay + t * dy) ** 2).min())

def unit(p):   # the P1 unit id an admin-1 feature belongs to (UK nations via gu_a3)
    return p['gu_a3'] if p['adm0_a3'] == 'GBR' else p['adm0_a3']

out = {}
for x in LOC:
    lo, la = x['lng'], x['lat']; own = set(KEYS[x['country']])
    hit = None
    for f in F:
        b = f['bbox']
        if b[0] <= lo <= b[2] and b[1] <= la <= b[3] and sum(inside(lo, la, r) for r in f['rings']) % 2:
            hit = f; break
    best, bkm = None, 1e9
    if hit is None or unit(hit['p']) not in own:
        for f in F:
            if unit(f['p']) not in own: continue
            b = f['bbox']
            if not (b[0] - 1 <= lo <= b[2] + 1 and b[1] - 1 <= la <= b[3] + 1): continue
            d = min(seg_km(lo, la, r) for r in f['rings'])
            if d < bkm: best, bkm = f, d
    a = hit if hit is not None and unit(hit['p']) in own else best
    P = a['p'] if a else {}
    out[x['id']] = dict(key=x['country'], clue=x['clue'], lat=la, lng=lo,
                        inside=hit['p']['adm1_code'] if hit else None,
                        insideUnit=unit(hit['p']) if hit else None,
                        assigned=P.get('adm1_code'), km=0 if a is hit else round(bkm, 2),
                        name=P.get('name'), name_en=P.get('name_en'), type_en=P.get('type_en'),
                        region=P.get('region'), iso=P.get('iso_3166_2'), gn_id=P.get('gn_id'),
                        gn_a1=P.get('gn_a1_code'), wikidata=P.get('wikidataid'), unit=unit(P) if P else None)
json.dump(out, open(os.path.join(HERE, 'pip-a1.json'), 'w'), indent=1, ensure_ascii=False)
ins = sum(1 for o in out.values() if o['km'] == 0)
off = sorted((o['km'], i) for i, o in out.items() if o['km'] > 0)
print(len(out), 'inside own-key admin1:', ins, 'off/foreign:', len(off), 'unassigned:', sum(1 for o in out.values() if not o['assigned']))
print('off >1 km:', [(i, k) for k, i in off if k > 1])
print('inside a foreign unit:', [(i, o['insideUnit']) for i, o in out.items() if o['inside'] and o['insideUnit'] not in KEYS[o['key']]])
# per-country admin-1 inventory (all features, not just those with locations)
inv = C.defaultdict(list)
for f in F: inv[unit(f['p'])].append(f['p'])
json.dump({u: dict(n=len(v), types=C.Counter(p['type_en'] for p in v).most_common(),
                   regions=len({p['region'] for p in v if p['region']})) for u, v in inv.items()},
          open(os.path.join(HERE, 'a1-inventory.json'), 'w'), indent=1, ensure_ascii=False)
