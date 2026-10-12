"""v2 production step 0: resolve every location to ITS OWN en.wikipedia article, guard it, measure pageviews.
Guards (framework §8): article exists and is not a disambiguation page; Wikidata P31 is a human settlement
(P31/P279* Q486972 human settlement, or Q15284 municipality) -- never a building, constituency, club, airport or event; not a country article unless a
city-state; article coordinates within 25 km of the pin; GeoNames pop >= 500k with < 200 views/day is flagged.
Every hand-mapped title is listed in the output. Writes resolved-v2.json {id: {...}} and prints the flags.
Usage: python3 resolve.py            (re-uses resolved-cache.json for API answers; delete it to re-fetch)"""
import json, math, os, time, urllib.request, urllib.parse

UA = {'User-Agent': 'map-game-difficulty/0.3 (where-on-earth; gartland.79 at gmail)'}
LOC = json.load(open('../../../assets/locations.json'))
V1 = {r['id']: r for r in json.load(open('../../../assets/difficulty/difficulty-full.json'))['items']}
V2 = json.load(open('views-v2.json'))
# Hand-mapped titles (judgment: which article IS the place the clue names). Listed in the output as how='hand'.
HAND = {
    'alberobello-trulli': 'Alberobello', 'caxias-do-sul-br': 'Caxias do Sul', 'chihuahua-mx': 'Chihuahua City',
    'ibiza-es': 'Ibiza', 'matera-sassi': 'Matera', 'nagpur-in': 'Nagpur', 'odesa-ua': 'Odesa',
    'pointe-noire-cg': 'Pointe-Noire', 'san-luis-potosi-mx': 'San Luis Potosí (city)', 'shigatse-tibet': 'Shigatse',
    'suzhou-cn': 'Suzhou', 'taiz': 'Taiz', 'portland-oregon-usa': 'Portland, Oregon', 'takeo': 'Doun Kaev (town)',
    'djibouti-city-djibouti': 'Djibouti City', 'san-marino-san-marino': 'City of San Marino',
}
HAND.update(json.load(open('hand-titles.json')) if os.path.exists('hand-titles.json') else {})
CITY_STATES = {'Vatican City', 'Monaco', 'Singapore'}
CACHE_F = 'resolved-cache.json'
CACHE = json.load(open(CACHE_F)) if os.path.exists(CACHE_F) else {}


def get(u, tries=8):
    if u in CACHE: return CACHE[u]
    for t in range(tries):
        try:
            r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60)); CACHE[u] = r; return r
        except urllib.error.HTTPError as e:
            if e.code == 404: CACHE[u] = None; return None
            err = e
        except Exception as e: err = e
        time.sleep(2 + 3 * t)
    raise err


def hav(a, b, c, d):
    p = math.pi / 180; h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(min(1, h)))


cand = {}
for x in LOC:
    i = x['id']
    if i in HAND: cand[i] = (HAND[i], 'hand')
    elif V2.get(i, {}).get('title'): cand[i] = (V2[i]['title'], 'v2 ' + V2[i]['how'])
    elif i in V1 and V1[i]['measured'].get('wikiTitle'): cand[i] = (V1[i]['measured']['wikiTitle'], 'v1 ' + V1[i]['measured']['titleMethod'])
    else: cand[i] = (x['short'], 'short name')

# 1. Wikipedia: redirects, disambiguation, Wikidata item, coordinates (50 titles per call)
info = {}
titles = sorted({t for t, _ in cand.values()})
for k in range(0, len(titles), 50):
    q = get('https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=coordinates|pageprops&colimit=max'
            '&ppprop=wikibase_item|disambiguation&titles=' + urllib.parse.quote('|'.join(titles[k:k + 50])))
    m = {}
    for a in ('normalized', 'redirects'):
        for r in q['query'].get(a, []): m[r['from']] = r['to']
    pages = {p['title']: p for p in q['query']['pages']}
    for t in titles[k:k + 50]:
        f = t
        while f in m and m[f] != f: f = m[f]
        p = pages.get(f, {'missing': True})
        c = (p.get('coordinates') or [{}])[0]
        info[t] = dict(final=f, missing='missing' in p, disamb='disambiguation' in p.get('pageprops', {}),
                       qid=p.get('pageprops', {}).get('wikibase_item'), lat=c.get('lat'), lon=c.get('lon'))

