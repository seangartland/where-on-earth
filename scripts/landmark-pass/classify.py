"""Landmark data pass, phase 1: add `kind` to every entry in assets/locations-landmarks-sol.json.
kind is 'landmark' (point landmarks: peaks, structures, sites, districts), 'area' (features whose extent
makes a centre pin unfair, held out until extent-aware scoring ships, future-features.md #8), or
'settlement' (plain towns and cities the 2026-10-15 cull missed; flagged for Sean, never landmark content).
Every non-default call is listed below with its reason (hand judgment, one read of each entry).
Only `kind` is written; key order, values and entry order are otherwise unchanged.
Usage (from demo/): python3 scripts/landmark-pass/classify.py"""
import json

F = 'assets/locations-landmarks-sol.json'

AREA = {
    'aitutaki-lagoon': 'lagoon',
    'amalfi-coast-d34-58': 'coast, carries extentKm',
    'bering-strait': 'strait, carries extentKm',
    'black-forest': 'forest and range, carries extentKm',
    'bumthang-valley-bhutan': 'valley',
    'chuuk-wrecks': 'Chuuk Lagoon, wrecks spread across a lagoon about 60 km wide',
    'copper-canyon': 'canyon system; the clue names the whole Barrancas del Cobre',
    'daintree-rainforest': 'forest, carries extentKm',
    'danakil-depression': 'desert basin',
    'danube-delta': 'delta, carries extentKm',
    'dead-sea': 'lake, carries extentKm',
    'gobi-desert-dinosaur-nemegt': 'Nemegt Formation, a desert basin formation, not a single dig',
    'great-ocean-road': 'coast road, carries extentKm',
    'great-sea-reef': 'barrier reef about 200 km long',
    'ha-long-bay': 'bay of about 1,600 islands',
    'jokulsarlon-glacier-lagoon': 'lagoon',
    'kakadu': 'national park of about 20,000 km2',
    'lituya-bay-megatsunami': 'fjord bay about 14 km long',
    'napa-valley-ava': 'valley, carries extentKm',
    'okefenokee-swamp': 'wetland of about 1,800 km2',
    'phong-nha-ke-bang': 'national park of about 850 km2',
    'richat-structure': 'geological structure about 40 km across',
    'savusavu-bay': 'bay about 30 km wide',
    'sea-of-galilee': 'lake',
    'strait-of-gibraltar': 'strait',
    'suez-canal': 'canal, carries extentKm',
    'uyuni-salt-hotel': 'clue asks for the Uyuni Salt Flats (desert salt flat); the pin is a hotel on it',
    'yosemite-valley': 'valley',
    'zhangjiajie-national-forest-park': 'forest park',
    'tsingy-de-bemaraha': 'reserve of about 1,500 km2',
    'wadi-rum': 'desert valley',
    'yolyn-am-mongolia': 'valley (gorge)',
    'redwood-national-and-state-parks': 'forest, a chain of parks',
    'fitz-roy-laguna-de-los-tres': 'lake (small, but a lake)',
    'salar-de-uyuni': 'salt flat of about 10,000 km2',
    'lencois-maranhenses': 'dune field of about 1,500 km2',
    'laguna-colorada-viewpoint': 'lake',
    'valle-de-la-luna-chile': 'valley',
    'kiriwina-trobriands': 'island about 40 km long',
    'atafu-loto': 'atoll',
    'manihiki-oma': 'atoll',
    'nanumea-tuvalu': 'atoll',
    'pavuvu-russells': 'island about 20 km long',
    'tabuaeran': 'atoll',
    'teraina': 'island',
    'peros-banhos': 'atoll',
    'tristan-da-cunha': 'island',
    'geirangerfjord-no': 'fjord (valley)',
    'vatnajökull-d34-44': 'ice cap of about 7,700 km2',
    'galapagos-islands': 'island group',
    'easter-island': 'island',
    'lord-howe-island': 'island',
}

