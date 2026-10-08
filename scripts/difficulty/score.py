"""Difficulty scorer (framework 2026-10-06) on measured inputs.

  base = MATRIX[F][A'], A' = A - 1 for a capital / #1 metro in an A2-A3 country  (primate relief §2.2)
  base = min(base, neighbor_base + clamp(F - 1, 0, 3))                          (neighbor rule §2.6)
  D    = clamp(base + K + C + S - G, 2, 10); icons (§2.9) get base 1 and may reach 1.
Decisions 1-4 of 2026-10-06 (README): `difficulty` IS the framework variant; `basic` keeps
MATRIX[F][A] + K + C + S - G for audit only. Icon landmarks need F0 (decision 3).

Inputs: wiki.py (F), country-span.json + main-territory.npz (A), country-familiarity.json (K),
clue text (C), extent.json (S, measured by extent.py), geo-anchors.json (G), primate-cities.json (icon/relief).
Usage: python3 score.py [--ids <id list json>] [--out ../../assets/difficulty/difficulty-full.json]   (default: all locations)
"""
import argparse, json, os, re, unicodedata
from collections import Counter
import numpy as np
import wiki
from wiki import norm, tokens, hav

HERE = os.path.dirname(os.path.abspath(__file__))
LOCS = os.path.join(HERE, '..', '..', 'assets', 'locations.json')
MATRIX = [[2, 2, 3, 3], [2, 3, 4, 5], [3, 4, 5, 6], [4, 5, 6, 7], [5, 6, 7, 8], [6, 7, 8, 9]]  # §2.3
F_TIERS = [(2500, 0), (1200, 1), (500, 2), (200, 3), (50, 4)]                                 # §2.1
BULLSEYE_KM, DETACH_KM, NEAR_KM = 25, 500, 150   # DETACH_KM must match country_span.py
J = lambda f: json.load(open(os.path.join(HERE, f)))
SPAN, FAM, ANCH, PRIM = J('country-span.json'), J('country-familiarity.json'), J('geo-anchors.json'), J('primate-cities.json')
TERR = np.load(os.path.join(HERE, 'main-territory.npz'))
EXT = J('extent.json')
PINS = J('pin-suspects.json')['items'] if os.path.exists(os.path.join(HERE, 'pin-suspects.json')) else {}

ALIASES = {  # names that count as "the clue names the country" (§2.5); matched on norm() text
    'United States': ['united states', 'usa', 'u s a', 'u s'],
    'United Kingdom': ['united kingdom', 'uk', 'britain', 'england', 'scotland', 'wales', 'northern ireland'],
    'England': ['england', 'united kingdom', 'uk', 'britain'], 'Scotland': ['scotland', 'united kingdom', 'uk', 'britain'],
    'Wales': ['wales', 'united kingdom', 'uk', 'britain'], 'Northern Ireland': ['northern ireland', 'united kingdom', 'uk'],
    'Czech Republic': ['czech republic', 'czechia'], "Côte d'Ivoire": ['cote d ivoire', 'ivory coast'],
    'DR Congo': ['dr congo', 'drc', 'democratic republic of the congo'], 'Congo': ['republic of the congo', 'congo'],
    'Timor-Leste': ['timor leste', 'east timor'], 'Cape Verde': ['cape verde', 'cabo verde'],
    'Vatican City': ['vatican'], 'Myanmar': ['myanmar', 'burma'], 'North Macedonia': ['north macedonia', 'macedonia'],
    'Micronesia': ['micronesia'], 'Antarctica': ['antarctica', 'antarctic'], 'International Waters': [],
}
# phrases that contain a country name but name a different place
FALSE_HITS = ['guinea bissau', 'papua new guinea', 'equatorial guinea', 'northern ireland', 'american samoa',
              'south sudan', 'dr congo', 'democratic republic of the congo', 'new mexico', 'new jersey']


def f_tier(v):
    """Views/day -> F (§2.1)."""
    for lim, f in F_TIERS:
        if v >= lim:
            return f
    return 5


def point_in_rings(lat, lng, verts, lens):
    """Ray-cast point-in-polygon over concatenated rings."""
    i = 0
    for n in lens:
        r = verts[i:i + n]; i += n
        y, x = r[:, 0], r[:, 1]
        y2, x2 = np.roll(y, -1), np.roll(x, -1)
        m = (y > lat) != (y2 > lat)
        xs = x[m] + (lat - y[m]) * (x2[m] - x[m]) / (y2[m] - y[m])
        if np.count_nonzero(xs > lng) % 2:
            return True
    return False


