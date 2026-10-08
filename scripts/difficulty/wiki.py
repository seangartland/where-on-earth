"""F term (framework §2.1): measured English Wikipedia pageviews, 12-month daily average.

Window: 2025-10-01 .. 2026-09-30 (last 12 complete months as of 2026-10-06), agent=user,
all-access. avg/day = sum of monthly views / days covered.

Title resolution per location (every candidate is resolved through redirects):
  1. candidates from `short`, the name parsed out of `clue`, and "<name>, <country>"
  2. a candidate is ACCEPTED only if it is not a disambiguation page and its article
     coordinates are within MATCH_KM (or 2×extentKm) of the pin; candidates with no
     coordinates are kept only as 'nocoord' fallbacks and flagged
  3. if nothing is accepted: geosearch within 10 km of the pin, accept pages whose title
     shares a distinctive token with the name
  4. then enwiki full-text search, 5. then Wikidata entity search; both coords-checked (MATCH_KM)
  6. a Wikidata entity at the pin with NO enwiki article -> 0 views (F5), method 'wikidata-no-enwiki'
F uses the MOST-VIEWED accepted title (§2.1 "item's article and its obvious main article").
Every lookup is cached in pageviews-cache.json (titles and views, including misses).
"""
import json, os, re, time, unicodedata, urllib.parse, urllib.request
from math import radians, sin, cos, asin, sqrt
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'pageviews-cache.json')
UA = {'User-Agent': 'map-game-difficulty/2.0 (difficulty pilot; python-urllib)'}
API = 'https://en.wikipedia.org/w/api.php'
PV = ('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/'
      'all-access/user/{t}/monthly/2025100100/2026093000')
WINDOW_DAYS = 365
MONTH_DAYS = {'202510': 31, '202511': 30, '202512': 31, '202601': 31, '202602': 28, '202603': 31,
              '202604': 30, '202605': 31, '202606': 30, '202607': 31, '202608': 31, '202609': 30}
MATCH_KM = 50
GENERIC = {'the', 'of', 'a', 'and', 'de', 'la', 'el', 'le', 'du', 'des', 'di', 'in', 'on', 'at',
           'mount', 'mt', 'lake', 'island', 'islands', 'city', 'old', 'town', 'national', 'park',
           'river', 'bay', 'point', 'cape', 'beach', 'temple', 'church', 'cathedral', 'castle',
           'palace', 'museum', 'bridge', 'tower', 'square', 'market', 'falls', 'valley', 'site',
           'monument', 'memorial', 'fort', 'mosque', 'great', 'saint', 'st', 'north', 'south',
           'east', 'west', 'new', 'summit', 'base', 'centre', 'center'}

_cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {'titles': {}, 'views': {}, 'langlinks': {}}


def save_cache():
    """Persist the lookup cache."""
    json.dump(_cache, open(CACHE, 'w'), indent=0, ensure_ascii=False)


def get_json(url, tries=4):
    """GET JSON with retry/backoff on 429/5xx; returns None on 404."""
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if k == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if k == tries - 1:
                raise
        time.sleep(2 ** k)


def norm(s):
    """Lowercase, strip accents, collapse punctuation."""
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()


def tokens(s):
    """Distinctive tokens of a name (generic words removed; falls back to all tokens)."""
    t = norm(s).split()
    d = [w for w in t if w not in GENERIC and len(w) > 1]
    return set(d or t)


def hav(a, b, c, d):
    """Great-circle km."""
    a, b, c, d = map(radians, (a, b, c, d))
    return 2 * 6371 * asin(sqrt(sin((c - a) / 2) ** 2 + cos(a) * cos(c) * sin((d - b) / 2) ** 2))


MAIN_SUFFIX = re.compile(r'(?i)\s+(research station|station|summit|base|old town|historic centre)$')
FLAG_RE = re.compile('[\U0001F1E6-\U0001F1FF\U0001F3F4\U000E0020-\U000E007F]+')


def clue_name(clue, country):
    """Best-effort place name from the clue text (for title candidates only)."""
    s = FLAG_RE.sub('', clue).strip()
    m = re.match(r'(?i)^where (?:is|are|was|were)\s+(?:the\s+)?(.+?)\??$', s)
    if m:
        s = re.split(r'\s+(?:in|on|near|at)\s+', m.group(1))[0]
    s = s.split(',')[0].strip()
    return s if 2 < len(s) < 80 else None


