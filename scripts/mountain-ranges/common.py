"""Shared helpers for the mountain-ranges batch (BRIEF-mountain-ranges.md, 2026-11-10).
HTTP answers are cached in .build-tmp/mountain-ranges/cache.json so re-runs are offline."""
import json, math, os, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..'))
HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(ROOT, '.build-tmp/mountain-ranges')
os.makedirs(TMP, exist_ok=True)
CACHE_F = os.path.join(TMP, 'cache.json')
CACHE = json.load(open(CACHE_F)) if os.path.exists(CACHE_F) else {}
UA = {'User-Agent': 'map-game-difficulty/0.3 (where-on-earth; gartland.79 at gmail)'}

# The 19 ranges of the brief, in brief order: id -> en.wikipedia title (verified to be the range article).
RANGES = {
    'himalayas': 'Himalayas', 'andes': 'Andes', 'alps': 'Alps', 'rocky-mountains': 'Rocky Mountains',
    'appalachian-mountains': 'Appalachian Mountains', 'hindu-kush': 'Hindu Kush', 'karakoram': 'Karakoram',
    'carpathian-mountains': 'Carpathian Mountains', 'ural-mountains': 'Ural Mountains', 'pyrenees': 'Pyrenees',
    'atlas-mountains': 'Atlas Mountains', 'caucasus-mountains': 'Caucasus Mountains', 'zagros-mountains': 'Zagros Mountains',
    'tian-shan': 'Tian Shan', 'altai-mountains': 'Altai Mountains', 'drakensberg': 'Drakensberg',
    'great-dividing-range': 'Great Dividing Range', 'ethiopian-highlands': 'Ethiopian Highlands', 'southern-alps': 'Southern Alps',
}
CHUNKS = [list(RANGES)[:7], list(RANGES)[7:13], list(RANGES)[13:]]


def save():
    tmp = CACHE_F + '.tmp'
    json.dump(CACHE, open(tmp, 'w'))
    os.replace(tmp, CACHE_F)


def get(u, data=None, tries=6):
    key = u + ('\n' + data if data else '')
    if key in CACHE: return CACHE[key]
    err = None
    for t in range(tries):
        try:
            req = urllib.request.Request(u, data=data.encode() if data else None, headers=UA)
            r = json.load(urllib.request.urlopen(req, timeout=180)); CACHE[key] = r; save(); return r
        except urllib.error.HTTPError as e:
            if e.code == 404: CACHE[key] = None; save(); return None
            err = e
        except Exception as e: err = e
        time.sleep(3 + 5 * t)
    raise err


def wd_entities(qids):
    out = {}
    for k in range(0, len(qids), 50):
        r = get('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|labels|sitelinks&languages=en'
                '&sitefilter=enwiki&ids=' + '|'.join(qids[k:k + 50]))
        out.update(r['entities'])
    return out


def claim(ent, p):
    return [c['mainsnak'].get('datavalue', {}).get('value') for c in ent.get('claims', {}).get(p, []) if c['mainsnak'].get('datavalue')]


def overpass(q):
    return get('https://overpass-api.de/api/interpreter', data='data=' + urllib.parse.quote(q))


def hav(a, b, c, d):
    p = math.pi / 180; h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(min(1, h)))


# --- Geometry ---------------------------------------------------------------------------------------------
DEG = math.pi / 180


def line_km(line):
    """line: [[lng, lat], ...]"""
    return sum(hav(line[i - 1][1], line[i - 1][0], line[i][1], line[i][0]) for i in range(1, len(line)))


def simplify(points, tolerance):
    """Douglas-Peucker in degrees with cos(lat) scaling, as build/build-line-extents.py (63e580b)."""
    if len(points) < 3: return points
    keep = bytearray(len(points)); keep[0] = keep[-1] = 1
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
            if d > maximum: maximum, selected = d, i
        if selected >= 0:
            keep[selected] = 1; stack.append((start, selected)); stack.append((selected, end))
    return [p for p, k in zip(points, keep) if k]


def simplify_to(points, max_points=60):
    """Smallest DP tolerance (x1.25 steps from 0.001 deg) that leaves at most max_points vertices."""
    tol = 0.001
    out = simplify(points, tol)
    while len(out) > max_points:
        tol *= 1.25; out = simplify(points, tol)
    return out, tol


def nearest_km(line, lat, lng):
    """Same projection as src/game/extents.js nearestOnLines, distance by haversine."""
    c = max(0.05, math.cos(lat * DEG)); best = float('inf')
    for i in range(1, len(line)):
        ax, ay = (line[i - 1][0] - lng) * c, line[i - 1][1] - lat
        bx, by = (line[i][0] - lng) * c, line[i][1] - lat
        dx, dy = bx - ax, by - ay; ln = dx * dx + dy * dy
        t = min(1, max(0, -(ax * dx + ay * dy) / ln)) if ln else 0
        best = min(best, hav(lat, lng, lat + ay + dy * t, lng + (ax + dx * t) / c))
    return best


def max_deviation(original, simplified):
    return max(nearest_km(simplified, p[1], p[0]) for p in original)