def detached_km(x):
    """Distance (km) from the pin to the country's main territory; 0 if inside."""
    c = x['country']
    if c not in TERR.files:
        return None
    v = TERR[c]
    la, lo = np.radians(v[:, 0]), np.radians(v[:, 1])
    pla, plo = np.radians(x['lat']), np.radians(x['lng'])
    dot = np.sin(la) * np.sin(pla) + np.cos(la) * np.cos(pla) * np.cos(lo - plo)
    d = float(6371 * np.arccos(np.clip(dot.max(), -1, 1)))
    if d > DETACH_KM and point_in_rings(x['lat'], x['lng'], v, TERR[c + '|rings']):
        return 0.0
    return d


def a_term(x):
    """A from measured span; detached pins (> 1000 km from main territory) -> 2 (§2.2)."""
    c = x['country']
    if c == 'International Waters':
        return 1, 'international waters', None
    d = detached_km(x)
    if d is not None and d > DETACH_KM:
        return 2, f'detached territory ({round(d)} km from main territory)', d
    return SPAN[c]['A'], f"span {SPAN[c]['spanKm']} km", d


def k_term(x):
    """K from the curated country list or remote-dependency regions (§2.4)."""
    for r in FAM['regions']:
        a, b, c, d = r['bbox']
        if a <= x['lat'] <= c and b <= x['lng'] <= d:
            return r['K'], r['name']
    k = FAM['K'].get(x['country'], 0)
    return k, (x['country'] if k else None)


def names_country(clue, country):
    """True if the clue text names the country or an accepted alias (flag alone does not count)."""
    t = ' ' + norm(clue) + ' '
    for fh in FALSE_HITS:
        if fh not in [norm(a) for a in ALIASES.get(country, [country])]:
            t = t.replace(' ' + fh + ' ', ' _ ')
    if 'U.S.' in clue or re.search(r'\bUSA?\b', clue):      # case-sensitive: avoid the pronoun "us"
        t += ' usa '
    al = [norm(a) for a in ALIASES.get(country, [country])]
    al = [a for a in al if a not in ('u s', 'uk')] + (['usa'] if country == 'United States' else [])
    if country in ('United Kingdom', 'England', 'Scotland', 'Wales', 'Northern Ireland') and re.search(r'\bUK\b', clue):
        return True
    return any(re.search(r'(?<![a-z])' + re.escape(a) + r'(?![a-z])', t) for a in al)


def c_term(x):
    """C: 0 names country, +1 names place only, +2 riddle with the place name absent (§2.5)."""
    if names_country(x['clue'], x['country']):
        return 0, 'country named'
    fix = lambda s: ' ' + re.sub(r'\b(mt|mount)\b', 'mount', re.sub(r'\bthe\b', ' ', norm(s))).replace('  ', ' ').strip() + ' '
    if fix(x['short']) in fix(x['clue']):              # whole name as a phrase
        return 1, 'place named, country not'
    # else: a distinctive token of the name appearing CAPITALISED in the clue (proper noun use).
    # "Blue Mosque" vs "...mosque glow blue..." stays a riddle; "Valley of the Kings" counts.
    ascii_clue = unicodedata.normalize('NFKD', x['clue'].replace('\u2019', "'")).encode('ascii', 'ignore').decode()
    words = re.findall(r"[A-Za-z0-9]+", ascii_clue)
    caps = {w.lower() for w in words[1:] if w[0].isupper()}
    hit = tokens(x['short']) & caps
    if hit:
        return 1, f"place named (proper-noun match: {sorted(hit)}), country not"
    return 2, f"riddle: no distinctive token of '{x['short']}' named in clue"


def s_term(x):
    """S from extent.json (§2.7): (S, eligible, extentKm, source). Point/city class -> S=0 by
    construction; extended but unmeasured -> S=0, flagged."""
    r = EXT.get(x['id'])
    if r is None:
        raise SystemExit(f"extent.json has no row for {x['id']}: rerun extent.py first")
    e = r['extentKm']
    if e is None:
        return 0, True, None, r['extentSource'] or f"class {r['class']}: no article/Wikidata class"
    return (1 if e > BULLSEYE_KM else 0), e <= NEAR_KM, e, r['extentSource']


def g_term(x):
    """G = 1 if pin is within 25 km of a curated anchor (§2.8)."""
    for a in ANCH['anchors']:
        for la, lo in a['pts']:
            if hav(x['lat'], x['lng'], la, lo) <= BULLSEYE_KM:
                return 1, a['name']
    return 0, None