def candidates(x):
    """Ordered, de-duplicated title candidates for a location."""
    out = []
    main = MAIN_SUFFIX.sub('', x['short']).strip()      # "Macquarie Island Station" -> "Macquarie Island"
    for c in (x['short'], re.sub(r'^Mt\.? ', 'Mount ', x['short']), clue_name(x['clue'], x['country']),
              main if main != x['short'] else None):
        if c:
            out += [c, f"{c}, {x['country']}"]
    return list(dict.fromkeys(out))


def resolve(titles):
    """Resolve titles via redirects -> {input: {title, lat, lng, disambig}} (cached)."""
    todo = [t for t in titles if t not in _cache['titles']]
    for i in range(0, len(todo), 40):
        chunk = todo[i:i + 40]
        q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'redirects': 1,
                                    'titles': '|'.join(chunk), 'prop': 'coordinates|pageprops',
                                    'ppprop': 'disambiguation', 'colimit': 'max'})
        r = get_json(f'{API}?{q}')['query']
        fwd = {}
        for k in ('normalized', 'redirects'):
            for e in r.get(k, []):
                fwd[e['from']] = e['to']
        pages = {p['title']: p for p in r.get('pages', {}).values()}
        for t in chunk:
            f = t
            for _ in range(3):
                f = fwd.get(f, f)
            p = pages.get(f)
            if not p or 'missing' in p or 'invalid' in p:
                _cache['titles'][t] = None
                continue
            co = (p.get('coordinates') or [{}])[0]
            _cache['titles'][t] = {'title': p['title'], 'lat': co.get('lat'), 'lng': co.get('lon'),
                                   'disambig': 'pageprops' in p and 'disambiguation' in p['pageprops']}
    return {t: _cache['titles'][t] for t in titles}


def geosearch(lat, lng):
    """Articles within 10 km of a point (cached by rounded coords)."""
    k = f'geo:{lat:.4f},{lng:.4f}'
    if k not in _cache['titles']:
        q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'list': 'geosearch',
                                    'gscoord': f'{lat}|{lng}', 'gsradius': 10000, 'gslimit': 100})
        _cache['titles'][k] = [(g['title'], g['dist']) for g in get_json(f'{API}?{q}')['query']['geosearch']]
    return _cache['titles'][k]


def _names(x):
    """Search strings: short, clue name, suffix-stripped name."""
    main = MAIN_SUFFIX.sub('', x['short']).strip()
    return [n for n in dict.fromkeys([x['short'], clue_name(x['clue'], x['country']), main]) if n]


def search_titles(x, lim):
    """enwiki full-text search (top 5 per name) -> [(title, km)] whose article coords are within lim
    of the pin and that share a distinctive token with the name. Cached."""
    out = {}
    for n in _names(x):
        k = f'search:{n}'
        if k not in _cache['titles']:
            q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'list': 'search', 'srsearch': n,
                                        'srlimit': 5, 'srnamespace': 0})
            _cache['titles'][k] = [h['title'] for h in get_json(f'{API}?{q}')['query']['search']]
        hits = _cache['titles'][k]
        for t, r in resolve(hits).items():
            if r and not r['disambig'] and r['lat'] is not None and tokens(n) & tokens(r['title']):
                d = hav(x['lat'], x['lng'], r['lat'], r['lng'])
                if d <= lim:
                    out[r['title']] = round(d, 1)
    return list(out.items())


def wikidata_hits(x, lim):
    """Wikidata entity search -> [(Q, enwiki title or None, km)] for entities whose P625 lies within lim
    of the pin. Cached."""
    out = []
    for n in _names(x):
        k = f'wd:{n}'
        if k not in _cache['titles']:
            q = urllib.parse.urlencode({'action': 'wbsearchentities', 'format': 'json', 'search': n,
                                        'language': 'en', 'limit': 10, 'type': 'item'})
            ids = [h['id'] for h in get_json(f'https://www.wikidata.org/w/api.php?{q}').get('search', [])]
            ents = {}
            if ids:
                q = urllib.parse.urlencode({'action': 'wbgetentities', 'format': 'json', 'ids': '|'.join(ids),
                                            'props': 'claims|sitelinks', 'sitefilter': 'enwiki'})
                for qid, e in get_json(f'https://www.wikidata.org/w/api.php?{q}')['entities'].items():
                    co = [s['mainsnak']['datavalue']['value'] for s in e.get('claims', {}).get('P625', [])
                          if s['mainsnak'].get('datavalue')]
                    ents[qid] = {'coords': [(c['latitude'], c['longitude']) for c in co],
                                 'enwiki': e.get('sitelinks', {}).get('enwiki', {}).get('title')}
            _cache['titles'][k] = ents
        for qid, e in _cache['titles'][k].items():
            ds = [hav(x['lat'], x['lng'], a, b) for a, b in e['coords']]
            if ds and min(ds) <= lim and qid not in [o[0] for o in out]:
                out.append((qid, e['enwiki'], round(min(ds), 1)))
    return sorted(out, key=lambda o: o[2])


