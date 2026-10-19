// ---------------------------------------------------------------------------
// Country outlines (refactor Phase 5): the answer country's border on every
// reveal and the Borders hit test. initOutlines() starts the lazy load at the
// spot it always started.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { DEG } from '../core/config.js';
import { clamp, distanceKm } from '../core/math.js';
import { state } from '../core/state.js';
import { ANSWER_COLOR, latLngToVec3, globe, projectToScreen } from './scene.js';
import { MIN_ISLAND, ringExtent, outlineMeshes, LOAD, loadJSON, criticalBytesP } from './surface.js';

// ---------------------------------------------------------------------------
// Country outlines (docs/country-outlines-plan-opus.md): the answer country's
// border on every reveal, and the tap geometry for Borders mode. Only the
// answer's border is ever drawn, never a second country's (Sean's rule).
// country-outlines.topo.json (build/make-country-outlines.mjs) holds 261 Natural
// Earth units; topo.keys maps each game key to its units, topo.cut lists the
// antimeridian seam arcs (hit-test only, never stroked). Lazy: fetched at low
// priority once the critical bytes are in, decoded on idle, in no load phase.
// ---------------------------------------------------------------------------
export const whenIdle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 0));
export let countryData = null; // { arcs, cut, units, keys, keyOf }
export let countryBands = null; // { key: band 1-10 }, build/make-country-bands.py
export const countryGeoms = new Map();
// United States scope (Blackout only): assets/us-states.topo.json, decoded
// through the same decodeCountries() path into its own structure. Never
// merged into countryData: the Passport's countryIndex/countryBands must
// never see state keys ('US-CA' style). geomFor()/bordersHit() below resolve
// a key against countryData first, then stateData, so the shared borders
// machinery works on either without forking.
export let stateData = null; // { arcs, cut, units, keys, keyOf }
export const stateGeoms = new Map();

export function decodeCountries(topo) {
  const { scale, translate } = topo.transform;
  const k = 1 / scale[0];
  const tx = Math.round(translate[0] * k);
  const ty = Math.round(translate[1] * k);
  const arcs = topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => [((x += dx) + tx) / k, ((y += dy) + ty) / k]);
  });
  const keyOf = new Map();
  for (const [key, ids] of Object.entries(topo.keys)) for (const id of ids) keyOf.set(id, key);
  const units = topo.objects.data.geometries.map((g) => {
    const polys = (g.type === 'Polygon' ? [g.arcs] : g.arcs).map((poly) => poly.map((refs) => {
      const pts = [];
      for (const i of refs) {
        const arc = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
        for (let j = pts.length ? 1 : 0; j < arc.length; j++) pts.push(arc[j]);
      }
      return { refs, pts, box: ringBox(pts), ext: ringExtent(pts) };
    }));
    return { id: g.id, name: g.properties.name, polys, box: mergeBoxes(polys.map((p) => p[0].box)) };
  });
  return { arcs, cut: new Set(topo.cut), units, keys: topo.keys, keyOf };
}

export function ringBox(pts) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) {
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }
  return b;
}

export function mergeBoxes(boxes) {
  return boxes.reduce((m, b) => [Math.min(m[0], b[0]), Math.min(m[1], b[1]), Math.max(m[2], b[2]), Math.max(m[3], b[3])],
    [Infinity, Infinity, -Infinity, -Infinity]);
}

// A key's dataset: countryData if it resolves there, else stateData. The one
// place that knows about both; everything below reaches either through it,
// so the geometry engine itself (geomFor, countryLines, bordersHit) is never
// duplicated for states.
function dataFor(key) {
  if (countryData && countryData.keys[key]) return countryData;
  if (stateData && stateData.keys[key]) return stateData;
  return null;
}
export const hasKey = (key) => Boolean(dataFor(key));
// A state key's display name ('US-CA' -> 'California'); country keys are
// already names, returned as-is.
export function keyName(key) {
  if (countryData && countryData.keys[key]) return key;
  const geom = countryGeom(key);
  return geom ? geom.units[0].name : key;
}

