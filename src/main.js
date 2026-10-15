import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { feature as topoFeature } from 'topojson-client';
import { dailyIds, isLandmark, isPlayableLocation, resolvePinnedIds } from './daily.js';
import { initPvpApi } from './pvp/api.js';
import { initPvpHome, pvpLinkInvite, pvpLinkIsGroup } from './pvp/home.js';
import { initPvpH2h, openPvpJoin } from './pvp/h2h.js';
import { initPvpGroup, openPvpGroupJoin } from './pvp/group.js';
import { initPvpPlay, pvpLeave, pvpSubmit, pvpNext, pvpRenderVs } from './pvp/play.js';
import { formatKm } from './core/format.js';
import { initStats, recordHistory } from './meta/stats.js';
import {
  initPassportHome, initPassport, syncPassport, auditFlagsLocationsLoaded, passportEntryFor, countryIndex, buildCountryIndex,
  passportEntry, collectionsEntry, openPostcard, postcardShareText,
} from './meta/passport.js';

if (window.__boot) window.__boot('3D engine loaded');

// URL shortcut: ?reset=daily drops today's saved game (keeps passport, streak
// and history) so the daily is rebuilt from the current locations.json. Runs
// before anything reads storage; the fetch below skips the HTTP cache so a
// stale locations.json can't rebuild the old set.
const RESET_DAILY = new URLSearchParams(location.search).get('reset') === 'daily';
// Audit mode retired 2026-10-12 (Sean): code preserved, flip to true to reinstate ?audit=1.
const AUDIT_AVAILABLE = false;
const AUDIT_MODE = AUDIT_AVAILABLE && new URLSearchParams(location.search).get('audit') === '1';
if (RESET_DAILY) {
  try { localStorage.removeItem('where-on-earth-v1'); } catch (error) { console.error('[reset] daily', error); }
  history.replaceState(null, '', location.pathname + location.hash);
}

// ---------------------------------------------------------------------------
// Version check: if the server has a newer version, show a reload banner.
// This handles iOS Safari caching the HTML despite no-cache headers.
// ---------------------------------------------------------------------------
(function checkVersion() {
  const meta = document.querySelector('meta[name="app-version"]');
  const current = meta ? meta.content : 'DEV';
  if (current === 'DEV') return;
  async function check() {
    try {
      const res = await fetch(location.pathname, { cache: 'no-store' });
      const html = await res.text();
      const m = html.match(/<meta name="app-version" content="([^"]+)"/);
      if (m && m[1] !== current) {
        let banner = document.getElementById('update-banner');
        if (!banner) {
          banner = document.createElement('button');
          banner.id = 'update-banner';
          banner.textContent = 'New version available. Tap to reload';
          banner.style.cssText = 'position:fixed;z-index:9999;top:0;left:0;right:0;padding:12px;background:#f5c451;color:#000;font-weight:700;border:0;cursor:pointer;';
          banner.onclick = () => location.reload();
          document.body.appendChild(banner);
        }
      }
    } catch (e) {}
  }
  // Check on visibility change (covers back-nav) and every 5 minutes
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 5 * 60 * 1000);
})();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DEG = Math.PI / 180;
const FOV = 36;
const ATMO_RADIUS = 1.17;
// Player zoom floor: ~190 km above the surface, ~0.17 km per css px on a
// 390 px phone, enough to see Robben Island or Alcatraz as a shape.
const MIN_DIST = 1.24;
// Scripted cameras (bullseye snap, flight, reveal framing) keep the closest
// framing they were tuned at; only the player's own zoom goes deeper.
const SCENE_MIN_DIST = 1.32;
const PITCH_LIMIT = 75 * DEG; // look down at the poles, never flip north-down
const FRICTION = 2.1; // velocity decay per second (exponential)
const MAX_SPIN = 7; // rad/s
const TAP_MAX_MS = 350;
const GUESS_TAP_MAX_MS = 700; // a careful placement tap may linger longer than a review tap
const LOCK_ARM_MS = 350; // the Lock in button ignores taps this soon after it appears

// Guessing is two steps: tap the globe to place (or move) the pin, then press
// Lock in. The button sits in a fixed spot in the thumb zone, away from the
// pin, so the finger never hides the placement and a stray tap can't confirm.
const lockButton = document.getElementById('lock-button');
let pendingGuess = null; // { lat, lng } of the placed, unconfirmed pin
let lockArmedAt = 0;

function setGuessHint(text, nudge = false) {
  const hint = document.getElementById('guess-hint');
  if (!hint) return;
  hint.textContent = text;
  hint.style.color = nudge ? '#ffc76a' : '';
}

function showLockButton() {
  if (lockButton.hidden) lockArmedAt = performance.now() + LOCK_ARM_MS;
  lockButton.hidden = false;
  document.body.classList.add('has-guess');
}

function clearPendingGuess() {
  pendingGuess = null;
  lockButton.hidden = true;
  document.body.classList.remove('has-guess');
}

// The canvas is a sibling of the HUD, not an ancestor, so stopping propagation
// on the button can't shield it. A tap that misses the button by a few px (its
// glow reads as part of it) hit-tests to the globe and would move the pin to
// the button's spot, so the canvas ignores placement taps on or near it.
const LOCK_TAP_SLOP = 16; // css px
function nearLockButton(x, y) {
  if (lockButton.hidden) return false;
  const r = lockButton.getBoundingClientRect();
  return x > r.left - LOCK_TAP_SLOP && x < r.right + LOCK_TAP_SLOP
    && y > r.top - LOCK_TAP_SLOP && y < r.bottom + LOCK_TAP_SLOP;
}

// Skip pin placement when tapping on/near top UI (X buttons, header).
// Prevents pins dropping behind the X when zoomed in.
const TOP_UI_SLOP = 8; // css px
function nearTopUI(x, y) {
  for (const el of document.querySelectorAll('.home-nav-btn, .round-header')) {
    if (el.offsetParent === null) continue; // hidden
    const r = el.getBoundingClientRect();
    if (x > r.left - TOP_UI_SLOP && x < r.right + TOP_UI_SLOP
      && y > r.top - TOP_UI_SLOP && y < r.bottom + TOP_UI_SLOP) {
      return true;
    }
  }
  return false;
}

lockButton.addEventListener('click', () => {
  if (!pendingGuess || !window.__canGuess || gameMode !== 'guess') return;
  if (performance.now() < lockArmedAt) return; // the tail of a double tap on the globe
  const guess = pendingGuess;
  clearPendingGuess();
  if (navigator.vibrate) navigator.vibrate(20);
  window.dispatchEvent(new CustomEvent('pin', { detail: { ...guess, confirmed: true } }));
});
const TAP_MAX_MOVE = 8; // css px
const AUTO_SPIN = 0.045; // rad/s idle drift
const PIN_COLOR = new THREE.Color('#ffb54a');
const ANSWER_COLOR = new THREE.Color('#67e8ff');

// lat/lng <-> unit vector, matching THREE.SphereGeometry's UV layout
// (u = 0 at lng -180, v = 1 at the north pole).
function latLngToVec3(lat, lng, r = 1, out = new THREE.Vector3()) {
  const phi = (lng + 180) * DEG;
  const la = lat * DEG;
  return out.set(-Math.cos(phi) * Math.cos(la) * r, Math.sin(la) * r, Math.sin(phi) * Math.cos(la) * r);
}

function vec3ToLatLng(v) {
  const n = v.clone().normalize();
  let lng = Math.atan2(n.z, -n.x) / DEG - 180;
  if (lng < -180) lng += 360;
  return { lat: Math.asin(n.y) / DEG, lng };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
const canvas = document.getElementById('globe');
const hud = document.getElementById('hud');

// stencil: the reveal's country outline blends each pixel once (see buildCountryOutline)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x020409, 1);
const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 200);

const globe = new THREE.Group();
scene.add(globe);

// ---------------------------------------------------------------------------
// Deep-space backdrop (matches the CSS fallback gradient), drawn behind everything
// ---------------------------------------------------------------------------
const backdropMat = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.9999, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float blob(vec2 c, vec2 r) { return 1.0 - smoothstep(0.0, 1.0, length((vUv - c) / r)); }
    void main() {
      float d = length((vUv - vec2(0.5, 0.55)) / vec2(1.2, 0.8));
      vec3 col = mix(vec3(0.039, 0.082, 0.192), vec3(0.020, 0.039, 0.098), smoothstep(0.0, 0.48, d));
      col = mix(col, vec3(0.008, 0.016, 0.035), smoothstep(0.48, 1.0, d));
      col += vec3(0.282, 0.204, 0.549) * 0.16 * blob(vec2(0.82, 0.88), vec2(0.6, 0.4));
      col += vec3(0.071, 0.337, 0.502) * 0.14 * blob(vec2(0.12, 0.12), vec2(0.55, 0.35));
      col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdropMat);
backdrop.frustumCulled = false;
backdrop.renderOrder = -20;
scene.add(backdrop);

// ---------------------------------------------------------------------------
// Starfield
// ---------------------------------------------------------------------------
function makeStars(count) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const v = new THREE.Vector3();
  const cool = new THREE.Color('#bcd4ff');
  const warm = new THREE.Color('#ffe2c4');
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(60);
    pos.set([v.x, v.y, v.z], i * 3);
    c.copy(cool).lerp(warm, Math.random() ** 2);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = 0.6 + Math.random() ** 7 * 3.2;
    phase[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 color;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.72 + 0.28 * sin(uTime * (0.6 + fract(aPhase * 7.13) * 1.6) + aPhase);
        vAlpha = tw * clamp(aSize / 2.2, 0.35, 1.0);
        vColor = color;
        gl_PointSize = aSize * uPixelRatio * (0.85 + 0.15 * tw) * 1.6;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a = a * a * vAlpha;
        gl_FragColor = vec4(vColor * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -10;
  return pts;
}
const stars = makeStars(2400);
scene.add(stars);

// ---------------------------------------------------------------------------
// Globe surface
// ---------------------------------------------------------------------------
const blankTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
blankTex.needsUpdate = true;

const globeMat = new THREE.ShaderMaterial({
  uniforms: {
    uMap: { value: blankTex },
    uLand: { value: 0 },
    // satellite imagery (see "Satellite imagery" below): equirectangular base
    uSatBase: { value: blankTex },
    uSatMix: { value: 0 },
    // detail insets: A draws under B; bounds are Mercator (x0, y0, x1, y1)
    uInsetA: { value: blankTex },
    uInsetB: { value: blankTex },
    uInsetBoundsA: { value: new THREE.Vector4(0, 0, 1, 1) },
    uInsetBoundsB: { value: new THREE.Vector4(0, 0, 1, 1) },
    uInsetMixA: { value: 0 },
    uInsetMixB: { value: 0 },
    // Country Blackout: found countries drop the imagery (see "Country Blackout")
    uBlackout: { value: blankTex },
    uBlackoutMix: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vPosW = wp.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uMap;
    uniform float uLand;
    uniform sampler2D uSatBase;
    uniform float uSatMix;
    uniform sampler2D uInsetA;
    uniform sampler2D uInsetB;
    uniform vec4 uInsetBoundsA;
    uniform vec4 uInsetBoundsB;
    uniform float uInsetMixA;
    uniform float uInsetMixB;
    uniform sampler2D uBlackout;
    uniform float uBlackoutMix;
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    // Inset texels are premultiplied: cleared to alpha 0, tiles land opaque,
    // so bilinear and mip edges between loaded and empty tiles stay clean.
    // x wraps (fract) so an inset can straddle the antimeridian; local coords
    // are relative to the bounds to hold precision at z11. ~2% feathered edge.
    vec4 insetSample(sampler2D t, vec4 b, vec2 m) {
      vec2 l = vec2(fract(m.x - b.x), m.y - b.y) / (b.zw - b.xy);
      vec2 e = smoothstep(vec2(0.0), vec2(0.02), l) * smoothstep(vec2(0.0), vec2(0.02), 1.0 - l);
      return texture2D(t, l) * (e.x * e.y);
    }

    void main() {
      vec4 m = texture2D(uMap, vUv) * uLand;
      float land = m.r;
      float glow = m.g;
      float shelf = m.b;

      vec3 N = normalize(vNormalW);
      vec3 V = normalize(cameraPosition - vPosW);
      float ndv = clamp(dot(N, V), 0.0, 1.0);

      // ocean
      vec3 col = vec3(0.030, 0.085, 0.185);
      col += vec3(0.020, 0.085, 0.160) * shelf;

      // graticule, 15 degree spacing, fading near poles
      vec2 g = vec2(vUv.x * 24.0, vUv.y * 12.0);
      vec2 gd = abs(fract(g - 0.5) - 0.5) / fwidth(g);
      float grid = 1.0 - min(min(gd.x, gd.y), 1.0);
      float poleFade = smoothstep(0.02, 0.14, min(vUv.y, 1.0 - vUv.y));
      col += vec3(0.10, 0.24, 0.42) * grid * 0.16 * poleFade * (1.0 - land * 0.7);

      // land
      vec3 landCol = vec3(0.105, 0.230, 0.340);
      col = mix(col, landCol, land * 0.94);

      // coastal glow
      col += vec3(0.22, 0.70, 1.00) * glow * 0.70;

      // soft ocean sheen (fixed light for depth)
      vec3 H = normalize(vec3(0.5, 0.8, 0.6) + V);
      col += vec3(0.30, 0.52, 0.85) * pow(max(dot(N, H), 0.0), 24.0) * 0.16 * (1.0 - land);

      // The local Blue Marble base and the sphere UVs are equirectangular, so
      // the base covers both poles directly. Detail tiles remain Web Mercator.
      // Replaces the graticule, glow and sheen wholesale via the crossfade.
      vec3 sat = texture2D(uSatBase, vUv).rgb;
      float latRaw = (vUv.y - 0.5) * 3.14159265;
      float lat = clamp(latRaw, -1.48442, 1.48442);
      vec2 merc = vec2(vUv.x, 0.5 - log(tan(0.78539816 + 0.5 * lat)) / 6.28318531);
      vec4 ia = insetSample(uInsetA, uInsetBoundsA, merc) * uInsetMixA;
      sat = sat * (1.0 - ia.a) + ia.rgb;
      vec4 ib = insetSample(uInsetB, uInsetBoundsB, merc) * uInsetMixB;
      sat = sat * (1.0 - ib.a) + ib.rgb;
      sat *= mix(0.72, 1.0, sqrt(ndv)); // soft limb darkening
      float satMix = uSatMix * (1.0 - texture2D(uBlackout, vUv).r * uBlackoutMix);
      col = mix(col, sat, satMix);

      // atmospheric rim haze (eased back over imagery)
      float fres = pow(1.0 - ndv, 2.6);
      col += vec3(0.18, 0.48, 1.00) * fres * mix(0.80, 0.32, satMix);

      col += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // dither against banding
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const globeMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 100), globeMat);
globe.add(globeMesh);

// ---------------------------------------------------------------------------
// Atmosphere: back-face shell, intensity from the ray's closest approach to the core
// ---------------------------------------------------------------------------
const atmoMat = new THREE.ShaderMaterial({
  uniforms: { uRadius: { value: ATMO_RADIUS } },
  vertexShader: /* glsl */ `
    varying vec3 vPosW;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vPosW = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uRadius;
    varying vec3 vPosW;
    void main() {
      vec3 dir = normalize(vPosW - cameraPosition);
      float b = length(cross(cameraPosition, dir));       // ray distance from globe center
      float t = clamp((b - 1.0) / (uRadius - 1.0), 0.0, 1.0);
      float i = exp(-t * 4.2) * (1.0 - t) * (1.0 - t);
      vec3 col = mix(vec3(0.42, 0.78, 1.00), vec3(0.16, 0.34, 1.00), smoothstep(0.0, 0.6, t));
      gl_FragColor = vec4(col * i * 0.95, 1.0);
    }`,
  side: THREE.BackSide,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(ATMO_RADIUS, 96, 64), atmoMat);
scene.add(atmosphere);

// ---------------------------------------------------------------------------
// Land data -> texture (fill / coastal glow / shelf haze) + crisp outlines
// ---------------------------------------------------------------------------
function unwrap(points) {
  const out = [];
  let off = 0;
  let prev = null;
  for (const [lon, lat] of points) {
    let L = lon + off;
    if (prev !== null) {
      if (L - prev > 180) { off -= 360; L -= 360; }
      else if (L - prev < -180) { off += 360; L += 360; }
    }
    out.push([L, lat]);
    prev = L;
  }
  return out;
}

// Coast cleanup for the 50m data. Islands under MIN_ISLAND deg across render
// as sub-pixel scribbles at globe scale (Norwegian skerries, Aegean, Arctic
// shards), so they're dropped from fill, glow and outline alike. Remaining
// lines are Douglas-Peucker simplified to SIMPLIFY_TOL deg, which strips the
// zigzag noise below ~0.5 px at fit zoom while keeping real coast shape.
const MIN_ISLAND = 0.12;
const SIMPLIFY_TOL = 0.015;

function ringExtent(pts) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return Math.hypot((x1 - x0) * Math.cos(((y0 + y1) / 2) * DEG), y1 - y0);
}

const isClosed = (pts) => pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const k = Math.cos(((pts[a][1] + pts[b][1]) / 2) * DEG); // squash longitude toward true distance
    const ax = pts[a][0] * k, ay = pts[a][1];
    const dx = pts[b][0] * k - ax, dy = pts[b][1] - ay;
    const len = Math.hypot(dx, dy);
    let best = -1, bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] * k - ax, py = pts[i][1] - ay;
      const d = len > 1e-12 ? Math.abs(px * dy - py * dx) / len : Math.hypot(px, py);
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function cleanCoast(lines) {
  const out = [];
  for (const line of lines) {
    if (isClosed(line) && ringExtent(line) < MIN_ISLAND) continue;
    // a closed ring has no natural split point, so simplify it as two halves
    const half = isClosed(line) ? line.length >> 1 : 0;
    const pts = half
      ? [...simplify(line.slice(0, half + 1), SIMPLIFY_TOL).slice(0, -1), ...simplify(line.slice(half), SIMPLIFY_TOL)]
      : simplify(line, SIMPLIFY_TOL);
    out.push(pts);
  }
  return out;
}

function addToPath(path, pts, W, H, close) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) { min = Math.min(min, p[0]); max = Math.max(max, p[0]); }
  for (const shift of [-360, 0, 360]) {
    if (max + shift < -180 || min + shift > 180) continue;
    pts.forEach(([L, lat], i) => {
      const x = ((L + shift + 180) / 360) * W;
      const y = ((90 - lat) / 180) * H;
      i ? path.lineTo(x, y) : path.moveTo(x, y);
    });
    if (close) path.closePath();
  }
}

// Lake shorelines as closed rings (outer + island rings), fed through the same
// cleanCoast pass as the sea coast so they share its island rule and smoothing.
function lakeRings(lakes) {
  const rings = [];
  for (const f of lakes.features) for (const poly of f.geometry.coordinates) rings.push(...poly);
  return rings;
}

// Bbox area for sorting lakes largest-first (drives the bright/dim split).
function lakeArea(f) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const poly of f.geometry.coordinates)
    for (const ring of poly)
      for (const [x, y] of ring) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  return (x1 - x0) * (y1 - y0);
}

// Remote OSM islands (islands.topo.json `blob`) bake at least this wide, in
// 4096-texture texels (~13 km), so a 2 km atoll still reads as a dot of land.
const ISLAND_BLOB_TEXELS = 1.5;

