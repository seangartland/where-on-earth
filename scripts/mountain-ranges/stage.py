"""Mountain-ranges batch: assemble bank entries + extent records from geometry.py, score.py and the reviewed image
picks below, into scripts/mountain-ranges/staged.json (the per-chunk bank; merge.py writes it into the assets).
Span: countries holding at least 3% of the spine (game country outlines), ordered by share. The stored country is
the span text (lakes precedent: "Peru and Bolivia", "Malawi, Mozambique, and Tanzania"). Clue by span size:
1 country "Name, Country <flag>" (rivers), 2 "Name, A and B <flags>" (Lake Titicaca / Strait of Hormuz), 3 "Name, A, B,
and C" (Lake Malawi), 4+ "Name, <region>" (Caspian Sea / Black Sea), the region taken from the range's en.wikipedia
short description. No US state is ever named (landmark state rule).
Images: Commons files picked by eye from images.py contact sheets (center-square judged); the entry carries the 500px
thumbnail URL (recent-adds convention), HEAD 200 image/jpeg checked here.
Usage (from demo/): python3 scripts/mountain-ranges/stage.py <id> [<id> ...]"""
import json, os, sys, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import TMP, HERE, ROOT, RANGES, UA, get

STAGED = os.path.join(HERE, 'staged.json')
SPAN_MIN = 0.03
# Bank country names for game-outline names that differ (score_v2 / bank naming).
NAME = {'United States of America': 'United States', 'Democratic Republic of the Congo': 'DR Congo'}

TEXT = {
    'himalayas': dict(continent='Asia', region='Asia',
        fact="Ten of the world's fourteen peaks above 8,000 metres rise here, Everest among them, and the range is still "
             "being pushed upward as the Indian plate drives into Asia."),
    'andes': dict(continent='South America', region='South America',
        fact="The longest continental mountain range on Earth runs about 7,000 km down South America, and its highest "
             "summit, Aconcagua, is the tallest mountain outside Asia."),
    'alps': dict(continent='Europe', region='Central Europe',
        fact="The Alps arc about 1,200 km across eight countries and feed the Rhine, the Rhône and the Po; Mont Blanc "
             "is their highest summit."),
    'rocky-mountains': dict(continent='North America',
        fact="The Rockies stretch about 4,800 km from northern Canada to the American Southwest and carry the "
             "Continental Divide, which splits rivers bound for the Pacific from those bound for the Atlantic and Arctic."),
    'appalachian-mountains': dict(continent='North America',
        fact="Among the oldest mountains on Earth, they rose more than 400 million years ago and have since been worn "
             "down by erosion; the Appalachian Trail follows them for about 3,500 km."),
    'hindu-kush': dict(continent='Asia',
        fact="Tirich Mir, at 7,708 metres, is its highest peak, and Alexander the Great marched his army across its "
             "passes in 329 BC."),
    'karakoram': dict(continent='Asia',
        fact="Home to K2, the world's second-highest mountain, and to some of the longest glaciers outside the polar "
             "regions, among them the Siachen and the Baltoro."),
}
# Reviewed picks: Commons file title, license and author as recorded on the file page.
PICKS = {
    'himalayas': 'File:Aerial View of Peaks of Khumbu, Ngozumpa Glacier and Gokyo Lakes (crop).jpg',
    'andes': 'File:Cordillera de los Andes.jpg',
    'alps': None,   # filled from images-alps.json entry 01 (title prefix below)
    'rocky-mountains': 'File:Rocky Mountains (208692693).jpeg',
    'appalachian-mountains': 'File:Appalachian Mountains.jpg',
    'hindu-kush': 'File:File-Hindu Kush viewed from Camp Marmal at Mazar-e Sharif in Afghanistan2.JPG',
    'karakoram': 'File:Passu Panorama.jpg',
}
PICK_PREFIX = {'alps': 'File:View in an easterly direction towards the Western Alps'}


def flag(iso2): return ''.join(chr(0x1F1E6 + ord(c) - 65) for c in iso2.upper())


