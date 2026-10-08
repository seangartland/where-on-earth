"""S term input (framework §2.7): classify every location, measure extentKm for extended features.

Decision 2 (README): no area-based guesses. Each item's own enwiki article -> Wikidata P31
(instance of) -> class by P31 English label:
  point     settlements, buildings, monuments, summits, waterfalls, ...: the pin IS the
            canonical point, so R <= 25 km by construction and S = 0.
  extended  lakes, deserts, rivers, ranges, parks, reefs, islands, regions, ...: R is
            MEASURED from the OpenStreetMap object(s) tagged wikidata=<Q> (ids via Overpass,
            geometry via Nominatim lookup). R = max great-circle km from the pin to any vertex.
No OSM geometry -> R from the Natural Earth 10m physical polygon with the same WIKIDATAID
(geography regions / marine polys), then the Wikidata extreme points (P1332-P1335); otherwise
unmeasured (S=0, flagged). Never estimated from area. Prints progress every 500 items and exits
with a STALL error if one item exceeds 10 min (cache is saved; a rerun resumes).

Usage: python3 extent.py            -> extent.json (+ extent-cache.json)
"""
import json, os, re, signal, time, urllib.parse, urllib.request
import numpy as np
import wiki
from wiki import hav, get_json

HERE = os.path.dirname(os.path.abspath(__file__))
LOCS = os.path.join(HERE, '..', '..', 'assets', 'locations.json')
CACHE = os.path.join(HERE, 'extent-cache.json')
WD = 'https://www.wikidata.org/w/api.php'
OVERPASS = 'https://overpass-api.de/api/interpreter'
UA = wiki.UA

# P31-label keyword classes, checked in this order (first hit wins). Settlement beats
# everything: a city that is also "on a lake" is a city.
CITY = r'\b(city|town|village|municipality|capital|metropolis|commune|settlement|borough|suburb|' \
       r'neighbou?rhood|ward|quarter|hamlet|port city|megacity|big city|urban area|township|locality|' \
       r'human settlement|county seat|census-designated place|old town|historic centre|historic center)\b'
NATURAL = r'\b(lake|reservoir|desert|river|stream|mountain range|range|national park|protected area|' \
          r'nature reserve|park|reef|atoll|delta|island|islands|archipelago|forest|rainforest|glacier|' \
          r'ice (?:shelf|sheet|field|cap)|sea|bay|peninsula|valley|plateau|coast|strait|gulf|fjord|lagoon|' \
          r'basin|steppe|savanna|plain|highland|wetland|marsh|swamp|geographic region|natural region|' \
          r'region|sound|canyon|gorge|estuary|biosphere reserve|wilderness|massif|dune|salt flat|' \
          r'karst|caldera|mountain system|hills|upland|ocean|cave system|wine region|landscape|' \
          r'conservation area|marine park|wildlife sanctuary|game reserve|heath|moor|viticultural area)\b'
ADMIN = r'\b(state|province|county|region of|administrative|territory|prefecture|oblast|krai|' \
        r'department|canton|emirate|governorate|district|country|dependent territory|autonomous)\b'
POINTISH = r'\b(mountain|volcano|summit|peak|stratovolcano|waterfall|cape|headland|lighthouse|' \
           r'hill|rock formation|monolith|inselberg|crater|geyser|spring|beach|cave|arch)\b'
CANAL = r'\b(canal|road|highway|railway|scenic route|trail|wall|bridge)\b'

_c = json.load(open(CACHE)) if os.path.exists(CACHE) else {'qid': {}, 'claims': {}, 'labels': {}, 'osm': {}}


def save():
    json.dump(_c, open(CACHE, 'w'), indent=0, ensure_ascii=False)


def own_title(x, meas):
    """The item's OWN article: first candidate (short, clue name, ...) that resolves to a
    non-disambiguation page within the match radius. Not the most-viewed one, which can be a
    parent ('Mississippi River' for a delta pin). Falls back to the F title."""
    lim = max(wiki.MATCH_KM, 2 * x.get('extentKm', 0))
    for cand, r in wiki.resolve(wiki.candidates(x)).items():
        if r and not r['disambig'] and r['lat'] is not None and hav(x['lat'], x['lng'], r['lat'], r['lng']) <= lim:
            return r['title']
    for cand in (x['short'], f"{x['short']}, {x['country']}"):     # e.g. 'Dead Sea' has no API coords
        r = wiki.resolve([cand])[cand]
        if r and not r['disambig'] and r['lat'] is None:
            return r['title']
    return meas.get('title')