// The land texture is baked in three passes on one canvas so the globe can
// show as soon as the land fill arrives: buildLandTexture (land + shelf haze,
// R/B), then addCoastGlow (G) once the 10m coast lands, then knockOutLakes.
// The passes commute: the glow only adds G and the lake multiply keeps G, so
// the result matches the old single-pass bake. The caller sets needsUpdate;
// each re-upload of the 4096 texture is costly, so glow and lakes share one.
function buildLandTexture(geo, islands) {
  const maxTex = renderer.capabilities.maxTextureSize;
  const W = maxTex >= 4096 ? 4096 : 2048;
  const H = W / 2;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  // CPU-backed: on a GPU-raster canvas the blurs are deferred to the GPU
  // process, and drawing passes after the first upload stalled frames for
  // 15+ s in a software-GL test
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const land = new Path2D();
  for (const f of geo.features) {
    if (f.properties.kind !== 'land') continue;
    for (const poly of f.geometry.coordinates) {
      if (ringExtent(poly[0]) < MIN_ISLAND) continue; // same islands the outline drops
      for (const ring of poly) {
        if (ring !== poly[0] && ringExtent(ring) < MIN_ISLAND) continue; // and pinhole lakes
        const pts = unwrap(ring);
        const span = pts[pts.length - 1][0] - pts[0][0];
        if (Math.abs(span) > 180) {
          // ring encircles a pole (Antarctica): close it along the pole edge
          const poleLat = pts.reduce((s, p) => s + p[1], 0) / pts.length < 0 ? -90 : 90;
          pts.push([pts[pts.length - 1][0], poleLat], [pts[0][0], poleLat]);
        }
        addToPath(land, pts, W, H, true);
      }
    }
  }

  // Supplemental OSM islands: own path, nonzero fill, so one lying over coarse
  // base land can't punch an evenodd hole in it. No MIN_ISLAND rule.
  const isles = new Path2D();
  const blobs = new Path2D();
  for (const f of islands.features) {
    for (const [ring] of f.geometry.coordinates) {
      const pts = unwrap(ring);
      addToPath(isles, pts, W, H, true);
      if (f.properties.blob) addToPath(blobs, pts, W, H, true);
    }
  }

  const s = W / 4096;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // all land in the current fill colour: base land, islands at true size, and
  // remote islands stroked out to their minimum blob size
  const fillLand = () => {
    ctx.fill(land, 'evenodd');
    ctx.fill(isles);
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = ISLAND_BLOB_TEXELS * s;
    ctx.stroke(blobs);
    ctx.restore();
  };

  // B: broad shelf haze around landmasses
  ctx.fillStyle = 'rgb(0,0,140)';
  ctx.shadowColor = 'rgb(0,0,255)';
  ctx.shadowBlur = 46 * s;
  fillLand();
  ctx.shadowBlur = 16 * s;
  fillLand();

  // R: land fill
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgb(255,0,0)';
  ctx.strokeStyle = 'rgb(255,0,0)';
  ctx.lineWidth = 1 * s;
  fillLand();
  ctx.stroke(land);

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

function addCoastGlow(tex, coastLines) {
  const cv = tex.image;
  const W = cv.width;
  const H = cv.height;
  const s = W / 4096;
  const ctx = cv.getContext('2d');
  const coast = new Path2D();
  for (const line of coastLines) addToPath(coast, unwrap(line), W, H, false);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // G: coastal glow as a soft halo only. The crisp core is the vector outline;
  // a baked core stroke here sat under it, a texel off, and read as a doubled,
  // fuzzy edge. Draw the stroke off-canvas and keep just its shadow.
  ctx.save();
  ctx.translate(-2 * W, 0);
  ctx.shadowOffsetX = 2 * W;
  ctx.strokeStyle = '#000';
  ctx.shadowColor = 'rgb(0,92,0)';
  ctx.lineWidth = 1.35 * s;
  ctx.shadowBlur = 10 * s;
  ctx.stroke(coast);
  ctx.shadowColor = 'rgb(0,68,0)';
  ctx.shadowBlur = 3.5 * s;
  ctx.stroke(coast);
  ctx.restore();
  // Internal country borders are intentionally never drawn: coastlines only.
}

function knockOutLakes(tex, lakes) {
  const cv = tex.image;
  const W = cv.width;
  const H = cv.height;
  const ctx = cv.getContext('2d');
  // big lakes, island rings included so evenodd keeps lake islands as land
  const water = new Path2D();
  for (const f of lakes.features) {
    for (const poly of f.geometry.coordinates) {
      for (const ring of poly) {
        if (ring !== poly[0] && ringExtent(ring) < MIN_ISLAND) continue;
        addToPath(water, unwrap(ring), W, H, true);
      }
    }
  }
  // knock lakes out of the land fill (R -> 0) and dim the shelf haze under
  // them (B) to a near-shore level; at full haze a lake is as bright as land
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgb(0,255,30)';
  ctx.fill(water, 'evenodd');
  ctx.restore();
}

const outlineMaterials = [];
const outlineMeshes = [];
let answerLineMaterial = null;
function buildOutline(lines, radius, opts) {
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
  // Drawn as independent segments, so neighbours overlap at every vertex. With
  // opacity < 1 those overlaps double up into a beaded, jittery line; the line
  // is only transparent during the reveal fade, then goes opaque.
  const mat = new LineMaterial({
    color: opts.color,
    linewidth: opts.width,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  mat.userData.baseOpacity = opts.opacity ?? 1;
  // per-layer fade-in clock: layers arrive at different times while loading
  mat.userData.reveal = 0;
  outlineMaterials.push(mat);
  const mesh = new LineSegments2(geo, mat);
  mesh.renderOrder = 2;
  mesh.userData.radius = radius;
  outlineMeshes.push(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Satellite imagery (docs/satellite-plan.md)
// Satellite is the default and only user-facing map. The stylized ("classic")
// map always loads underneath, so a failed fetch just leaves it showing.
// ?map=classic forces the stylized map for testing; it is kept intact for a
// future mode.
//   base:   the whole world in one local 2048x1024 equirectangular texture
//   insets: two detail windows (A under B) that follow the camera at z4-z8,
//           filled tile by tile once the camera settles (see "Detail insets")
// ---------------------------------------------------------------------------
const SAT_PROVIDERS = [
  {
    // ?v=3: 2025 imagery replaced 2016, bust edge and browser cache
    // policy without Access-Control-Allow-Origin (immutable, 1 year); a new
    // query string is a new cache key, so every tile is fetched with CORS.
    url: (z, y, x) => `https://tiles.where-on.earth/tiles/${z}/${x}/${y}.jpg?v=3`,
    credit: 'Imagery <a href="https://www.where-on.earth/credits" target="_blank" rel="noopener">© EOX</a> (Sentinel-2 2025)',
    maxZ: 8,
  },
];
const SAT_BASE_URL = './assets/eox-z4-base-2k.jpg';
const SAT_FADE_S = 0.4;
const mapStyle = new URLSearchParams(location.search).get('map') === 'classic' ? 'classic' : 'satellite';
let satTarget = 0; // uSatMix eases toward this
let satT = 0;
let satApplied = 0; // last satT pushed to the uniforms and overlays
let satCreditEl = null;
let satProvider = null; // tile provider used only by the detail insets
let satDisabled = false; // for the session, after a second context loss

async function loadSatBase() {
  const tex = await new THREE.TextureLoader().loadAsync(SAT_BASE_URL);
  tex.colorSpace = THREE.NoColorSpace; // globeMat writes gl_FragColor raw
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function showSatToast(text) {
  const el = document.createElement('div');
  el.className = 'sat-toast';
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3500);
}

// Load the local NASA base first. Esri is retained only for detail insets.
// Resolves true once satellite is up, false when classic is what shows.
async function initSatellite() {
  if (mapStyle !== 'satellite') return false;
  try {
    const base = await loadSatBase();
    if (satDisabled) { base.dispose(); return false; }
    globeMat.uniforms.uSatBase.value = base;
    satProvider = SAT_PROVIDERS[0];
    satCreditEl = document.createElement('p');
    satCreditEl.className = 'sat-credit';
    satCreditEl.innerHTML = satProvider.credit;
    document.body.appendChild(satCreditEl);
    satTarget = 1;
    return true;
  } catch (err) {
    console.warn(err);
  }
  showSatToast('Satellite view unavailable, showing classic map.');
  return false;
}
const satReady = initSatellite();

// ---------------------------------------------------------------------------
// Detail insets
// Two render-target textures hold a window of z4-z8 tiles around the view.
// A new window fills the buffer that isn't showing, drawn on top (B) and
// cleared to alpha 0, so unloaded tiles show the older inset or the base.
// Once every visible tile has landed, the old buffer fades out underneath.
// Nothing fetches or uploads while the camera moves fast; a window is only
// chosen once it settles (or, during the slow idle drift, when the view
// outruns the current window).
// ---------------------------------------------------------------------------
const INSET_MIN_Z = 4;
const INSET_Q = 1; // target texels per css px: 1 = css px, 0.5 = device px
const INSET_SIZE = renderer.capabilities.maxTextureSize < 4096 ? 1536 : 2048;
const INSET_TILES = INSET_SIZE / 256; // footprint cap per side, margin included
const INSET_FADE_S = 0.25;
const INSET_FETCHES = 6;
const INSET_FETCHES_SLOW = 3;
const INSET_UPLOADS_PER_FRAME = 4;
const INSET_SETTLE_MS = 150;
const INSET_FAST_PX_S = 400; // screen speed above which nothing streams
const INSET_STILL_PX_S = 25;
const INSET_LRU_TILES = 400;
const INSET_LRU_BYTES = 8 << 20;
const INSET_TRIES = 2;
const MERC_MAX_LAT = 85.05112878 * DEG;
const imod = (a, n) => ((a % n) + n) % n;

const inset = {
  bufs: null, // [{ rt, bounds, mix, fadeTo, win }]; bufs[over] draws on top
  over: 0,
  win: null, // window being fed (fetch/decode/upload target); null = off
  gen: 0,
  queue: [], // tiles of `win` waiting for a fetch slot, centre first
  inflight: new Map(), // tile key -> { ctrl }
  uploads: [], // decoded bitmaps waiting for a frame's upload budget
  lru: new Map(), // tile key -> compressed Blob, oldest first
  lruBytes: 0,
  missing: new Set(), // tile keys that 404 (open ocean): never refetched
  fails: 0, // consecutive fetch failures
  trips: 0, // breaker trips since the last success (exponential backoff)
  pausedUntil: 0,
  latency: [], // last few fetch times, for the slow-network fallback
  slow: false,
  prevYaw: 0, prevPitch: 0, prevDist: 0, hasPrev: false,
  stillSince: -1,
  lastCheck: 0,
  lastBuild: 0,
  losses: 0, // webgl context losses this session
};

const _tileSrc = new THREE.Texture(); // wrapper so copyTextureToTexture reads an ImageBitmap
const _tileDst = new THREE.Vector2();
const _insetRay = new THREE.Raycaster();
const _insetNdc = new THREE.Vector2();
const _insetP = new THREE.Vector3();
const _insetQ = new THREE.Quaternion();
const _origin = new THREE.Vector3();
const _insetSphere = new THREE.Sphere(new THREE.Vector3(), 1);
const _insetClear = new THREE.Color();

function ensureInsets() {
  if (inset.bufs) return inset.bufs;
  inset.bufs = [0, 1].map(() => {
    const rt = new THREE.WebGLRenderTarget(INSET_SIZE, INSET_SIZE, { depthBuffer: false, colorSpace: THREE.NoColorSpace });
    rt.texture.generateMipmaps = false; // copyTextureToTexture would rebuild them per tile; we do it once per window
    return { rt, bounds: new THREE.Vector4(0, 0, 1, 1), mix: 0, fadeTo: 0, win: null };
  });
  return inset.bufs;
}

// Mip levels are built once per completed window with raw GL (three only sets
// sampler state at upload time, and render-target textures never re-upload).
// While a window fills, sampling stays on level 0 so stale levels never show.
function setInsetMips(buf, on) {
  const gl = renderer.getContext();
  const handle = renderer.properties.get(buf.rt.texture).__webglTexture;
  if (!handle || gl.isContextLost()) return;
  renderer.state.bindTexture(gl.TEXTURE_2D, handle);
  if (on) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, on ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
}

function clearInset(buf) {
  const prev = renderer.getRenderTarget();
  renderer.getClearColor(_insetClear);
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(buf.rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, false, false);
  renderer.setRenderTarget(prev);
  renderer.setClearColor(_insetClear, prevAlpha);
  setInsetMips(buf, false);
}

function lruGet(key) {
  const blob = inset.lru.get(key);
  if (blob) { inset.lru.delete(key); inset.lru.set(key, blob); }
  return blob;
}

function lruPut(key, blob) {
  const old = inset.lru.get(key);
  if (old) { inset.lruBytes -= old.size; inset.lru.delete(key); }
  inset.lru.set(key, blob);
  inset.lruBytes += blob.size;
  while (inset.lru.size > INSET_LRU_TILES || inset.lruBytes > INSET_LRU_BYTES) {
    const [k, b] = inset.lru.entries().next().value;
    inset.lru.delete(k);
    inset.lruBytes -= b.size;
  }
}

// Globe-local unit point under an NDC point; rays that miss the globe take
// the nearest point on the limb, so a view showing space still bounds itself.
function insetPointAt(nx, ny, out) {
  _insetRay.setFromCamera(_insetNdc.set(nx, ny), camera);
  const hit = _insetRay.ray.intersectSphere(_insetSphere, out);
  if (!hit) _insetRay.ray.closestPointToPoint(_origin, out);
  out.normalize().applyQuaternion(_insetQ);
  return hit;
}

const mercX = (p) => { const a = Math.atan2(p.z, -p.x) / (2 * Math.PI); return a < 0 ? a + 1 : a; };
const mercY = (p) => {
  const lat = clamp(Math.asin(clamp(p.y, -1, 1)), -MERC_MAX_LAT, MERC_MAX_LAT);
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / (2 * Math.PI);
};

// The visible region in Mercator units, from a 9x9 grid of screen rays. x is
// kept relative to the screen centre in [-0.5, 0.5) so a view across the
// antimeridian stays one contiguous range.
function sampleInsetView() {
  _insetQ.copy(globe.quaternion).invert();
  if (!insetPointAt(0, 0, _insetP)) return null;
  const cx = mercX(_insetP);
  const view = { cx, cy: mercY(_insetP), lat: Math.asin(clamp(_insetP.y, -1, 1)), rx0: 0, rx1: 0, y0: 1, y1: 0 };
  const N = 9;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      insetPointAt((i / (N - 1)) * 2 - 1, (j / (N - 1)) * 2 - 1, _insetP);
      let rx = mercX(_insetP) - cx;
      rx -= Math.round(rx);
      const my = mercY(_insetP);
      view.rx0 = Math.min(view.rx0, rx); view.rx1 = Math.max(view.rx1, rx);
      view.y0 = Math.min(view.y0, my); view.y1 = Math.max(view.y1, my);
    }
  }
  return view;
}

// Tile window at zoom z: visible tiles plus a one-tile margin, or null when
// that footprint doesn't fit the inset texture. tx is unwrapped (it may run
// past either edge of the world); fetches wrap it.
function insetWindowAt(view, z) {
  const n = 1 << z;
  const vx0 = Math.floor((view.cx + view.rx0) * n);
  const vx1 = Math.floor((view.cx + view.rx1) * n);
  const vy0 = clamp(Math.floor(view.y0 * n), 0, n - 1);
  const vy1 = clamp(Math.floor(view.y1 * n), 0, n - 1);
  const tx0 = vx0 - 1;
  const cols = vx1 - vx0 + 3;
  const ty0 = Math.max(0, vy0 - 1);
  const rows = Math.min(n - 1, vy1 + 1) - ty0 + 1;
  if (cols > INSET_TILES || rows > INSET_TILES) return null;
  return { z, n, tx0, ty0, cols, rows, vx0, vx1, vy0, vy1, ccx: view.cx * n, ccy: view.cy * n };
}

// z = ceil(log2(156543 cos(lat) / (mpp q))), clamped to [4, provider max],
// one level lower on a slow network, then dropped until the footprint fits.
// Returns { view, want } with want = null when the inset should be off.
function pickInsetWindow() {
  const view = sampleInsetView();
  if (!view) return { view, want: null };
  const mpp = ((dist - 1) * 6371000 * 2 * Math.tan((FOV / 2) * DEG)) / viewH;
  let z = Math.ceil(Math.log2((156543.03 * Math.cos(view.lat)) / (mpp * INSET_Q)));
  z = clamp(z, INSET_MIN_Z, satProvider.maxZ);
  if (inset.slow) z = Math.max(INSET_MIN_Z, z - 1);
  for (; z >= INSET_MIN_Z; z--) {
    const want = insetWindowAt(view, z);
    if (want) return { view, want };
  }
  return { view, want: null };
}

// Does window `win` already hold every visible tile of `want` (same zoom)?
function insetCovers(win, want) {
  if (!win || !want || win.z !== want.z) return false;
  if (want.vy0 < win.ty0 || want.vy1 > win.ty0 + win.rows - 1) return false;
  return imod(want.vx0 - win.tx0, win.n) + (want.vx1 - want.vx0) <= win.cols - 1;
}

function startInsetWindow(want) {
  const bufs = ensureInsets();
  // Keep whatever shows underneath: a completed top window always, a partly
  // filled one unless the buffer below is complete. Refilling a top that
  // already shows tiles would blank them back to the base.
  const top = bufs[inset.over].win;
  const under = bufs[1 - inset.over].win;
  if (top && (top.ready || (top.loaded > 0 && !(under && under.ready)))) inset.over = 1 - inset.over;
  const buf = bufs[inset.over];
  clearInset(buf);
  buf.mix = 0;
  buf.fadeTo = 1;
  const { z, n } = want;
  const x0 = imod(want.tx0, n) / n;
  buf.bounds.set(x0, want.ty0 / n, x0 + INSET_TILES / n, (want.ty0 + INSET_TILES) / n);
  const win = { ...want, pi: SAT_PROVIDERS.indexOf(satProvider), gen: ++inset.gen, buf, tiles: [], visLeft: 0, allLeft: 0, loaded: 0, ready: false, mipped: false };
  for (let sy = 0; sy < want.rows; sy++) {
    for (let sx = 0; sx < want.cols; sx++) {
      const tx = want.tx0 + sx;
      const ty = want.ty0 + sy;
      const x = imod(tx, n);
      const visible = tx >= want.vx0 && tx <= want.vx1 && ty >= want.vy0 && ty <= want.vy1;
      const tile = {
        x, y: ty, sx, sy, visible,
        k: 0, src: '', url: '', // source: own tile (k = 0) or the ancestor k levels up
        pri: (visible ? 0 : 1000) + Math.hypot(tx + 0.5 - want.ccx, ty + 0.5 - want.ccy),
        state: 0, // 0 idle, 1 decoding / awaiting upload, 2 done (uploaded or given up)
        tries: 0,
      };
      setInsetSrc(win, tile);
      while (inset.missing.has(tile.src) && tile.k < z) { tile.k++; setInsetSrc(win, tile); }
      win.tiles.push(tile);
      win.allLeft++;
      if (visible) win.visLeft++;
    }
  }
  win.tiles.sort((a, b) => a.pri - b.pri);
  buf.win = win;
  // abort fetches the new window doesn't need; the rest land in it
  const srcs = new Set(win.tiles.map((t) => t.src));
  for (const [key, f] of inset.inflight) {
    if (!srcs.has(key)) { f.ctrl.abort(); inset.inflight.delete(key); }
  }
  inset.win = win;
  inset.lastBuild = performance.now();
  feedInsetWindow(win);
}

// R2 holds every tile only at z0-3; z4+ is just the 3x3 around each location
// (scripts/prefetch-eox-tiles.mjs). A tile it doesn't hold is filled from its
// nearest ancestor, cropped and upscaled, so the view stays one EOX mosaic
// instead of stepping to the NASA base at hard tile edges.
function setInsetSrc(win, t) {
  const z = win.z - t.k;
  const x = t.x >> t.k;
  const y = t.y >> t.k;
  t.src = `${win.pi}/${z}/${x}/${y}`;
  t.url = satProvider.url(z, y, x);
}

// Start an idle tile from its source: cached blob, a fetch already in flight
// (it is delivered here when it lands), or the fetch queue in priority order.
// Known-missing sources step up to the parent.
function loadInsetTile(win, t) {
  while (inset.missing.has(t.src)) {
    if (t.k >= win.z) { finishInsetTile(win, t); return; }
    t.k++;
    setInsetSrc(win, t);
  }
  if (inset.inflight.has(t.src)) return;
  const blob = lruGet(t.src);
  if (blob) { decodeInsetTile(win, t, blob); return; }
  const q = inset.queue;
  const i = q.findIndex((o) => o.pri > t.pri);
  q.splice(i < 0 ? q.length : i, 0, t);
}

// Queue every idle tile: straight to decode from the blob cache, else fetch.
function feedInsetWindow(win) {
  inset.queue = [];
  for (const t of win.tiles) if (t.state === 0) loadInsetTile(win, t);
}

function insetsOff() {
  if (inset.win) {
    for (const f of inset.inflight.values()) f.ctrl.abort();
    inset.inflight.clear();
    inset.queue = [];
    inset.win = null;
  }
  if (inset.bufs) for (const b of inset.bufs) b.fadeTo = 0;
}

function finishInsetTile(win, t) {
  if (t.state === 2) return;
  t.state = 2;
  win.allLeft--;
  if (t.visible) win.visLeft--;
  if (!win.ready && win.visLeft === 0) {
    win.ready = true;
    const other = inset.bufs[inset.bufs[0] === win.buf ? 1 : 0];
    other.fadeTo = 0; // crossfade the old window out underneath
  }
  if (!win.mipped && win.allLeft === 0) {
    win.mipped = true;
    setInsetMips(win.buf, true);
  }
}

// A failed tile retries once (after any breaker pause), then is given up so
// the window can complete; the base or older inset shows through there.
function failInsetTile(win, t) {
  t.state = 0;
  if (++t.tries >= INSET_TRIES) finishInsetTile(win, t);
  else if (inset.win === win) loadInsetTile(win, t);
}

// The part of ancestor bitmap `bmp` under tile t, upscaled to a 256 px tile.
// drawImage filters across the crop edge from the real neighbouring pixels,
// so adjacent fallback tiles stay continuous.
let _insetCrop = null;
function cropInsetTile(t, bmp) {
  if (!_insetCrop) _insetCrop = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const ctx = _insetCrop.getContext('2d');
  const m = (1 << t.k) - 1;
  const s = 256 / (1 << t.k);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (t.x & m) * s, (t.y & m) * s, s, s, 0, 0, 256, 256);
  bmp.close();
  return createImageBitmap(_insetCrop);
}

function decodeInsetTile(win, t, blob) {
  t.state = 1;
  const stale = () => inset.win !== win || win.buf.win !== win;
  createImageBitmap(blob)
    .then((bmp) => {
      if (stale()) { bmp.close(); return null; }
      if (bmp.width !== 256 || bmp.height !== 256) { bmp.close(); throw new Error('tile size'); }
      return t.k ? cropInsetTile(t, bmp) : bmp;
    })
    .then((bmp) => {
      if (!bmp) { t.state = 0; return; }
      if (stale()) { bmp.close(); t.state = 0; return; }
      inset.uploads.push({ win, t, bmp });
    }, () => failInsetTile(win, t));
}

// Circuit breaker: 5 consecutive failures or any 429 pause detail loading,
// 60 s doubling per trip (capped at 8 min). Silent; base + current inset stay.
function tripInsetBreaker() {
  inset.fails = 0;
  // the other in-flight requests of a burst land after the trip; one pause per burst
  if (performance.now() < inset.pausedUntil) return;
  inset.trips++;
  inset.pausedUntil = performance.now() + Math.min(60000 * 2 ** (inset.trips - 1), 480000);
}

// Slow network (iOS has no navigator.connection): rolling median latency
// over 1.5 s drops the inset a zoom level and halves concurrency; under 0.6 s
// restores it.
function noteInsetLatency(ms) {
  const l = inset.latency;
  l.push(ms);
  if (l.length > 15) l.shift();
  if (l.length < 5) return;
  const med = [...l].sort((a, b) => a - b)[l.length >> 1];
  if (med > 1500) inset.slow = true;
  else if (med < 600) inset.slow = false;
}

// One fetch per source key; every tile of the current window waiting on that
// source gets the result (several tiles can share an ancestor).
function fetchInsetTile(t) {
  const key = t.src;
  const ctrl = new AbortController();
  const entry = { ctrl };
  inset.inflight.set(key, entry);
  const t0 = performance.now();
  fetch(t.url, { signal: ctrl.signal, mode: 'cors', priority: t.visible ? 'high' : 'low' })
    .then((r) => {
      if (r.status === 429) { tripInsetBreaker(); throw new Error('HTTP 429'); }
      if (r.status === 404) return null; // no tile here (ocean): not a failure
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.blob();
    })
    .then((blob) => {
      noteInsetLatency(performance.now() - t0);
      inset.fails = 0;
      inset.trips = 0;
      if (blob) lruPut(key, blob);
      else inset.missing.add(key);
      // deliver to whichever window wants this source now; a missing source
      // sends its tiles on to the parent (z0-3 always exist, so it ends)
      const win = inset.win;
      if (!win) return;
      for (const tile of win.tiles) {
        if (tile.state !== 0 || tile.src !== key) continue;
        if (blob) decodeInsetTile(win, tile, blob);
        else loadInsetTile(win, tile);
      }
    })
    .catch((err) => {
      if (err.name === 'AbortError') return;
      if (++inset.fails >= 5) tripInsetBreaker();
      if (inset.inflight.get(key) === entry) inset.inflight.delete(key);
      const win = inset.win;
      if (!win) return;
      for (const tile of win.tiles) if (tile.state === 0 && tile.src === key) failInsetTile(win, tile);
    })
    .finally(() => { if (inset.inflight.get(key) === entry) inset.inflight.delete(key); });
}

function pumpInsetFetches(now) {
  if (!inset.win || navigator.onLine === false || now < inset.pausedUntil) return;
  const max = inset.slow ? INSET_FETCHES_SLOW : INSET_FETCHES;
  while (inset.inflight.size < max && inset.queue.length) {
    const t = inset.queue.shift();
    if (t.state !== 0 || inset.inflight.has(t.src)) continue;
    fetchInsetTile(t);
  }
}

// Frame budget: at most 4 tile sub-uploads (texSubImage2D) per frame.
function pumpInsetUploads() {
  for (let done = 0; done < INSET_UPLOADS_PER_FRAME && inset.uploads.length;) {
    const { win, t, bmp } = inset.uploads.shift();
    if (inset.win !== win || win.buf.win !== win) { bmp.close(); t.state = 0; continue; }
    _tileSrc.image = bmp;
    renderer.copyTextureToTexture(_tileSrc, win.buf.rt.texture, null, _tileDst.set(t.sx * 256, t.sy * 256));
    _tileSrc.image = null;
    bmp.close(); // never hoard decoded pixels
    win.loaded++;
    finishInsetTile(win, t);
    done++;
  }
}

// Choose the window for the current view and start, resume, or keep it.
function evaluateInsets(now, drifting) {
  const { view, want } = pickInsetWindow();
  if (!want) { insetsOff(); return; }
  const top = inset.bufs && inset.bufs[inset.over];
  const cur = top && top.win;
  if (insetCovers(cur, want)) {
    if (inset.win !== cur) { // back after an off spell: show it and finish it
      inset.win = cur;
      top.fadeTo = 1;
      feedInsetWindow(cur);
    }
    return;
  }
  // While the globe drifts, only chase it when the view outruns the window
  // or the zoom is two levels off, at most once a second.
  if (drifting && cur && inset.win === cur) {
    if (now - inset.lastBuild < 1000) return;
    if (Math.abs(cur.z - want.z) < 2 && insetCovers(cur, insetWindowAt(view, cur.z))) return;
  }
  startInsetWindow(want);
}

function updateInsets(dt) {
  if (!satProvider || satDisabled || satTarget === 0) return;
  const now = performance.now();
  // camera motion in screen px/s at the centre, and zoom in log-altitude/s
  let speed = 0;
  let zoomRate = 0;
  if (inset.hasPrev && dt > 0) {
    const dYaw = (yaw - inset.prevYaw) * Math.cos(pitch);
    speed = Math.hypot(dYaw, pitch - inset.prevPitch) / dt / radPerPx();
    zoomRate = Math.abs(Math.log((dist - 1) / (inset.prevDist - 1))) / dt;
  }
  inset.prevYaw = yaw; inset.prevPitch = pitch; inset.prevDist = dist; inset.hasPrev = true;
  const easing = Math.abs(Math.log((targetDist - 1) / (dist - 1))) > 0.01;
  const fast = pointers.size > 0 || speed > INSET_FAST_PX_S || zoomRate > 0.4;
  const still = !fast && !easing && speed < INSET_STILL_PX_S && zoomRate < 0.03;
  if (!still) inset.stillSince = -1;
  else if (inset.stillSince < 0) inset.stillSince = now;
  const settled = still && now - inset.stillSince >= INSET_SETTLE_MS;

  if (!fast && (settled || !still) && now - inset.lastCheck > (settled ? 500 : 300)) {
    inset.lastCheck = now;
    evaluateInsets(now, !settled);
  }
  if (!fast) {
    pumpInsetFetches(now);
    pumpInsetUploads();
  }

  if (!inset.bufs) return;
  const u = globeMat.uniforms;
  for (const b of inset.bufs) {
    b.mix = b.fadeTo > b.mix ? Math.min(b.fadeTo, b.mix + dt / INSET_FADE_S) : Math.max(b.fadeTo, b.mix - dt / INSET_FADE_S);
  }
  const top = inset.bufs[inset.over];
  const under = inset.bufs[1 - inset.over];
  u.uInsetA.value = under.rt.texture; u.uInsetBoundsA.value = under.bounds; u.uInsetMixA.value = smoothstep(under.mix);
  u.uInsetB.value = top.rt.texture; u.uInsetBoundsB.value = top.bounds; u.uInsetMixB.value = smoothstep(top.mix);
}

function releaseSatellite() {
  const u = globeMat.uniforms;
  if (u.uSatBase.value !== blankTex) { u.uSatBase.value.dispose(); u.uSatBase.value = blankTex; }
  insetsOff();
  for (const { bmp } of inset.uploads) bmp.close();
  inset.uploads = [];
  if (inset.bufs) { for (const b of inset.bufs) b.rt.dispose(); inset.bufs = null; }
  u.uInsetA.value = u.uInsetB.value = blankTex;
  u.uInsetMixA.value = u.uInsetMixB.value = 0;
}

// WebGL context loss: three restores the context and re-uploads the classic
// and base textures on its own; the insets restart empty and refill on the
// next settle. A second loss in one session turns satellite off for good.
canvas.addEventListener('webglcontextlost', () => {
  inset.losses++;
  insetsOff();
  for (const { bmp } of inset.uploads) bmp.close();
  inset.uploads = [];
  if (inset.bufs) for (const b of inset.bufs) { b.win = null; b.mix = 0; }
  if (inset.losses >= 2 && !satDisabled) {
    satDisabled = true;
    satTarget = satT = 0; // snap to classic; updateSatellite applies it once
    releaseSatellite();
    startDetail(); // classic is showing now, so it needs its detail layers
  }
});

const outlineRevealOpacity = (m) => (1 - Math.pow(1 - m.userData.reveal, 3)) * (m.userData.baseOpacity ?? 1);

// Per frame: stream the insets, ease the crossfade and fade the coast/lake/
// river overlays out under the imagery. Answer outlines, pins and arcs are
// not touched.
function updateSatellite(dt) {
  updateInsets(dt);
  if (satT === satTarget && satT === satApplied) return;
  satT = satTarget > satT ? Math.min(satTarget, satT + dt / SAT_FADE_S) : Math.max(satTarget, satT - dt / SAT_FADE_S);
  satApplied = satT;
  const s = smoothstep(satT);
  globeMat.uniforms.uSatMix.value = s;
  for (const m of outlineMaterials) {
    m.visible = s < 1;
    const opaque = s === 0 && m.userData.reveal >= 1 && (m.userData.baseOpacity ?? 1) >= 1;
    if (m.transparent === opaque) { m.transparent = !opaque; m.needsUpdate = true; }
    m.opacity = outlineRevealOpacity(m) * (1 - s);
  }
  if (satCreditEl) satCreditEl.classList.toggle('show', s > 0);
  document.body.classList.toggle('sat-on', s > 0);
}

// test hook: inset state for headless checks
window.__sat = {
  get provider() { return satProvider && satProvider.credit; },
  get mix() { return globeMat.uniforms.uSatMix.value; },
  get inset() {
    const w = inset.win;
    return {
      size: INSET_SIZE, gen: w && w.gen,
      z: w && w.z, cols: w && w.cols, rows: w && w.rows,
      tiles: w && w.tiles.length, fallback: w && w.tiles.filter((t) => t.k).length, visLeft: w && w.visLeft, allLeft: w && w.allLeft,
      ready: !!(w && w.ready), mipped: !!(w && w.mipped),
      inflight: inset.inflight.size, queued: inset.queue.length, uploads: inset.uploads.length,
      lru: inset.lru.size, lruKB: Math.round(inset.lruBytes / 1024),
      slow: inset.slow, latency: [...inset.latency].sort((a, b) => a - b).map(Math.round), pausedFor: Math.max(0, Math.round(inset.pausedUntil - performance.now())),
      mixA: globeMat.uniforms.uInsetMixA.value, mixB: globeMat.uniforms.uInsetMixB.value,
    };
  },
};

let landReveal = 0;
let landLoaded = false;

// lakes-10m.geo.json is built from Natural Earth 10m lakes;
// rivers-10m-scalerank.geo.json from Natural Earth 10m rivers (all 655,
// per-feature scalerank; production uses scalerank <= 7). world-10m.geo.json
// detailed 10m coastlines; world.geo.json is still loaded for the land fill.
// The page loads the *.topo.json versions (build/make-topojson.mjs): same
// coordinates, quantized on the source's 1e-4 degree grid, ~2x smaller.
// islands.topo.json (build/make-islands.mjs): OSM outlines for island pins
// Natural Earth is too coarse to draw, already simplified at build time.
const getJSON = (url, init) => fetch(url, init).then((r) => (r.ok ? r.json() : Promise.reject(new Error(url + ' ' + r.status))));

// ---------------------------------------------------------------------------
// Asset loading with progress
// ---------------------------------------------------------------------------
// Two phases, each with its own bar:
//  - critical: land fill + islands + locations (~2 MB). That is everything a
//    round needs, so the boot screen's bar covers only these bytes and the
//    game is revealed, playable, the moment they're built.
//  - detail: 10m coast, then lakes + rivers (~4 MB). Purely visual, fetched
//    at low priority only after the critical bytes are in (so they never
//    compete for bandwidth), drawn onto the live globe as each lands. The
//    slim pill on the start screen shows this phase.
// Every file streams through loadJSON so the bars track real bytes.
// Sizes are decoded bytes, the denominator until a response reports its own.
// Vercel compresses JSON, so its Content-Length is the compressed size and
// can't be compared with streamed (decoded) bytes. deploy.sh restamps these
// from the shipped files; drift only skews the bar, it is corrected per file
// on completion.
// Repeat visits: deploy.sh appends ?v=<content hash> to each asset URL, which
// vercel.json serves as immutable, so unchanged assets come straight from the
// HTTP cache with no revalidation round trip.
const LOAD = {
  land: { url: 'assets/world.topo.json', size: 970247 },
  islands: { url: 'assets/islands.topo.json', size: 4605 },
  locations: { url: 'assets/locations.json', size: 1069753 },
  coast: { url: 'assets/world-10m.topo.json', size: 1681949 },
  lakes: { url: 'assets/lakes-10m.topo.json', size: 726015 },
  rivers: { url: 'assets/rivers-10m-scalerank.topo.json', size: 1782934 },
  pins: { url: 'assets/daily-pins.json', size: 18 },
  // Lazy, in no load phase: the reveal outline and Borders mode (see "Country outlines")
  countries: { url: 'assets/country-outlines.topo.json', size: 1211450 },
  countryBands: { url: 'assets/country-bands.json', size: 2855 },
};
for (const entry of Object.values(LOAD)) { entry.loaded = 0; entry.done = false; entry.built = false; }

function loadJSON(entry, init) {
  return fetch(entry.url, init)
    .then(async (r) => {
      if (!r.ok) throw new Error(entry.url + ' ' + r.status);
      const len = Number(r.headers.get('content-length'));
      if (len > 0 && !r.headers.get('content-encoding')) entry.size = len;
      if (!r.body || !r.body.getReader) return r.json(); // no streaming: jumps at the end
      const reader = r.body.getReader();
      const chunks = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        entry.loaded += value.byteLength;
        if (entry.loaded > entry.size) entry.size = entry.loaded;
        queueLoadRender();
      }
      return JSON.parse(await new Blob(chunks).text());
    })
    .then((data) => {
      entry.size = entry.loaded = entry.loaded || entry.size;
      entry.done = true;
      queueLoadRender();
      return data;
    }, (err) => {
      entry.size = entry.loaded; // drop the failed remainder from the total
      entry.done = true;
      queueLoadRender();
      throw err;
    });
}

// A phase finishes when its jobs do: bytes landing is not enough, the layers
// (and the location list) also have to be built.
const bootEl = document.getElementById('boot');
const pillEl = document.getElementById('load-pill');
const phaseEls = (root) => ({
  stage: root ? root.querySelectorAll('.load-stage') : [],
  fill: root ? root.querySelectorAll('.load-fill') : [],
  bar: root ? root.querySelectorAll('.load-bar') : [],
  pct: root ? root.querySelectorAll('.load-pct') : [],
  mb: root ? root.querySelectorAll('.load-mb') : [],
});
const LOAD_PHASES = {
  critical: {
    entries: [LOAD.land, LOAD.islands, LOAD.locations],
    jobs: new Set(['map', 'locations']),
    els: phaseEls(bootEl),
    stageText() {
      if (!LOAD.land.done) return 'Loading world map…';
      if (!LOAD.locations.done) return 'Loading places…';
      return 'Almost there…';
    },
  },
  detail: {
    entries: [LOAD.coast, LOAD.lakes, LOAD.rivers],
    // On a fast connection these bytes land while the critical build still
    // holds the main thread, so the pill's visible life is mostly the layer
    // builds. Bytes fill the first half of the bar, each layer's build (weighted
    // by its size) the second, or the bar sat frozen and then jumped to 100%.
    builds: true,
    jobs: new Set(['detail']),
    els: phaseEls(pillEl),
    stageText() {
      return LOAD.coast.done ? 'Adding rivers & lakes…' : 'Sharpening coastlines…';
    },
  },
};
for (const phase of Object.values(LOAD_PHASES)) { phase.finished = false; phase.shown = 0; }
let globeRevealed = false;
let loadRenderQueued = false;

function queueLoadRender() {
  if (loadRenderQueued) return;
  loadRenderQueued = true;
  requestAnimationFrame(() => { loadRenderQueued = false; renderLoad(); });
}

function renderPhase(phase) {
  let loaded = 0;
  let total = 0;
  let built = 0;
  for (const entry of phase.entries) {
    loaded += entry.loaded;
    total += entry.size;
    if (entry.built) built += entry.size;
  }
  // progress in bytes, plus the built layers' bytes again for a building phase
  const progress = loaded + built;
  const span = phase.builds ? 2 * total : total;
  // Ease the shown progress toward the real one (20% of the gap per frame), so
  // a burst of chunks glides instead of jumps. Once every byte is in, snap:
  // a layer build is about to block the main thread, and the fill's CSS
  // transform transition runs on the compositor, so it still glides there.
  if (phase.entries.every((entry) => entry.done)) {
    phase.shown = progress;
  } else if (Math.abs(progress - phase.shown) > 1000) {
    phase.shown += (progress - phase.shown) * 0.2;
    queueLoadRender(); // keep animating until caught up
  } else {
    phase.shown = progress;
  }
  // hold at 99% while the last layers build, so 100% means really ready
  const frac = phase.finished ? 1 : Math.min(0.99, span ? phase.shown / span : 0);
  const pct = Math.round(frac * 100);
  // the MB readout counts downloaded bytes only
  const mb = (phase.finished ? total : Math.min(phase.shown, loaded)) / 1e6;
  const stage = phase.finished ? 'Ready' : phase.stageText();
  const { els } = phase;
  els.stage.forEach((el) => { if (el.textContent !== stage) el.textContent = stage; });
  els.fill.forEach((el) => { el.style.transform = `scaleX(${frac})`; });
  els.bar.forEach((el) => el.setAttribute('aria-valuenow', String(pct)));
  els.pct.forEach((el) => { el.textContent = pct + '%'; });
  els.mb.forEach((el) => { el.textContent = `${mb.toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`; });
}

function renderLoad() {
  if (bootEl) bootEl.classList.remove('pending');
  renderPhase(LOAD_PHASES.critical);
  renderPhase(LOAD_PHASES.detail);
}

function loadJobDone(phaseName, job) {
  const phase = LOAD_PHASES[phaseName];
  phase.jobs.delete(job);
  if (phase.jobs.size || phase.finished) return;
  phase.finished = true;
  renderLoad();
  if (phase === LOAD_PHASES.critical) revealGlobe();
  else if (pillEl) {
    pillEl.classList.add('done');
    setTimeout(() => { pillEl.classList.remove('on'); }, 700);
  }
}

// Boot screen out, playable globe in. Called once the critical phase is done
// (or failed, so the error banner isn't left behind a loading screen).
function revealGlobe() {
  if (globeRevealed) return;
  globeRevealed = true;
  if (bootEl) {
    bootEl.classList.add('done');
    setTimeout(() => { bootEl.hidden = true; }, 600);
  }
  // CSS delays the pill's fade-in, so detail that's nearly done (or already
  // cached) never flashes it
  if (pillEl && detailStarted && !LOAD_PHASES.detail.finished) pillEl.classList.add('on');
}

// Let the browser paint the previous stage before the next CPU-heavy build.
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
// Detail builds block the main thread for a second or more each on a phone.
// Before one starts, paint the pill's new value and give the fill's .35s
// transition time to finish: an engine that doesn't run it off the main
// thread would otherwise hold the bar where it was until the build ends.
// Detail is background work, so the short wait costs nothing visible.
const settleDetailBar = (entry) => {
  if (entry) entry.built = true;
  queueLoadRender();
  return nextPaint().then(() => new Promise((resolve) => setTimeout(resolve, 350)));
};

// Decode delta arcs ourselves as (q + t/s) / 1e4: division is correctly
// rounded, so points are bit-identical to parsing the original GeoJSON
// (topojson's q * 1e-4 + t leaves float noise that nudges the simplifier).
function topoFeatures(topo) {
  const { scale, translate } = topo.transform;
  const k = 1 / scale[0];
  const tx = Math.round(translate[0] * k);
  const ty = Math.round(translate[1] * k);
  const arcs = topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => [((x += dx) + tx) / k, ((y += dy) + ty) / k]);
  });
  return topoFeature({ ...topo, transform: undefined, arcs }, topo.objects.data);
}
const getTopo = (entry, init) => loadJSON(entry, init).then(topoFeatures);
// Map lab: density preview tool for the rivers/lakes lab page. Completely
// inert unless the page is loaded with ?maplab in the URL; then it listens
// for postMessage({type:'maplab', rivers, lakes}) from the embedding page and
// rebuilds the river/lake outline layers at the requested density.
const mapLab = {
  on: new URLSearchParams(location.search).has('maplab'),
  lakeMesh: null,
  lakeMeshDim: null,
  riverMesh: null,
};
// Critical fetches start now at high priority; locations.json is consumed at
// the bottom of the file, where it gates the play buttons.
const landP = getTopo(LOAD.land, { priority: 'high' });
// optional: the globe still works (minus small islands) if this one fails
const islandsP = getTopo(LOAD.islands, { priority: 'high' }).catch(() => ({ features: [] }));
const locationsP = loadJSON(LOAD.locations, { priority: 'high', ...(RESET_DAILY ? { cache: 'reload' } : {}) });
// Detail waits for every critical byte, then all three stream together.
// Each phase's layer builds also wait for that phase's last byte: a build
// blocks the main thread, and doing one while other files still stream froze
// the bar and then jumped it (the "two big chunks").
const criticalBytesP = Promise.allSettled([landP, islandsP, locationsP]);
// consumed at the bottom of the file; mark handled so a failure there doesn't
// also raise an unhandled-rejection banner
locationsP.catch(() => {});
// Pinned daily games (deploy.sh records every in-play date before shipping).
// Required like locations.json: computing a pinned date instead could change
// a game players have already seen.
const pinsP = loadJSON(LOAD.pins, RESET_DAILY ? { cache: 'reload' } : undefined);
pinsP.catch(() => {});

// Critical: the land fill (with OSM islands) is all a round needs on the globe.
async function loadLand() {
  await criticalBytesP;
  await nextPaint();
  const [geo, islands] = await Promise.all([landP, islandsP]);
  const tex = buildLandTexture(geo, islands);
  globeMat.uniforms.uMap.value = tex;
  landLoaded = true;
  if (window.__boot) window.__boot('land loaded');
  return { tex, islands };
}

// Detail: drawn onto the live globe in the background, each layer as it lands.
async function loadDetail({ tex, islands }, { coastP, lakesP, riversP, detailBytesP }) {
  // Internal country borders hidden: coastlines only, keeps the challenge in
  // your geography, not in reading lines. (Border data stays in the GeoJSON
  // for a future practice mode.) Big-lake shores count as coastline, and so
  // do the OSM islands, which skip cleanCoast's MIN_ISLAND rule.
  await detailBytesP;
  const geo10m = await coastP;
  await settleDetailBar();
  const coast = [
    ...cleanCoast(geo10m.features.find((f) => f.properties.kind === 'coast').geometry.coordinates),
    ...islands.features.flatMap((f) => f.geometry.coordinates.map(([ring]) => ring)),
  ];
  addCoastGlow(tex, coast); // uploaded with the lakes pass below
  globe.add(buildOutline(coast, 1.002, { color: '#7fd2f4', width: 0.78, opacity: 0.92 }));
  if (window.__boot) window.__boot('coast loaded');

  // Lakes: largest 20 get the bright shoreline, the rest a softer dim line.
  // if lakes fail, still upload the glow
  const lakes = await lakesP.catch((err) => { tex.needsUpdate = true; throw err; });
  await settleDetailBar(LOAD.coast);
  // area once per lake: a comparator that rescans every ring per comparison
  // made this sort a large part of the lakes build
  const areas = new Map(lakes.features.map((f) => [f, lakeArea(f)]));
  const sortedLakes = [...lakes.features].sort((a, b) => areas.get(b) - areas.get(a));
  const bigLakeLines = cleanCoast(lakeRings({ features: sortedLakes.slice(0, 20) }));
  const smallLakeLines = cleanCoast(lakeRings({ features: sortedLakes.slice(20) }));
  knockOutLakes(tex, lakes);
  tex.needsUpdate = true;
  mapLab.lakeMesh = buildOutline(bigLakeLines, 1.002, { color: '#5f9fd0', width: 0.8, opacity: 0.45 });
  mapLab.lakeMeshDim = buildOutline(smallLakeLines, 1.002, { color: '#5f9fd0', width: 0.8, opacity: 0.28 });
  globe.add(mapLab.lakeMesh);
  globe.add(mapLab.lakeMeshDim);

  // Rivers: 655 Natural Earth features with per-feature scalerank; use <= 7.
  const rivers = await riversP;
  await settleDetailBar(LOAD.lakes);
  const riverCoords = [];
  for (const f of rivers.features)
    if (f.properties.scalerank <= 7) riverCoords.push(...f.geometry.coordinates);
  mapLab.riverMesh = buildOutline(cleanCoast(riverCoords), 1.002, { color: '#4a86b8', width: 0.6, opacity: 0.3 });
  globe.add(mapLab.riverMesh);
  LOAD.rivers.built = true;

  if (window.__boot) window.__boot('map data loaded');
  if (mapLab.on) initMapLab(lakes, rivers);
}

const landReady = loadLand();
landReady
  .catch((err) => {
    console.error('failed to load land data', err);
    if (window.__showErr) window.__showErr('MAPDATA: ' + (err && err.message ? err.message : err));
  })
  .finally(() => loadJobDone('critical', 'map'));
