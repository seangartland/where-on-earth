"""Mountain-ranges batch: spine geometry per range (BRIEF-mountain-ranges.md sourcing rules).
Method per range:
  osm-way  an OSM natural=mountain_range line way that runs the length of the range (open, not an outline).
  peaks    a polyline through the range's named principal peaks in order, peak coordinates from Wikidata P625.
Peak candidates (common.range_peaks + class filter here): P4552 chain to the range, P625, P2044 (normalized to
metres), an en.wikipedia article (chunk 3: an English label), instance of (a subclass of) mountain or summit. Data-driven outlier filters, no
hand coordinates: the peak must fall in one of the range's own Wikidata P17 countries (game country outlines), and
inside the OSM range-area outline where OSM has one (relation or closed way: an outline is a filter, never the spine).
Principal peaks: highest peak per 0.25-degree cell; the range's axis is the path between the two farthest-apart leaves of
the cells' minimum spanning tree; each peak takes the axis position of its nearest axis node; the highest peak per 80 km axis window, in axis
order, plus the axis ends; interior peaks where the line reverses (>150 deg) dropped; at most 60 points.
Usage (from demo/): python3 scripts/mountain-ranges/geometry.py <id> [<id> ...]
Writes .build-tmp/mountain-ranges/geometry-<id>.json and a PNG preview per range."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

QIDS = json.load(open(os.path.join(TMP, 'qids.json')))
OSM_SPINE = {'rocky-mountains': 1458309038, 'pyrenees': 1501963837}
# OSM range-area outlines (filters only): relations with type=boundary, closed natural=mountain_range ways.
OSM_AREA = {'alps': ('relation', 2698607), 'karakoram': ('relation', 10770937), 'carpathian-mountains': ('relation', 16391635),
            'caucasus-mountains': ('relation', 21368162), 'ural-mountains': ('relation', 21368163),
            'altai-mountains': ('relation', 21368166), 'himalayas': ('way', 1414235061)}
# great-dividing-range: no outline. OSM way 211234843 covers only Victoria and New South Wales, so it filtered out every
# Queensland peak (Bartle Frere, Thornton, Dalrymple, the McPherson peaks) though the article runs the range from Cape York.
# Wikidata sub-ranges left out, each because the range's own en.wikipedia article defines the range without it.
# hindu-kush: the article defines an 800 km range from central Afghanistan to the Pamir; the Sulaiman Mountains
# article calls that range "a north-south extension of the southern Hindu Kush mountain system", not the range.
# great-dividing-range: the article runs the range from Dauan Island to the Grampians in western Victoria; the Tasmanian
# Arthur and Frankland Ranges (P4552 Q192583) lie across Bass Strait, outside that definition.
EXCLUDE_SUBRANGES = {'hindu-kush': ['Q784189'],   # Q784189 Sulaiman Mountains (P4552 Q5472)
                     'great-dividing-range': ['Q14935605', 'Q1445117']}   # Arthur Range (Tasmania), Frankland Range
# Chunk 3's smaller ranges have few peaks with an en.wikipedia article (Tian Shan 26 against 84 named), so a named
# peak (English label) suffices there. Chunks 1-2 were banked with the article required and keep it, so their staged
# spines stay reproducible from this code.
ARTICLE_OPTIONAL = set(CHUNKS[2])
WINDOW_KM = 80      # backbone window: one principal peak (the highest) per 80 km of the range's axis
MAX_TURN = 150      # degrees: an interior peak where the path reverses sharper than this is a spike, dropped


def classed_peaks(qid, exclude=(), need_article=True):
    q = f'''SELECT DISTINCT ?p WHERE {{
      ?p wdt:P4552/wdt:P4552* wd:{qid} .
      ?p wdt:P31/wdt:P279* ?top . VALUES ?top {{ wd:Q8502 wd:Q207326 }} }}'''
    ok = {b['p']['value'].rsplit('/', 1)[1] for b in sparql(q)['results']['bindings']}
    for x in exclude:   # drop a sub-range's whole subtree
        q = f'SELECT DISTINCT ?p WHERE {{ ?p wdt:P4552/wdt:P4552* wd:{x} . }}'
        ok -= {b['p']['value'].rsplit('/', 1)[1] for b in sparql(q)['results']['bindings']}
    q = f'''SELECT DISTINCT ?p ?elev WHERE {{
      ?p wdt:P4552/wdt:P4552* wd:{qid} ; p:P2044/psn:P2044/wikibase:quantityAmount ?elev . }}'''
    metres = {}
    for b in sparql(q)['results']['bindings']:
        pid = b['p']['value'].rsplit('/', 1)[1]; metres[pid] = max(metres.get(pid, -1e9), float(b['elev']['value']))
    out = []
    for p in range_peaks(qid, need_article=need_article):
        if p['qid'] in ok and p['qid'] in metres:
            out.append({**p, 'elev': round(metres[p['qid']])})
    return sorted(out, key=lambda r: -r['elev'])


def range_iso3(qid):
    ent = wd_entities([qid])[qid]
    cs = [c['id'] for c in claim(ent, 'P17')]
    iso = set()
    for k, e in wd_entities(cs).items():
        iso.update(claim(e, 'P298'))
    return iso


def osm_rings(kind, oid):
    d = get(f'https://api.openstreetmap.org/api/0.6/{kind}/{oid}/full.json')
    nodes = {e['id']: (e['lon'], e['lat']) for e in d['elements'] if e['type'] == 'node'}
    ways = {e['id']: [nodes[n] for n in e['nodes']] for e in d['elements'] if e['type'] == 'way'}
    if kind == 'way': return [ways[oid]]
    rel = next(e for e in d['elements'] if e['type'] == 'relation' and e['id'] == oid)
    segs = [ways[m['ref']] for m in rel['members'] if m['type'] == 'way' and m.get('role', 'outer') in ('outer', '')]
    rings = []
    while segs:   # chain member ways into closed rings by shared endpoints
        r = list(segs.pop(0))
        while r[0] != r[-1]:
            for k, s in enumerate(segs):
                if s[0] == r[-1]: r += s[1:]; segs.pop(k); break
                if s[-1] == r[-1]: r += s[::-1][1:]; segs.pop(k); break
            else: break
        rings.append(r)
    return rings


def km(a, b): return hav(a['lat'], a['lng'], b['lat'], b['lng'])


def open_path(pts):
    if len(pts) < 3: return pts
    far = max(((i, j) for i in range(len(pts)) for j in range(i + 1, len(pts))), key=lambda ij: km(pts[ij[0]], pts[ij[1]]))
    rest = [p for k, p in enumerate(pts) if k != far[0]]; path = [pts[far[0]]]
    while rest:
        k = min(range(len(rest)), key=lambda k: km(path[-1], rest[k])); path.append(rest.pop(k))
    improved = True
    while improved:   # 2-opt on the open path
        improved = False
        for i in range(0, len(path) - 2):
            for j in range(i + 2, len(path) - 1):
                if km(path[i], path[j]) + km(path[i + 1], path[j + 1]) < km(path[i], path[i + 1]) + km(path[j], path[j + 1]) - 1e-9:
                    path[i + 1:j + 1] = path[i + 1:j + 1][::-1]; improved = True
        for j in range(1, len(path) - 1):   # reversing a tail is free at the open end
            if km(path[j - 1], path[-1]) < km(path[j - 1], path[j]) - 1e-9:
                path[j:] = path[j:][::-1]; improved = True
    return path


def backbone(pts):
    """Path through the minimum spanning tree over pts between its two farthest-apart leaves: the range's axis,
    following arcs without looping back the way a tour does. Distances equirectangular at the cloud's mean latitude."""
    n = len(pts); c = math.cos(math.radians(sum(p['lat'] for p in pts) / n))
    def d(i, j): return math.hypot((pts[i]['lng'] - pts[j]['lng']) * c, pts[i]['lat'] - pts[j]['lat']) * 111.2
    inside, best, parent = [False] * n, [float('inf')] * n, [-1] * n; best[0] = 0; adj = [[] for _ in range(n)]
    for _ in range(n):   # Prim
        u = min((k for k in range(n) if not inside[k]), key=lambda k: best[k]); inside[u] = True
        if parent[u] >= 0: adj[u].append(parent[u]); adj[parent[u]].append(u)
        for v in range(n):
            if not inside[v]:
                w = d(u, v)
                if w < best[v]: best[v], parent[v] = w, u
    # Ends: the two tree leaves farthest apart on the ground (the range's extremities), joined by their tree path.
    # The plain tree diameter can detour into a long side branch and miss a true end (the eastern Alps).
    leaves = [k for k in range(n) if len(adj[k]) <= 1]
    a, b = max(((i, j) for x, i in enumerate(leaves) for j in leaves[x + 1:]), key=lambda ij: km(pts[ij[0]], pts[ij[1]]))
    dist, prev, stack = {a: 0.0}, {a: None}, [a]
    while stack:
        u = stack.pop()
        for v in adj[u]:
            if v not in dist: dist[v] = 0; prev[v] = u; stack.append(v)
    path, k = [], b
    while k is not None: path.append(k); k = prev[k]
    return [pts[k] for k in path]