def qids(titles):
    """enwiki title -> Wikidata Q (cached)."""
    todo = sorted({t for t in titles if t and t not in _c['qid']})
    for i in range(0, len(todo), 50):
        ch = todo[i:i + 50]
        q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'titles': '|'.join(ch),
                                    'prop': 'pageprops', 'ppprop': 'wikibase_item'})
        r = get_json(f'{wiki.API}?{q}')['query']
        norm = {e['from']: e['to'] for e in r.get('normalized', [])}
        got = {p['title']: p.get('pageprops', {}).get('wikibase_item') for p in r['pages'].values()}
        for t in ch:
            _c['qid'][t] = got.get(norm.get(t, t))
    return {t: _c['qid'].get(t) for t in titles}


def claims(qs):
    """Q -> {'P31': [Q..], 'P402': osm relation id or None, 'ext': Wikidata extreme points
    P1332-P1335 (northern/southern/eastern/westernmost, as (lat, lng))} (cached)."""
    todo = sorted({q for q in qs if q and 'ext' not in _c['claims'].get(q, {})})
    for i in range(0, len(todo), 50):
        q = urllib.parse.urlencode({'action': 'wbgetentities', 'format': 'json', 'ids': '|'.join(todo[i:i + 50]),
                                    'props': 'claims'})
        for k, e in get_json(f'{WD}?{q}')['entities'].items():
            cl = e.get('claims', {})
            ids = lambda p: [s['mainsnak']['datavalue']['value']['id'] for s in cl.get(p, [])
                             if s['mainsnak'].get('datavalue')]
            osm = [s['mainsnak']['datavalue']['value'] for s in cl.get('P402', []) if s['mainsnak'].get('datavalue')]
            ext = [(s['mainsnak']['datavalue']['value']['latitude'], s['mainsnak']['datavalue']['value']['longitude'])
                   for p in ('P1332', 'P1333', 'P1334', 'P1335') for s in cl.get(p, []) if s['mainsnak'].get('datavalue')]
            _c['claims'][k] = {'P31': ids('P31'), 'P402': osm[0] if osm else None, 'ext': ext}
    return _c['claims']


def labels(qs):
    """Q -> English label (cached)."""
    todo = sorted({q for q in qs if q not in _c['labels']})
    for i in range(0, len(todo), 50):
        q = urllib.parse.urlencode({'action': 'wbgetentities', 'format': 'json', 'ids': '|'.join(todo[i:i + 50]),
                                    'props': 'labels', 'languages': 'en'})
        for k, e in get_json(f'{WD}?{q}')['entities'].items():
            _c['labels'][k] = e.get('labels', {}).get('en', {}).get('value', k)
    return _c['labels']


def classify(lbls):
    """P31 labels -> (class, matched label). Order: city > natural > admin > canal/linear > point."""
    for cls, rx in (('city', CITY), ('natural', NATURAL), ('admin', ADMIN), ('linear', CANAL)):
        for l in lbls:
            if re.search(rx, l.lower()) and not (cls == 'natural' and re.search(POINTISH, l.lower())
                                                 and not re.search(r'range|system|massif|park', l.lower())):
                return cls, l
    return 'point', (lbls[0] if lbls else None)


def osm_ids(qs):
    """Q -> OSM objects tagged wikidata=Q (Overpass, tags only, 40 Qs per query). Cached.
    Full-geometry Overpass queries timed out (504) under load; ids-only queries return in ~1 s."""
    todo = sorted({q for q in qs if q not in _c['osm']})
    for i in range(0, len(todo), 40):
        ch = todo[i:i + 40]
        body = urllib.parse.urlencode({'data': '[out:json][timeout:120];nwr["wikidata"~"^(%s)$"];out tags;' % '|'.join(ch)})
        for k in range(5):
            try:
                with urllib.request.urlopen(urllib.request.Request(OVERPASS, data=body.encode(), headers=UA), timeout=180) as r:
                    els = json.load(r)['elements']
                break
            except Exception:
                if k == 4:
                    raise
                time.sleep(15 * (k + 1))
        for q in ch:
            _c['osm'][q] = {'ids': []}
        for e in els:
            q = e.get('tags', {}).get('wikidata')
            if q in _c['osm']:
                _c['osm'][q]['ids'].append(e['type'][0].upper() + str(e['id']))
        save()
        print(f'  overpass ids {min(i + 40, len(todo))}/{len(todo)}', flush=True)
        time.sleep(2)