# 2. Wikidata: is the item a human settlement? is it a country? (+ P31 labels for review)
qids = sorted({v['qid'] for v in info.values() if v['qid']})
WD_F = 'wd-cache.json'   # per-QID answers, so adding one title doesn't re-run every batch
wd = json.load(open(WD_F)) if os.path.exists(WD_F) else {}
todo = [q for q in qids if q not in wd]
for k in range(0, len(todo), 10):
    vals = ' '.join('wd:' + q for q in todo[k:k + 10])
    sparql = f'''SELECT ?item (SAMPLE(?s) AS ?settle) (SAMPLE(?c) AS ?country) (GROUP_CONCAT(DISTINCT ?tl; separator="; ") AS ?types) WHERE {{
      VALUES ?item {{ {vals} }}
      OPTIONAL {{ ?item wdt:P31 ?t . ?t rdfs:label ?tl FILTER(LANG(?tl)="en") }}
      BIND(EXISTS {{ VALUES ?root {{ wd:Q486972 wd:Q15284 }} ?item wdt:P31/wdt:P279* ?root }} AS ?s)
      BIND(EXISTS {{ VALUES ?ct {{ wd:Q6256 wd:Q3624078 }} ?item wdt:P31 ?ct }} AS ?c)
    }} GROUP BY ?item'''
    print('sparql', k, flush=True); r = get('https://query.wikidata.org/sparql?format=json&query=' + urllib.parse.quote(sparql))
    for b in r['results']['bindings']:
        wd[b['item']['value'].rsplit('/', 1)[1]] = dict(settlement=b['settle']['value'] == 'true',
                                                       country=b['country']['value'] == 'true', types=b['types']['value'])
    json.dump(wd, open(WD_F, 'w'))
json.dump(CACHE, open(CACHE_F, 'w'))

# 3. GeoNames sanity: biggest cities15000 place within 10 km of the pin
big = []
for l in open('cities15000.txt', encoding='utf-8'):
    p = l.split('\t')
    if int(p[14] or 0) >= 500_000: big.append((float(p[4]), float(p[5]), int(p[14]), p[1]))

# 4. Pageviews: en.wikipedia, user agent, monthly 2025-10..2026-09 (12 full months), mean per day
def views(t):
    d = get('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/'
            + urllib.parse.quote(t.replace(' ', '_'), safe='') + '/monthly/2025100100/2026093000')
    return round(sum(i['views'] for i in d['items']) / 365, 1) if d else 0.0

out, flags = {}, []
for n, x in enumerate(LOC):
    i = x['id']; t, how = cand[i]; a = info[t]; w = wd.get(a['qid'], {})
    dist = round(hav(x['lat'], x['lng'], a['lat'], a['lon'])) if a['lat'] is not None else None
    v = views(a['final']) if not a['missing'] else None
    pop = max((b for b in big if hav(x['lat'], x['lng'], b[0], b[1]) <= 10), key=lambda b: b[2], default=None)
    f = []
    if a['missing']: f.append('MISSING')
    if a['disamb']: f.append('DISAMBIGUATION')
    if not a['missing'] and not w.get('settlement'): f.append('NOT-SETTLEMENT')
    if w.get('country') and x['country'] not in CITY_STATES: f.append('COUNTRY-ARTICLE')
    if dist is None or dist > 25: f.append(f'DIST {dist}')
    if pop and v is not None and v < 200: f.append(f'POP {pop[3]} {pop[2]} views {v}')
    out[i] = dict(title=a['final'], asked=t, how=how, views=v, qid=a['qid'], types=w.get('types'), distKm=dist, flags=f)
    if f: flags.append(i)
    if n % 100 == 0: json.dump(CACHE, open(CACHE_F, 'w')); print(n, flush=True)
json.dump(CACHE, open(CACHE_F, 'w'))
json.dump(out, open('resolved-v2.json', 'w'), indent=1, ensure_ascii=False)
print(len(out), 'resolved;', len(flags), 'flagged')
for i in flags:
    o = out[i]; print(f"{i:34s} {o['title']!s:38s} v={o['views']!s:7s} d={o['distKm']!s:5s} {o['flags']} [{o['types']}]")
print('hand-mapped:', {i: o['title'] for i, o in out.items() if o['how'] == 'hand'})
