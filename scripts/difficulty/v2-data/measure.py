"""v2 analysis: measured per-city inputs. d_fb = km from pin to its country's population-weighted centre
(GeoNames cities15000, pop-weighted mean on the unit sphere); d_1m = km to nearest OTHER city with pop >= 1M.
Writes inputs-v2.json."""
import json, math
LOC = json.load(open('../../../assets/locations.json'))
V1 = {r['id']: r for r in json.load(open('../../../assets/difficulty/difficulty-full.json'))['items']}
V2 = json.load(open('views-v2.json'))
ci = {}
for l in open('countryInfo.txt'):
    if not l.startswith('#'): p = l.split('\t'); ci[p[4]] = p[0]
ci.update({'Congo': 'CG', 'Czech Republic': 'CZ', "Côte d'Ivoire": 'CI', 'DR Congo': 'CD', 'Netherlands': 'NL',
           'Palestine': 'PS', 'Timor-Leste': 'TL', 'Vatican City': 'VA', 'England': 'GB/ENG', 'Scotland': 'GB/SCT',
           'Wales': 'GB/WLS', 'Northern Ireland': 'GB/NIR'})
cities = []
for l in open('cities15000.txt', encoding='utf-8'):
    p = l.rstrip('\n').split('\t')
    cities.append((p[8], p[10], float(p[4]), float(p[5]), int(p[14] or 0), p[1]))
def xyz(la, lo):
    la, lo = math.radians(la), math.radians(lo); return math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)
def hav(a, b, c, d):
    p = math.pi / 180; h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(min(1, h)))
cent = {}
for name, code in ci.items():
    cc, _, a1 = code.partition('/')
    sel = [c for c in cities if c[0] == cc and (not a1 or c[1] == a1)]
    if not sel: continue
    w = sum(c[4] for c in sel) or 1
    X = [sum(c[4] * xyz(c[2], c[3])[k] for c in sel) / w for k in range(3)]
    cent[name] = (math.degrees(math.atan2(X[2], math.hypot(X[0], X[1]))), math.degrees(math.atan2(X[1], X[0])))
# Clue names a sub-unit (state/territory/island): the player taps THAT, so the fallback centre is the unit's.
# Units with no GeoNames city >= 15k (Svalbard, Tristan, Hong Kong/Macau = the city itself) -> fallback = pin (dFb 0).
UNIT = {'albuquerque-usa': 'US/NM', 'anchorage-usa': 'US/AK', 'tampa-usa': 'US/FL', 'tucson-usa': 'US/AZ',
        'denpasar-indonesia': 'ID/02', 'kochi-india': 'IN/13', 'st-johns-canada': 'CA/05', 'ilulissat-greenland': 'GL',
        'nuuk-greenland': 'GL', 'san-juan': 'PR', 'noumea-new-caledonia': 'NC', 'papeete-tahiti': 'PF',
        'hong-kong': None, 'macau': None, 'longyearbyen-svalbard': None, 'tristan-da-cunha': None, 'jerusalem': 'IL'}
def centre(code):
    cc, _, a1 = code.partition('/')
    sel = [c for c in cities if c[0] == cc and (not a1 or c[1] == a1)]
    w = sum(c[4] for c in sel)
    X = [sum(c[4] * xyz(c[2], c[3])[k] for c in sel) / w for k in range(3)]
    return math.degrees(math.atan2(X[2], math.hypot(X[0], X[1]))), math.degrees(math.atan2(X[1], X[0]))
big = [c for c in cities if c[4] >= 1_000_000]
out = {}
for x in LOC:
    i = x['id']
    if i in V2: v, src = V2[i]['views'], V2[i]['how'] + ': ' + str(V2[i]['title'])
    elif i in V1: v, src = V1[i]['measured']['viewsPerDay'], 'v1 cache: ' + str(V1[i]['measured']['wikiTitle'])
    else: v, src = None, 'none'
    c = cent.get(x['country'])
    if i in UNIT: c = centre(UNIT[i]) if UNIT[i] else (x['lat'], x['lng'])
    d1 = min((hav(x['lat'], x['lng'], b[2], b[3]) for b in big if hav(x['lat'], x['lng'], b[2], b[3]) > 15), default=None)
    out[i] = {'id': i, 'views': v, 'viewsSrc': src, 'dFb': c and round(hav(x['lat'], x['lng'], *c)), 'centre': c and [round(c[0], 2), round(c[1], 2)],
              'd1M': d1 and round(d1), 'country': x['country'], 'clue': x['clue'], 'cur': x['difficulty'], 'curWhy': x['difficultyWhy']}
json.dump(out, open('inputs-v2.json', 'w'), indent=1, ensure_ascii=False)
print('no centre:', sorted({o['country'] for o in out.values() if o['dFb'] is None}))
print('no views:', [k for k, o in out.items() if o['views'] is None])
for k in ['United States', 'Russia', 'Canada', 'China', 'Australia', 'Brazil', 'India', 'Norway', 'Scotland']: print(k, [round(t, 1) for t in cent[k]])
