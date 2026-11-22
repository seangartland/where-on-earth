// Renders a resolved, fully-prepared page plan on the sphere, swapping
// between the z9/z7/z5 levels purely by toggling which already-built mesh
// group is visible: no fetch, decode or texture upload happens from this
// module, ever (BRIEF-renderer-pilot.md build step 3: "Zoom behavior inside
// coverage: level changes consume prepared pages only").
//
// Known pilot simplification (see PILOT-REPORT.md "known limits"): each page
// is a small curved quad mesh sampling its own individual texture, added as
// a child of `globe` so it inherits the camera/rotation math for free. This
// is not the shared-shader, mip-crossfading sphere patch system the full
// design (docs/zoom-diagnosis-astra.md §4.2) describes; it proves the
// prepare-before-input latency hypothesis without that larger rewrite.
import * as THREE from 'three';
import { latLngToVec3, globe } from './scene.js';
import { state } from '../core/state.js';
import { FOV, DEG } from '../core/config.js';
import { pagesEnabled, selectRenderPath } from './page-plan.js';
import { loadPageManifests } from './page-manifest.js';
import { prepareRoundPages, releaseRoundPages, getResidentAsset } from './page-store.js';
import { traceMark, traceSpanStart, traceSpanEnd } from './zoom-trace.js';
import { INSET_MIN_Z, INSET_Q, sampleInsetView } from './surface.js';

const GUTTER_PX = 2;
const SEGMENTS = 4;
const SURFACE_R = 1.0015; // just outside the base globe sphere (radius 1)

let activeRound = null; // { token, plan, groupsByLevel: {9,7,5}, currentLevel }
let roundToken = 0;

export function pageRenderActive() {
  return !!activeRound;
}

function buildPageMesh(asset) {
  const texEntry = getResidentAsset(asset.key);
  if (!texEntry) return null;
  const { width, height } = texEntry;
  const u0 = GUTTER_PX / width;
  const u1 = (width - GUTTER_PX) / width;
  const v0 = GUTTER_PX / height;
  const v1 = (height - GUTTER_PX) / height;
  const { north, south, east, west } = asset.bounds;
  const n = SEGMENTS + 1;
  const positions = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  const p = new THREE.Vector3();
  for (let j = 0; j < n; j++) {
    const tLat = north + ((south - north) * j) / SEGMENTS; // row 0 = north
    for (let i = 0; i < n; i++) {
      const tLng = west + ((east - west) * i) / SEGMENTS;
      latLngToVec3(tLat, tLng, SURFACE_R, p);
      const idx = j * n + i;
      positions[idx * 3] = p.x; positions[idx * 3 + 1] = p.y; positions[idx * 3 + 2] = p.z;
      uvs[idx * 2] = u0 + ((u1 - u0) * i) / SEGMENTS;
      uvs[idx * 2 + 1] = v1 - ((v1 - v0) * j) / SEGMENTS; // row 0 (north) -> v1
    }
  }
  const indices = [];
  for (let j = 0; j < SEGMENTS; j++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({ map: texEntry.texture, depthTest: true, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 10;
  mesh.visible = false;
  return mesh;
}

function disposeGroup(group) {
  if (!group) return;
  for (const mesh of group) {
    globe.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose(); // the shared page texture itself is page-store's, not disposed here
  }
}

export function releasePageRound() {
  if (!activeRound) return;
  for (const level of [9, 7, 5]) disposeGroup(activeRound.groupsByLevel[level]);
  releaseRoundPages(activeRound.token);
  activeRound = null;
}

function levelAssets(plan, level) {
  if (level === 9) return plan.z9;
  if (level === 7) return plan.z7;
  return plan.z5.assets;
}

export async function preparePageRound(item) {
  if (!pagesEnabled()) { releasePageRound(); return; }
  const hasCoords = !!item && Number.isFinite(item.lat) && Number.isFinite(item.lng);
  if (!hasCoords) { releasePageRound(); traceMark('page-round', { path: 'tiles', reason: 'no-coords' }); return; }

  releasePageRound();
  const token = ++roundToken;
  const portrait = (typeof innerHeight === 'number' ? innerHeight : 1) >= (typeof innerWidth === 'number' ? innerWidth : 0);

  let manifests;
  try { manifests = await loadPageManifests(); }
  catch (err) { traceMark('page-round', { path: 'tiles', reason: 'manifest-load-failed', error: String(err) }); return; }
  if (token !== roundToken) return; // superseded by a newer round before the manifest landed

  const result = selectRenderPath({
    lat: item.lat, lng: item.lng, portrait,
    manifestIndex: manifests.manifestIndex, feasibilityIndex: manifests.feasibilityIndex,
    feasibilityPairs: manifests.feasibilityPairs, z9UrlBase: manifests.z9UrlBase,
    contextUrlBases: manifests.contextUrlBases, feasibilityUrlBase: manifests.feasibilityUrlBase, flagOn: true,
  });
  traceMark('page-round', { path: result.path, reason: result.reason ?? null, lat: item.lat, lng: item.lng, portrait });
  if (result.path !== 'pages') return; // outside pilot coverage: the existing tile path handles this round

  try {
    await prepareRoundPages(result.plan, token);
  } catch (err) {
    // A manifest-listed asset that 404s in practice: fall back to the tile
    // path for this round rather than leaving guessing blocked.
    traceMark('page-round', { path: 'tiles', reason: 'prepare-failed', error: String(err) });
    releaseRoundPages(token);
    return;
  }
  if (token !== roundToken) { releaseRoundPages(token); return; } // superseded mid-prepare

  const groupsByLevel = {};
  for (const level of [9, 7, 5]) {
    groupsByLevel[level] = levelAssets(result.plan, level)
      .map(buildPageMesh)
      .filter(Boolean);
    for (const mesh of groupsByLevel[level]) globe.add(mesh);
  }
  activeRound = { token, plan: result.plan, groupsByLevel, currentLevel: null, firstLevelSelected: false };
}

// Same desired-zoom formula pickInsetWindow uses (surface.js), restricted to
// the pilot's z5/z7/z9 ladder (no z8) and with no fetch path behind it: this
// only ever picks among groups preparePageRound already built.
function desiredLevel() {
  const view = sampleInsetView();
  if (!view) return null;
  const effDist = state.targetDist && state.targetDist < state.dist ? state.targetDist : state.dist;
  const mpp = ((effDist - 1) * 6371000 * 2 * Math.tan((FOV / 2) * DEG)) / state.viewH;
  const z = Math.ceil(Math.log2((156543.03 * Math.cos(view.lat)) / (mpp * INSET_Q)));
  if (z < INSET_MIN_Z) return null;
  if (z >= 9) return 9;
  if (z >= 7) return 7;
  if (z >= 5) return 5;
  return null;
}

export function updatePageRender() {
  if (!activeRound) return;
  const level = desiredLevel();
  if (level === activeRound.currentLevel) return;
  const span = traceSpanStart('page-level-select', { from: activeRound.currentLevel, to: level });
  if (activeRound.currentLevel != null) {
    for (const mesh of activeRound.groupsByLevel[activeRound.currentLevel]) mesh.visible = false;
  }
  if (level != null) {
    for (const mesh of activeRound.groupsByLevel[level]) mesh.visible = true;
  }
  activeRound.currentLevel = level;
  traceSpanEnd(span, { servingPath: 'pages' });
}
