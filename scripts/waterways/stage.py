"""Waterways batch: assemble entries + extent records from geometry.py, score.py and the reviewed image picks, then
(with --merge) write them into the data files the game loads.
Entries match the existing extent entries field for field (strait-of-hormuz / panama-canal order; kind "extent",
extentType from the shipped record). Clue: "<Name>, <A> and <B>" with both flags in coastline-share order for
two-country straits (the Strait of Hormuz template), "<Name>, <Country>" for one; US features show the state (clue
policy). country = the scoring country (Hormuz precedent); continent from the cities file's country table.
Images: Commons files picked by eye from images.py contact sheets (center-square judged); the entry carries the 500px
thumbnail URL (recent-adds convention), HEAD 200 image/jpeg and dataset-unique, checked here.
Destinations: median >= 100/day and geometry -> the bank (assets/locations-bank.json) + its record in
assets/extents.json + src/meta/pack-waters.js; median < 100/day -> assets/locations-bank-quarantine.json (no extent
record: the validator rejects geometry without a bank entry); no geometry -> HELD (report only, no entry anywhere).
Suez Canal leaves the quarantine file when it banks.
Usage (from demo/): python3 scripts/waterways/stage.py <chunk A|B|C> [--merge]"""
import json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT, TMP, CANDIDATES, CHUNKS, UA