def osm_pts(q, rel):
    """All vertices of the OSM geometry for Q via Nominatim lookup (polygon_threshold 0.001 deg,
    about 100 m). Relations first; nodes carry no extent. Cached under _c['geom'][q]."""
    g = _c.setdefault('geom', {})
    if q in g:
        return g[q]
    ids = list(dict.fromkeys(([f'R{rel}'] if rel else []) + _c['osm'].get(q, {}).get('ids', [])))
    ids = [i for i in ids if i[0] in 'RW'][:50]
    if not ids:
        g[q] = {'pts': [], 'objects': [], 'why': 'no OSM way/relation tagged with this Q'}
        return g[q]
    u = 'https://nominatim.openstreetmap.org/lookup?' + urllib.parse.urlencode(
        {'osm_ids': ','.join(ids), 'format': 'json', 'polygon_geojson': 1, 'polygon_threshold': 0.001})
    res = get_json(u) or []
    time.sleep(1.1)                                   # Nominatim usage policy: 1 req/s
    pts, objs = [], []

    def walk(c):
        if isinstance(c[0], (int, float)):
            pts.append((c[1], c[0]))
        else:
            for k in c:
                walk(k)
    for r in res:
        if r.get('geojson') and r['geojson']['type'] != 'Point':
            objs.append(f"{r['osm_type']}/{r['osm_id']} {r.get('class')}={r.get('type')}")
            walk(r['geojson']['coordinates'])
    if not pts:                                       # Nominatim skips some objects (huge deserts,
        for oid in ids[:3]:                           # route relations): Overpass per object, retried
            got = overpass_geom(oid)
            if got:
                objs.append(f"{'relation' if oid[0] == 'R' else 'way'}/{oid[1:]} (overpass)")
                pts += got
    g[q] = {'pts': pts[::max(1, len(pts) // 20000)], 'objects': objs,
            'why': None if pts else f'neither Nominatim nor Overpass returned geometry for {ids[:5]}'}
    return g[q]


def overpass_geom(oid):
    """Vertices of one OSM way/relation via Overpass `out geom` (3 tries, 90 s timeout; bounded so one
    object cannot stall the run)."""
    sel = ('rel' if oid[0] == 'R' else 'way') + f'({oid[1:]})'
    body = urllib.parse.urlencode({'data': f'[out:json][timeout:170][maxsize:1073741824];{sel};out geom;'})
    for k in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(OVERPASS, data=body.encode(), headers=UA), timeout=90) as r:
                els = json.load(r)['elements']
            pts = []
            for e in els:
                for gg in (e.get('geometry') or []) + [p for m in e.get('members', []) for p in (m.get('geometry') or [])]:
                    pts.append((gg['lat'], gg['lon']))
            return pts
        except Exception:
            time.sleep(10 * (k + 1))
    return []


def _ne_phys():
    """Q -> (layer, name, vertices) from Natural Earth 10m geography regions + marine polygons."""
    out = {}
    for f in ('geography_regions_polys', 'geography_marine_polys'):
        p = os.path.join(HERE, '..', 'difficulty', 'ne', f'ne_10m_{f}.geojson')
        if not os.path.exists(p):
            continue
        for ft in json.load(open(p))['features']:
            q, pts = ft['properties'].get('WIKIDATAID'), []
            if not q:
                continue

            def walk(c):
                if isinstance(c[0], (int, float)):
                    pts.append((c[1], c[0]))
                else:
                    for k in c:
                        walk(k)
            walk(ft['geometry']['coordinates'])
            if q in out:
                out[q] = (out[q][0], out[q][1], out[q][2] + pts)
            else:
                out[q] = (f, ft['properties'].get('NAME_EN') or ft['properties'].get('NAME'), pts)
    return out


NE_PHYS = _ne_phys()


def SETTLEMENT_CLUE(x):
    """Clue is exactly '<short>, <country> <flag>': the dataset's city-entry shape."""
    c = wiki.FLAG_RE.sub('', x['clue']).strip()
    return wiki.norm(c) == wiki.norm(f"{x['short']}, {x['country']}")


def r_km(lat, lng, pts):
    """(max, min) great-circle km from the pin to the vertex set."""
    p = np.radians(np.array(pts))
    a, b = np.radians(lat), np.radians(lng)
    dot = np.sin(p[:, 0]) * np.sin(a) + np.cos(p[:, 0]) * np.cos(a) * np.cos(p[:, 1] - b)
    d = 6371 * np.arccos(np.clip(dot, -1, 1))
    return float(d.max()), float(d.min())


def main():
    L = json.load(open(LOCS))
    meas = {m['id']: m for m in wiki.measure_all(L)}        # all cached by warm.py
    print('F titles loaded', flush=True)
    own = {x['id']: own_title(x, meas[x['id']]) for x in L}
    wiki.save_cache()
    print('own titles resolved', flush=True)
    qmap = qids(list(own.values()))
    noart = {x['id']: meas[x['id']]['qid'] for x in L if meas[x['id']].get('method') == 'wikidata-no-enwiki'}
    cl = claims(list(qmap.values()) + list(noart.values()))
    labels({p for q in list(qmap.values()) + list(noart.values()) if q for p in cl.get(q, {}).get('P31', [])})
    save()
    print(f'wikidata classes fetched ({sum(1 for q in qmap.values() if q)} QIDs)', flush=True)
    ext_q = [q for q in list(qmap.values()) + list(noart.values()) if q and classify([_c['labels'].get(p, p) for p in cl[q]['P31']])[0]
             in ('natural', 'admin', 'linear')]
    osm_ids(ext_q)
    out = {}
    print(f'extended items to measure: {len(ext_q)} (of {len(L)})', flush=True)
    t0 = time.time()

    def stall(*_):
        save()
        raise SystemExit(f'STALL: item {n} ({x["id"]}) exceeded 600 s; cache saved, rerun resumes')
    signal.signal(signal.SIGALRM, stall)
    for n, x in enumerate(L):
        if n and n % 500 == 0:
            print(f'{n}/{len(L)} classified+measured {time.time() - t0:.0f}s', flush=True)
        signal.alarm(600)                              # 10 min on one item = stalled: fail loud
        t = own[x['id']]; q = qmap.get(t) if t else noart.get(x['id'])   # no-enwiki items: the Wikidata hit
        c = cl.get(q, {}) if q else {}
        lb = [_c['labels'].get(p, p) for p in c.get('P31', [])]
        cls, why = classify(lb) if q else ('unknown', None)
        if cls in ('admin', 'linear') and SETTLEMENT_CLUE(x) and not re.search(r'bridge|aqueduct|canal|road|wall', t or '', re.I):
            # "<Name>, <Country>" item matched to its namesake state/prefecture/district article: the
            # entry is the settlement of that name, so the pin is the canonical point (§2.7).
            cls, why = 'city', f'namesake {lb[0] if lb else "admin"} article ({t}); item is the settlement'
        row = {'title': t, 'qid': q, 'P31': lb, 'class': cls, 'classBy': why, 'extentKm': None,
               'extentSource': None, 'prior': x.get('extentKm')}
        if cls in ('natural', 'admin', 'linear'):
            g = osm_pts(q, c.get('P402'))
            if g['pts']:
                rmax, rmin = r_km(x['lat'], x['lng'], g['pts'])
                row.update(extentKm=round(rmax), minKm=round(rmin, 1), osm=g['objects'][:5], nOsm=len(g['objects']),
                           extentSource='osm')
                if rmin > 25:
                    row['warn'] = f'nearest OSM vertex {round(rmin)} km from pin: check match'
            elif q in NE_PHYS:                         # Natural Earth 10m physical polygon, matched by WIKIDATAID
                f, name, pts = NE_PHYS[q]
                rmax, rmin = r_km(x['lat'], x['lng'], pts)
                row.update(extentKm=round(rmax), minKm=round(rmin, 1),
                           extentSource=f'natural earth {f} "{name}" (OSM: ' + g['why'] + ')')
            elif c.get('ext'):                         # decision 2: Wikidata extreme points (measured coords)
                rmax, rmin = r_km(x['lat'], x['lng'], c['ext'])
                row.update(extentKm=round(rmax), minKm=round(rmin, 1), nExtremePts=len(c['ext']),
                           extentSource='wikidata extreme points P1332-P1335 (OSM: ' + g['why'] + ')')
            else:                                      # never estimated: S=0, flagged
                row['extentSource'] = 'unmeasured: ' + g['why'] + '; no Wikidata extreme points'
            if n % 25 == 0:
                save()
        elif cls in ('city', 'point'):
            row['extentSource'] = f'{cls}: pin is the canonical point, S=0'
        out[x['id']] = row
    signal.alarm(0)
    save()
    json.dump(out, open(os.path.join(HERE, 'extent.json'), 'w'), indent=1, ensure_ascii=False)
    from collections import Counter
    print(Counter(r['class'] for r in out.values()))
    print(f'{len(L)}/{len(L)} done {time.time() - t0:.0f}s')
    print('measured osm', sum(r['extentSource'] == 'osm' for r in out.values()),
          'natural-earth', sum((r['extentSource'] or '').startswith('natural earth') for r in out.values()),
          'wikidata-extremes', sum((r['extentSource'] or '').startswith('wikidata') for r in out.values()),
          'unmeasured', sum((r['extentSource'] or '').startswith('unmeasured') for r in out.values()))


if __name__ == '__main__':
    main()
