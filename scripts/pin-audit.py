#!/usr/bin/env python3
"""Pin coordinate audit: compare each stored pin with independent centre references.

Promoted from shots/pin-audit/analyze4.py (docs/pin-accuracy-review-opus.md, 2026-10-15).
Standard library only. Every API answer is cached in a compact JSON file, so re-runs are
offline and fast; only new entries or changed clues trigger network calls.

References per entry:
  - Wikidata P625 of the entry's QID. QID comes from the repo's difficulty resolver
    (scripts/difficulty/v2-data/resolved-v2.json, plus .batch1/.batch2 resolved-batch.json
    when present), else the cached qid:<id> from an earlier run, else an en.wikipedia pageprops
    lookup of "<short>, <country>" then "<short>". Check a looked-up QID is the city itself.
  - OSM mapped centre: Nominatim search on the clue text. Used only when the result is a
    place object or a boundary with extratags.linked_place, its wikidata tag equals the QID,
    and it lies within 50 km of the Wikidata point. Unlinked boundary results are polygon
    centroids and are never used.

Per entry it reports dWd, dOsm (km, haversine R = 6371.0088), dLo / dHi (nearest / farthest
reference) and the review's risk class:
  A  >= 5 km from every reference      B  >= 5 km from one reference
  C  3 to 5 km                         D  under 3 km from all references
GATE: an entry is flagged for manual review when dLo >= --gate-km (default 3), i.e. it sits
3 km or more from EVERY independent reference. Flagging only; nothing is ever overwritten.

Usage (from demo/):
  python3 scripts/pin-audit.py                      # whole dataset: tables + flagged list
  python3 scripts/pin-audit.py --ids a,b,c          # gate only these ids (new or changed entries)
  python3 scripts/pin-audit.py --ids a,b --reverse  # also reverse-geocode each listed pin
  python3 scripts/pin-audit.py --locations other.json --json out.json
Inputs:  assets/locations.json (or --locations), the resolver files above, the cache.
Outputs: report on stdout (with --ids also each entry's nearest other entry); optional --json with one row per entry; the cache is updated in place.
Exit:    0 when no audited entry is flagged, 1 when any is (so a batch script can stop on it),
         2 on a missing reference (no QID or no Wikidata P625; fix the resolver, then re-run).
"""
import argparse, json, math, os, re, sys, time, urllib.parse, urllib.request
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'map-game-pin-audit/1.0 (where-on-earth; gartland.79 at gmail)'}
BANDS = [0.5, 1, 2, 5, 10, 25]


def hav(a, b, c, d):
    r = math.pi / 180
    h = math.sin((c - a) * r / 2) ** 2 + math.cos(a * r) * math.cos(c * r) * math.sin((d - b) * r / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(min(1, h)))


class Cache:
    def __init__(self, path, offline):
        self.path, self.offline, self.dirty = path, offline, False
        self.d = json.load(open(path)) if os.path.exists(path) else {}

    def get(self, key, url, compact, delay):
        if key in self.d:
            return self.d[key]
        if self.offline:
            raise SystemExit(f'offline and not cached: {key}')
        err = None
        for t in range(5):
            try:
                raw = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
                break
            except Exception as e:
                err = e
                time.sleep(2 + 3 * t)
        else:
            raise err
        self.d[key] = compact(raw)
        self.dirty = True
        time.sleep(delay)
        return self.d[key]

    def save(self):
        if self.dirty:
            with open(self.path, 'w') as f:
                json.dump(self.d, f, indent=0, sort_keys=True, ensure_ascii=False)


def resolver_qids():
    q = {}
    for f in ('scripts/difficulty/v2-data/resolved-v2.json', '.batch1/resolved-batch.json', '.batch2/resolved-batch.json'):
        p = os.path.join(ROOT, f)
        if os.path.exists(p):
            for k, v in json.load(open(p)).items():
                if k not in q and v and v.get('qid'):
                    q[k] = v['qid']
    return q


