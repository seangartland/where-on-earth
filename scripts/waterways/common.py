"""Shared helpers for the waterways batch (BRIEF-waterways.md, 2026-11-21): straits and canals.
HTTP answers are cached in .build-tmp/waterways/cache.json so re-runs are offline; raw geometry sources
are written to build/extent-sources/ (gitignored, the make-extents.mjs precedent) by fetch.py."""
import json, math, os, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..'))
HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(ROOT, '.build-tmp/waterways')
SRC = os.path.join(ROOT, 'build/extent-sources')
os.makedirs(TMP, exist_ok=True)
os.makedirs(SRC, exist_ok=True)
CACHE_F = os.path.join(TMP, 'cache.json')
CACHE = json.load(open(CACHE_F)) if os.path.exists(CACHE_F) else {}
UA = {'User-Agent': 'map-game-difficulty/0.3 (where-on-earth; gartland.79 at gmail)'}
OVERPASS = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
NE_MARINE = os.path.join(ROOT, '../demo/scripts/difficulty/ne/ne_10m_geography_marine_polys.geojson')

# Brief order. title = the en.wikipedia article verified to be the feature itself (not a disambiguation page);
# premove = [(earlier title, first day under the next title), ...] for an article moved inside the fame window
# (landmark-pass PREMOVE precedent; move log checked).
# extent: 'polygon' sources are tried in order (OSM strait polygon first, the Hormuz/Bering precedent; then the
# Natural Earth marine polygon, the Drake Passage precedent); 'line' sources are OSM waterway=canal geometry
# (the Panama Canal precedent). osm = QID-matched OpenStreetMap object (Wikidata P402, or the Nominatim hit whose
# wikidata tag is the article's QID).
CANDIDATES = {
    # chunk A
    'bosphorus': dict(title='Bosporus', qid='Q35958', extent='polygon', osm=('relation', 8926171), ne=['Bosporus']),
    'dardanelles': dict(title='Dardanelles', qid='Q6514', extent='polygon', osm=('relation', 8926172), ne=['Dardanelles']),
    'suez-canal': dict(title='Suez Canal', qid='Q899', extent='line', osm=('overpass', 'way["waterway"="canal"]["name"~"^قناة السويس( الجديدة)?$"](29.8,32.2,31.4,32.7);')),
    # chunk B
    'strait-of-malacca': dict(title='Strait of Malacca', qid='Q48359', extent='polygon', osm=('relation', 20664688), ne=['Strait of Malacca']),
    'strait-of-magellan': dict(title='Strait of Magellan', qid='Q48365', extent='polygon', osm=('way', 286227372), ne=['Estrecho de Magellanes']),
    'english-channel': dict(title='English Channel', qid='Q34640', extent='polygon', osm=('way', 1180740942), ne=['English Channel']),
    'corinth-canal': dict(title='Corinth Canal', qid='Q182873', extent='line', osm=('way', 165079335)),
    'golden-gate': dict(title='Golden Gate', qid='Q220032', extent='polygon', osm=('way', 668102609), ne=[]),
    'bab-el-mandeb': dict(title='Bab al-Mandab Strait', premove=[('Bab-el-Mandeb', '20260910'), ('Strait of Bab al-Mandab', '20260923')], qid='Q83318', extent='polygon', osm=('relation', 11169730), ne=['Bab el Mandeb']),
    'taiwan-strait': dict(title='Taiwan Strait', qid='Q127031', extent='polygon', osm=('way', 1087698081), ne=['Taiwan Strait']),
    'cook-strait': dict(title='Cook Strait', qid='Q5023', extent='polygon', osm=('relation', 13512115), ne=['Cook Strait']),
    'oresund': dict(title='Øresund', qid='Q104662', extent='polygon', osm=('way', 486348349), ne=['Øresund']),
    # chunk C
    'kiel-canal': dict(title='Kiel Canal', qid='Q144825', extent='line', osm=('relation', 407981)),
    'erie-canal': dict(title='Erie Canal', qid='Q459578', extent='line', osm=('relation', 1823647)),
    'grand-canal-china': dict(title='Grand Canal (China)', qid='Q31347', extent='line', osm=('relation', 1112801)),
    'canal-du-midi': dict(title='Canal du Midi', qid='Q202494', extent='line', osm=('relation', 302044)),
    'strait-of-messina': dict(title='Strait of Messina', qid='Q134705', extent='polygon', osm=('relation', 11160661), ne=[]),
    'mozambique-channel': dict(title='Mozambique Channel', qid='Q165100', extent='polygon', osm=('relation', 14383565), ne=['Mozambique Channel']),
    'straits-of-florida': dict(title='Straits of Florida', qid='Q232912', extent='polygon', osm=('way', 1198394721), ne=['Straits of Florida']),
    'yucatan-channel': dict(title='Yucatán Channel', qid='Q193260', extent='polygon', osm=None, ne=['Yucatan Channel']),
    'bass-strait': dict(title='Bass Strait', qid='Q171846', extent='polygon', osm=('relation', 9457256), ne=['Bass Strait']),
    'kerch-strait': dict(title='Kerch Strait', qid='Q187890', extent='polygon', osm=('way', 1118123894), ne=[]),
    'strait-of-tiran': dict(title='Straits of Tiran', qid='Q208157', extent='polygon', osm=None, ne=[]),
}
CHUNKS = {
    'A': ['bosphorus', 'dardanelles', 'suez-canal'],
    'B': ['strait-of-malacca', 'strait-of-magellan', 'english-channel', 'corinth-canal', 'golden-gate',
          'bab-el-mandeb', 'taiwan-strait', 'cook-strait', 'oresund'],
    'C': ['kiel-canal', 'erie-canal', 'grand-canal-china', 'canal-du-midi', 'strait-of-messina', 'mozambique-channel',
          'straits-of-florida', 'yucatan-channel', 'bass-strait', 'kerch-strait', 'strait-of-tiran'],
}


def save():
    tmp = CACHE_F + '.tmp'
    json.dump(CACHE, open(tmp, 'w'))
    os.replace(tmp, CACHE_F)


def get(u, data=None, tries=6, raw=False):
    key = u + ('\n' + data if data else '')
    if key in CACHE: return CACHE[key]
    err = None
    for t in range(tries):
        try:
            req = urllib.request.Request(u, data=urllib.parse.urlencode({'data': data}).encode() if data else None, headers=UA)
            body = urllib.request.urlopen(req, timeout=300).read()
            r = body.decode('utf-8') if raw else json.loads(body)
            if not raw: CACHE[key] = r; save()
            return r
        except urllib.error.HTTPError as e:
            if e.code == 404: CACHE[key] = None; save(); return None
            err = e
        except Exception as e: err = e
        time.sleep(3 + 5 * t)
    raise err


def hav(a, b, c, d):
    p = math.pi / 180
    h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(min(1, h)))
