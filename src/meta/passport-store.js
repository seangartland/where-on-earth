// ---------------------------------------------------------------------------
// The passport store (refactor Phase 5): every place found, its best score
// and earned postcard tier, saved under PASSPORT_KEY; plus the start-screen
// dot cloud. Rounds write it through recordVisit(); the Passport pages read
// it through main.js. initPassportStore(host) builds the dot cloud at the
// spot it was always built; the host supplies the globe it sits on.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { PASSPORT_KEY, EARN_NEAR, EARN_BULLSEYE, EARN_PINPOINT, flyoverTier } from '../core/config.js';
import { clamp } from '../core/math.js';
import { state } from '../core/state.js';
import { readJSON, writeJSON } from '../core/storage.js';
import { localDateKey } from '../core/format.js';

let globe;
let latLngToVec3;
let DOT_TIERS;
export let passportDots;

// ---------------------------------------------------------------------------
// Passport: every place found, stamped on the start-screen globe
// ---------------------------------------------------------------------------
// One entry per location, upserted on every reveal, so replaying a place moves
// it back to the recent list and recolours its dot without growing the store.
// Dots are capped at the most recent PASSPORT_DOT_LIMIT visits and the geometry
// is only rebuilt when the set changes, so the start screen pays for this once
// and never per frame.
export const PASSPORT_DOT_LIMIT = 200; // rendered dots, newest first
export const PASSPORT_ORDER_LIMIT = 240; // ids kept in recency order (dots draw from these)
export const PASSPORT_GOLD = 700; // /1000 and up reads gold, 400+ cyan, the rest dim
export const PASSPORT_CYAN = 400;
export const DOT_RADIUS = 1.008; // just proud of the sphere so the far side stays hidden
export const CONTINENT_ORDER = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica'];
// Coarse latitude/longitude boxes, most specific first: the game ships no country
// geometry, and a rough continent is all a completion percentage needs. The two
// Asia rows merge, so the Middle East (inside Africa's box otherwise) counts once.
export const CONTINENT_BOXES = [
  ['Antarctica', -90, -55, -180, 180],
  ['Oceania', -50, -1, 120, 180],
  ['Europe', 35, 82, -25, 62],
  ['Asia', 12, 42, 34, 63],
  ['Africa', -37, 36, -20, 52],
  ['South America', -56, 13, -83, -33],
  ['North America', 7, 84, -170, -40],
  ['Asia', -55, 78, -180, 180],
];

export function continentOf(item) {
  if (item.continent) return item.continent;
  for (const [name, latMin, latMax, lngMin, lngMax] of CONTINENT_BOXES) {
    if (item.lat >= latMin && item.lat <= latMax && item.lng >= lngMin && item.lng <= lngMax) return name;
  }
  return null;
}

// visits: id -> latest base score /1000 (drives dot colour). meta: id -> { b: best
// base, d: closest km, f: first-visit date key, t: last-visit ms, e: earned }; meta
// only exists for visits logged after the Passport page shipped, older ones lack it.
// e is the best flyover tier landed there. Stored best distances are also used to
// migrate newly introduced tiers upward; an earned tier is never downgraded.
export const PROX_CLASSES = ['', 'prox-postcard', 'prox-bullseye', 'prox-pinpoint'];

export function earnForKm(km) {
  // Passport and flyover tiers must share the exact, unrounded boundary check.
  return {
    pinpoint: EARN_PINPOINT,
    bullseye: EARN_BULLSEYE,
    near: EARN_NEAR,
  }[flyoverTier(km)] || 0;
}

// Accuracy tiers add their earned frame; location difficulty has no card visual.
export function applyCardTier(el, item, earned) {
  el.classList.remove(...PROX_CLASSES.filter(Boolean));
  if (!item) return;
  if (earned) el.classList.add(PROX_CLASSES[earned]);
}

