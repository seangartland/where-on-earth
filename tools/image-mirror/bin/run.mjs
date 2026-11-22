#!/usr/bin/env node
// Pi-side staged ingest runner (BRIEF-image-r2-ingest.md deliverable 2).
// See INGEST-REPORT.md for the exact staging/launch commands. Boundary:
// this file must never be invoked with --stage pilot or --stage full from
// the build lane -- only --self-check (no network, no R2, no attribution
// fetch) is safe to run here.
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildInventory } from '../src/inventory.js';
import { diffFromExpectedSnapshot } from '../src/expected-inventory.js';
import { fetchAttributionForCanonicalSources } from '../src/attribution.js';
import {
  readManifest, writeManifestAtomic, indexManifestByCanonicalUrl,
  buildManifestRowSkeleton, buildUrlMap,
} from '../src/manifest.js';
import { mapWithConcurrency, fetchBuffer } from '../src/http.js';
import { verifyDownloadedImage } from '../src/verify-image.js';
import { planVariantWidths, encodeWebpVariant, verifyEncodedVariant, sha256 } from '../src/transcode.js';
import { variantKey } from '../src/keys.js';
import { createR2Client } from '../src/r2-client.js';
import { uploadVariantCreateOnly } from '../src/upload.js';
import { reconcileManifestWithR2 } from '../src/reconcile.js';
import {
  PILOT_SIZE, PI_FETCH_CONCURRENCY, PI_FETCH_DELAY_MS,
  sourcesForStage, pendingSources, buildSampleSheet, sampleSheetHtml,
  summarizeManifest, buildExceptions, createRunLogger, selectPublicVerificationSample,
} from '../src/runner.js';

const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(TOOL_ROOT, '..', '..');

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? fallback : process.argv[idx + 1];
}

// Default run directory follows the design's Pi path; this VM sandbox has
// no /mnt/external, so fall back to the same local gitignored scratch dir
// bin/preflight.mjs uses, and say so plainly.
function resolveRunRoot() {
  const override = arg('run-root', null);
  if (override) return override;
  if (existsSync('/mnt/external')) return '/mnt/external/where-on-earth/image-mirror';
  return path.join(TOOL_ROOT, '.runs');
}

function rawCachePath(rawRoot, sha) {
  return path.join(rawRoot, sha.slice(0, 2), sha);
}

async function verifyPublicGet(key, { host = 'images.where-on.earth' } = {}) {
  const res = await fetch(`https://${host}/${key}`, { method: 'GET' });
  return res.ok;
}

