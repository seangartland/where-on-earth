#!/usr/bin/env node
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { flag } from './common.mjs';
const args=process.argv.slice(2),python=flag(args,'--python','/home/hatch/workspace/map-game/eox1-work/.venv-sat/bin/python'),dir=resolve(flag(args,'--dir',await mkdtemp(resolve(tmpdir(),'eox-local-selftest-'))));
const run=(cmd)=>{console.log(`+ ${cmd.join(' ')}`);const r=spawnSync(cmd[0],cmd.slice(1),{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1)};
run([python,resolve(import.meta.dirname,'make-fixtures.py'),'--dir',dir]);
run(['node',resolve(import.meta.dirname,'run.mjs'),'--stage','all','--plan',resolve(dir,'plan.json'),'--inventory',resolve(dir,'inventory.jsonl'),'--source-dir',resolve(dir,'source'),'--assets',resolve(dir,'assets'),'--work',resolve(dir,'work'),'--out',resolve(dir,'finished'),'--python',python]);
run(['node',resolve(import.meta.dirname,'acquire.mjs'),'--inventory',resolve(dir,'inventory.jsonl'),'--source-dir',resolve(dir,'source'),'--work',resolve(dir,'work'),'--python',python]);
run(['node',resolve(import.meta.dirname,'finish.mjs'),'--plan',resolve(dir,'plan.json'),'--assets',resolve(dir,'assets'),'--work',resolve(dir,'work'),'--out',resolve(dir,'finished-repeat'),'--python',python]);
const qa=JSON.parse(await readFile(resolve(dir,'finished/qa.json'),'utf8'));if(Object.keys(qa.tiles).length!==2||Object.keys(qa.windows).length!==3||qa.seams.length!==1||qa.seams[0].meanAbsoluteRgbDifference!==0)throw new Error('Fixture QA assertion failed');
await access(resolve(dir,'finished/base-ours.jpg'));
for(const image of ['4/5/7.jpg','4/6/7.jpg','base-ours.jpg']){const digest=async root=>createHash('sha256').update(await readFile(resolve(dir,root,image))).digest('hex');if(await digest('finished')!==await digest('finished-repeat'))throw new Error(`Non-deterministic finish: ${image}`)}
for(const name of ['sample.py','raster_ops.py','finish.mjs']){const text=await readFile(resolve(import.meta.dirname,name),'utf8');if(/\b(fetch|https?:|boto3|botocore|S3Client)\b/.test(text))throw new Error(`${name} contains a network-capable code path`)}
console.log(JSON.stringify({status:'passed',directory:dir,tiles:qa.tiles,seam:qa.seams[0],windows:qa.windows},null,2));
