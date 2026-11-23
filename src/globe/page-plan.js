// Page-based inset window plan resolution (BRIEF-renderer-pilot.md).
// Pure, dependency-free module: no DOM, no network, no THREE. Given a round
// location and a manifest index (loaded elsewhere), resolves which z9/z7/z5
// page assets the Stage 2 design calls for, with the feasibility-report
// strip substitution for the two windows that needed it (madrid, ordinary
// land), and accounts the plan's transfer and residency bytes against the
// caps the feasibility report closed against.

export const PAGE_TRANSFER_CAP_BYTES = 3145728; // 3 MiB/round
export const PAGE_RESIDENCY_CAP_BYTES = 67108864; // 64 MiB
export const PAGE_TEXTURE_CAP = 40;

// z9 pages are 2x2 source tiles (516 px incl. 2px gutter each side); z7/z5
// context pages are 4x4 source tiles (1028 px); the madrid/ordinary-land z5
// strips are 4x2 source tiles (1028x516 px). docs/zoom-stage2-evidence/feasibility-report.md.
const Z9_PAGE_TILES = 2;
const CONTEXT_PAGE_TILES = 4;

export function pagesEnabled() {
  // Pages are opt-in (?pages=1) again as of 2026-11-22: the brief default
  // flip exposed known discolored deep-zoom source tiles (the red Iberia
  // page Sean screenshotted) to every player. Pages stay opt-in until the
  // discoloration fixes (woe-satmap-zfill list, step 3 windows) land and
  // Sean re-approves the flip.
  try { return new URLSearchParams(location.search).get('pages') === '1'; }
  catch { return false; }
}

export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

export function tileToLon(x, z) { return (x / 2 ** z) * 360 - 180; }
export function tileToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// Full RGBA8 mip chain byte size for a w x h texture, matching the formula
// verified against the feasibility report's 1,419,688 / 5,635,496 / 2,828,544
// byte figures: sum 4 * w_l * h_l for every mip level down to and including 1x1.
export function mipChainBytes(w, h) {
  let total = 0;
  let cw = w;
  let ch = h;
  for (;;) {
    total += 4 * Math.max(1, cw) * Math.max(1, ch);
    if (cw <= 1 && ch <= 1) break;
    cw = Math.max(1, Math.floor(cw / 2));
    ch = Math.max(1, Math.floor(ch / 2));
  }
  return total;
}

// Every page key (z9 at a 2-tile divisor, z7/z5 context at a 4-tile divisor)
// is a page-grid index, not a native tile coordinate: verified against
// docs/zoom-stage2-evidence/revision-manifest.jsonl, where adjacent keys'
// bounds are contiguous rather than overlapping.
function pageGridKeysForTileRect(z, pageTiles, tx0, tx1, ty0, ty1) {
  const px0 = Math.floor(tx0 / pageTiles);
  const px1 = Math.floor(tx1 / pageTiles);
  const py0 = Math.floor(ty0 / pageTiles);
  const py1 = Math.floor(ty1 / pageTiles);
  const keys = [];
  for (let py = py0; py <= py1; py++) {
    for (let px = px0; px <= px1; px++) keys.push(`${z}/${px}/${py}`);
  }
  return keys;
}

// The z9 footprint, margin included: portrait uses 7 wide x8 tall z9 tiles,
// landscape 8 wide x7 tall, centered on the target tile and sized to the
// staged pilot coverage (docs/zoom-stage2-evidence/revision-manifest.jsonl
// only carries pages for specific reference windows, so the chosen size is
// bounded by what Madrid/ordinary-land/Tokyo/Congo actually staged, not the
// larger phone-footprint margins measured in feasibility-report.md).
export function z9FootprintTiles(lat, lng, portrait) {
  const { x, y } = lonLatToTile(lng, lat, 9);
  const width = portrait ? 7 : 8;
  const height = portrait ? 8 : 7;
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  const tx0 = x - halfW;
  const tx1 = tx0 + width - 1;
  const ty0 = y - halfH;
  const ty1 = ty0 + height - 1;
  return { tx0, tx1, ty0, ty1 };
}

function geoBoundsForTileRect(z, tx0, tx1, ty0, ty1) {
  return {
    west: tileToLon(tx0, z),
    east: tileToLon(tx1 + 1, z),
    north: tileToLat(ty0, z),
    south: tileToLat(ty1 + 1, z),
  };
}

function contextKeysForBounds(z, bounds) {
  const nw = lonLatToTile(bounds.west, bounds.north, z);
  const se = lonLatToTile(bounds.east - 1e-9, bounds.south + 1e-9, z);
  return pageGridKeysForTileRect(z, CONTEXT_PAGE_TILES, nw.x, se.x, nw.y, se.y);
}

const MADRID_Z5_KEYS = ['5/3/2', '5/3/3'];
const ORDINARY_LAND_Z5_KEYS = ['5/1/2', '5/1/3'];

