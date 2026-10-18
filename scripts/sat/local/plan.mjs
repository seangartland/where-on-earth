#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { flag, readJson } from './common.mjs';
import { SITE_ZOOMS } from './sites.mjs';
const args=process.argv.slice(2),root=resolve(import.meta.dirname,'../../..'),out=resolve(flag(args,'--out'));
const edge=20037508.342789244;
const bounds=(z,x,y)=>[-edge+x/2**z*edge*2,edge-(y+3)/2**z*edge*2,-edge+(x+3)/2**z*edge*2,edge-y/2**z*edge*2];
let tiles;
let siteWindows;
if(args.includes('--sites')){const ids=new Set(flag(args,'--sites').split(',')),sites=await readJson(resolve(root,'scripts/sat/pilot-sites.json'));const chosen=sites.filter(s=>ids.has(s.id));if(chosen.length!==ids.size)throw new Error('Unknown acceptance site');tiles=chosen.flatMap(s=>SITE_ZOOMS.map(z=>({z,x:s.tiles[z].x,y:s.tiles[z].y})));siteWindows=Object.fromEntries(chosen.map(s=>[s.id,SITE_ZOOMS.map(z=>`${z}/${Math.floor(s.tiles[z].x/3)*3}/${Math.floor(s.tiles[z].y/3)*3}`)]))}
else {const manifest=await readJson(resolve(flag(args,'--manifest',resolve(root,'scripts/sat/eox2025-manifest.json'))));tiles=manifest.tiles;if(!tiles.some(t=>t.z===9)){const seen=new Set();for(const file of manifest.locationFiles.slice(0,3)){for(const place of await readJson(resolve(root,file))){const n=2**9,clipped=Math.max(-85.05112878,Math.min(85.05112878,place.lat)),cx=Math.floor((place.lng+180)/360*n),cy=Math.floor((1-Math.asinh(Math.tan(clipped*Math.PI/180))/Math.PI)/2*n);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=(cx+dx+n)%n,y=Math.max(0,Math.min(n-1,cy+dy)),key=`${x}/${y}`;if(!seen.has(key)){seen.add(key);tiles.push({z:9,x,y})}}}}}}
const groups=new Map();for(const t of tiles){const x=Math.floor(t.x/3)*3,y=Math.floor(t.y/3)*3,key=`${t.z}/${x}/${y}`;if(!groups.has(key))groups.set(key,{id:key,kind:'detail',z:t.z,x,y,width:768,height:768,crs:'EPSG:3857',bounds:bounds(t.z,x,y),tiles:[]});groups.get(key).tiles.push({x:t.x,y:t.y})}
const windows=[...groups.values()].sort((a,b)=>b.z-a.z);const raw=[];
for(const w of windows){const finer=raw.filter(s=>s.z>w.z);if(!finer.length){raw.push(w);continue}const scaleZ=Math.max(...finer.map(s=>s.z)),scale=2**(scaleZ-w.z),covering=finer.filter(s=>s.z===scaleZ&&s.x+3> w.x*scale&&s.x<(w.x+3)*scale&&s.y+3>w.y*scale&&s.y<(w.y+3)*scale);let complete=true;for(let y=w.y*scale;y<(w.y+3)*scale&&complete;y++)for(let x=w.x*scale;x<(w.x+3)*scale;x++)if(!covering.some(s=>x>=s.x&&x<s.x+3&&y>=s.y&&y<s.y+3)){complete=false;break}if(complete)w.deriveSources=covering.map(s=>s.id);else raw.push(w)}
windows.push({id:'base',kind:'base',width:2048,height:1024,crs:'EPSG:4326',bounds:[-180,-90,180,90]});
await writeFile(out,`${JSON.stringify({version:1,windows,...(siteWindows&&{siteWindows})},null,2)}\n`);console.log(`Wrote ${windows.length} windows (${raw.length+1} sampled, ${windows.length-raw.length-1} derived) to ${out}`);
