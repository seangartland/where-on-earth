"""Regions plan analysis: en.wikipedia pageviews/day for each GeoNames admin-1 region that holds a location.
Title: Wikidata item with GeoNames ID (P1566) = the admin-1 geonameid -> its enwiki sitelink.
Views: Wikimedia REST, en.wikipedia, user agent, monthly 2025-10..2026-09 / 365 (same window and method as
score_v2.py views()). Cached in regviews-cache.json. Output: regviews.json {gnCode: {title, views}}."""
import json, os, urllib.request, urllib.parse, time
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '../..')
R = json.load(open(os.path.join(HERE, 'regions.json')))
GID = {}
for l in open(os.path.join(ROOT, '.build-tmp/regions/admin1CodesASCII.txt'), encoding='utf-8'):
    c, n, a, g = l.rstrip('\n').split('\t'); GID[c] = g
codes = sorted({v['gn'] for v in R.values() if v['gn'] and v['gn'] in GID})
UA = {'User-Agent': 'map-game-regions-plan/0.1 (gartland.79 project)'}
CF = os.path.join(HERE, 'regviews-cache.json')
cache = json.load(open(CF)) if os.path.exists(CF) else {}
LOCAL_PAGEVIEWS = {
    'ES.07': ('Balearic Islands', 'Balearic_Islands.json'),
    'IN.41': ('Ladakh', 'Ladakh.json'),
    'PH.NCR': ('Metro Manila', 'Metro_Manila.json'),
}

# Series supplied by the orchestrator use the same Wikimedia endpoint response
# shape and 12-full-month window as the v2 cache.
for code, (title, filename) in LOCAL_PAGEVIEWS.items():
    data = json.load(open(os.path.join(HERE, 'pageviews', filename)))
    cache[code] = {'title': title, 'views': round(sum(i['views'] for i in data['items']) / 365, 1)}

def get(u, data=None):
    for a in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(u, data=data, headers=UA), timeout=90))
        except Exception as e:
            if getattr(e, 'code', 0) == 404: return None
            time.sleep(2 + 3 * a)
    return None

need = [c for c in codes if c not in cache]
for k in range(0, len(need), 150):
    vals = ' '.join(f'"{GID[c]}"' for c in need[k:k + 150])
    q = f'SELECT ?g ?t WHERE {{ VALUES ?g {{ {vals} }} ?i wdt:P1566 ?g . ?a schema:about ?i ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?t . }}'
    d = get('https://query.wikidata.org/sparql?format=json&query=' + urllib.parse.quote(q))
    found = {}
    for b in (d or {}).get('results', {}).get('bindings', []): found.setdefault(b['g']['value'], b['t']['value'])
    for c in need[k:k + 150]: cache[c] = {'title': found.get(GID[c])}
for c in codes:
    t = cache[c].get('title')
    if t and 'views' not in cache[c]:
        u = ('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/'
             + urllib.parse.quote(t.replace(' ', '_'), safe='') + '/monthly/2025100100/2026093000')
        d = get(u); cache[c]['views'] = round(sum(i['views'] for i in d['items']) / 365, 1) if d else None
        json.dump(cache, open(CF, 'w'), indent=1, ensure_ascii=False)
json.dump(cache, open(CF, 'w'), indent=1, ensure_ascii=False)
json.dump({c: cache[c] for c in codes}, open(os.path.join(HERE, 'regviews.json'), 'w'), indent=1, ensure_ascii=False)
print(len(codes), 'regions;', sum(1 for c in codes if cache[c].get('title')), 'titled;',
      sum(1 for c in codes if cache[c].get('views') is not None), 'with views')
print('untitled:', [c for c in codes if not cache[c].get('title')])
