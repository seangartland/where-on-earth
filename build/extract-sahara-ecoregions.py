#!/usr/bin/env python3
"""Extract the Sahara extent source from RESOLVE Ecoregions 2017.

Source: https://storage.googleapis.com/teow2016/Ecoregions2017.zip
(CC BY 4.0 per its LICENSE field). Unzip it, then run:

    python3 build/extract-sahara-ecoregions.py /path/to/Ecoregions2017.shp

Writes build/extent-sources/sahara-resolve2017.geojson: a FeatureCollection
with one feature whose MultiPolygon is the union of the three ecoregions
actually named Sahara desert: East Sahara Desert (ECO_ID 822), South Sahara
desert (842) and West Sahara desert (845). 9,656 source vertices, 6 polygons,
11 holes (the montane enclaves). build/make-extents.mjs consumes this file.

This script recreates the extraction first run in the 2026-10-30 landforms
chunk; verified by regenerating assets/extents.json byte-for-byte.
"""
import json
import sys
from pathlib import Path

import shapefile

ECO_IDS = (822, 842, 845)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'Ecoregions2017.shp'
    reader = shapefile.Reader(src, encoding='latin-1')
    fields = [f[0] for f in reader.fields[1:]]
    eco_idx = fields.index('ECO_ID')
    polygons = []
    for i, record in enumerate(reader.records()):
        if record[eco_idx] in ECO_IDS:
            geo = reader.shape(i).__geo_interface__
            if geo['type'] == 'Polygon':
                polygons.append(geo['coordinates'])
            else:
                assert geo['type'] == 'MultiPolygon', geo['type']
                polygons.extend(geo['coordinates'])
    out = {
        'type': 'FeatureCollection',
        'features': [{
            'type': 'Feature',
            'properties': {'source': 'RESOLVE Ecoregions 2017, ECO_ID 822+842+845'},
            'geometry': {'type': 'MultiPolygon', 'coordinates': polygons},
        }],
    }
    dest = Path(__file__).parent / 'extent-sources' / 'sahara-resolve2017.geojson'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out))
    vertices = sum(len(ring) for polygon in polygons for ring in polygon)
    print(f'{len(polygons)} polygons, {vertices} source vertices -> {dest}')


if __name__ == '__main__':
    main()
