"""Difficulty v2, production scorer (framework: map-game/docs/difficulty-framework-v2.md).
Expected points a typical player loses on a location under the game's own scoring curve, mapped to 1..10
by frozen cut points. Measured inputs: views (resolve.py -> resolved-v2.json), dFb and d1M (GeoNames
cities15000, same method as measure.py). Judged inputs: K (k-proposed.json, Sean-approved 2026-10-12),
the district overrides below.
Usage: python3 score_v2.py [--calibrate] [--apply] [id-substrings...]
  --calibrate  print cut points calibrated to TARGET on this set (does not change CUTS)
  --apply      write difficulty + difficultyWhy into assets/locations.json (no other field is touched)"""
import json, math, re, sys, collections as C

LOC_F = '../../../assets/locations.json'
LOC = json.load(open(LOC_F, encoding='utf-8'))
RES = json.load(open('resolved-v2.json'))
_k = json.load(open('k-proposed.json')); K, KID = _k['K'], _k['Kid']

V0, V1 = 30, 2500          # ESTIMATE: views/day where ~0% / 99% of players can place the city
KNOWN_KM = (20, 100)       # ESTIMATE: miss when the player knows the city: 20 km at p=1, 100 km at p=0
FLOOR_KM = 100             # ESTIMATE: best-case miss when guessing from the clue's country/unit alone
K_FLOOR = 800              # ESTIMATE: minimum region-scale miss when the country can't be placed
TARGET = [5, 8, 11, 13, 14, 14, 12, 10, 8, 5]
CUTS = [3.7, 6.4, 9.6, 15.2, 24.3, 44.5, 78.9, 112.9, 201.7]   # framework §2, frozen 2026-10-12. Never re-cut.

# Districts known through their parent city (framework §7.8; Sean: "consider overrides", judgment delegated).
# Rule: a district whose clue names only the district takes its parent city's fame when the district is the
# parent's signature quarter, i.e. knowing the parent means knowing where the district is. Measured views of
# the parent article; geography (dFb, d1M) stays the district's own pin.
FAME_VIA = {'waikiki': 'Honolulu', 'salvador-pelourinho': 'Salvador, Bahia'}

# Clue names a sub-unit (state/territory/island): the player taps THAT unit, so the fallback centre is the unit's.
# None = the unit has no other GeoNames city >= 15k (or is the city itself) -> fallback = pin (dFb 0).
UNIT = {'albuquerque-usa': 'US/NM', 'anchorage-usa': 'US/AK', 'tampa-usa': 'US/FL', 'tucson-usa': 'US/AZ',
        'portland-oregon-usa': 'US/OR', 'columbus': 'US/OH', 'roswell-ufo-incident': 'US/NM', 'jacksonville': 'US/FL',
        'denpasar-indonesia': 'ID/02', 'kochi-india': 'IN/13', 'st-johns-canada': 'CA/05', 'ilulissat-greenland': 'GL',
        'nuuk-greenland': 'GL', 'san-juan': 'PR', 'noumea-new-caledonia': 'NC', 'papeete-tahiti': 'PF',
        'hong-kong': None, 'macau': None, 'longyearbyen-svalbard': None, 'jerusalem': 'IL'}

ci = {}
for l in open('countryInfo.txt', encoding='utf-8'):
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


def centre(code):
    """Population-weighted centre (unit sphere) of a GeoNames country, or country/admin1 unit."""
    cc, _, a1 = code.partition('/')
    sel = [c for c in cities if c[0] == cc and (not a1 or c[1] == a1)]
    if not sel: return None
    if not sum(c[4] for c in sel): sel = [c[:4] + (1,) + c[5:] for c in sel]   # all pops 0 (Palau): equal weights
    w = sum(c[4] for c in sel)
    X = [sum(c[4] * xyz(c[2], c[3])[k] for c in sel) / w for k in range(3)]
    return math.degrees(math.atan2(X[2], math.hypot(X[0], X[1]))), math.degrees(math.atan2(X[1], X[0]))


def L(km):
    """Points lost at km: 1000 - distanceScore(km) from src/main.js."""
    return 1000 - 1000 * math.exp(-((km / 3500) ** 1.13))


