#!/usr/bin/env python3
"""Fetch the diffuse-conversion polygon sources from the OpenStreetMap API.

Boundaries for the 2026-10-30 diffuse conversions (docs/diffuse-review-
2026-10-30.md): the UNESCO World Heritage property / protected-area
boundaries as mapped in OpenStreetMap (Kakadu NP relation 13000016,
Redwood National and State Parks relation 9592632, Ha Long Bay - Cat Ba
Archipelago relation 19465352, Nasca and Palpa relation 2729059, Lencois
Maranhenses NP relation 7458131, Wulingyuan relation 18589298, Wadi Rum
Protected Area way 243200322, Guilin Karst core-area relations 21132393
and 21263564). Writes build/extent-sources/<id>-osm.geojson files, which
build/make-extents.mjs consumes. OSM data is ODbL, (c) OpenStreetMap
contributors.

Usage: python3 build/fetch-diffuse-polygons.py   (run from the repo root)
"""
import json, math, time, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

API = 'https://api.openstreetmap.org/api/0.6'
OUT = Path('build/extent-sources')

def get(url, tries=4):
    last = None
    for _ in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'woe-conversions-fetch'})
            with urllib.request.urlopen(req, timeout=110) as r:
                return r.read()
        except Exception as e:
            last = e; time.sleep(8)
    raise last

def stitch(segs):
    segs = [list(s) for s in segs if len(s) > 1]
    rings = []
    while segs:
        ring = segs.pop(0)
        guard = 0
        while ring[0] != ring[-1] and segs and guard < 100000:
            guard += 1
            for i, s in enumerate(segs):
                if s[0] == ring[-1]: ring += s[1:]; segs.pop(i); break
                if s[-1] == ring[-1]: ring += list(reversed(s))[1:]; segs.pop(i); break
                if s[-1] == ring[0]: ring = s[:-1] + ring; segs.pop(i); break
                if s[0] == ring[0]: ring = list(reversed(s))[:-1] + ring; segs.pop(i); break
            else: break
        rings.append(ring)
    return rings

def area_km2(coords):
    if len(coords) < 3: return 0.0
    lat0 = math.radians(sum(c[1] for c in coords) / len(coords))
    pts = [(c[0] * 111.32 * math.cos(lat0), c[1] * 110.57) for c in coords]
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0

def parse_full(xml_bytes):
    root = ET.fromstring(xml_bytes)
    nodes = {}
    ways = {}
    rels = {}
    for el in root:
        if el.tag == 'node':
            nodes[int(el.get('id'))] = (float(el.get('lon')), float(el.get('lat')))
        elif el.tag == 'way':
            ways[int(el.get('id'))] = [int(nd.get('ref')) for nd in el.findall('nd')]
        elif el.tag == 'relation':
            members = [(m.get('type'), int(m.get('ref')), m.get('role')) for m in el.findall('member')]
            tags = {t.get('k'): t.get('v') for t in el.findall('tag')}
            rels[int(el.get('id'))] = (members, tags)
    return nodes, ways, rels

def relation_polygons(rel_id):
    nodes, ways, rels = parse_full(get(f'{API}/relation/{rel_id}/full'))
    members, tags = rels[rel_id]
    outers, inners = [], []
    for typ, ref, role in members:
        if typ != 'way': continue
        pts = [nodes[n] for n in ways[ref]]
        if role == 'outer': outers.append(pts)
        elif role == 'inner': inners.append(pts)
    outer_rings = stitch(outers)
    inner_rings = stitch(inners)
    polys = [[r] for r in outer_rings]
    def inside(pt, ring):
        x, y = pt; ins = False; j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]; xj, yj = ring[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: ins = not ins
            j = i
        return ins
    for ir in inner_rings:
        for p in polys:
            if inside(ir[0], p[0]): p.append(ir); break
        else: print(f'  WARN inner ring unattached in rel {rel_id}')
    return tags, polys

def way_polygon(way_id):
    nodes, ways, _ = parse_full(get(f'{API}/way/{way_id}/full'))
    pts = [nodes[n] for n in ways[way_id]]
    if pts[0] != pts[-1]: pts.append(pts[0])
    return {}, [[pts]]

JOBS = {
    'kakadu': ('relation', 13000016),
    'redwood': ('relation', 9592632),
    'ha-long-bay': ('relation', 19465352),
    'nazca-lines': ('relation', 2729059),
    'lencois-maranhenses': ('relation', 7458131),
    'zhangjiajie': ('relation', 18589298),
    'wadi-rum': ('way', 243200322),
}
for key, (kind, oid) in JOBS.items():
    tags, polys = relation_polygons(oid) if kind == 'relation' else way_polygon(oid)
    feat = {'type': 'Feature', 'properties': {'osm': f'{kind}/{oid}', 'name': tags.get('name'), 'ref:whc': tags.get('ref:whc')},
            'geometry': {'type': 'MultiPolygon', 'coordinates': polys}}
    (OUT / f'{key}-osm.geojson').write_text(json.dumps(feat))
    nv = sum(len(r) for p in polys for r in p)
    print(f'{key}: osm {kind}/{oid} name={tags.get("name")!r} polygons={len(polys)} vertices={nv} areas={[round(area_km2(p[0]),1) for p in polys]}')
    time.sleep(1)

polys = []
for oid in (21132393, 21263564):
    tags, p = relation_polygons(oid)
    polys += p
    print(f'guilin part rel {oid}: name={tags.get("name")!r} areas={[round(area_km2(x[0]),1) for x in p]}')
    time.sleep(1)
feat = {'type': 'Feature', 'properties': {'osm': 'relation/21132393+relation/21263564', 'name': 'Guilin Karst (South China Karst)', 'ref:whc': '1248'},
        'geometry': {'type': 'MultiPolygon', 'coordinates': polys}}
(OUT / 'guilin-karst-osm.geojson').write_text(json.dumps(feat))
print('guilin-karst: polygons=', len(polys), 'vertices=', sum(len(r) for p in polys for r in p))