// Processes one canonical source against its manifest row, resuming from
// whatever the row already has (source_sha256, verified variants). Only
// ever mutates the row object in place; the caller owns writing the
// manifest back out.
async function processOneSource(source, { manifestByUrl, runRoot, client, log, meter }) {
  const row = manifestByUrl.get(source.canonicalUrl);
  if (!row || row.status === 'attribution-failed') return row || null;

  const rawRoot = path.join(runRoot, 'raw', 'sha256');
  let buffer;

  if (row.source_sha256 && existsSync(rawCachePath(rawRoot, row.source_sha256))) {
    buffer = readFileSync(rawCachePath(rawRoot, row.source_sha256));
    meter.rawCacheHits += 1;
  } else {
    meter.fetchRequests += 1;
    const fetched = await fetchBuffer(source.canonicalUrl).catch((err) => ({ ok: false, error: err.message }));
    if (!fetched.ok) {
      row.status = 'failed';
      row.error = `fetch-failed: ${fetched.error || `HTTP ${fetched.status}`}`;
      return row;
    }
    buffer = fetched.buffer;
    meter.fetchBytes += buffer.length;

    const verified = await verifyDownloadedImage(buffer, { sourceUrl: source.canonicalUrl });
    if (!verified.ok) {
      row.status = 'failed';
      row.error = `verify-download-failed: ${verified.reason}`;
      return row;
    }

    const sha = sha256(buffer);
    const dest = rawCachePath(rawRoot, sha);
    if (!existsSync(dest)) {
      mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(tmp, buffer);
      renameSync(tmp, dest);
    }
    meter.rawCacheMisses += 1;

    row.source_sha256 = sha;
    row.source_mime = verified.format ? `image/${verified.format}` : null;
    row.source_width = verified.width;
    row.source_height = verified.height;
    row.source_bytes = buffer.length;
  }

  const plan = planVariantWidths(row.source_width);
  const newlyUploadedKeys = [];
  const variants = [];
  for (const { target, encodeWidth } of plan) {
    const existingVariant = (row.variants || []).find((v) => v.width === target);
    if (existingVariant && existingVariant.status === 'verified') {
      variants.push(existingVariant);
      continue;
    }

    meter.transcodes += 1;
    const encoded = await encodeWebpVariant(buffer, encodeWidth);
    const check = await verifyEncodedVariant(encoded.data, {
      sourceWidth: row.source_width,
      sourceHeight: row.source_height,
      encodeWidth,
    });
    if (!check.ok) {
      variants.push({ width: target, status: 'failed', error: check.reason });
      continue;
    }

    const key = variantKey(row.source_sha256, target);
    meter.putsAttempted += 1;
    const uploadResult = await uploadVariantCreateOnly(client, {
      key,
      body: encoded.data,
      contentType: 'image/webp',
      expectedSha256: encoded.sha256,
    });
    if (!uploadResult.ok) {
      variants.push({ width: target, key, status: 'failed', error: uploadResult.detail });
      continue;
    }
    if (uploadResult.outcome === 'uploaded') {
      meter.putsSucceeded += 1;
      newlyUploadedKeys.push(key);
    } else {
      meter.putsSkipped += 1;
    }

    variants.push({
      width: target,
      actual_width: check.width,
      height: check.height,
      key,
      sha256: encoded.sha256,
      bytes: encoded.bytes,
      status: 'verified',
    });
  }

  row.variants = variants;
  const failedVariants = variants.filter((v) => v.status !== 'verified');
  row.status = failedVariants.length === 0 ? 'ready' : 'failed';
  row.error = failedVariants.length === 0
    ? null
    : `variant failures: ${failedVariants.map((v) => `${v.width}:${v.error}`).join(', ')}`;

  for (const key of selectPublicVerificationSample(newlyUploadedKeys)) {
    meter.publicVerificationGets += 1;
    const ok = await verifyPublicGet(key).catch(() => false);
    if (!ok) log(`WARNING: public-host GET verification failed for ${key}`);
  }

  return row;
}