// Satellite skips the detail layers (10m coast + lakes + rivers, ~4 MB): the
// imagery already shows them, and the vector lines on top are just noise. They
// load only when classic shows: ?map=classic, satellite failing to come up, a
// second context loss turning it off, or the ?maplab tool (which edits them).
let detailStarted = false;
function startDetail() {
  if (detailStarted) return;
  detailStarted = true;
  const detailP = (entry) => criticalBytesP.then(() => getTopo(entry, { priority: 'low' }));
  const coastP = detailP(LOAD.coast);
  const lakesP = detailP(LOAD.lakes);
  const riversP = detailP(LOAD.rivers);
  const detailBytesP = Promise.allSettled([coastP, lakesP, riversP]);
  // awaited in order in loadDetail; mark handled so an early failure doesn't
  // also raise unhandled-rejection banners for the later stages
  for (const p of [coastP, lakesP, riversP]) p.catch(() => {});
  // started after the boot reveal (satellite fell back): show the pill now
  if (globeRevealed && pillEl && !LOAD_PHASES.detail.finished) pillEl.classList.add('on');
  // a land failure is already reported above; detail just stands down
  landReady
    .then((land) => loadDetail(land, { coastP, lakesP, riversP, detailBytesP }), () => {})
    .catch((err) => {
      console.error('failed to load map detail', err);
      if (window.__showErr) window.__showErr('MAPDETAIL: ' + (err && err.message ? err.message : err));
    })
    .finally(() => loadJobDone('detail', 'detail'));
}
satReady.then((satOn) => { if (!satOn || mapLab.on) startDetail(); });

// ---------------------------------------------------------------------------
// Country outlines (docs/country-outlines-plan-opus.md): the answer country's
// border on every reveal, and the tap geometry for Borders mode. Only the
// answer's border is ever drawn, never a second country's (Sean's rule).
// country-outlines.topo.json (build/make-country-outlines.mjs) holds 261 Natural
// Earth units; topo.keys maps each game key to its units, topo.cut lists the
// antimeridian seam arcs (hit-test only, never stroked). Lazy: fetched at low
// priority once the critical bytes are in, decoded on idle, in no load phase.
// ---------------------------------------------------------------------------
const whenIdle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 0));
let countryData = null; // { arcs, cut, units, keys, keyOf }
let countryBands = null; // { key: band 1-10 }, build/make-country-bands.py
const countryGeoms = new Map();

function decodeCountries(topo) {
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

function ringBox(pts) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) {
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }
  return b;
}

function mergeBoxes(boxes) {
  return boxes.reduce((m, b) => [Math.min(m[0], b[0]), Math.min(m[1], b[1]), Math.max(m[2], b[2]), Math.max(m[3], b[3])],
    [Infinity, Infinity, -Infinity, -Infinity]);
}

// A game key's merged geometry: its member units' polygons, and the arcs to
// stroke (minus seams, and minus borders between members such as
// Somalia/Somaliland, which appear once in each member).
function countryGeom(key) {
  if (!countryData || !countryData.keys[key]) return null;
  let geom = countryGeoms.get(key);
  if (geom) return geom;
  const units = countryData.keys[key].map((id) => countryData.units.find((u) => u.id === id));
  const uses = new Map();
  for (const u of units) for (const poly of u.polys) for (const r of poly) for (const i of r.refs) {
    const a = i >= 0 ? i : ~i;
    uses.set(a, (uses.get(a) || 0) + 1);
  }
  const rings = units.flatMap((u) => u.polys.flat());
  const box = mergeBoxes(units.map((u) => u.box));
  const diagKm = distanceKm({ lat: box[1], lng: box[0] }, { lat: box[3], lng: box[2] });
  geom = { key, units, rings, box, diagKm, skip: (a) => countryData.cut.has(a) || uses.get(a) > 1 };
  countryGeoms.set(key, geom);
  return geom;
}

// Stroke polylines for a key. Rings under MIN_ISLAND are skipped like the
// coast's, except near the anchor (the answer, or the tap) and for countries
// that are all small rings (Tuvalu, Nauru), which draw in full.
function countryLines(geom, anchor) {
  const allSmall = geom.rings.every((r) => r.ext < MIN_ISLAND);
  const near = (b) => anchor && anchor.lng > b[0] - 0.5 && anchor.lng < b[2] + 0.5 && anchor.lat > b[1] - 0.5 && anchor.lat < b[3] + 0.5;
  const lines = [];
  for (const r of geom.rings) {
    if (!allSmall && r.ext < MIN_ISLAND && !near(r.box)) continue;
    let line = null;
    for (const i of r.refs) {
      const a = i >= 0 ? i : ~i;
      if (geom.skip(a)) { line = null; continue; }
      const arc = i >= 0 ? countryData.arcs[a] : countryData.arcs[a].slice().reverse();
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
const COUNTRY_LAYERS = [
  { color: ANSWER_COLOR, width: 5, opacity: 0.22, ref: 1 },
  { color: '#b9f7ff', width: 1.6, opacity: 1, ref: 2 },
];
let countryOutline = null; // { group, mats, geom, reveal }
let countryOutlineWant = null; // { key, anchor, fade } until the data lands

function buildCountryOutline(lines) {
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
    mat.resolution.set(viewW, viewH);
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

function placeCountryOutline({ key, anchor, fade }) {
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
function showCountryOutline(key, anchor, fade) {
  countryOutlineWant = { key, anchor: anchor && { lat: anchor.lat, lng: anchor.lng }, fade };
  if (countryData) placeCountryOutline(countryOutlineWant);
}

function clearCountryOutline() {
  countryOutlineWant = null;
  if (!countryOutline) return;
  globe.remove(countryOutline.group);
  for (const mesh of countryOutline.group.children) outlineMeshes.splice(outlineMeshes.indexOf(mesh), 1);
  countryOutline.geo.dispose();
  countryOutline.mats.forEach((m) => m.dispose());
  countryOutline = null;
}

const _cornerA = new THREE.Vector3();
const _cornerB = new THREE.Vector3();
function updateCountryOutline(dt) {
  const o = countryOutline;
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

const countriesP = criticalBytesP
  .then(() => loadJSON(LOAD.countries, { priority: 'low' }))
  .then((topo) => new Promise((resolve) => whenIdle(() => resolve(decodeCountries(topo)))))
  .then((data) => {
    countryData = data;
    if (countryOutlineWant) placeCountryOutline({ ...countryOutlineWant, fade: true });
  });
countriesP.catch((err) => console.error('[outlines] failed to load', err));
const countryBandsP = criticalBytesP
  .then(() => loadJSON(LOAD.countryBands, { priority: 'low' }))
  .then((data) => { countryBands = data.bands; });
countryBandsP.catch((err) => console.error('[outlines] failed to load bands', err));

// Borders mode hit test (plan §3.2), on the game key's merged units.
function pointInRing(lng, lat, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inBox = (b, lng, lat, pad = 0) => lng >= b[0] - pad && lng <= b[2] + pad && lat >= b[1] - pad && lat <= b[3] + pad;

function inUnit(u, lng, lat) {
  if (!inBox(u.box, lng, lat)) return false;
  return u.polys.some((poly) => inBox(poly[0].box, lng, lat) && pointInRing(lng, lat, poly[0].pts)
    && !poly.slice(1).some((hole) => pointInRing(lng, lat, hole.pts)));
}

// Nearest point of the key's border to p, great-circle km. With maxKm, rings
// whose box (padded by maxKm) misses p are skipped.
function nearestBorder(geom, p, maxKm = Infinity) {
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

const SMALL_TARGET_KM = 30;
// -> { hit, near: nearest border point, km to it, tapped: unit name or null (ocean) }
function bordersHit(key, p, tolKm) {
  const geom = countryGeom(key);
  const own = geom.units.find((u) => inUnit(u, p.lng, p.lat));
  if (own) return { hit: true, km: 0, near: null, ring: ringAt(geom, p), tapped: null };
  const near = nearestBorder(geom, p);
  const hit = { hit: true, km: near.km, near, ring: null, tapped: null };
  if (geom.diagKm < SMALL_TARGET_KM && near.km <= tolKm) return hit; // the Vatican sits inside Italy
  const other = countryData.units.find((u) => !geom.units.includes(u) && inUnit(u, p.lng, p.lat));
  if (other) {
    const key2 = countryData.keyOf.get(other.id);
    const tapped = !key2 || key2 === other.name ? other.name : `${other.name} (${key2})`;
    return { hit: false, km: near.km, near, tapped };
  }
  if (near.km <= tolKm) return hit; // coast, atoll, or a sliver lost to simplification
  return { hit: false, km: near.km, near, tapped: null };
}

function ringAt(geom, p) {
  return geom.rings.find((r) => inBox(r.box, p.lng, p.lat) && pointInRing(p.lng, p.lat, r.pts)) || null;
}

// Rivers/lakes density lab (?maplab). Rebuilds the lake-shore and river
// outline layers on the live globe at the requested density. Only wired up
// when the page is loaded with ?maplab, so normal gameplay is untouched.
function initMapLab(lakes, rivers) {
  // Lab view: hide all game UI so the bare globe is visible and spinnable.
  const gameMain = document.getElementById('game');
  if (gameMain) gameMain.style.display = 'none';
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'none';
  // lakes-10m features sorted largest-first (bbox area); the lab shows the top N.
  const lakeFeats = [...lakes.features].sort((a, b) => lakeArea(b) - lakeArea(a));

  // Swap one outline layer, showing it immediately (the boot reveal fade is
  // long done by the time the lab runs, so new materials must not start at 0).
  function swap(which, lines, opts) {
    const old = which === 'lake' ? mapLab.lakeMesh
      : which === 'lakedim' ? mapLab.lakeMeshDim : mapLab.riverMesh;
    const nu = buildOutline(lines, 1.002, opts);
    nu.material.opacity = nu.material.userData.baseOpacity ?? 1;
    nu.material.userData.reveal = 1;
    globe.remove(old);
    const i = outlineMaterials.indexOf(old.material);
    if (i >= 0) outlineMaterials.splice(i, 1);
    old.geometry.dispose();
    old.material.dispose();
    globe.add(nu);
    if (which === 'lake') mapLab.lakeMesh = nu;
    else if (which === 'lakedim') mapLab.lakeMeshDim = nu;
    else mapLab.riverMesh = nu;
  }

  const api = {
    async setLakes(n) {
      const feats = n > 0 ? lakeFeats.slice(0, n) : [];
      // Same bright/dim split as production: top 20 bright, rest dim.
      swap('lake', cleanCoast(lakeRings({ features: feats.slice(0, 20) })), { color: '#5f9fd0', width: 0.8, opacity: 0.45 });
      swap('lakedim', cleanCoast(lakeRings({ features: feats.slice(20) })), { color: '#5f9fd0', width: 0.8, opacity: 0.28 });
      return feats.length;
    },
    async setRivers(maxSr) {
      // Rivers come pre-loaded via getTopo (no extra fetch); filter by scalerank.
      const coords = [];
      if (maxSr > 0)
        for (const f of rivers.features)
          if (f.properties.scalerank <= maxSr) coords.push(...f.geometry.coordinates);
      swap('river', cleanCoast(coords), { color: '#4a86b8', width: 0.6, opacity: 0.3 });
      return maxSr > 0 ? rivers.features.filter((f) => f.properties.scalerank <= maxSr).length : 0;
    },
  };
  window.__maplab = api;
  const pending = [];
  let ready = true;
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'maplab') return;
    pending.push({ d, src: e.source });
    if (ready) drain();
  });
  async function drain() {
    ready = false;
    while (pending.length) {
      const { d, src } = pending.shift();
      let rivers = null, lakes = null;
      try {
        if (d.lakes !== undefined) lakes = await api.setLakes(d.lakes);
        if (d.rivers !== undefined) rivers = await api.setRivers(d.rivers);
      } catch (err) {
        console.error('maplab failed', err);
      }
      try { src.postMessage({ type: 'maplab-done', rivers, lakes }, '*'); } catch (_) {}
    }
    ready = true;
  }
  // Apply any initial density requested via the query string (?maplab&rivers=5&lakes=300).
  const q = new URLSearchParams(location.search);
  const init = {};
  if (q.has('rivers')) init.rivers = parseInt(q.get('rivers'), 10) || 0;
  if (q.has('lakes')) init.lakes = parseInt(q.get('lakes'), 10) || 0;
  if (init.rivers !== undefined || init.lakes !== undefined) {
    pending.push({ d: { type: 'maplab', ...init }, src: window.parent });
    drain();
  }
}

// ---------------------------------------------------------------------------
// Pin
// ---------------------------------------------------------------------------
// round (1-5) adds a number disc to the badge for the post-game review
function makeBadgeTexture(kind, round = 0) {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 72;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(3,10,22,.88)';
  g.strokeStyle = '#fff';
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(4, 4, 152, 64, 30);
  g.fill();
  g.stroke();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let x = 80;
  if (round) {
    g.beginPath();
    g.arc(36, 36, 21, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(3,10,22,1)';
    g.font = 'bold 30px sans-serif';
    g.fillText(String(round), 36, 38);
    g.fillStyle = '#fff';
    x = 102;
  }
  g.font = kind === 'answer' ? 'bold 42px sans-serif' : `bold ${round ? 25 : 29}px sans-serif`;
  g.fillText(kind === 'answer' ? '\u2713' : 'YOU', x, 38);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}
const guessBadgeTex = makeBadgeTexture('guess');
const answerBadgeTex = makeBadgeTexture('answer');

const CAP_RADIUS = 0.075; // angular radius of the pulse rings at zoom scale 1
const capGeometry = new THREE.SphereGeometry(1.0025, 72, 18, 0, Math.PI * 2, 0, 0.25);
const stemGeometry = new THREE.CylinderGeometry(0.0026, 0.0026, 1, 8, 1, true).translate(0, 0.5, 0);

const REST_H = 0.072;
const DROP_H = 0.34;
const LAND_T = 0.36;

class Pin {
  constructor({ color = PIN_COLOR, badge = guessBadgeTex, answer = false } = {}) {
    this.color = color;
    this.isAnswer = answer;
    this.root = new THREE.Group();
    this.root.visible = false;
    this.tip = new THREE.Group();
    this.tip.position.set(0, 1, 0);
    this.root.add(this.tip);

    this.capMat = new THREE.ShaderMaterial({
      uniforms: {
        uT: { value: 0 },
        uRadius: { value: CAP_RADIUS },
        uOpacity: { value: 1 },
        uColor: { value: color },
        uPulse: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uT;
        uniform float uRadius;
        uniform float uOpacity;
        uniform vec3 uColor;
        uniform float uPulse;
        varying vec3 vPos;
        void main() {
          float r = acos(clamp(normalize(vPos).y, -1.0, 1.0)) / uRadius;
          if (r > 1.0) discard;
          float since = uT - ${LAND_T.toFixed(3)};
          float landed = step(0.0, since);
          since = max(since, 0.0);
          float a = 0.0;
          a += exp(-r * r * 140.0) * 0.9 * landed;           // contact point
          a += exp(-r * r * 14.0) * 0.16 * landed;           // soft pool
          float on = smoothstep(0.15, 0.7, since) * uPulse;
          for (int i = 0; i < 2; i++) {                      // repeating pulse rings
            float p = fract(since * 0.48 + float(i) * 0.5);
            float rr = 0.06 + p * 0.9;
            float w = 0.022 + p * 0.05;
            a += pow(1.0 - p, 2.0) * smoothstep(w, 0.0, abs(r - rr)) * 0.7 * on;
          }
          float s = clamp(since / 0.85, 0.0, 1.0);           // landing shockwave
          float sr = 1.0 - pow(1.0 - s, 3.0);
          a += pow(1.0 - s, 2.0) * smoothstep(0.06, 0.0, abs(r - sr * 0.97)) * 1.3 * landed;
          a *= smoothstep(1.0, 0.82, r) * uOpacity;
          vec3 col = mix(uColor, vec3(1.0, 0.97, 0.9), exp(-r * r * 160.0));
          gl_FragColor = vec4(col * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.cap = new THREE.Mesh(capGeometry, this.capMat);
    this.cap.renderOrder = 3;
    this.root.add(this.cap);

    this.stemMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `
        varying float vY;
        void main() {
          vY = uv.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vY;
        void main() {
          float a = mix(0.25, 0.95, vY) * uOpacity;
          gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.95, 0.85), vY * 0.5) * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stem = new THREE.Mesh(stemGeometry, this.stemMat);
    this.stem.renderOrder = 4;
    this.tip.add(this.stem);

    // These used to be additive canvas sprites. Their transparent texels could
    // produce dark, stippled fringes on some mobile/WebGL compositors. Simple
    // untextured geometry is deliberately less flashy, but completely clean.
    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: answer ? 0.24 : 0.18, depthWrite: false }),
    );
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 10),
      new THREE.MeshBasicMaterial({ color: answer ? '#d9fbff' : '#ffc568', depthWrite: false }),
    );
    this.badge = new THREE.Sprite(new THREE.SpriteMaterial({
      map: badge,
      color,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }));
    this.halo.renderOrder = this.core.renderOrder = 5;
    this.badge.renderOrder = 8;
    this.tip.add(this.halo, this.core, this.badge);

    this.t = 0;
    this.state = 'idle'; // idle | live | out
    this.outT = 0;
    this.dim = 1; // target opacity multiplier (review mode dims unselected rounds)
    this.dimNow = 1;
  }

  // Swaps the tint without touching the shared PIN_COLOR / ANSWER_COLOR objects
  // the uniforms were built with.
  setColor(color, core = this.isAnswer ? '#d9fbff' : '#ffc568') {
    this.capMat.uniforms.uColor.value = color;
    this.stemMat.uniforms.uColor.value = color;
    this.halo.material.color.set(color);
    this.core.material.color.set(core);
    this.badge.material.color.set(color);
  }

  drop(normal) {
    this.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    this.root.visible = true;
    this.state = 'live';
    this.t = 0;
  }

  release() {
    if (this.state !== 'live') return;
    this.state = 'out';
    this.outT = 0;
  }

  update(dt, time, scale) {
    if (this.state === 'idle') return;
    this.t += dt;
    let fade = 1;
    let shrink = 1;
    if (this.state === 'out') {
      this.outT += dt;
      const u = clamp(this.outT / 0.28, 0, 1);
      fade = 1 - u * u;
      shrink = 1 - 0.5 * u;
      if (u >= 1) {
        this.state = 'idle';
        this.root.visible = false;
        return;
      }
    }
    this.dimNow += (this.dim - this.dimNow) * (1 - Math.exp(-10 * dt));
    fade *= this.dimNow;

    const t = this.t;
    this.tip.visible = t >= 0; // a staggered drop (t < 0) waits unseen; the core ignores opacity
    let h;
    let flash = 0;
    if (t < LAND_T) {
      const u = t / LAND_T;
      h = DROP_H - (DROP_H - REST_H) * u * u; // gravity fall
    } else {
      const s = t - LAND_T;
      h = REST_H + 0.014 * Math.sin(s * 21) * Math.exp(-s * 8); // springy settle
      flash = Math.exp(-s * 7);
    }
    const appear = clamp(t / 0.14, 0, 1);
    const breathe = 1 + 0.07 * Math.sin(time * 3.1);

    this.tip.scale.setScalar(scale * shrink);
    this.capMat.uniforms.uT.value = t;
    this.capMat.uniforms.uRadius.value = CAP_RADIUS * scale;
    this.capMat.uniforms.uOpacity.value = fade;

    this.stem.scale.set(1, h, 1);
    this.stemMat.uniforms.uOpacity.value = appear * fade;

    this.halo.position.y = this.core.position.y = h;
    this.badge.position.set(this.isAnswer ? 0.047 : -0.052, h + 0.028, 0);
    this.badge.scale.set(0.075, 0.034, 1);
    this.badge.material.opacity = appear * fade;
    const haloSize = 0.068 * breathe * (1 + flash * 0.35);
    this.halo.scale.setScalar(haloSize);
    this.halo.material.opacity = 0.42 * appear * fade;
    const coreSize = 0.018 * (1 + flash * 0.25);
    this.core.scale.setScalar(coreSize);
    this.core.material.opacity = appear * fade;
  }
}

const pins = [new Pin(), new Pin()];
pins.forEach((p) => globe.add(p.root));
const correctPin = new Pin({ color: ANSWER_COLOR, badge: answerBadgeTex, answer: true });
globe.add(correctPin.root);
let activePin = -1;

// Client (CSS px) point -> NDC, relative to the canvas's own box.
function clientToNdc(clientX, clientY, out) {
  return out.set(((clientX - viewLeft) / viewW) * 2 - 1, -((clientY - viewTop) / viewH) * 2 + 1);
}

// Globe-local unit normal under a screen point, or null off the globe.
function globeNormalAt(clientX, clientY) {
  const ndc = clientToNdc(clientX, clientY, new THREE.Vector2());
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  globe.updateMatrixWorld();
  const local = ray.ray.clone().applyMatrix4(globe.matrixWorld.clone().invert());
  const hit = local.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
  return hit ? hit.normalize() : null;
}

// Place (or move) the unconfirmed guess pin under a screen point.
function placeGuessPin(clientX, clientY) {
  if (!window.__canGuess) return;
  const normal = globeNormalAt(clientX, clientY);
  if (!normal) return; // tapped space, not the globe
  if (activePin >= 0) pins[activePin].release();
  activePin = (activePin + 1) % pins.length;
  pins[activePin].drop(normal);
  if (navigator.vibrate) navigator.vibrate(8);
  pendingGuess = vec3ToLatLng(normal);
  showLockButton();
  setGuessHint('Tap elsewhere to move it, or lock it in');
}

// ---------------------------------------------------------------------------
// View state and interaction
// ---------------------------------------------------------------------------
let viewW = 1;
let viewH = 1;
let fitDist = 3;
let maxDist = 4.5;

// Desktop-globe model: orientation = RX(pitch) * RY(yaw). The polar axis in
// world space is RX(pitch) * (0,1,0), which does not depend on yaw, so the
// globe spins without limit about its own axis and that axis never precesses.
// pitch is the tilt toward the viewer (= latitude at screen centre), clamped
// so you can look down at the poles but north never flips past the top.
// Start centred on lat 20, lng 10, drifting in from a wider view.
const _home = latLngToVec3(20, 10);
let yaw = Math.atan2(-_home.x, _home.z); // yaw facing lng 10
const HOME_PITCH = 20 * DEG; // load-time tilt; the flyover pullback settles back to it
let pitch = HOME_PITCH;
let vYaw = 0.75;
let vPitch = 0;
const _UP = new THREE.Vector3(0, 1, 0);
const _RIGHT = new THREE.Vector3(1, 0, 0);
const _qy = new THREE.Quaternion();
const _qx = new THREE.Quaternion();
let dist = 6;
let targetDist = 3;
let revealView = null;

function setGlobeQuaternion(target, y, p) {
  _qy.setFromAxisAngle(_UP, y);
  _qx.setFromAxisAngle(_RIGHT, p);
  return target.quaternion.multiplyQuaternions(_qx, _qy);
}

// nearest equivalent of angle a to reference b (keeps yaw continuous)
const nearAngle = (a, b) => a + Math.round((b - a) / (2 * Math.PI)) * 2 * Math.PI;

// world-space point on the unit sphere under a screen point, or null
const _ray = new THREE.Raycaster();
const _unitSphere = new THREE.Sphere(new THREE.Vector3(), 1);
function sphereHit(clientX, clientY, out) {
  _ray.setFromCamera(clientToNdc(clientX, clientY, new THREE.Vector2()), camera);
  return _ray.ray.intersectSphere(_unitSphere, out);
}

// Grab-and-solve drag: find the yaw/pitch that puts the grabbed surface point
// L (globe-local) exactly under the finger (world point D).
//   y-row of RX(-pitch) D must equal L.y   -> pitch (two roots, take nearest)
//   then RY(yaw) rotates L.xz onto M.xz      -> yaw
// Returns false when the point can't be held exactly (off the globe, limb),
// and null without touching the view when holding it needs a pitch past
// PITCH_LIMIT. Solving yaw at the clamped pitch there turned the overshoot
// into a whirl about the pole (a straight drag toward Antarctica spun the
// globe ~120 deg), so the caller falls back to screen deltas instead.
const _D = new THREE.Vector3();
function solveGrab(L, clientX, clientY) {
  if (!sphereHit(clientX, clientY, _D)) return false;
  const R = Math.hypot(_D.y, _D.z);
  const alpha = Math.atan2(_D.z, _D.y);
  const c = L.y / Math.max(R, 1e-6);
  const spread = Math.acos(clamp(c, -1, 1));
  const p1 = nearAngle(alpha + spread, pitch);
  const p2 = nearAngle(alpha - spread, pitch);
  const p = Math.abs(p1 - pitch) < Math.abs(p2 - pitch) ? p1 : p2;
  if (Math.abs(p) > PITCH_LIMIT) return null;
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const mx = _D.x;
  const mz = -_D.y * sp + _D.z * cp; // z-row of RX(-p) D
  pitch = p;
  yaw = nearAngle(Math.atan2(mx, mz) - Math.atan2(L.x, L.z), yaw);
  return Math.abs(c) <= 1;
}

function computeFit() {
  const aspect = viewW / viewH;
  const vHalf = (FOV / 2) * DEG;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const half = Math.min(vHalf, hHalf);
  const fill = aspect < 1 ? 1.1 : 0.66; // globe radius as a fraction of the shorter half-extent; portrait shows the full disc like MapTap
  return 1 / Math.sin(Math.atan(fill * Math.tan(half)));
}

// Size from the canvas's laid-out CSS box, not window.innerWidth/innerHeight.
// On iOS (viewport-fit=cover, toolbars, standalone) innerHeight can differ from
// the fixed canvas's real height; the image then stretches to the CSS box while
// taps are mapped against innerHeight, so pins land below the finger.
let viewLeft = 0;
let viewTop = 0;
function resize() {
  const r = canvas.getBoundingClientRect();
  viewLeft = r.left;
  viewTop = r.top;
  viewW = Math.max(1, r.width || window.innerWidth);
  viewH = Math.max(1, r.height || window.innerHeight);
  renderer.setSize(viewW, viewH, false);
  camera.aspect = viewW / viewH;
  camera.updateProjectionMatrix();
  const firstRun = fitDist === 3 && dist === 6;
  fitDist = computeFit();
  maxDist = fitDist * 1.55;
  if (firstRun) {
    targetDist = fitDist;
    dist = fitDist * 1.45;
  }
  targetDist = clamp(targetDist, MIN_DIST, maxDist);
  outlineMaterials.forEach((m) => m.resolution.set(viewW, viewH));
  if (answerLineMaterial) answerLineMaterial.resolution.set(viewW, viewH);
  if (countryOutline) countryOutline.mats.forEach((m) => m.resolution.set(viewW, viewH));
}
window.addEventListener('resize', resize);
// The canvas box can change without a window resize (iOS toolbar, rotation settle).
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
resize();

// radians of rotation per css pixel so the surface tracks the finger
const radPerPx = () => (2 * (dist - 1) * Math.tan((FOV / 2) * DEG)) / viewH;

// Zoom scales altitude, not distance from the centre: map scale goes with
// altitude, so a pinch or wheel notch feels the same at any depth instead of
// slamming through the last few hundred km near MIN_DIST.
const zoomTo = (from, factor) => clamp(1 + (from - 1) * factor, MIN_DIST, maxDist);

const pointers = new Map();
let samples = []; // recent {t, yaw, pitch} while dragging, for release velocity
let tap = null;
let pinch = null;
let grab = null; // globe-local point held under the finger centroid
let grabWorld = null; // the same point in world space, or null off the globe
let dragAt = null; // centroid already applied to the view
let lastInteraction = -1;
let interacted = false;
const _inv = new THREE.Quaternion();

function markInteraction() {
  lastInteraction = performance.now();
  if (!interacted) {
    interacted = true;
    hud.classList.add('dim');
  }
}

function centroid() {
  let x = 0;
  let y = 0;
  for (const p of pointers.values()) { x += p.x; y += p.y; }
  return { x: x / pointers.size, y: y / pointers.size };
}

function pinchSpan() {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Pick up the surface point under (x, y) in globe-local space. Points within
// ~5 deg of a pole can't steer yaw, so those drags fall back to screen deltas.
function grabAt(x, y) {
  dragAt = { x, y };
  const hit = sphereHit(x, y, new THREE.Vector3());
  grabWorld = hit && hit.clone();
  setGlobeQuaternion(globe, yaw, pitch);
  grab = hit && hit.applyQuaternion(_inv.copy(globe.quaternion).invert());
  if (grab && Math.hypot(grab.x, grab.z) < 0.09) grab = null;
}

// Screen-delta drag, used near a pole and past the pitch limit: horizontal
// motion spins the globe about its axis, vertical motion tilts it (and is
// simply absorbed at the limit). Yaw moves a surface point sideways at rate
// g = cos(pitch) z - sin(pitch) y (x of axis x point), which flips sign past a
// visible pole, so a finger below the south pole still drags the ground with
// it. Dividing by g tracks the finger; near g = 0 (level with the pole) the
// gain eases through zero instead, so a swipe across the pole can't whip or
// jitter the yaw between directions.
function screenDrag(c) {
  const k = radPerPx();
  const g = grabWorld ? Math.cos(pitch) * grabWorld.z - Math.sin(pitch) * grabWorld.y : 1;
  yaw += ((c.x - dragAt.x) * k * g) / Math.max(g * g, 0.35 * 0.35);
  pitch = clamp(pitch + (c.y - dragAt.y) * k, -PITCH_LIMIT, PITCH_LIMIT);
  grabAt(c.x, c.y);
}

function resetAnchor() {
  const c = centroid();
  grabAt(c.x, c.y);
  samples = [{ t: performance.now(), yaw, pitch }];
  pinch = pointers.size >= 2 ? { span: pinchSpan(), dist: targetDist } : null;
}

// Move the view so the grabbed point follows the finger centroid. Runs on
// pointer moves and every frame (a pinch zoom shifts the mapping between moves).
function applyDrag() {
  const c = centroid();
  // At the limit the exact solve can still hold a point by whirling yaw about
  // the nearby pole, so stay on screen deltas until the drag tilts back off it.
  if (grab && Math.abs(pitch) < PITCH_LIMIT) {
    const held = solveGrab(grab, c.x, c.y);
    if (held === null) screenDrag(c); // past the pitch limit
    else if (!held) grabAt(c.x, c.y); // hit a limit: re-grab so reversing responds at once
  } else if (dragAt) {
    screenDrag(c);
  }
  dragAt = c;
}

function recordSample() {
  const now = performance.now();
  samples.push({ t: now, yaw, pitch });
  while (samples.length > 2 && now - samples[0].t > 90) samples.shift();
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  revealView = null; // the reveal starts framed, but remains freely explorable
  vYaw = vPitch = 0; // grab stops the spin, and the idle drift with it
  autoSpin = 0;
  tap = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  resetAnchor();
  canvas.classList.add('dragging');
  markInteraction();
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;

  if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_MAX_MOVE) tap = null;

  if (pinch && pointers.size >= 2) {
    const span = Math.max(pinchSpan(), 1);
    const want = 1 + (pinch.dist - 1) * (pinch.span / span);
    targetDist = clamp(want, MIN_DIST, maxDist);
    // Past a limit, re-base so reversing the pinch responds immediately.
    if (targetDist !== want) pinch = { span, dist: targetDist };
  }

  applyDrag();
  recordSample();
  markInteraction();
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  const now = performance.now();

  if (pointers.size === 0) {
    canvas.classList.remove('dragging');
    if (tap && e.type === 'pointerup' && gameMode === 'guess' && now - tap.t < GUESS_TAP_MAX_MS) {
      if (!nearLockButton(e.clientX, e.clientY) && !nearTopUI(e.clientX, e.clientY)) placeGuessPin(e.clientX, e.clientY);
    } else if (tap && e.type === 'pointerup' && now - tap.t < TAP_MAX_MS) {
      if (gameMode === 'review') pickReviewRound(e.clientX, e.clientY);
    } else if (samples.length >= 2) {
      // fling: carry the view's own angular velocity over the last ~90 ms
      const last = samples[samples.length - 1];
      const first = samples[0];
      const dt = (last.t - first.t) / 1000;
      if (now - last.t < 60 && dt > 0.008) {
        vYaw = clamp((last.yaw - first.yaw) / dt, -MAX_SPIN, MAX_SPIN);
        vPitch = clamp((last.pitch - first.pitch) / dt, -MAX_SPIN, MAX_SPIN);
      }
    }
    tap = null;
    samples = [];
    pinch = null;
    grab = dragAt = null;
  } else {
    tap = null;
    resetAnchor(); // re-anchor on the remaining finger so nothing jumps
  }
  markInteraction();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.012 : 0.0015;
    targetDist = zoomTo(targetDist, Math.exp(e.deltaY * unit));
    markInteraction();
  },
  { passive: false }
);
// iOS Safari page-zoom gestures
['gesturestart', 'gesturechange', 'gestureend'].forEach((t) =>
  document.addEventListener(t, (e) => e.preventDefault(), { passive: false })
);

// ---------------------------------------------------------------------------
// Daily game
// ---------------------------------------------------------------------------
const STORAGE_VERSION = 1;
const GAME_KEY = 'where-on-earth-v1';
const STREAK_KEY = 'where-on-earth-streak-v1';
const HISTORY_KEY = 'where-on-earth-history-v1';
const PASSPORT_KEY = 'where-on-earth-passport-v1';
const MUTE_KEY = 'where-on-earth-muted';
const EXPEDITION_KEY = 'where-on-earth-expedition-v1';
const REVEAL_VIEW_KEY = 'where-on-earth-reveal-view';
const VERSIONED_KEYS = new Set([GAME_KEY, STREAK_KEY, HISTORY_KEY, PASSPORT_KEY, MUTE_KEY, EXPEDITION_KEY]);
const WEIGHTS = [1, 1, 2, 3, 3];
const gameEls = {
  start: document.getElementById('start-screen'),
  round: document.getElementById('round-screen'),
  postcardSummaryScreen: document.getElementById('postcard-summary-screen'),
  results: document.getElementById('results-screen'),
  play: document.getElementById('play-button'),
  number: document.getElementById('round-number'),
  weight: document.getElementById('round-weight'),
  dailyDate: document.getElementById('daily-date'),
  clue: document.getElementById('clue'),
  hint: document.getElementById('guess-hint'),
  header: document.querySelector('.round-header'),
  revealName: document.getElementById('reveal-name'),
  revealPill: document.getElementById('reveal-pill'),
  reveal: document.getElementById('reveal-card'),
  peekBar: document.getElementById('peek-bar'),
  peekName: document.getElementById('peek-name'),
  peekThumb: document.getElementById('peek-thumb'),
  sheetContent: document.getElementById('sheet-content'),
  lineDistance: document.getElementById('line-distance'),
  distance: document.getElementById('distance'),
  baseScore: document.getElementById('base-score'),
  mult: document.getElementById('score-mult'),
  score: document.getElementById('round-score'),
  fact: document.getElementById('fact'),
  thumb: document.getElementById('place-thumb'),
  next: document.getElementById('next-button'),
  total: document.getElementById('total-score'),
  breakdown: document.getElementById('breakdown'),
  resultsBreakdown: document.getElementById('results-breakdown'),
  postcardSummaryLede: document.getElementById('postcard-summary-lede'),
  postcardSummaryCounts: document.getElementById('postcard-summary-counts'),
  postcardSummaryContinue: document.getElementById('postcard-summary-continue'),
  share: document.getElementById('share-button'),
  status: document.getElementById('share-status'),
  startStreak: document.getElementById('start-streak'),
  resultStreak: document.getElementById('result-streak'),
  travelDistance: document.getElementById('travel-distance'),
  survivalEntry: document.getElementById('survival-button'),
  survivalHub: document.getElementById('survival-hub'),
  survivalHubEntry: document.getElementById('survival-hub-button'),
  survivalStreak: document.getElementById('survival-streak'),
  survivalResults: document.getElementById('survival-results-screen'),
  survivalResultTitle: document.getElementById('survival-result-title'),
  survivalFinalStreak: document.getElementById('survival-final-streak'),
  survivalBestStreak: document.getElementById('survival-best-streak'),
  survivalShare: document.getElementById('survival-share'),
  survivalShareStatus: document.getElementById('survival-share-status'),
  survivalAgain: document.getElementById('survival-again'),
  survivalHome: document.getElementById('survival-home'),
  expeditionsEntry: document.getElementById('expeditions-button'),
};

answerLineMaterial = new LineMaterial({
  color: '#b9f7ff',
  linewidth: 2.4, // CSS pixels; stays legible when the final view pulls back
  transparent: true,
  opacity: 0.94,
  depthTest: false,
  depthWrite: false,
});
answerLineMaterial.resolution.set(viewW, viewH);
const answerLine = new LineSegments2(new LineGeometry(), answerLineMaterial);
answerLine.visible = false;
answerLine.renderOrder = 6;
globe.add(answerLine);

// A solid emissive-looking marker avoids the noisy transparent fringe of the
// old additive glow sprite while remaining easy to see against the route.
const travelHead = new THREE.Mesh(
  new THREE.SphereGeometry(1, 20, 12),
  new THREE.MeshBasicMaterial({ color: ANSWER_COLOR, depthTest: false, depthWrite: false }),
);
travelHead.visible = false;
travelHead.renderOrder = 7;
// Rescaled every frame by sizeTravelHead() to a constant on-screen size.
travelHead.scale.setScalar(0.0008);
globe.add(travelHead);

let travelAnimation = null;
let northUpRevealToken = 0;

// ---------------------------------------------------------------------------
// Flyover extras: accuracy tiers, synthesized sound, photo postcard
// ---------------------------------------------------------------------------
const PINPOINT_KM = 5;
const BULLSEYE_KM = 25;
const NEAR_KM = 150;
const BLOWOUT_KM = 8000;
const GOLD_COLOR = new THREE.Color('#ffd45e');
const DEADPAN_LINES = ['away.', 'away. Bold.', 'away. Different continent.', 'away. Still on Earth, though.', 'away. Noted.'];

function flyoverTier(km) {
  if (km < PINPOINT_KM) return 'pinpoint';
  if (km < BULLSEYE_KM) return 'bullseye';
  if (km < NEAR_KM) return 'near';
  if (km > BLOWOUT_KM) return 'blowout';
  return 'normal';
}

// Slow motion for the bullseye landing: scales the pins' (and shockwave's)
// clock only; the camera and DOM keep real time.
let timeScale = 1;

// Gold ring that rolls out across the surface when a bullseye lands. Sized in
// update from the pin scale so it reads the same at any zoom.
const shockwaveMat = new THREE.ShaderMaterial({
  uniforms: { uP: { value: 0 }, uRadius: { value: 0.06 }, uColor: { value: GOLD_COLOR } },
  vertexShader: /* glsl */ `
    varying vec3 vPos;
    void main() {
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uP;
    uniform float uRadius;
    uniform vec3 uColor;
    varying vec3 vPos;
    void main() {
      float r = acos(clamp(normalize(vPos).y, -1.0, 1.0)) / uRadius;
      float a = 0.0;
      for (int i = 0; i < 2; i++) {
        float p = clamp((uP - float(i) * 0.16) / 0.84, 0.0, 1.0);
        float rr = 1.0 - pow(1.0 - p, 3.0);
        float w = 0.025 + p * 0.07;
        a += pow(1.0 - p, 1.6) * smoothstep(w, 0.0, abs(r - rr)) * (i == 0 ? 1.4 : 0.7) * step(0.001, p);
      }
      a += exp(-r * r * 30.0) * pow(1.0 - uP, 2.0) * 0.6; // flash at the impact point
      gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.98, 0.9), 0.25) * a, 1.0);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const shockwave = new THREE.Mesh(new THREE.SphereGeometry(1.0028, 96, 24, 0, Math.PI * 2, 0, 0.4), shockwaveMat);
shockwave.visible = false;
shockwave.renderOrder = 3;
globe.add(shockwave);

// Web Audio, everything synthesized. iOS only lets a context start inside a
// user gesture, so it is created (and re-resumed after interruptions) on taps.
// Keep the audio session category "ambient" (Safari 16.4+): it respects the
// ring/silent switch and, critically, never interrupts or ducks whatever the
// player is already listening to (music, a podcast). The tradeoff is the
// game goes silent with the ring/silent switch on, which is the right
// tradeoff — this is a secondary SFX layer, not the player's primary audio.
function storageError(message, key, error) {
  console.error(`[storage] ${message}: ${key}`, error || '');
}

function corruptBackupKey(key) {
  return `${key}.corrupt-backup`;
}

function preserveCorruptStorage(key, raw, error) {
  storageError('Corrupt JSON preserved; refusing to overwrite', key, error);
  const backupKey = corruptBackupKey(key);
  try {
    // Never destroy an earlier recovery copy. If another corrupt value is seen,
    // leave the first backup intact and keep the current raw value at its key.
    if (localStorage.getItem(backupKey) === null) localStorage.setItem(backupKey, raw);
  } catch (backupError) {
    storageError('Could not create corrupt backup', backupKey, backupError);
  }
}

function storedDataSize(key, value) {
  if (value == null) return 0;
  if (key === PASSPORT_KEY) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
    const visits = value.visits && typeof value.visits === 'object' ? Object.keys(value.visits).length : 0;
    const meta = value.meta && typeof value.meta === 'object' ? Object.keys(value.meta).length : 0;
    const order = Array.isArray(value.order) ? value.order.length : 0;
    return Math.max(visits, meta, order);
  }
  if (key === HISTORY_KEY) {
    const entries = Array.isArray(value) ? value : value && value.entries;
    return Array.isArray(entries) ? entries.length : 0;
  }
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') {
    return Object.keys(value).filter((field) => field !== '_v').length;
  }
  return String(value).length;
}

function safeSetItem(key, rawValue) {
  let oldRaw = null;
  try {
    oldRaw = localStorage.getItem(key);
    if (!VERSIONED_KEYS.has(key)) {
      localStorage.setItem(key, rawValue);
      return true;
    }

    let next;
    try {
      next = JSON.parse(rawValue);
    } catch (error) {
      storageError('Refusing non-JSON write to versioned key', key, error);
      return false;
    }

    if (oldRaw !== null) {
      let previous;
      try {
        previous = JSON.parse(oldRaw);
      } catch (error) {
        preserveCorruptStorage(key, oldRaw, error);
        return false;
      }

      const oldSize = storedDataSize(key, previous);
      const nextSize = storedDataSize(key, next);
      if (next == null || (oldSize > 0 && nextSize === 0)) {
        storageError('Refusing suspicious empty write', key);
        return false;
      }
      if (key === PASSPORT_KEY && nextSize < oldSize) {
        storageError(`Refusing passport write that shrinks from ${oldSize} to ${nextSize} entries`, key);
        return false;
      }
    }

    localStorage.setItem(key, rawValue);
    return true;
  } catch (error) {
    storageError('Write failed', key, error);
    return false;
  }
}

function migrateValue(key, value) {
  // Every case spreads/copies old data first. Future rename migrations must do
  // the same: add the new field while retaining the old field.
  if (key === HISTORY_KEY) {
    if (Array.isArray(value)) return { _v: STORAGE_VERSION, entries: value };
    return { ...value, _v: STORAGE_VERSION, entries: Array.isArray(value.entries) ? value.entries : [] };
  }
  if (key === MUTE_KEY) {
    // The legacy raw strings `1` and `0` parse as JSON numbers.
    if (value === 1 || value === 0 || value === '1' || value === '0' || typeof value === 'boolean') {
      return { _v: STORAGE_VERSION, muted: value === 1 || value === '1' || value === true };
    }
    return { ...value, _v: STORAGE_VERSION, muted: Boolean(value && value.muted) };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return { ...value, _v: STORAGE_VERSION };
}

function migrateStorage() {
  for (const key of VERSIONED_KEYS) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch (error) {
      storageError('Read failed during migration', key, error);
      continue;
    }
    if (raw === null) continue;

    let value;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      preserveCorruptStorage(key, raw, error);
      continue;
    }

    const version = value && typeof value === 'object' && Number.isInteger(value._v) ? value._v : 0;
    if (version > STORAGE_VERSION) {
      storageError(`Stored schema v${version} is newer than supported v${STORAGE_VERSION}; leaving untouched`, key);
      continue;
    }
    if (version === STORAGE_VERSION) continue;

    let migrated = value;
    for (let from = version; from < STORAGE_VERSION; from += 1) {
      // Add future step migrations here, keyed by `from`. They must copy the
      // prior object and add fields; never delete a legacy field.
      if (from === 0) migrated = migrateValue(key, migrated);
    }
    safeSetItem(key, JSON.stringify(migrated));
  }
}

migrateStorage();

let revealViewPreference = 'flyover';
try {
  const savedRevealView = localStorage.getItem(REVEAL_VIEW_KEY);
  if (savedRevealView === 'flyover' || savedRevealView === 'north-up') revealViewPreference = savedRevealView;
} catch (error) {
  storageError('Read failed', REVEAL_VIEW_KEY, error);
}

const audio = {
  ctx: null,
  master: null,
  noise: null,
  whoosh: null,
  muted: Boolean(readJSON(MUTE_KEY)?.muted),

  syncSession() {
    const session = navigator.audioSession;
    if (session && session.type !== 'ambient') {
      try { session.type = 'ambient'; } catch (err) { /* older WebKit: read-only */ }
    }
  },

  unlock() {
    this.syncSession(); // before the context exists, so it starts in the right category
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      // A silent one-sample blip is what actually unlocks output on older iOS.
      const blip = this.ctx.createBufferSource();
      blip.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      blip.connect(this.ctx.destination);
      blip.start();
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
  },

  live() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  },

  setMuted(muted) {
    this.muted = muted;
    writeJSON(MUTE_KEY, muted);
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.03);
    this.syncSession();
    if (muted) this.whooshStop();
  },

  whooshStart() {
    if (!this.live() || this.whoosh) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 240;
    filter.Q.value = 1.4;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.whoosh = { src, filter, gain };
  },

  // level 0..1 is how hard the air is rushing (volume), speed 0..1 how fast
  // the ground is going by (pitch).
  whooshSet(level, speed) {
    if (!this.whoosh) return;
    const now = this.ctx.currentTime;
    this.whoosh.filter.frequency.setTargetAtTime(220 + 2600 * speed * speed, now, 0.06);
    this.whoosh.src.playbackRate.setTargetAtTime(0.7 + 0.6 * speed, now, 0.06);
    this.whoosh.gain.gain.setTargetAtTime(0.32 * level, now, 0.06);
  },

  whooshStop() {
    if (!this.whoosh) return;
    const { src, gain } = this.whoosh;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, 0.1);
    src.stop(now + 0.6);
    this.whoosh = null;
  },

  tone(type, from, to, start, dur, peak, filterHz = 0) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    let node = osc.connect(gain);
    if (filterHz) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = filterHz;
      node = node.connect(lp);
    }
    node.connect(this.master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  },

  // Deep body thump plus a short filtered-noise contact click. slow > 1
  // stretches and lowers it for the bullseye slow motion.
  thump(slow = 1) {
    if (!this.live()) return;
    const now = this.ctx.currentTime;
    this.tone('sine', 120 / slow, 36 / slow, now, 0.45 * slow, 0.95);
    const click = this.ctx.createBufferSource();
    click.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900 / slow;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07 * slow);
    click.connect(lp).connect(gain).connect(this.master);
    click.start(now);
    click.stop(now + 0.1 * slow);
  },

  chime() {
    if (!this.live()) return;
    const now = this.ctx.currentTime + 0.05;
    this.tone('sine', 1046.5, 1046.5, now, 1.3, 0.14);
    this.tone('sine', 1568, 1568, now + 0.09, 1.2, 0.1);
    this.tone('triangle', 2093, 2093, now + 0.18, 0.9, 0.05);
  },

  // Paper-on-glass tick as the postcard drops into its slot.
  tick() {
    if (!this.live()) return;
    const now = this.ctx.currentTime;
    const click = this.ctx.createBufferSource();
    click.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 3200;
    hp.Q.value = 0.9;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    click.connect(hp).connect(gain).connect(this.master);
    click.start(now, Math.random() * 0.5);
    click.stop(now + 0.04);
    this.tone('triangle', 1900, 1500, now, 0.06, 0.06);
  },

  // Deadpan two-note "wah wah" for a blowout.
  bwomp() {
    if (!this.live()) return;
    const now = this.ctx.currentTime + 0.25;
    this.tone('square', 233, 220, now, 0.32, 0.07, 700);
    this.tone('square', 208, 150, now + 0.36, 0.7, 0.07, 600);
  },
};
['pointerdown', 'touchend', 'click', 'keydown'].forEach((type) =>
  window.addEventListener(type, () => audio.unlock(), { capture: true, passive: true }),
);

const MUTE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path class="waves" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="slash" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
const muteButtons = [gameEls.start, gameEls.round.querySelector('.round-meta')].map((parent) => {
  const button = document.createElement('button');
  button.className = 'mute-toggle';
  button.innerHTML = MUTE_ICON;
  if (parent === gameEls.start) parent.prepend(button);
  else parent.firstElementChild.after(button); // centred between round and weight
  return button;
});
function syncMuteButtons() {
  for (const button of muteButtons) {
    button.classList.toggle('muted', audio.muted);
    button.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
    button.setAttribute('aria-pressed', String(audio.muted));
  }
}
muteButtons.forEach((button) => button.addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  syncMuteButtons();
}));
syncMuteButtons();

const bullseyeStamp = document.createElement('p');
bullseyeStamp.className = 'bullseye-stamp';
bullseyeStamp.hidden = true;
document.body.append(bullseyeStamp);

function setAccuracyStamp(tier) {
  const pinpoint = tier === 'pinpoint';
  bullseyeStamp.innerHTML = pinpoint ? '<b>📍</b>PINPOINT' : '<b>🎯</b>BULLSEYE';
  bullseyeStamp.setAttribute('aria-label', pinpoint ? 'Pinpoint' : 'Bullseye');
}

setAccuracyStamp('bullseye');

const postcard = document.createElement('figure');
postcard.className = 'postcard';
postcard.hidden = true;
postcard.innerHTML = '<img alt="" decoding="async"><p></p>';
document.body.append(postcard);
const postcardImg = postcard.querySelector('img');
const postcardCaption = postcard.querySelector('p');
const POSTCARD_W = 212;
const POSTCARD_H = 8 + 124 + 34;
// All postcard timing is real time (performance.now) from touchdown, so a slow
// device whose logical clock lags (dt is clamped) holds the card just as long.
const POSTCARD_POP_MS = 560;
const POSTCARD_HOLD_MS = 1500; // touchdown -> earliest settle
const POSTCARD_MIN_SHOW_MS = 600; // after a (late) pop finishes, before it settles
const POSTCARD_SETTLE_MS = 640;

// The thumb sits in a slot that shows a dashed outline while the postcard is
// out, so the card never shows an unexplained gap where the photo will land.
// The sheet has two: the peek bar's square (where the postcard lands while
// the sheet is collapsed) and the expanded content's wide thumb.
const thumbSlot = document.createElement('div');
thumbSlot.className = 'thumb-slot';
gameEls.thumb.before(thumbSlot);
thumbSlot.append(gameEls.thumb);
const peekSlot = gameEls.peekThumb.parentElement;
const thumbSlots = [thumbSlot, peekSlot];
// The reveal sheet is hidden during the flight, so a lazy thumb would only
// start fetching once the sheet appears, after the postcard needs it.
gameEls.thumb.loading = 'eager';

// Whichever thumb the postcard can settle into right now, or null.
function postcardTarget() {
  if (gameEls.reveal.hidden) return null;
  const expanded = gameEls.reveal.classList.contains('expanded');
  const thumb = expanded ? gameEls.thumb : gameEls.peekThumb;
  return thumb.hidden || (thumb === gameEls.peekThumb && peekSlot.hidden) ? null : thumb;
}

// Load the photo at full priority as the flight starts. The preload is a
// detached Image: a failed load on an in-document <img> reaches the window
// error handler and raises the boot error banner.
let postcardPhoto = null; // { src, ok, failed } for the current reveal
let postcardRun = null; // { b, landedAt, popAt, newUnlock, phase: 'pending' | 'out' | 'settling' }
let postcardNewUnlock = false;
let revealCardAt = null; // when the reveal card has finished fading in
let afterPostcard = null; // queued until the postcard is out of the way
function preparePostcard(item, newlyEarned) {
  clearPostcard();
  revealCardAt = null;
  afterPostcard = null;
  postcardNewUnlock = Boolean(newlyEarned);
  if (!item.image) return;
  const photo = { src: item.image, ok: false, failed: false };
  const loader = new Image();
  loader.decoding = 'async';
  loader.onload = () => {
    photo.ok = true;
    if (postcardPhoto === photo && postcardRun && postcardRun.phase === 'pending') popPostcard();
  };
  loader.onerror = () => {
    photo.failed = true;
    if (postcardPhoto === photo && postcardRun && postcardRun.phase === 'pending') abandonPostcard();
  };
  loader.src = item.image;
  postcardPhoto = photo;
  postcardCaption.textContent = item.clue || item.short;
}

function clearPostcard() {
  postcardRun = null;
  postcardPhoto = null;
  postcard.getAnimations().forEach((a) => a.cancel());
  postcardImg.getAnimations().forEach((a) => a.cancel());
  postcardCaption.getAnimations().forEach((a) => a.cancel());
  postcard.hidden = true;
  thumbSlots.forEach((slot) => slot.classList.remove('waiting'));
}

// Earliest settle: the hold from touchdown, and never before the sheet is
// there to land in (unknown until the pullback starts).
function postcardSettleAt(run) {
  let at = Math.max(run.landedAt + POSTCARD_HOLD_MS, revealCardAt ?? Infinity);
  if (run.popAt != null) at = Math.max(at, run.popAt + POSTCARD_POP_MS + POSTCARD_MIN_SHOW_MS);
  return at;
}

// Touchdown of the answer pin (globe-local point b). A photo still loading
// pops late, as long as that is still before the settle would have happened.
function postcardLanded(b) {
  if (!postcardPhoto || postcardPhoto.failed) {
    postcardDone();
    return;
  }
  const run = { b, landedAt: performance.now(), popAt: null, newUnlock: postcardNewUnlock, phase: 'pending' };
  postcardRun = run;
  if (postcardPhoto.ok) popPostcard();
  const tick = () => {
    if (postcardRun !== run || run.phase === 'settling') return;
    const now = performance.now();
    if (now >= postcardSettleAt(run)) {
      if (run.phase === 'pending') abandonPostcard();
      else settlePostcard();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Run fn once no postcard is (or is about to be) on screen. The earn toast
// waits on this: it sits in the same band as the held postcard and would
// cover the photo, which on a bullseye pops right as the toast appears.
function whenPostcardDone(fn) {
  if (postcardPhoto && !postcardPhoto.failed) afterPostcard = fn;
  else fn();
}

function postcardDone() {
  const fn = afterPostcard;
  afterPostcard = null;
  if (fn) fn();
}

function postcardCardShown(fadeMs) {
  revealCardAt = performance.now() + fadeMs;
}

// The photo never arrived in time: drop the placeholder and let the thumb
// fade in whenever it loads.
function abandonPostcard() {
  postcardRun = null;
  postcardPhoto = null;
  thumbSlots.forEach((slot) => slot.classList.remove('waiting'));
  revealThumbCurrent();
  for (const thumb of [gameEls.thumb, gameEls.peekThumb]) {
    const fadeIn = () => thumb.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    if (!thumb.complete) thumb.addEventListener('load', fadeIn, { once: true });
  }
  postcardDone();
}

function popPostcard() {
  const run = postcardRun;
  run.phase = 'out';
  run.popAt = performance.now();
  postcardImg.src = postcardPhoto.src;
  const v = run.b.clone().multiplyScalar(1.02).applyQuaternion(globe.quaternion).project(camera);
  const fromX = ((v.x + 1) / 2) * viewW;
  const fromY = ((1 - v.y) / 2) * viewH;
  // Hold it in the band below the reveal framing (where the sheet will rise),
  // so it never covers the pins while the map has the stage, and clear of the
  // distance pill at the very bottom.
  const x = viewW / 2;
  const y = Math.min(viewH - 96 - POSTCARD_H / 2, Math.max(revealStrip().safeBottom + POSTCARD_H / 2 + 10, viewH * 0.72));
  run.x = x - POSTCARD_W / 2;
  run.y = y - POSTCARD_H / 2;
  postcard.hidden = false;
  postcard.animate([
    { transform: `translate(${fromX - POSTCARD_W / 2}px, ${fromY - POSTCARD_H / 2}px) scale(.08) rotate(0deg)`, opacity: 0 },
    { transform: `translate(${run.x}px, ${run.y - 16}px) scale(1.06) rotate(-7deg)`, opacity: 1, offset: 0.6 },
    { transform: `translate(${run.x}px, ${run.y}px) scale(1) rotate(-4deg)`, opacity: 1 },
  ], { duration: POSTCARD_POP_MS, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'forwards' });
}

// Morph the polaroid into the thumb's exact box: the frame, caption and tilt
// melt away while the photo grows to the slot's size and corner radius. Both
// are the same src with object-fit: cover, so the final swap is invisible.
function settlePostcard() {
  const run = postcardRun;
  run.phase = 'settling';
  if (!run.newUnlock) {
    postcard.getAnimations().forEach((a) => a.cancel());
    postcard.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: 'ease-out', fill: 'forwards' }).onfinish = () => {
      if (postcardRun !== run) return;
      revealThumbCurrent();
      clearPostcard();
      postcardDone();
    };
    return;
  }
  const thumb = postcardTarget();
  run.thumb = thumb;
  if (!thumb) {
    postcard.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).onfinish = () => {
      if (postcardRun !== run) return;
      revealThumbCurrent();
      clearPostcard();
      postcardDone();
    };
    return;
  }
  thumb.decode().catch(() => {}); // start decoding now; it is needed at the swap
  const r = thumb.getBoundingClientRect();
  const timing = { duration: POSTCARD_SETTLE_MS, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' };
  const lift = 0.2; // a short pick-up beat before it glides down
  postcard.getAnimations().forEach((a) => a.cancel());
  postcard.animate([
    { transform: `translate(${run.x}px, ${run.y}px) scale(1) rotate(-4deg)`, width: `${POSTCARD_W}px`, padding: '8px 8px 0', borderRadius: '3px', backgroundColor: '#fbf8f1', boxShadow: '0 14px 34px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.3)' },
    { transform: `translate(${run.x}px, ${run.y - 10}px) scale(1.04) rotate(-6deg)`, width: `${POSTCARD_W}px`, padding: '8px 8px 0', borderRadius: '3px', backgroundColor: '#fbf8f1', boxShadow: '0 22px 40px rgba(0,0,0,.4), 0 2px 6px rgba(0,0,0,.3)', offset: lift },
    { transform: `translate(${r.left}px, ${r.top}px) scale(1) rotate(0deg)`, width: `${r.width}px`, padding: '0px 0px 0', borderRadius: '10px', backgroundColor: 'rgba(251,248,241,0)', boxShadow: '0 0 0 rgba(0,0,0,0), 0 0 0 rgba(0,0,0,0)' },
  ], timing).onfinish = () => {
    if (postcardRun !== run) return;
    // Hold the postcard over the slot until the thumb can actually paint.
    if (thumb.complete) swapPostcard(run);
    else thumb.decode().then(() => swapPostcard(run), () => swapPostcard(run));
  };
  postcardImg.animate([
    { height: '124px', borderRadius: '0px' },
    { height: '124px', borderRadius: '0px', offset: lift },
    { height: `${r.height}px`, borderRadius: '10px' },
  ], timing);
  postcardCaption.animate([
    { height: '34px', opacity: 1 },
    { height: '34px', opacity: 1, offset: lift },
    { height: '0px', opacity: 0, offset: 0.7 },
    { height: '0px', opacity: 0 },
  ], timing);
}

function swapPostcard(run) {
  if (postcardRun !== run) return;
  revealThumbCurrent();
  clearPostcard();
  postcardDone();
  audio.tick();
  // The slot takes the weight: a small press and rebound.
  run.thumb.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(.975)', offset: 0.35 },
    { transform: 'scale(1.008)', offset: 0.7 },
    { transform: 'scale(1)' },
  ], { duration: 300, easing: 'ease-out' });
}

function resetFlyoverExtras() {
  timeScale = 1;
  shockwave.visible = false;
  audio.whooshStop();
  correctPin.setColor(ANSWER_COLOR);
  setCameraFov(FOV);
  clearPostcard();
  afterPostcard = null;
  bullseyeStamp.getAnimations().forEach((a) => a.cancel());
  bullseyeStamp.hidden = true;
  document.body.classList.remove('bullseye');
  const pill = gameEls.travelDistance;
  pill.classList.remove('suspense', 'deadpan');
  pill.querySelector('small').textContent = 'away';
}

let locations = [];
let dailyPins = {};
let daily = null;
let selected = [];
let gameMode = 'start';

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// dateKey is the same YYYY-MM-DD shape used as the daily-archive.json keys.
function formatDailyDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function readJSON(key) {
  let raw;
  try {
    raw = localStorage.getItem(key);
    if (raw === null) return null;
    const value = JSON.parse(raw);
    // Preserve existing call-site behavior while history is stored in a
    // versioned object wrapper.
    return key === HISTORY_KEY && value && !Array.isArray(value) ? value.entries : value;
  } catch (error) {
    if (raw != null) preserveCorruptStorage(key, raw, error);
    else storageError('Read failed', key, error);
    return null;
  }
}

function versionedValue(key, value) {
  if (key === HISTORY_KEY) return { _v: STORAGE_VERSION, entries: value };
  if (key === MUTE_KEY) return { _v: STORAGE_VERSION, muted: Boolean(value) };
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...value, _v: STORAGE_VERSION };
  }
  return value;
}

