#!/usr/bin/env python3
# Build line extents for great-wall-of-china, panama-canal, hadrians-wall.
# Sources are OpenStreetMap (ODbL). Follows the make-extents.mjs conventions:
# Douglas-Peucker simplification in degrees, max deviation measured against
# the source geometry, metadata fields matching the existing entries.
# Mapped features arrive as fragments: exact endpoint chaining first, then
# greedy closest-first bridging of gaps up to GAP_KM (documented per entry).
# Writes a preview JSON plus stats; does not touch assets/extents.json.
import json, math, os
import xml.etree.ElementTree as ET
import numpy as np

DEG = math.pi / 180
OUT = '.build-tmp/line-extents-preview.json'
GAP_KM = 2.0

def dist_km(a, b):
    p, q = a[1] * DEG, b[1] * DEG
    x = (b[1] - a[1]) * DEG
    y = (b[0] - a[0]) * DEG
    h = math.sin(x / 2) ** 2 + math.cos(p) * math.cos(q) * math.sin(y / 2) ** 2
    return 12742 * math.asin(min(1.0, math.sqrt(h)))

def line_length(line):
    return sum(dist_km(line[i - 1], line[i]) for i in range(1, len(line)))

def key(pt):
    return (round(pt[0], 6), round(pt[1], 6))

def merge_lines(segments):
    segs = [list(s) for s in segments if len(s) >= 2]
    changed = True
    while changed:
        changed = False
        ends = {}
        for i, s in enumerate(segs):
            ends.setdefault(key(s[0]), []).append((i, 0))
            ends.setdefault(key(s[-1]), []).append((i, 1))
        for hits in ends.values():
            if len(hits) < 2:
                continue
            (i, ei), (j, ej) = hits[0], hits[1]
            if i == j:
                continue
            a, b = segs[i], segs[j]
            if ei == 1 and ej == 0:
                joined = a + b[1:]
            elif ei == 0 and ej == 1:
                joined = b + a[1:]
            elif ei == 1 and ej == 1:
                joined = a + list(reversed(b))[1:]
            else:
                joined = list(reversed(a)) + b[1:]
            segs[i] = joined
            segs[j] = []
            changed = True
            break
        segs = [s for s in segs if len(s) >= 2]
    return segs

def bridge_gaps(lines, gap_km):
    # Rounds of greedy closest-first joins. Endpoints are bucketed in a grid
    # so candidate pairs within gap_km are cheap to find; each endpoint can
    # take part in one join per round.
    lines = [list(l) for l in lines if len(l) >= 2]
    cell = 0.05
    while True:
        buckets = {}
        ends = []  # (line_idx, end 0/1, pt)
        for i, l in enumerate(lines):
            for e, pt in ((0, l[0]), (1, l[-1])):
                ends.append((i, e, pt))
                bx, by = int(pt[0] / cell), int(pt[1] / cell)
                buckets.setdefault((bx, by), []).append(len(ends) - 1)
        pairs = []
        for idx, (i, e, pt) in enumerate(ends):
            bx, by = int(pt[0] / cell), int(pt[1] / cell)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for jdx in buckets.get((bx + dx, by + dy), []):
                        if jdx <= idx:
                            continue
                        j, e2, pt2 = ends[jdx]
                        if j == i:
                            continue
                        d = dist_km(pt, pt2)
                        if d <= gap_km:
                            pairs.append((d, idx, jdx))
        if not pairs:
            return lines
        pairs.sort()
        used_end, used_line = set(), {}
        joins = []
        for d, a, b in pairs:
            if a in used_end or b in used_end:
                continue
            ia, ea, _ = ends[a]
            ib, eb, _ = ends[b]
            if ia in used_line or ib in used_line:
                continue
            used_end.add(a); used_end.add(b)
            used_line[ia] = used_line[ib] = True
            joins.append((ia, ea, ib, eb))
        if not joins:
            return lines
        for ia, ea, ib, eb in joins:
            a, b = lines[ia], lines[ib]
            if ea == 1 and eb == 0:
                lines[ia] = a + b
            elif ea == 0 and eb == 1:
                lines[ia] = b + a
            elif ea == 1 and eb == 1:
                lines[ia] = a + list(reversed(b))
            else:
                lines[ia] = list(reversed(a)) + b
            lines[ib] = []
        lines = [l for l in lines if len(l) >= 2]

def simplify(points, tolerance):
    if len(points) < 3:
        return points
    keep = bytearray(len(points))
    keep[0] = keep[-1] = 1
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        cos = math.cos((points[start][1] + points[end][1]) / 2 * DEG)
        x, y = points[start][0] * cos, points[start][1]
        dx, dy = points[end][0] * cos - x, points[end][1] - y
        length = math.hypot(dx, dy)
        selected, maximum = -1, tolerance
        for i in range(start + 1, end):
            u, v = points[i][0] * cos - x, points[i][1] - y
            d = abs(u * dy - v * dx) / length if length > 1e-12 else math.hypot(u, v)
            if d > maximum:
                maximum, selected = d, i
        if selected >= 0:
            keep[selected] = 1
            stack.append((start, selected))
            stack.append((selected, end))
    return [p for p, k in zip(points, keep) if k]