// The one accuracy badge every surface uses (styles: .prox-badge in styles/game.css).
// host must be positioned; size is '' (icon + label), 'compact' (icon) or 'large'.
export const PROX_BADGES = { [EARN_BULLSEYE]: ['🎯', 'Bullseye'], [EARN_PINPOINT]: ['📍', 'Pinpoint'] };
export function setProxBadge(host, earned, size = '') {
  const old = host.querySelector(':scope > .prox-badge');
  const badge = PROX_BADGES[earned];
  if (!badge) { old?.remove(); return; }
  const el = old || document.createElement('span');
  el.className = `prox-badge${size ? ` ${size}` : ''}`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', badge[1]);
  el.innerHTML = `<i aria-hidden="true">${badge[0]}</i><b aria-hidden="true">${badge[1]}</b>`;
  if (!old) host.append(el);
}
export let passportDirty = true; // dots need rebuilding before the next start screen
export let locationIndex = null; // built lazily; locations arrive after this section runs

// Locations (re)loaded: rebuild the id index on next use.
export function resetLocationIndex() { locationIndex = null; }

export function passportLocation(id) {
  if (!locationIndex) locationIndex = new Map(state.locations.map((item) => [item.id, item]));
  return locationIndex.get(id);
}

// Landmarks are collectible content in Expeditions and Landmarks mode. They stay out of
// state.locations, so the Daily, the other modes and every country or
// continent total never see them; a stop resolves through findLocation().
let landmarkIndex = null;
export function landmarkLocation(id) {
  if (!landmarkIndex && state.landmarks) landmarkIndex = new Map(state.landmarks.map((item) => [item.id, item]));
  return landmarkIndex?.get(id);
}

// The one location lookup for gameplay: cities first, then landmarks.
export function findLocation(id) {
  return passportLocation(id) || landmarkLocation(id);
}

// The one "have we been here" predicate (passport, dex grid and collections all
// share it). Older visits recorded before passport.meta shipped still count.
export function isVisited(id) { return Object.hasOwn(state.passport.visits, id); }

export function tierOf(base) {
  if (base >= PASSPORT_GOLD) return 'gold';
  if (base >= PASSPORT_CYAN) return 'cyan';
  return 'dim';
}

export function readPassport() {
  const raw = readJSON(PASSPORT_KEY);
  const visits = {};
  const order = [];
  const migrateScores = raw && raw.v !== 2;
  let migrated = migrateScores;
  if (raw && raw.visits && typeof raw.visits === 'object') {
    for (const [id, base] of Object.entries(raw.visits)) {
      const score = Number(base) * (migrateScores ? 10 : 1);
      // Unicode letters: 8 ids carry accents (gorée-island-…, park-güell-…).
      if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(id) || !Number.isFinite(score)) continue;
      visits[id] = clamp(Math.round(score), 0, 1000);
      if (migrateScores) raw.visits[id] = visits[id];
      order.push(id);
    }
  }
  // The stored order is oldest -> newest; re-apply it so the caps keep the newest.
  if (raw && Array.isArray(raw.order)) {
    const age = new Map(raw.order.map((id, i) => [id, i]));
    order.sort((a, b) => (age.has(a) ? age.get(a) : -1) - (age.has(b) ? age.get(b) : -1));
  }
  const meta = {};
  if (raw && raw.meta && typeof raw.meta === 'object') {
    for (const [id, m] of Object.entries(raw.meta)) {
      if (!(id in visits) || !m || typeof m !== 'object') continue;
      const entry = {};
      if (Number.isFinite(m.b)) {
        entry.b = clamp(Math.round(m.b * (migrateScores ? 10 : 1)), 0, 1000);
        if (migrateScores) m.b = entry.b;
      }
      if (Number.isFinite(m.d)) entry.d = Math.max(0, Math.round(m.d));
      if (typeof m.f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.f)) entry.f = m.f;
      if (Number.isFinite(m.t)) entry.t = m.t;
      if (m.e === EARN_NEAR || m.e === EARN_BULLSEYE || m.e === EARN_PINPOINT) entry.e = m.e;
      for (const key of ['ea', 'eb1', 'eb2', 'eb3']) {
        if (Number.isFinite(m[key])) entry[key] = m[key];
      }
      // Pinpoint was added after distances were already stored. Rebuild the tier
      // from the best distance, but retain any higher tier already awarded.
      if (Number.isFinite(entry.d)) {
        const earned = Math.max(entry.e || 0, earnForKm(entry.d));
        if (earned > (entry.e || 0)) {
          entry.e = earned;
          m.e = earned;
          migrated = true;
        }
      }
      meta[id] = entry;
    }
  }
  if (migrateScores) raw.v = 2;
  if (migrated) writeJSON(PASSPORT_KEY, raw);
  return { visits, order: order.slice(-PASSPORT_ORDER_LIMIT), meta };
}