function writeJSON(key, value) {
  return safeSetItem(key, JSON.stringify(versionedValue(key, value)));
}

function saveDaily() {
  writeJSON(GAME_KEY, daily);
}

// A pinned date plays its pin (with any dropped location substituted, see
// resolvePinnedIds); every other date is computed from today's pool.
function dailyGame(date) {
  const pinned = dailyPins[date];
  const ids = Array.isArray(pinned) ? resolvePinnedIds(date, pinned, locations) : null;
  return ids || dailyIds(date, locations);
}

function loadDaily() {
  const date = localDateKey();
  const saved = readJSON(GAME_KEY);
  daily = saved && saved.date === date && Array.isArray(saved.ids)
    ? saved
    : { date, ids: dailyGame(date), round: 0, results: [], complete: false };
  daily.round = clamp(Number(daily.round) || 0, 0, 4);
  daily.results = Array.isArray(daily.results) ? daily.results.slice(0, 5) : [];
  selected = daily.ids.map((id) => locations.find((item) => item.id === id)).filter((item) => isPlayableLocation(item) && !isLandmark(item));
  if (selected.length !== 5) {
    daily = { date, ids: dailyGame(date), round: 0, results: [], complete: false };
    selected = daily.ids.map((id) => locations.find((item) => item.id === id));
  }
  saveDaily();
}

