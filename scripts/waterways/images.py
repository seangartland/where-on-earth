"""Waterways batch: image candidates from Wikimedia Commons search (revised image rules: search by name, never the
Wikipedia page image). Denylist before review: montage, collage, map, flag, logo, diagram, satellite/ISS views, .svg
and any non-JPEG. The file title or description must name the feature. PD/CC0 sort first (no-attribution happy path),
then CC BY / BY-SA (license + author recorded in the report). URLs already used by any location file are excluded.
Usage (from demo/): python3 scripts/waterways/images.py <id> ["extra query; another query" [skip]]
Writes .build-tmp/waterways/images-<id>.json and a 12-up contact sheet for visual review (center-square judged)."""
import hashlib, html, json, os, re, sys, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import TMP, ROOT, CANDIDATES, get, UA

DENY = re.compile(r'montage|collage|\bmap\b|karte|carte|mapa|flag|logo|coat of arms|locator|diagram|svg|stamp|painting|'
                  r'drawing|engraving|satellite|NASA|\bISS\b|ISS\d|iss0|Sentinel|Landsat|MODIS|astronaut|\b1[89]\d\d\b', re.I)
FREE = re.compile(r'^(public domain|pd|cc0)', re.I)
ALIASES = {'bosphorus': ['Bosphorus', 'Bosporus', 'Boğaz'], 'dardanelles': ['Dardanelles', 'Çanakkale'],
           'suez-canal': ['Suez Canal', 'Suez'], 'strait-of-malacca': ['Malacca'], 'strait-of-magellan': ['Magellan', 'Magallanes'],
           'english-channel': ['English Channel', 'Channel', 'Manche'], 'corinth-canal': ['Corinth Canal', 'Korinth', 'Corinth'],
           'golden-gate': ['Golden Gate'], 'bab-el-mandeb': ['Mandeb', 'Mandab'], 'taiwan-strait': ['Taiwan Strait'],
           'cook-strait': ['Cook Strait'], 'oresund': ['Øresund', 'Oresund', 'Öresund'], 'kiel-canal': ['Kiel Canal', 'Nord-Ostsee', 'Kiel'],
           'erie-canal': ['Erie Canal'], 'grand-canal-china': ['Grand Canal', '大运河', 'Beijing-Hangzhou'],
           'canal-du-midi': ['Canal du Midi'], 'strait-of-messina': ['Messina', 'Stretto'], 'straits-of-florida': ['Straits of Florida', 'Florida Straits'],
           'bass-strait': ['Bass Strait'], 'mozambique-channel': ['Mozambique Channel']}


def used_images():
    urls = set()
    for f in ('assets/locations.json', 'assets/locations-landmarks-sol.json', 'assets/locations-landmarks-quarantine.json'):
        for x in json.load(open(os.path.join(ROOT, f))): urls.add(x.get('image'))
    return urls


def strip(s): return html.unescape(re.sub('<[^>]+>', '', s or '')).strip()


def candidates(rid, extra=''):
    name = CANDIDATES[rid]['title'].split(' (')[0]; names = ALIASES.get(rid, [name])
    seen, out = set(), []
    for q in [name, f'{name} ship', f'{name} view'] + [x.strip() for x in extra.split(';') if x.strip()]:
        r = get('https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=50'
                '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=400&gsrsearch=' + urllib.parse.quote(q))
        for p in (r or {}).get('query', {}).get('pages', {}).values():
            t = p['title']
            if t in seen: continue
            seen.add(t); ii = p['imageinfo'][0]; md = ii.get('extmetadata', {})
            desc = strip(md.get('ImageDescription', {}).get('value'))
            lic = strip(md.get('LicenseShortName', {}).get('value'))
            if ii['mime'] != 'image/jpeg' or ii['width'] < 1200: continue
            if DENY.search(t) or DENY.search(desc[:300]): continue
            if not any(a.lower() in (t + ' ' + desc).lower() for a in names): continue
            out.append(dict(title=t, url=ii['url'].split('?')[0], thumb=ii['thumburl'].split('?')[0], w=ii['width'], h=ii['height'], license=lic,
                            author=strip(md.get('Artist', {}).get('value'))[:120], desc=desc[:300],
                            page=ii['descriptionurl'], free=bool(FREE.match(lic))))
    used = used_images()
    out = [c for c in out if c['url'] not in used]
    out.sort(key=lambda c: (not c['free'], -c['w']))
    return out


def thumb_path(rid, x):
    return os.path.join(TMP, 'thumbs', rid, hashlib.sha1(x['title'].encode()).hexdigest()[:12] + '.jpg')


def sheet(rid, c):
    from PIL import Image, ImageDraw
    W, H = 400, 300
    img = Image.new('RGB', (W * 4, H * 3), 'white'); dr = ImageDraw.Draw(img)
    for k in range(len(c)):
        t = Image.open(thumb_path(rid, c[k])).convert('RGB'); t.thumbnail((W - 6, H - 22))
        x, y = (k % 4) * W, (k // 4) * H; img.paste(t, (x + 3, y + 18)); dr.text((x + 4, y + 2), f'{k:02d}', fill='red')
    img.save(os.path.join(TMP, f'sheet-{rid}.jpg'), quality=80)


if __name__ == '__main__':
    rid = sys.argv[1]; extra = sys.argv[2] if len(sys.argv) > 2 else ''
    c = candidates(rid, extra)
    json.dump(c, open(os.path.join(TMP, f'images-{rid}.json'), 'w'), ensure_ascii=False, indent=1)
    skip = int(sys.argv[3]) if len(sys.argv) > 3 else 0   # page through the ranked list, 12 at a time
    c = c[skip:]
    d = os.path.join(TMP, 'thumbs', rid); os.makedirs(d, exist_ok=True)
    for k, x in enumerate(c[:12]):
        f = thumb_path(rid, x)
        if not os.path.exists(f):
            open(f, 'wb').write(urllib.request.urlopen(urllib.request.Request(x['thumb'], headers=UA), timeout=60).read())
    sheet(rid, c[:12])
    for k, x in enumerate(c[:12]):
        print(f"{k + skip:02d} {'FREE' if x['free'] else '    '} {x['license'][:14]:14s} {x['w']}x{x['h']} {x['title'][5:80]} | {x['author'][:40]}")
