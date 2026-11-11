"""Mountain-ranges batch: image candidates from Wikimedia Commons search (skill Step 4: search by name, never the page
image). Denylist before review: montage, collage, map, flag, logo, coat of arms, locator, diagram, any non-JPEG.
The file title or description must name the range. PD/CC0 sort first (no-credit happy path), then CC BY / BY-SA.
Usage (from demo/): python3 scripts/mountain-ranges/images.py <id> ["extra query; another query"]
Writes .build-tmp/mountain-ranges/images-<id>.json and 400px thumbnails for visual review (center-square judged)."""
import hashlib, html, json, os, re, sys, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import TMP, RANGES, ROOT, get, UA

DENY = re.compile(r'montage|collage|\bmap\b|karte|carte|mapa|flag|logo|coat of arms|locator|diagram|relief|satellite|'
                  r'NASA|\bISS\b|ISS-\d|topograph|svg|stamp|painting|drawing|Google Art|MET DP|Roerich|Lake Andes|Heart of the Andes|\\bMET\\b|\b1[89]\d\d\b', re.I)
FREE = re.compile(r'^(public domain|pd|cc0)', re.I)
ALIASES = {'himalayas': ['Himalaya'], 'alps': ['Alps', 'Alpen', 'Alpes'], 'rocky-mountains': ['Rocky Mountains', 'Rockies'],
           'appalachian-mountains': ['Appalachian'], 'carpathian-mountains': ['Carpathian'], 'ural-mountains': ['Ural'],
           'pyrenees': ['Pyrenees', 'Pyrénées', 'Pirineo'], 'atlas-mountains': ['Atlas'], 'caucasus-mountains': ['Caucasus'],
           'zagros-mountains': ['Zagros'], 'tian-shan': ['Tian Shan', 'Tien Shan', 'Tianshan'], 'altai-mountains': ['Altai', 'Altay'],
           'southern-alps': ['Southern Alps'], 'great-dividing-range': ['Great Dividing Range'],
           'ethiopian-highlands': ['Ethiopian Highlands', 'Simien'], 'hindu-kush': ['Hindu Kush', 'Hindukush'], 'andes': ['Andes']}


def used_images():
    urls = set()
    for f in ('assets/locations.json', 'assets/locations-landmarks-sol.json'):
        for x in json.load(open(os.path.join(ROOT, f))): urls.add(x.get('image'))
    return urls


def strip(s): return html.unescape(re.sub('<[^>]+>', '', s or '')).strip()


def candidates(rid, extra=''):
    name = RANGES[rid]; names = ALIASES.get(rid, [name])
    seen, out = set(), []
    for q in [f'{name} panorama', f'{name} landscape', f'{name} mountains view'] + [x.strip() for x in extra.split(';') if x.strip()]:
        r = get('https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=50'
                '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=400&gsrsearch=' + urllib.parse.quote(q))
        for p in (r or {}).get('query', {}).get('pages', {}).values():
            t = p['title']
            if t in seen: continue
            seen.add(t); ii = p['imageinfo'][0]; md = ii.get('extmetadata', {})
            desc = strip(md.get('ImageDescription', {}).get('value'))
            lic = strip(md.get('LicenseShortName', {}).get('value'))
            if ii['mime'] != 'image/jpeg' or ii['width'] < 1200 or ii['width'] < ii['height'] * 1.2: continue
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
    d = os.path.join(TMP, 'thumbs', rid); W, H = 400, 260
    img = Image.new('RGB', (W * 4, H * 3), 'white'); dr = ImageDraw.Draw(img)
    for k in range(len(c)):
        t = Image.open(thumb_path(rid, c[k])).convert('RGB'); t.thumbnail((W - 6, H - 22))
        x, y = (k % 4) * W, (k // 4) * H; img.paste(t, (x + 3, y + 18)); dr.text((x + 4, y + 2), f'{k:02d}', fill='red')
    img.save(os.path.join(TMP, f'sheet-{rid}.jpg'), quality=80)


if __name__ == '__main__':
    rid = sys.argv[1]; extra = sys.argv[2] if len(sys.argv) > 2 else ''
    c = candidates(rid, extra)
    json.dump(c, open(os.path.join(TMP, f'images-{rid}.json'), 'w'), ensure_ascii=False, indent=1)
    d = os.path.join(TMP, 'thumbs', rid); os.makedirs(d, exist_ok=True)
    for k, x in enumerate(c[:12]):
        f = thumb_path(rid, x)
        if not os.path.exists(f):
            open(f, 'wb').write(urllib.request.urlopen(urllib.request.Request(x['thumb'], headers=UA), timeout=60).read())
    sheet(rid, c[:12])
    for k, x in enumerate(c[:12]):
        print(f"{k:02d} {'FREE' if x['free'] else '    '} {x['license'][:14]:14s} {x['w']}x{x['h']} {x['title'][5:80]} | {x['author'][:40]}")
