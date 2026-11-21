"""Fetch the waterways batch geometry sources into build/extent-sources/ (gitignored).
Polygons: OSM relations through polygons.openstreetmap.fr (params=0, the full unsimplified multipolygon; the
build/fetch-gap-adds-polygons.py method), OSM ways from the OSM API (closed ways only make a polygon), and the
Natural Earth 1:10m marine polygon of the same feature as the fallback (make-extents.mjs NE_MARINE_POLYGONS method).
Lines: OSM waterway=canal geometry (the build/build-line-extents.py Panama Canal method): relation member ways from
the OSM API (main-stream roles only), single ways from the OSM API, corridor queries through Overpass.
OSM data is ODbL, (c) OpenStreetMap contributors; Natural Earth is public domain.
Usage (from demo/): python3 scripts/waterways/fetch.py [<id> ...]"""
import json, os, sys
import xml.etree.ElementTree as ET
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import SRC, CANDIDATES, OVERPASS, NE_MARINE, get


def relation_polygons(rel):
    g = get(f'https://polygons.openstreetmap.fr/get_geojson.py?id={rel}&params=0')
    if g is None: return None
    if g['type'] == 'GeometryCollection':
        polys = []
        for part in g['geometries']:
            polys += part['coordinates'] if part['type'] == 'MultiPolygon' else [part['coordinates']]
        return polys
    return g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]


def osm_full(kind, oid):
    root = ET.fromstring(get(f'https://api.openstreetmap.org/api/0.6/{kind}/{oid}/full', raw=True))
    nodes = {n.get('id'): [float(n.get('lon')), float(n.get('lat'))] for n in root.iter('node')}
    ways = {w.get('id'): [nodes[nd.get('ref')] for nd in w.findall('nd') if nd.get('ref') in nodes] for w in root.iter('way')}
    return root, ways


def way_polygon(wid):
    _, ways = osm_full('way', wid)
    pts = ways[str(wid)]
    return [[pts]] if len(pts) > 3 and pts[0] == pts[-1] else None


def relation_lines(rel):
    root, ways = osm_full('relation', rel)
    r = next(x for x in root.iter('relation') if x.get('id') == str(rel))
    members = [(m.get('ref'), m.get('role') or '') for m in r.findall('member') if m.get('type') == 'way']
    roles = sorted({role for _, role in members})
    lines = [ways[ref] for ref, role in members if role in ('', 'main_stream', 'main') and ref in ways and len(ways[ref]) >= 2]
    return lines, roles


def fetch(i):
    c = CANDIDATES[i]
    out = os.path.join(SRC, f'{i}-osm.geojson')
    note = {}
    if c['extent'] == 'polygon':
        polys = None
        if c['osm'] and c['osm'][0] == 'relation': polys = relation_polygons(c['osm'][1])
        elif c['osm'] and c['osm'][0] == 'way': polys = way_polygon(c['osm'][1])
        if polys:
            json.dump({'type': 'Feature', 'properties': {'id': i, 'osm': list(c['osm'])},
                       'geometry': {'type': 'MultiPolygon', 'coordinates': polys}}, open(out, 'w'))
        note['osmPolygon'] = bool(polys)
        if c['ne']:
            ne = json.load(open(NE_MARINE))
            feats = [f for f in ne['features'] if f['properties'].get('name') in c['ne']]
            polys = [p for f in feats for p in ([f['geometry']['coordinates']] if f['geometry']['type'] == 'Polygon' else f['geometry']['coordinates'])]
            json.dump({'type': 'Feature', 'properties': {'id': i, 'ne': c['ne']}, 'geometry': {'type': 'MultiPolygon', 'coordinates': polys}},
                      open(os.path.join(SRC, f'{i}-ne.geojson'), 'w'))
            note['nePolygons'] = len(polys)
    else:
        kind, ref = c['osm']
        if kind == 'relation':
            lines, roles = relation_lines(ref)
            note['roles'] = roles
        elif kind == 'way':
            _, ways = osm_full('way', ref)
            lines = [ways[str(ref)]]
        else:
            d = get(OVERPASS, data=f'[out:json][timeout:120];({ref});out geom;')
            lines = [[[p['lon'], p['lat']] for p in e['geometry']] for e in d['elements'] if len(e.get('geometry') or []) >= 2]
            note['ways'] = [(e['id'], e.get('tags', {}).get('name'), e.get('tags', {}).get('name:en')) for e in d['elements']]
        json.dump({'type': 'Feature', 'properties': {'id': i, 'osm': list(c['osm'])},
                   'geometry': {'type': 'MultiLineString', 'coordinates': lines}}, open(out, 'w'))
        note['lines'] = len(lines)
    print(i, json.dumps(note, ensure_ascii=False))


if __name__ == '__main__':
    for i in sys.argv[1:] or list(CANDIDATES):
        fetch(i)
