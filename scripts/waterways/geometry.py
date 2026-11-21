"""Waterways batch: build each candidate's extent record the way existing extent entries get theirs.
Polygons follow build/make-extents.mjs: Douglas-Peucker per ring halves (simplifyRing), deviation measured per ring
against the source ring (vertices + segment midpoints) and gated at 2.5 km, the ring-level refinement the Strait of
Hormuz took (BORDERS_OSM_REFINE / processDesertPolygons: a ring over the gate is re-simplified at halved tolerances,
floor 0.002), coordinates quantized to 4 decimals, 100 KB per-record cap. Narrow channels a few km wide take the
BORDERS_OSM_FINE 0.002 degree tolerance (the Lake Bled / Crater Lake precedent), since 0.015 degrees collapses them.
Lines follow build/build-line-extents.py (the Panama Canal method); its helpers are exec'd from that file verbatim.
Anchor QA (the borders-program rule): a polygon anchor must lie inside the raw source polygon and the shipped one
(Amsterdam canals was held at 0.017 km outside); a line anchor must lie within the 2.5 km gate of the shipped line.
Country shares: the polygon's outer boundary sampled every 2 km, each sample credited to the game-outline country
within 3 km (open-sea edges count for nobody); the seas precedent scores on the largest coastline share.
Usage (from demo/): python3 scripts/waterways/geometry.py <id> [<id> ...]  ->  .build-tmp/waterways/geometry-<id>.json"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT, TMP, SRC, CANDIDATES, hav

_ble = open(os.path.join(ROOT, 'build/build-line-extents.py'), encoding='utf-8').read()
BLE = {'__name__': 'build_line_extents_defs'}
exec(_ble[:_ble.index('def wall_segments')], BLE)
import importlib.util
_spec = importlib.util.spec_from_file_location('mr_common', os.path.join(ROOT, 'scripts/mountain-ranges/common.py'))
MR = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(MR)

TOL, FINE_TOL, FLOOR, GATE = 0.015, 0.002, 0.002, 2.5
FINE = {'bosphorus', 'dardanelles', 'golden-gate', 'strait-of-messina'}
DEG = math.pi / 180


def simplify_ring(ring, tol):
    m = len(ring) >> 1
    return BLE['simplify'](ring[:m + 1], tol)[:-1] + BLE['simplify'](ring[m:], tol)


def ring_deviation(raw, simp):
    """make-extents.mjs deviation(): samples are the raw vertices plus segment midpoints."""
    samples = []
    for j in range(len(raw)):
        samples.append(raw[j])
        if j + 1 < len(raw): samples.append([(raw[j][0] + raw[j + 1][0]) / 2, (raw[j][1] + raw[j + 1][1]) / 2])
    return BLE['deviation_for_line'](samples, simp)


def process_polygons(raw_polys, tol):
    max_dev, src_v, out = 0.0, 0, []
    for poly in raw_polys:
        rings = []
        for ring in poly:
            src_v += len(ring)
            t = tol; s = simplify_ring(ring, t); d = ring_deviation(ring, s)
            while d > GATE and t > FLOOR:
                t = max(FLOOR, t / 2); s = simplify_ring(ring, t); d = ring_deviation(ring, s)
            max_dev = max(max_dev, d)
            rings.append([[round(x, 4), round(y, 4)] for x, y in s])
        out.append(rings)
    return out, src_v, sum(len(r) for p in out for r in p), max_dev


def inside(lng, lat, polys):
    return any(MR.pip(lng, lat, p[0]) and not any(MR.pip(lng, lat, h) for h in p[1:]) for p in polys)


def edge_km(lng, lat, polys):
    best = math.inf
    for p in polys:
        for r in p:
            best = min(best, BLE['deviation_for_line']([[lng, lat]], r) if len(r) > 1 else math.inf)
    return best


def country_shares(polys, step_km=2, reach_km=3):
    tally, n = {}, 0
    for p in polys:
        for x, y in MR.resample(p[0], step_km):
            n += 1
            hit = MR.country_at(x, y)
            if hit[0] is None:
                c = max(0.05, math.cos(y * DEG))
                for k in range(8):
                    a = k * math.pi / 4
                    hit = MR.country_at(x + reach_km / 111.2 * math.cos(a) / c, y + reach_km / 111.2 * math.sin(a))
                    if hit[0]: break
            if hit[0]: tally[hit] = tally.get(hit, 0) + 1
    coast = sum(tally.values())
    return [[k[0], k[1], round(v / coast, 3)] for k, v in sorted(tally.items(), key=lambda kv: -kv[1])], coast, n


def build(i, anchor):
    c = CANDIDATES[i]
    lat, lng = anchor
    res = dict(id=i, extent=c['extent'], anchor=[lat, lng])
    if c['extent'] == 'line':
        f = json.load(open(os.path.join(SRC, f'{i}-osm.geojson')))
        raw = [[tuple(p) for p in l] for l in f['geometry']['coordinates']]
        kind, ref = c['osm']
        src_txt = {'relation': f'OpenStreetMap waterway relation {ref}', 'way': f'OpenStreetMap waterway=canal way {ref}',
                   'overpass': 'OpenStreetMap waterway=canal ways named Suez Canal / New Suez Canal'}[kind]
        url = f'https://www.openstreetmap.org/{kind}/{ref}' if kind != 'overpass' else 'https://www.openstreetmap.org/'
        min_km = 0.5 if i == 'corinth-canal' else 3
        rec = BLE['finish'](i, raw, min_km=min_km, tolerance=0.005, gap_km=3.0,
                            source=f'{c["title"]}: {src_txt} ({c["title"]}), main-stream ways chained with gaps up to 3 km bridged; lines of {min_km:g} km or more kept',
                            source_url=url)
        d = min(BLE['deviation_for_line']([[lng, lat]], l) for l in rec['lines'])
        res.update(record=rec, anchorKm=round(d, 3), anchorOk=d <= GATE, source='osm-line')
        return res
    tried = []
    for src in ('osm', 'ne'):
        path = os.path.join(SRC, f'{i}-{src}.geojson')
        if not os.path.exists(path): tried.append(f'{src}: no polygon'); continue
        raw = json.load(open(path))['geometry']['coordinates']
        if not inside(lng, lat, raw):
            tried.append(f'{src}: anchor outside raw polygon ({edge_km(lng, lat, raw):.2f} km from its edge)'); continue
        polys, sv, v, dev = process_polygons(raw, FINE_TOL if i in FINE else TOL)
        if dev > GATE: tried.append(f'{src}: deviation {dev:.3f} km over gate'); continue
        if not inside(lng, lat, polys):
            tried.append(f'{src}: anchor outside shipped polygon ({edge_km(lng, lat, polys):.2f} km)'); continue
        if src == 'osm':
            kind, ref = c['osm']
            source, url = f'{c["title"]} {"strait" if kind == "relation" else "strait"} polygon via OpenStreetMap {kind} {ref}', f'https://www.openstreetmap.org/{kind}/{ref}'
            lic, attr = 'ODbL', '© OpenStreetMap contributors'
        else:
            source = f'Natural Earth 1:10m geography marine polygons, "{" + ".join(c["ne"])}"'
            url, lic, attr = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_geography_marine_polys.geojson', 'Public domain', 'Natural Earth'
        rec = dict(type='polygon', polygons=polys, source=source, sourceUrl=url, license=lic, attribution=attr,
                   sourceVertices=sv, vertices=v, maxDeviationKm=round(dev, 3))
        nbytes = len(json.dumps(rec, separators=(',', ':')))
        if nbytes > 100_000: tried.append(f'{src}: record {nbytes} bytes over the 100 KB cap'); continue
        shares, coast, n = country_shares(polys)
        res.update(record=rec, anchorOk=True, source=src, tried=tried, bytes=nbytes, shares=shares, coastSamples=coast, samples=n)
        return res
    res.update(record=None, anchorOk=False, tried=tried)
    return res


if __name__ == '__main__':
    anchors = json.load(open(os.path.join(TMP, 'anchors.json')))
    for i in sys.argv[1:]:
        r = build(i, anchors[i])
        json.dump(r, open(os.path.join(TMP, f'geometry-{i}.json'), 'w'), ensure_ascii=False)
        rec = r['record']
        print(i, r['source'] if rec else 'HELD', '|', {k: rec[k] for k in ('vertices', 'maxDeviationKm', 'lengthKm', 'sourceVertices') if rec and k in rec},
              '| anchorKm', r.get('anchorKm'), '| bytes', r.get('bytes'), '| shares', (r.get('shares') or [])[:4], '| tried', r.get('tried'))