def deviation_for_line(original, simplified):
    # Max over original vertices of the distance to the nearest point on the
    # simplified polyline of the same line (min over segments, then max over
    # points), equirectangular projection, chunked over points.
    if len(simplified) < 2 or not original:
        return 0.0
    pts = np.array(original, dtype=np.float64)
    seg = np.array(simplified, dtype=np.float64)
    worst = 0.0
    for start in range(0, len(pts), 2000):
        chunk = pts[start:start + 2000]
        best = np.full(len(chunk), np.inf)
        for i in range(1, len(seg)):
            a, b = seg[i - 1], seg[i]
            c = max(0.05, math.cos((a[1] + b[1]) / 2 * DEG))
            ax, ay = (a[0] - chunk[:, 0]) * c, a[1] - chunk[:, 1]
            sdx, sdy = (b[0] - a[0]) * c, b[1] - a[1]
            ln = sdx * sdx + sdy * sdy
            t = np.clip(-(ax * sdx + ay * sdy) / ln, 0.0, 1.0) if ln > 0 else np.zeros(len(chunk))
            qx = chunk[:, 0] + (ax + sdx * t) / c
            qy = chunk[:, 1] + ay + sdy * t
            p1 = chunk[:, 1] * DEG
            p2 = qy * DEG
            xx = (qy - chunk[:, 1]) * DEG
            yy = (qx - chunk[:, 0]) * DEG
            h = np.sin(xx / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(yy / 2) ** 2
            d = 12742 * np.arcsin(np.sqrt(np.clip(h, 0, 1)))
            best = np.minimum(best, d)
        worst = max(worst, float(best.max()))
    return worst

def finish(entry_id, raw_lines, min_km, tolerance, source, source_url, gap_km=GAP_KM):
    total_in = sum(line_length(l) for l in raw_lines)
    merged = merge_lines(raw_lines)
    merged = bridge_gaps(merged, gap_km)
    kept = [l for l in merged if line_length(l) >= min_km]
    kept.sort(key=line_length, reverse=True)
    simplified, dev = [], 0.0
    for tol in (tolerance, tolerance / 2, tolerance / 4, tolerance / 8):
        simplified = [simplify(l, tol) for l in kept]
        dev = max(deviation_for_line(o, s) for o, s in zip(kept, simplified))
        if dev <= 2.5:
            break
    entry = {
        'type': 'line',
        'lines': [[[round(x, 4), round(y, 4)] for x, y in l] for l in simplified],
        'source': source,
        'sourceUrl': source_url,
        'license': 'ODbL',
        'attribution': '© OpenStreetMap contributors',
        'sourceVertices': sum(len(l) for l in kept),
        'vertices': sum(len(l) for l in simplified),
        'maxDeviationKm': round(dev, 3),
        'lengthKm': round(sum(line_length(l) for l in simplified)),
    }
    print(f"{entry_id}: input {total_in:.0f} km / {len(raw_lines)} segments; "
          f"kept {len(kept)} lines, simplified length {entry['lengthKm']} km, "
          f"vertices {entry['vertices']}, max deviation {dev:.2f} km")
    for l in kept:
        print(f"   line {line_length(l):7.0f} km  ({l[0][1]:.2f},{l[0][0]:.2f}) -> ({l[-1][1]:.2f},{l[-1][0]:.2f})")
    return entry

def wall_segments():
    nodes, ways = {}, []
    for event, el in ET.iterparse('build/extent-sources/wall-full.osm', events=('end',)):
        if el.tag == 'node':
            nodes[el.get('id')] = (float(el.get('lon')), float(el.get('lat')))
            el.clear()
        elif el.tag == 'way':
            refs = [nd.get('ref') for nd in el.findall('nd')]
            pts = [nodes[r] for r in refs if r in nodes]
            if len(pts) >= 2:
                ways.append(pts)
            el.clear()
    print(f"wall: {len(nodes)} nodes, {len(ways)} ways")
    return ways

def hadrian_segments():
    d = json.load(open('build/extent-sources/hadrians-wall-overpass.json'))
    segs = []
    for el in d['elements']:
        if el['type'] == 'relation':
            for m in el.get('members', []):
                g = m.get('geometry') or []
                if len(g) >= 2:
                    segs.append([(p['lon'], p['lat']) for p in g])
        elif el['type'] == 'way' and el.get('geometry'):
            segs.append([(p['lon'], p['lat']) for p in el['geometry']])
    print(f"hadrian: {len(segs)} segments")
    return segs

def panama_segments():
    d = json.load(open('build/extent-sources/panama-canal-waterway.json'))
    segs = []
    for el in d['elements']:
        g = el.get('geometry') or []
        # Corridor filter: the canal runs west of -79.50; drop unrelated
        # drainage canals east of the Chagres basin.
        if len(g) >= 2 and all(p['lon'] <= -79.50 for p in g):
            segs.append([(p['lon'], p['lat']) for p in g])
    print(f"panama: {len(segs)} segments in corridor")
    return segs

out = {}
out['great-wall-of-china'] = finish(
    'great-wall-of-china', wall_segments(), min_km=10, tolerance=0.01, gap_km=2.0,
    source='OpenStreetMap relation 318110 (Great Wall): fragments chained and gaps up to 2 km bridged; lines of 10 km or more kept (main lines and major branches)',
    source_url='https://www.openstreetmap.org/relation/318110')
out['hadrians-wall'] = finish(
    'hadrians-wall', hadrian_segments(), min_km=3, tolerance=0.005, gap_km=3.0,
    source="OpenStreetMap relation 5538074 (Hadrian's Wall): fragments chained and gaps up to 3 km bridged",
    source_url='https://www.openstreetmap.org/relation/5538074')
out['panama-canal'] = finish(
    'panama-canal', panama_segments(), min_km=3, tolerance=0.005, gap_km=3.0,
    source='OpenStreetMap waterway=canal ways in the Panama Canal corridor (Canal de Panamá and connecting channel segments), chained with gaps up to 3 km bridged',
    source_url='https://www.openstreetmap.org/')
os.makedirs('.build-tmp', exist_ok=True)
json.dump(out, open(OUT, 'w'), ensure_ascii=False)
print('preview written to', OUT, os.path.getsize(OUT), 'bytes')
