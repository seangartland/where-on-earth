"""A term (framework §2.2): measured great-circle span of each country's main territory.

Source: Natural Earth 10m admin-0 (./ne/). assets/world-10m.geo.json is a
coastline-only MultiLineString with no country boundaries, so it cannot give spans.

Main territory = the largest polygon plus every polygon whose nearest vertex is
<= 1000 km from it. Anything else is a detached territory (§2.2) and is excluded
from the span; locations that sit > 1000 km from the main territory get A=2 in the scorer.

Span = max great-circle distance between any two vertices of the main territory:
coarse pairwise on a subsample, then exact refinement against the full vertex set.

Output: country-span.json  {country: {spanKm, A, ne, polygonsKept, polygonsDetached}}
        main-territory.npz  (vertex arrays per country, for the scorer's detached check)
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DEMO = os.path.abspath(os.path.join(HERE, '..', '..'))
NE_DIR = os.path.join(HERE, 'ne')
LOCS = os.path.join(DEMO, 'assets', 'locations.json')
R_KM = 6371.0
DETACH_KM = 500.0     # decision 4 (README): 1000 kept Galápagos + Madeira in the main territory
TIERS = [(600, 0), (1500, 1), (3000, 2), (float('inf'), 3)]   # §2.2

# dataset country -> (NE file, NE ADMIN/NAME value)
ALIAS = {
    'England': ('map_units', 'England'), 'Scotland': ('map_units', 'Scotland'),
    'Wales': ('map_units', 'Wales'), 'Northern Ireland': ('map_units', 'Northern Ireland'),
    'Congo': ('countries', 'Republic of the Congo'),
    'DR Congo': ('countries', 'Democratic Republic of the Congo'),
    'Czech Republic': ('countries', 'Czechia'), "Côte d'Ivoire": ('countries', 'Ivory Coast'),
    'Micronesia': ('countries', 'Federated States of Micronesia'),
    'Cape Verde': ('countries', 'Cabo Verde'), 'Timor-Leste': ('countries', 'East Timor'),
    'Vatican City': ('countries', 'Vatican'), 'Tanzania': ('countries', 'United Republic of Tanzania'),
    'United States': ('countries', 'United States of America'),
    'Serbia': ('countries', 'Republic of Serbia'), 'North Macedonia': ('countries', 'North Macedonia'),
    'Bahamas': ('countries', 'The Bahamas'), 'Eswatini': ('countries', 'eSwatini'),
    'Palestine': ('countries', 'Palestine'),
}
NAME_FIELDS = ('ADMIN', 'NAME', 'NAME_LONG', 'GEOUNIT', 'SOVEREIGNT')


def to_xyz(lat, lng):
    """Degrees -> unit vectors (N,3)."""
    la, lo = np.radians(lat), np.radians(lng)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def gc_km(dot):
    """Great-circle km from unit-vector dot product."""
    return R_KM * np.arccos(np.clip(dot, -1.0, 1.0))


def polygons(geom):
    """Outer rings of a (Multi)Polygon as (N,2) lat/lng arrays."""
    if geom['type'] == 'Polygon':
        polys = [geom['coordinates']]
    else:
        polys = geom['coordinates']
    out = []
    for p in polys:
        ring = np.asarray(p[0], dtype=float)
        out.append(np.stack([ring[:, 1], ring[:, 0]], axis=1))
    return out


def ring_area(ring):
    """Rough planar area in deg² (only used to pick the largest polygon)."""
    y, x = ring[:, 0], ring[:, 1] * np.cos(np.radians(ring[:, 0].mean()))
    return 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))


def sub(xyz, n):
    """Evenly subsample to at most n points."""
    if len(xyz) <= n:
        return xyz
    return xyz[np.linspace(0, len(xyz) - 1, n).astype(int)]


def min_dist_km(a, b):
    """Min great-circle distance between two vertex sets (subsampled to 1500 each)."""
    a, b = sub(a, 1500), sub(b, 1500)
    return float(gc_km((a @ b.T).max()))


def main_territory(rings):
    """Polygons within DETACH_KM of the largest polygon (literal 'offshore' reading; no
    chaining, which would pull the Azores in via Madeira). Returns (kept idx, detached idx)."""
    xyz = [to_xyz(r[:, 0], r[:, 1]) for r in rings]
    big = int(np.argmax([ring_area(r) for r in rings]))
    kept = [i for i in range(len(rings)) if i == big or min_dist_km(xyz[big], xyz[i]) <= DETACH_KM]
    return kept, [i for i in range(len(rings)) if i not in kept]


def span_km(xyz):
    """Exact-refined max great-circle distance within a vertex set."""
    s = sub(xyz, 4000)
    best, pair = 1.0, (0, 0)
    for k in range(0, len(s), 500):
        d = s[k:k + 500] @ s.T
        i, j = np.unravel_index(np.argmin(d), d.shape)
        if d[i, j] < best:
            best, pair = d[i, j], (k + i, j)
    a, b = s[pair[0]], s[pair[1]]
    for _ in range(6):                      # alternate farthest-point refinement on full set
        b = xyz[np.argmin(xyz @ a)]
        a2 = xyz[np.argmin(xyz @ b)]
        if np.allclose(a2, a):
            break
        a = a2
    return float(gc_km(a @ b))


def tier(km):
    """Span km -> A tier per §2.2."""
    for lim, a in TIERS:
        if km < lim:
            return a


def load_ne():
    """Index NE features by every name field, per file."""
    idx = {}
    for f in ('countries', 'map_units'):
        g = json.load(open(os.path.join(NE_DIR, f'ne_10m_admin_0_{f}.geojson')))
        idx[f] = {}
        for k in NAME_FIELDS:               # field precedence: ADMIN beats a dependency's SOVEREIGNT
            for ft in g['features']:
                v = ft['properties'].get(k)
                if v and v not in idx[f]:
                    idx[f][v] = ft
    return idx


def main():
    countries = sorted({x['country'] for x in json.load(open(LOCS))})
    ne = load_ne()
    out, verts, missing = {}, {}, []
    for c in countries:
        if c == 'International Waters':
            out[c] = {'spanKm': None, 'A': 1, 'note': '§2.2 special case: search region is the named sea'}
            continue
        f, name = ALIAS.get(c, ('countries', c))
        ft = ne[f].get(name)
        if ft is None:
            missing.append(c); continue
        rings = polygons(ft['geometry'])
        kept, det = main_territory(rings)
        xyz = np.concatenate([to_xyz(rings[i][:, 0], rings[i][:, 1]) for i in kept])
        km = span_km(xyz)
        out[c] = {'spanKm': round(km), 'A': tier(km), 'ne': f"{f}:{name}",
                  'polygonsKept': len(kept), 'polygonsDetached': len(det)}
        verts[c] = np.concatenate([rings[i] for i in kept])
        verts[c + '|rings'] = np.array([len(rings[i]) for i in kept])
        print(f"{c:28s} {round(km):6d} km  A{tier(km)}  kept {len(kept)} det {len(det)}", flush=True)
    if missing:
        print('MISSING NE MATCH:', missing, file=sys.stderr); sys.exit(1)
    json.dump(out, open(os.path.join(HERE, 'country-span.json'), 'w'), indent=1, ensure_ascii=False)
    np.savez_compressed(os.path.join(HERE, 'main-territory.npz'), **verts)


if __name__ == '__main__':
    main()