function distanceKm(a, b) {
  const p1 = a.lat * DEG;
  const p2 = b.lat * DEG;
  const dp = (b.lat - a.lat) * DEG;
  const dl = (b.lng - a.lng) * DEG;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

// Stretched-exponential: near-perfect under ~10km, matches MapTap's generous
// mid-range (~980 @ 112km, ~940 @ 301km), and decays gradually toward 0 at
// antipodal distances instead of collapsing by a few hundred km.
function distanceScore(km) {
  return 1000 * Math.exp(-((km / 3500) ** 1.13));
}

function scoreGuess(km, round) {
  const base = Math.round(distanceScore(km));
  return Math.round(base * WEIGHTS[round]);
}

function streakText() {
  const streak = readJSON(STREAK_KEY);
  const count = streak && Number(streak.count) ? streak.count : 0;
  return count ? `🔥 ${count} day streak` : '';
}

function finishStreak() {
  const existing = readJSON(STREAK_KEY);
  if (existing && existing.last === daily.date) return existing.count || 1;
  const today = new Date(`${daily.date}T12:00:00`);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const count = existing && existing.last === localDateKey(yesterday) ? (existing.count || 0) + 1 : 1;
  writeJSON(STREAK_KEY, { last: daily.date, count });
  return count;
}

var statsScreenEl = null; // set once the stats overlay is built
var settingsScreenEl = null; // set once the settings overlay is built
var passportScreenEl = null; // set once the passport page is built
var collectionsScreenEl = null; // set once the collections page is built
var pvpScreenEls = []; // set once the PvP screens are built

function hideScreens() {
  gameEls.start.hidden = gameEls.round.hidden = gameEls.postcardSummaryScreen.hidden = gameEls.results.hidden = true;
  gameEls.survivalResults.hidden = true;
  gameEls.survivalHub.hidden = true;
  reviewEls.screen.hidden = true;
  if (statsScreenEl) statsScreenEl.hidden = true;
  if (settingsScreenEl) settingsScreenEl.hidden = true;
  if (passportScreenEl) passportScreenEl.hidden = true;
  if (collectionsScreenEl) collectionsScreenEl.hidden = true;
  for (const el of pvpScreenEls) el.hidden = true;
  document.body.className = '';
}

function clearReveal() {
  travelAnimation = null;
  northUpRevealToken += 1;
  travelHead.visible = false;
  setCameraNear(0.05);
  gameEls.travelDistance.getAnimations().forEach((a) => a.cancel());
  gameEls.travelDistance.hidden = true;
  hideRevealSheet();
  resetFlyoverExtras();
  correctPin.release();
  answerLine.visible = false;
  clearCountryOutline();
  revealView = null;
  for (const pin of pins) pin.release();
  activePin = -1;
  clearPendingGuess();
  hideReviewVisuals();
}

function showRound() {
  clearReveal();
  hideScreens();
  gameMode = 'guess';
  window.__canGuess = true;
  gameEls.round.hidden = false;
  document.body.classList.add('game-round');
  const item = currentItem();
  if (pvp.active) {
    document.body.classList.add('pvp');
    gameEls.number.textContent = `Round ${pvp.round} of 5`;
    gameEls.weight.style.display = ''; // the countdown, see pvpTick
    gameEls.dailyDate.hidden = true;
  } else if (expeditionRun.active) {
    document.body.classList.add('expedition-mode');
    const total = expeditionLocations(expeditionRun.expedition).length;
    gameEls.number.textContent = `${expeditionRun.expedition.emoji || '🧭'} ${expeditionRun.expedition.theme} · ${expeditionRun.index + 1}/${total}`;
    gameEls.weight.style.display = 'none';
    gameEls.dailyDate.hidden = true;
  } else if (borders.active) {
    // Survival's restyle; the clue is the country name and flag
    document.body.classList.add('survival', 'borders');
    gameEls.number.textContent = borders.scope ? blackoutProgressText() : `Streak ${borders.found}`;
    gameEls.weight.style.display = 'none';
    gameEls.survivalStreak.textContent = borders.round === 1
      ? 'One miss ends the run · Tap the globe to place your pin'
      : '';
    gameEls.dailyDate.hidden = true;
  } else if (survival.active) {
    document.body.classList.add('survival');
    gameEls.number.textContent = `Streak ${survival.survived}`;
    gameEls.weight.style.display = 'none';
    gameEls.survivalStreak.textContent = survival.round === 1
      ? 'One miss over 150 km ends the run · Tap the globe to place your pin'
      : '';
    gameEls.dailyDate.hidden = true;
  } else if (endless.active) {
    document.body.classList.add('endless');
    gameEls.number.textContent = `Endless · #${endless.count}`;
    gameEls.weight.style.display = 'none';
    gameEls.dailyDate.hidden = true;
  } else {
    gameEls.number.textContent = `Round ${daily.round + 1} of 5`;
    gameEls.weight.textContent = `${WEIGHTS[daily.round]}× points`;
    gameEls.weight.style.display = WEIGHTS[daily.round] > 1 ? '' : 'none';
    gameEls.dailyDate.textContent = formatDailyDate(daily.date);
    gameEls.dailyDate.hidden = false;
  }
  if (borders.active) {
    const name = document.createElement('strong');
    name.textContent = borders.key;
    gameEls.clue.replaceChildren('Tap ', name, ` ${countryFlag(borders.key)}`);
  } else gameEls.clue.textContent = item.clue;
  setGuessHint(borders.active || survival.active ? '' : 'Tap the globe to place your pin');
}

// Rotation axis of the shortest great circle from a to b. Coincident or exactly
// antipodal points have no unique circle (slerp divides by sin(pi) = 0 there),
// so route through the same midpoint frameRevealPoints falls back to.
function routeAxis(a, b) {
  const axis = new THREE.Vector3().crossVectors(a, b);
  if (axis.lengthSq() > 1e-12) return axis.normalize();
  const mid = new THREE.Vector3().crossVectors(a, _UP);
  if (mid.lengthSq() < 1e-12) mid.copy(_RIGHT);
  return axis.crossVectors(a, mid.normalize()).normalize();
}

// The route floats ROUTE_LIFT above the surface mid-flight but eases down to
// radius 1 at both ends, so it emerges from (and lands at) the pin bases. A
// constant 1.012 left the line start hovering ~6x the shrunken flight-pin
// height above the guess pin, a visible gap from the low flyover camera.
// Line vertices, head marker and camera target all share this radius.
const ROUTE_LIFT = 0.012;
const ROUTE_RAMP = 2 * DEG;
function routeRadius(angle, t) {
  const s = clamp((Math.min(t, 1 - t) * angle) / ROUTE_RAMP, 0, 1);
  return 1 + ROUTE_LIFT * s * s * (3 - 2 * s);
}

function buildAnswerPath(guess, answer) {
  const a = latLngToVec3(guess.lat, guess.lng);
  const b = latLngToVec3(answer.lat, answer.lng);
  const angle = a.angleTo(b);
  const axis = routeAxis(a, b);
  // Dense enough that the progressively revealed head remains smooth even on
  // near-antipodal trips (drawRange advances through these vertices).
  const count = Math.max(48, Math.ceil(angle / (0.35 * DEG)));
  const points = [];
  for (let i = 0; i <= count; i++) {
    points.push(a.clone().applyAxisAngle(axis, (i / count) * angle).multiplyScalar(routeRadius(angle, i / count)));
  }
  answerLine.geometry.dispose();
  answerLine.geometry = new LineGeometry().setPositions(points.flatMap((point) => point.toArray()));
  answerLine.geometry.instanceCount = points.length - 1;
  answerLine.computeLineDistances();
  return { a, b, points, axis, angle };
}

function placeRevealVisual(guess, answer) {
  const { a, b } = buildAnswerPath(guess, answer);
  if (activePin >= 0) pins[activePin].drop(a);
  correctPin.drop(b);
  answerLine.visible = true;
  frameRevealPoints(a, b);
  showCountryOutline(countryKey(answer), answer, false);
  return { a, b };
}

function beginNorthUpReveal(guess, answer, km, newlyEarned, tier) {
  const { a, b } = buildAnswerPath(guess, answer);
  if (activePin >= 0) pins[activePin].drop(a);
  if (tier === 'bullseye' || tier === 'pinpoint') correctPin.setColor(GOLD_COLOR, '#fff6d8');
  correctPin.drop(b);
  answerLine.visible = true;
  gameEls.distance.textContent = formatKm(km);
  preparePostcard(answer, newlyEarned);
  frameNorthUpRevealPoints(a, b);
  showCountryOutline(countryKey(answer), answer, true);
  startRevealBeat(a, b, tier !== 'bullseye');
  const token = ++northUpRevealToken;
  const watchLanding = () => {
    if (token !== northUpRevealToken || gameMode !== 'reveal') return;
    if (correctPin.t < LAND_T) {
      requestAnimationFrame(watchLanding);
      return;
    }
    if (tier === 'bullseye' || tier === 'pinpoint') {
      audio.thump(1.7);
      audio.chime();
    } else {
      audio.thump();
      if (tier === 'blowout') audio.bwomp();
    }
    postcardLanded(b);
  };
  requestAnimationFrame(watchLanding);
}

function beginTravelReveal(guess, answer, km, newlyEarned, tier = flyoverTier(km)) {
  if (revealViewPreference === 'north-up') {
    beginNorthUpReveal(guess, answer, km, newlyEarned, tier);
    return;
  }
  const path = buildAnswerPath(guess, answer);
  const flight = travelFlightProfile(km);
  answerLine.visible = false;
  answerLine.geometry.instanceCount = 0;
  correctPin.root.visible = false;
  correctPin.state = 'idle';
  gameEls.distance.textContent = formatKm(km);
  gameEls.travelDistance.querySelector('span').textContent = '0 km';
  gameEls.travelDistance.hidden = true;
  preparePostcard(answer, newlyEarned);
  travelAnimation = {
    ...path,
    km,
    tier,
    flyAlt: flight.altitude,
    flyBack: flight.trail,
    // Short hops used to crawl and long hauls rush at a fixed 2.1 s. A near
    // miss takes longer so it can decelerate into the answer; a blowout whips.
    travelDuration: tier === 'near' ? 3.1
      : tier === 'blowout' ? 1.2
      : THREE.MathUtils.lerp(1.8, 2.4, smoothstep(clamp((km - 100) / 12000, 0, 1))),
    progress: tier === 'near' ? nearMissProgress : travelProgress,
    diveDuration: tier === 'blowout' ? 0.5 : 0.8,
    // The blowout holds on the deadpan distance before pulling back.
    arriveDuration: tier === 'blowout' ? 1.5 : 0.5,
    lastT: 0,
    elapsed: 0,
    answerDropped: false,
    startDist: dist,
    pullbackStarted: false,
    pinBlend: 0,
    flyRef: null,
  };
  // The close flight camera sits ~0.1 above the ground; the default 0.05 near
  // plane sliced through the surface at the bottom of the frame and at the pin.
  setCameraNear(0.005);
  vYaw = vPitch = autoSpin = 0;
}

// Bullseye: no flight. Snap-zoom onto the answer, drop a gold pin, roll a
// shockwave across the surface in slow motion, stamp it, then the usual pullback.
function beginBullseyeReveal(guess, answer, km, newlyEarned, tier = flyoverTier(km)) {
  if (revealViewPreference === 'north-up') {
    beginNorthUpReveal(guess, answer, km, newlyEarned, tier);
    return;
  }
  const path = buildAnswerPath(guess, answer);
  answerLine.visible = false;
  correctPin.root.visible = false;
  correctPin.state = 'idle';
  correctPin.setColor(GOLD_COLOR, '#fff6d8');
  gameEls.distance.textContent = formatKm(km);
  preparePostcard(answer, newlyEarned);
  travelAnimation = {
    ...path,
    km,
    // Keep the landing stamp in sync with the exact-distance classification
    // selected in revealGuess; `km` is rounded only for display.
    tier,
    elapsed: 0,
    startDist: dist,
    answerDropped: false,
    pullbackStarted: false,
    pinBlend: 0,
  };
  vYaw = vPitch = autoSpin = 0;
}

let cameraNearBase = 0.05;
function setCameraNear(near) {
  cameraNearBase = near;
  applyCameraNear();
}
// Deep player zoom sits ~0.03 above the surface, inside the 0.05 near plane:
// pull the plane in with altitude so it never slices the globe.
function applyCameraNear() {
  const near = Math.min(cameraNearBase, Math.max((dist - 1) * 0.5, 0.002));
  if (camera.near === near) return;
  camera.near = near;
  camera.updateProjectionMatrix();
}

// Only the blowout whip-pan widens the lens; everything that solves framing
// assumes FOV, so it is always restored before the pullback.
function setCameraFov(fov) {
  if (camera.fov === fov) return;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

function fadeElement(el, show, duration, delay = 0) {
  el.getAnimations().forEach((a) => a.cancel());
  const fade = el.animate(
    [{ opacity: show ? 0 : 1 }, { opacity: show ? 1 : 0 }],
    { duration, delay, easing: 'ease-out', fill: 'backwards' },
  );
  if (!show) fade.onfinish = () => { el.hidden = true; };
}

// ---------------------------------------------------------------------------
// Two-beat reveal: the map plays alone (route, framing, score pill, distance
// riding the line) for REVEAL_BEAT_MS, then the bottom sheet peeks up. The
// peek bar carries name, score, distance and Next; a tap (or swipe up) opens
// the photo and fact underneath.
// ---------------------------------------------------------------------------
const REVEAL_BEAT_MS = 1500;
const SHEET_SLIDE_MS = 380;
const SHEET_PEEK_H = 80;
const REVEAL_HEADER_H = 52; // the collapsed one-line header, see styles/game.css
let sheetTimer = 0;
let lineLabel = null; // { mid, a, b } globe-local, while the label is on

// Beat one. Called as the camera starts settling on the final framing.
function startRevealBeat(a, b, showLabel = true) {
  gameEls.revealPill.hidden = !gameEls.revealPill.textContent;
  if (!gameEls.revealPill.hidden) {
    gameEls.revealPill.animate([
      { opacity: 0, transform: 'translateX(-50%) translateY(-6px) scale(.92)' },
      { opacity: 1, transform: 'translateX(-50%) translateY(0) scale(1)' },
    ], { duration: 320, delay: 360, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' }); // after the header collapse
  }
  if (showLabel) showLineLabel(a, b);
  clearTimeout(sheetTimer);
  sheetTimer = setTimeout(() => showRevealSheet(true), REVEAL_BEAT_MS);
  postcardCardShown(REVEAL_BEAT_MS + SHEET_SLIDE_MS);
}

function showRevealSheet(animate) {
  clearTimeout(sheetTimer);
  sheetTimer = 0;
  if (gameMode !== 'reveal') return;
  const sheet = gameEls.reveal;
  sheet.getAnimations().forEach((a) => a.cancel());
  sheet.hidden = false;
  if (animate) {
    sheet.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
      { duration: SHEET_SLIDE_MS, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' });
  }
  // The score moves into the peek bar; the floating pill bows out.
  if (!gameEls.revealPill.hidden) fadeElement(gameEls.revealPill, false, 220);
}

function hideRevealSheet() {
  clearTimeout(sheetTimer);
  sheetTimer = 0;
  gameEls.reveal.getAnimations().forEach((a) => a.cancel());
  gameEls.reveal.hidden = true;
  setSheetExpanded(false);
  gameEls.revealPill.getAnimations().forEach((a) => a.cancel());
  gameEls.revealPill.hidden = true;
  gameEls.header.getAnimations().forEach((a) => a.cancel());
  hideLineLabel();
}

function setSheetExpanded(expanded) {
  gameEls.reveal.classList.toggle('expanded', expanded);
  gameEls.peekBar.setAttribute('aria-expanded', String(expanded));
  gameEls.sheetContent.setAttribute('aria-hidden', String(!expanded));
}

// The clue header snaps to its one-line height (so the framing below can
// rely on it) and the change is played back as a FLIP height animation.
function collapseRoundHeader(fromHeight) {
  const header = gameEls.header;
  header.getAnimations().forEach((a) => a.cancel());
  header.animate([{ height: `${fromHeight}px` }, { height: `${REVEAL_HEADER_H}px` }],
    { duration: 340, easing: 'cubic-bezier(.3,.8,.2,1)' });
  gameEls.revealName.animate([
    { opacity: 0, transform: 'translateY(6px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration: 300, delay: 140, easing: 'ease-out', fill: 'backwards' });
}

// The unobscured strip the reveal frames its pins into: below the collapsed
// header and score pill, and inside the top 60% of the screen so the peek bar
// (and most of the expanded sheet) never sits on a pin.
function revealStrip() {
  const top = gameEls.header.getBoundingClientRect().top || 14;
  const safeTop = Math.min(viewH * 0.36, top + REVEAL_HEADER_H + 40);
  const safeBottom = Math.max(safeTop + 120, Math.min(viewH * 0.6, viewH - SHEET_PEEK_H - 24));
  return { safeTop, safeBottom };
}

function showLineLabel(a, b) {
  const mid = a.clone().add(b);
  if (mid.lengthSq() < 1e-8) mid.copy(a).cross(_UP);
  lineLabel = { mid: mid.normalize().multiplyScalar(1 + ROUTE_LIFT), a: a.clone(), b: b.clone() };
  const el = gameEls.lineDistance;
  el.textContent = gameEls.distance.textContent;
  el.hidden = true; // updateLineLabel() shows it once it has a position
  el.dataset.fresh = '1';
}

function hideLineLabel() {
  lineLabel = null;
  gameEls.lineDistance.getAnimations().forEach((a) => a.cancel());
  gameEls.lineDistance.hidden = true;
}

const _labelW = new THREE.Vector3();
const _labelS = new THREE.Vector3();
function projectToScreen(local, out) {
  _labelW.copy(local).applyQuaternion(globe.quaternion);
  const facing = _labelW.dot(camera.position) > _labelW.lengthSq() + 0.02; // in front of the limb
  out.copy(_labelW).project(camera);
  return { x: ((out.x + 1) / 2) * viewW, y: ((1 - out.y) / 2) * viewH, facing };
}

// The lowest screen y the label may reach: the top of the reveal sheet (live,
// so it follows the slide-in and the expand), and the postcard's held spot
// when it is out over the label's column (padded for its tilt and pop lift).
function lineLabelFloor(x, w) {
  const gap = 8;
  let floor = viewH - gap;
  if (!gameEls.reveal.hidden) floor = Math.min(floor, gameEls.reveal.getBoundingClientRect().top - gap);
  const run = postcardRun;
  if (!postcard.hidden && run && run.y != null && x < run.x + POSTCARD_W + 12 && x + w > run.x - 12) {
    floor = Math.min(floor, run.y - 16 - gap);
  }
  return floor;
}

// Pin the distance to the route midpoint every frame. When the pins are close
// on screen the label lifts above them instead of sitting on the markers.
function updateLineLabel() {
  if (!lineLabel) return;
  const el = gameEls.lineDistance;
  const m = projectToScreen(lineLabel.mid, _labelS);
  const onScreen = m.facing && m.x > 0 && m.x < viewW && m.y > 0 && m.y < viewH;
  if (!onScreen) {
    el.hidden = true;
    return;
  }
  const { a, b } = lineLabel;
  const pa = projectToScreen(a, _labelS);
  const pb = projectToScreen(b, _labelS);
  // Long routes: the label sits on the line like a map label. Short ones:
  // it steps off the line along its upward normal, clear of both pins; when
  // the pins all but coincide it rises above their heads.
  const dx = pb.x - pa.x, dy = pb.y - pa.y;
  const len = Math.hypot(dx, dy);
  let ox = 0, oy = 0;
  if (len < 56) oy = -52;
  else if (len < 170) {
    const sign = dx >= 0 ? 1 : -1; // pick the normal that points up the screen
    ox = (dy / len) * 30 * sign;
    oy = (-dx / len) * 30 * sign;
  }
  const w = el.offsetWidth || 80;
  const h = el.offsetHeight || 26;
  const x = clamp(m.x + ox - w / 2, 8, viewW - w - 8);
  let y = m.y + oy - 14;
  // Never let the sheet or the held postcard cover the distance: rise above them.
  const floor = lineLabelFloor(x, w);
  if (y + h > floor) y = Math.max(8, floor - h);
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  if (el.hidden) {
    el.hidden = false;
    if (el.dataset.fresh) {
      delete el.dataset.fresh;
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 200, easing: 'ease-out', fill: 'backwards' });
    }
  }
}

gameEls.peekBar.addEventListener('click', (e) => {
  if (sheetSwiped) {
    sheetSwiped = false;
    return;
  }
  if (e.target.closest('#next-button')) return;
  setSheetExpanded(!gameEls.reveal.classList.contains('expanded'));
});
gameEls.peekBar.addEventListener('keydown', (e) => {
  if (e.target !== gameEls.peekBar || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  setSheetExpanded(!gameEls.reveal.classList.contains('expanded'));
});
// A vertical flick on the sheet opens or closes it; the click that follows
// the pointerup is swallowed so it does not toggle straight back.
let sheetSwipeY = null;
let sheetSwiped = false;
gameEls.reveal.addEventListener('pointerdown', (e) => {
  sheetSwipeY = e.clientY;
  sheetSwiped = false;
});
gameEls.reveal.addEventListener('pointerup', (e) => {
  if (sheetSwipeY == null) return;
  const dy = e.clientY - sheetSwipeY;
  sheetSwipeY = null;
  if (Math.abs(dy) < 24 || e.target.closest('#next-button')) return;
  sheetSwiped = true;
  setSheetExpanded(dy < 0);
});
gameEls.reveal.addEventListener('pointercancel', () => { sheetSwipeY = null; });

function travelView(point) {
  const direction = point.clone().normalize();
  return {
    yaw: Math.atan2(-direction.x, direction.z),
    pitch: clamp(Math.asin(clamp(direction.y, -1, 1)), -PITCH_LIMIT, PITCH_LIMIT),
  };
}

function followTravelPoint(point, lambda = 12) {
  const view = travelView(point);
  revealView = { yaw: nearAngle(view.yaw, yaw), pitch: view.pitch, lambda };
}

const smoothstep = (t) => t * t * (3 - 2 * t);

// Trapezoidal velocity: ease in over the first and out over the last
// TRAVEL_RAMP of the leg, constant cruise between. The old linear progress
// lurched from a standstill at the end of the dive. Head, line, camera and
// counter all share this progress, so they stay in lockstep.
const TRAVEL_RAMP = 0.18;
function travelProgress(u) {
  const v = 1 / (1 - TRAVEL_RAMP);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < TRAVEL_RAMP) return (v * u * u) / (2 * TRAVEL_RAMP);
  if (u > 1 - TRAVEL_RAMP) return 1 - (v * (1 - u) ** 2) / (2 * TRAVEL_RAMP);
  return v * (u - TRAVEL_RAMP / 2);
}

// Near miss: the same quick ease-in, then a long cubic ease-out so the head,
// line and counter all crawl the last few km together. The ease-in constant is
// solved so velocity is continuous where the two pieces meet.
const NEAR_RAMP = 0.15;
const NEAR_K = 3 / (2 * NEAR_RAMP + NEAR_RAMP * NEAR_RAMP);
function nearMissProgress(u) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < NEAR_RAMP) return NEAR_K * u * u;
  const head = NEAR_K * NEAR_RAMP * NEAR_RAMP;
  const s = (u - NEAR_RAMP) / (1 - NEAR_RAMP);
  return head + (1 - head) * (1 - (1 - s) ** 3);
}

// Unit vector on the route, globe-local; t outside 0..1 extends the circle.
function travelPointAt(anim, t, out = new THREE.Vector3()) {
  return out.copy(anim.a).applyAxisAngle(anim.axis, t * anim.angle);
}

// At 0.05 (~320 km) short hops often framed only blank ocean or plain; 0.11
// (~700 km) keeps coastlines, rivers and lakes in view while still reading as
// a low flyover. The trail scales with it to hold the same look-down angle.
const FLY_ALT = 0.11;             // short-hop altitude above the surface (globe radii)
const FLY_BACK = 4.6 * DEG;       // short-hop trail keeps the camera close to the route
const FLY_DROP_BACK = 0.3 * DEG;  // nearly overhead by the time the pin lands
const _flyM = new THREE.Matrix4();
const _flyQ = new THREE.Quaternion();
const _flyUp = new THREE.Vector3();
const _flyFwd = new THREE.Vector3();
const _flyPos = new THREE.Vector3();
const _flyDir = new THREE.Vector3();
const _flyTarget = new THREE.Vector3();

// Pull progressively farther away as the route grows. Short trips keep a
// close (but context-revealing) flyover; medium trips rise enough to reveal curvature; long
// hauls climb to a planetary view. The wider trail at altitude aims farther
// along the great circle instead of staring straight down at passing terrain.
function travelFlightProfile(km) {
  if (km <= 1000) return { altitude: FLY_ALT, trail: FLY_BACK };
  if (km <= 5000) {
    const t = smoothstep((km - 1000) / 4000);
    return {
      altitude: THREE.MathUtils.lerp(FLY_ALT, 0.35, t),
      trail: THREE.MathUtils.lerp(FLY_BACK, 22 * DEG, t),
    };
  }
  const t = smoothstep(clamp((km - 5000) / 7000, 0, 1));
  return {
    altitude: THREE.MathUtils.lerp(0.35, 0.85, t),
    trail: THREE.MathUtils.lerp(22 * DEG, 40 * DEG, t),
  };
}

// World-space flight pose for route progress t. The camera and target are both
// on the great circle, so there is no lateral drift, and looking at the exact
// head position keeps the glow and the end of the line locked to screen centre.
// Over the last 20% the trail closes up, pitching the camera toward the surface
// for a near-overhead pin placement.
function flightPose(anim, t) {
  const dropT = smoothstep(clamp((t - 0.8) / 0.2, 0, 1));
  const trail = THREE.MathUtils.lerp(anim.flyBack, FLY_DROP_BACK, dropT);
  const altitude = THREE.MathUtils.lerp(anim.flyAlt, FLY_ALT, dropT);
  travelPointAt(anim, t - trail / Math.max(anim.angle, 1e-6), _flyUp).applyQuaternion(globe.quaternion);
  _flyPos.copy(_flyUp).multiplyScalar(1 + altitude);
  travelPointAt(anim, t, _flyTarget).multiplyScalar(routeRadius(anim.angle, t)).applyQuaternion(globe.quaternion);
  // Keeping the route tangent as screen-up makes the revealed line run through
  // the centre of the view and remains stable as the camera turns downward.
  _flyFwd.copy(anim.axis).applyQuaternion(globe.quaternion).cross(_flyTarget).normalize();
  _flyM.lookAt(_flyPos, _flyTarget, _flyFwd);
  _flyQ.setFromRotationMatrix(_flyM);
}

// Blend from the orbit camera frame() just placed (w = 0) to the flight pose
// (w = 1). Direction is slerped and radius lerped so the path stays outside
// the globe; orientation is a quaternion slerp, which cannot hit the lookAt
// singularity a lerped up-vector does.
//
// Southbound routes put the flight pose ~180 deg of roll from the north-up
// orbit view, where shortest-path slerp flips between rolling left and right
// as the globe settles. The flight quaternion's sign is kept continuous from
// frame to frame instead (anim.flyRef, reset whenever w = 0 or 1 so the choice
// never shows), and the blend never re-picks the short way.
function placeTravelCamera(anim, t, w) {
  flightPose(anim, t);
  if (!anim.flyRef) {
    if (_flyQ.dot(camera.quaternion) < 0) negateQuaternion(_flyQ);
    anim.flyRef = new THREE.Quaternion();
  } else if (_flyQ.dot(anim.flyRef) < 0) negateQuaternion(_flyQ);
  anim.flyRef.copy(_flyQ);
  if (w >= 1) {
    camera.position.copy(_flyPos);
    camera.quaternion.copy(_flyQ);
  } else {
    const r = THREE.MathUtils.lerp(camera.position.length(), _flyPos.length(), w);
    _flyDir.copy(camera.position).normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(_flyDir, _flyPos.clone().normalize());
    _flyDir.applyQuaternion(new THREE.Quaternion().slerp(turn, w));
    camera.position.copy(_flyDir).multiplyScalar(r);
    slerpDirect(camera.quaternion, _flyQ, w);
  }
  camera.updateMatrixWorld();
}

function negateQuaternion(q) {
  return q.set(-q.x, -q.y, -q.z, -q.w);
}

// q = slerp(q, target, w) along the arc the signs describe (no shortest-path flip).
function slerpDirect(q, target, w) {
  const theta = Math.acos(clamp(q.dot(target), -1, 1));
  const s = Math.sin(theta);
  if (s < 1e-5) return q.slerp(target, w);
  const ka = Math.sin((1 - w) * theta) / s;
  const kb = Math.sin(w * theta) / s;
  return q.set(
    q.x * ka + target.x * kb,
    q.y * ka + target.y * kb,
    q.z * ka + target.z * kb,
    q.w * ka + target.w * kb,
  ).normalize();
}

// Constant on-screen size: the fixed 0.0008 radius suited only the close
// short-hop camera and vanished on medium and long hauls flown higher up.
const _headW = new THREE.Vector3();
function sizeTravelHead(k = 1) {
  _headW.copy(travelHead.position).applyQuaternion(globe.quaternion);
  travelHead.scale.setScalar(Math.max(camera.position.distanceTo(_headW) * 0.015 * k, 1e-6));
}

// During the travel the pins are sized from their real distance to the flight
// camera (blended in/out by anim.pinBlend). Sized for the orbit distance they
// filled the screen at take-off, and the answer pin fell from above the camera.
const _pinW = new THREE.Vector3();
function travelPinScale(pin, base) {
  const w = travelAnimation ? travelAnimation.pinBlend : 0;
  if (!(w > 0) || !pin.root.visible) return base;
  _pinW.set(0, 1, 0).applyQuaternion(pin.root.quaternion).applyQuaternion(globe.quaternion);
  const close = clamp(camera.position.distanceTo(_pinW) / Math.max(fitDist - 1, 0.1), 0.01, 6);
  return THREE.MathUtils.lerp(base, close, w);
}

// Reveal the route up to t, ending the last drawn segment exactly at the head
// instead of at the next vertex (which poked out ahead of the marker).
function trimTravelLine(anim, t) {
  const data = answerLine.geometry.attributes.instanceStart.data;
  const segments = anim.points.length - 1;
  if (anim.trimmedSeg != null) anim.points[anim.trimmedSeg + 1].toArray(data.array, anim.trimmedSeg * 6 + 3);
  anim.trimmedSeg = null;
  if (t >= 1) {
    answerLine.geometry.instanceCount = segments;
  } else {
    const seg = Math.min(segments - 1, Math.floor(clamp(t, 0, 1) * segments));
    travelPointAt(anim, t).multiplyScalar(routeRadius(anim.angle, t)).toArray(data.array, seg * 6 + 3);
    anim.trimmedSeg = seg;
    answerLine.geometry.instanceCount = seg + 1;
  }
  data.needsUpdate = true;
}

// Fired once per reveal, the frame the answer pin touches down (its own clock,
// so it follows the bullseye slow motion).
function answerLanded(anim) {
  anim.landed = true;
  if (anim.tier === 'bullseye' || anim.tier === 'pinpoint') {
    audio.thump(1.7);
    audio.chime();
  } else {
    audio.thump();
    if (anim.tier === 'blowout') audio.bwomp();
  }
  postcardLanded(anim.b);
}

function watchAnswerLanding(anim) {
  if (anim.answerDropped && !anim.landed && correctPin.t >= LAND_T) answerLanded(anim);
}

// Pull back to the north-up framing of both pins, handing the distance over
// to the reveal card. Shared by the flight and the bullseye.
function startPullback(anim) {
  anim.pullbackStarted = true;
  anim.pullbackAt = anim.elapsed;
  // The answer's country fades in as the map plays alone, not at touchdown,
  // where it would compete with the postcard pop.
  showCountryOutline(countryKey(currentItem()), currentItem(), true);
  travelHead.visible = false;
  setCameraNear(0.05);
  setCameraFov(FOV);
  audio.whooshStop();
  anim.pullbackDist = dist;
  anim.pullbackFrom = { yaw, pitch };
  frameRevealPoints(anim.a, anim.b);
  // Settle on the load-time tilt (north up, 20 deg toward the viewer) rather
  // than whatever pitch centred the route; the existing yaw/pitch ease below
  // carries the globe there during the pullback, so there is no extra turn.
  anim.pullbackTo = homeRevealView(anim.a, anim.b, revealView);
  targetDist = anim.pullbackTo.dist;
  anim.finalDist = targetDist;
  // Hand the distance over from the flight pill to the label riding the
  // route; the sheet follows once the map has had its beat.
  if (!gameEls.travelDistance.hidden) fadeElement(gameEls.travelDistance, false, 200);
  if (!bullseyeStamp.hidden) fadeElement(bullseyeStamp, false, 260);
  startRevealBeat(anim.a, anim.b, anim.tier !== 'bullseye');
}

function updatePullback(anim, pullbackDuration = 1.0) {
  const since = anim.elapsed - anim.pullbackAt;
  const pullbackT = smoothstep(clamp(since / pullbackDuration, 0, 1));
  targetDist = anim.pullbackDist + (anim.finalDist - anim.pullbackDist) * pullbackT;
  anim.pinBlend = Math.min(anim.pinBlend, 1 - pullbackT);
  // Ease the view across instead of retargeting the damper in one step, which
  // started the globe turning at full speed (a visible kick on long routes).
  // A touch during the pullback hands the view to the player.
  if (pointers.size > 0) anim.viewFree = true;
  if (!anim.viewFree) {
    revealView = {
      yaw: THREE.MathUtils.lerp(anim.pullbackFrom.yaw, anim.pullbackTo.yaw, pullbackT),
      pitch: THREE.MathUtils.lerp(anim.pullbackFrom.pitch, anim.pullbackTo.pitch, pullbackT),
      lambda: 14,
    };
  }
  if (since >= pullbackDuration) {
    targetDist = anim.finalDist;
    if (!anim.viewFree) revealView = anim.pullbackTo;
    travelAnimation = null;
  }
}

function updateBullseyeAnimation(anim, dt) {
  const zoomStart = 0.45; // let the guess pin land first
  const dropAt = 0.95;
  const slowFor = 1.0; // real seconds of slow motion after touchdown
  if (anim.elapsed < zoomStart) return;
  if (!anim.zooming) {
    anim.zooming = true;
    audio.whooshStart();
  }
  // Snap: a fast damper straight down onto the answer, a quick rising zip.
  followTravelPoint(anim.b, 14);
  if (!anim.landed) targetDist = Math.max(SCENE_MIN_DIST, 1.42);
  const zip = clamp((anim.elapsed - zoomStart) / 0.45, 0, 1);
  audio.whooshSet(Math.sin(Math.PI * zip) * 0.8, 0.3 + 0.7 * zip);
  if (zip >= 1) audio.whooshStop();

  if (anim.elapsed >= dropAt && !anim.answerDropped) {
    correctPin.drop(anim.b);
    anim.answerDropped = true;
  }
  watchAnswerLanding(anim);
  if (!anim.landed) return;

  if (anim.landedAt == null) {
    anim.landedAt = anim.elapsed;
    anim.wave = 0;
    shockwave.quaternion.setFromUnitVectors(_UP, anim.b);
    shockwave.visible = true;
    // Stamp the empty map above the pins: the postcard pops into the band
    // below them at the same moment and would bury it there.
    const v = anim.b.clone().multiplyScalar(1.02).applyQuaternion(globe.quaternion).project(camera);
    const pinY = ((1 - v.y) / 2) * viewH;
    const headerBottom = gameEls.header.getBoundingClientRect().bottom || 60;
    bullseyeStamp.style.top = `${Math.max(headerBottom + 80, pinY - 140)}px`;
    setAccuracyStamp(anim.tier);
    bullseyeStamp.hidden = false;
    bullseyeStamp.animate([
      { transform: 'translate(-50%, -50%) rotate(-24deg) scale(2.6)', opacity: 0 },
      { transform: 'translate(-50%, -50%) rotate(-7deg) scale(.92)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%, -50%) rotate(-9deg) scale(1)', opacity: 1 },
    ], { duration: 380, delay: 120, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'backwards' });
    if (navigator.vibrate) navigator.vibrate([18, 40, 30]);
  }
  const since = anim.elapsed - anim.landedAt;
  // Drop into slow motion on impact and ease back to full speed.
  timeScale = since < slowFor ? 0.3 : THREE.MathUtils.lerp(0.3, 1, smoothstep(clamp((since - slowFor) / 0.4, 0, 1)));
  // A slow push-in while time is stretched.
  targetDist = Math.max(SCENE_MIN_DIST, 1.42 - 0.05 * smoothstep(clamp(since / slowFor, 0, 1)));
  anim.wave += (dt * timeScale) / 0.9;
  shockwaveMat.uniforms.uP.value = Math.min(anim.wave, 1);
  shockwaveMat.uniforms.uRadius.value = 0.3 * anim.pinScale;
  shockwave.visible = anim.wave < 1;

  if (since < slowFor + 0.55) return;
  if (!anim.pullbackStarted) {
    answerLine.visible = true; // the whole (tiny) route, as in the static reveal
    startPullback(anim);
  }
  updatePullback(anim);
}

function updateTravelAnimation(dt, pinScale) {
  if (!travelAnimation) return;
  const anim = travelAnimation;
  anim.elapsed += dt;
  anim.pinScale = pinScale;
  if (anim.tier === 'bullseye' || anim.tier === 'pinpoint') {
    updateBullseyeAnimation(anim, dt);
    return;
  }
  const diveStart = 0.6; // 0.5 s pin drop, then a tiny breath before the dive
  const diveDuration = anim.diveDuration;
  const travelDuration = anim.travelDuration;
  const arriveDuration = anim.arriveDuration;
  const arriveBlend = 0.5;
  const flyDist = Math.max(SCENE_MIN_DIST, 1 + anim.flyAlt);
  const arriveDist = Math.max(SCENE_MIN_DIST, 1.52);
  const flyStart = diveStart + diveDuration;
  const arriveStart = flyStart + travelDuration;
  const pullbackStart = arriveStart + arriveDuration;

  if (anim.elapsed < diveStart) return;

  // The dive and arrive phases blend the camera between the orbit view and the
  // flight pose; previously both ends hard-cut (orbit altitude 0.36 looking
  // straight down <-> first-person at 0.075), and on arrival the orbit view was
  // still centred on the guess, so it snapped back and swung across the globe.
  if (anim.elapsed < flyStart) {
    const diveT = smoothstep(clamp((anim.elapsed - diveStart) / diveDuration, 0, 1));
    followTravelPoint(anim.a, 10);
    targetDist = anim.startDist + (flyDist - anim.startDist) * diveT;
    anim.pinBlend = diveT;
    placeTravelCamera(anim, 0, diveT);
    audio.whooshStart();
    audio.whooshSet(0.35 * diveT, 0.15 * diveT);
    return;
  }

  const travelU = (anim.elapsed - flyStart) / travelDuration;
  const travelT = anim.progress(travelU);
  if (anim.elapsed < arriveStart) {
    answerLine.visible = true;
    if (gameEls.travelDistance.hidden) {
      gameEls.travelDistance.hidden = false;
      fadeElement(gameEls.travelDistance, true, 220);
    }
    trimTravelLine(anim, travelT);
    const head = travelPointAt(anim, travelT);
    travelHead.position.copy(head).multiplyScalar(routeRadius(anim.angle, travelT));
    travelHead.visible = true;
    // Keep the orbit view moving with the flight so that when the camera blends
    // back out on arrival it is already above the answer. Interpolating the
    // endpoint views (rather than chasing the head's yaw) avoids a sudden
    // 180 deg globe spin, and a sweep of the world-space lighting, whenever a
    // route passes near a pole.
    if (!anim.flightViews) {
      const from = travelView(anim.a);
      const to = travelView(anim.b);
      from.yaw = nearAngle(from.yaw, yaw);
      to.yaw = nearAngle(to.yaw, from.yaw);
      anim.flightViews = { from, to };
    }
    const { from, to } = anim.flightViews;
    revealView = {
      yaw: THREE.MathUtils.lerp(from.yaw, to.yaw, travelT),
      pitch: THREE.MathUtils.lerp(from.pitch, to.pitch, travelT),
      lambda: 10,
    };
    targetDist = flyDist;
    anim.pinBlend = 1;
    // Whoosh: volume follows the progress velocity (relative to cruise), pitch
    // the real ground speed, so a blowout screams and a near miss sighs.
    const rate = dt > 0 ? (travelT - anim.lastT) / (dt / travelDuration) : 0;
    anim.lastT = travelT;
    const level = clamp(rate / 1.22, 0, 1);
    const groundSpeed = clamp((rate * anim.angle) / travelDuration / 1.9, 0, 1);
    audio.whooshSet(0.35 + 0.65 * level, level * (0.25 + 0.75 * Math.sqrt(groundSpeed)));
    // Whip-pan: the lens widens with speed so the globe streaks past.
    if (anim.tier === 'blowout') setCameraFov(FOV + 14 * level);
    placeTravelCamera(anim, travelT, 1);
    sizeTravelHead();
    // Same progress as the head (the old ease-out counter ran ~35% ahead of
    // the marker mid-flight).
    gameEls.travelDistance.querySelector('span').textContent = formatKm(Math.round(anim.km * travelT));
    if (anim.tier === 'near') gameEls.travelDistance.classList.toggle('suspense', travelU > 0.45);
    return;
  }

  if (!anim.answerDropped) {
    trimTravelLine(anim, 1);
    setCameraFov(FOV);
    audio.whooshStop();
    const pill = gameEls.travelDistance;
    pill.querySelector('span').textContent = formatKm(anim.km);
    pill.classList.remove('suspense');
    if (anim.tier === 'blowout') {
      pill.classList.add('deadpan');
      pill.querySelector('small').textContent = DEADPAN_LINES[Math.floor(Math.random() * DEADPAN_LINES.length)];
    }
    correctPin.drop(anim.b);
    anim.answerDropped = true;
    anim.flyRef = null; // w is ~1 here, so re-picking the short way is invisible
  }
  watchAnswerLanding(anim);
  if (anim.elapsed < pullbackStart) {
    const arriveT = smoothstep(clamp((anim.elapsed - arriveStart) / arriveBlend, 0, 1));
    followTravelPoint(anim.b, 10);
    targetDist = flyDist + (arriveDist - flyDist) * arriveT;
    placeTravelCamera(anim, 1, 1 - arriveT);
    // Shrink the head into the landing pin instead of blinking it out.
    const shrink = 1 - clamp((anim.elapsed - arriveStart) / 0.18, 0, 1);
    travelHead.position.copy(anim.b).multiplyScalar(routeRadius(anim.angle, 1));
    travelHead.visible = shrink > 0;
    if (shrink > 0) sizeTravelHead(smoothstep(shrink));
    return;
  }

  if (!anim.pullbackStarted) startPullback(anim);
  updatePullback(anim);
}

// Put the midpoint of the shortest great-circle arc in the unobscured strip
// between the clue header and result card, then back the camera up until the
// two endpoints (plus marker clearance) fit inside that strip.
function safeStrip(headerEl, cardEl) {
  const header = headerEl.getBoundingClientRect();
  const card = cardEl.getBoundingClientRect();
  const safeTop = Math.min(viewH * 0.42, header.bottom + 18);
  return { safeTop, safeBottom: Math.max(safeTop + 80, card.top - 18) };
}

function frameRevealPoints(a, b, strip = revealStrip()) {
  const { safeTop, safeBottom } = strip;
  const safeY = (safeTop + safeBottom) / 2;
  const safeRadius = Math.max(40, Math.min(viewW / 2 - 28, safeY - safeTop, safeBottom - safeY));
  const separation = a.angleTo(b);
  const halfAngle = Math.min(84 * DEG, separation / 2 + 4 * DEG);
  const screenSlope = (safeRadius / (viewH / 2)) * Math.tan((FOV / 2) * DEG);
  const screenFit = Math.cos(halfAngle) + Math.sin(halfAngle) / Math.max(screenSlope, 0.02);
  const horizonFit = halfAngle < Math.PI / 2 ? 1 / Math.max(Math.cos(halfAngle), 0.04) : 14;
  targetDist = clamp(Math.max(screenFit, horizonFit) * 1.04, SCENE_MIN_DIST, 14);

  // Slerp's halfway point is simply the normalized vector sum, except for the
  // vanishingly rare antipodal case where a stable perpendicular is used.
  const midpoint = a.clone().add(b);
  if (midpoint.lengthSq() < 1e-8) midpoint.copy(a).cross(_UP);
  midpoint.normalize();

  // Aim that midpoint at the safe area's vertical centre rather than beneath
  // the result card. This is the same two-axis solve used by globe dragging.
  const ndcY = 1 - (safeY / viewH) * 2;
  const rayDir = new THREE.Vector3(0, ndcY * Math.tan((FOV / 2) * DEG), -1).normalize();
  const ray = new THREE.Ray(new THREE.Vector3(0, 0, targetDist), rayDir);
  const target = ray.intersectSphere(_unitSphere, new THREE.Vector3()) || new THREE.Vector3(0, 0, 1);
  const R = Math.hypot(target.y, target.z);
  const alpha = Math.atan2(target.z, target.y);
  const spread = Math.acos(clamp(midpoint.y / Math.max(R, 1e-6), -1, 1));
  const candidates = [alpha + spread, alpha - spread].map((p) => clamp(nearAngle(p, pitch), -PITCH_LIMIT, PITCH_LIMIT));
  const targetPitch = candidates.reduce((best, p) => Math.abs(p - pitch) < Math.abs(best - pitch) ? p : best);
  const cp = Math.cos(targetPitch), sp = Math.sin(targetPitch);
  const mx = target.x;
  const mz = -target.y * sp + target.z * cp;
  const targetYaw = nearAngle(Math.atan2(mx, mz) - Math.atan2(midpoint.x, midpoint.z), yaw);
  revealView = { yaw: targetYaw, pitch: targetPitch };
  vYaw = vPitch = autoSpin = 0;
}

// North-up reveals preserve the player's pitch and rotate only around the
// globe's polar axis. Distance still changes as needed to keep both pins in view.
function frameNorthUpRevealPoints(a, b, strip = revealStrip()) {
  const { safeTop, safeBottom } = strip;
  const safeY = (safeTop + safeBottom) / 2;
  const safeRadius = Math.max(40, Math.min(viewW / 2 - 28, safeY - safeTop, safeBottom - safeY));
  const separation = a.angleTo(b);
  const halfAngle = Math.min(84 * DEG, separation / 2 + 4 * DEG);
  const screenSlope = (safeRadius / (viewH / 2)) * Math.tan((FOV / 2) * DEG);
  const screenFit = Math.cos(halfAngle) + Math.sin(halfAngle) / Math.max(screenSlope, 0.02);
  const horizonFit = halfAngle < Math.PI / 2 ? 1 / Math.max(Math.cos(halfAngle), 0.04) : 14;
  targetDist = clamp(Math.max(screenFit, horizonFit) * 1.04, SCENE_MIN_DIST, 14);

  const midpoint = a.clone().add(b);
  if (midpoint.lengthSq() < 1e-8) midpoint.copy(a).cross(_UP);
  midpoint.normalize();
  const targetYaw = nearAngle(Math.atan2(-midpoint.x, midpoint.z), yaw);
  revealView = { yaw: targetYaw, pitch };
  vYaw = vPitch = autoSpin = 0;
}

// The view frameRevealPoints picked, re-solved at the load-time pitch: yaw
// centres the route midpoint horizontally and the distance backs off until
// both pins sit in the safe strip, clear of the horizon. Routes too far from
// the equator to fit that way step the pitch toward the solved one.
function homeRevealView(a, b, solved) {
  const { safeTop, safeBottom } = revealStrip();
  const tanV = Math.tan((FOV / 2) * DEG);
  const aspect = viewW / viewH;
  const midpoint = a.clone().add(b);
  if (midpoint.lengthSq() < 1e-8) midpoint.copy(a).cross(_UP);
  midpoint.normalize();
  const y = nearAngle(Math.atan2(-midpoint.x, midpoint.z), solved.yaw);
  const probe = new THREE.Object3D();
  const p = new THREE.Vector3();
  const fits = (d) => [a, b].every((point) => {
    p.copy(point).applyQuaternion(probe.quaternion);
    const depth = d - p.z;
    if ((d * p.z - 1) / Math.hypot(p.x, p.y, depth) < 0.25) return false; // near or past the limb
    const sx = (0.5 + p.x / (depth * tanV * aspect) / 2) * viewW;
    const sy = (0.5 - p.y / (depth * tanV) / 2) * viewH;
    return sx > 28 && sx < viewW - 28 && sy > safeTop + 36 && sy < safeBottom - 10; // pin heads stand above the point
  });
  for (let k = 0; k <= 1; k += 0.25) {
    const tryPitch = THREE.MathUtils.lerp(HOME_PITCH, solved.pitch, k);
    setGlobeQuaternion(probe, y, tryPitch);
    for (let d = targetDist; d <= Math.min(14, targetDist * 1.3); d *= 1.04) {
      if (fits(d)) return { yaw: y, pitch: tryPitch, dist: d };
    }
  }
  return { ...solved, dist: targetDist };
}

// Compact earn toast: appears after the flyover completes, doesn't block the globe.
// The postcard is the payoff of the flight, not a competing modal.
function showEarnToast(answer, tier) {
  document.querySelector('.earn-toast')?.remove();
  const style = document.createElement('style');
  style.textContent = `
    .earn-toast { position: fixed; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 112px); transform: translateX(-50%) translateY(20px); z-index: 50; display: flex; align-items: center; gap: 10px; padding: 10px 16px 10px 10px; border-radius: 999px; background: rgba(20,28,52,.92); border: 1px solid rgba(255,199,106,.4); box-shadow: 0 8px 32px rgba(0,0,0,.5); opacity: 0; transition: opacity .3s, transform .3s; pointer-events: none; max-width: 90vw; }
    .earn-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .earn-toast img { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; object-position: center 20%; flex: none; }
    .earn-toast .earn-toast-text { color: #f3f9ff; font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .earn-toast .earn-toast-text small { display: block; color: #ffc76a; font-size: 11px; font-weight: 600; }
  `;
  document.head.appendChild(style);
  const toast = document.createElement('div');
  toast.className = 'earn-toast';
  const tierLabel = tier === EARN_PINPOINT ? '📍 Pinpoint!' : tier === EARN_BULLSEYE ? '🎯 Bullseye!' : 'New postcard earned!';
  toast.innerHTML = `
    <img src="${answer.image || ''}" alt="">
    <div class="earn-toast-text">${tierLabel}<small>${answer.clue || answer.short || ''}</small></div>
  `;
  document.body.appendChild(toast);
  // Animate in
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
  // Auto-dismiss after 3s
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.remove(); style.remove(); }, 300);
  }, 3000);
}