def lookup_qid(cache, e):
    def compact(raw):
        p = raw['query']['pages'][0]
        pp = p.get('pageprops', {})
        return None if 'missing' in p or 'disambiguation' in pp else pp.get('wikibase_item')
    for t in (f"{e['short']}, {e['country']}", e['short']):
        u = 'https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'format': 'json', 'formatversion': 2, 'redirects': 1, 'prop': 'pageprops', 'ppprop': 'wikibase_item|disambiguation', 'titles': t})
        q = cache.get('enwiki:' + t, u, compact, 0.2)
        if q:
            return q
    return None


def wikidata(cache, qid):
    def compact(raw):
        cs = raw['entities'][qid].get('claims', {}).get('P625', [])
        cs = [c for c in cs if c['mainsnak'].get('snaktype') == 'value' and c.get('rank') != 'deprecated']
        cs = [c for c in cs if c.get('rank') == 'preferred'] or cs
        if not cs:
            return None
        v = cs[0]['mainsnak']['datavalue']['value']
        return {'p625': [v['latitude'], v['longitude']], 'precision': v.get('precision')}
    u = 'https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({'action': 'wbgetentities', 'format': 'json', 'props': 'claims', 'ids': qid})
    return cache.get('wd:' + qid, u, compact, 0.2)


def clue_query(clue):
    return re.sub(r"[^\w\s,.'()\-’]", '', clue, flags=re.U).strip().strip(',').strip()


def osm_search(cache, clue):
    def compact(raw):
        if not raw:
            return None
        r = raw[0]
        x = r.get('extratags') or {}
        return {'lat': float(r['lat']), 'lon': float(r['lon']), 'category': r.get('category'), 'type': r.get('type'),
                'wikidata': x.get('wikidata'), 'linked_place': x.get('linked_place'), 'name': r.get('display_name')}
    q = clue_query(clue)
    u = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': q, 'format': 'jsonv2', 'limit': 1, 'accept-language': 'en', 'extratags': 1})
    return cache.get('osm:' + q, u, compact, 1.1)


def reverse(cache, lat, lng):
    def compact(r):
        a = r.get('address', {})
        return {'display': r.get('display_name'), 'city': a.get('city') or a.get('town') or a.get('village') or a.get('municipality') or a.get('county'),
                'cat': r.get('category'), 'type': r.get('type')}
    u = 'https://nominatim.openstreetmap.org/reverse?' + urllib.parse.urlencode({'lat': f'{lat:.5f}', 'lon': f'{lng:.5f}', 'format': 'jsonv2', 'zoom': 18, 'addressdetails': 1, 'accept-language': 'en'})
    return cache.get(f'rev:{lat:.5f},{lng:.5f}', u, compact, 1.1)


def risk_class(lo, hi):
    return 'A' if lo >= 5 else 'B' if hi >= 5 else 'C' if hi >= 3 else 'D'


def audit(entries, cache, qids):
    rows = []
    for e in entries:
        o = {'id': e['id'], 'lat': e['lat'], 'lng': e['lng']}
        q = qids.get(e['id']) or cache.d.get('qid:' + e['id']) or lookup_qid(cache, e)
        if q and cache.d.get('qid:' + e['id']) != q:
            cache.d['qid:' + e['id']], cache.dirty = q, True
        w = wikidata(cache, q) if q else None
        if not w:
            o['error'] = 'no QID' if not q else f'no Wikidata P625 for {q}'
            rows.append(o)
            continue
        o['qid'], o['wd'], o['wdPrecision'] = q, w['p625'], w['precision']
        s = osm_search(cache, e['clue'])
        if s and s['wikidata'] == q and (s['category'] == 'place' or s['linked_place']) and hav(*w['p625'], s['lat'], s['lon']) <= 50:
            o['osm'] = [s['lat'], s['lon']]
        o['dWd'] = hav(e['lat'], e['lng'], *o['wd'])
        o['dOsm'] = hav(e['lat'], e['lng'], *o['osm']) if 'osm' in o else None
        ds = [d for d in (o['dWd'], o['dOsm']) if d is not None]
        o['dLo'], o['dHi'] = min(ds), max(ds)
        o['class'] = risk_class(o['dLo'], o['dHi'])
        rows.append(o)
    return rows


