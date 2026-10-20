#!/usr/bin/env python3
"""Rasterize Natural Earth 10m land (minus lakes) into a land mask.

Output: cache/ne-land-mask.png, equirectangular, 21600 x 10800 (1 px = 1/60
degree, about 1.85 km at the equator). Pixel value 255 = land, 0 = water.
The renderer samples this mask to decide which mosaic pixels are ocean;
the quarterly mosaic's own bands cannot classify water (its ocean is
unmasked filler with near-infrared values brighter than some land).

Source data (public domain, Natural Earth):
  https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_land.zip
  https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_lakes.zip
"""
import json
import math
import struct
import sys
import zipfile
from PIL import Image, ImageChops, ImageDraw, ImageFilter

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


def index_rings(shp_bytes):
    """Parse rings once and retain bounds for inexpensive window rejection."""
    indexed = []
    for ring in read_polygons(shp_bytes):
        xs = [point[0] for point in ring]
        ys = [point[1] for point in ring]
        indexed.append((ring, (min(xs), min(ys), max(xs), max(ys))))
    return indexed


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


def window_mask(land_rings, lake_rings, out_path, crs, bbox, width, height):
    """Write an antialiased ocean-blend mask from the source vectors.

    Values are 255 in water and 0 on land.  The intermediate mask is four
    times the requested resolution; morphology on the downsampled vector mask
    measures signed distance from the shoreline for a two-pixel
    feather without inheriting the steps of the global fallback raster.
    """
    scale = 4
    feather = 2 * scale
    pad = feather + 2
    sw, sh = width * scale + 2 * pad, height * scale + 2 * pad
    min_x, min_y, max_x, max_y = bbox
    mercator = crs == '3857'
    world = 40075016.68557849 if mercator else 360.0
    center_x = (min_x + max_x) / 2
    if mercator:
        center_lon = center_x * 180.0 / 20037508.342789244
        west = min_x * 180.0 / 20037508.342789244
        east = max_x * 180.0 / 20037508.342789244
        south = math.degrees(math.atan(math.sinh(min_y / 6378137.0)))
        north = math.degrees(math.atan(math.sinh(max_y / 6378137.0)))
    else:
        center_lon = center_x
        west, south, east, north = bbox
    margin = max((east - west) / width, (north - south) / height) * 4

    def intersects(bounds):
        ring_west, ring_south, ring_east, ring_north = bounds
        if ring_north < south - margin or ring_south > north + margin:
            return False
        if ring_east - ring_west > 180:
            return True
        ring_center = (ring_west + ring_east) / 2
        shift = round((center_lon - ring_center) / 360) * 360
        return ring_east + shift >= west - margin and ring_west + shift <= east + margin

    def source_xy(lon, lat):
        if mercator:
            x = lon * 20037508.342789244 / 180.0
            clipped = max(-85.05112878, min(85.05112878, lat))
            y = 6378137.0 * math.log(math.tan(math.pi / 4 + math.radians(clipped) / 2))
        else:
            x, y = lon, lat
        while x - center_x > world / 2:
            x -= world
        while x - center_x < -world / 2:
            x += world
        return x, y

    def project(ring):
        result = []
        for lon, lat in ring:
            x, y = source_xy(lon, lat)
            result.append((pad + (x - min_x) / (max_x - min_x) * width * scale,
                           pad + (max_y - y) / (max_y - min_y) * height * scale))
        return result

    binary = Image.new('L', (sw, sh), 0)
    draw = ImageDraw.Draw(binary)
    for ring, bounds in land_rings:
        if not intersects(bounds):
            continue
        points = project(ring)
        if len(points) >= 3:
            if max(p[0] for p in points) >= 0 and min(p[0] for p in points) < sw and max(p[1] for p in points) >= 0 and min(p[1] for p in points) < sh:
                draw.polygon(points, fill=255)
    # NE lakes includes the Caspian Sea; drawing it last makes it water.
    for ring, bounds in lake_rings:
        if not intersects(bounds):
            continue
        points = project(ring)
        if len(points) >= 3 and max(p[0] for p in points) >= 0 and min(p[0] for p in points) < sw and max(p[1] for p in points) >= 0 and min(p[1] for p in points) < sh:
            draw.polygon(points, fill=0)

    # Preserve subpixel placement from the 4x vector raster, then measure the
    # two-pixel signed distance on the requested grid.
    coverage = binary.crop((pad, pad, sw - pad, sh - pad)).resize((width, height), Image.Resampling.LANCZOS)
    binary = coverage.point(lambda value: 255 if value >= 128 else 0)
    ocean = binary.point(lambda value: 0 if value else 255)
    blend = ocean.copy()
    eroded_land = binary
    eroded_water = ocean
    feather = 2
    for distance in range(1, feather + 1):
        next_land = eroded_land.filter(ImageFilter.MinFilter(3))
        next_water = eroded_water.filter(ImageFilter.MinFilter(3))
        land_edge = ImageChops.subtract(eroded_land, next_land)
        water_edge = ImageChops.subtract(eroded_water, next_water)
        land_value = round(128 * (feather - distance) / feather)
        water_value = round(128 + 127 * distance / feather)
        blend.paste(land_value, mask=land_edge)
        blend.paste(water_value, mask=water_edge)
        eroded_land, eroded_water = next_land, next_water
    # Let fractional vector coverage refine the half-pixel shoreline itself.
    blend = Image.blend(blend, coverage.point(lambda value: 255 - value), 0.25)
    blend.save(out_path, optimize=True)
    print(f'wrote {out_path}')


if __name__ == '__main__':
    if len(sys.argv) >= 4 and sys.argv[1] in ('--window', '--batch'):
        land_rings = index_rings(load(sys.argv[2], 'ne_10m_land.shp'))
        lake_rings = index_rings(load(sys.argv[3], 'ne_10m_lakes.shp'))
    if len(sys.argv) == 12 and sys.argv[1] == '--window':
        window_mask(land_rings, lake_rings, sys.argv[4], sys.argv[5],
                    [float(value) for value in sys.argv[6:10]], int(sys.argv[10]), int(sys.argv[11]))
    elif len(sys.argv) in (4, 5) and sys.argv[1] == '--batch':
        jobs_file = open(sys.argv[4]) if len(sys.argv) == 5 else sys.stdin
        for job in json.load(jobs_file):
            window_mask(land_rings, lake_rings, job['out'], job['crs'],
                        job['bbox'], job['width'], job['height'])
    else:
        main(sys.argv[1], sys.argv[2], sys.argv[3])
