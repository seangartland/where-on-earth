#!/usr/bin/env node
// Preflight mode (BRIEF-image-r2-build.md deliverable 2): downloads NOTHING
// in bulk. It HEADs (falling back to a 1-byte ranged GET) every canonical
// source URL for an exact byte total, downloads+encodes a small stratified
// SAMPLE purely to measure a real output/input byte ratio (the design's
// "representative sample" requirement -- this is not the bulk ingest, and
// is bounded well below it), and reads the bucket's current live usage to
// project the post-migration bucket total against the 8 GB gate.
import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { buildInventory } from '../src/inventory.js';
import { diffFromExpectedSnapshot } from '../src/expected-inventory.js';
import { mapWithConcurrency, headSize, fetchBuffer } from '../src/http.js';
import { verifyDownloadedImage } from '../src/verify-image.js';
import { planVariantWidths, encodeWebpVariant } from '../src/transcode.js';

const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(TOOL_ROOT, '..', '..');
const GATE_BYTES = 8_000_000_000; // 8 GB, decimal (Cloudflare's billing convention)

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? fallback : process.argv[idx + 1];
}

// Default run directory follows the design's Pi path; this VM sandbox has
// no /mnt/external, so fall back to a local, gitignored scratch dir and say
// so plainly rather than writing bulk data into the repo workspace.
function resolveRunRoot() {
  const override = arg('out', null);
  if (override) return override;
  const piPath = '/mnt/external/where-on-earth/image-mirror/runs';
  if (existsSync('/mnt/external')) return piPath;
  return path.join(TOOL_ROOT, '.runs');
}

function stratifiedSample(canonicalSources, sampleSize) {
  const byHost = new Map();
  for (const source of canonicalSources) {
    const host = new URL(source.canonicalUrl).hostname.toLowerCase();
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(source);
  }
  const total = canonicalSources.length;
  const sample = [];
  for (const [, sources] of byHost) {
    sources.sort((a, b) => a.canonicalUrl.localeCompare(b.canonicalUrl));
    const take = Math.max(1, Math.round((sources.length / total) * sampleSize));
    const step = Math.max(1, Math.floor(sources.length / take));
    for (let i = 0; i < sources.length && sample.length < sampleSize; i += step) {
      sample.push(sources[i]);
    }
  }
  return sample.slice(0, sampleSize);
}

async function measureSample(sample) {
  const rows = await mapWithConcurrency(
    sample,
    async (source) => {
      const fetched = await fetchBuffer(source.canonicalUrl).catch((err) => ({ ok: false, error: err.message }));
      if (!fetched.ok) return { canonicalUrl: source.canonicalUrl, ok: false, reason: fetched.error || `HTTP ${fetched.status}` };
      const verified = await verifyDownloadedImage(fetched.buffer, { sourceUrl: source.canonicalUrl });
      if (!verified.ok) return { canonicalUrl: source.canonicalUrl, ok: false, reason: verified.reason };

      const sourceBytes = fetched.buffer.length;
      const plan = planVariantWidths(verified.width);
      const encodedByWidth = new Map();
      let variantBytesTotal = 0;
      for (const { encodeWidth } of plan) {
        if (!encodedByWidth.has(encodeWidth)) {
          const variant = await encodeWebpVariant(fetched.buffer, encodeWidth);
          encodedByWidth.set(encodeWidth, variant.bytes);
        }
        variantBytesTotal += encodedByWidth.get(encodeWidth);
      }
      return { canonicalUrl: source.canonicalUrl, ok: true, sourceBytes, variantBytesTotal, sourceWidth: verified.width, sourceHeight: verified.height };
    },
    { concurrency: 6, delayMs: 100 },
  );
  return rows;
}