// A key's merged geometry: its member units' polygons, and the arcs to
// stroke (minus seams, and minus borders between members such as
// Somalia/Somaliland, which appear once in each member).
function geomFor(key, data, cache) {
  let geom = cache.get(key);
  if (geom) return geom;
  const units = data.keys[key].map((id) => data.units.find((u) => u.id === id));
  const uses = new Map();
  for (const u of units) for (const poly of u.polys) for (const r of poly) for (const i of r.refs) {
    const a = i >= 0 ? i : ~i;
    uses.set(a, (uses.get(a) || 0) + 1);
  }
  const rings = units.flatMap((u) => u.polys.flat());
  const box = mergeBoxes(units.map((u) => u.box));
  const diagKm = distanceKm({ lat: box[1], lng: box[0] }, { lat: box[3], lng: box[2] });
  geom = { key, units, rings, box, diagKm, arcs: data.arcs, skip: (a) => data.cut.has(a) || uses.get(a) > 1 };
  cache.set(key, geom);
  return geom;
}
export function countryGeom(key) {
  if (countryData && countryData.keys[key]) return geomFor(key, countryData, countryGeoms);
  if (stateData && stateData.keys[key]) return geomFor(key, stateData, stateGeoms);
  return null;
}

// Stroke polylines for a key. Rings under MIN_ISLAND are skipped like the
// coast's, except near the anchor (the answer, or the tap) and for countries
// that are all small rings (Tuvalu, Nauru), which draw in full.
export function countryLines(geom, anchor) {
  const allSmall = geom.rings.every((r) => r.ext < MIN_ISLAND);
  const near = (b) => anchor && anchor.lng > b[0] - 0.5 && anchor.lng < b[2] + 0.5 && anchor.lat > b[1] - 0.5 && anchor.lat < b[3] + 0.5;
  const lines = [];
  for (const r of geom.rings) {
    if (!allSmall && r.ext < MIN_ISLAND && !near(r.box)) continue;
    let line = null;
    for (const i of r.refs) {
      const a = i >= 0 ? i : ~i;
      if (geom.skip(a)) { line = null; continue; }
      const arc = i >= 0 ? geom.arcs[a] : geom.arcs[a].slice().reverse();
      if (!line) lines.push((line = [arc[0]]));
      for (let j = 1; j < arc.length; j++) line.push(arc[j]);
    }
  }
  return lines;
}

// Soft cyan glow under a crisp core, like the classic coast glow under its
// line, but on its own materials so satellite never hides it (it is not in
// outlineMaterials). depthTest on: Russia's far side must not show through.
// Independent segments overlap at every vertex, which beads a transparent
// line; the stencil lets each layer blend a pixel once.
export const COUNTRY_LAYERS = [
  { color: ANSWER_COLOR, width: 5, opacity: 0.22, ref: 1 },
  { color: '#b9f7ff', width: 1.6, opacity: 1, ref: 2 },
];
export let countryOutline = null; // { group, mats, geom, reveal }
export let countryOutlineWant = null; // { key, anchor, fade } until the data lands

export function buildCountryOutline(lines) {
  const radius = 1.002;
  const pos = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      latLngToVec3(line[i - 1][1], line[i - 1][0], 1, a);
      latLngToVec3(line[i][1], line[i][0], 1, b);
      const steps = Math.max(1, Math.ceil(a.angleTo(b) / (1.2 * DEG)));
      p.copy(a).multiplyScalar(radius);
      for (let k = 1; k <= steps; k++) {
        q.copy(a).lerp(b, k / steps).normalize().multiplyScalar(radius);
        pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
        p.copy(q);
      }
    }
  }
  const geo = new LineSegmentsGeometry();
  geo.setPositions(pos);
  const group = new THREE.Group();
  const mats = COUNTRY_LAYERS.map((layer, i) => {
    const mat = new LineMaterial({
      color: layer.color,
      linewidth: layer.width,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: layer.ref,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
    });
    mat.resolution.set(state.viewW, state.viewH);
    mat.userData.baseOpacity = layer.opacity;
    const mesh = new LineSegments2(geo, mat);
    mesh.renderOrder = 5;
    mesh.userData.radius = radius;
    outlineMeshes.push(mesh);
    group.add(mesh);
    return mat;
  });
  return { group, mats, geo };
}