# Editorial table. image = (images-<id><suffix>.json, Commons file title) picked from the contact sheets.
EDIT = {
    'bosphorus': dict(short='Bosphorus', clue='Bosphorus, Turkey 🇹🇷', image=('-c', 'File:Bosphorus Bridge 1.jpg'),
        fact='About 31 km long and only around 700 m wide at its narrowest, this strait splits Istanbul between Europe and Asia, and every ship sailing out of the Black Sea must thread through it.'),
    'dardanelles': dict(short='Dardanelles', clue='Dardanelles, Turkey 🇹🇷', image=('', 'File:SAGA cargo ship on the Dardanelles.JPG'),
        fact="In 1810 Lord Byron swam across this strait from Europe to Asia to re-enact the myth of Leander, who was said to swim the Hellespont each night to reach his lover Hero."),
    'suez-canal': dict(short='Suez Canal', clue='Suez Canal, Egypt 🇪🇬', image=('-c', 'File:Suez Canal Bridge (2008) 10.jpg'),
        fact='Opened in 1869, this lock-free canal joins the Mediterranean to the Red Sea; in March 2021 the container ship Ever Given wedged itself across it for six days, stalling hundreds of ships.'),
    'strait-of-malacca': dict(short='Strait of Malacca', clue='Strait of Malacca, Indonesia and Malaysia 🇮🇩🇲🇾', image=('-b', 'File:Ships in the Malacca Strait.jpg'),
        fact='Stretching about 900 km between the Malay Peninsula and Sumatra, this strait is the shortest sea route from the Indian Ocean to the Pacific, making it one of the busiest shipping lanes on Earth.'),
    'strait-of-magellan': dict(short='Strait of Magellan', clue='Strait of Magellan, Chile 🇨🇱', image=('', 'File:George Washington Transits the Strait of Magellan (8453218).jpg'),
        fact="Ferdinand Magellan's fleet spent 38 days threading this maze of channels in 1520, becoming the first European ships to sail from the Atlantic into the Pacific."),
    'english-channel': dict(short='English Channel', clue='English Channel, France and England 🇫🇷🏴󠁧󠁢󠁥󠁮󠁧󠁿', image=('-b', 'File:English Channel from Pointe du Hoc.jpg'),
        fact='At its narrowest the Channel is about 33 km wide, between Dover and Cap Gris-Nez, and in 1875 Captain Matthew Webb became the first person to swim across it, taking nearly 22 hours.'),
    'corinth-canal': dict(short='Corinth Canal', clue='Corinth Canal, Greece 🇬🇷', image=('', 'File:Kórinthose kanal.jpg'),
        fact='Completed in 1893, this 6.4 km canal slices through the Isthmus of Corinth in a single straight cut barely 25 m wide, too narrow for most modern cargo ships.'),
    'golden-gate': dict(short='Golden Gate', clue='Golden Gate, California 🇺🇸', image=('-b', 'File:Golden Gate - Lands End - Point Lobos 2009.jpg'),
        fact='John C. Frémont named this mile-wide strait Chrysopylae, the "Golden Gate", in 1846, almost a century before the bridge that now shares its name was built across it.'),
    'bab-el-mandeb': dict(short='Bab-el-Mandeb', clue='Bab-el-Mandeb, Djibouti and Yemen 🇩🇯🇾🇪', image=('', 'File:Bab-el-Mandeb Seen From Midchannel (cropped).jpg'),
        fact='Its Arabic name means "Gate of Grief", a nod to the perils of the roughly 30 km gap between Arabia and Africa that every ship entering the Red Sea from the south must pass.'),
    'taiwan-strait': dict(short='Taiwan Strait', clue='Taiwan Strait, China and Taiwan 🇨🇳🇹🇼', image=('-b', 'File:富貴角夕照FUJI9896.JPG'),
        fact='About 130 km wide at its narrowest, this strait separates Taiwan from the Chinese mainland, yet Taiwan-held Kinmen sits just a few kilometres off the mainland city of Xiamen.'),
    'cook-strait': dict(short='Cook Strait', clue='Cook Strait, New Zealand 🇳🇿', image=('', 'File:Tongue Point and Terawhiti Station wind farm from Cook Strait.jpg'),
        fact="Only 22 km wide at its narrowest, this gap between New Zealand's North and South Islands funnels the westerly winds, earning it a name as one of the roughest stretches of water in the world."),
    'oresund': dict(short='Øresund', clue='Øresund, Denmark and Sweden 🇩🇰🇸🇪', image=('', 'File:Oresund bridge (Unsplash).jpg'),
        fact="Since 2000 a road and rail link has crossed this strait between Copenhagen and Malmö: a bridge out to the artificial island of Peberholm, then a tunnel that keeps clear of shipping and Copenhagen Airport's flight paths."),
    'kiel-canal': dict(short='Kiel Canal', clue='Kiel Canal, Germany 🇩🇪', image=('', 'File:2023-12-25 Maureen S at Kiel Canal, stern.jpg'),
        fact='Opened in 1895, this 98 km cut across Schleswig-Holstein links the North Sea to the Baltic and, by number of ships, is the busiest artificial waterway in the world.'),
    'erie-canal': dict(short='Erie Canal', clue='Erie Canal, New York 🇺🇸', image=('', 'File:Erie Canal lock Lockport New York.jpg'),
        fact='Opened in 1825 to join the Hudson River to Lake Erie at Buffalo, it slashed the cost of shipping goods to the Midwest and helped make New York City the leading port in the country.'),
    'grand-canal-china': dict(short='Grand Canal', clue='Grand Canal, China 🇨🇳', image=('', 'File:A boat on Grand Canal of China.JPG'),
        fact='Its oldest sections date to the 5th century BC, and at roughly 1,800 km from Beijing to Hangzhou it is the longest canal ever built.'),
    'canal-du-midi': dict(short='Canal du Midi', clue='Canal du Midi, France 🇫🇷', image=('', 'File:Anjodi crossing Pont Canal de Cesse.jpg'),
        fact='Completed in 1681 under Pierre-Paul Riquet, this 240 km canal joins Toulouse to the Mediterranean, so that together with the Garonne boats can cross France from the Atlantic without sailing around Spain.'),
    'strait-of-messina': dict(short='Strait of Messina', clue='Strait of Messina, Italy 🇮🇹', image=('', 'File:Stretto di Messina 06 11 2023 04.jpg'),
        fact='Only about 3 km wide at its narrowest, between Sicily and Calabria, this strait has whirlpools and currents thought to lie behind the myth of Scylla and Charybdis that Odysseus had to sail between.'),
    'mozambique-channel': dict(short='Mozambique Channel', clue='Mozambique Channel, Mozambique and Madagascar 🇲🇿🇲🇬', image=('', 'File:Mozambique Channel (50067728603).jpg'),
        fact='At its narrowest about 420 km of sea separates Madagascar from the African mainland, and the tiny French-held islands of Europa and Bassas da India lie scattered across its southern half.'),
    'straits-of-florida': dict(short='Straits of Florida', clue='Straits of Florida, Cuba, United States, and Bahamas', image=('', 'File:Coast Guard Cutter Stone operates in the Florida Straits (8496651).jpg'),
        fact='Key West sits only about 150 km across this strait from Havana, and the Florida Current, the start of the Gulf Stream, races through it on its way to the Atlantic.'),
    'bass-strait': dict(short='Bass Strait', clue='Bass Strait, Australia 🇦🇺', image=('', 'File:Point Nepean facing Bass Strait.jpg'),
        fact='This strait between Tasmania and mainland Australia is named after George Bass, who with Matthew Flinders sailed right around Tasmania in 1798 to prove it was an island.'),
}


def continents():
    t = {}
    for x in json.load(open(os.path.join(ROOT, 'assets/locations.json'), encoding='utf-8')):
        if x.get('continent') and x['country'] not in t: t[x['country']] = x['continent']
    return t


def head(url):
    r = urllib.request.urlopen(urllib.request.Request(url, method='HEAD', headers=UA), timeout=60)
    return r.status, r.headers.get('Content-Type')