// Save the outcome with the round rather than trying to reconstruct it from the
// passport later. A postcard can only be new or upgraded at the instant the
// guess is made; opening an already-finished daily must not change that story.
function postcardRoundOutcome(previousEarn, newlyEarned) {
  if (!newlyEarned) return { kind: 'miss' };
  return {
    kind: previousEarn ? 'upgrade' : 'new',
    tier: newlyEarned,
  };
}

function revealGuess(guess, restoring = false) {
  if (gameMode !== 'guess' && !restoring) return;
  const answer = currentItem();
  const kmExact = distanceKm(guess, answer);
  // PvP shows the server's accepted distance and score; the local exact
  // distance only picks the flyover tier.
  const pvpScored = pvp.active ? pvp.reveal : null;
  const km = pvpScored ? pvpScored.distanceKm : Math.round(kmExact);
  const base = pvpScored ? pvpScored.score : Math.round(distanceScore(kmExact));
  const oneOff = survival.active || endless.active || expeditionRun.active || pvp.active; // outside the daily
  const score = oneOff ? 0 : scoreGuess(kmExact, daily.round);
  if (!restoring && survival.active) {
    survival.lastDistance = km;
    survival.missed = kmExact > SURVIVAL_LIMIT_KM;
    survival.results.push({ item: answer, distance: km });
    if (!survival.missed) {
      survival.survived += 1;
      saveSurvivalBest(survival.survived);
    }
    gameEls.number.textContent = `Streak ${survival.survived}`;
  }
  gameMode = 'reveal';
  window.__canGuess = false;
  const headerFrom = gameEls.header.offsetHeight;
  document.body.className = pvp.active ? 'game-reveal pvp'
    : expeditionRun.active ? 'game-reveal expedition-mode'
    : survival.active
    ? `game-reveal survival${survival.missed ? ' survival-miss' : ''}`
    : endless.active ? 'game-reveal endless' : 'game-reveal';
  gameEls.hint.textContent = '';
  gameEls.distance.textContent = window.__travelAnim && !restoring ? '0 km' : formatKm(km);
  // Capture the passport state before this guess changes it. The reveal starts
  // with the thumbnail the player already had, then a new unlock can land in it.
  const wasVisited = Object.hasOwn(passport.visits, answer.id);
  const previousEarn = passport.meta[answer.id]?.e || 0;
  // Endless and PvP earn visits only; postcards come from daily and survival.
  // PvP records each accepted round once (pvp.recordVisit), never on a replay.
  const record = pvp.active ? pvp.recordVisit : !restoring;
  const newlyEarned = record ? recordVisit(answer.id, base, pvpScored ? pvpScored.distanceKm : kmExact, !endless.active && !pvp.active) : 0; // exact, so earning matches the flyover tier
  if (!restoring && !oneOff) {
    daily.results[daily.round] = {
      guess,
      distance: km,
      score,
      base,
      distanceExact: kmExact,
      postcard: postcardRoundOutcome(previousEarn, newlyEarned),
    };
    saveDaily();
  }
  if (!restoring && (survival.active || expeditionRun.active)) {
    const postcard = postcardRoundOutcome(previousEarn, newlyEarned);
    if (postcard.kind !== 'miss') runHaul.push({ result: { distance: km, distanceExact: kmExact, postcard }, item: answer });
  }
  if (!restoring && expeditionRun.active) completeExpeditionRound();
  const weight = oneOff ? 1 : WEIGHTS[daily.round];
  gameEls.baseScore.textContent = base;
  gameEls.mult.textContent = `×${weight.toFixed(1)}`;
  gameEls.mult.style.display = oneOff ? 'none' : '';
  const placeName = answer.clue || answer.short;
  gameEls.revealName.textContent = placeName;
  gameEls.peekName.textContent = placeName;
  gameEls.fact.textContent = answer.fact;
  setThumb(gameEls.thumb, answer.image);
  setThumb(gameEls.peekThumb, answer.image);
  peekSlot.hidden = !answer.image;
  setRevealThumbState(answer, wasVisited, previousEarn);
  const pill = gameEls.revealPill;
  pill.classList.remove('safe', 'miss');
  if (expeditionRun.active) {
    const total = expeditionLocations(expeditionRun.expedition).length;
    const finished = expeditionRun.index + 1 >= total;
    gameEls.score.textContent = `${expeditionRun.index + 1}/${total}`;
    pill.textContent = finished ? '🏅 Expedition complete!' : `${expeditionRun.index + 1}/${total} complete`;
    pill.classList.add('safe');
    gameEls.next.textContent = finished ? 'See badge' : 'Next stop';
  } else if (survival.active) {
    gameEls.survivalStreak.textContent = survival.missed
      ? `Run ended · ${survival.survived} survived`
      : `${survival.survived} survived`;
    gameEls.score.textContent = survival.missed ? '✗ Run over' : `${survival.survived}`;
    pill.textContent = survival.missed ? '✗ Over 150 km' : '✓ Survived';
    pill.classList.add(survival.missed ? 'miss' : 'safe');
    gameEls.next.textContent = survival.missed ? 'See run' : 'Keep going';
  } else if (pvp.active) {
    gameEls.score.textContent = `+${base}`;
    pill.textContent = `+${base}`;
    gameEls.next.textContent = pvp.result || pvp.round >= 5 ? 'Results' : 'Next';
    pvpRenderVs();
  } else {
    // Endless is unscored: no pill, and the peek bar shows just the distance.
    gameEls.score.textContent = endless.active ? '' : `+${score}`;
    pill.textContent = endless.active ? '' : `+${score}`;
    gameEls.next.textContent = endless.active ? 'Next' : daily.round === 4 ? 'Results' : 'Next';
  }
  if (!restoring && headerFrom > REVEAL_HEADER_H) collapseRoundHeader(headerFrom);
  const tier = flyoverTier(kmExact);
  const animate = window.__travelAnim !== false && !restoring;
  // Queue the earn celebration for after the flyover completes.
  // The earn toast is non-blocking, but holds off until the postcard has settled.
  if (newlyEarned) {
    setTimeout(() => {
      if (animate) whenPostcardDone(() => showEarnToast(answer, newlyEarned));
      else showEarnToast(answer, newlyEarned);
    }, animate ? 800 : 100);
  }
  if (animate && (tier === 'bullseye' || tier === 'pinpoint')) {
    document.body.classList.add('bullseye');
    gameEls.hint.textContent = tier === 'pinpoint' ? 'Pinpoint! Incredible accuracy' : 'Bullseye! The gold marker shows the answer';
    beginBullseyeReveal(guess, answer, km, newlyEarned, tier);
  } else if (animate) beginTravelReveal(guess, answer, km, newlyEarned, tier);
  else {
    revealThumbCurrent();
    let a;
    let b;
    if (revealViewPreference === 'north-up') {
      ({ a, b } = buildAnswerPath(guess, answer));
      if (activePin >= 0) pins[activePin].drop(a);
      correctPin.drop(b);
      answerLine.visible = true;
      frameNorthUpRevealPoints(a, b);
      showCountryOutline(countryKey(answer), answer, false);
    } else {
      ({ a, b } = placeRevealVisual(guess, answer));
    }
    gameEls.distance.textContent = formatKm(km);
    if (restoring) {
      // Coming back to a finished round: no beat to replay.
      showLineLabel(a, b);
      showRevealSheet(false);
    } else startRevealBeat(a, b, tier !== 'bullseye');
  }
}

// Drop the old src when there's no image, so a previous round's photo can't linger.
function setThumb(img, url) {
  if (url) img.src = url;
  else img.removeAttribute('src');
  img.hidden = !url;
}

// Centralized thumbnail state update: applies earn tier and grayscale in one place.
// All modes must use this (via setRevealThumbState or revealThumbCurrent) to avoid drift.
function applyThumbState(thumb, item, earned, visited) {
  const showGrayscale = visited && !earned;
  thumb.classList.toggle('seen-no-postcard', showGrayscale);
  thumb.classList.toggle('no-postcard', showGrayscale);
  applyCardTier(thumb, item, earned);
  thumb.parentElement.querySelector(':scope > .prox-badge')?.remove();
}

function setRevealThumbState(item, visited, earned) {
  peekSlot.classList.toggle('mystery', !visited);
  for (const thumb of [gameEls.thumb, gameEls.peekThumb]) {
    applyThumbState(thumb, item, earned, visited);
  }
}

// Centralized thumbnail earn state: single source of truth for all modes.
// Returns the earn tier (0-3) that the thumbnail should display.
function getThumbEarn(item) {
  if (!item) return 0;
  // Endless never earns postcards (visits only, by design)
  if (endless.active) return 0;
  return passport.meta[item.id]?.e || 0;
}

function revealThumbCurrent() {
  const item = currentItem();
  const earned = getThumbEarn(item);
  const visited = Object.hasOwn(passport.visits, item.id);
  peekSlot.classList.remove('mystery');
  for (const thumb of [gameEls.thumb, gameEls.peekThumb]) {
    applyThumbState(thumb, item, earned, visited);
  }
}

function scoreEmoji(base) {
  if (base >= 1000) return '🎯';
  if (base >= 900) return '🔥';
  if (base >= 700) return '🏆';
  if (base >= 400) return '🙂';
  if (base >= 1) return '😅';
  return '🥶';
}

const COUNTRY_FLAGS = {
  Scotland: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  England: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  'Northern Ireland': '🇬🇧',
  Wales: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}',
  'International Waters': '🌊', Uruguay: '🇺🇾', 'United States': '🇺🇸',
  Suriname: '🇸🇷', Botswana: '🇧🇼', Guyana: '🇬🇾', Ukraine: '🇺🇦',
  Comoros: '🇰🇲', Niue: '🇳🇺', 'Cape Verde': '🇨🇻', Latvia: '🇱🇻',
  'Vatican City': '🇻🇦', Lesotho: '🇱🇸', Brunei: '🇧🇳',
};

function flagForLocation(item) {
  return item.clue?.match(/\p{Regional_Indicator}{2}/u)?.[0] || COUNTRY_FLAGS[item.country] || '🌍';
}

function postcardDistance(result, outcome) {
  const distance = Number.isFinite(result.distanceExact) ? result.distanceExact : result.distance;
  const precision = outcome?.tier === EARN_PINPOINT ? 1 : 0;
  return `${distance.toLocaleString(undefined, { maximumFractionDigits: precision, minimumFractionDigits: precision })} km`;
}

function postcardSummaryCard(result, item) {
  const outcome = result.postcard;
  if (!outcome || !['new', 'upgrade'].includes(outcome.kind)) return null;
  const card = document.createElement('article');
  card.className = 'pp-post';
  applyCardTier(card, item, outcome.tier);
  const photo = document.createElement('div');
  photo.className = 'pp-photo';
  if (item.image) {
    const img = document.createElement('img');
    img.src = item.image;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => img.remove(), { once: true });
    photo.append(img);
  }
  const flag = flagForLocation(item);
  const name = document.createElement('p');
  name.className = 'pp-name';
  name.textContent = `${item.short || item.clue}${flag ? ` ${flag}` : ''}`;
  const meta = document.createElement('p');
  meta.className = 'pp-meta';
  const distanceText = postcardDistance(result, outcome);
  if (outcome.kind === 'upgrade') {
    meta.textContent = `Upgraded • ${distanceText}`;
  } else {
    meta.textContent = `New • ${distanceText}`;
  }
  card.append(photo, name, meta);
  const entry = passportEntryFor(item);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-haspopup', 'dialog');
  card.setAttribute('aria-label', `Open postcard: ${name.textContent}`);
  card.addEventListener('click', () => openPostcard(entry, card));
  card.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openPostcard(entry, card);
  });
  return card;
}

const SHARE_URL = 'https://where-on.earth';
const SHARE_HASHTAG = '#WhereOnEarth';

function closestGuessLines(results, items) {
  return results
    .map((result, index) => ({ result, item: items[index] }))
    .filter(({ result, item }) => item && Number.isFinite(result.distance))
    .sort((a, b) => a.result.distance - b.result.distance)
    .slice(0, 3)
    .map(({ result, item }) => `${item.short || item.clue}: ${result.distance.toLocaleString()} km`);
}

function formatGameShare({ title, titleSep = ' — ', headline, streak, streakLabel = 'Best streak', guesses = [], visited, missed }) {
  const lines = [`Where on Earth?${titleSep}${title}`, headline];
  if (streak != null) lines.push(`${streakLabel}: ${streak.toLocaleString()}`);
  if (guesses.length) lines.push('', ...guesses);
  if (visited != null) lines.push('', `${visited.toLocaleString()} places visited`);
  if (missed) lines.push(`Missed: ${missed}`);
  lines.push('', `${SHARE_URL} ${SHARE_HASHTAG}`);
  return lines.join('\n');
}

function shareText() {
  const dateStr = new Date(`${daily.date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const total = daily.results.reduce((sum, result) => sum + result.score, 0);
  const lines = daily.results.map((result, index) => {
    const base = result.base ?? Math.round((result.score * 10) / WEIGHTS[index]);
    return `${base} ${scoreEmoji(base)}`;
  });
  return `https://where-on.earth\n${dateStr}\n\nFinal Score: ${total}\n\n${lines.join('\n')}`;
}

function postcardSummaryOutcomes() {
  return daily.results
    .map((result, index) => ({ result, item: selected[index] }))
    .filter(({ result }) => ['new', 'upgrade'].includes(result.postcard?.kind));
}

// Survival and Expeditions are unscored, so they have no daily.results to read
// back. Their new and upgraded postcards are collected here as rounds are played.
const runHaul = [];

// Show the run's haul before moving on, then forget it so it can't show twice.
function showRunHaul(next, nextLabel) {
  showPostcardSummary(runHaul.splice(0), next, nextLabel);
}

function postcardSummaryCounts(outcomes) {
  return outcomes.reduce((counts, { result }) => {
    counts[result.postcard.kind] += 1;
    return counts;
  }, { new: 0, upgrade: 0 });
}

let postcardSummaryNext = showResults;

function showPostcardSummary(outcomes = postcardSummaryOutcomes(), next = showResults, nextLabel = 'Continue to results') {
  if (!outcomes.length) return next();
  postcardSummaryNext = next;
  gameEls.postcardSummaryContinue.textContent = nextLabel;
  clearReveal();
  hideScreens();
  gameMode = 'postcard-summary';
  window.__canGuess = false;
  gameEls.postcardSummaryScreen.hidden = false;
  document.body.classList.add('game-results');
  const { new: newCount, upgrade: upgradeCount } = postcardSummaryCounts(outcomes);
  gameEls.postcardSummaryLede.textContent = `${newCount ? `${newCount} new postcard${newCount === 1 ? '' : 's'}` : 'No new postcards'}${newCount && upgradeCount ? ' and ' : ''}${upgradeCount ? `${upgradeCount} upgraded` : ''}.`;
  gameEls.breakdown.replaceChildren(...outcomes.map(({ result, item }) => postcardSummaryCard(result, item)));
  const countLabel = (count, label) => {
    const el = document.createElement('span');
    const number = document.createElement('b');
    number.textContent = count;
    el.append(number, ` ${label}`);
    return el;
  };
  gameEls.postcardSummaryCounts.replaceChildren(
    countLabel(newCount, 'new'),
    Object.assign(document.createElement('span'), { className: 'postcard-summary-separator', textContent: '·' }),
    countLabel(upgradeCount, 'upgraded'),
  );
}

function showResults() {
  clearReveal();
  hideScreens();
  gameMode = 'results';
  window.__canGuess = false;
  gameEls.results.hidden = false;
  document.body.classList.add('game-results');
  daily.complete = true;
  saveDaily();
  const streak = finishStreak();
  recordHistory();
  const total = daily.results.reduce((sum, result) => sum + result.score, 0);
  gameEls.total.textContent = total.toLocaleString();
  gameEls.resultStreak.textContent = `🔥 ${streak} day streak`;
  gameEls.resultsBreakdown.replaceChildren(...daily.results.map((result, i) => {
    const round = document.createElement('li');
    const number = document.createElement('b');
    const place = document.createElement('span');
    const metrics = document.createElement('span');
    const points = document.createElement('span');
    const distance = document.createElement('span');

    const item = selected[i];
    const city = item?.short || item?.clue || 'Unknown location';
    const country = item?.country || '';
    const flag = item ? flagForLocation(item) : '🌍';
    const rawScore = result.base ?? Math.round(result.score / WEIGHTS[i]);

    number.textContent = i + 1;
    place.className = 'place';
    const hasCountry = country && city.toLocaleLowerCase().includes(country.toLocaleLowerCase());
    place.textContent = `${city}${country && !hasCountry ? `, ${country}` : ''} ${flag}`;
    metrics.className = 'result-metrics';
    points.className = 'points';
    points.textContent = rawScore.toLocaleString();
    distance.className = 'distance';
    distance.textContent = formatKm(result.distance);
    metrics.append(points, distance);
    round.append(number, place, metrics);
    return round;
  }));
  tickCountdown();
}

function syncDailyButton() {
  const played = daily && daily.complete && daily.date === localDateKey();
  gameEls.play.querySelector('.mode-desc').textContent = played ? '✓ See results' : '5 places daily';
  gameEls.play.classList.toggle('played', Boolean(played));
}

function startGame() {
  borders.active = false;
  expeditionRun.active = false;
  survival.active = false;
  endless.active = false;
  if (daily.date !== localDateKey()) loadDaily(); // page left open past midnight
  if (daily.complete && daily.results.length === 5) showResults();
  else if (daily.results[daily.round]) {
    showRound();
    revealGuess(daily.results[daily.round].guess, true);
  } else showRound();
}

function nextRound() {
  if (gameMode !== 'reveal') return;
  // Clear any pending earn toast from the previous round; if the user moved on
  // before the flyover finished, the toast should not appear in the new round.
  window.__pendingEarn = null;
  document.querySelector('.earn-toast')?.remove();
  if (borders.active) {
    if (borders.missed) showBordersGameOver();
    else bordersGo();
  } else if (survival.active) {
    if (survival.missed) showRunHaul(showSurvivalGameOver, 'See run');
    else survivalGo();
  } else if (expeditionRun.active) {
    if (expeditionRun.index + 1 >= expeditionLocations(expeditionRun.expedition).length) {
      const { id } = expeditionRun.expedition;
      showRunHaul(() => showExpeditionPicker(id), 'See badge');
    }
    else {
      expeditionRun.index += 1;
      expeditionRun.item = expeditionLocation(expeditionRun.expedition, expeditionRun.index);
      showRound();
    }
  } else if (pvp.active) pvpNext();
  else if (endless.active) endlessNext();
  else if (daily.round >= 4) showPostcardSummary();
  else {
    daily.round += 1;
    saveDaily();
    showRound();
  }
}

async function shareResult(text = shareText(), button = gameEls.share, status = gameEls.status) {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
    status.textContent = 'Result copied to clipboard';
  } catch {
    status.textContent = 'Could not copy this result';
  }
}

window.addEventListener('pin', (event) => (borders.active ? revealBorders(event.detail) : pvp.active ? pvpSubmit(event.detail) : revealGuess(event.detail)));
gameEls.play.addEventListener('click', startGame);
gameEls.next.addEventListener('click', nextRound);
gameEls.share.addEventListener('click', () => shareResult());
// Finished-game close controls are wired via the .home-nav-btn delegation below.

// ---------------------------------------------------------------------------
// Next-daily countdown: one game per day, shown on the results and review
// screens in place of a replay
// ---------------------------------------------------------------------------
const nextGame = document.createElement('div');
nextGame.className = 'next-game';
nextGame.innerHTML = '<p class="eyebrow">Next game in</p><span class="next-game-time" role="timer">--:--:--</span><p class="next-game-sub">Five new places at midnight</p>';
gameEls.status.after(nextGame);
const nextGameTime = nextGame.querySelector('.next-game-time');
const nextGameSub = nextGame.querySelector('.next-game-sub');
let reviewCountdown = null; // set once the review bar exists

function msToMidnight(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
}

function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

// Back to the start screen with today's fresh daily loaded.
function openNewDaily() {
  borders.active = false;
  survival.active = false;
  endless.active = false;
  loadDaily();
  clearReveal();
  hideScreens();
  gameMode = 'start';
  gameEls.start.hidden = false;
  gameEls.startStreak.textContent = streakText();
  syncPassport();
  document.body.className = 'game-start';
  window.__canGuess = false;
}

let countdownDay = localDateKey();
function tickCountdown() {
  const today = localDateKey();
  const rolled = today !== countdownDay;
  countdownDay = today;
  if (!daily) return;
  // Midnight passed while idle on a finished or not-yet-started daily: refresh.
  // Mid-round and endless play are left alone; startGame() catches up later.
  if (rolled && !endless.active && ['start', 'results', 'review'].includes(gameMode)) {
    openNewDaily();
    return;
  }
  // Finished yesterday's game after midnight: today's is already waiting.
  const ready = daily.date !== today;
  const time = ready ? 'New game ready' : formatCountdown(msToMidnight());
  nextGame.classList.toggle('ready', ready);
  nextGame.firstElementChild.hidden = ready;
  nextGameTime.textContent = ready ? 'Play today’s game →' : time;
  nextGameSub.textContent = ready ? 'Five new places are waiting' : 'Five new places at midnight';
  if (reviewCountdown) {
    reviewCountdown.classList.toggle('ready', ready);
    reviewCountdown.textContent = ready ? 'Play today →' : `Next ${time}`;
  }
}
setInterval(tickCountdown, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickCountdown(); });
nextGame.addEventListener('click', () => { if (nextGame.classList.contains('ready')) openNewDaily(); });
// ---------------------------------------------------------------------------
// Endless mode: unscored random locations from the full pool
// ---------------------------------------------------------------------------
const endless = { active: false, item: null, bag: [], count: 0 };
// PvP challenge play (section below). item is the server-issued prompt until the
// guess is accepted, then the server answer.
const pvp = { active: false, matchId: null, challengeId: null, group: false, round: 0, item: null, result: null };

function currentItem() {
  if (borders.active) return null; // Borders asks for a country, not a location
  if (pvp.active) return pvp.item;
  return expeditionRun.active ? expeditionRun.item : survival.active ? survival.item : endless.active ? endless.item : selected[daily.round];
}

// Endless reuses the survival mode restyle (index.html).
// Endless button is now in HTML (mode-buttons div), just get the reference
const endlessEntry = document.getElementById('endless-button');

const endlessEls = { entry: endlessEntry };

// Pure random: every guess picks from all playable image-backed locations.
// Repeats are expected; dailies are the way to see new places.
function endlessPick() {
  const all = locations.filter((item) => isPlayableLocation(item) && !isLandmark(item));
  // Keep track of recent picks to avoid repeats (last 50)
  if (!endless.recent) endless.recent = [];
  let pick = all[Math.floor(Math.random() * all.length)];
  let guard = 0;
  while (endless.recent.includes(pick.id) && guard++ < 20) {
    pick = all[Math.floor(Math.random() * all.length)];
  }
  endless.recent.push(pick.id);
  if (endless.recent.length > 50) endless.recent.shift();
  endless.item = pick;
  return pick;
}

function endlessGo(item) {
  if (!item) return;
  expeditionRun.active = false;
  survival.active = false;
  borders.active = false;
  endless.active = true;
  endless.item = item;
  endless.count += 1;
  showRound();
}

