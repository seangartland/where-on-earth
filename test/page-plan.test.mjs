import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolvePlan, selectRenderPath, mipChainBytes, z5SubstitutionFor,
  PAGE_TRANSFER_CAP_BYTES, PAGE_RESIDENCY_CAP_BYTES, PAGE_TEXTURE_CAP,
} from '../src/globe/page-plan.js';

function buildManifestIndex() {
  const lines = readFileSync(new URL('../docs/zoom-stage2-evidence/revision-manifest.jsonl', import.meta.url), 'utf8').trim().split('\n');
  const index = new Map();
  for (const line of lines) {
    const rec = JSON.parse(line);
    index.set(rec.key, { bytes: rec.bytes, width: rec.width, height: rec.height, exists: true });
  }
  return index;
}

function buildFeasibility() {
  const manifest = JSON.parse(readFileSync(new URL('../assets/pages-pilot/feasibility/manifest.json', import.meta.url), 'utf8'));
  const index = new Map();
  for (const strip of manifest.strips) index.set(strip.key, { bytes: strip.bytes, width: strip.width, height: strip.height });
  return { feasibilityIndex: index, feasibilityPairs: { M: manifest.pairs.M.keys, L: manifest.pairs.L.keys } };
}

const manifestIndex = buildManifestIndex();
const { feasibilityIndex, feasibilityPairs } = buildFeasibility();
const z9UrlBase = '/assets/pages-pilot/revision';
const contextUrlBases = ['/assets/pages-pilot/pilot', '/assets/pages-pilot/revision'];
const feasibilityUrlBase = '/assets/pages-pilot/feasibility';

function plan(lat, lng, portrait) {
  return resolvePlan({ lat, lng, portrait, manifestIndex, feasibilityIndex, feasibilityPairs, z9UrlBase, contextUrlBases, feasibilityUrlBase });
}

test('mipChainBytes matches the feasibility report figures', () => {
  assert.equal(mipChainBytes(516, 516), 1419688); // z9 2x2 page
  assert.equal(mipChainBytes(1028, 1028), 5635496); // z7/z5 4x4 context page
  assert.equal(mipChainBytes(1028, 516), 2828544); // madrid/ordinary-land z5 strip
});

test('z5SubstitutionFor recognizes exactly the two feasibility-report windows', () => {
  assert.equal(z5SubstitutionFor(['5/3/2', '5/3/3']), 'M');
  assert.equal(z5SubstitutionFor(['5/3/3', '5/3/2']), 'M'); // order independent
  assert.equal(z5SubstitutionFor(['5/1/2', '5/1/3']), 'L');
  assert.equal(z5SubstitutionFor(['5/7/3']), null);
  assert.equal(z5SubstitutionFor(['5/3/2']), null);
});

test('a Madrid window resolves with strip substitution, not 4x4 z5 pages', () => {
  const result = plan(40.4, -3.7, true);
  assert.equal(result.inCoverage, true);
  assert.equal(result.z5.mode, 'strip');
  assert.equal(result.z5.pair, 'M');
  assert.deepEqual(result.z5.assets.map((a) => a.key).sort(), ['madrid-z5-x12-y10-11-v1', 'madrid-z5-x12-y12-13-v1']);
  assert.ok(result.z9.length > 0, 'resolves at least one z9 page');
  assert.ok(result.z7.length > 0, 'resolves at least one z7 context page');
});

test('an ordinary-land window resolves with strip substitution, not 4x4 z5 pages', () => {
  const result = plan(39.37, -97.73, true);
  assert.equal(result.inCoverage, true);
  assert.equal(result.z5.mode, 'strip');
  assert.equal(result.z5.pair, 'L');
  assert.deepEqual(result.z5.assets.map((a) => a.key).sort(), ['ordinary-land-z5-x4-y10-11-v1', 'ordinary-land-z5-x4-y12-13-v1']);
});

test('a window away from the two strip sites keeps the regular 4x4 z5 page', () => {
  const result = plan(35.7, 139.7, true); // tokyo
  assert.equal(result.inCoverage, true);
  assert.equal(result.z5.mode, 'page');
  assert.deepEqual(result.z5.assets.map((a) => a.key), ['5/7/3']);
});

