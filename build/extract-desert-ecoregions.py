#!/usr/bin/env python3
"""Extract single-ecoregion extent sources from RESOLVE Ecoregions 2017.

Source: https://storage.googleapis.com/teow2016/Ecoregions2017.zip
(CC BY 4.0 per its LICENSE field). Unzip it, then run:

    python3 build/extract-desert-ecoregions.py /path/to/Ecoregions2017.shp

Writes one build/extent-sources/<id>-resolve2017.geojson per desert below:
a FeatureCollection with one feature whose MultiPolygon is the ecoregion
actually named for the subject (the Sahara treatment, build/extract-sahara-
ecoregions.py, applied to a single ECO_ID per file): Mojave desert
(ECO_ID 433), Namib Desert (103), Atacama desert (598); names verified
against the dataset's ECO_NAME field at extraction time. build/make-
extents.mjs consumes these files.
"""
import json
import sys
from pathlib import Path

import shapefile

DESERTS = {
    'mojave-desert': 433,
    'namib': 103,
    'atacama': 598,
}


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'Ecoregions2017.shp'
    reader = shapefile.Reader(src, encoding='latin-1')
    fields = [f[0] for f in reader.fields[1:]]
    eco_idx = fields.index('ECO_ID')
    name_idx = fields.index('ECO_NAME')
    by_id = {}
    names = {}
    for i, record in enumerate(reader.records()):
        eco = record[eco_idx]
        if eco in DESERTS.values():
            names[eco] = record[name_idx]
            geo = reader.shape(i).__geo_interface__
            if geo['type'] == 'Polygon':
                by_id.setdefault(eco, []).append(geo['coordinates'])
            else:
                assert geo['type'] == 'MultiPolygon', geo['type']
                by_id.setdefault(eco, []).extend(geo['coordinates'])
    out_dir = Path(__file__).parent / 'extent-sources'
    out_dir.mkdir(parents=True, exist_ok=True)
    for entry_id, eco in DESERTS.items():
        polygons = by_id[eco]
        out = {
            'type': 'FeatureCollection',
            'features': [{
                'type': 'Feature',
                'properties': {'source': f'RESOLVE Ecoregions 2017, ECO_ID {eco} ({names[eco]})'},
                'geometry': {'type': 'MultiPolygon', 'coordinates': polygons},
            }],
        }
        dest = out_dir / f'{entry_id}-resolve2017.geojson'
        dest.write_text(json.dumps(out))
        vertices = sum(len(ring) for polygon in polygons for ring in polygon)
        print(f'{entry_id}: ECO_ID {eco} "{names[eco]}", {len(polygons)} polygons, {vertices} source vertices -> {dest}')


if __name__ == '__main__':
    main()
