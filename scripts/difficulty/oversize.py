"""Oversize natural features (framework §2.7: R > 150 km is not eligible) -> oversize-features.json.

Reads extent.json (extent.py). Natural class only; cities are never listed. Admin regions and
linear man-made features over 150 km go to a separate `otherOversize` list for visibility.
Each entry gets a suggested replacement strategy by feature type, the Wikidata highest point
(P610) as a concrete re-pin target where one exists, and dataset entries already inside the
feature's postcard radius (candidates that make retiring it lossless).
"""
import json, os, re, urllib.parse
import wiki
from wiki import hav, get_json

HERE = os.path.dirname(os.path.abspath(__file__))
L = json.load(open(os.path.join(HERE, '..', '..', 'assets', 'locations.json')))
EXT = json.load(open(os.path.join(HERE, 'extent.json')))
WD = 'https://www.wikidata.org/w/api.php'

STRATEGY = [  # (P31-label regex, type, strategy); first match wins
    (r'river|stream|watercourse', 'river',
     'Re-pin to a canonical point on the river: its mouth, a named falls, or a named city crossing ("Mouth of the X"), as §3b did for the Mississippi. Otherwise retire.'),
    (r'lake|reservoir|lagoon', 'lake',
     'Re-pin to a named point on the lake (port town, island, outlet or dam) and name it in the clue. Otherwise retire if a lakeside entry already covers it.'),
    (r'desert|erg|dune', 'desert',
     'Retire, or re-pin to a named oasis, dune field or landmark inside it (e.g. Erg Chebbi or Siwa for the Sahara).'),
    (r'range|massif|mountain system|highland|upland|hills|plateau', 'mountain range',
     'Re-pin to the highest summit (a point feature, so S=0) and rename it to that summit. Otherwise retire.'),
    (r'reef|atoll', 'reef',
     'Re-pin to a named reef, cay or dive site (e.g. Heart Reef). Otherwise retire.'),
    (r'park|protected|reserve|wilderness|sanctuary|conservation', 'park / protected area',
     'Re-pin to the park\'s signature landmark or main gateway (e.g. Old Faithful for Yellowstone) and rename it. Otherwise retire.'),
    (r'archipelago|island', 'island / archipelago',
     'Re-pin to the main town or highest peak of the island group and rename it. Otherwise retire.'),
    (r'delta|estuary', 'delta',
     'Re-pin to the river mouth or the delta\'s main town. Otherwise retire.'),
    (r'sea|gulf|bay|strait|sound|fjord|ocean', 'water body',
     'Re-pin to a named strait narrows, port or island in it. Otherwise retire.'),
    (r'forest|rainforest|jungle|savanna|steppe|plain|wetland|marsh|swamp', 'biome / land cover',
     'Re-pin to a named town, lodge or landmark inside it. Otherwise retire.'),
    (r'coast|peninsula|valley|canyon|gorge|basin|region|landscape', 'region / landform',
     'Re-pin to the canonical town or viewpoint (e.g. the canyon\'s main overlook). Otherwise retire.'),
]


def kind(labels):
    """P31 labels -> (type, strategy)."""
    for rx, t, s in STRATEGY:
        if any(re.search(r'\b(' + rx + r')\b', l.lower()) for l in labels):
            return t, s
    return 'other natural', 'Re-pin to a named canonical point inside it. Otherwise retire.'


def highest_points(qs):
    """Q -> {'q','name','lat','lng'} of its Wikidata highest point (P610), if any."""
    out, hp = {}, {}
    for i in range(0, len(qs), 50):
        q = urllib.parse.urlencode({'action': 'wbgetentities', 'format': 'json', 'ids': '|'.join(qs[i:i + 50]), 'props': 'claims'})
        for k, e in get_json(f'{WD}?{q}')['entities'].items():
            v = [s['mainsnak']['datavalue']['value']['id'] for s in e.get('claims', {}).get('P610', []) if s['mainsnak'].get('datavalue')]
            if v:
                hp[k] = v[0]
    tq = sorted(set(hp.values()))
    info = {}
    for i in range(0, len(tq), 50):
        q = urllib.parse.urlencode({'action': 'wbgetentities', 'format': 'json', 'ids': '|'.join(tq[i:i + 50]),
                                    'props': 'claims|labels', 'languages': 'en'})
        for k, e in get_json(f'{WD}?{q}')['entities'].items():
            c = [s['mainsnak']['datavalue']['value'] for s in e.get('claims', {}).get('P625', []) if s['mainsnak'].get('datavalue')]
            info[k] = {'q': k, 'name': e.get('labels', {}).get('en', {}).get('value'),
                       'lat': c[0]['latitude'] if c else None, 'lng': c[0]['longitude'] if c else None}
    for k, v in hp.items():
        out[k] = info.get(v)
    return out


def main():
    by = {x['id']: x for x in L}
    big = [(i, r) for i, r in EXT.items() if r['extentKm'] is not None and r['extentKm'] > 150]
    hp = highest_points(sorted({r['qid'] for _, r in big if r['class'] == 'natural'}))
    nat, other = [], []
    for i, r in sorted(big, key=lambda t: -t[1]['extentKm']):
        x = by[i]
        t, strat = kind(r['P31'])
        inside = sorted(((round(hav(x['lat'], x['lng'], y['lat'], y['lng'])), y['id']) for y in L
                         if y['id'] != i and EXT[y['id']]['class'] in ('city', 'point')
                         and hav(x['lat'], x['lng'], y['lat'], y['lng']) <= 150))[:5]
        e = {'id': i, 'name': x['short'], 'type': t, 'extentKm': r['extentKm'], 'extentSource': r['extentSource'],
             'wikidata': r['qid'], 'wikidataClass': r['P31'], 'currentDifficulty': x['difficulty'],
             'suggestedStrategy': strat}
        h = hp.get(r['qid'])
        if h and h.get('lat') is not None and t in ('mountain range', 'park / protected area', 'island / archipelago', 'region / landform', 'other natural'):
            e['repinCandidate'] = {'name': h['name'], 'wikidata': h['q'], 'lat': h['lat'], 'lng': h['lng'],
                                   'basis': 'Wikidata P610 highest point'}
        if inside:
            e['datasetEntriesWithin150km'] = [{'id': j, 'km': d} for d, j in inside]
        if r.get('warn'):
            e['warn'] = r['warn']
        (nat if r['class'] == 'natural' else other).append(e)
    unmeasured = [{'id': i, 'name': by[i]['short'], 'wikidataClass': r['P31'], 'why': r['extentSource']}
                  for i, r in EXT.items() if r['class'] == 'natural' and r['extentKm'] is None]
    out = {'meta': {'generated': '2026-10-06', 'rule': 'framework §2.7: R (pin to farthest edge) > 150 km is not eligible',
                    'scope': 'natural features only (Wikidata P31 class), cities never; see extent.py',
                    'counts': {'natural': len(nat), 'otherOversize': len(other), 'naturalUnmeasured': len(unmeasured)},
                    'notRemoved': 'list only; assets/locations.json is untouched'},
           'features': nat, 'otherOversize': other, 'naturalUnmeasured': unmeasured}
    json.dump(out, open(os.path.join(HERE, 'oversize-features.json'), 'w'), indent=1, ensure_ascii=False)
    for e in nat:
        print(f"{e['extentKm']:6d} km  {e['id']:34s} {e['type']}")
    print(out['meta']['counts'])


if __name__ == '__main__':
    main()