function endlessNext() {
  endlessGo(endlessPick());
}

function goHome() {
  borders.active = false;
  survival.active = false;
  endless.active = false;
  expeditionRun.active = false;
  expeditionPicker.hidden = true;
  blackoutPicker.hidden = true;
  pvpLeave();
  window.__pendingEarn = null;
  document.querySelector('.earn-toast')?.remove();
  clearReveal();
  hideScreens();
  gameMode = 'start';
  gameEls.start.hidden = false;
  document.body.className = 'game-start';
  window.__canGuess = false;
  targetDist = 3;
  syncPassport();
  syncDailyButton();
}

function createHomeButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'home-nav-btn';
  button.setAttribute('aria-label', 'Go home');
  button.textContent = '×';
  // Click handled by document-level delegation above
  return button;
}

let confirmModal;
let confirmModalResolve;
let confirmModalReturnFocus;

function showConfirmModal({ title, message, confirmLabel, cancelLabel }) {
  if (!confirmModal) {
    confirmModal = document.createElement('section');
    confirmModal.className = 'confirm-modal';
    confirmModal.hidden = true;
    confirmModal.innerHTML = `
      <div class="confirm-modal__card glass" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message">
        <h2 class="confirm-modal__title" id="confirm-modal-title"></h2>
        <p class="confirm-modal__message" id="confirm-modal-message"></p>
        <div class="confirm-modal__actions">
          <button class="confirm-modal__cancel" type="button"></button>
          <button class="confirm-modal__confirm" type="button"></button>
        </div>
      </div>`;
    document.getElementById('game').appendChild(confirmModal);

    confirmModal.addEventListener('click', (event) => {
      if (event.target === confirmModal) closeConfirmModal(false);
    });
    confirmModal.querySelector('.confirm-modal__cancel').addEventListener('click', () => closeConfirmModal(false));
    confirmModal.querySelector('.confirm-modal__confirm').addEventListener('click', () => closeConfirmModal(true));
  }

  // A single shared dialog prevents competing confirmation layers.
  if (!confirmModal.hidden) return Promise.resolve(false);

  confirmModal.querySelector('.confirm-modal__title').textContent = title;
  confirmModal.querySelector('.confirm-modal__message').textContent = message;
  confirmModal.querySelector('.confirm-modal__confirm').textContent = confirmLabel;
  confirmModal.querySelector('.confirm-modal__cancel').textContent = cancelLabel;
  confirmModalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  confirmModal.hidden = false;
  confirmModal.querySelector('.confirm-modal__cancel').focus();

  return new Promise((resolve) => {
    confirmModalResolve = resolve;
  });
}

function closeConfirmModal(confirmed) {
  if (!confirmModal || confirmModal.hidden) return;
  confirmModal.hidden = true;
  const resolve = confirmModalResolve;
  confirmModalResolve = null;
  resolve?.(confirmed);
  confirmModalReturnFocus?.focus();
  confirmModalReturnFocus = null;
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && confirmModal && !confirmModal.hidden) {
    event.preventDefault();
    closeConfirmModal(false);
  }
});

async function confirmGoHome() {
  // Don't confirm if no game is in progress
  if (gameMode === 'start') {
    goHome();
    return;
  }
  // PvP: the server clock keeps running in a live round; a reveal is saved.
  if (pvp.active) {
    if (gameMode !== 'guess' || await showConfirmModal({
      title: 'Leave this round?',
      message: 'The 20 second timer keeps running. A round you do not lock in scores 0.',
      confirmLabel: 'Leave round',
      cancelLabel: 'Keep playing',
    })) goHome();
    return;
  }
  // Don't confirm if game is complete (on results page); nothing to lose
  if (daily.complete || (typeof endless !== 'undefined' && endless.complete)) {
    goHome();
    return;
  }
  // Daily is the default game while no alternate mode is active. Its state is
  // persisted after each round, so returning home does not discard progress.
  const isDailyGame = !endless.active && !survival.active && !expeditionRun.active && !borders.active;
  const message = isDailyGame
    ? 'Your progress is saved. You can continue later.'
    : 'Your current game progress will be lost.';
  if (await showConfirmModal({
    title: 'Return to home?',
    message,
    confirmLabel: 'Return home',
    cancelLabel: 'Keep playing',
  })) {
    goHome();
  }
}

// Event delegation: catches all .home-nav-btn clicks, even dynamically added ones.
// Also normalizes the button appearance.
document.addEventListener('click', (e) => {
  const target = e.target instanceof Element ? e.target : e.target?.parentElement;
  const btn = target?.closest?.('.home-nav-btn');
  if (!btn) return;
  e.preventDefault();
  // Results are terminal states: the player has no in-progress run to lose.
  if (btn.classList.contains('finished-home-nav')) {
    goHome();
    return;
  }
  confirmGoHome();
});
document.querySelectorAll('.home-nav-btn').forEach((button) => {
  button.setAttribute('aria-label', 'Go home');
  button.textContent = '×';
});

// Lives inside the clue card, so it never costs the globe a row.
gameEls.header.prepend(createHomeButton());

endlessEntry.addEventListener('click', () => {
  if (!locations.length) return;
  endless.count = 0;
  endlessNext();
});

// ---------------------------------------------------------------------------
// Survival mode: each round draws a random difficulty band; one miss over 150
// km ends the run
// ---------------------------------------------------------------------------
const SURVIVAL_BEST_KEY = 'where-on-earth-survival-best-v1';
const SURVIVAL_LIMIT_KM = 150;
const survival = {
  active: false,
  item: null,
  band: null,
  round: 0,
  survived: 0,
  lastDistance: null,
  missed: false,
  results: [],
};

function survivalBest() {
  try {
    return Math.max(0, Number.parseInt(localStorage.getItem(SURVIVAL_BEST_KEY), 10) || 0);
  } catch {
    return 0;
  }
}

function saveSurvivalBest(value) {
  const best = Math.max(survivalBest(), value);
  safeSetItem(SURVIVAL_BEST_KEY, String(best));
  return best;
}

function randomDifficultyBand() {
  return Math.floor(Math.random() * 10) + 1;
}

// Independent uniform draw from the requested band. There is intentionally no
// bag, collection weighting, or repeat prevention in Survival.
function survivalPick() {
  survival.band = randomDifficultyBand();
  const playable = locations.filter((item) => isPlayableLocation(item) && !isLandmark(item));
  const bandChoices = playable.filter((item) => Number(item.difficulty) === survival.band);
  const choices = bandChoices.length ? bandChoices : playable;
  if (!choices.length) return null;
  return choices[Math.floor(Math.random() * choices.length)];
}

function survivalGo() {
  survival.round += 1;
  survival.item = survivalPick();
  survival.lastDistance = null;
  survival.missed = false;
  if (!survival.item) {
    survival.round -= 1;
    showRunHaul(showSurvivalGameOver, 'See run');
    return;
  }
  showRound();
}

function startSurvival() {
  if (!locations.length) return;
  expeditionRun.active = false;
  endless.active = false;
  borders.active = false;
  survival.active = true;
  runResultsMode = 'survival';
  survival.item = null;
  survival.band = null;
  survival.round = 0;
  survival.survived = 0;
  survival.lastDistance = null;
  survival.missed = false;
  survival.results.length = 0;
  runHaul.length = 0;
  survivalGo();
}

function showSurvivalGameOver() {
  clearReveal();
  hideScreens();
  gameMode = 'survival-results';
  window.__canGuess = false;
  gameEls.survivalResults.hidden = false;
  document.body.className = 'game-results survival';
  const count = survival.survived;
  const best = saveSurvivalBest(count);
  setRunResultsCopy('Survival run over', 'One miss over 150 km ends the run.', 'Survived');
  gameEls.survivalResultTitle.textContent = `${count} ${count === 1 ? 'round' : 'rounds'} survived`;
  gameEls.survivalFinalStreak.textContent = count.toLocaleString();
  gameEls.survivalBestStreak.textContent = best.toLocaleString();
  gameEls.survivalShare.textContent = 'Share result';
  gameEls.survivalShareStatus.textContent = '';
}

gameEls.survivalEntry.addEventListener('click', startSurvival);
gameEls.survivalAgain.addEventListener('click', () => {
  if (runResultsMode === 'blackout') startBorders(borders.scope);
  else if (runResultsMode === 'borders') startBorders();
  else startSurvival();
});

function survivalShareText() {
  if (runResultsMode === 'blackout') return blackoutShareText();
  if (runResultsMode === 'borders') {
    const found = borders.found;
    return formatGameShare({
      title: 'Survival: Tap the Country',
      headline: `${found.toLocaleString()} ${found === 1 ? 'country' : 'countries'} found`,
      streak: bordersBest(),
      missed: borders.missed ? borders.key : null,
    });
  }
  const count = survival.survived;
  const survivedResults = survival.results.slice(0, count);
  return formatGameShare({
    title: 'Survival',
    headline: `${count.toLocaleString()} ${count === 1 ? 'round' : 'rounds'} survived`,
    streak: survivalBest(),
    guesses: closestGuessLines(survivedResults, survivedResults.map((entry) => entry.item)),
    visited: count,
  });
}

gameEls.survivalShare.addEventListener('click', () => shareResult(
  survivalShareText(),
  gameEls.survivalShare,
  gameEls.survivalShareStatus,
));

// Survival and Borders share the run-over screen.
let runResultsMode = 'survival';
function setRunResultsCopy(eyebrow, summary, label) {
  document.getElementById('survival-result-eyebrow').textContent = eyebrow;
  document.getElementById('survival-result-summary').textContent = summary;
  document.getElementById('survival-final-label').textContent = label;
}

// ---------------------------------------------------------------------------
// Borders mode: tap the named country (docs/country-outlines-plan-opus.md §3).
// Each round draws a random difficulty band. Per-band bags ensure no country
// repeats within a run; an exhausted draw falls back to another nonempty bag.
// One miss ends the run. It earns nothing in the Passport: there is no location
// to earn.
// ---------------------------------------------------------------------------
const BORDERS_BEST_KEY = 'where-on-earth-countries-best-v1';
const BORDERS_TAP_PX = 20; // tap tolerance, as REVIEW_LINE_HIT
const BORDERS_TAP_MAX_KM = 50; // so zooming out can't make 20 px cover 1,000 km
// scope/pool: Country Blackout's continent or world (see below); null in Tap the Country
const borders = { active: false, key: null, band: null, round: 0, found: 0, missed: false, bags: new Map(), scope: null, pool: null };
const bordersEntry = document.getElementById('borders-button');

function bordersBest() {
  try {
    return Math.max(0, Number.parseInt(localStorage.getItem(BORDERS_BEST_KEY), 10) || 0);
  } catch {
    return 0;
  }
}

function saveBordersBest(value) {
  const best = Math.max(bordersBest(), value);
  safeSetItem(BORDERS_BEST_KEY, String(best));
  return best;
}

// A key's flag: its most common clue flag (Denmark's places include Greenland's).
let countryFlags = null;
function countryFlag(key) {
  if (!countryFlags) {
    const counts = new Map();
    for (const item of locations) {
      const tally = counts.get(item.country) || new Map();
      const flag = flagForLocation(item);
      tally.set(flag, (tally.get(flag) || 0) + 1);
      counts.set(item.country, tally);
    }
    countryFlags = new Map([...counts].map(([k, tally]) => [k, COUNTRY_FLAGS[k] || [...tally].sort((a, b) => b[1] - a[1])[0][0]]));
  }
  return countryFlags.get(key) || '🌍';
}

function syncBordersEntry() {
  bordersEntry.disabled = !(countryData && countryBands && locations.length);
  blackoutEntry.disabled = bordersEntry.disabled;
}

// Draw without replacement within the band. If the random band is exhausted,
// use another nonempty band; only exhausting every bag ends the run.
function bordersPick() {
  const drawnBand = randomDifficultyBand();
  for (let band = 1; band <= 10; band += 1) {
    if (!borders.bags.has(band)) {
      borders.bags.set(band, Object.keys(countryBands).filter((k) => countryBands[k] === band && countryData.keys[k]
        && (!borders.pool || borders.pool.has(k))));
    }
  }
  const availableBands = [...borders.bags].filter(([, bag]) => bag.length).map(([band]) => band);
  if (!availableBands.length) return null;
  borders.band = borders.bags.get(drawnBand).length
    ? drawnBand
    : availableBands[Math.floor(Math.random() * availableBands.length)];
  const bag = borders.bags.get(borders.band);
  return bag.splice(Math.floor(Math.random() * bag.length), 1)[0];
}

function bordersGo() {
  borders.round += 1;
  borders.key = bordersPick();
  borders.missed = false;
  if (!borders.key) {
    borders.round -= 1;
    showBordersGameOver();
    return;
  }
  showRound();
}

function startBorders(scope = null) {
  if (!countryData || !countryBands || !locations.length) return;
  expeditionRun.active = false;
  endless.active = false;
  survival.active = false;
  borders.active = true;
  borders.round = 0;
  borders.found = 0;
  borders.missed = false;
  borders.band = null;
  borders.bags.clear();
  borders.scope = scope;
  borders.pool = scope && new Set(scope.keys);
  runResultsMode = scope ? 'blackout' : 'borders';
  if (scope) resetBlackout();
  bordersGo();
}

// Static reveal (no flyover, rounds stay fast). Only the target's outline is
// drawn, never the tapped country's: the pin, route and pill say where the tap
// landed.
function revealBorders(tap) {
  if (gameMode !== 'guess') return;
  const key = borders.key;
  const kmPerPx = radPerPx() * 6371.0088; // at the screen centre, where the player zoomed to tap
  const res = bordersHit(key, tap, Math.min(BORDERS_TAP_PX * kmPerPx, BORDERS_TAP_MAX_KM));
  borders.missed = !res.hit;
  if (res.hit) {
    borders.found += 1;
    if (borders.scope) {
      saveBlackoutBest(borders.scope, borders.found);
      blackoutFill(key);
    } else saveBordersBest(borders.found);
  }
  const complete = blackoutComplete();
  gameEls.number.textContent = borders.scope ? blackoutProgressText() : `Streak ${borders.found}`;
  gameMode = 'reveal';
  window.__canGuess = false;
  const headerFrom = gameEls.header.offsetHeight;
  document.body.className = `game-reveal survival borders${borders.missed ? ' survival-miss' : ''}`;
  gameEls.hint.textContent = '';
  const km = Math.round(res.km);
  const name = `${key} ${countryFlag(key)}`;
  gameEls.revealName.textContent = name;
  gameEls.peekName.textContent = name;
  gameEls.distance.textContent = borders.missed ? formatKm(km) : '';
  gameEls.mult.style.display = 'none';
  gameEls.fact.textContent = complete ? `Found ${key}. That's every country in ${borders.scope.place}.`
    : !borders.missed ? `Found ${key}.`
    : `You tapped ${res.tapped || 'the ocean'}, ${km.toLocaleString()} km from ${key}.`;
  setThumb(gameEls.thumb, null);
  setThumb(gameEls.peekThumb, null);
  peekSlot.hidden = true;
  gameEls.survivalStreak.textContent = borders.missed
    ? `Run ended · ${borders.found} survived`
    : `${borders.found} survived`;
  gameEls.score.textContent = borders.missed ? '✗ Run over' : `${borders.found}`;
  const pill = gameEls.revealPill;
  pill.classList.remove('safe', 'miss');
  pill.textContent = !borders.missed ? `✓ ${key}` : res.tapped ? `✗ That's ${res.tapped}` : '✗ Ocean';
  pill.classList.add(borders.missed ? 'miss' : 'safe');
  gameEls.next.textContent = borders.missed || complete ? 'See run' : 'Keep going';
  if (headerFrom > REVEAL_HEADER_H) collapseRoundHeader(headerFrom);

  const a = latLngToVec3(tap.lat, tap.lng);
  if (activePin >= 0) pins[activePin].drop(a);
  if (borders.missed) {
    // the route runs from the tap to the nearest point of the target's border
    const { b } = buildAnswerPath(tap, res.near);
    correctPin.drop(b);
    answerLine.visible = true;
    frameRevealPoints(a, b);
    showCountryOutline(key, res.near, true);
    startRevealBeat(a, b, true);
  } else {
    const box = res.ring && res.ring.box;
    const anchor = res.near || (box ? { lng: (box[0] + box[2]) / 2, lat: (box[1] + box[3]) / 2 } : tap);
    const b = latLngToVec3(anchor.lat, anchor.lng);
    frameRevealPoints(a, b);
    showCountryOutline(key, tap, true);
    startRevealBeat(a, b, false);
  }
}

function showBordersGameOver() {
  if (borders.scope) {
    showBlackoutGameOver();
    return;
  }
  clearReveal();
  hideScreens();
  gameMode = 'survival-results';
  window.__canGuess = false;
  gameEls.survivalResults.hidden = false;
  document.body.className = 'game-results survival borders';
  const count = borders.found;
  const best = saveBordersBest(count);
  setRunResultsCopy('Survival: Tap the Country run over', 'One miss ends the run.', 'Found');
  gameEls.survivalResultTitle.textContent = `${count} ${count === 1 ? 'country' : 'countries'} found`;
  gameEls.survivalFinalStreak.textContent = count.toLocaleString();
  gameEls.survivalBestStreak.textContent = best.toLocaleString();
  gameEls.survivalShare.textContent = 'Share result';
  gameEls.survivalShareStatus.textContent = '';
}

bordersEntry.addEventListener('click', () => startBorders());
Promise.all([countriesP, countryBandsP]).then(syncBordersEntry, () => {});

// ---------------------------------------------------------------------------
// Country Blackout: Tap the Country's run (borders above, with borders.scope
// set) over one scope, the whole world or one continent. Each found country
// drops its satellite imagery for the classic map, so the globe fills in as
// the run goes. The mask is an equirectangular canvas on the globe's UVs, laid
// out like the land texture: white where found. The globe shader scales the
// satellite mix by (1 - mask), so it holds through rotation, zoom and the
// detail insets, and it never draws a border.
// ---------------------------------------------------------------------------
const BLACKOUT_BEST_KEY = 'where-on-earth-blackout-best-v1';
const BLACKOUT_MIN_COUNTRIES = 10; // smaller scopes aren't a real run
const BLACKOUT_EMOJI = { Africa: '🌍', Europe: '🌍', Asia: '🌏', Oceania: '🌏', 'North America': '🌎', 'South America': '🌎' };
const blackoutEntry = document.getElementById('blackout-button');
let blackoutTex = null;

// Scopes on the game's own continent assignments (the Passport's countryIndex).
function blackoutScopes() {
  const keys = Object.keys(countryBands).filter((k) => countryData.keys[k]);
  const scopes = [{ id: 'world', label: 'Full World', place: 'the world', done: 'World', emoji: '🌐', keys }];
  for (const name of CONTINENT_ORDER) {
    const inScope = keys.filter((k) => countryIndex && countryIndex.get(k)?.continent === name);
    if (inScope.length < BLACKOUT_MIN_COUNTRIES) continue;
    scopes.push({ id: name.toLowerCase().replace(/ /g, '-'), label: name, place: name, done: name, emoji: BLACKOUT_EMOJI[name] || '🌐', keys: inScope });
  }
  return scopes;
}

function blackoutBest(scope) {
  try {
    return Math.max(0, Number.parseInt(localStorage.getItem(`${BLACKOUT_BEST_KEY}-${scope.id}`), 10) || 0);
  } catch {
    return 0;
  }
}

function saveBlackoutBest(scope, value) {
  const best = Math.max(blackoutBest(scope), value);
  safeSetItem(`${BLACKOUT_BEST_KEY}-${scope.id}`, String(best));
  return best;
}

const blackoutComplete = () => Boolean(borders.scope && !borders.missed && borders.found === borders.scope.keys.length);
const blackoutProgressText = () => `Streak ${borders.found} · ${borders.found}/${borders.scope.keys.length} found`;

function resetBlackout() {
  if (!blackoutTex) {
    const W = renderer.capabilities.maxTextureSize >= 4096 ? 4096 : 2048; // as the land texture
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = W / 2;
    blackoutTex = new THREE.CanvasTexture(cv);
    blackoutTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    blackoutTex.minFilter = THREE.LinearMipmapLinearFilter;
    blackoutTex.generateMipmaps = true;
    globeMat.uniforms.uBlackout.value = blackoutTex;
  }
  const cv = blackoutTex.image;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cv.width, cv.height);
  blackoutTex.needsUpdate = true;
}

// Paint a found country into the mask: every ring of its units, holes kept
// (evenodd), plus a thin stroke so microstates still show as a dot.
function blackoutFill(key) {
  const geom = countryGeom(key);
  if (!geom || !blackoutTex) return;
  const cv = blackoutTex.image;
  const ctx = cv.getContext('2d');
  const path = new Path2D();
  for (const ring of geom.rings) addToPath(path, unwrap(ring.pts), cv.width, cv.height, true);
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  ctx.fill(path, 'evenodd');
  ctx.lineJoin = 'round';
  ctx.lineWidth = ISLAND_BLOB_TEXELS * (cv.width / 4096);
  ctx.stroke(path);
  blackoutTex.needsUpdate = true;
}

// The filled map shows for the run and its result screen, never elsewhere.
function syncBlackoutMask() {
  const on = runResultsMode === 'blackout' && (borders.active || gameMode === 'survival-results');
  globeMat.uniforms.uBlackoutMix.value = on ? 1 : 0;
}

// Scope picker: the Expeditions picker's shared panel and choice styles.
const blackoutPicker = document.createElement('section');
blackoutPicker.className = 'expedition-picker';
blackoutPicker.hidden = true;
blackoutPicker.innerHTML = `<div class="expedition-panel" role="dialog" aria-modal="true" aria-labelledby="blackout-heading">
  <h2 id="blackout-heading">Country Blackout</h2>
  <p>Every country you find turns blue. One miss ends the run.</p>
  <div class="expedition-list"></div>
</div>`;
document.body.appendChild(blackoutPicker);
blackoutPicker.querySelector('.expedition-panel').prepend(createHomeButton());
const blackoutList = blackoutPicker.querySelector('.expedition-list');
let blackoutScopeList = [];

function showBlackoutPicker() {
  if (!countryData || !countryBands || !locations.length) return;
  clearReveal();
  hideScreens();
  gameMode = 'blackout-scope';
  window.__canGuess = false;
  blackoutScopeList = blackoutScopes();
  blackoutList.replaceChildren(...blackoutScopeList.map((scope) => {
    const total = scope.keys.length;
    const best = blackoutBest(scope);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'expedition-choice';
    button.dataset.blackoutScope = scope.id;
    button.innerHTML = `<span class="emoji"></span><span><strong></strong><small></small></span><span class="badge"></span>`;
    button.querySelector('.emoji').textContent = scope.emoji;
    button.querySelector('strong').textContent = scope.label;
    button.querySelector('small').textContent = best >= total ? `${total}/${total} found · Replay`
      : best ? `${total} countries · Best ${best}/${total}` : `${total} countries`;
    button.querySelector('.badge').textContent = best >= total ? '🏅' : '›';
    return button;
  }));
  blackoutPicker.hidden = false;
}

blackoutEntry.addEventListener('click', showBlackoutPicker);
blackoutPicker.addEventListener('click', (event) => {
  const choice = event.target.closest('[data-blackout-scope]');
  if (choice) {
    const scope = blackoutScopeList.find((s) => s.id === choice.dataset.blackoutScope);
    if (!scope) return;
    blackoutPicker.hidden = true;
    startBorders(scope);
  } else if (event.target === blackoutPicker) goHome();
});

// Survival hub: the one home entry for the three Survival modes. Its rows are
// the mode entries above (survival, borders, blackout buttons), so each keeps
// its own click handler; hideScreens closes the hub on the way out.
function blackoutBestSummary() {
  if (blackoutEntry.disabled) return '';
  let top = null;
  for (const scope of blackoutScopes()) {
    const best = Math.min(blackoutBest(scope), scope.keys.length);
    if (best && (!top || best / scope.keys.length > top.best / top.total)) top = { label: scope.label, best, total: scope.keys.length };
  }
  return top ? `Best ${top.label} ${top.best}/${top.total}` : '';
}

function showSurvivalHub() {
  clearReveal();
  hideScreens();
  gameMode = 'survival-hub';
  window.__canGuess = false;
  const streak = (best) => (best ? `Best streak ${best.toLocaleString()}` : '');
  const hub = gameEls.survivalHub;
  hub.querySelector('[data-hub-best="survival"]').textContent = streak(survivalBest());
  hub.querySelector('[data-hub-best="borders"]').textContent = streak(bordersBest());
  hub.querySelector('[data-hub-best="blackout"]').textContent = blackoutBestSummary();
  hub.hidden = false;
}

gameEls.survivalHubEntry.addEventListener('click', showSurvivalHub);
gameEls.survivalHub.addEventListener('click', (event) => { if (event.target === gameEls.survivalHub) goHome(); });

function showBlackoutGameOver() {
  clearReveal();
  hideScreens();
  gameMode = 'survival-results';
  window.__canGuess = false;
  gameEls.survivalResults.hidden = false;
  const { scope, found } = borders;
  const total = scope.keys.length;
  const complete = blackoutComplete();
  document.body.className = `game-results survival borders blackout${complete ? ' blackout-complete' : ''}`;
  const best = saveBlackoutBest(scope, found);
  if (complete) {
    setRunResultsCopy(`Country Blackout: ${scope.label}`, `Every country in ${scope.place}, found in one run without a miss.`, 'Found');
    gameEls.survivalResultTitle.textContent = `🏅 ${scope.done} complete`;
  } else {
    setRunResultsCopy(`Country Blackout: ${scope.label}`, 'One miss ends the run.', 'Found');
    gameEls.survivalResultTitle.textContent = `${found} of ${total} ${total === 1 ? 'country' : 'countries'} found`;
  }
  gameEls.survivalFinalStreak.textContent = `${found}/${total}`;
  gameEls.survivalBestStreak.textContent = `${best}/${total}`;
  gameEls.survivalShare.textContent = 'Share result';
  gameEls.survivalShareStatus.textContent = '';
}

// Only found countries count: the run-ending miss is named, never counted.
function blackoutShareText() {
  const { scope, found } = borders;
  const total = scope.keys.length;
  return formatGameShare({
    title: `Country Blackout: ${scope.label}`,
    titleSep: ' · ',
    headline: blackoutComplete() ? `${scope.done} complete: all ${total} countries found` : `${found} of ${total} countries found`,
    streak: blackoutBest(scope),
    streakLabel: 'Best',
    missed: borders.missed ? borders.key : null,
  });
}

// ---------------------------------------------------------------------------
// Post-game review: all five rounds on the globe, tap one to reopen its recap
// ---------------------------------------------------------------------------
const REVIEW_PIN_SCALE = 0.78; // ten pins at once: a little smaller than in play
const REVIEW_DIM = 0.22; // unselected rounds while a recap is open
const REVIEW_PIN_HIT = 34; // css px, generous for fingers
const REVIEW_LINE_HIT = 20;

const reviewStyle = document.createElement('style');
reviewStyle.textContent = `
.results-card { position: relative; }
.results-title { margin: 2px 48px 3px; color: rgba(198,226,250,.58); font-size: 11px; font-weight: 850; letter-spacing: .14em; text-align: center; text-transform: uppercase; }
.results-card .result-score { display: flex; align-items: baseline; justify-content: center; gap: 5px; margin: 0 0 4px; }
.results-card .result-score b { color: #ffc76a; font-size: clamp(42px, 14vw, 58px); font-weight: 850; line-height: 1; letter-spacing: -.055em; }
.results-card .result-score span { color: rgba(198,226,250,.58); font-size: 14px; font-weight: 700; }
.results-card .streak { margin-bottom: 10px; }
.results-card .round-breakdown { margin-top: 10px; }
.results-card .round-breakdown h2 { display: none; }
#results-breakdown li { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 10px 0; }
#results-breakdown li > b { font-size: 13px; }
#results-breakdown .place { min-width: 0; overflow: visible; color: rgba(225,240,255,.92); font-weight: 650; line-height: 1.25; overflow-wrap: anywhere; white-space: normal; }
#results-breakdown .result-metrics { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; min-width: 62px; white-space: nowrap; }
#results-breakdown .points { color: #ffc76a; font-size: 17px; font-weight: 850; line-height: 1.1; }
#results-breakdown .distance { color: rgba(193,224,250,.58); font-size: 11px; font-weight: 600; }
.results-globe { margin: 8px auto 0; }
.next-game { margin: 12px 0 0; padding: 10px 16px 8px; }
.next-game-time { font-size: 28px; }
.next-game-sub { font-size: 11px; }
.results-globe { display: block; margin: 0 auto; }
.review-screen { pointer-events: none; }
.review-bar { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px); left: 14px; right: 14px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 16px; border-radius: 18px; pointer-events: auto; }
.review-bar .review-title { flex: 1; min-width: 0; }
.review-bar .eyebrow { margin: 0 0 3px; }
.review-hint { margin: 0; overflow: hidden; color: rgba(193,224,250,.62); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.review-pill { min-height: 40px; padding: 0 14px; border: 1px solid rgba(157,211,255,.28); border-radius: 999px; background: rgba(236,247,255,.08); color: #ecf7ff; font-size: 13px; font-weight: 700; white-space: nowrap; cursor: pointer; touch-action: manipulation; }
.recap-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.recap-tag { margin: 0 0 4px; color: rgba(193,224,250,.67); font-size: 11px; font-weight: 750; letter-spacing: .1em; text-transform: uppercase; }
.recap-head h3 { margin: 0; color: #f3f9ff; font-size: 18px; line-height: 1.2; letter-spacing: -.02em; }
.recap-close { flex: none; width: 44px; height: 44px; margin: -10px -10px 0 0; padding: 0; border: 0; border-radius: 50%; background: none; color: rgba(198,226,250,.7); font-size: 26px; line-height: 1; cursor: pointer; touch-action: manipulation; }
.recap-card .recap-score { color: #ffc76a; font-size: 28px; }
.recap-thumb { display: block; width: 100%; height: 130px; margin: 12px 0 0; border-radius: 10px; object-fit: cover; object-position: center 20%; }
.recap-thumb[hidden] { display: none; }
.recap-fact { margin: 12px 0 14px; color: rgba(224,240,255,.8); font-size: 13px; line-height: 1.45; }
body.game-review #hud { opacity: 0; }
@media (max-height: 700px) {
  .recap-thumb { height: 92px; }
  .recap-fact { margin: 9px 0 11px; }
}`;
document.head.appendChild(reviewStyle);

const resultScore = gameEls.total.closest('.result-score');
const resultsTitle = document.createElement('p');
resultsTitle.className = 'results-title';
resultsTitle.textContent = daily ? "TODAY'S RESULT" : 'SCORE';
resultScore.firstChild.textContent = '';
resultScore.before(resultsTitle);

const resultsGlobe = document.createElement('button');
resultsGlobe.className = 'text-button results-globe';
resultsGlobe.textContent = 'See your rounds on the globe';
(gameEls.share.closest('.results-actions') || gameEls.share).before(resultsGlobe);

const reviewScreen = document.createElement('section');
reviewScreen.className = 'screen review-screen';
reviewScreen.hidden = true;
reviewScreen.innerHTML = `
  <header class="review-bar glass">
    <div class="review-title"><p class="eyebrow">Today's rounds</p><p class="review-hint"></p></div>
    <button class="review-pill" data-act="results">Results</button>
    <span class="review-countdown" data-act="next-daily" role="timer"></span>
  </header>
  <article class="reveal-card recap-card glass" hidden>
    <div class="recap-head"><div><p class="recap-tag"></p><h3></h3></div><button class="recap-close" aria-label="Close round recap">×</button></div>
    <div class="score-line"><div><span class="recap-distance"></span><small>away</small></div><div class="score-math"><span class="base"><b class="recap-base"></b>/1000</span><span class="mult recap-mult"></span><strong class="recap-score"></strong></div></div>
    <img class="recap-thumb" alt="" loading="lazy" hidden onerror="this.hidden=true">
    <p class="recap-fact"></p>
    <button class="primary" data-act="back">Back to globe</button>
  </article>`;
document.getElementById('game').append(reviewScreen);
const reviewEls = {
  screen: reviewScreen,
  bar: reviewScreen.querySelector('.review-bar'),
  hint: reviewScreen.querySelector('.review-hint'),
  countdown: reviewScreen.querySelector('.review-countdown'),
  card: reviewScreen.querySelector('.recap-card'),
  tag: reviewScreen.querySelector('.recap-tag'),
  name: reviewScreen.querySelector('.recap-head h3'),
  distance: reviewScreen.querySelector('.recap-distance'),
  base: reviewScreen.querySelector('.recap-base'),
  mult: reviewScreen.querySelector('.recap-mult'),
  score: reviewScreen.querySelector('.recap-score'),
  thumb: reviewScreen.querySelector('.recap-thumb'),
  fact: reviewScreen.querySelector('.recap-fact'),
};
reviewCountdown = reviewEls.countdown;

// One guess pin, answer pin and route per round, built once and re-dropped
// each time the review opens.
const reviewRounds = Array.from({ length: 5 }, (_, i) => {
  const guess = new Pin({ badge: makeBadgeTexture('guess', i + 1) });
  const answer = new Pin({ color: ANSWER_COLOR, badge: makeBadgeTexture('answer', i + 1), answer: true });
  guess.capMat.uniforms.uPulse.value = answer.capMat.uniforms.uPulse.value = 0; // ten pulsing pins is noise
  const material = new LineMaterial({
    color: '#b9f7ff',
    linewidth: 2,
    transparent: true,
    opacity: 0.75,
    depthWrite: false, // depth-tested (unlike the reveal line) so far-side routes hide behind the globe
  });
  material.resolution.set(viewW, viewH);
  const line = new LineSegments2(new LineGeometry(), material);
  line.visible = false;
  line.renderOrder = 6;
  globe.add(guess.root, answer.root, line);
  return { guess, answer, line, points: [], dim: 1 };
});
window.addEventListener('resize', () => reviewRounds.forEach((r) => r.line.material.resolution.set(viewW, viewH)));
let reviewOpen = -1;