export function placeCountryOutline({ key, anchor, fade }) {
  clearCountryOutline();
  const geom = countryGeom(key);
  if (!geom) return;
  const built = buildCountryOutline(countryLines(geom, anchor));
  countryOutline = { ...built, geom, reveal: fade ? 0 : 1 };
  globe.add(built.group);
  updateCountryOutline(0);
}

// Show the answer country's outline: fading in on the 1.1 s outline clock, or
// at once for a static or restored reveal. Before the data lands the reveal
// plays without it, and it fades in when it arrives.
export function showCountryOutline(key, anchor, fade) {
  countryOutlineWant = { key, anchor: anchor && { lat: anchor.lat, lng: anchor.lng }, fade };
  if (countryData) placeCountryOutline(countryOutlineWant);
}

// The answer's state outline, drawn in addition to its country outline
// (Sean, 2026-10-18). Same machinery, second slot; only US city answers
// carry a state key (see regionKey), so landmarks never reveal one.
export let regionOutline = null;
export let regionOutlineWant = null;

export function placeRegionOutline({ key, anchor, fade }) {
  clearRegionOutline();
  const geom = countryGeom(key);
  if (!geom) return;
  const built = buildCountryOutline(countryLines(geom, anchor));
  regionOutline = { ...built, geom, reveal: fade ? 0 : 1 };
  globe.add(built.group);
  updateCountryOutline(0);
}

export function showRegionOutline(key, anchor, fade) {
  regionOutlineWant = { key, anchor: anchor && { lat: anchor.lat, lng: anchor.lng }, fade };
  if (stateData) placeRegionOutline(regionOutlineWant);
}

export function clearRegionOutline() {
  regionOutlineWant = null;
  if (!regionOutline) return;
  globe.remove(regionOutline.group);
  for (const mesh of regionOutline.group.children) outlineMeshes.splice(outlineMeshes.indexOf(mesh), 1);
  regionOutline.geo.dispose();
  regionOutline.mats.forEach((m) => m.dispose());
  regionOutline = null;
}

export function clearCountryOutline() {
  countryOutlineWant = null;
  if (!countryOutline) return;
  globe.remove(countryOutline.group);
  for (const mesh of countryOutline.group.children) outlineMeshes.splice(outlineMeshes.indexOf(mesh), 1);
  countryOutline.geo.dispose();
  countryOutline.mats.forEach((m) => m.dispose());
  countryOutline = null;
}

export const _cornerA = new THREE.Vector3();
export const _cornerB = new THREE.Vector3();
function updateOneOutline(o, dt) {
  if (!o) return;
  if (o.reveal < 1) o.reveal = Math.min(1, o.reveal + dt / 1.1);
  const ease = 1 - Math.pow(1 - o.reveal, 3);
  o.mats.forEach((m) => { m.opacity = ease * m.userData.baseOpacity; });
  // Under 12 css px across, an outline is a squiggle under the pin: hide it.
  // Only small countries can get there (2,000 km spans 29 px at the widest framing).
  if (o.geom.diagKm < 2000) {
    const b = o.geom.box;
    const pa = projectToScreen(latLngToVec3(b[1], b[0], 1, _cornerA), _cornerA);
    const pb = projectToScreen(latLngToVec3(b[3], b[2], 1, _cornerB), _cornerB);
    o.group.visible = Math.hypot(pa.x - pb.x, pa.y - pb.y) >= 12;
  }
}
export function updateCountryOutline(dt) {
  updateOneOutline(countryOutline, dt);
  updateOneOutline(regionOutline, dt);
}

export let countriesP;
export let countryBandsP;
export let statesP;
export let landAreas = null;
export let landAreasP;