test('residency accounting sums the full mip chain for every resolved asset and checks it against the caps', () => {
  const result = plan(40.4, -3.7, true);
  const expected = [...result.z9, ...result.z7, ...result.z5.assets]
    .reduce((sum, a) => sum + mipChainBytes(a.width, a.height), 0);
  assert.equal(result.residencyBytes, expected);
  assert.equal(result.textureCount, result.z9.length + result.z7.length + result.z5.assets.length);
  assert.equal(result.fit.transfer, result.transferBytes <= PAGE_TRANSFER_CAP_BYTES);
  assert.equal(result.fit.residency, result.residencyBytes <= PAGE_RESIDENCY_CAP_BYTES);
  assert.equal(result.fit.textures, result.textureCount <= PAGE_TEXTURE_CAP);
  assert.equal(result.fit.all, result.fit.transfer && result.fit.residency && result.fit.textures);
  assert.ok(result.fit.all, 'the staged madrid window fits every cap, as the feasibility report closed it');
});

test('fallback selection: a location outside the staged pilot coverage reports the tile path with a reason', () => {
  const result = selectRenderPath({
    lat: -34.6, lng: -58.4, portrait: true, // Buenos Aires: nowhere near a staged site
    manifestIndex, feasibilityIndex, feasibilityPairs, z9UrlBase, contextUrlBases, feasibilityUrlBase, flagOn: true,
  });
  assert.equal(result.path, 'tiles');
  assert.equal(result.reason, 'z9-gap');
});

test('fallback selection: the flag being off never resolves a plan at all', () => {
  const result = selectRenderPath({
    lat: 40.4, lng: -3.7, portrait: true, // a real, in-coverage madrid window
    manifestIndex, feasibilityIndex, feasibilityPairs, z9UrlBase, contextUrlBases, feasibilityUrlBase, flagOn: false,
  });
  assert.equal(result.path, 'tiles');
  assert.equal(result.reason, 'flag-off');
  assert.equal(result.plan, undefined);
});

test('fallback selection: an in-coverage location with the flag on resolves the pages path', () => {
  const result = selectRenderPath({
    lat: 40.4, lng: -3.7, portrait: true,
    manifestIndex, feasibilityIndex, feasibilityPairs, z9UrlBase, contextUrlBases, feasibilityUrlBase, flagOn: true,
  });
  assert.equal(result.path, 'pages');
  assert.equal(result.plan.z5.pair, 'M');
});

// BRIEF-page-lifecycle.md requirement 3: an over-cap plan takes the explicit
// supported path instead of partially entering pages. Fabricate an
// oversized manifest entry (bytes well past PAGE_TRANSFER_CAP_BYTES) at one
// of the Madrid window's own resolved z9 keys (not just any z9 key in the
// manifest - most belong to other staged windows and would leave Madrid's
// own resolved plan untouched) so every other key still resolves normally
// and only the cap decides the outcome.
test('fallback selection: an admitted plan that exceeds a resource cap takes the tile path instead of partially entering pages', () => {
  const oversizedKey = plan(40.4, -3.7, true).z9[0].key;
  const inflated = new Map(manifestIndex);
  const original = inflated.get(oversizedKey);
  inflated.set(oversizedKey, { ...original, bytes: PAGE_TRANSFER_CAP_BYTES + 1 });

  const overCap = selectRenderPath({
    lat: 40.4, lng: -3.7, portrait: true,
    manifestIndex: inflated, feasibilityIndex, feasibilityPairs, z9UrlBase, contextUrlBases, feasibilityUrlBase, flagOn: true,
  });
  assert.equal(overCap.path, 'tiles');
  assert.equal(overCap.reason, 'over-cap');
  assert.equal(overCap.fit.transfer, false);
  assert.equal(overCap.plan, undefined);

  // The unmodified manifest for the same window still admits pages: the cap,
  // not some other change, is what flipped the decision above.
  const admitted = selectRenderPath({
    lat: 40.4, lng: -3.7, portrait: true,
    manifestIndex, feasibilityIndex, feasibilityPairs, z9UrlBase, contextUrlBases, feasibilityUrlBase, flagOn: true,
  });
  assert.equal(admitted.path, 'pages');
});
