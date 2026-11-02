#!/usr/bin/env python3
"""Composite a pack word onto word-free pack art (Opus spec, 2026-11-01).

One typeface everywhere: Oswald 700 caps. The same font file renders the
Passport headers in CSS, so the letterform matches exactly. Spec: font
size 100 (LANDMARKS, the longest word, lands ~540 px wide), tracking
+0.02em, baseline y=1090 on the 900x1350 art, gold gradient fill
#FFE9A6 -> #E8B53A (55%) -> #B07F22, 6 px ink edge, pack glow at 45%
opacity blurred 20 px, drop shadow 0/4/10 rgba(0,0,0,.35). No bevel.

Usage: composite.py <word-free-image> <WORD> <ink-hex> <glow-hex> <out.webp>
"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

NAVY = (13, 21, 38)
FONT = __file__.rsplit('/', 1)[0] + '/Oswald-Bold.ttf'
SIZE = 100
BASELINE = 1090
STROKE = 6

def frame(img):
    a = np.asarray(img.convert('RGB')).astype(int)
    mask = (np.abs(a - np.array(NAVY)).sum(axis=2) > 40)
    ys, xs = np.where(mask)
    crop = img.convert('RGB').crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    canvas = Image.new('RGB', (900, 1350), NAVY)
    canvas.paste(crop.resize((787, 1350), Image.LANCZOS), (56, 0))
    return canvas.convert('RGBA')

def word_layer(word, ink):
    font = ImageFont.truetype(FONT, SIZE)
    track = int(round(0.02 * SIZE))
    widths = [font.getlength(c) for c in word]
    total = sum(widths) + track * (len(word) - 1)
    pad = 80
    asc, desc = font.getmetrics()
    layer = Image.new('RGBA', (int(total) + 2 * pad + 2 * STROKE, asc + desc + 2 * pad + 2 * STROKE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x = y = pad + STROKE
    cx = x
    for c, w in zip(word, widths):
        d.text((cx, y), c, font=font, fill=ink, stroke_width=STROKE, stroke_fill=ink)
        cx += w + track
    gm = Image.new('L', layer.size, 0)
    gd = ImageDraw.Draw(gm)
    cx = x
    for c, w in zip(word, widths):
        gd.text((cx, y), c, font=font, fill=255)
        cx += w + track
    stops = [(0.0, (255, 233, 166)), (0.55, (232, 181, 58)), (1.0, (176, 127, 34))]
    ga = np.zeros((layer.size[1], layer.size[0], 3), dtype=np.uint8)
    for yy in range(y, y + asc + desc):
        t = (yy - y) / max(1, asc + desc)
        col = stops[-1][1]
        for i in range(len(stops) - 1):
            if stops[i][0] <= t <= stops[i + 1][0]:
                tt = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
                col = tuple(int(stops[i][1][k] + (stops[i + 1][1][k] - stops[i][1][k]) * tt) for k in range(3))
        ga[yy, :, :] = col
    layer.paste(Image.fromarray(ga).convert('RGBA'), (0, 0), gm)
    return layer, asc, pad

def main():
    src, word, ink, glow, out = sys.argv[1:6]
    base = frame(Image.open(src))
    base.save(out.rsplit('.', 1)[0] + '-base.png')
    layer, asc, pad = word_layer(word, ink)
    sil = layer.split()[3]
    wx = int(450 - layer.size[0] / 2)
    wy = int(BASELINE - asc - pad - STROKE)
    gr, gg, gb = (int(glow[i:i + 2], 16) for i in (1, 3, 5))
    shadow = Image.new('RGBA', base.size, (0, 0, 0, 0))
    shadow.paste(Image.new('RGBA', layer.size, (0, 0, 0, int(255 * 0.35))), (wx, wy + 4), sil.filter(ImageFilter.GaussianBlur(10)))
    base = Image.alpha_composite(base, shadow)
    glow_img = Image.new('RGBA', base.size, (0, 0, 0, 0))
    glow_img.paste(Image.new('RGBA', layer.size, (gr, gg, gb, int(255 * 0.45))), (wx, wy), sil.filter(ImageFilter.GaussianBlur(20)))
    base = Image.alpha_composite(base, glow_img)
    base.paste(layer, (wx, wy), layer)
    base.convert('RGB').save(out, 'WEBP', quality=88)
    print(out, 'word width approx', layer.size[0] - 2 * pad)

if __name__ == '__main__':
    main()
