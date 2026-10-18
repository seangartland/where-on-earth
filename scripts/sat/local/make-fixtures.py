#!/usr/bin/env python3
import argparse, hashlib, json
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_bounds

p=argparse.ArgumentParser();p.add_argument('--dir',required=True);a=p.parse_args();root=Path(a.dir);source=root/'source';assets=root/'assets';source.mkdir(parents=True,exist_ok=True);assets.mkdir(parents=True,exist_ok=True)
edge=20037508.342789244; z=4; y=6
def bbox(x): return [-edge+x/2**z*edge*2,edge-(y+3)/2**z*edge*2,-edge+(x+3)/2**z*edge*2,edge-y/2**z*edge*2]
whole=[bbox(3)[0],bbox(3)[1],bbox(6)[2],bbox(3)[3]]; h=192;w=384; yy,xx=np.indices((h,w)); inventory=[]
for qi,q in enumerate(('2025-Q1','2025-Q2','2025-Q3','2025-Q4'),1):
 data=np.zeros((4,h,w),dtype=np.uint16);data[0]=1200+xx*2+qi*20;data[1]=1800+xx*2+qi*20;data[2]=2400+xx*2+qi*20;data[3]=qi+(xx>w//2)*4
 path=source/f'{q}.tif';profile=dict(driver='GTiff',width=w,height=h,count=4,dtype='uint16',crs='EPSG:3857',transform=from_bounds(*whole,w,h),nodata=0,compress='deflate',tiled=True,blockxsize=64,blockysize=64)
 with rasterio.open(path,'w',**profile) as ds:
  ds.write(data)
  for i,n in enumerate(('B02','B03','B04','observations'),1):ds.set_band_description(i,n)
 raw=path.read_bytes();inventory.append({'productId':f'fixture-{q}','name':path.name,'quarter':q,'contentDate':{'Start':f'2025-{(qi-1)*3+1:02d}-01T00:00:00Z'},'collection':'fixture-low-resolution','collectionLabel':'low-resolution','gridCell':'fixture','footprint':None,'s3Path':f'/eodata/fixture/{path.name}','contentLength':len(raw),'checksum':[{'algorithm':'SHA256','value':hashlib.sha256(raw).hexdigest()}],'intersects':{'manifestUnion':True,'pinUnion':False}})
(root/'inventory.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in inventory))
o=np.zeros((90,180,3),dtype=np.uint8);oy,ox=np.indices(o.shape[:2]);o[:,:,0]=20+ox//4;o[:,:,1]=60+oy;o[:,:,2]=130
with rasterio.open(assets/'ocean.png','w',driver='PNG',width=180,height=90,count=3,dtype='uint8') as ds:ds.write(np.moveaxis(o,2,0))
m=np.full((90,180),255,dtype=np.uint8);m[:,85:95]=0
with rasterio.open(assets/'mask.png','w',driver='PNG',width=180,height=90,count=1,dtype='uint8') as ds:ds.write(m,1)
vm=np.zeros((192,192),dtype=np.uint8);vm[:,90:102]=255
for name in ('left-mask.png','right-mask.png'):
 with rasterio.open(assets/name,'w',driver='PNG',width=192,height=192,count=1,dtype='uint8') as ds:ds.write(vm,1)
plan={'version':1,'assets':{'ocean':'ocean.png','globalMask':'mask.png'},'windows':[{'id':'4/3/6','kind':'detail','z':4,'x':3,'y':6,'width':192,'height':192,'crs':'EPSG:3857','bounds':bbox(3),'tiles':[{'x':5,'y':7}],'vectorMask':'left-mask.png'},{'id':'4/6/6','kind':'detail','z':4,'x':6,'y':6,'width':192,'height':192,'crs':'EPSG:3857','bounds':bbox(6),'tiles':[{'x':6,'y':7}],'vectorMask':'right-mask.png'},{'id':'base','kind':'base','width':256,'height':128,'crs':'EPSG:4326','bounds':[-180,-90,180,90]}]}
(root/'plan.json').write_text(json.dumps(plan,indent=2)+'\n')