def is_primate_city(x):
    """City-type item whose name is the country's capital or #1 metro."""
    s = norm(x['short'])
    names = {norm(n) for n in PRIM.get(x['country'], [])}
    return s in names and norm(x['clue']).startswith(s)


def neighbors(x, L):
    """Other dataset entries within 25 km."""
    return [y for y in L if y['id'] != x['id'] and hav(x['lat'], x['lng'], y['lat'], y['lng']) <= BULLSEYE_KM]


def build(ids, L):
    """Measure pilot items + their 25 km neighbors, then score."""
    by = {x['id']: x for x in L}
    pilot = [by[i] for i in ids]
    nb = {x['id']: neighbors(x, L) for x in pilot}
    need = {x['id']: x for x in pilot} | {y['id']: y for v in nb.values() for y in v}
    meas = {m['id']: m for m in wiki.measure_all(list(need.values()))}

    def F_of(i):
        m = meas[i]
        if m['views'] is None:
            return None, None
        f = f_tier(m['views'])
        ll = wiki.langlinks(m['title']) if f == 0 else None
        if f == 0 and ll < 100:                    # §2.1 news-spike guard
            f = 1
        return f, ll

    Fs = {i: F_of(i) for i in need}
    wiki.save_cache()

    def icon_city(i):
        y = by[i]; f, ll = Fs[i]
        return f == 0 and ll is not None and ll >= 200 and is_primate_city(y) and k_term(y)[0] == 0

    def plain_base(i, relief):
        f = Fs[i][0]
        a = a_term(by[i])[0]
        if relief and a >= 2 and is_primate_city(by[i]):
            a -= 1
        return MATRIX[f][a]

    out = []
    import time; t0 = time.time()
    for n, x in enumerate(pilot):
        if n and n % 500 == 0:
            print(f'scored {n}/{len(pilot)} {time.time() - t0:.0f}s', flush=True)
        i, m = x['id'], meas[x['id']]
        F, ll = Fs[i]
        notes = []
        if F is None:
            notes.append('UNRESOLVED: no Wikipedia article matched; F not measured')
        A, a_note, det = a_term(x)
        K, k_note = k_term(x)
        C, c_note = c_term(x)
        S, eligible, ext, s_src = s_term(x)
        G, g_note = g_term(x)
        if ext is None and not s_src.startswith(('city', 'point')):
            notes.append(f'extentKm unmeasured -> S=0 ({s_src})')
        if not eligible:
            notes.append(f'NOT ELIGIBLE: extentKm {ext} > 150 (§2.7); score shown for reference')
        if m.get('method') == 'geosearch':
            notes.append('title found by geosearch (name-token match within 10 km)')
        if m.get('method') in ('search', 'wikidata-search'):
            notes.append(f"title found by {m['method']} (coords within {wiki.MATCH_KM} km): check it is this place")
        if m.get('method') == 'wikidata-no-enwiki':
            notes.append(f"no English Wikipedia article: Wikidata {m.get('qid')} at the pin has no enwiki sitelink -> 0 views/day (F5)")
        p = PINS.get(i, {})
        if 'error' in p:
            notes.append(f"PIN ERROR: pin is in {p['error']['pinIsInside']}, {p['error']['nearestOwnBorderKm']} km from {x['country']}"
                         + (' (latitude sign flip)' if p['error']['latitudeSignFlipFixes'] else '') + '; A/G/neighbor terms unreliable until fixed')
        if 'review' in p:
            notes.append(f"PIN REVIEW: article '{p['review']['sameNameArticle']}' is {p['review']['articleKmFromPin']} km from the pin")
        if 'disputed' in p:
            notes.append(f"disputed territory: pin is in {p['disputed']['pinIsInside']} (Natural Earth)")
        if m.get('months') not in (None, 12):
            notes.append(f"pageviews cover only {m['months']}/12 months (avg over covered days)")
        icon_nb = [y['id'] for y in nb[i] if icon_city(y['id'])]
        icon = F is not None and (icon_city(i) or (F == 0 and bool(icon_nb)))   # decision 3: F0 only
        row = {'id': i, 'short': x['short'], 'clue': x['clue'], 'country': x['country'],
               'old': {'difficulty': x['difficulty'], 'difficultyWhy': x['difficultyWhy']},
               'measured': {'wikiTitle': m.get('title'), 'titleMethod': m.get('method'),
                            'titleDistKm': m.get('distKm'), 'viewsPerDay': m.get('views'),
                            'altTitles': m.get('alternatives'), 'langlinks': ll,
                            'countrySpanKm': SPAN[x['country']]['spanKm'], 'A_basis': a_note,
                            'extentKm': ext, 'extentSource': s_src, 'extentClass': EXT[i]['class'], 'K_basis': k_note, 'C_basis': c_note, 'G_anchor': g_note},
               'eligible': eligible, 'pinCheck': PINS.get(i), 'notes': notes}
        if F is None:
            row.update(difficulty=None, difficultyWhy='UNRESOLVED (F not measured)')
            out.append(row); continue
        base = 1 if icon else MATRIX[F][A]
        D = max(1 if icon else 2, min(10, base + K + C + S - G))
        basic = {'difficulty': D, 'difficultyWhy': f"F{F}·A{A}·K{K}·C{C}·S{S}" + (f"·G{G}" if G else '') + f" → {D}"}
        # shipped (decision 1): + primate relief (§2.2) + neighbor rule (§2.6)
        fb = 1 if icon else plain_base(i, True)
        step = max(0, min(3, F - 1))
        better = [(1 if icon_city(y['id']) else plain_base(y['id'], True), y['id']) for y in nb[i]
                  if Fs[y['id']][0] is not None and (meas[y['id']]['views'] or 0) > (m['views'] or 0)]
        nbase, nid = min(better) if better else (None, None)
        fbase = min(fb, nbase + step) if nbase is not None else fb
        FD = max(1 if icon else 2, min(10, fbase + K + C + S - G))
        used_nb = nid if nbase is not None and nbase + step < fb else None
        row.update(difficulty=FD,
                   difficultyWhy=f"F{F}·A{A}·K{K}·C{C}·S{S}" + (f"·G{G}" if G else '') + f" → {FD}"
                   + (' (Icon)' if icon else '') + (' (relief)' if row_relief(fb, F, A, icon) else '')
                   + (f" (neighbor {used_nb})" if used_nb else ''),
                   terms={'F': F, 'A': A, 'K': K, 'C': C, 'S': S, 'G': G, 'base': fbase, 'icon': icon,
                          'iconVia': icon_nb if icon and not icon_city(i) else None,
                          'relief': row_relief(fb, F, A, icon), 'neighbor': used_nb, 'neighborStep': step},
                   basic=basic)
        out.append(row)
    return out