def along(line, frac):
    """Point at fraction frac of the line's length."""
    total, target, acc = line_km(line), None, 0.0
    target = total * frac
    for i in range(1, len(line)):
        seg = hav(line[i - 1][1], line[i - 1][0], line[i][1], line[i][0])
        if acc + seg >= target and seg > 0:
            t = (target - acc) / seg
            return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t]
        acc += seg
    return line[-1]


def resample(line, step_km):
    total = line_km(line); n = max(2, int(total / step_km) + 1)
    return [along(line, k / (n - 1)) for k in range(n)]


_COUNTRIES = None


def countries():
    """Decoded assets/country-outlines.topo.json: [(iso3, name, [rings], bbox)]. The game's own worldview."""
    global _COUNTRIES
    if _COUNTRIES is not None: return _COUNTRIES
    d = json.load(open(os.path.join(ROOT, 'assets/country-outlines.topo.json')))
    (sx, sy), (tx, ty) = d['transform']['scale'], d['transform']['translate']
    arcs = []
    for a in d['arcs']:
        x = y = 0; pts = []
        for dx, dy in a:
            x += dx; y += dy; pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(idx):
        pts = []
        for k in idx:
            seg = arcs[k] if k >= 0 else arcs[~k][::-1]
            pts.extend(seg if not pts else seg[1:])
        return pts
    out = []
    for g in list(d['objects'].values())[0]['geometries']:
        polys = [g['arcs']] if g['type'] == 'Polygon' else g['arcs'] if g['type'] == 'MultiPolygon' else []
        rings = [[ring(r) for r in poly] for poly in polys]
        xs = [p[0] for poly in rings for p in poly[0]]; ys = [p[1] for poly in rings for p in poly[0]]
        if xs: out.append((g.get('id'), g['properties']['name'], rings, (min(xs), min(ys), max(xs), max(ys))))
    _COUNTRIES = out
    return out


def pip(x, y, r):
    inside = False
    for i in range(len(r)):
        (xi, yi), (xj, yj) = r[i], r[i - 1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: inside = not inside
    return inside


def country_at(lng, lat):
    for iso3, name, rings, (a, b, c, d) in countries():
        if a <= lng <= c and b <= lat <= d:
            for poly in rings:
                if pip(lng, lat, poly[0]) and not any(pip(lng, lat, h) for h in poly[1:]): return iso3, name
    return None, None


def country_shares(line, step_km=5):
    """Share of the spine's length per country (game outlines), sampled every step_km."""
    pts = resample(line, step_km); tally = {}
    for p in pts:
        k = country_at(p[0], p[1]); tally[k] = tally.get(k, 0) + 1
    return sorted(((k, round(v / len(pts), 3)) for k, v in tally.items()), key=lambda kv: -kv[1])


def sparql(q):
    return get('https://query.wikidata.org/sparql?format=json&query=' + urllib.parse.quote(q))


def range_peaks(qid, need_article=True):
    """Wikidata peaks whose P4552 (mountain range) is the range or one of its sub-ranges (P4552 chain), with
    P625, P2044 and an en.wikipedia article (named principal peaks); need_article=False takes an English label
    (named peaks) instead and, for a peak with several P625 values, keeps the one nearest the median of the range's
    candidates (Q724367 Belukha also carries a point 2,000 km east, in Zabaykalsky). need_article=True (chunks 1-2, as
    banked) keeps the first-returned coordinate: their multi-P625 peaks differ by at most 2.4 km. Sub-range items
    themselves are excluded."""
    art_q = ('?article schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> .' if need_article else
             'OPTIONAL { ?article schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> . }')
    q = f'''SELECT DISTINCT ?p ?label ?coord ?elev ?article WHERE {{
      ?p wdt:P4552/wdt:P4552* wd:{qid} ; wdt:P625 ?coord ; wdt:P2044 ?elev .
      FILTER NOT EXISTS {{ ?p wdt:P31 wd:Q46831 }}
      {art_q}
      ?p rdfs:label ?label . FILTER(LANG(?label) = "en") }}'''
    rows, coords = {}, {}
    for b in sparql(q)['results']['bindings']:
        pid = b['p']['value'].rsplit('/', 1)[1]
        if not b['coord']['value'].startswith('Point('): continue   # unknown-value coordinate (genid)
        if b['elev']['value'].startswith('http'): continue          # unknown-value elevation (genid)
        lng, lat = map(float, b['coord']['value'][6:-1].split())
        coords.setdefault(pid, set()).add((lat, lng))
        elev = float(b['elev']['value'])
        art = urllib.parse.unquote(b['article']['value'].rsplit('/', 1)[1]).replace('_', ' ') if 'article' in b else None
        if pid not in rows or elev > rows[pid]['elev']:
            rows[pid] = dict(qid=pid, name=b['label']['value'], lat=lat, lng=lng, elev=elev, article=art)
    if rows and not need_article:
        mlat = sorted(r['lat'] for r in rows.values())[len(rows) // 2]; mlng = sorted(r['lng'] for r in rows.values())[len(rows) // 2]
        for pid, r in rows.items():
            if len(coords[pid]) > 1: r['lat'], r['lng'] = min(coords[pid], key=lambda c: hav(c[0], c[1], mlat, mlng))
    return sorted(rows.values(), key=lambda r: -r['elev'])
