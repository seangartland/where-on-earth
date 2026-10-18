#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { flag } from './common.mjs';
const args=process.argv.slice(2);if(args.includes('--help')){console.log('Usage: run.mjs --stage acquire|sample|finish|all --plan FILE --work DIR [--inventory FILE] [--source-dir DIR] [--assets DIR] [--out DIR] [--max-gb GB]');process.exit(0)}
const stage=flag(args,'--stage','all'),root=resolve(import.meta.dirname,'../../..'),python=flag(args,'--python','/home/hatch/workspace/map-game/eox1-work/.venv-sat/bin/python'),work=resolve(flag(args,'--work',resolve(root,'scripts/sat/work/s2gm2025'))),inventory=resolve(flag(args,'--inventory',resolve(root,'scripts/sat/work/inventory/source-inventory.jsonl'))),plan=resolve(flag(args,'--plan',resolve(work,'full-plan.json'))),assets=resolve(flag(args,'--assets',resolve(root,'scripts/sat/cache'))),out=resolve(flag(args,'--out',resolve(work,'finished')));
const run=(command)=>{console.log(`+ ${command.join(' ')}`);const r=spawnSync(command[0],command.slice(1),{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1)};
if(stage==='all'||stage==='acquire'){const c=['node',resolve(import.meta.dirname,'acquire.mjs'),'--inventory',inventory,'--work',work,'--python',python];const source=flag(args,'--source-dir',null),maxGb=flag(args,'--max-gb',null);if(source)c.push('--source-dir',resolve(source));if(maxGb)c.push('--max-gb',maxGb);run(c)}
if(stage==='all'||stage==='sample')run([python,resolve(import.meta.dirname,'sample.py'),'--inventory',inventory,'--plan',plan,'--work',work]);
if(stage==='all'||stage==='finish')run(['node',resolve(import.meta.dirname,'finish.mjs'),'--plan',plan,'--work',work,'--assets',assets,'--out',out,'--python',python]);
if(!['all','acquire','sample','finish'].includes(stage))throw new Error(`Unknown stage ${stage}`);