function showReviewVisuals() {
  reviewRounds.forEach((r, i) => {
    const result = daily.results[i];
    const a = latLngToVec3(result.guess.lat, result.guess.lng);
    const b = latLngToVec3(selected[i].lat, selected[i].lng);
    const angle = a.angleTo(b);
    const axis = routeAxis(a, b);
    const count = Math.max(16, Math.ceil(angle / DEG));
    r.points = [];
    for (let k = 0; k <= count; k++) {
      // a hair above the surface at the ends so the depth test can't eat them
      const lift = Math.max(routeRadius(angle, k / count), 1.002);
      r.points.push(a.clone().applyAxisAngle(axis, (k / count) * angle).multiplyScalar(lift));
    }
    r.line.geometry.dispose();
    r.line.geometry = new LineGeometry().setPositions(r.points.flatMap((p) => p.toArray()));
    r.line.computeLineDistances();
    r.line.visible = true;
    r.a = a;
    r.b = b;
    r.guess.drop(a);
    r.answer.drop(b);
    // staggered landing, round 1 first (negative t stays invisible until 0)
    r.guess.t = -i * 0.12;
    r.answer.t = -i * 0.12 - 0.06;
    setReviewDim(r, 1);
  });
}

function hideReviewVisuals() {
  reviewOpen = -1;
  for (const r of reviewRounds) {
    r.guess.release();
    r.answer.release();
    r.line.visible = false;
  }
}

function setReviewDim(r, dim) {
  r.dim = r.guess.dim = r.answer.dim = dim;
}

function enterReview(focus = -1) {
  if (daily.results.length !== 5) return;
  clearReveal();
  hideScreens();
  gameMode = 'review';
  window.__canGuess = false;
  document.body.classList.add('game-review');
  reviewEls.screen.hidden = false;
  reviewEls.card.hidden = true;
  const total = daily.results.reduce((sum, result) => sum + result.score, 0);
  reviewEls.hint.textContent = `${total} pts · tap pins`;
  tickCountdown();
  showReviewVisuals();
  vYaw = vPitch = autoSpin = 0;
  if (focus >= 0) {
    openRecap(focus);
    return;
  }
  // centre on the spread of all ten points, at the whole-disc distance
  const centre = new THREE.Vector3();
  for (const r of reviewRounds) centre.add(r.a).add(r.b);
  if (centre.lengthSq() > 1e-4) {
    const view = travelView(centre);
    revealView = { yaw: nearAngle(view.yaw, yaw), pitch: clamp(view.pitch, -60 * DEG, 60 * DEG) };
  }
  targetDist = clamp(fitDist * 1.05, MIN_DIST, maxDist);
}

function openRecap(i) {
  const result = daily.results[i];
  const item = selected[i];
  const r = reviewRounds[i];
  reviewOpen = i;
  reviewEls.tag.textContent = `Round ${i + 1} of 5`;
  reviewEls.name.textContent = item.clue;
  reviewEls.distance.textContent = formatKm(result.distance);
  reviewEls.base.textContent = result.base ?? Math.round((result.score * 10) / WEIGHTS[i]);
  reviewEls.mult.textContent = `×${WEIGHTS[i] / 10}`;
  reviewEls.mult.style.display = WEIGHTS[i] > 1 ? '' : 'none';
  reviewEls.score.textContent = `+${result.score.toLocaleString()}`;
  reviewEls.fact.textContent = item.fact;
  setThumb(reviewEls.thumb, item.image);
  reviewEls.card.hidden = false;
  reviewRounds.forEach((other, j) => setReviewDim(other, j === i ? 1 : REVIEW_DIM));
  // the card is laid out now, so the strip between bar and card is known
  frameRevealPoints(r.a, r.b, safeStrip(reviewEls.bar, reviewEls.card));
}

function closeRecap() {
  reviewOpen = -1;
  reviewEls.card.hidden = true;
  reviewRounds.forEach((r) => setReviewDim(r, 1));
}

// Facing factor of a globe-local surface point: > 0 in front of the limb.
const _rv = new THREE.Vector3();
function reviewFacing(local) {
  _rv.copy(local).applyQuaternion(globe.quaternion);
  return (_rv.z * dist - 1) / Math.hypot(_rv.x, _rv.y, dist - _rv.z);
}

function updateReview(dt, scale) {
  for (const r of reviewRounds) {
    for (const pin of [r.guess, r.answer]) {
      if (pin.state === 'idle') continue;
      pin.update(dt, elapsed, scale * REVIEW_PIN_SCALE);
      if (pin.state === 'idle') continue;
      pin.badge.scale.multiplyScalar(1 / REVIEW_PIN_SCALE); // smaller pins, but numbers stay readable
      // badge sprites ignore depth, so fade them out as their pin rounds the limb
      _rv.set(0, 1, 0).applyQuaternion(pin.root.quaternion);
      pin.badge.material.opacity *= clamp((reviewFacing(_rv) + 0.02) / 0.12, 0, 1);
    }
    if (r.line.visible) r.line.material.opacity = damp(r.line.material.opacity, 0.75 * r.dim, 10, dt);
  }
}

const _rp = new THREE.Vector3();
function screenOf(world) {
  _rp.copy(world).project(camera);
  return [((_rp.x + 1) / 2) * viewW, ((1 - _rp.y) / 2) * viewH];
}

function segmentDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-6), 0, 1);
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// Nearest round under a tap: pin heads, badges and bases first, then the
// route. A miss closes any open recap.
function pickReviewRound(x, y) {
  let best = -1;
  let bestD = Infinity;
  const w = new THREE.Vector3();
  reviewRounds.forEach((r, i) => {
    for (const pin of [r.guess, r.answer]) {
      if (!pin.root.visible || reviewFacing(pin === r.guess ? r.a : r.b) <= 0) continue;
      for (const part of [pin.core, pin.badge, pin.root]) {
        const [sx, sy] = screenOf(part.getWorldPosition(w));
        const d = Math.hypot(sx - x, sy - y);
        if (d < REVIEW_PIN_HIT && d < bestD) { best = i; bestD = d; }
      }
    }
    if (!r.line.visible) return;
    let prev = null;
    for (const p of r.points) {
      const s = reviewFacing(p) > 0 ? screenOf(w.copy(p).applyQuaternion(globe.quaternion)) : null;
      if (s && prev) {
        const d = segmentDist(x, y, prev, s) + 8; // pins win ties
        if (d < REVIEW_LINE_HIT + 8 && d < bestD) { best = i; bestD = d; }
      }
      prev = s;
    }
  });
  if (best >= 0) {
    if (navigator.vibrate) navigator.vibrate(8);
    openRecap(best);
  } else if (reviewOpen >= 0) closeRecap();
}

resultsGlobe.addEventListener('click', () => enterReview());
if (gameEls.postcardSummaryContinue) {
  gameEls.postcardSummaryContinue.addEventListener('click', () => postcardSummaryNext());
}
gameEls.results.addEventListener('click', (e) => {
  if (e.target === gameEls.results) enterReview(); // tap outside the card
});
reviewEls.screen.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  if (e.target.closest('.recap-close') || (act && act.dataset.act === 'back')) closeRecap();
  else if (act && act.dataset.act === 'results') showResults();
  else if (act && act.dataset.act === 'next-daily' && act.classList.contains('ready')) openNewDaily();
});

// ---------------------------------------------------------------------------
// Stats (streaks, averages, the score histogram) lives in src/meta/stats.js.
// It reaches main.js only through statsHost.
// ---------------------------------------------------------------------------
const statsHost = {
  STREAK_KEY,
  HISTORY_KEY,
  WEIGHTS,
  gameEls,
  get daily() { return daily; },
  set statsScreenEl(value) { statsScreenEl = value; },
  readJSON,
  writeJSON,
  syncPassport,
};
initStats(statsHost);

const settingsEntry = document.createElement('button');
settingsEntry.className = 'settings-entry';
settingsEntry.innerHTML = '⚙️';
settingsEntry.setAttribute('aria-label', 'Settings');
settingsEntry.setAttribute('aria-haspopup', 'dialog');
gameEls.startStreak.after(settingsEntry);

const settingsScreen = document.createElement('section');
settingsScreen.className = 'screen settings-screen';
settingsScreen.hidden = true;
settingsScreen.innerHTML = `
  <div class="settings-card glass" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <button class="settings-close" aria-label="Close settings">×</button>
    <h2 id="settings-title">Settings</h2>
    <div class="settings-main">
      <fieldset class="settings-group">
        <legend>Reveal view</legend>
        <div class="settings-segmented">
          <button type="button" data-reveal-view="flyover" aria-pressed="true">Flyover</button>
          <button type="button" data-reveal-view="north-up" aria-pressed="false">North-up</button>
        </div>
      </fieldset>
      <button class="settings-reset" type="button">Reset all data</button>
    </div>
    <div class="settings-confirm" hidden>
      <p>Are you sure? This will erase all progress, postcards, collections, and stats.</p>
      <div class="settings-actions">
        <button class="settings-danger" type="button">Erase everything</button>
        <button class="settings-cancel" type="button">Cancel</button>
      </div>
    </div>
  </div>`;
document.getElementById('game').appendChild(settingsScreen);
settingsScreenEl = settingsScreen;

const settingsEls = {
  screen: settingsScreen,
  card: settingsScreen.querySelector('.settings-card'),
  close: settingsScreen.querySelector('.settings-close'),
  main: settingsScreen.querySelector('.settings-main'),
  confirm: settingsScreen.querySelector('.settings-confirm'),
  reset: settingsScreen.querySelector('.settings-reset'),
  danger: settingsScreen.querySelector('.settings-danger'),
  cancel: settingsScreen.querySelector('.settings-cancel'),
  revealViews: [...settingsScreen.querySelectorAll('[data-reveal-view]')],
};

function syncRevealViewSetting() {
  settingsEls.revealViews.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.revealView === revealViewPreference));
  });
}

settingsEls.revealViews.forEach((button) => button.addEventListener('click', () => {
  revealViewPreference = button.dataset.revealView;
  safeSetItem(REVEAL_VIEW_KEY, revealViewPreference);
  syncRevealViewSetting();
}));
syncRevealViewSetting();

function openSettings() {
  settingsEls.main.hidden = false;
  settingsEls.confirm.hidden = true;
  gameEls.start.hidden = true;
  settingsScreen.hidden = false;
  document.body.className = 'game-settings';
  window.__canGuess = false;
  settingsScreen.scrollTop = 0;
  settingsEls.close.focus();
}

function closeSettings() {
  settingsEls.main.hidden = false;
  settingsEls.confirm.hidden = true;
  settingsScreen.hidden = true;
  gameEls.start.hidden = false;
  document.body.className = 'game-start';
  settingsEntry.focus();
}

settingsEntry.addEventListener('click', openSettings);
settingsEls.close.addEventListener('click', closeSettings);
settingsScreen.addEventListener('click', (e) => {
  if (e.target === settingsScreen) closeSettings();
});
settingsEls.reset.addEventListener('click', () => {
  settingsEls.main.hidden = true;
  settingsEls.confirm.hidden = false;
});
settingsEls.cancel.addEventListener('click', () => {
  settingsEls.confirm.hidden = true;
  settingsEls.main.hidden = false;
});
settingsEls.danger.addEventListener('click', () => {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('where-on-earth-')) localStorage.removeItem(key);
  });
  location.reload();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || settingsScreen.hidden) return;
  if (!settingsEls.confirm.hidden) {
    settingsEls.confirm.hidden = true;
    settingsEls.main.hidden = false;
    return;
  }
  closeSettings();
});

// ---------------------------------------------------------------------------
// Passport: every place found, stamped on the start-screen globe
// ---------------------------------------------------------------------------
// One entry per location, upserted on every reveal, so replaying a place moves
// it back to the recent list and recolours its dot without growing the store.
// Dots are capped at the most recent PASSPORT_DOT_LIMIT visits and the geometry
// is only rebuilt when the set changes, so the start screen pays for this once
// and never per frame.
const PASSPORT_DOT_LIMIT = 200; // rendered dots, newest first
const PASSPORT_ORDER_LIMIT = 240; // ids kept in recency order (dots draw from these)
const PASSPORT_GOLD = 700; // /1000 and up reads gold, 400+ cyan, the rest dim
const PASSPORT_CYAN = 400;
const DOT_RADIUS = 1.008; // just proud of the sphere so the far side stays hidden
const CONTINENT_ORDER = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica'];
// Coarse latitude/longitude boxes, most specific first: the game ships no country
// geometry, and a rough continent is all a completion percentage needs. The two
// Asia rows merge, so the Middle East (inside Africa's box otherwise) counts once.
const CONTINENT_BOXES = [
  ['Antarctica', -90, -55, -180, 180],
  ['Oceania', -50, -1, 120, 180],
  ['Europe', 35, 82, -25, 62],
  ['Asia', 12, 42, 34, 63],
  ['Africa', -37, 36, -20, 52],
  ['South America', -56, 13, -83, -33],
  ['North America', 7, 84, -170, -40],
  ['Asia', -55, 78, -180, 180],
];

function continentOf(item) {
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
const EARN_NEAR = 1; // < NEAR_KM: full-colour postcard
const EARN_BULLSEYE = 2; // < BULLSEYE_KM: gold Bullseye badge
const EARN_PINPOINT = 3; // < PINPOINT_KM: gold Pinpoint badge
const EARN_NAMES = ['seen', 'near', 'bullseye', 'pinpoint'];
const PROX_CLASSES = ['', 'prox-postcard', 'prox-bullseye', 'prox-pinpoint'];

function earnForKm(km) {
  // Passport and flyover tiers must share the exact, unrounded boundary check.
  return {
    pinpoint: EARN_PINPOINT,
    bullseye: EARN_BULLSEYE,
    near: EARN_NEAR,
  }[flyoverTier(km)] || 0;
}

// Accuracy tiers add their earned frame; location difficulty has no card visual.
function applyCardTier(el, item, earned) {
  el.classList.remove(...PROX_CLASSES.filter(Boolean));
  if (!item) return;
  if (earned) el.classList.add(PROX_CLASSES[earned]);
}

// The one accuracy badge every surface uses (styles: .prox-badge in styles/game.css).
// host must be positioned; size is '' (icon + label), 'compact' (icon) or 'large'.
const PROX_BADGES = { [EARN_BULLSEYE]: ['🎯', 'Bullseye'], [EARN_PINPOINT]: ['📍', 'Pinpoint'] };
function setProxBadge(host, earned, size = '') {
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
let passport = { visits: {}, order: [], meta: {} };
let passportDirty = true; // dots need rebuilding before the next start screen
let locationIndex = null; // built lazily; locations arrive after this section runs

function passportLocation(id) {
  if (!locationIndex) locationIndex = new Map(locations.map((item) => [item.id, item]));
  return locationIndex.get(id);
}

// The one "have we been here" predicate (passport, dex grid and collections all
// share it). Older visits recorded before passport.meta shipped still count.
function isVisited(id) { return Object.hasOwn(passport.visits, id); }

function tierOf(base) {
  if (base >= PASSPORT_GOLD) return 'gold';
  if (base >= PASSPORT_CYAN) return 'cyan';
  return 'dim';
}

function readPassport() {
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
function recordVisit(id, base, km, canEarn = true) {
  if (!id || !Number.isFinite(base)) return 0;
  const score = clamp(Math.round(base), 0, 1000);
  // Keep a visit logged before meta existed undated: its real first visit is unknown.
  const legacy = id in passport.visits && !passport.meta[id];
  const prev = passport.meta[id] || {};
  const prevEarned = prev.e || 0;
  const entry = { b: Math.max(score, prev.b ?? (legacy ? passport.visits[id] : 0)), t: Date.now() };
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
  passport.meta[id] = entry;
  passport.visits[id] = score;
  const at = passport.order.indexOf(id);
  if (at !== -1) passport.order.splice(at, 1);
  passport.order.push(id);
  if (passport.order.length > PASSPORT_ORDER_LIMIT) passport.order = passport.order.slice(-PASSPORT_ORDER_LIMIT);
  writeJSON(PASSPORT_KEY, { v: 2, visits: passport.visits, order: passport.order, meta: passport.meta });
  passportDirty = true;
  // Return newly earned tier (0 if not newly earned)
  return earned > prevEarned ? earned : 0;
}


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
const DOT_TIERS = {
  gold: new THREE.Color('#ffd166'),
  cyan: new THREE.Color('#67e8ff'),
  dim: new THREE.Color('#5d84a6'),
};
const passportDots = new THREE.Points(
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

const _dotVec = new THREE.Vector3();
function buildPassportDots() {
  const spots = passport.order
    .map((id) => ({ item: passportLocation(id), base: passport.visits[id] }))
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

// The start-screen passport summary, the Passport page, Collections and the
// postcard detail live in src/meta/passport.js. They reach main.js only
// through passportHost; the store above stays here because rounds write it.
const passportHost = {
  AUDIT_MODE,
  CONTINENT_ORDER,
  EARN_NEAR,
  EARN_BULLSEYE,
  EARN_PINPOINT,
  EARN_NAMES,
  gameEls,
  get locations() { return locations; },
  get passport() { return passport; },
  get passportDirty() { return passportDirty; },
  set passportScreenEl(value) { passportScreenEl = value; },
  set collectionsScreenEl(value) { collectionsScreenEl = value; },
  applyCardTier,
  buildPassportDots,
  continentOf,
  countryKey,
  flagForLocation,
  isVisited,
  localDateKey,
  passportLocation,
  safeSetItem,
  storageError,
  tierOf,
};
initPassportHome(passportHost);

// ---------------------------------------------------------------------------
// Expeditions: player-selected, ordered seven-stop challenges. Progress is
// independent for every theme and only advances while that expedition is active.
// ---------------------------------------------------------------------------
let expeditions = [];
let expeditionState = { progress: {} };
const expeditionRun = { active: false, expedition: null, item: null, index: 0 };

const expeditionStyle = document.createElement('style');
expeditionStyle.textContent = `
.expedition-picker { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 18px; background: rgba(2,4,9,.78); backdrop-filter: blur(12px); }
.expedition-picker[hidden] { display: none; }
.expedition-panel { position: relative; width: min(100%, 390px); max-height: calc(100vh - 36px); overflow: auto; box-sizing: border-box; padding: 18px; border: 1px solid rgba(103,232,255,.25); border-radius: 24px; background: rgba(8,16,34,.96); color: #f3f9ff; }
.expedition-panel .home-nav-btn { position: absolute; top: 5px; right: 5px; }
.expedition-panel h2 { margin: 0; font-size: 27px; }
.expedition-panel > p { margin: 6px 0 18px; color: rgba(193,224,250,.68); }
.expedition-list { display: grid; gap: 10px; }
.expedition-choice { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; width: 100%; padding: 13px 14px; border: 1px solid rgba(157,211,255,.18); border-radius: 16px; background: rgba(157,211,255,.07); color: inherit; text-align: left; cursor: pointer; }
.expedition-choice .emoji { font-size: 27px; }
.expedition-choice strong, .expedition-choice small { display: block; }
.expedition-choice small { margin-top: 3px; color: rgba(193,224,250,.62); }
.expedition-choice .badge { color: #ffd166; font-size: 20px; }
body.expedition-mode .round-header, body.expedition-mode #reveal-card { border-color: rgba(255,209,102,.45); background: rgba(31,23,8,.88); }
body.expedition-mode #reveal-card .score-math { display: none; }
body.expedition-mode .round-meta span:first-child { color: #ffd166; }`;
document.head.appendChild(expeditionStyle);

const expeditionPicker = document.createElement('section');
expeditionPicker.className = 'expedition-picker';
expeditionPicker.hidden = true;
expeditionPicker.innerHTML = `<div class="expedition-panel" role="dialog" aria-modal="true" aria-labelledby="expedition-heading">
  <h2 id="expedition-heading">Choose an expedition</h2>
  <p>Hand-picked stops, played in order.</p>
  <div class="expedition-list"></div>
</div>`;
document.body.appendChild(expeditionPicker);
expeditionPicker.querySelector('.expedition-panel').prepend(createHomeButton());
const expeditionList = expeditionPicker.querySelector('.expedition-list');

function loadExpeditionState() {
  const saved = readJSON(EXPEDITION_KEY);
  expeditionState = saved && saved.progress && typeof saved.progress === 'object' ? saved : { progress: {} };
}

function expeditionProgress(expedition) {
  const saved = expeditionState.progress[expedition.id] || {};
  const total = expeditionLocations(expedition).length;
  const completed = clamp(Number(saved.completed) || 0, 0, total);
  return { completed, complete: completed >= total };
}

function expeditionLocations(expedition) {
  return expedition.locationIds
    .map((id) => locations.find((item) => item.id === id))
    .filter(isPlayableLocation);
}

function expeditionLocation(expedition, index) {
  return expeditionLocations(expedition)[index];
}

function updateExpeditionEntry() {
  gameEls.expeditionsEntry.disabled = !expeditions.some((expedition) => expeditionLocations(expedition).length);
}

function completeExpeditionRound() {
  const expedition = expeditionRun.expedition;
  const progress = expeditionProgress(expedition);
  progress.completed = Math.max(progress.completed, expeditionRun.index + 1);
  progress.complete = progress.completed >= expeditionLocations(expedition).length;
  expeditionState.progress[expedition.id] = progress;
  writeJSON(EXPEDITION_KEY, expeditionState);
}

function renderExpeditionPicker(highlightId = '') {
  expeditionList.replaceChildren(...expeditions.filter((expedition) => expeditionLocations(expedition).length).map((expedition) => {
    const progress = expeditionProgress(expedition);
    const total = expeditionLocations(expedition).length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'expedition-choice';
    button.dataset.expeditionId = expedition.id;
    if (expedition.id === highlightId) button.dataset.justCompleted = 'true';
    button.innerHTML = `<span class="emoji"></span><span><strong></strong><small></small></span><span class="badge"></span>`;
    button.querySelector('.emoji').textContent = expedition.emoji || '🧭';
    button.querySelector('strong').textContent = expedition.theme;
    button.querySelector('small').textContent = progress.complete ? `${total}/${total} completed · Replay` : `${progress.completed}/${total} completed`;
    button.querySelector('.badge').textContent = progress.complete ? '🏅' : '›';
    return button;
  }));
}

function showExpeditionPicker(highlightId = '') {
  expeditionRun.active = false;
  clearReveal();
  hideScreens();
  gameMode = 'expeditions';
  window.__canGuess = false;
  renderExpeditionPicker(highlightId);
  expeditionPicker.hidden = false;
}

function startExpedition(id) {
  const expedition = expeditions.find((item) => item.id === id);
  if (!expedition) return;
  const progress = expeditionProgress(expedition);
  const index = progress.complete ? 0 : progress.completed;
  const item = expeditionLocation(expedition, index);
  if (!item) return;
  expeditionPicker.hidden = true;
  survival.active = false;
  endless.active = false;
  borders.active = false;
  expeditionRun.active = true;
  expeditionRun.expedition = expedition;
  expeditionRun.index = index;
  expeditionRun.item = item;
  runHaul.length = 0;
  showRound();
}

gameEls.expeditionsEntry.addEventListener('click', () => showExpeditionPicker());
expeditionPicker.addEventListener('click', (event) => {
  const choice = event.target.closest('[data-expedition-id]');
  if (choice) startExpedition(choice.dataset.expeditionId);
  else if (event.target === expeditionPicker) goHome();
});

// ---------------------------------------------------------------------------
// PvP challenges live in src/pvp/ (api, home, h2h, group, play). They reach
// main.js only through pvpHost; the round screen, game state and the reveal
// (including the PvP timeout reveal below) stay here.
// ---------------------------------------------------------------------------
const pvpHost = {
  get gameMode() { return gameMode; },
  set gameMode(value) { gameMode = value; },
  set pendingGuess(value) { pendingGuess = value; },
  get locations() { return locations; },
  pvp,
  gameEls,
  pvpScreenEls,
  readJSON,
  writeJSON,
  createHomeButton,
  goHome,
  clearReveal,
  hideScreens,
  showRound,
  revealGuess,
  pvpRevealTimeout,
  clearPendingGuess,
  setGuessHint,
  showLockButton,
  shareResult,
  formatGameShare,
};
initPvpApi(pvpHost);
initPvpHome(pvpHost);
initPvpH2h(pvpHost);
initPvpGroup(pvpHost);
initPvpPlay(pvpHost);

// The server resolved the round as a timeout: the answer, no guess, zero.
function pvpRevealTimeout(answer) {
  gameMode = 'reveal';
  window.__canGuess = false;
  clearPendingGuess();
  const headerFrom = gameEls.header.offsetHeight;
  document.body.className = 'game-reveal pvp';
  gameEls.hint.textContent = '';
  const placeName = answer.clue || answer.short;
  gameEls.revealName.textContent = placeName;
  gameEls.peekName.textContent = placeName;
  gameEls.fact.textContent = answer.fact || '';
  setThumb(gameEls.thumb, answer.image);
  setThumb(gameEls.peekThumb, answer.image);
  peekSlot.hidden = !answer.image;
  setRevealThumbState(answer, isVisited(answer.id), passport.meta[answer.id]?.e || 0);
  gameEls.mult.style.display = 'none';
  gameEls.score.textContent = '0';
  gameEls.distance.textContent = 'Out of time';
  gameEls.revealPill.classList.remove('safe', 'miss');
  gameEls.revealPill.classList.add('miss');
  gameEls.revealPill.textContent = 'Out of time · 0';
  gameEls.next.textContent = pvp.result || pvp.round >= 5 ? 'Results' : 'Next';
  pvpRenderVs();
  if (headerFrom > REVEAL_HEADER_H) collapseRoundHeader(headerFrom);
  if (activePin >= 0) pins[activePin].release();
  activePin = -1;
  const b = latLngToVec3(answer.lat, answer.lng);
  correctPin.drop(b);
  frameRevealPoints(b, b);
  showCountryOutline(countryKey(answer), answer, false);
  startRevealBeat(b, b, false);
}

// ---------------------------------------------------------------------------
// Passport page, Collections, postcard detail and shares: src/meta/passport.js
// ---------------------------------------------------------------------------
// England/Scotland/Wales/Northern Ireland/United Kingdom stay five separate
// rows (Sean, 2026-10-11) — this is just the one place that name is read from.
function countryKey(item) { return item.country; }

initPassport(passportHost);

passport = readPassport();

Promise.all([locationsP, pinsP]).then(([data, pinsData]) => {
  locations = data;
  dailyPins = pinsData?.pins || {};
  auditFlagsLocationsLoaded();
  locationIndex = null;
  buildCountryIndex();
  loadDaily();
  syncPassport();
  syncDailyButton();
  gameEls.startStreak.textContent = streakText();
  gameEls.play.disabled = false;
  endlessEls.entry.disabled = false;
  gameEls.survivalEntry.disabled = false;
  syncBordersEntry();
  updateExpeditionEntry();
  passportEntry.disabled = false;
  collectionsEntry.disabled = false;
  document.getElementById('pvp-button').disabled = false;
  if (pvpLinkInvite) (pvpLinkIsGroup ? openPvpGroupJoin : openPvpJoin)({ inviteToken: pvpLinkInvite });
  window.__renderAuditFlags?.();
  if (window.__boot) window.__boot('locations loaded');
  loadJobDone('critical', 'locations');
}).catch((err) => {
  gameEls.play.disabled = true;
  gameEls.survivalEntry.disabled = true;
  if (window.__showErr) window.__showErr('LOCATIONS: ' + err.message);
  loadJobDone('critical', 'locations');
});
getJSON('assets/expeditions.json').then((data) => {
  expeditions = Array.isArray(data) ? data : [];
  loadExpeditionState();
  updateExpeditionEntry();
}).catch((err) => {
  gameEls.expeditionsEntry.disabled = true;
  if (window.__showErr) window.__showErr('EXPEDITIONS: ' + err.message);
});
gameEls.play.disabled = true;
endlessEls.entry.disabled = true;
gameEls.survivalEntry.disabled = true;
bordersEntry.disabled = true;
gameEls.expeditionsEntry.disabled = true;
passportEntry.disabled = true;
collectionsEntry.disabled = true;
document.body.classList.add('game-start');
window.__canGuess = false;
window.__game = {
  start: startGame,
  next: nextRound,
  survival: startSurvival,
  survivalAgain: startSurvival,
  borders: startBorders,
  bordersHit,
  guess(lat, lng) {
    if (gameMode !== 'guess') throw new Error('A guess is not currently expected');
    activePin = (activePin + 1) % pins.length;
    pins[activePin].drop(latLngToVec3(lat, lng));
    if (borders.active) revealBorders({ lat, lng });
    else if (pvp.active) pvpSubmit({ lat, lng });
    else revealGuess({ lat, lng });
  },
  get state() {
    const item = gameMode === 'guess' || gameMode === 'reveal' ? currentItem() : null;
    return { mode: gameMode, daily: JSON.parse(JSON.stringify(daily)), selected: selected.map((x) => ({ ...x })), item: item && item.id, survival: { ...survival, item: survival.item && survival.item.id }, borders: { ...borders, bags: undefined } };
  },
  distanceKm,
  scoreGuess,
  postcardShareText,
};

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0;
let autoSpin = AUTO_SPIN;

function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  elapsed += dt;

  if (pointers.size === 0) {
    if (revealView) {
      yaw = damp(yaw, revealView.yaw, revealView.lambda || 4.8, dt);
      pitch = damp(pitch, revealView.pitch, revealView.lambda || 4.8, dt);
    }
    yaw += vYaw * dt;
    pitch += vPitch * dt;
    if (Math.abs(pitch) > PITCH_LIMIT) {
      pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
      vPitch = 0;
    }
    const decay = Math.exp(-FRICTION * dt);
    vYaw *= decay;
    vPitch *= decay;

    // gentle idle drift until a pin is placed; cut on touch, eases back in
    // after a 7 s pause (any fling has long decayed by then)
    const idle = lastInteraction < 0 || performance.now() - lastInteraction > 7000;
    autoSpin = damp(autoSpin, idle && activePin < 0 && gameMode !== 'review' ? AUTO_SPIN : 0, 0.8, dt);
    yaw += autoSpin * dt;
  }

  // Ease altitude in log space: map scale goes with altitude, so equal
  // ratios take equal time whether zooming in or out, deep or wide.
  // While pinching, fingers drive zoom directly with no damper tail.
  if (pinch) dist = targetDist;
  else dist = 1 + Math.exp(damp(Math.log(dist - 1), Math.log(targetDist - 1), 9, dt));
  applyCameraNear();
  // Outlines float 0.002 above the globe so they never sink into its facets.
  // Near the ground that lift shows as parallax against the fill and pins, so
  // it shrinks with altitude (floor clears the 160x100 sphere's ~0.0003 sag).
  const outlineLift = clamp((dist - 1) * 0.006, 0.0004, 0.002);
  for (const m of outlineMeshes) m.scale.setScalar((1 + outlineLift) / m.userData.radius);
  camera.position.set(0, 0, dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  if (pointers.size > 0) applyDrag();

  setGlobeQuaternion(globe, yaw, pitch);
  // parallax: same yaw/pitch model scaled down (a slerp toward the globe
  // quaternion takes the short way round and flips the sky at yaw = 180 deg)
  setGlobeQuaternion(stars, yaw * 0.12, pitch * 0.12);
  stars.material.uniforms.uTime.value = elapsed;

  if (landLoaded && landReveal < 1) {
    landReveal = Math.min(1, landReveal + dt / 1.1);
    globeMat.uniforms.uLand.value = 1 - Math.pow(1 - landReveal, 3);
  }
  // each outline layer fades in on its own clock as it finishes loading
  for (const m of outlineMaterials) {
    if (m.userData.reveal >= 1) continue;
    m.userData.reveal = Math.min(1, m.userData.reveal + dt / 1.1);
    m.opacity = (1 - Math.pow(1 - m.userData.reveal, 3)) * (m.userData.baseOpacity ?? 1);
    if (m.userData.reveal === 1 && (m.userData.baseOpacity ?? 1) >= 1) {
      m.transparent = false; m.needsUpdate = true;
    }
  }
  updateSatellite(dt);
  syncBlackoutMask();
  updateCountryOutline(dt);

  // Keep roughly the same screen footprint, then add a restrained boost in
  // unusually wide reveal framings so the badge/checkmark do not disappear.
  const screenScale = (dist - 1) / Math.max(fitDist - 1, 0.1);
  const farT = smoothstep(clamp((dist - fitDist) / Math.max(14 - fitDist, 0.1), 0, 1));
  // Below SCENE_MIN_DIST the floor shrinks with altitude: pins hold the screen
  // size they had there instead of ballooning over the coast at deep zoom.
  const pinFloor = 0.22 * Math.min(1, (dist - 1) / (SCENE_MIN_DIST - 1));
  const pinScale = clamp(screenScale * (1 + 0.28 * farT), pinFloor, 6);
  // Runs before the pins so they can be sized for this frame's flight camera.
  updateTravelAnimation(dt, pinScale);
  const pinDt = dt * timeScale; // bullseye slow motion
  pins.forEach((p) => p.update(pinDt, elapsed, travelPinScale(p, pinScale)));
  correctPin.update(pinDt, elapsed, travelPinScale(correctPin, pinScale));
  updateReview(dt, pinScale);
  updateLineLabel();
  passportDots.visible = false; // disabled: no dots on landing page

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

window.__booted = true;
if (window.__boot) window.__boot('ready');
// the boot screen stays up until the land fill is on the globe (revealGlobe)
renderLoad();
window.__audio = audio; // test hook: context state, live whoosh
// test hook: read the view, or pin it for screenshots
window.__view = {
  globe,
  get yaw() { return yaw; },
  get pitch() { return pitch; },
  set(y, p) { yaw = y; pitch = p; vYaw = vPitch = autoSpin = 0; lastInteraction = performance.now() + 1e9; },
  get dist() { return dist; },
  zoom(d) { dist = targetDist = d; },
  pick(x, y) { // globe-local point under a screen point
    const h = sphereHit(x, y, new THREE.Vector3());
    return h && h.applyQuaternion(globe.quaternion.clone().invert()).toArray();
  },
  project(l) { // screen position of a globe-local point
    const v = new THREE.Vector3().fromArray(l).applyQuaternion(globe.quaternion).project(camera);
    return [((v.x + 1) / 2) * viewW, ((1 - v.y) / 2) * viewH];
  },
};
requestAnimationFrame(() => {
  canvas.classList.add('ready');
  hud.classList.add('ready');
  frame();
});