// canEarn false (endless) logs the visit and progress but awards no postcard;
// a card earned earlier is kept either way.
export function recordVisit(id, base, km, canEarn = true) {
  if (!id || !Number.isFinite(base)) return 0;
  const score = clamp(Math.round(base), 0, 1000);
  // Keep a visit logged before meta existed undated: its real first visit is unknown.
  const legacy = id in state.passport.visits && !state.passport.meta[id];
  const prev = state.passport.meta[id] || {};
  const prevEarned = prev.e || 0;
  const entry = { b: Math.max(score, prev.b ?? (legacy ? state.passport.visits[id] : 0)), t: Date.now() };
  const kms = [km, prev.d].filter(Number.isFinite);
  if (kms.length) entry.d = Math.round(Math.min(...kms));
  if (prev.f || !legacy) entry.f = prev.f || localDateKey();
  const earned = Math.max(prevEarned, Number.isFinite(km) && canEarn ? earnForKm(km) : 0);
  if (earned) entry.e = earned;
  // earnedAt: timestamp of first earn, set once and never overwritten
  if (earned && !prev.ea) entry.ea = Date.now();
  else if (prev.ea) entry.ea = prev.ea;
  // Track when each tier was first achieved for upgrade history
  if (earned >= 1 && prevEarned < 1 && !prev.eb1) entry.eb1 = Date.now();
  else if (prev.eb1) entry.eb1 = prev.eb1;
  if (earned >= 2 && prevEarned < 2 && !prev.eb2) entry.eb2 = Date.now();
  else if (prev.eb2) entry.eb2 = prev.eb2;
  if (earned >= 3 && prevEarned < 3 && !prev.eb3) entry.eb3 = Date.now();
  else if (prev.eb3) entry.eb3 = prev.eb3;
  state.passport.meta[id] = entry;
  state.passport.visits[id] = score;
  const at = state.passport.order.indexOf(id);
  if (at !== -1) state.passport.order.splice(at, 1);
  state.passport.order.push(id);
  if (state.passport.order.length > PASSPORT_ORDER_LIMIT) state.passport.order = state.passport.order.slice(-PASSPORT_ORDER_LIMIT);
  writeJSON(PASSPORT_KEY, { v: 2, visits: state.passport.visits, order: state.passport.order, meta: state.passport.meta });
  passportDirty = true;
  // Return newly earned tier (0 if not newly earned)
  return earned > prevEarned ? earned : 0;
}

export const _dotVec = new THREE.Vector3();
export function buildPassportDots() {
  const spots = state.passport.order
    .map((id) => ({ item: passportLocation(id), base: state.passport.visits[id] }))
    .filter((spot) => spot.item)
    .slice(-PASSPORT_DOT_LIMIT);
  const positions = new Float32Array(spots.length * 3);
  const colors = new Float32Array(spots.length * 3);
  const color = new THREE.Color();
  spots.forEach((spot, i) => {
    latLngToVec3(spot.item.lat, spot.item.lng, DOT_RADIUS, _dotVec).toArray(positions, i * 3);
    color.copy(DOT_TIERS[tierOf(spot.base)]).toArray(colors, i * 3);
  });
  passportDots.geometry.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  passportDots.geometry = geometry;
  passportDirty = false;
}

// The start-screen dot cloud and its test hook.
export function initPassportStore(main) {
  ({ globe, latLngToVec3 } = main);
  // Soft round dot: one texture, per-dot colour from a vertex attribute.
  const dotTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.42, 'rgba(255,255,255,.95)');
    grad.addColorStop(0.72, 'rgba(255,255,255,.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  DOT_TIERS = {
    gold: new THREE.Color('#ffd166'),
    cyan: new THREE.Color('#67e8ff'),
    dim: new THREE.Color('#5d84a6'),
  };
  passportDots = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      size: 0.085,
      map: dotTex,
      vertexColors: true,
      transparent: true,
      depthWrite: false, // the globe sphere still occludes the far side
      sizeAttenuation: true,
    }),
  );
  passportDots.visible = false;
  passportDots.renderOrder = 2;
  globe.add(passportDots);
  window.__passportDots = passportDots; // test hook: the start-screen dot cloud
}