async function main() {
  const stage = arg('stage', null);
  const selfCheck = process.argv.includes('--self-check');
  const runId = arg('run-id', 'main');
  const runRoot = resolveRunRoot();
  const pilotSize = Number(arg('pilot-size', PILOT_SIZE));

  if (!selfCheck && !stage) {
    console.error('Usage: run.mjs --stage pilot|full --run-root <dir> [--run-id <id>]  (or --self-check)');
    process.exitCode = 1;
    return;
  }

  const runDir = path.join(runRoot, 'runs', runId);
  mkdirSync(runDir, { recursive: true });
  const log = createRunLogger(path.join(runDir, 'run.log'));
  log(`=== starting ${selfCheck ? 'self-check' : `stage=${stage}`} (runRoot=${runRoot}, runId=${runId}) ===`);

  const inventory = buildInventory(REPO_ROOT);
  const mismatches = diffFromExpectedSnapshot(inventory);
  if (mismatches.length > 0) {
    log('DRIFT from design-time snapshot; stopping:');
    for (const m of mismatches) log(`  - ${m}`);
    process.exitCode = 1;
    return;
  }
  log(`inventory ok: ${inventory.canonicalUniqueCount} canonical sources`);

  const manifestPath = path.join(runDir, 'manifest.jsonl');
  const manifestRows = readManifest(manifestPath);
  const manifestByUrl = indexManifestByCanonicalUrl(manifestRows);

  if (selfCheck) {
    const pilotSources = sourcesForStage(inventory.canonicalSources, 'pilot', { pilotSize });
    const pilotState = pendingSources(pilotSources, manifestByUrl);
    const fullState = pendingSources(inventory.canonicalSources, manifestByUrl);
    log(`self-check: pilot would process ${pilotState.pending.length} source(s) (${pilotState.alreadyDone} already ready)`);
    log(`self-check: full would process ${fullState.pending.length} source(s) (${fullState.alreadyDone} already ready)`);
    log(`self-check: manifest summary = ${JSON.stringify(summarizeManifest(manifestRows))}`);
    log('self-check ok -- no network, no R2, no attribution fetch performed');
    return;
  }

  const stageSources = sourcesForStage(inventory.canonicalSources, stage, { pilotSize });

  const unresolved = stageSources.filter((s) => !manifestByUrl.has(s.canonicalUrl));
  if (unresolved.length > 0) {
    log(`resolving attribution for ${unresolved.length} new source(s)`);
    const attributionCacheDir = path.join(runRoot, 'raw', 'attribution');
    const attributionResults = await fetchAttributionForCanonicalSources(unresolved, {
      cacheDir: attributionCacheDir,
      delayMs: PI_FETCH_DELAY_MS,
    });
    for (const source of unresolved) {
      const row = buildManifestRowSkeleton(source, attributionResults.get(source.canonicalUrl));
      manifestRows.push(row);
      manifestByUrl.set(source.canonicalUrl, row);
    }
    writeManifestAtomic(manifestPath, manifestRows);
  }

  const { pending, alreadyDone } = pendingSources(stageSources, manifestByUrl);
  log(`stage=${stage}: ${pending.length} source(s) need work, ${alreadyDone} already ready`);

  const client = createR2Client();
  const meter = {
    rawCacheHits: 0, rawCacheMisses: 0, fetchRequests: 0, fetchBytes: 0,
    transcodes: 0, putsAttempted: 0, putsSucceeded: 0, putsSkipped: 0,
    publicVerificationGets: 0,
  };

  let processed = 0;
  await mapWithConcurrency(
    pending,
    async (source) => {
      const result = await processOneSource(source, { manifestByUrl, runRoot, client, log, meter });
      if (result) {
        processed += 1;
        log(`${result.canonical_source_url}: ${result.status}${result.error ? ` (${result.error})` : ''}`);
      }
      if (processed % 10 === 0) writeManifestAtomic(manifestPath, manifestRows);
    },
    { concurrency: PI_FETCH_CONCURRENCY, delayMs: PI_FETCH_DELAY_MS },
  );
  writeManifestAtomic(manifestPath, manifestRows);

  writeFileSync(
    path.join(runDir, 'exceptions.jsonl'),
    `${buildExceptions(manifestRows).map((e) => JSON.stringify(e)).join('\n')}\n`,
  );
  writeFileSync(path.join(runDir, 'url-map.json'), JSON.stringify(buildUrlMap(manifestRows), null, 1));
  writeFileSync(path.join(runDir, 'meter.json'), JSON.stringify(meter, null, 1));
  log(`manifest summary: ${JSON.stringify(summarizeManifest(manifestRows))}`);

  if (stage === 'pilot') {
    const sampleSheet = buildSampleSheet(manifestRows);
    writeFileSync(path.join(runDir, 'sample-sheet.json'), JSON.stringify(sampleSheet, null, 1));
    writeFileSync(path.join(runDir, 'sample-sheet.html'), sampleSheetHtml(sampleSheet));
    log(`sample sheet: ${sampleSheet.entries.length} entries (ok=${sampleSheet.ok}, min=${sampleSheet.minCount})`);
    log('=== PILOT complete; STOP (launch --stage full separately) ===');
    return;
  }

  log('reconciling manifest against live R2 listing...');
  const { objects } = await client.listAllObjects({ prefix: 'photos/v1/' });
  const reconcileResult = reconcileManifestWithR2(manifestRows, objects.map((o) => ({ key: o.key, size: o.size })));
  writeFileSync(path.join(runDir, 'reconcile-report.json'), JSON.stringify(reconcileResult, null, 1));
  log(`reconcile: ${reconcileResult.ok ? 'OK' : 'MISMATCH'} (expected=${reconcileResult.expectedCount}, actual=${reconcileResult.actualCount}, missing=${reconcileResult.missing.length}, extra=${reconcileResult.extra.length}, sizeMismatched=${reconcileResult.sizeMismatched.length})`);
  log('=== FULL complete ===');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