async function main() {
  const concurrency = Number(arg('concurrency', 12));
  const delayMs = Number(arg('delay-ms', 40));
  const sampleSize = Number(arg('sample-size', 48));
  const skipBucketUsage = process.argv.includes('--skip-bucket-usage');

  console.log('--- Inventory ---');
  const inventory = buildInventory(REPO_ROOT);
  const mismatches = diffFromExpectedSnapshot(inventory);
  if (mismatches.length > 0) {
    console.error('DRIFT from design-time snapshot; stopping preflight:');
    for (const m of mismatches) console.error(`  - ${m}`);
    process.exitCode = 1;
    return;
  }
  console.log(`canonicalUniqueCount=${inventory.canonicalUniqueCount} (matches docs/image-r2-mirror-design.md)`);

  console.log(`--- HEAD sizing: ${inventory.canonicalSources.length} canonical URLs, concurrency=${concurrency} ---`);
  const headResults = await mapWithConcurrency(
    inventory.canonicalSources,
    async (source) => {
      try {
        const result = await headSize(source.canonicalUrl);
        return { canonicalUrl: source.canonicalUrl, ...result };
      } catch (err) {
        return { canonicalUrl: source.canonicalUrl, ok: false, error: err.message };
      }
    },
    { concurrency, delayMs },
  );

  const byHost = {};
  let totalSourceBytes = 0;
  let failedHeads = 0;
  for (const row of headResults) {
    const host = new URL(row.canonicalUrl).hostname.toLowerCase();
    byHost[host] ??= { count: 0, bytes: 0, failures: 0 };
    if (row.ok && Number.isFinite(row.bytes)) {
      byHost[host].count += 1;
      byHost[host].bytes += row.bytes;
      totalSourceBytes += row.bytes;
    } else {
      byHost[host].failures += 1;
      failedHeads += 1;
    }
  }
  console.log(`measured source bytes (successful HEADs): ${totalSourceBytes} (${(totalSourceBytes / 1e9).toFixed(3)} GB)`);
  console.log(`failed HEAD/size lookups: ${failedHeads} of ${headResults.length}`);
  console.log(`by host: ${JSON.stringify(byHost, null, 1)}`);

  console.log(`--- Representative sample: encoding ${sampleSize} sources for a real output/input byte ratio ---`);
  const sample = stratifiedSample(inventory.canonicalSources, sampleSize);
  const sampleResults = await measureSample(sample);
  const sampleOk = sampleResults.filter((r) => r.ok);
  const sampleSourceBytes = sampleOk.reduce((sum, r) => sum + r.sourceBytes, 0);
  const sampleVariantBytes = sampleOk.reduce((sum, r) => sum + r.variantBytesTotal, 0);
  const ratio = sampleSourceBytes > 0 ? sampleVariantBytes / sampleSourceBytes : null;
  console.log(`sample ok=${sampleOk.length}/${sample.length}; sourceBytes=${sampleSourceBytes}; variantBytes=${sampleVariantBytes}; ratio=${ratio}`);
  for (const r of sampleResults.filter((r) => !r.ok)) console.log(`  sample failure: ${r.canonicalUrl} (${r.reason})`);

  const projectedVariantBytes = ratio != null ? Math.round(ratio * totalSourceBytes) : null;
  console.log(`projected total variant bytes (ratio x measured source bytes): ${projectedVariantBytes} (${projectedVariantBytes != null ? (projectedVariantBytes / 1e9).toFixed(3) : 'n/a'} GB)`);

  let currentBucketBytes = null;
  let currentBucketCount = null;
  if (!skipBucketUsage) {
    console.log('--- Current live bucket usage (paginated R2 listing, read-only) ---');
    const bridge = path.join(TOOL_ROOT, 'smoke', 'cf-bridge.py');
    const result = spawnSync('python3', [bridge, 'bucket-usage'], { encoding: 'utf8' });
    if (result.status === 0) {
      const parsed = JSON.parse(result.stdout.trim());
      currentBucketBytes = parsed.bytes;
      currentBucketCount = parsed.count;
      console.log(`current bucket usage: ${currentBucketCount} objects, ${currentBucketBytes} bytes (${(currentBucketBytes / 1e9).toFixed(3)} GB)`);
    } else {
      console.log(`bucket usage check unavailable here (${result.stderr || result.stdout}); gate check will omit it`);
    }
  }

  console.log('--- Gate check (8 GB bucket total) ---');
  if (currentBucketBytes != null && projectedVariantBytes != null) {
    const projectedTotal = currentBucketBytes + projectedVariantBytes;
    const pass = projectedTotal < GATE_BYTES;
    console.log(`projected bucket total = current(${(currentBucketBytes / 1e9).toFixed(3)} GB) + projected photos(${(projectedVariantBytes / 1e9).toFixed(3)} GB) = ${(projectedTotal / 1e9).toFixed(3)} GB`);
    console.log(pass ? 'PASS: under the 8 GB gate' : 'FAIL: at or over the 8 GB gate -- v1 must not proceed to transcode/upload');
  } else {
    console.log('Gate check incomplete: missing bucket usage or projected bytes.');
  }

  const runRoot = resolveRunRoot();
  mkdirSync(runRoot, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(runRoot, `preflight-${runId}.json`);
  writeFileSync(outPath, JSON.stringify({
    runId,
    generatedAt: new Date().toISOString(),
    inventory: { canonicalUniqueCount: inventory.canonicalUniqueCount, perFile: inventory.perFile, unionHostCounts: inventory.unionHostCounts },
    headSizing: { totalSourceBytes, failedHeads, byHost, totalUrls: headResults.length },
    sample: { size: sample.length, ok: sampleOk.length, sourceBytes: sampleSourceBytes, variantBytes: sampleVariantBytes, ratio },
    projectedVariantBytes,
    currentBucketBytes,
    currentBucketCount,
    gateBytes: GATE_BYTES,
  }, null, 1));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