SETTLEMENT = {
    'gold-coast': 'city',
    'east-london': 'city',
    'pietermaritzburg-za': 'city',
    'tabas': 'town',
    'santiago-de-cuba-cu': 'city',
    'santiago-de-los-caballeros-do': 'city',
    'zaporizhzhya-ua': 'city',
    'thanh-hoa': 'city',
    'abala': 'town',
    'sri-jayawardenepura-kotte': 'city (capital); the clue names the city, not the Parliament',
    'grise-fiord': 'hamlet',
    'pangai-haapai': 'town (administrative centre of Ha\'apai)',
    'mata-utu-wallis': 'town (capital of Wallis and Futuna)',
    'ambunti-sepik': 'town',
    'pukapuka-village': 'village',
}

# Name-scan hits judged landmark (not what the name suggests), kept here so the call is on record.
LANDMARK_CALLS = {
    'blue-lagoon-iceland': 'geothermal spa, not a lagoon',
    'valley-of-kings': 'compact necropolis site, not a valley-scale feature',
    'valley-of-queens-luxor': 'compact necropolis site',
    'monument-valley-mitten': 'single butte',
    'blyde-river-canyon': 'pinned and clued as the Three Rondavels viewpoint',
    'colca-canyon-condor-cross': 'viewpoint',
    'ol-duvai-gorge': 'archaeological site',
    'monkey-gorge-zimbabwe': 'single gorge water point',
    'cliffs-of-moher': 'named cliff, one viewpoint',
    'white-cliffs-of-dover': 'named cliff, one viewpoint',
    'amsterdam-canals-d34-7': 'district (canal ring about 3 km across)',
    'gothenburg-canals-d34-34': 'district',
    'chocolate-hills': 'hill field about 50 km2, within a few km of the pin',
    'tsodilo-hills-bw': 'hill cluster about 10 km across',
    'ngorongoro-crater-rim': 'single caldera about 19 km across',
    'thingvellir': 'clued as the rift and Althing site',
    'badlands-national-park': 'pinned and clued as the Badlands Wall',
    'badwater-basin': 'lowest point marker',
    'queenstown-bay': 'small town bay',
    'alcatraz-island': 'island prison, under 1 km',
    'mont-saint-michel': 'tidal island abbey',
    'murano-d34-55': 'island district',
    'palm-jumeirah': 'built structure',
    'chagos-diego-garcia-point': 'clued as a point',
    'el-porvenir-san-blas': 'island under 1 km',
    'isla-foca': 'small rocky island',
    'hunga-tonga-2022-eruption': 'volcano',
    'krakatoa-1883-eruption': 'volcano',
    'kanyakumari-india': 'clued for India\'s southern tip (cape)',
    'huacachina-peru': 'oasis',
    'alert-nunavut': 'station, same class as the Antarctic stations',
    'soweto-za': 'district (district rule); flagged as a possible straggler',
    'brooklyn-us': 'district (district rule); flagged as a possible straggler',
    'queens-us': 'district (district rule); flagged as a possible straggler',
    'the-bronx': 'district (district rule); flagged as a possible straggler',
}

d = json.load(open(F, encoding='utf-8'))
ids = {x['id'] for x in d}
for t in (AREA, SETTLEMENT, LANDMARK_CALLS):
    bad = set(t) - ids
    if bad: raise SystemExit(f'unknown ids: {sorted(bad)}')
if set(AREA) & set(SETTLEMENT): raise SystemExit('id in both AREA and SETTLEMENT')
missing_ext = [x['id'] for x in d if 'extentKm' in x and x['id'] not in AREA]
if missing_ext: raise SystemExit(f'extentKm entries not area: {missing_ext}')

for x in d:
    x['kind'] = 'area' if x['id'] in AREA else 'settlement' if x['id'] in SETTLEMENT else 'landmark'
open(F, 'w', encoding='utf-8').write(json.dumps(d, indent=1, ensure_ascii=False))
c = {}
for x in d: c[x['kind']] = c.get(x['kind'], 0) + 1
print(len(d), 'entries', c)