function sameKeySet(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

// 'M', 'L', or null: whether a resolved z5 context key set is one of the two
// windows the feasibility report closed with a strip substitution instead of
// the regular 4x4 context page.
export function z5SubstitutionFor(z5Keys) {
  if (sameKeySet(z5Keys, MADRID_Z5_KEYS)) return 'M';
  if (sameKeySet(z5Keys, ORDINARY_LAND_Z5_KEYS)) return 'L';
  return null;
}

// urlBases is ordered: the asset may actually be staged under any one of
// them (the clone's context pages split across assets/pages-pilot/pilot/,
// the original Stage 2 pages, and assets/pages-pilot/revision/, the 5 pages
// cut new for the revision - see PILOT-REPORT.md "known limits"), so the
// store tries each in order and uses whichever answers.
function lookupAsset(manifestIndex, key, urlBases) {
  const rec = manifestIndex.get(key);
  if (!rec || rec.exists === false) return null;
  const [z, x, y] = key.split('/');
  return { key, bytes: rec.bytes, width: rec.width, height: rec.height, bounds: rec.bounds, urls: urlBases.map((base) => `${base}/${z}/${x}/${y}.jpg`) };
}

function lookupStrip(feasibilityIndex, key, urlBase) {
  const rec = feasibilityIndex.get(key);
  if (!rec) return null;
  return { key, bytes: rec.bytes, width: rec.width, height: rec.height, bounds: rec.bounds, urls: [`${urlBase}/${key}.jpg`] };
}

// Resolves the Stage 2 plan for a round location, or reports why it falls
// outside the staged pilot coverage so the caller falls back to the existing
// tile path. manifestIndex: Map<"z/x/y", {bytes,width,height,exists}> built
// from revision-manifest.jsonl. feasibilityIndex: Map<stripKey, {...}> built
// from the feasibility manifest.json "strips" array.
export function resolvePlan({ lat, lng, portrait, manifestIndex, feasibilityIndex, feasibilityPairs, z9UrlBase, contextUrlBases, feasibilityUrlBase }) {
  const { tx0, tx1, ty0, ty1 } = z9FootprintTiles(lat, lng, portrait);
  const z9Keys = pageGridKeysForTileRect(9, Z9_PAGE_TILES, tx0, tx1, ty0, ty1);
  const z9Bounds = geoBoundsForTileRect(9, tx0, tx1, ty0, ty1);
  const z7Keys = contextKeysForBounds(7, z9Bounds);
  const z5Keys = contextKeysForBounds(5, z9Bounds);

  const z9Assets = [];
  for (const key of z9Keys) {
    const asset = lookupAsset(manifestIndex, key, [z9UrlBase]);
    if (!asset) return { inCoverage: false, reason: 'z9-gap', key };
    z9Assets.push(asset);
  }
  const z7Assets = [];
  for (const key of z7Keys) {
    const asset = lookupAsset(manifestIndex, key, contextUrlBases);
    if (!asset) return { inCoverage: false, reason: 'z7-gap', key };
    z7Assets.push(asset);
  }

  const substitution = z5SubstitutionFor(z5Keys);
  let z5;
  if (substitution) {
    const pairKeys = feasibilityPairs[substitution];
    const assets = [];
    for (const key of pairKeys) {
      const asset = lookupStrip(feasibilityIndex, key, feasibilityUrlBase);
      if (!asset) return { inCoverage: false, reason: 'strip-gap', key };
      assets.push(asset);
    }
    z5 = { mode: 'strip', pair: substitution, assets };
  } else {
    const assets = [];
    for (const key of z5Keys) {
      const asset = lookupAsset(manifestIndex, key, contextUrlBases);
      if (!asset) return { inCoverage: false, reason: 'z5-gap', key };
      assets.push(asset);
    }
    z5 = { mode: 'page', assets };
  }

  const allAssets = [...z9Assets, ...z7Assets, ...z5.assets];
  const transferBytes = allAssets.reduce((sum, a) => sum + a.bytes, 0);
  const residencyBytes = allAssets.reduce((sum, a) => sum + mipChainBytes(a.width, a.height), 0);
  const textureCount = allAssets.length;

  const fit = {
    transfer: transferBytes <= PAGE_TRANSFER_CAP_BYTES,
    residency: residencyBytes <= PAGE_RESIDENCY_CAP_BYTES,
    textures: textureCount <= PAGE_TEXTURE_CAP,
  };
  fit.all = fit.transfer && fit.residency && fit.textures;

  return {
    inCoverage: true,
    bounds: z9Bounds,
    z9: z9Assets,
    z7: z7Assets,
    z5,
    transferBytes,
    residencyBytes,
    textureCount,
    fit,
  };
}

// For the flag-off / out-of-coverage caller: never does plan work when the
// flag itself is off, so the baseline pays zero extra cost (BRIEF-renderer-pilot.md
// "whenever ?pages=1 is absent: the existing tile path, behavior unchanged").
export function selectRenderPath({ lat, lng, portrait, manifestIndex, feasibilityIndex, feasibilityPairs, z9UrlBase, contextUrlBases, feasibilityUrlBase, flagOn }) {
  if (!flagOn) return { path: 'tiles', reason: 'flag-off' };
  const result = resolvePlan({ lat, lng, portrait, manifestIndex, feasibilityIndex, feasibilityPairs, z9UrlBase, contextUrlBases, feasibilityUrlBase });
  if (!result.inCoverage) return { path: 'tiles', reason: result.reason, key: result.key };
  // BRIEF-page-lifecycle.md requirement 3: an over-cap plan takes the
  // explicit supported path without partially entering pages, the same as
  // an out-of-coverage gap.
  if (!result.fit.all) return { path: 'tiles', reason: 'over-cap', fit: result.fit };
  return { path: 'pages', plan: result };
}
