"""Waterways batch: assemble entries + extent records from geometry.py, score.py and the reviewed image picks, then
(with --merge) write them into the data files the game loads.
Entries match the existing extent entries field for field (strait-of-hormuz / panama-canal order; kind "extent",
extentType from the shipped record). Clue: "<Name>, <A> and <B>" with both flags in coastline-share order for
two-country straits (the Strait of Hormuz template), "<Name>, <Country>" for one; US features show the state (clue
policy). country = the scoring country (Hormuz precedent); continent from the cities file's country table.
Images: Commons files picked by eye from images.py contact sheets (center-square judged); the entry carries the 500px
thumbnail URL (recent-adds convention), HEAD 200 image/jpeg and dataset-unique, checked here.
Destinations: median >= 100/day and geometry -> the bank (assets/locations-landmarks-sol.json) + its record in
assets/extents.json + src/meta/pack-waters.js; median < 100/day -> assets/locations-landmarks-quarantine.json (no extent
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
    for f in ('assets/locations.json', 'assets/locations-landmarks-sol.json', 'assets/locations-landmarks-quarantine.json'):
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
    LF, QF, EF = (os.path.join(ROOT, p) for p in ('assets/locations-landmarks-sol.json', 'assets/locations-landmarks-quarantine.json', 'assets/extents.json'))
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
          "// entries stay in the landmarks bank, so Survival and Trivia keep drawing them, and the set seeds the\n"
          "// future Waters pack. landmarkPackPool in pack-store.js excludes these ids. Written by\n"
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
