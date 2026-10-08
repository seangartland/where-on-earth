"""Pin sanity check -> pin-suspects.json (read-only on assets/locations.json).

Two measured tests per location:
  error   pin is not inside any Natural Earth 10m polygon of its `country`, the nearest polygon vertex
          is > 50 km away, AND either the pin is inside ANOTHER country's polygon or flipping the
          latitude sign puts it inside (or within 10 km of) its own country (hemisphere sign flip).
          Pins in the same sovereign's dependencies (Greenland, Tahiti, Tristan) are not flagged.
  review  an enwiki article whose title IS the item's name (short or "<short>, <country>") has
          coordinates 50-500 km from the pin (from wiki.measure's rejected candidates). Farther
          hits are namesakes elsewhere (Lincoln, Surrey) and are ignored.
Neither test changes a score: score.py copies the flags into the item's notes.
Usage: python3 pins.py
"""
import json, os, re
import numpy as np
import wiki
from country_span import load_ne, polygons, ALIAS, to_xyz, gc_km
from score import point_in_rings

HERE = os.path.dirname(os.path.abspath(__file__))
L = json.load(open(os.path.join(HERE, '..', '..', 'assets', 'locations.json')))
OUTSIDE_KM, FAR_KM, NAMESAKE_KM = 50, 50, 500
DISPUTED = {('Somalia', 'Somaliland'), ('Ukraine', 'Russia')}   # (labelled country, NE polygon): not pin errors


def main():
    ne = load_ne()
    allc = []                                          # every NE country: (name, verts, lens, bbox)
    for ft in json.load(open(os.path.join(HERE, '..', 'difficulty', 'ne', 'ne_10m_admin_0_countries.geojson')))['features']:
        rings = polygons(ft['geometry'])
        v = np.concatenate(rings)
        allc.append(((ft['properties']['ADMIN'], ft['properties']['SOVEREIGNT']), v, np.array([len(r) for r in rings]),
                     (v[:, 0].min(), v[:, 1].min(), v[:, 0].max(), v[:, 1].max())))

    def inside_which(lat, lng):
        """All NE countries whose polygons contain the point, as (ADMIN, SOVEREIGNT)."""
        return [n for n, v, lens, (a, b, c, d) in allc
                if a <= lat <= c and b <= lng <= d and point_in_rings(lat, lng, v, lens)]
    geo = {}
    for c in sorted({x['country'] for x in L} - {'International Waters', 'Antarctica'}):
        f, name = ALIAS.get(c, ('countries', c))
        rings = polygons(ne[f][name]['geometry'])
        geo[c] = (np.concatenate(rings), np.array([len(r) for r in rings]), ne[f][name]['properties']['SOVEREIGNT'])
    meas = {m['id']: m for m in wiki.measure_all(L)}
    out = {}
    for x in L:
        flags = {}
        if x['country'] in geo:
            v, lens, sov = geo[x['country']]
            xyz = to_xyz(v[:, 0], v[:, 1])
            d = float(gc_km((xyz @ to_xyz(x['lat'], x['lng'])).max()))
            if d > OUTSIDE_KM and not point_in_rings(x['lat'], x['lng'], v, lens):
                dflip = float(gc_km((xyz @ to_xyz(-x['lat'], x['lng'])).max()))
                flip = bool(point_in_rings(-x['lat'], x['lng'], v, lens)) or dflip <= 10
                hits = inside_which(x['lat'], x['lng'])
                other = None if any(h[1] == sov for h in hits) else (hits[0] if hits else None)  # own dependency
                if other and (x['country'], other[0]) in DISPUTED:
                    flags['disputed'] = {'pinIsInside': other[0]}
                elif flip or other:
                    flags['error'] = {'nearestOwnBorderKm': round(d), 'pinIsInside': other[0] if other else 'ocean',
                                      'latitudeSignFlipFixes': flip}
        own = {wiki.norm(x['short']), wiki.norm(f"{x['short']}, {x['country']}")}
        far = [(c, int(re.search(r'(\d+) km', why).group(1))) for c, why in meas[x['id']].get('rejected', [])
               if why.startswith('coords') and wiki.norm(c) in own]
        far = [(c, d) for c, d in far if FAR_KM <= d <= NAMESAKE_KM]
        if far:
            flags['review'] = {'sameNameArticle': far[0][0], 'articleKmFromPin': far[0][1]}
        if flags:
            out[x['id']] = dict(short=x['short'], country=x['country'], lat=x['lat'], lng=x['lng'], **flags)
    json.dump({'meta': {'generated': '2026-10-06', 'doc': __doc__.strip(),
                        'counts': {'suspects': len(out),
                                   'error': sum('error' in v for v in out.values()),
                                   'signFlip': sum(v.get('error', {}).get('latitudeSignFlipFixes', False) for v in out.values()),
                                   'review': sum('review' in v for v in out.values()),
                                   'disputed': sum('disputed' in v for v in out.values())}},
               'items': out}, open(os.path.join(HERE, 'pin-suspects.json'), 'w'), indent=1, ensure_ascii=False)
    for i, v in out.items():
        print(f"{i[:36]:36s} {v.get('error', '')} {v.get('review', '')} {v.get('disputed', '')}")
    print(len(out), 'pin suspects')


if __name__ == '__main__':
    main()
