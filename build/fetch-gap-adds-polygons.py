#!/usr/bin/env python3
"""Fetch the gap-adds batch polygon sources (2026-11-01, GAP-ADDS-BRIEF.md).

Island and archipelago coastlines and one strait, as mapped in OpenStreetMap,
for the landforms the gap audit (docs/landform-gap-audit-2026-11-01.md) found
missing. Writes build/extent-sources/<id>-osm.geojson in the same Feature shape
as build/fetch-borders-polygons.py; build/make-extents.mjs consumes them in its
BORDERS_OSM block. OSM data is ODbL, (c) OpenStreetMap contributors.

Relations are read through polygons.openstreetmap.fr (params=0, the full
unsimplified multipolygon), because the OSM API answers 503 on the largest
island relations (Great Britain, 5,727 members). Ways are read from the OSM API.

Where the Wikidata P402 relation is an administrative boundary (Azores,
Canary Islands, Falklands, Sicily, Corsica, Sardinia, Isle of Wight, Svalbard,
Bonaire), the job uses the place=island or place=archipelago coastline
relation instead, so no territorial-water band is drawn. Svalbard has no
archipelago relation; it is the ring of its main islands (the Santorini
multi-relation precedent). Bonaire is the island plus Klein Bonaire.

Usage: python3 build/fetch-gap-adds-polygons.py [id ...]   (run from the repo root)
"""
import json, math, sys, time, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

OUT = Path('build/extent-sources')
UA = {'User-Agent': 'woe-borders-fetch'}

def get(url, tries=4):
    last = None
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
                return r.read()
        except Exception as e:
            last = e; time.sleep(8)
    raise last

def area_km2(ring):
    if len(ring) < 3: return 0.0
    lat0 = math.radians(sum(c[1] for c in ring) / len(ring))
    pts = [(c[0] * 111.32 * math.cos(lat0), c[1] * 110.57) for c in ring]
    return abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))) / 2.0

def relation_polygons(rel_id):
    g = json.loads(get(f'https://polygons.openstreetmap.fr/get_geojson.py?id={rel_id}&params=0'))
    if g['type'] == 'GeometryCollection':
        polys = []
        for part in g['geometries']:
            polys += part['coordinates'] if part['type'] == 'MultiPolygon' else [part['coordinates']]
        return polys
    return g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]

def way_polygon(way_id):
    root = ET.fromstring(get(f'https://api.openstreetmap.org/api/0.6/way/{way_id}/full'))
    nodes = {int(n.get('id')): [float(n.get('lon')), float(n.get('lat'))] for n in root.iter('node')}
    way = next(w for w in root.iter('way') if int(w.get('id')) == way_id)
    pts = [nodes[int(nd.get('ref'))] for nd in way.findall('nd')]
    if pts[0] != pts[-1]: pts.append(pts[0])
    return [[pts]]

JOBS = {
    'north-sentinel-island': [('way', 193412500)],
    'azores': [('relation', 21692014)],
    'falkland-islands': [('relation', 1979517)],
    'canary-islands': [('relation', 5392189)],
    'great-britain': [('relation', 6038068)],
    'madeira': [('relation', 1715038), ('relation', 1715039)],
    'sicily': [('relation', 6197225)],
    'saint-helena': [('relation', 4868269)],
    'svalbard': [('relation', 1124190), ('relation', 5856703), ('relation', 5856837), ('relation', 21236293),
                 ('relation', 3068296), ('relation', 3358168), ('relation', 9382299), ('relation', 10256615), ('way', 25123687)],
    'corsica': [('relation', 7112309)],
    'sardinia': [('relation', 6847723)],
    'crete': [('relation', 453129)],
    'borneo': [('relation', 3986083)],
    'mallorca': [('relation', 6803636)],
    'isle-of-wight': [('relation', 3955402)],
    'shetland': [('relation', 2235077)],
    'tahiti': [('relation', 3992237)],
    'hawaiian-islands': [('relation', 7259209)],
    'new-guinea': [('relation', 3986076)],
    'java': [('relation', 9444963)],
    'ibiza': [('relation', 6076060)],
    'okinawa-island': [('relation', 4098955)],
    'hispaniola': [('relation', 3478916)],
    'rhodes': [('relation', 452614)],
    'corfu': [('relation', 966358)],
    'saint-martin': [('relation', 63064)],
    'ascension-island': [('relation', 6391626)],
    'bonaire': [('relation', 4266671), ('relation', 5176051)],
    'strait-of-hormuz': [('relation', 9326284)],
}

for key in (sys.argv[1:] or JOBS):
    polys = []
    for typ, oid in JOBS[key]:
        polys += relation_polygons(oid) if typ == 'relation' else way_polygon(oid)
        time.sleep(1)
    desc = '+'.join(f'{t}/{o}' for t, o in JOBS[key])
    feat = {'type': 'Feature', 'properties': {'osm': desc}, 'geometry': {'type': 'MultiPolygon', 'coordinates': polys}}
    (OUT / f'{key}-osm.geojson').write_text(json.dumps(feat))
    nv = sum(len(r) for p in polys for r in p)
    print(f'{key}: {desc} polygons={len(polys)} vertices={nv} area={round(sum(area_km2(p[0]) for p in polys))} km2', flush=True)
