#!/usr/bin/env python3
"""Fetch the borders-program lane B polygon sources from the OpenStreetMap API.

Boundaries for the 2026-10-30 borders program, lane B
(docs/scan5-borders-inventory-2026-10-30.md, batches 3, 6, 7, 8): protected-
area boundaries, lake boundaries, heritage boundaries and island coastlines
as mapped in OpenStreetMap. Writes build/extent-sources/<id>-osm.geojson
files, which build/make-extents.mjs consumes (its BORDERS_OSM block). OSM
data is ODbL, (c) OpenStreetMap contributors.

The multi-relation subjects: the Banaue rice terraces are the five UNESCO
cluster polygons (Batad 8167057, Bangaan 7628655, Hungduan 7137867, Mayoyao
8171344, Nagacadan/Kiangan 7575218); the Santorini caldera is the ring of
island coastlines (Thera 453964, Thirasia 533902, Aspronisi 533905, Nea
Kameni 533903, Palea Kameni 533904).

Strait of Gibraltar is deliberately NOT a job here: the only OSM strait
feature is way 1134960966, an 8-node open GNS label line, and an Overpass
query over the whole strait bbox returns no water or strait polygon
relation; see docs/borders-batch-b-report-2026-10-30.md for the hold.

Usage: python3 build/fetch-borders-polygons.py   (run from the repo root)
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
            req = urllib.request.Request(url, headers={'User-Agent': 'woe-borders-fetch'})
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

def write_job(key, osm_desc, name, polys):
    feat = {'type': 'Feature', 'properties': {'osm': osm_desc, 'name': name},
            'geometry': {'type': 'MultiPolygon', 'coordinates': polys}}
    (OUT / f'{key}-osm.geojson').write_text(json.dumps(feat))
    nv = sum(len(r) for p in polys for r in p)
    print(f'{key}: {osm_desc} name={name!r} polygons={len(polys)} vertices={nv} areas={[round(area_km2(p[0]), 1) for p in polys]}')

SINGLE_RELATIONS = {
    'kruger-national-park': 1752987,
    'serengeti-national-park': 4475047,
    'lake-titicaca': 3000330,
    'lake-toba': 306034,
    'crater-lake': 147401,
    'lake-bled': 646,
    'lake-como': 541757,
    'yellowstone-national-park': 1453306,
    'grand-teton-national-park': 1492555,
    'plitvice-lakes': 10047860,
    'masai-mara': 15467577,
    'okavango-delta': 349348,
    'danube-delta': 12436972,
    'daintree-rainforest': 10179476,
    'chocolate-hills': 15100962,
    'bering-strait': 11315299,
    'socotra': 1577075,
    'copacabana-beach-rio': 5514745,
}
for key, oid in SINGLE_RELATIONS.items():
    tags, polys = relation_polygons(oid)
    write_job(key, f'relation/{oid}', tags.get('name'), polys)
    time.sleep(1)

SINGLE_WAYS = {
    'moraine-lake': 356877446,
    'amsterdam-canals-d34-7': 222278733,
}
for key, oid in SINGLE_WAYS.items():
    tags, polys = way_polygon(oid)
    write_job(key, f'way/{oid}', tags.get('name'), polys)
    time.sleep(1)

MULTI_RELATIONS = {
    'banaue-rice-terraces-ph': (8167057, 7628655, 7137867, 8171344, 7575218),
    'santorini-caldera': (453964, 533902, 533905, 533903, 533904),
}
for key, oids in MULTI_RELATIONS.items():
    polys = []
    names = []
    for oid in oids:
        tags, p = relation_polygons(oid)
        polys += p
        names.append(tags.get('name'))
        print(f'  {key} part rel {oid}: name={tags.get("name")!r} areas={[round(area_km2(x[0]), 1) for x in p]}')
        time.sleep(1)
    write_job(key, '+'.join(f'relation/{o}' for o in oids), ' / '.join(str(n) for n in names), polys)