def row_relief(fb, F, A, icon):
    """True when primate relief lowered the base."""
    return (not icon) and fb < MATRIX[F][A]


CALIBRATION = {  # framework §3a/§3b "formula" column (current clues), for checking only
    'bengaluru-in': 5, 'chennai-in': 5, 'mount-etna': 3, 'shibuya-crossing-tokyo': 3, 'nara': 6,
    'mount-everest-summit': 3, 'mecca-saudi-arabia': 3, 'geneva': 2, 'black-forest': 5, 'toronto': 3,
    'easter-island-moai': 4, 'xian-china': 5, 'forbidden-city-beijing': 2, 'cali-co': 6,
    'charles-bridge-prague': 3, 'cairo': 3, 'stonehenge': 3, 'kanpur-in': 6, 'agra-in': 4,
    'lotus-temple': 5, 'surabaya-id': 7, 'odaiba-tokyo': 5, 'vladivostok-russia': 5,
    'table-mountain-cape-town': 6, 'sultan-ahmed-mosque': 4, 'daintree-rainforest': 9}

META = {
    'generated': '2026-10-06', 'status': 'FULL RUN (dry run). assets/locations.json NOT modified.',
    'formula': 'base = MATRIX[F][A] with primate relief (§2.2) and the neighbor rule (§2.6); '
               'difficulty = clamp(base + K + C + S - G, 2, 10); Icon (§2.9) base 1, may reach 1. '
               '`basic` = MATRIX[F][A] + K + C + S - G without relief/neighbor, for audit only.',
    'decisions': 'difficulty-measured/README.md "Decisions (2026-10-06)": 1 framework variant ships; '
                 '2 S measured from OSM for extended features, point/city items S=0 by construction; '
                 '3 Forbidden City = 2, icon landmarks need F0; 4 measured spans, detached threshold 500 km.',
    'sources': {
        'F': 'en.wikipedia user pageviews, monthly 2025-10..2026-09, avg/day over covered days. Title = most-viewed of '
             'candidates (short, clue name, "<name>, <country>", suffix-stripped main article) that resolve (redirects '
             'followed), are not disambiguation pages, and whose article coordinates are within 50 km (or 2x extentKm) '
             'of the pin; fallbacks: geosearch within 10 km with a name-token match, then enwiki full-text search and Wikidata entity search (coords-checked); a Wikidata entity at the pin with no enwiki article = 0 views (F5). F0 with < 100 langlinks -> F1 (§2.1).',
        'A': 'Natural Earth 10m admin-0 countries (map_units for England/Scotland/Wales/N. Ireland). Main territory = '
             'polygons within 500 km of the largest polygon; span = max great-circle vertex distance. Pins > 500 km '
             'from main territory -> A2 (detached). International Waters -> A1.',
        'K': 'country-familiarity.json: framework §2.4 lists verbatim + bbox regions for Chagos, Pitcairn, Tristan da Cunha.',
        'C': '0 if the clue text names the country or an alias (flag emoji alone does not count); 2 if no distinctive '
             'token of `short` appears as a proper noun in the clue; else 1.',
        'S': 'extent.json (extent.py): own enwiki article -> Wikidata P31 class. city/point -> S=0 by construction. '
             'natural/admin/linear -> R = max km from pin to the OSM geometry tagged wikidata=Q (Nominatim, Overpass '
             'fallback), else to the Wikidata extreme points P1332-P1335. R > 25 -> S1; R > 150 -> ineligible (§2.7).',
        'pins': 'pin-suspects.json (pins.py): pin outside its country (sign flip / other country) = PIN ERROR; same-name '
                'article 50-500 km from the pin = PIN REVIEW. Flags only; no score is changed by them.',
        'G': 'geo-anchors.json: exactly the §2.8 named examples (Bering, Gibraltar, Suez, Panama, Easter Island, Cape of Good Hope).',
        'icon': 'F0 + langlinks >= 200 + capital/#1 metro (primate-cities.json) + K0, city-type item; or an F0 landmark '
                'within 25 km of such a city (decision 3).'},
    'fallbacks': 'No estimates anywhere. If no title resolves, difficulty=null and the item is marked UNRESOLVED. '
                 'Extended features with no OSM geometry use the Wikidata extreme points (P1332-P1335); with neither, '
                 'S=0 and the item is flagged "extentKm unmeasured". Framework/hand extentKm values are NOT used.',
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ids', default=None, help='json id list; default all locations')
    ap.add_argument('--out', default=os.path.join(HERE, '..', '..', 'assets', 'difficulty', 'difficulty-full.json'))
    a = ap.parse_args()
    L = json.load(open(LOCS))
    rows = build(json.load(open(a.ids)) if a.ids else [x['id'] for x in L], L)
    calib = {r['id']: (r['difficulty'], CALIBRATION[r['id']]) for r in rows if r['id'] in CALIBRATION}
    meta = dict(META, calibration={
        'what': 'difficulty vs framework §3 "formula" column (same clues)',
        'exact': sum(a == b for a, b in calib.values()), 'within1': sum(abs(a - b) <= 1 for a, b in calib.values()
                                                                          if a is not None),
        'n': len(calib), 'misses': {k: {'measured': a, 'framework': b} for k, (a, b) in calib.items() if a != b}},
        counts={'items': len(rows), 'unresolved': [r['id'] for r in rows if r['difficulty'] is None],
                'geosearchTitles': sum(r['measured']['titleMethod'] == 'geosearch' for r in rows),
                'ineligible': [r['id'] for r in rows if not r['eligible']],
                'pinErrors': [r['id'] for r in rows if (r['pinCheck'] or {}).get('error')],
                'pinReview': [r['id'] for r in rows if (r['pinCheck'] or {}).get('review')],
                'titleMethods': dict(Counter(r['measured']['titleMethod'] for r in rows)),
                'extentUnmeasured': [r['id'] for r in rows if any(n.startswith('extentKm unmeasured') for n in r['notes'])],
                'histogram': dict(sorted(Counter(r['difficulty'] for r in rows if r['difficulty']).items())),
                'histogramOld': dict(sorted(Counter(r['old']['difficulty'] for r in rows).items())),
                'icons': [r['id'] for r in rows if r.get('terms', {}).get('icon')]})
    json.dump({'meta': meta, 'items': rows}, open(a.out, 'w'), indent=1, ensure_ascii=False)
    for r in rows:
        print(f"{r['id'][:32]:32s} old {r['old']['difficulty']:>2} | new {str(r['difficulty']):>4} {r['difficultyWhy']}")


if __name__ == '__main__':
    main()