ELEV_FLOOR = 0.35   # principal peak: at least 35% of the range's highest candidate (drops hills and mis-assigned knolls)


def principal(cands):
    top = max(p['elev'] for p in cands)
    cands = [p for p in cands if p['elev'] >= ELEV_FLOOR * top]
    cells = {}
    for p in cands:
        c = (int((p['lat'] + 90) // 0.25), int((p['lng'] + 180) // 0.25))
        if c not in cells or p['elev'] > cells[c]['elev']: cells[c] = p
    pts = list(cells.values())
    axis = backbone(pts)
    pos = [0.0]
    for i in range(1, len(axis)): pos.append(pos[-1] + km(axis[i - 1], axis[i]))
    windows = max(8, min(45, round(pos[-1] / WINDOW_KM)))
    best = {}
    for p in pts:   # each peak takes the backbone position of its nearest backbone node
        k = min(range(len(axis)), key=lambda k: km(p, axis[k]))
        w = min(windows - 1, int(pos[k] / pos[-1] * windows)) if pos[-1] else 0
        if w not in best or p['elev'] > best[w][0]['elev']: best[w] = (p, pos[k])
    out = [best[w][0] for w in sorted(best)]
    for end, at in ((axis[0], 0), (axis[-1], len(out))):   # the backbone's ends, so the spine spans the range
        if end not in out: out.insert(at, end)
    while True:   # drop spikes: interior peaks where the line reverses
        worst = None
        for i in range(1, len(out) - 1):
            p, q, r = out[i - 1], out[i], out[i + 1]
            cc = math.cos(math.radians(q['lat']))
            v1 = ((q['lng'] - p['lng']) * cc, q['lat'] - p['lat']); v2 = ((r['lng'] - q['lng']) * cc, r['lat'] - q['lat'])
            ang = abs(math.degrees(math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1])))
            if ang > MAX_TURN and (worst is None or ang > worst[0]): worst = (ang, i)
        if not worst: break
        out.pop(worst[1])
    return out, len(cells), round(pos[-1])