def used_images(exclude_ids):
    urls = {}
    for f in ('assets/locations.json', 'assets/locations-bank.json', 'assets/locations-bank-quarantine.json'):
        for x in json.load(open(os.path.join(ROOT, f), encoding='utf-8')):
            if x['id'] not in exclude_ids: urls[x.get('image')] = x['id']
    return urls


def stage(i, cont, used):
    geo = json.load(open(os.path.join(TMP, f'geometry-{i}.json')))
    if not geo['record']: return dict(id=i, dest='held', reason='; '.join(geo['tried']))
    sc = json.load(open(os.path.join(TMP, f'score-{i}.json')))
    e = EDIT[i]
    suffix, title = e['image']
    img = next(c for c in json.load(open(os.path.join(TMP, f'images-{i}{suffix}.json'))) if c['title'] == title)
    status, ctype = head(img['thumb'])
    assert status == 200 and ctype == 'image/jpeg', (i, status, ctype)
    assert img['thumb'] not in used, (i, 'image already used by', used[img['thumb']])
    used[img['thumb']] = i
    rec = geo['record']
    lat, lng = geo['anchor']
    country = sc['scoringCountry']
    entry = dict(id=i, short=e['short'], clue=e['clue'], fact=e['fact'], lat=lat, lng=lng, difficulty=sc['D'], image=img['thumb'],
                 country=country, continent=cont[country], sets=[], difficultyWhy=sc['why'] + (' · median rescore (spike check)' if sc['spike'] else ''),
                 category='city', kind='extent', extentType=rec['type'])
    return dict(id=i, dest='quarantine' if sc['quarantine'] else 'bank', entry=entry, extent=rec,
                image=dict(title=img['title'], page=img['page'], original=img['url'], license=img['license'], author=img['author'], head=status))


def write(path, text):
    tmp = path + '.tmp'
    open(tmp, 'w', encoding='utf-8').write(text); os.replace(tmp, path)


def merge(rows):
    LF, QF, EF = (os.path.join(ROOT, p) for p in ('assets/locations-bank.json', 'assets/locations-bank-quarantine.json', 'assets/extents.json'))
    L, Q, E = (json.load(open(p, encoding='utf-8')) for p in (LF, QF, EF))
    for r in rows:
        if r['dest'] == 'held': continue
        i = r['id']
        L = [x for x in L if x['id'] != i]; Q = [x for x in Q if x['id'] != i]; E.pop(i, None)   # idempotent re-runs
        if r['dest'] == 'bank': L.append(r['entry']); E[i] = r['extent']
        else: Q.append(r['entry'])
    write(LF, json.dumps(L, indent=1, ensure_ascii=False))
    write(QF, json.dumps(Q, indent=1, ensure_ascii=False))
    write(EF, json.dumps(E, indent=2, ensure_ascii=False) + '\n')
    banked = [i for i in CANDIDATES if any(x['id'] == i and x.get('kind') == 'extent' for x in L)]
    body = ''.join(f"  '{i}',\n" for i in banked)
    write(os.path.join(ROOT, 'src/meta/pack-waters.js'),
          "// Straits and canals held out of the Landmarks pack (waterways batch, 2026-11-21; Sean's brief: these are\n"
          "// Waters pool entries, no generic landmarks-pool step). Same treatment as PACK_MOUNTAIN_RANGE_IDS: the\n"
          "// entries live in the location bank, not in PACK_LANDMARK_IDS, so Survival and Trivia keep drawing them,\n"
          "// and the set seeds the future Waters pack. Written by\n"
          "// scripts/waterways/stage.py --merge; edit that script, not this file.\n"
          f"export const PACK_WATERS_IDS = new Set([\n{body}]);\n")
    print(f'merged: bank {len(L)}, quarantine {len(Q)}, extents {len(E)}, waters {len(banked)}')


if __name__ == '__main__':
    chunk = sys.argv[1]
    ids = [i for c in 'ABC'[:'ABC'.index(chunk) + 1] for i in CHUNKS[c]]   # cumulative, so merges stay idempotent
    cont, used = continents(), used_images(set(ids))
    rows = [stage(i, cont, used) for i in ids]
    json.dump(rows, open(os.path.join(TMP, f'staged-{chunk}.json'), 'w'), ensure_ascii=False, indent=1)
    for r in rows:
        if r['dest'] == 'held': print(f"{r['id']}: HELD ({r['reason']})"); continue
        e = r['entry']
        print(f"{r['id']}: {r['dest']} | {e['clue']} | {e['country']} / {e['continent']} | D{e['difficulty']} {e['difficultyWhy']} | "
              f"{e['extentType']} | {r['image']['license']} {r['image']['author'][:30]} | {e['image'].rsplit('/', 1)[1][:60]}")
    if '--merge' in sys.argv: merge(rows)
