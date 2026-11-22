// Fetch, decode and GPU-upload lifecycle for resolved page plans
// (BRIEF-renderer-pilot.md build step 2: "Preparation at round start").
// Everything here runs once, at round start, during the clue dwell; nothing
// it does is re-invoked by a zoom/pan input (src/globe/page-render.js only
// ever reads what this module already made resident).
import * as THREE from 'three';
import { createPageCache } from './page-cache.js';
import { traceMark, traceSpanStart, traceSpanEnd } from './zoom-trace.js';
import { PAGE_RESIDENCY_CAP_BYTES, PAGE_TEXTURE_CAP } from './page-plan.js';

const cache = createPageCache({ maxTextures: PAGE_TEXTURE_CAP, maxBytes: PAGE_RESIDENCY_CAP_BYTES });
const resident = new Map(); // key -> { texture, bitmap, bytes, width, height }

function disposeResident(key) {
  const entry = resident.get(key);
  if (!entry) return;
  entry.texture.dispose();
  resident.delete(key);
}

async function fetchFirstAvailable(urls) {
  let lastStatus;
  for (const url of urls) {
    const res = await fetch(url);
    if (res.ok) return res;
    lastStatus = res.status;
  }
  throw new Error(`${urls.join(', ')}: ${lastStatus}`);
}

async function fetchDecodeUpload(asset) {
  if (resident.has(asset.key)) return resident.get(asset.key);
  const fetchSpan = traceSpanStart('tile-fetch', { src: asset.key, pool: 'pages' });
  const res = await fetchFirstAvailable(asset.urls);
  const blob = await res.blob();
  traceMark('tile-body-complete', { src: asset.key, bytes: blob.size, pool: 'pages' });
  traceSpanEnd(fetchSpan, { bytes: blob.size });

  const decodeSpan = traceSpanStart('decode', { src: asset.key, bytes: blob.size, pool: 'pages' });
  const bitmap = await createImageBitmap(blob);
  traceSpanEnd(decodeSpan, {});

  const uploadSpan = traceSpanStart('upload-submit', { src: asset.key, pool: 'pages' });
  const texture = new THREE.Texture(bitmap);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  traceSpanEnd(uploadSpan, {});

  const entry = { texture, bitmap, bytes: blob.size, width: bitmap.width, height: bitmap.height };
  resident.set(asset.key, entry);
  return entry;
}

// Fetches, decodes and GPU-uploads every asset in `plan` (z9 + z7 + z5),
// pins them to `token` so the cache's LRU never evicts the active round's
// own plan, then evicts whatever the resulting eviction pass names.
// Resolves once every asset is GPU-resident: zero fetch/decode/upload is
// required for this plan's footprint after this promise settles.
export async function prepareRoundPages(plan, token) {
  const allAssets = [...plan.z9, ...plan.z7, ...plan.z5.assets];
  const prepSpan = traceSpanStart('page-prep', { textureCount: plan.textureCount, residencyBytes: plan.residencyBytes, transferBytes: plan.transferBytes });
  traceMark('page-plan', {
    textureCount: plan.textureCount, residencyBytes: plan.residencyBytes, transferBytes: plan.transferBytes,
    fit: plan.fit, z5Mode: plan.z5.mode, z5Pair: plan.z5.pair ?? null,
  });
  const entries = await Promise.all(allAssets.map(fetchDecodeUpload));
  for (let i = 0; i < allAssets.length; i++) cache.touch(allAssets[i].key, entries[i].bytes);
  cache.pin(token, allAssets.map((a) => a.key));
  for (const key of cache.evict()) disposeResident(key);
  traceSpanEnd(prepSpan, { residentTextures: cache.textureCount, residentBytes: cache.bytesUsed });
  return { byKey: new Map(allAssets.map((a, i) => [a.key, entries[i]])) };
}

export function releaseRoundPages(token) {
  cache.unpin(token);
  for (const key of cache.evict()) disposeResident(key);
}

export function getResidentAsset(key) { return resident.get(key); }

export function pageCacheStats() { return { textureCount: cache.textureCount, bytesUsed: cache.bytesUsed }; }