export function initOutlines() {
  countriesP = criticalBytesP
    .then(() => loadJSON(LOAD.countries, { priority: 'low' }))
    .then((topo) => new Promise((resolve) => whenIdle(() => resolve(decodeCountries(topo)))))
    .then((data) => {
      countryData = data;
      if (countryOutlineWant) placeCountryOutline({ ...countryOutlineWant, fade: true });
      if (regionOutlineWant && stateData) placeRegionOutline({ ...regionOutlineWant, fade: true });
    });
  countriesP.catch((err) => console.error('[outlines] failed to load', err));
  countryBandsP = criticalBytesP
    .then(() => loadJSON(LOAD.countryBands, { priority: 'low' }))
    .then((data) => { countryBands = data.bands; });
  countryBandsP.catch((err) => console.error('[outlines] failed to load bands', err));
  // Blackout's United States scope, same lazy path as countriesP.
  statesP = criticalBytesP
    .then(() => loadJSON(LOAD.states, { priority: 'low' }))
    .then((topo) => new Promise((resolve) => whenIdle(() => resolve(decodeCountries(topo)))))
    .then((data) => {
      stateData = data;
      if (regionOutlineWant) placeRegionOutline({ ...regionOutlineWant, fade: true });
    });
  statesP.catch((err) => console.error('[outlines] failed to load states', err));
  landAreasP = criticalBytesP
    .then(() => loadJSON(LOAD.landAreas, { priority: 'low' }))
    .then((data) => { landAreas = data; });
  landAreasP.catch((err) => console.error('[outlines] failed to load land areas', err));
}

// Borders mode hit test (plan §3.2), on the game key's merged units.
export function pointInRing(lng, lat, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const inBox = (b, lng, lat, pad = 0) => lng >= b[0] - pad && lng <= b[2] + pad && lat >= b[1] - pad && lat <= b[3] + pad;

export function inUnit(u, lng, lat) {
  if (!inBox(u.box, lng, lat)) return false;
  return u.polys.some((poly) => inBox(poly[0].box, lng, lat) && pointInRing(lng, lat, poly[0].pts)
    && !poly.slice(1).some((hole) => pointInRing(lng, lat, hole.pts)));
}

// Nearest point of the key's border to p, great-circle km. With maxKm, rings
// whose box (padded by maxKm) misses p are skipped.
export function nearestBorder(geom, p, maxKm = Infinity) {
  const pad = Number.isFinite(maxKm) ? maxKm / (111.32 * Math.max(0.05, Math.cos(p.lat * DEG))) : 0;
  const c = Math.cos(p.lat * DEG);
  const wrap = (d) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);
  let best = { km: Infinity, lat: 0, lng: 0 };
  for (const r of geom.rings) {
    if (pad && !inBox(r.box, p.lng, p.lat, pad)) continue;
    const { pts } = r;
    for (let i = 1; i < pts.length; i++) {
      // closest point on the segment in a local equirectangular frame around p
      const ax = wrap(pts[i - 1][0] - p.lng) * c, ay = pts[i - 1][1] - p.lat;
      const bx = wrap(pts[i][0] - p.lng) * c, by = pts[i][1] - p.lat;
      const dx = bx - ax, dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len ? clamp(-(ax * dx + ay * dy) / len, 0, 1) : 0;
      const q = { lat: p.lat + ay + dy * t, lng: p.lng + (ax + dx * t) / c };
      const km = distanceKm(p, q);
      if (km < best.km) best = { km, lat: q.lat, lng: q.lng };
    }
  }
  return best;
}

export const SMALL_TARGET_KM = 30;
// Enclave allowance, not a general tap grace.
const ENCLAVE_ALLOWANCE_KM = 50;
// -> { hit, near: nearest border point, km to it, tapped: unit name or null (ocean) }
export function bordersHit(key, p, tolKm) {
  const data = dataFor(key);
  const geom = countryGeom(key);
  const own = geom.units.find((u) => inUnit(u, p.lng, p.lat));
  if (own) return { hit: true, km: 0, near: null, ring: ringAt(geom, p), tapped: null };
  const near = nearestBorder(geom, p);
  const hit = { hit: true, km: near.km, near, ring: null, tapped: null };
  const other = data.units.find((u) => !geom.units.includes(u) && inUnit(u, p.lng, p.lat));
  if (other) {
    if (geom.diagKm < SMALL_TARGET_KM && near.km <= ENCLAVE_ALLOWANCE_KM) return hit;
    const key2 = data.keyOf.get(other.id);
    const tapped = !key2 || key2 === other.name ? other.name : `${other.name} (${key2})`;
    return { hit: false, km: near.km, near, tapped };
  }
  if (near.km <= tolKm) return hit; // coast, atoll, or a sliver lost to simplification
  return { hit: false, km: near.km, near, tapped: null };
}

export function ringAt(geom, p) {
  return geom.rings.find((r) => inBox(r.box, p.lng, p.lat) && pointInRing(p.lng, p.lat, r.pts)) || null;
}