def dist(vals):
    c, cum, out = Counter(), 0, []
    for v in vals:
        c[next((b for b in BANDS if v < b), 'x')] += 1
    for b in BANDS:
        cum += c[b]
        out.append(f'{c[b]} ({cum})')
    return out + [str(c['x'])]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--locations', default=os.path.join(ROOT, 'assets/locations.json'))
    ap.add_argument('--ids', help='comma-separated ids to gate (default: all entries)')
    ap.add_argument('--cache', default=os.path.join(ROOT, 'scripts/pin-audit-cache.json'))
    ap.add_argument('--gate-km', type=float, default=3.0)
    ap.add_argument('--reverse', action='store_true', help='reverse-geocode the audited pins (use with --ids)')
    ap.add_argument('--offline', action='store_true', help='never fetch; fail on a cache miss')
    ap.add_argument('--json', help='write per-entry rows here')
    a = ap.parse_args()

    entries = all_entries = json.load(open(a.locations))
    if a.ids:
        want = set(a.ids.split(','))
        missing = want - {e['id'] for e in entries}
        if missing:
            raise SystemExit(f'unknown ids: {sorted(missing)}')
        entries = [e for e in entries if e['id'] in want]
    cache = Cache(a.cache, a.offline)
    try:
        rows = audit(entries, cache, resolver_qids())
        if a.reverse:
            for o in rows:
                o['rev'] = reverse(cache, o['lat'], o['lng'])
    finally:
        cache.save()

    for o in rows:
        o['nn'] = min((round(hav(o['lat'], o['lng'], e['lat'], e['lng']), 1), e['id']) for e in all_entries if e['id'] != o['id'])
    ok = [o for o in rows if 'error' not in o]
    errs = [o for o in rows if 'error' in o]
    flagged = [o for o in ok if o['dLo'] >= a.gate_km]
    print(f'entries {len(rows)}  with OSM centre {sum("osm" in o for o in ok)}  reference errors {len(errs)}')
    print('| comparison | n | < 0.5 km | 0.5-1 | 1-2 | 2-5 | 5-10 | 10-25 | >= 25 |')
    print('|---|---|---|---|---|---|---|---|---|')
    for lab, vals in (('stored vs Wikidata', [o['dWd'] for o in ok]), ('stored vs OSM mapped centre', [o['dOsm'] for o in ok if o['dOsm'] is not None]),
                      ('stored vs nearest reference', [o['dLo'] for o in ok])):
        print(f'| {lab} | {len(vals)} | ' + ' | '.join(dist(vals)) + ' |')
    cc = Counter(o['class'] for o in ok)
    print('risk classes: ' + '  '.join(f'{k} {cc[k]}' for k in 'ABCD'))
    print(f'\nGATE: {len(flagged)} flagged at >= {a.gate_km:g} km from every reference (manual review, never auto-overwrite)')
    for o in sorted(flagged, key=lambda o: -o['dLo']):
        osm = f"{o['dOsm']:.2f}" if o['dOsm'] is not None else 'n/a'
        print(f"  {o['id']}: dWd {o['dWd']:.2f}  dOsm {osm}  class {o['class']}")
    for o in errs:
        print(f"  REFERENCE ERROR {o['id']}: {o['error']}")
    if a.ids:
        print('\nnearest other entry (under 10 km needs a reason):')
        for o in rows:
            print(f"  {o['id']}: {o['nn'][1]} {o['nn'][0]} km" + ('  UNDER 10 KM' if o['nn'][0] < 10 else ''))
    if a.reverse:
        print('\nreverse geocode:')
        for o in rows:
            print(f"  {o['id']}: {o['rev']['city']} | {o['rev']['display']}")
    if a.json:
        json.dump(rows, open(a.json, 'w'), indent=1, ensure_ascii=False)
    sys.exit(2 if errs else 1 if flagged else 0)


if __name__ == '__main__':
    main()
