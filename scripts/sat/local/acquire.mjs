#!/usr/bin/env node
import { access, appendFile, mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checksum, flag, objectName, QUARTERS, readJsonl, sourceFile } from './common.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: acquire.mjs [--inventory FILE] [--work DIR] [--source-dir DIR] [--python PYTHON] [--max-gb GB]');
  process.exit(0);
}
const root = resolve(import.meta.dirname, '../../..');
const inventory = resolve(flag(args, '--inventory', resolve(root, 'scripts/sat/work/inventory/source-inventory.jsonl')));
const work = resolve(flag(args, '--work', resolve(root, 'scripts/sat/work/s2gm2025')));
const sourceDir = flag(args, '--source-dir', null);
const python = flag(args, '--python', '/home/hatch/workspace/map-game/eox1-work/.venv-sat/bin/python');
const collectionLabel = flag(args, '--collection-label', 'low-resolution');
const maxGb = Number(flag(args, '--max-gb', '52'));
if (!Number.isFinite(maxGb) || maxGb <= 0) throw new Error('--max-gb must be a positive number');
const records = (await readJsonl(inventory)).filter((record) => record.collectionLabel === collectionLabel);
if (!records.length) throw new Error('Inventory is empty');
for (const quarter of QUARTERS) if (!records.some((record) => record.quarter === quarter)) throw new Error(`Inventory selection has no objects for ${quarter}`);
const ids = new Set();
for (const record of records) {
  if (!record.productId || !record.name || !record.quarter || !record.s3Path || !Number.isSafeInteger(record.contentLength)) throw new Error(`Invalid inventory record: ${JSON.stringify(record)}`);
  if (ids.has(record.productId)) throw new Error(`Duplicate productId: ${record.productId}`);
  ids.add(record.productId); checksum(record);
}
if (records.reduce((sum, row) => sum + row.contentLength, 0) > maxGb * 1e9) throw new Error(`Inventory exceeds the ${maxGb} GB acquisition gate`);
const exists = async (file) => { try { await access(file, constants.F_OK); return true; } catch { return false; } };
const digestFile = async (file, algorithm) => {
  const hash = createHash(algorithm); const handle = await open(file, 'r');
  for await (const chunk of handle.createReadStream()) hash.update(chunk);
  await handle.close(); return hash.digest('hex');
};
const s3EtagOf = (record) => {
  const key = record.s3Path.replace(/^\/eodata\//, '').replace(/^\//, '');
  const code = `import boto3,json\nfrom botocore.config import Config\ns=boto3.client('s3',endpoint_url='https://eodata.dataspace.copernicus.eu',config=Config(s3={'addressing_style':'path'}))\nprint(json.dumps({'etag':s.head_object(Bucket='eodata',Key=${JSON.stringify(key)})['ETag']}))\n`;
  const result = spawnSync(python, ['-c', code], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`S3 HEAD failed for ${record.productId}: ${result.stderr.trim()}`);
  try { return JSON.parse(result.stdout).etag.replace(/^\"|\"$/g, '').toLowerCase(); } catch { throw new Error(`S3 HEAD did not return an etag for ${record.productId}`); }
};
const verifyExisting = async (file, record, expected) => expected.algorithm === 's3-etag'
  ? s3EtagOf(record) === expected.value
  : await digestFile(file, expected.algorithm) === expected.value;
const logFile = resolve(work, 'acquire.jsonl');
await mkdir(work, { recursive: true });
for (const record of records) {
  const target = sourceFile(work, record); const partial = `${target}.partial`; const expected = checksum(record);
  await mkdir(dirname(target), { recursive: true });
  if (await exists(target)) {
    if ((await stat(target)).size === record.contentLength && await verifyExisting(target, record, expected)) {
      await appendFile(logFile, `${JSON.stringify({ productId: record.productId, quarter: record.quarter, status: 'resumed', bytes: record.contentLength, requests: expected.algorithm === 's3-etag' ? 1 : 0 })}\n`); continue;
    }
    throw new Error(`Existing object is invalid; refusing to overwrite: ${target}`);
  }
  await unlink(partial).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  let requests = 0;
  let actualEtag = null;
  if (sourceDir) {
    const named = resolve(sourceDir, objectName(record));
    const local = await exists(named) ? named : resolve(sourceDir, record.name);
    const result = spawnSync('cp', ['--', local, partial], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Could not copy ${local}: ${result.stderr.trim()}`);
  } else {
    const key = record.s3Path.replace(/^\/eodata\//, '').replace(/^\//, '');
    // S3-listing records name a concrete .tif object and are downloaded directly.
    // Catalogue records retain their existing S3Path handling.
    const code = `import boto3,json\nfrom botocore.config import Config\ns=boto3.client('s3',endpoint_url='https://eodata.dataspace.copernicus.eu',config=Config(s3={'addressing_style':'path'}))\ns.download_file('eodata',${JSON.stringify(key)},${JSON.stringify(partial)})\nprint(json.dumps({'etag':s.head_object(Bucket='eodata',Key=${JSON.stringify(key)})['ETag']}))\n`;
    const result = spawnSync(python, ['-c', code], { encoding: 'utf8' }); requests = 2;
    if (result.status !== 0) throw new Error(`S3 download failed for ${record.productId}`);
    try { actualEtag = JSON.parse(result.stdout).etag.replace(/^\"|\"$/g, '').toLowerCase(); } catch { throw new Error(`S3 download did not return a HEAD etag for ${record.productId}`); }
  }
  const actualSize = (await stat(partial)).size;
  const actualDigest = expected.algorithm === 's3-etag' ? actualEtag : await digestFile(partial, expected.algorithm);
  if (actualSize !== record.contentLength || !actualDigest || actualDigest !== expected.value) throw new Error(`Verification failed for ${record.productId}: size ${actualSize}/${record.contentLength}, ${expected.algorithm} ${actualDigest}/${expected.value}`);
  await rename(partial, target);
  await appendFile(logFile, `${JSON.stringify({ productId: record.productId, quarter: record.quarter, status: 'downloaded', bytes: actualSize, requests, checksumAlgorithm: expected.algorithm, checksum: actualDigest })}\n`);
}
console.log(`Acquired and verified ${records.length} objects in ${resolve(work, 'source')}`);