def build(rid):
    qid = QIDS[rid]; rec = dict(id=rid, qid=qid)
    ent = wd_entities([qid])[qid]
    p625 = claim(ent, 'P625'); rec['wikidataP625'] = [[round(c['latitude'], 5), round(c['longitude'], 5)] for c in p625]
    iso = range_iso3(qid); rec['p17iso3'] = sorted(iso)
    cands = classed_peaks(qid, EXCLUDE_SUBRANGES.get(rid, ()), rid not in ARTICLE_OPTIONAL); rec['candidates'] = len(cands)
    if rid in EXCLUDE_SUBRANGES: rec['excludedSubranges'] = EXCLUDE_SUBRANGES[rid]
    area = osm_rings(*OSM_AREA[rid]) if rid in OSM_AREA else None
    kept, dropped = [], []
    for p in cands:
        c3, _ = country_at(p['lng'], p['lat'])
        if c3 not in iso: dropped.append((p['name'], 'country ' + str(c3))); continue
        if area and not any(pip(p['lng'], p['lat'], r) for r in area if len(r) > 3): dropped.append((p['name'], 'outside OSM area')); continue
        kept.append(p)
    rec['filtered'] = len(kept); rec['droppedSample'] = dropped[:15]; rec['droppedCount'] = len(dropped)
    if area: rec['osmArea'] = f'{OSM_AREA[rid][0]} {OSM_AREA[rid][1]}'
    if rid in OSM_SPINE:
        wid = OSM_SPINE[rid]
        d = get(f'https://api.openstreetmap.org/api/0.6/way/{wid}/full.json')
        nodes = {e['id']: [e['lon'], e['lat']] for e in d['elements'] if e['type'] == 'node'}
        way = next(e for e in d['elements'] if e['type'] == 'way')
        raw = [nodes[n] for n in way['nodes']]
        rec['method'] = f'OSM way {wid} (natural=mountain_range line, chained as mapped)'
        rec['sourceUrl'] = f'https://www.openstreetmap.org/way/{wid}'
        rec['license'], rec['attribution'] = 'ODbL', '© OpenStreetMap contributors'
        peaks = []
    else:
        path, cells, axis_km = principal(kept); rec['cells'] = cells; rec['backboneKm'] = axis_km
        raw = [[round(p['lng'], 5), round(p['lat'], 5)] for p in path]
        peaks = [dict(name=p['name'], qid=p['qid'], lat=round(p['lat'], 5), lng=round(p['lng'], 5), elev=p['elev']) for p in path]
        rec['method'] = f'simplified polyline through {len(path)} named principal peaks in order (Wikidata P625)'
        rec['sourceUrl'] = f'https://www.wikidata.org/wiki/{qid}'
        rec['license'], rec['attribution'] = 'CC0', 'Wikidata'
    spine, tol = simplify_to(raw, 60)
    spine = [[round(x, 4), round(y, 4)] for x, y in spine]
    rec.update(peaks=peaks, sourceVertices=len(raw), vertices=len(spine), toleranceDeg=round(tol, 4),
               maxDeviationKm=round(max_deviation(raw, spine), 3), lengthKm=round(line_km(spine)), spine=spine)
    mid = along(spine, 0.5); rec['midpoint'] = [round(mid[1], 5), round(mid[0], 5)]
    rec['midpointCountry'] = country_at(mid[0], mid[1])[1]
    sh = country_shares(spine)
    rec['shares'] = [[k[1] if k else None, v] for k, v in sh]
    rec['shareIso3'] = [[k[0] if k else None, v] for k, v in sh]
    # Spine through the range: distance from each kept candidate (top 25 by elevation) to the shipped spine.
    top = kept[:25]
    rec['topPeakKm'] = sorted(round(nearest_km(spine, p['lat'], p['lng']), 1) for p in top)
    rec['p625Km'] = [round(nearest_km(spine, a, b), 1) for a, b in rec['wikidataP625']]
    json.dump(rec, open(os.path.join(TMP, f'geometry-{rid}.json'), 'w'), ensure_ascii=False, indent=1)
    plot(rec, kept, area)
    return rec


