#!/usr/bin/env node
// Bounded smoke test (BRIEF-image-r2-build.md boundaries): at most 5 images,
// end to end -- download, transcode, upload, fetch back, delete. Uses the
// real design key scheme under photos/v1/ and deletes every object it
// creates, so it never leaves anything behind in the bucket.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildInventory } from '../src/inventory.js';
import { fetchBuffer } from '../src/http.js';
import { verifyDownloadedImage } from '../src/verify-image.js';
import { planVariantWidths, encodeWebpVariant, verifyEncodedVariant, sha256 } from '../src/transcode.js';
import { variantKey } from '../src/keys.js';
import { createR2Client } from '../src/r2-client.js';
import { createR2BridgeClient } from '../src/r2-bridge-client.js';

const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(TOOL_ROOT, '..', '..');
const MAX_SMOKE_IMAGES = 5;

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? fallback : process.argv[idx + 1];
}

function selectClient() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
    return { client: createR2Client(), path: 'production bearer-token client (CLOUDFLARE_API_TOKEN)' };
  }
  return {
    client: createR2BridgeClient({ bridgePath: path.join(TOOL_ROOT, 'smoke', 'cf-bridge.py') }),
    path: 'VM-sandbox cf-bridge.py (custom.cloudflare connector) -- not the Pi credential path',
  };
}

async function smokeTestOne(source, client) {
  const fetched = await fetchBuffer(source.canonicalUrl);
  if (!fetched.ok) return { canonicalUrl: source.canonicalUrl, stage: 'fetch', ok: false, detail: `HTTP ${fetched.status}` };

  const verified = await verifyDownloadedImage(fetched.buffer, { sourceUrl: source.canonicalUrl });
  if (!verified.ok) return { canonicalUrl: source.canonicalUrl, stage: 'verify-download', ok: false, detail: verified.reason };

  const sourceSha = sha256(fetched.buffer);
  const plan = planVariantWidths(verified.width);
  const uploadedKeys = [];
  const variantReports = [];

  for (const { target, encodeWidth } of plan) {
    const variant = await encodeWebpVariant(fetched.buffer, encodeWidth);
    const variantCheck = await verifyEncodedVariant(variant.data, {
      sourceWidth: verified.width,
      sourceHeight: verified.height,
      encodeWidth,
    });
    if (!variantCheck.ok) {
      variantReports.push({ target, ok: false, detail: variantCheck.reason });
      continue;
    }

    const key = variantKey(sourceSha, target);
    const putResult = await client.putObject({ key, body: variant.data, contentType: 'image/webp' });
    if (!putResult.ok) {
      variantReports.push({ target, key, ok: false, detail: `upload HTTP ${putResult.status}` });
      continue;
    }
    uploadedKeys.push(key);

    const fetchedBack = await client.getObject({ key });
    const roundTripOk = fetchedBack.ok && fetchedBack.body.length === variant.bytes && sha256(fetchedBack.body) === variant.sha256;
    variantReports.push({
      target,
      key,
      ok: roundTripOk,
      bytes: variant.bytes,
      actualWidth: variant.width,
      actualHeight: variant.height,
      lossless: variant.lossless,
      detail: roundTripOk ? 'upload + fetch-back verified' : 'fetch-back mismatch',
    });
  }

  for (const key of uploadedKeys) {
    await client.deleteObject({ key });
  }

  return {
    canonicalUrl: source.canonicalUrl,
    ok: variantReports.every((v) => v.ok),
    sourceSha256: sourceSha,
    sourceWidth: verified.width,
    sourceHeight: verified.height,
    sourceBytes: fetched.buffer.length,
    variants: variantReports,
  };
}

async function main() {
  const limit = Math.min(Number(arg('limit', 3)), MAX_SMOKE_IMAGES);
  const inventory = buildInventory(REPO_ROOT);
  const sample = inventory.canonicalSources.slice(0, limit);

  const { client, path: clientPath } = selectClient();
  console.log(`R2 credential path: ${clientPath}`);
  console.log(`Running end-to-end smoke test on ${sample.length} image(s) (limit=${limit}, hard cap=${MAX_SMOKE_IMAGES})`);

  const results = [];
  for (const source of sample) {
    console.log(`  - ${source.canonicalUrl}`);
    const result = await smokeTestOne(source, client).catch((err) => ({
      canonicalUrl: source.canonicalUrl,
      ok: false,
      stage: 'unhandled',
      detail: err.message,
    }));
    results.push(result);
    console.log(`    ok=${result.ok} ${JSON.stringify(result.variants ?? result.detail)}`);
  }

  console.log('\nSummary:');
  console.log(JSON.stringify(results, null, 1));
  const allOk = results.every((r) => r.ok);
  console.log(allOk ? '\nSMOKE TEST PASSED' : '\nSMOKE TEST FAILED');
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
