#!/usr/bin/env python3
"""Offline quarterly COG sampler. This module deliberately imports no network client."""
import argparse, hashlib, json, os
from pathlib import Path
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject

QUARTERS = ('2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4')
BANDS = ('B02', 'B03', 'B04', 'observations')

def rows(path):
    with open(path, encoding='utf8') as handle:
        return [json.loads(line) for line in handle if line.strip()]
def digest(record):
    for item in record.get('checksum', []):
        if item.get('algorithm') and item.get('value'):
            return f"{item['algorithm'].lower()}:{item['value'].lower()}"
    raise ValueError(f"{record.get('productId')}: a published checksum is required")
def safe(value): return value.replace('/', '_')
def source_file(work, record):
    name = ''.join(c if c.isalnum() or c in '._-' else '_' for c in record['name'])
    return work / 'source' / record['quarter'] / f"{record['productId']}-{name}"
def band_indexes(dataset):
    descriptions = {str(value).lower(): i + 1 for i, value in enumerate(dataset.descriptions) if value}
    aliases = {'b02': ('b02','blue'), 'b03': ('b03','green'), 'b04': ('b04','red'), 'observations': ('observations','observation','obs')}
    found = []
    for name in BANDS:
        index = next((descriptions[a] for a in aliases[name.lower()] if a in descriptions), None)
        if index is None and dataset.count == 4: index = len(found) + 1
        if index is None: raise ValueError(f'{dataset.name}: missing band {name}')
        found.append(index)
    return found
def write_window(path, arrays, window, quarter, checksums):
    path.parent.mkdir(parents=True, exist_ok=True)
    transform = from_bounds(*window['bounds'], window['width'], window['height'])
    profile = dict(driver='GTiff', width=window['width'], height=window['height'], count=4,
                   dtype='uint16', crs=window['crs'], transform=transform, nodata=0,
                   tiled=True, blockxsize=16 if window['width'] < 256 else 256,
                   blockysize=16 if window['height'] < 256 else 256, compress='deflate')
    temporary = Path(str(path) + '.partial')
    with rasterio.open(temporary, 'w', **profile) as dst:
        dst.write(arrays)
        for i, name in enumerate(BANDS, 1): dst.set_band_description(i, name)
        dst.update_tags(window_id=window['id'], quarter=quarter, source_checksums=','.join(checksums), untoned='true')
    os.replace(temporary, path)
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--inventory', required=True); parser.add_argument('--plan', required=True); parser.add_argument('--work', required=True); parser.add_argument('--collection-label', default='low-resolution')
    args = parser.parse_args(); work = Path(args.work); inventory = [r for r in rows(args.inventory) if r.get('collectionLabel') == args.collection_label]
    plan = json.load(open(args.plan, encoding='utf8')); windows = [w for w in plan['windows'] if not w.get('deriveSources')]
    if not windows: raise ValueError('Window plan has no raw windows')
    for quarter in QUARTERS:
        records = [r for r in inventory if r['quarter'] == quarter]
        if not records: raise ValueError(f'Inventory has no objects for {quarter}')
        paths = [(source_file(work, r), r) for r in records]
        missing = [str(p) for p, _ in paths if not p.is_file()]
        if missing: raise FileNotFoundError(f'Missing acquired cache key(s), acquisition required: {missing}')
        sources = [rasterio.open(path) for path, _ in paths]
        try:
            indexes = [band_indexes(ds) for ds in sources]
            if len({tuple(i) for i in indexes}) != 1: raise ValueError(f'{quarter}: inconsistent band order')
            for window in windows:
                combined = np.zeros((4, window['height'], window['width']), dtype=np.uint16)
                target_transform = from_bounds(*window['bounds'], window['width'], window['height'])
                for ds, idx in zip(sources, indexes):
                    scratch = np.zeros_like(combined)
                    for band in range(4):
                        reproject(rasterio.band(ds, idx[band]), scratch[band], src_transform=ds.transform, src_crs=ds.crs,
                                  src_nodata=ds.nodata, dst_transform=target_transform, dst_crs=window['crs'], dst_nodata=0,
                                  resampling=Resampling.average if band < 3 else Resampling.nearest, init_dest_nodata=True)
                    take = scratch[3] > combined[3]
                    combined[:, take] = scratch[:, take]
                key = hashlib.sha256(json.dumps({'window':window,'quarter':quarter,'checksums':[digest(r) for r in records]}, sort_keys=True,separators=(',',':')).encode()).hexdigest()[:16]
                output = work / 'raw-quarterly' / safe(window['id']) / f'{quarter}__{key}.tif'
                write_window(output, combined, window, quarter, [digest(r) for r in records])
                print(json.dumps({'window':window['id'],'quarter':quarter,'file':str(output),'shaKey':key}))
        finally:
            for ds in sources: ds.close()
if __name__ == '__main__': main()