def plot(rec, kept, area):
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    xs = [p[0] for p in rec['spine']]; ys = [p[1] for p in rec['spine']]
    pad = max(1.5, (max(xs) - min(xs)) * 0.15, (max(ys) - min(ys)) * 0.15)
    box = (min(xs) - pad, max(xs) + pad, min(ys) - pad, max(ys) + pad)
    fig, ax = plt.subplots(figsize=(7, 7))
    for iso3, name, rings, (a, b, c, d) in countries():
        if c < box[0] or a > box[1] or d < box[2] or b > box[3]: continue
        for poly in rings:
            r = poly[0]; ax.plot([p[0] for p in r], [p[1] for p in r], color='#999', lw=0.6)
    if area:
        for r in area: ax.plot([p[0] for p in r], [p[1] for p in r], color='#6a6', lw=0.8)
    ax.scatter([p['lng'] for p in kept], [p['lat'] for p in kept], s=3, color='#c88')
    ax.plot(xs, ys, color='#c00', lw=1.6); ax.scatter(xs, ys, s=10, color='#c00')
    ax.scatter([rec['midpoint'][1]], [rec['midpoint'][0]], s=60, marker='*', color='#00c', zorder=5)
    ax.set_xlim(box[0], box[1]); ax.set_ylim(box[2], box[3]); ax.set_aspect(1 / max(0.2, math.cos(math.radians(sum(ys) / len(ys)))))
    ax.set_title(f"{rec['id']}: {rec['vertices']} pts, {rec['lengthKm']} km")
    fig.savefig(os.path.join(TMP, f"geometry-{rec['id']}.png"), dpi=80); plt.close(fig)


if __name__ == '__main__':
    for rid in sys.argv[1:]:
        r = build(rid)
        print(f"{rid}: {r['method']} | candidates {r['candidates']} kept {r['filtered']} (dropped {r['droppedCount']}) | "
              f"{r['vertices']} pts {r['lengthKm']} km dev {r['maxDeviationKm']} | mid {r['midpoint']} {r['midpointCountry']} | "
              f"shares {r['shares'][:4]} | top25 km median {r['topPeakKm'][len(r['topPeakKm'])//2] if r['topPeakKm'] else None} max {max(r['topPeakKm']) if r['topPeakKm'] else None} | P625 km {r['p625Km']}")
