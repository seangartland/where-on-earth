#!/usr/bin/env python3
"""Rasterize Natural Earth 10m land (minus lakes) into a global land mask.

Output: cache/ne-land-mask.png, equirectangular, 21600 x 10800 (1 px = 1/60
degree, about 1.85 km at the equator). Pixel value 255 = land, 0 = water.
The renderer samples this mask to decide which mosaic pixels are ocean;
the quarterly mosaic's own bands cannot classify water (its ocean is
unmasked filler with near-infrared values brighter than some land).

Source data (public domain, Natural Earth):
  https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_land.zip
  https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_lakes.zip
"""
import io
import struct
import sys
import zipfile
from PIL import Image, ImageDraw

W, H = 21600, 10800


def read_polygons(shp_bytes):
    """Yield rings (lists of (x, y) in lon/lat) from a polygon shapefile."""
    if struct.unpack('<i', shp_bytes[32:36])[0] != 5:
        raise ValueError('not a polygon shapefile')
    pos = 100
    while pos < len(shp_bytes):
        rec_len = struct.unpack('>i', shp_bytes[pos + 4:pos + 8])[0] * 2
        body = shp_bytes[pos + 8:pos + 8 + rec_len]
        if len(body) < 44 or struct.unpack('<i', body[0:4])[0] != 5:
            pos += 8 + rec_len
            continue
        num_parts, num_points = struct.unpack('<ii', body[36:44])
        parts = struct.unpack(f'<{num_parts}i', body[44:44 + 4 * num_parts])
        pts_off = 44 + 4 * num_parts
        points = struct.unpack(f'<{num_points * 2}d', body[pts_off:pts_off + 16 * num_points])
        coords = [(points[2 * i], points[2 * i + 1]) for i in range(num_points)]
        for j, start in enumerate(parts):
            end = parts[j + 1] if j + 1 < num_parts else num_points
            yield coords[start:end]
        pos += 8 + rec_len


def load(zip_path, shp_name):
    with zipfile.ZipFile(zip_path) as z:
        return z.read(shp_name)


def main(land_zip, lakes_zip, out_path):
    img = Image.new('L', (W, H), 0)
    draw = ImageDraw.Draw(img)

    def project(ring):
        return [((lon + 180.0) / 360.0 * W, (90.0 - lat) / 180.0 * H) for lon, lat in ring]

    for ring in read_polygons(load(land_zip, 'ne_10m_land.shp')):
        if len(ring) >= 3:
            draw.polygon(project(ring), fill=255)
    for ring in read_polygons(load(lakes_zip, 'ne_10m_lakes.shp')):
        if len(ring) >= 3:
            draw.polygon(project(ring), fill=0)
    img.save(out_path, optimize=True)
    print(f'wrote {out_path}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
