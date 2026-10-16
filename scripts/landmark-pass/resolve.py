"""Landmark data pass, phase 3 step 1: resolve each landmarks-file entry to the en.wikipedia article of the
place its clue names, and measure pageviews. Same window and method as scripts/difficulty/v2-data/resolve.py
(en.wikipedia, user agent, monthly 2025-10..2026-09, mean = sum / 365) plus the batch-2 spike profile
(median month / 30.4, max / median). Guards: article exists, is not a disambiguation page, and its coordinates
lie within 25 km of the pin (area entries: flagged, reviewed by hand). The resolver's human-settlement guard is
dropped on purpose: these entries are landmarks, so the article must be the landmark itself (Slice A precedent).
Title source, in order: HAND (judgment, listed), the title already used for a stored v2 score
(scripts/difficulty/v2-data/resolved-v2.json, docs/landmark-slice-a-data/views.json), then the clue's lead
segment. Writes scripts/landmark-pass/resolved.json. API answers cached in .build-tmp/landmark-pass-cache.json.
Usage (from demo/): python3 scripts/landmark-pass/resolve.py"""
import json, math, os, re, statistics, time, urllib.error, urllib.parse, urllib.request

UA = {'User-Agent': 'map-game-difficulty/0.3 (where-on-earth; gartland.79 at gmail)'}
L = json.load(open('assets/locations-landmarks-sol.json', encoding='utf-8'))
V2RES = json.load(open('scripts/difficulty/v2-data/resolved-v2.json', encoding='utf-8'))
SLICE_A = json.load(open('docs/landmark-slice-a-data/views.json', encoding='utf-8'))
OUT_F = 'scripts/landmark-pass/resolved.json'
CACHE_F = '.build-tmp/landmark-pass-cache.json'
os.makedirs('.build-tmp', exist_ok=True)
CACHE = json.load(open(CACHE_F)) if os.path.exists(CACHE_F) else {}

# Judgment: which article IS the place the clue names, where the clue lead is not a usable title.
HAND = json.load(open('scripts/landmark-pass/hand-titles.json', encoding='utf-8')) if os.path.exists('scripts/landmark-pass/hand-titles.json') else {}
# Articles moved inside the window (move log checked): months before the current title existed are read from the
# pre-move title, so the article's own views cover all 12 months. Redirect hits after the move are not added,
# matching the resolver, which never counts redirect views.
PREMOVE = {'phong-nha-ke-bang': 'Phong Nha-Kẻ Bàng National Park', 'hoi-an': 'Hội An', 'thanh-hoa': 'Thanh Hóa'}


def get(u, tries=6):
    if u in CACHE: return CACHE[u]
    err = None
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


def lead(clue):
    return re.sub(r'\s*[\U0001F1E6-\U0001F1FF]{2}\s*$', '', clue).split(', ')[0].strip()


cand = {}
for x in L:
    i = x['id']
    if i in HAND: cand[i] = (HAND[i], 'hand')
    elif i in V2RES: cand[i] = (V2RES[i]['title'], 'stored v2 title')
    elif i in SLICE_A: cand[i] = (SLICE_A[i]['title'], 'slice A title')
    else: cand[i] = (lead(x['clue']), 'clue lead')

info = {}
titles = sorted({t for t, _ in cand.values()})
for k in range(0, len(titles), 50):
    q = get('https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=coordinates|pageprops|description'
            '&colimit=max&ppprop=wikibase_item|disambiguation&titles=' + urllib.parse.quote('|'.join(titles[k:k + 50])))
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
                       qid=p.get('pageprops', {}).get('wikibase_item'), desc=p.get('description'), lat=c.get('lat'), lon=c.get('lon'))
    json.dump(CACHE, open(CACHE_F, 'w'))

out = {}
for n, x in enumerate(L):
    i = x['id']; t, how = cand[i]; a = info[t]
    dist = round(hav(x['lat'], x['lng'], a['lat'], a['lon'])) if a['lat'] is not None else None
    months = None
    if not a['missing']:
        def monthly(title):
            d = get('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/'
                    + urllib.parse.quote(title.replace(' ', '_'), safe='') + '/monthly/2025100100/2026093000')
            return {m['timestamp'][:6]: m['views'] for m in d['items']} if d else {}
        mm = monthly(a['final'])
        if i in PREMOVE: mm = {**{k: v for k, v in monthly(PREMOVE[i]).items() if k not in mm}, **mm}
        months = [mm[k] for k in sorted(mm)]
    f = []
    if a['missing']: f.append('MISSING')
    if a['disamb']: f.append('DISAMBIGUATION')
    if dist is None or dist > 25: f.append(f'DIST {dist}')
    if months is not None and len(months) < 12: f.append(f'MONTHS {len(months)}')
    row = dict(asked=t, how=how + (f' + pre-move {PREMOVE[i]!r}' if i in PREMOVE else ''), title=a['final'], qid=a['qid'], description=a['desc'], distKm=dist, flags=f)
    if months:
        mean = round(sum(months) / 365, 1)
        med = round(statistics.median([v / 30.4 for v in months]), 1)
        row.update(views=mean, medianPerDay=med, maxOverMedian=round(max(months) / 30.4 / med, 2) if med else None, months=months)
    out[i] = row
    if n % 50 == 0: json.dump(CACHE, open(CACHE_F, 'w')); print(n, flush=True)
json.dump(CACHE, open(CACHE_F, 'w'))
json.dump(out, open(OUT_F, 'w'), indent=1, ensure_ascii=False)
flagged = {i: r for i, r in out.items() if r['flags']}
print(len(out), 'resolved,', len(flagged), 'flagged')
for i, r in flagged.items():
    print(f"{i:40s} {r['asked']!r} -> {r['title']!r} {r['flags']} | {r['description']}")
