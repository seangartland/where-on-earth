// Loads the staged page manifests (BRIEF-renderer-pilot.md "Assets staged in
// this clone") into the lookup structures src/globe/page-plan.js resolves
// plans against. Browser-only (fetch); not unit tested for that reason, the
// same convention as the existing tile loaders in surface.js. Fetched once
// and cached for the session.

// z9 pages (the 2x2 recut) are staged only under revision/. Context pages
// (z7/z5) are split: most are the original Stage 2 pages under pilot/, but
// 5 z7 pages were cut new for the revision and live under revision/ instead
// (verified against the actual staged files: assets/pages-pilot/pilot/7/17/15.jpg
// does not exist, assets/pages-pilot/revision/7/17/15.jpg does) - try pilot/
// first since that covers 19 of 24 z7 keys and all 13 z5 keys.
const Z9_URL_BASE = '/assets/pages-pilot/revision';
const CONTEXT_URL_BASES = ['/assets/pages-pilot/pilot', '/assets/pages-pilot/revision'];
const FEASIBILITY_URL_BASE = '/assets/pages-pilot/feasibility';
// Runtime copy lives under assets/ because the deploy does not publish
// docs/ (Sean's first phone trace, 2026-11-21: this fetch 404'd in
// production and every round fell back to tiles). The evidence record
// stays at docs/zoom-stage2-evidence/revision-manifest.jsonl; keep the
// two in sync if the manifest is ever regenerated.
const REVISION_MANIFEST_URL = '/assets/pages-pilot/revision-manifest.jsonl';
const FEASIBILITY_MANIFEST_URL = '/assets/pages-pilot/feasibility/manifest.json';

let cached = null;

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.text();
}

export async function loadPageManifests() {
  if (cached) return cached;
  cached = (async () => {
    const [revisionText, feasibilityText] = await Promise.all([
      fetchText(REVISION_MANIFEST_URL),
      fetchText(FEASIBILITY_MANIFEST_URL),
    ]);
    const manifestIndex = new Map();
    for (const line of revisionText.trim().split('\n')) {
      if (!line) continue;
      const rec = JSON.parse(line);
      manifestIndex.set(rec.key, { bytes: rec.bytes, width: rec.width, height: rec.height, bounds: rec.bounds, exists: true });
    }
    const feasibility = JSON.parse(feasibilityText);
    const feasibilityIndex = new Map();
    for (const strip of feasibility.strips) {
      feasibilityIndex.set(strip.key, { bytes: strip.bytes, width: strip.width, height: strip.height, bounds: strip.bounds });
    }
    const feasibilityPairs = { M: feasibility.pairs.M.keys, L: feasibility.pairs.L.keys };
    return {
      manifestIndex, feasibilityIndex, feasibilityPairs,
      z9UrlBase: Z9_URL_BASE, contextUrlBases: CONTEXT_URL_BASES, feasibilityUrlBase: FEASIBILITY_URL_BASE,
    };
  })();
  return cached;
}