def views(title):
    """12-month avg daily user views for a canonical title (cached). Returns (avg, months)."""
    if title not in _cache['views']:
        r = get_json(PV.format(t=urllib.parse.quote(title.replace(' ', '_'), safe='')))
        items = (r or {}).get('items', [])
        tot = sum(i['views'] for i in items)
        days = sum(MONTH_DAYS[i['timestamp'][:6]] for i in items)
        _cache['views'][title] = {'sum': tot, 'months': len(items), 'avg': round(tot / days, 1) if days else 0.0}
    v = _cache['views'][title]
    return v['avg'], v['months']


def langlinks(title):
    """Number of interlanguage links for a canonical title (cached)."""
    if title not in _cache['langlinks']:
        n, cont = 0, {}
        while True:
            q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'titles': title,
                                        'prop': 'langlinks', 'lllimit': 'max', **cont})
            r = get_json(f'{API}?{q}')
            for p in r['query']['pages'].values():
                n += len(p.get('langlinks', []))
            if 'continue' not in r:
                break
            cont = r['continue']
        _cache['langlinks'][title] = n
    return _cache['langlinks'][title]


def measure(x):
    """Full measurement record for one location (title choice, views, audit trail)."""
    lim = max(MATCH_KM, 2 * x.get('extentKm', 0))
    res = resolve(candidates(x))
    accepted, nocoord, rejected = {}, {}, []
    for cand, r in res.items():
        if r is None or r['disambig']:
            rejected.append((cand, 'missing' if r is None else 'disambiguation'))
            continue
        if r['lat'] is None:
            nocoord[r['title']] = cand
            continue
        d = hav(x['lat'], x['lng'], r['lat'], r['lng'])
        (accepted.__setitem__(r['title'], round(d, 1)) if d <= lim
         else rejected.append((cand, f"coords {round(d)} km from pin")))
    method = 'title+coords'
    if not accepted:
        want = tokens(x['short'])
        for t, dist in geosearch(x['lat'], x['lng']):
            if want & tokens(t):
                accepted[t] = round(dist / 1000, 1)
        method = 'geosearch' if accepted else method
    no_enwiki = None
    if not accepted:                                  # 4. enwiki full-text search, coords-checked
        for t, d in search_titles(x, lim):
            accepted[t] = d
        method = 'search' if accepted else method
    if not accepted:                                  # 5. Wikidata entity search, coords-checked
        hits = wikidata_hits(x, lim)
        for q, t, d in hits:
            if t:
                accepted[t] = d
        method = 'wikidata-search' if accepted else method
        if not accepted and hits:
            no_enwiki = hits[0]
    if not accepted and nocoord:
        accepted = {t: None for t in nocoord}
        method = 'title-nocoords'
    if not accepted and no_enwiki:                    # entity verified at the pin, no English article: 0 views
        return {'id': x['id'], 'method': 'wikidata-no-enwiki', 'title': None, 'views': 0.0, 'months': 0,
                'distKm': no_enwiki[2], 'qid': no_enwiki[0], 'alternatives': {}, 'rejected': rejected}
    if not accepted:
        return {'id': x['id'], 'method': 'UNRESOLVED', 'views': None, 'rejected': rejected}
    scored = {t: views(t) for t in accepted}
    best = max(scored, key=lambda t: scored[t][0])
    return {'id': x['id'], 'method': method, 'title': best, 'views': scored[best][0],
            'months': scored[best][1], 'distKm': accepted[best],
            'alternatives': {t: v[0] for t, v in scored.items() if t != best}, 'rejected': rejected}


def measure_all(items, workers=6):
    """Measure many locations in parallel; saves cache at the end."""
    try:
        with ThreadPoolExecutor(workers) as ex:
            return list(ex.map(measure, items))
    finally:
        save_cache()
