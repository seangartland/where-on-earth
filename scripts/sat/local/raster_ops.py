#!/usr/bin/env python3
"""Raster-only helper for finish.mjs. No networking modules or remote datasets."""
import argparse, glob, json, os
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import reproject
from rasterio.enums import Resampling

REQUIRED = ('2025-Q1','2025-Q2','2025-Q3','2025-Q4')

def quarterly_files(work, window):
    files = sorted(glob.glob(str(Path(work) / 'raw-quarterly' / window.replace('/','_') / '*.tif')))
    by_quarter = {}
    for file in files:
        with rasterio.open(file) as ds: quarter = ds.tags().get('quarter')
        if quarter in by_quarter: raise ValueError(f'{window}: ambiguous duplicate cache keys for {quarter}')
        by_quarter[quarter] = file
    if tuple(sorted(by_quarter)) != REQUIRED: raise ValueError(f'{window}: missing quarterly cache key; have {sorted(by_quarter)}')
    return by_quarter

def read_quarter(file, window):
    with rasterio.open(file) as ds:
        tags = ds.tags()
        if tags.get('window_id') != window:
            raise ValueError(f'{file}: cache window tag is {tags.get("window_id")!r}, expected {window!r}')
        if tags.get('untoned') != 'true' or not tags.get('source_checksums'):
            raise ValueError(f'{file}: cache is missing untoned/source-checksum evidence')
        if ds.count != 4 or tuple(ds.descriptions) != ('B02','B03','B04','observations'):
            raise ValueError(f'{file}: unexpected quarterly band layout')
        return ds.read(), ds.profile.copy()

def choose(data, preferred):
    obs=data[:,3].astype(np.int32); valid=obs>0
    preferred=set(preferred.split(',')) if preferred else set()
    eligible=np.array([q in preferred for q in REQUIRED])[:,None,None] & valid if preferred else valid
    scores=np.where(eligible,obs,-1)
    fallback=~eligible.any(axis=0); scores[:,fallback]=np.where(valid[:,fallback],obs[:,fallback],-1)
    choice=scores.argmax(axis=0); any_valid=valid.any(axis=0)
    selected=np.zeros((4,*obs.shape[1:]),dtype=np.uint16)
    for q in range(4):
        take=(choice==q)&any_valid
        for band in range(3): selected[band,take]=data[q,band,take]
        selected[3,take]=obs[q,take]
    return selected, any_valid, preferred

def emit(selected, any_valid, preferred, profile, out_name, raw_name, extra=None):
    out=Path(out_name); out.parent.mkdir(parents=True,exist_ok=True)
    profile.update(count=4,dtype='uint16',compress='deflate',nodata=0)
    with rasterio.open(str(out)+'.partial','w',**profile) as dst:
        dst.write(selected)
        for i,name in enumerate(('B02','B03','B04','observations'),1): dst.set_band_description(i,name)
        dst.update_tags(selection_policy='observations-v1',preferred_quarters=','.join(sorted(preferred)))
    os.replace(str(out)+'.partial',out)
    rgb=np.moveaxis(selected[:3][::-1],0,2)
    rgba=np.empty((*selected.shape[1:],4),dtype='<u2'); rgba[:,:,:3]=rgb; rgba[:,:,3]=selected[3]
    Path(raw_name).write_bytes(rgba.tobytes())
    stats={name:{'min':int(values[any_valid].min()) if any_valid.any() else 0,'max':int(values[any_valid].max()) if any_valid.any() else 0,'mean':float(values[any_valid].mean()) if any_valid.any() else 0} for name,values in zip(('red','green','blue'),rgb.transpose(2,0,1))}
    report={'width':rgb.shape[1],'height':rgb.shape[0],'validPixels':int(any_valid.sum()),'nodataPixels':int((~any_valid).sum()),'bands':stats}
    if extra: report.update(extra)
    print(json.dumps(report))

def select(args):
    by_quarter = quarterly_files(args.work, args.window)
    stacks=[]; reference=None
    for q in REQUIRED:
        data, profile = read_quarter(by_quarter[q], args.window)
        grid=(profile['width'],profile['height'],profile['crs'],profile['transform'])
        if reference is None: reference=grid
        elif grid != reference: raise ValueError(f'{args.window}: quarterly cache grids differ')
        stacks.append(data)
    selected, valid, preferred = choose(np.stack(stacks), args.preferred)
    emit(selected, valid, preferred, profile, args.out, args.raw)

def derive(args):
    plan=json.load(open(args.plan)); window=next(w for w in plan['windows'] if w['id']==args.window)
    opened=[]
    try:
        transform=from_bounds(*window['bounds'],window['width'],window['height'])
        quarters=[]
        for quarter in REQUIRED:
            dst=np.zeros((4,window['height'],window['width']),dtype=np.uint16)
            for source_id in window['deriveSources']:
                path=quarterly_files(args.work, source_id)[quarter]
                source=rasterio.open(path); opened.append(source)
                tags=source.tags()
                if tags.get('window_id') != source_id or tags.get('untoned') != 'true' or not tags.get('source_checksums'):
                    raise ValueError(f'{path}: invalid quarterly cache evidence')
                scratch=np.zeros_like(dst)
                for band in range(4):
                    reproject(rasterio.band(source,band+1),scratch[band],src_transform=source.transform,src_crs=source.crs,src_nodata=0,dst_transform=transform,dst_crs=window['crs'],dst_nodata=0,resampling=Resampling.average if band<3 else Resampling.nearest)
                valid=scratch[3]>0
                dst[:,valid]=scratch[:,valid]
            quarters.append(dst)
        profile=dict(driver='GTiff',width=window['width'],height=window['height'],count=4,dtype='uint16',crs=window['crs'],transform=transform,nodata=0,compress='deflate',tiled=True,blockxsize=256,blockysize=256)
        selected, valid, preferred = choose(np.stack(quarters), args.preferred)
        emit(selected, valid, preferred, profile, args.out, args.raw, {'derivedFrom':window['deriveSources']})
    finally:
        for source in opened: source.close()
def main():
    p=argparse.ArgumentParser(); sub=p.add_subparsers(dest='command',required=True)
    s=sub.add_parser('select'); s.add_argument('--work',required=True); s.add_argument('--window',required=True); s.add_argument('--preferred',default=''); s.add_argument('--out',required=True); s.add_argument('--raw',required=True)
    d=sub.add_parser('derive'); d.add_argument('--work',required=True); d.add_argument('--plan',required=True); d.add_argument('--window',required=True); d.add_argument('--preferred',default=''); d.add_argument('--out',required=True); d.add_argument('--raw',required=True)
    a=p.parse_args(); select(a) if a.command=='select' else derive(a)
if __name__=='__main__': main()