def p_know(v):
    return 0.99 * min(1, max(0, math.log(max(v, 1) / V0) / math.log(V1 / V0)))


def level(loss, cuts): return 1 + sum(loss >= c for c in cuts)


big = [c for c in cities if c[4] >= 1_000_000]
cent = {name: centre(code) for name, code in ci.items()}
def views(t):
    """en.wikipedia user pageviews/day, 2025-10..2026-09, same window and method as resolve.py."""
    import urllib.request, urllib.parse
    u = ('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/'
         + urllib.parse.quote(t.replace(' ', '_'), safe='') + '/monthly/2025100100/2026093000')
    d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'map-game-difficulty/0.3'}), timeout=60))
    return round(sum(i['views'] for i in d['items']) / 365, 1)


via_views = {i: views(t) for i, t in FAME_VIA.items()}

R = {}
for x in LOC:
    i = x['id']; r = RES[i]
    v, vsrc = r['views'], r['title']
    if i in FAME_VIA: v, vsrc = via_views[i], f"{FAME_VIA[i]} (parent; own '{r['title']}' {r['views']})"
    c = (centre(UNIT[i]) if UNIT[i] else (x['lat'], x['lng'])) if i in UNIT else cent.get(x['country'])
    if c is None: sys.exit(f'no fallback centre for {i} ({x["country"]})')
    dfb = round(hav(x['lat'], x['lng'], *c))
    d1m = round(min(d for d in (hav(x['lat'], x['lng'], b[2], b[3]) for b in big) if d > 15))
    p, k = p_know(v), KID.get(i, K.get(x['country'], 0))
    miss_c = k * max(K_FLOOR, d1m)
    miss_u = max(FLOOR_KM, math.hypot(dfb, miss_c))
    known = KNOWN_KM[0] + (KNOWN_KM[1] - KNOWN_KM[0]) * (1 - p)
    loss = p * L(min(known, miss_u)) + (1 - p) * L(miss_u)
    R[i] = dict(id=i, clue=x['clue'], country=x['country'], views=v, viewsSrc=vsrc, p=round(p, 2), K=k, dFb=dfb,
                centre=[round(c[0], 2), round(c[1], 2)], d1M=d1m, known=round(known), missU=round(miss_u),
                loss=round(loss, 1), cur=x['difficulty'], curWhy=x['difficultyWhy'])

if '--calibrate' in sys.argv:
    s = sorted(r['loss'] for r in R.values()); n = len(s); acc = 0; cal = []
    for t in TARGET[:-1]: acc += t; cal.append(round(s[min(n - 1, round(acc / 100 * n))], 1))
    h = C.Counter(level(r['loss'], cal) for r in R.values())
    print('calibrated cuts (NOT applied):', cal, [h[k] for k in range(1, 11)])

for r in R.values():
    r['D'] = level(r['loss'], CUTS)
    via = '(via ' + FAME_VIA[r['id']].split(',')[0] + ')' if r['id'] in FAME_VIA else ''
    r['why'] = f"p{r['p']:.2f}".replace('p0.', 'p.').replace('p1.00', 'p1') + via + \
               f"·fb{r['dFb']}·K{r['K']}·iso{r['d1M']} → {r['loss']:.1f} → {r['D']}"
h = C.Counter(r['D'] for r in R.values()); print(len(R), 'per level', [h[k] for k in range(1, 11)])
json.dump(R, open('rated-v2-final.json', 'w'), indent=1, ensure_ascii=False)
for q in [a for a in sys.argv[1:] if not a.startswith('--')]:
    for i, r in R.items():
        if q in i:
            print(f"{i:30s} v={r['views']:<7} p={r['p']:<5} dFb={r['dFb']:<5} d1M={r['d1M']:<5} K{r['K']} missU={r['missU']:<5} "
                  f"loss={r['loss']:<6} -> {r['D']:<2} (cur {r['cur']})  {r['why']}")
if '--apply' in sys.argv:
    for x in LOC: x['difficulty'], x['difficultyWhy'] = R[x['id']]['D'], R[x['id']]['why']
    open(LOC_F, 'w', encoding='utf-8').write(json.dumps(LOC, ensure_ascii=False, separators=(',', ':')))
    print('applied to', LOC_F)
