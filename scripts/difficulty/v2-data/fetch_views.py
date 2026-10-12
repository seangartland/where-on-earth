"""v2 analysis: measure en.wikipedia user pageviews (2025-10..2026-09) for items v1 missed or misresolved.
Writes views-v2.json {id: {title, views, distKm, how}}."""
import json, math, urllib.request, urllib.parse, time
UA = {'User-Agent': 'map-game-difficulty/0.2'}
LOC = json.load(open('../../../assets/locations.json'))
V1 = {r['id']: r for r in json.load(open('../../../assets/difficulty/difficulty-full.json'))['items']}
FIX = {  # hand-corrected titles for v1 geosearch misses (judgment: which article IS the city)
 'alberobello-trulli': 'Alberobello', 'caxias-do-sul-br': 'Caxias do Sul', 'champs-elysees-paris': 'Champs-Élysées',
 'chihuahua-mx': 'Chihuahua (city)', 'ibiza-es': 'Ibiza', 'jericoacoara': 'Jericoacoara', 'matera-sassi': 'Matera',
 'nagpur-in': 'Nagpur', 'odesa-ua': 'Odesa', 'pointe-noire-cg': 'Pointe-Noire', 'san-luis-potosi-mx': 'San Luis Potosí (city)',
 'shigatse-tibet': 'Shigatse', 'suzhou-cn': 'Suzhou', 'taiz': 'Taiz', 'vagator': 'Vagator', 'portland-oregon-usa': 'Portland, Oregon',
 'takeo': 'Doun Kaev'}
def get(u):
    for _ in range(3):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30))
        except Exception as e: err = e; time.sleep(2)
    raise err
def hav(a, b, c, d):
    p = math.pi / 180; h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))
def resolve(t):
    q = get('https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=coordinates|pageprops&titles=' + urllib.parse.quote(t))
    for p in q['query']['pages'].values():
        if 'missing' in p or 'disambiguation' in p.get('pageprops', {}): return None
        c = (p.get('coordinates') or [{}])[0]
        return p['title'], c.get('lat'), c.get('lon')
def views(t):
    d = get('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/'
            + urllib.parse.quote(t.replace(' ', '_'), safe='') + '/monthly/2025100100/2026093000')
    return round(sum(i['views'] for i in d['items']) / 365, 1)
out = {}
for x in LOC:
    i = x['id']
    if i in FIX: cands, how = [FIX[i]], 'hand-corrected title'
    elif i not in V1: cands, how = [x['short'], f"{x['short']}, {x['country']}", x['clue'].split(',')[0]], 'auto'
    else: continue
    for t in cands:
        r = resolve(t)
        if not r: continue
        d = hav(x['lat'], x['lng'], r[1], r[2]) if r[1] is not None else None
        if how == 'auto' and (d is None or d > 50): continue
        out[i] = {'title': r[0], 'views': views(r[0]), 'distKm': d and round(d), 'how': how}; break
    else: out[i] = {'title': None, 'views': None, 'how': 'UNRESOLVED'}
    print(i, out[i], flush=True)
json.dump(out, open('views-v2.json', 'w'), indent=1, ensure_ascii=False)