def join(names):
    return names[0] if len(names) == 1 else f'{names[0]} and {names[1]}' if len(names) == 2 else ', '.join(names[:-1]) + ', and ' + names[-1]


def iso2_of(iso3):
    for l in open(os.path.join(ROOT, 'scripts/difficulty/v2-data/countryInfo.txt'), encoding='utf-8'):
        if not l.startswith('#'):
            p = l.split('\t')
            if p[1] == iso3: return p[0]


def pick(rid):
    cands = json.load(open(os.path.join(TMP, f'images-{rid}.json')))
    if PICKS.get(rid): return next(c for c in cands if c['title'] == PICKS[rid])
    return next(c for c in cands if c['title'].startswith(PICK_PREFIX[rid]))


def head(url):
    req = urllib.request.Request(url, method='HEAD', headers=UA)
    r = urllib.request.urlopen(req, timeout=60)
    return r.status, r.headers.get('Content-Type')


def stage(rid):
    geo = json.load(open(os.path.join(TMP, f'geometry-{rid}.json')))
    sc = json.load(open(os.path.join(TMP, f'score-{rid}.json')))
    t = TEXT[rid]
    span = [(iso3, name) for (iso3, v), (name, _) in zip(geo['shareIso3'], geo['shares'])
            if iso3 and v >= SPAN_MIN and iso2_of(iso3)]
    names = [NAME.get(n, n) for _, n in span]
    short = RANGES[rid]
    if len(span) == 1: clue = f'{short}, {names[0]} {flag(iso2_of(span[0][0]))}'
    elif len(span) == 2: clue = f'{short}, {join(names)} {flag(iso2_of(span[0][0]))}{flag(iso2_of(span[1][0]))}'
    elif len(span) == 3: clue = f'{short}, {join(names)}'
    else: clue = f"{short}, {t['region']}"
    img = pick(rid)
    status, ctype = head(img['thumb'])
    assert status == 200 and ctype == 'image/jpeg', (rid, status, ctype)
    lat, lng = geo['midpoint']
    entry = dict(id=rid, short=short, clue=clue, fact=t['fact'], lat=lat, lng=lng, difficulty=sc['D'], image=img['thumb'],
                 country=join(names), continent=t['continent'], sets=['Mountains'], difficultyWhy=sc['why'],
                 category='city', kind='extent', extentType='line')
    extent = dict(type='line', lines=[geo['spine']],
                  source=(f"OpenStreetMap way {geo['sourceUrl'].rsplit('/', 1)[1]} ({short}, natural=mountain_range): "
                          f"the mapped spine line, simplified" if geo['license'] == 'ODbL' else
                          f"Wikidata P625 of {len(geo['peaks'])} named principal peaks of the {short} (P4552 chain to "
                          f"{geo['qid']}), joined in order along the range's axis, simplified"),
                  sourceUrl=geo['sourceUrl'], license=geo['license'], attribution=geo['attribution'],
                  sourceVertices=geo['sourceVertices'], vertices=geo['vertices'], maxDeviationKm=geo['maxDeviationKm'],
                  lengthKm=geo['lengthKm'])
    report = dict(image=dict(title=img['title'], page=img['page'], original=img['url'], license=img['license'], author=img['author'], head=status),
                  span=names, wikidataP17iso3=geo['p17iso3'], shares=geo['shares'],
                  geometry={k: v for k, v in geo.items() if k not in ('spine',)}, score=sc)
    staged = json.load(open(STAGED)) if os.path.exists(STAGED) else {}
    staged[rid] = dict(entry=entry, extent=extent, report=report)
    tmp = STAGED + '.tmp'
    open(tmp, 'w', encoding='utf-8').write(json.dumps(staged, indent=1, ensure_ascii=False) + '\n'); os.replace(tmp, STAGED)
    return entry


if __name__ == '__main__':
    for rid in sys.argv[1:]:
        e = stage(rid)
        print(f"{rid}: {e['clue']} | {e['country']} | D{e['difficulty']} {e['difficultyWhy']} | {e['image'].rsplit('/', 1)[1]}")
