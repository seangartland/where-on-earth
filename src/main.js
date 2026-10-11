import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { feature as topoFeature } from 'topojson-client';
import { dailyIds, isLandmark, isPlayableLocation, monthKey } from './daily.js';

if (window.__boot) window.__boot('3D engine loaded');

// URL shortcut: ?reset=daily drops today's saved game (keeps passport, streak
// and history) so the daily is rebuilt from the current locations.json. Runs
// before anything reads storage; the fetch below skips the HTTP cache so a
// stale locations.json can't rebuild the old set.
const RESET_DAILY = new URLSearchParams(location.search).get('reset') === 'daily';
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
const PITCH_LIMIT = 85 * DEG; // look down at the poles, never flip north-down
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

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
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
      col = mix(col, sat, uSatMix);

      // atmospheric rim haze (eased back over imagery)
      float fres = pow(1.0 - ndv, 2.6);
      col += vec3(0.18, 0.48, 1.00) * fres * mix(0.80, 0.32, uSatMix);

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
    credit: 'Imagery <a href="https://www.where-on.earth/credits" target="_blank" rel="noopener">© EOX</a> (Sentinel-2 2025) · Base NASA Blue Marble',
    maxZ: 8,
  },
];
const SAT_BASE_URL = './assets/blue-marble-2k.jpg';
const SAT_FADE_S = 0.4;
const mapStyle = new URLSearchParams(location.search).get('map') === 'classic' ? 'classic' : 'satellite';
let satTarget = 0; // uSatMix eases toward this
let satT = 0;
let satApplied = 0; // last satT pushed to the uniforms and overlays
let satCreditEl = null;
let satProvider = null; // tile provider used only by the detail insets
let satDisabled = false; // for the session, after a second context loss

async function loadSatBase() {
  // TEMP: Blue Marble disabled for visual test - solid dark blue base
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a1a2f';
  ctx.fillRect(0, 0, 1, 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
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
  survivalStreak: document.getElementById('survival-streak'),
  survivalResults: document.getElementById('survival-results-screen'),
  survivalResultTitle: document.getElementById('survival-result-title'),
  survivalFinalStreak: document.getElementById('survival-final-streak'),
  survivalBestStreak: document.getElementById('survival-best-streak'),
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
// iOS also files Web Audio as "ambient" by default, which the ring/silent
// switch mutes outright, so the game was silent on most iPhones. Declaring the
// page's audio session as playback (Safari 16.4+) makes it audible like a
// video would be; when muted it drops back to ambient so it never interrupts
// the player's own music.
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

const audio = {
  ctx: null,
  master: null,
  noise: null,
  whoosh: null,
  muted: Boolean(readJSON(MUTE_KEY)?.muted),

  syncSession() {
    const session = navigator.audioSession;
    const type = this.muted ? 'ambient' : 'playback';
    if (session && session.type !== type) {
      try { session.type = type; } catch (err) { /* older WebKit: read-only */ }
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

const flyoverStyle = document.createElement('style');
flyoverStyle.textContent = `
.mute-toggle { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; margin: -15px -6px; padding: 0; border: 0; border-radius: 50%; background: none; color: rgba(193,224,250,.72); cursor: pointer; pointer-events: auto; touch-action: manipulation; }
.mute-toggle svg { width: 18px; height: 18px; }
.mute-toggle .waves { transition: opacity .15s; }
.mute-toggle.muted .waves { opacity: 0; }
.mute-toggle .slash { opacity: 0; transition: opacity .15s; }
.mute-toggle.muted .slash { opacity: 1; }
.start-screen .mute-toggle { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 12px); right: 12px; width: 44px; height: 44px; margin: 0; }
#travel-distance.suspense span { color: #ffe6a8; animation: suspense-tick .55s ease-in-out infinite; }
@keyframes suspense-tick { 50% { transform: scale(1.06); } }
#travel-distance.deadpan { border-color: rgba(255,255,255,.22); box-shadow: none; }
#travel-distance.deadpan span { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-weight: 600; letter-spacing: -.02em; }
#travel-distance.deadpan small { text-transform: none; letter-spacing: .02em; font-size: 12px; font-weight: 600; }
.bullseye-stamp { position: fixed; z-index: 13; left: 50%; top: 66%; margin: 0; padding: 10px 18px 8px; border: 3px solid #ffd45e; border-radius: 14px; color: #ffd45e; font-size: 22px; font-weight: 900; letter-spacing: .12em; text-align: center; text-shadow: 0 0 18px rgba(255,212,94,.55); box-shadow: 0 0 28px rgba(255,212,94,.25), inset 0 0 18px rgba(255,212,94,.15); background: rgba(20,14,2,.55); pointer-events: none; transform: translate(-50%, -50%) rotate(-9deg); }
.bullseye-stamp b { display: block; font-size: 44px; line-height: 1; letter-spacing: 0; }
.bullseye-stamp[hidden], .postcard[hidden] { display: none; }
.postcard { position: fixed; z-index: 13; left: 0; top: 0; margin: 0; width: 212px; box-sizing: border-box; padding: 8px 8px 0; border-radius: 3px; background: #fbf8f1; box-shadow: 0 14px 34px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.3); pointer-events: none; will-change: transform, opacity; }
.postcard img { display: block; width: 100%; height: 124px; object-fit: cover; object-position: center 20%; background: #d9d4c8; }
.thumb-slot.waiting::before { content: ""; position: absolute; inset: 2px 0; box-sizing: border-box; border: 1.5px dashed rgba(193,224,250,.42); border-radius: 10px; background: rgba(193,224,250,.05); }
.thumb-slot.waiting img { opacity: 0; }
.peek-slot.waiting::before { inset: 0; }
.postcard p { margin: 0; height: 34px; overflow: hidden; color: #1d2633; font: 600 15px/34px "Marker Felt", "Bradley Hand", "Segoe Print", cursive; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
body.bullseye #reveal-card { border-color: rgba(255,212,94,.5); }`;
document.head.appendChild(flyoverStyle);

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

function loadDaily() {
  const date = localDateKey();
  const saved = readJSON(GAME_KEY);
  daily = saved && saved.date === date && Array.isArray(saved.ids)
    ? saved
    : { date, ids: dailyIds(date, locations), round: 0, results: [], complete: false };
  daily.round = clamp(Number(daily.round) || 0, 0, 4);
  daily.results = Array.isArray(daily.results) ? daily.results.slice(0, 5) : [];
  selected = daily.ids.map((id) => locations.find((item) => item.id === id)).filter((item) => isPlayableLocation(item) && !isLandmark(item));
  if (selected.length !== 5) {
    daily = { date, ids: dailyIds(date, locations), round: 0, results: [], complete: false };
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

function hideScreens() {
  gameEls.start.hidden = gameEls.round.hidden = gameEls.postcardSummaryScreen.hidden = gameEls.results.hidden = true;
  gameEls.survivalResults.hidden = true;
  reviewEls.screen.hidden = true;
  if (statsScreenEl) statsScreenEl.hidden = true;
  if (settingsScreenEl) settingsScreenEl.hidden = true;
  if (passportScreenEl) passportScreenEl.hidden = true;
  if (collectionsScreenEl) collectionsScreenEl.hidden = true;
  document.body.className = '';
}

function clearReveal() {
  travelAnimation = null;
  travelHead.visible = false;
  setCameraNear(0.05);
  gameEls.travelDistance.getAnimations().forEach((a) => a.cancel());
  gameEls.travelDistance.hidden = true;
  hideRevealSheet();
  resetFlyoverExtras();
  correctPin.release();
  answerLine.visible = false;
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
  if (expeditionRun.active) {
    document.body.classList.add('expedition-mode');
    const total = expeditionLocations(expeditionRun.expedition).length;
    gameEls.number.textContent = `${expeditionRun.expedition.emoji || '🧭'} ${expeditionRun.expedition.theme} · ${expeditionRun.index + 1}/${total}`;
    gameEls.weight.style.display = 'none';
    gameEls.dailyDate.hidden = true;
  } else if (survival.active) {
    document.body.classList.add('survival');
    gameEls.number.textContent = `Round ${survival.round}  Difficulty ${survivalBand()}/10`;
    gameEls.weight.style.display = 'none';
    gameEls.survivalStreak.textContent = survival.round === 1
      ? 'One miss over 150 km ends the run'
      : `🔥 ${survival.survived} survived`;
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
  gameEls.clue.textContent = item.clue;
  setGuessHint('Tap the globe to place your pin');
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
  return { a, b };
}

function beginTravelReveal(guess, answer, km, newlyEarned, tier = flyoverTier(km)) {
  const path = buildAnswerPath(guess, answer);
  const flight = travelFlightProfile(km);
  answerLine.visible = false;
  answerLine.geometry.instanceCount = 0;
  correctPin.root.visible = false;
  correctPin.state = 'idle';
  gameEls.distance.textContent = `${km.toLocaleString()} km`;
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
  const path = buildAnswerPath(guess, answer);
  answerLine.visible = false;
  correctPin.root.visible = false;
  correctPin.state = 'idle';
  correctPin.setColor(GOLD_COLOR, '#fff6d8');
  gameEls.distance.textContent = `${km.toLocaleString()} km`;
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
const REVEAL_HEADER_H = 52; // the collapsed one-line header, see style.css
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
    gameEls.travelDistance.querySelector('span').textContent = `${Math.round(anim.km * travelT).toLocaleString()} km`;
    if (anim.tier === 'near') gameEls.travelDistance.classList.toggle('suspense', travelU > 0.45);
    return;
  }

  if (!anim.answerDropped) {
    trimTravelLine(anim, 1);
    setCameraFov(FOV);
    audio.whooshStop();
    const pill = gameEls.travelDistance;
    pill.querySelector('span').textContent = `${anim.km.toLocaleString()} km`;
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
  const tierLabel = tier === EARN_PINPOINT ? '📍 Pinpoint!' : tier === EARN_BULLSEYE ? '🎯 Bullseye!' : '🎉 New postcard earned!';
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
  const km = Math.round(kmExact);
  const base = Math.round(distanceScore(kmExact));
  const oneOff = survival.active || endless.active || expeditionRun.active; // unscored, outside the daily
  const score = oneOff ? 0 : scoreGuess(kmExact, daily.round);
  if (!restoring && survival.active) {
    survival.lastDistance = km;
    survival.missed = kmExact > SURVIVAL_LIMIT_KM;
    if (!survival.missed) {
      survival.survived += 1;
      saveSurvivalBest(survival.survived);
    }
  }
  gameMode = 'reveal';
  window.__canGuess = false;
  const headerFrom = gameEls.header.offsetHeight;
  document.body.className = expeditionRun.active ? 'game-reveal expedition-mode'
    : survival.active
    ? `game-reveal survival${survival.missed ? ' survival-miss' : ''}`
    : endless.active ? 'game-reveal endless' : 'game-reveal';
  gameEls.hint.textContent = '';
  gameEls.distance.textContent = window.__travelAnim && !restoring ? '0 km' : `${km.toLocaleString()} km`;
  // Capture the passport state before this guess changes it. The reveal starts
  // with the thumbnail the player already had, then a new unlock can land in it.
  const wasVisited = Object.hasOwn(passport.visits, answer.id);
  const previousEarn = passport.meta[answer.id]?.e || 0;
  // Endless earns visits only; postcards come from daily and survival.
  const newlyEarned = !restoring ? recordVisit(answer.id, base, kmExact, !endless.active) : 0; // exact, so earning matches the flyover tier
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
      : `🔥 ${survival.survived} survived`;
    gameEls.score.textContent = survival.missed ? '✗ Run over' : `🔥 ${survival.survived}`;
    pill.textContent = survival.missed ? '✗ Over 150 km' : '✓ Survived';
    pill.classList.add(survival.missed ? 'miss' : 'safe');
    gameEls.next.textContent = survival.missed ? 'See run' : 'Keep going';
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
    const { a, b } = placeRevealVisual(guess, answer);
    gameEls.distance.textContent = `${km.toLocaleString()} km`;
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
  setProxBadge(thumb.parentElement, earned, thumb === gameEls.peekThumb ? 'compact' : '');
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
  Scotland: '🏴', England: '🏴', 'Northern Ireland': '🇬🇧', Wales: '🏴',
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
  const rarity = rarityFor(item.difficulty);
  const card = document.createElement('article');
  card.className = `postcard-summary-card rarity-${rarity} ${outcome.kind}`;
  const photo = document.createElement('img');
  photo.className = 'postcard-summary-photo';
  photo.src = item.image || '';
  photo.alt = '';
  photo.loading = 'lazy';
  photo.addEventListener('error', () => { photo.classList.add('unavailable'); });
  const copy = document.createElement('div');
  copy.className = 'postcard-summary-copy';
  const topline = document.createElement('div');
  topline.className = 'postcard-summary-topline';
  const badge = document.createElement('span');
  badge.className = 'postcard-summary-badge';
  badge.textContent = outcome.kind === 'new' ? '✦ New' : '↑ Upgraded';
  const distance = document.createElement('span');
  distance.className = 'postcard-summary-distance';
  distance.textContent = postcardDistance(result, outcome);
  const place = document.createElement('div');
  place.className = 'postcard-summary-place';
  place.textContent = item.short || item.clue;
  const country = document.createElement('div');
  country.className = 'postcard-summary-country';
  country.textContent = `${flagForLocation(item)} ${item.country || ''}`;
  if (outcome.kind === 'upgrade') {
    const tier = document.createElement('span');
    tier.className = 'postcard-summary-tier';
    tier.textContent = ` · ${outcome.tier === EARN_PINPOINT ? 'Pinpoint' : 'Bullseye'}`;
    country.append(tier);
  }
  topline.append(badge, distance);
  copy.append(topline, place, country);
  card.append(photo, copy);
  setProxBadge(card, outcome.tier);
  return card;
}

function shareText() {
  const dateStr = new Date(`${daily.date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const total = daily.results.reduce((sum, result) => sum + result.score, 0);
  const lines = daily.results.map((result, index) => {
    const base = result.base ?? Math.round((result.score * 10) / WEIGHTS[index]);
    return `${base} ${scoreEmoji(base)}`;
  });
  return `Where on Earth?\n${dateStr}\n\nFinal Score: ${total}\n\n${lines.join('\n')}\n\nCan you beat me?\nhttps://where-on.earth`;
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
    distance.textContent = `${result.distance.toLocaleString()} km`;
    metrics.append(points, distance);
    round.append(number, place, metrics);
    return round;
  }));
  tickCountdown();
}

function syncDailyButton() {
  const played = daily && daily.complete && daily.date === localDateKey();
  gameEls.play.querySelector('.mode-desc').textContent = played ? '✓ Played · see results' : '5 places, once a day';
  gameEls.play.classList.toggle('played', Boolean(played));
}

function startGame() {
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
  if (survival.active) {
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
  } else if (endless.active) endlessNext();
  else if (daily.round >= 4) showPostcardSummary();
  else {
    daily.round += 1;
    saveDaily();
    showRound();
  }
}

async function shareResult() {
  const text = shareText();
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
    gameEls.share.textContent = 'Copied';
    gameEls.status.textContent = 'Result copied to clipboard';
  } catch {
    gameEls.status.textContent = 'Could not copy this result';
  }
}

window.addEventListener('pin', (event) => revealGuess(event.detail));
gameEls.play.addEventListener('click', startGame);
gameEls.next.addEventListener('click', nextRound);
gameEls.share.addEventListener('click', shareResult);
// Finished-game close controls are wired via the .home-nav-btn delegation below.

// ---------------------------------------------------------------------------
// Next-daily countdown: one game per day, shown on the results and review
// screens in place of a replay
// ---------------------------------------------------------------------------
const countdownStyle = document.createElement('style');
countdownStyle.textContent = `
.next-game { margin: 16px 0 0; padding: 14px 16px 12px; border: 1px solid rgba(119,202,255,.22); border-radius: 16px; background: linear-gradient(180deg, rgba(119,202,255,.1), rgba(119,202,255,.03)); text-align: center; }
.next-game .eyebrow { margin: 0 0 4px; }
.next-game-time { display: block; color: #f3f9ff; font-size: 34px; font-weight: 800; line-height: 1.1; letter-spacing: .02em; font-variant-numeric: tabular-nums; text-shadow: 0 0 24px rgba(119,202,255,.35); }
.next-game-sub { margin: 4px 0 0; color: rgba(193,224,250,.6); font-size: 12px; }
.next-game.ready { cursor: pointer; border-color: rgba(255,199,106,.5); background: rgba(255,199,106,.1); }
.next-game.ready .next-game-time { color: #ffc76a; font-size: 24px; }
.review-countdown { min-height: 40px; display: inline-flex; align-items: center; padding: 0 12px; border: 1px solid rgba(119,202,255,.22); border-radius: 999px; color: #cfe9ff; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.review-countdown.ready { color: #ffc76a; border-color: rgba(255,199,106,.5); cursor: pointer; }`;
document.head.appendChild(countdownStyle);

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

function currentItem() {
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
  endless.active = true;
  endless.item = item;
  endless.count += 1;
  showRound();
}

function endlessNext() {
  endlessGo(endlessPick());
}

function goHome() {
  survival.active = false;
  endless.active = false;
  expeditionRun.active = false;
  expeditionPicker.hidden = true;
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
  // Don't confirm if game is complete (on results page); nothing to lose
  if (daily.complete || (typeof endless !== 'undefined' && endless.complete)) {
    goHome();
    return;
  }
  // Daily is the default game while no alternate mode is active. Its state is
  // persisted after each round, so returning home does not discard progress.
  const isDailyGame = !endless.active && !survival.active && !expeditionRun.active;
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
// Survival mode: difficulty climbs 1-10 and repeats; one miss over 150 km ends
// the run
// ---------------------------------------------------------------------------
const SURVIVAL_BEST_KEY = 'where-on-earth-survival-best-v1';
const SURVIVAL_LIMIT_KM = 150;
const survival = {
  active: false,
  item: null,
  round: 0,
  survived: 0,
  lastDistance: null,
  missed: false,
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

function survivalBand() {
  return ((survival.round - 1) % 10) + 1;
}

// Independent uniform draw from the requested band. There is intentionally no
// bag, collection weighting, or repeat prevention in Survival.
function survivalPick() {
  const band = survivalBand();
  const choices = locations.filter((item) => isPlayableLocation(item) && !isLandmark(item) && Number(item.difficulty) === band);
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
  survival.active = true;
  survival.item = null;
  survival.round = 0;
  survival.survived = 0;
  survival.lastDistance = null;
  survival.missed = false;
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
  gameEls.survivalResultTitle.textContent = `${count} ${count === 1 ? 'round' : 'rounds'} survived`;
  gameEls.survivalFinalStreak.textContent = count.toLocaleString();
  gameEls.survivalBestStreak.textContent = best.toLocaleString();
}

gameEls.survivalEntry.addEventListener('click', startSurvival);
gameEls.survivalAgain.addEventListener('click', startSurvival);

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
  reviewEls.distance.textContent = `${result.distance.toLocaleString()} km`;
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
// Stats: streaks, averages and the score histogram
//
// GAME_KEY only ever holds the current day (loadDaily discards it once the date
// rolls) and STREAK_KEY only the live run, so history lives in its own
// append-only key written once per finished daily. Both existing keys keep
// their exact format, so the daily game, endless mode and review are unaffected.
// History starts collecting from the first game played after this shipped.
// ---------------------------------------------------------------------------
const HISTORY_LIMIT = 365;
const BAND_EDGES = [2000, 4000, 6000, 8000]; // /10000 total, five rounds at weights 1,1,2,3,3
const BAND_LOW_RGB = [103, 232, 255]; // cyan
const BAND_HIGH_RGB = [255, 199, 106]; // amber

function readHistory() {
  const raw = readJSON(HISTORY_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date))
    .map((entry) => ({
      date: entry.date,
      total: Number(entry.total) || 0,
      rounds: (Array.isArray(entry.rounds) ? entry.rounds : [])
        .filter((round) => round && Number.isFinite(Number(round.distance)))
        .map((round) => ({
          base: Math.round(Number(round.base) || 0),
          score: Number(round.score) || 0,
          distance: Math.round(Number(round.distance) || 0),
        })),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(-HISTORY_LIMIT);
}

function recordHistory() {
  if (!daily || daily.results.length !== 5) return;
  const entry = {
    date: daily.date,
    total: daily.results.reduce((sum, result) => sum + result.score, 0),
    rounds: daily.results.map((result, i) => ({
      base: result.base ?? Math.round((result.score * 10) / WEIGHTS[i]),
      score: result.score,
      distance: result.distance,
    })),
  };
  const history = readHistory().filter((saved) => saved.date !== entry.date);
  history.push(entry);
  history.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  writeJSON(HISTORY_KEY, history.slice(-HISTORY_LIMIT));
}

// Whole days between two YYYY-MM-DD keys; the noon anchor dodges DST edges.
function dayGap(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86400000);
}

function longestRun(dates) {
  let best = 0;
  let run = 0;
  let prev = null;
  for (const date of dates) {
    run = prev !== null && dayGap(prev, date) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

function currentStreak() {
  const streak = readJSON(STREAK_KEY);
  return streak && Number(streak.count) ? streak.count : 0;
}

function bandIndex(total) {
  const i = BAND_EDGES.findIndex((edge) => total < edge);
  return i === -1 ? BAND_EDGES.length : i;
}

function bandLabel(index) {
  const start = index === 0 ? 0 : BAND_EDGES[index - 1];
  const end = index === BAND_EDGES.length ? 1000 : BAND_EDGES[index] - 1;
  return `${start}–${end}`;
}

function bandColor(index, alpha) {
  const t = index / (BAND_EDGES.length);
  const rgb = BAND_LOW_RGB.map((v, k) => Math.round(v + (BAND_HIGH_RGB[k] - v) * t));
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function shortDate(date) {
  const value = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T12:00:00`)
    : new Date(date);
  return Number.isNaN(value.getTime()) ? '' : value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statsSummary() {
  const history = readHistory();
  const counts = new Array(BAND_EDGES.length + 1).fill(0);
  let totalPoints = 0;
  let best = null;
  let distanceSum = 0;
  let rounds = 0;
  for (const game of history) {
    totalPoints += game.total;
    counts[bandIndex(game.total)] += 1;
    game.rounds.forEach((round, i) => {
      rounds += 1;
      distanceSum += round.distance;
      if (!best || round.base > best.base) best = { ...round, date: game.date, round: i + 1 };
    });
  }
  const streak = currentStreak();
  return {
    history,
    games: history.length,
    streak,
    longest: Math.max(longestRun(history.map((game) => game.date)), streak),
    average: history.length ? Math.round(totalPoints / history.length) : 0,
    bestTotal: history.reduce((max, game) => Math.max(max, game.total), 0),
    averageDistance: rounds ? Math.round(distanceSum / rounds) : 0,
    counts,
    peak: Math.max(...counts, 1),
    bestRound: best,
    first: history.length ? history[0].date : null,
  };
}

const statsStyle = document.createElement('style');
statsStyle.textContent = `
.stats-entry { min-height: 44px; margin-top: 10px; padding: 0 20px; border: 1px solid rgba(255,199,106,.4); border-radius: 999px; background: rgba(255,199,106,.1); color: #ffe0ae; font-size: 13px; font-weight: 750; cursor: pointer; touch-action: manipulation; }
.stats-entry:active { transform: scale(.98); }
.stats-screen { box-sizing: border-box; overflow: auto; padding: calc(env(safe-area-inset-top, 0px) + 18px) 14px calc(env(safe-area-inset-bottom, 0px) + 18px); background: rgba(2,4,9,.68); pointer-events: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.stats-card { position: relative; box-sizing: border-box; width: 100%; max-width: 440px; min-height: 100%; margin: auto; padding: 26px 18px 20px; border-radius: 24px; }
.stats-card h2 { margin: 0; color: #f5fbff; font-size: 21px; text-align: center; letter-spacing: -.02em; }
.stats-hero { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 18px; }
.stat { padding: 13px 10px 12px; border: 1px solid rgba(157,211,255,.16); border-radius: 16px; background: rgba(157,211,255,.06); text-align: center; }
.stat b { display: block; font-size: 30px; line-height: 1.05; font-weight: 800; font-variant-numeric: tabular-nums; color: #ffc76a; text-shadow: 0 0 22px rgba(255,199,106,.28); }
.stat span { display: block; margin-top: 5px; color: rgba(193,224,250,.62); font-size: 10px; font-weight: 750; letter-spacing: .1em; text-transform: uppercase; }
.stat.cool b { color: #67e8ff; text-shadow: 0 0 22px rgba(103,232,255,.28); }
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.stats-grid .stat { text-align: left; }
.stats-grid .stat b { font-size: 25px; }
.stat small { display: block; margin-top: 3px; color: rgba(193,224,250,.42); font-size: 10px; letter-spacing: .06em; text-transform: none; }
.stats-head { margin: 24px 0 10px; color: #77caff; font-size: 11px; font-weight: 750; letter-spacing: .18em; text-transform: uppercase; }
.stats-dist { display: grid; grid-template-columns: 56px 1fr; gap: 10px; align-items: center; }
.stats-dist li { display: contents; }
.stats-band { color: rgba(193,224,250,.58); font-size: 11px; font-variant-numeric: tabular-nums; }
.stats-track { position: relative; height: 24px; border-radius: 7px; background: rgba(157,211,255,.07); overflow: hidden; }
.stats-fill { position: absolute; top: 0; right: 0; bottom: 0; border-radius: 7px; transition: width .35s ease-out; }
.stats-count { position: absolute; top: 50%; right: 9px; transform: translateY(-50%); color: #f5fbff; font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; text-shadow: 0 1px 3px rgba(0,0,0,.55); }
.stats-dist li.today .stats-band { color: #ffc76a; font-weight: 800; }
.stats-dist li.today .stats-track { box-shadow: 0 0 0 1px rgba(255,199,106,.6); }
.stats-best { margin: 16px 0 0; padding: 12px 14px; border: 1px solid rgba(255,199,106,.26); border-radius: 14px; background: rgba(255,199,106,.08); color: rgba(240,248,255,.86); font-size: 13px; line-height: 1.45; }
.stats-best b { color: #ffc76a; }
.stats-note { margin: 16px 0 0; color: rgba(193,224,250,.42); font-size: 11px; line-height: 1.5; text-align: center; }
.stats-close { position: absolute; top: 6px; right: 6px; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; background: none; color: rgba(198,226,250,.7); font-size: 28px; line-height: 1; cursor: pointer; touch-action: manipulation; }
body.game-stats #hud { opacity: 0; }
@media (max-height: 700px) {
  .stats-card { padding-top: 20px; }
  .stat b { font-size: 26px; }
  .stats-head { margin-top: 18px; }
}`;
document.head.appendChild(statsStyle);

const statsEntry = document.createElement('button');
statsEntry.className = 'stats-entry';
statsEntry.textContent = '📊 Stats';
statsEntry.setAttribute('aria-haspopup', 'dialog');
gameEls.startStreak.after(statsEntry);

const statsScreen = document.createElement('section');
statsScreen.className = 'screen stats-screen';
statsScreen.hidden = true;
statsScreen.innerHTML = `
  <div class="stats-card glass" role="dialog" aria-modal="true" aria-labelledby="stats-title">
    <button class="stats-close" aria-label="Close stats">×</button>
    <h2 id="stats-title">Your stats</h2>
    <div class="stats-hero">
      <div class="stat"><b data-stats="streak">0</b><span>🔥 day streak</span></div>
      <div class="stat cool"><b data-stats="longest">0</b><span>Longest streak</span></div>
    </div>
    <div class="stats-grid">
      <div class="stat cool"><b data-stats="games">0</b><span>Games played</span><small data-stats="games-sub"></small></div>
      <div class="stat"><b data-stats="average">0</b><span>Average score</span><small>/10000 per game</small></div>
      <div class="stat"><b data-stats="best">0</b><span>Best score</span><small>/10000 in one game</small></div>
      <div class="stat cool"><b data-stats="distance">0</b><span>Avg distance</span><small>km off the mark</small></div>
    </div>
    <p class="stats-head">Score distribution</p>
    <ol class="stats-dist" data-stats="dist"></ol>
    <p class="stats-best" data-stats="best-round" hidden></p>
    <p class="stats-note" data-stats="note"></p>
  </div>`;
document.getElementById('game').appendChild(statsScreen);
statsScreenEl = statsScreen;

const statsEls = {
  screen: statsScreen,
  card: statsScreen.querySelector('.stats-card'),
  close: statsScreen.querySelector('.stats-close'),
  dist: statsScreen.querySelector('[data-stats="dist"]'),
  bestRound: statsScreen.querySelector('[data-stats="best-round"]'),
  note: statsScreen.querySelector('[data-stats="note"]'),
};

const setStat = (name, value) => { statsScreen.querySelector(`[data-stats="${name}"]`).textContent = value; };

function renderStats() {
  const stats = statsSummary();
  setStat('streak', stats.streak);
  setStat('longest', stats.longest);
  setStat('games', stats.games.toLocaleString());
  setStat('average', stats.games ? stats.average.toLocaleString() : '');
  setStat('best', stats.games ? stats.bestTotal.toLocaleString() : '');
  setStat('distance', stats.games ? `${stats.averageDistance.toLocaleString()} km` : '');
  const sub = statsScreen.querySelector('[data-stats="games-sub"]');
  sub.textContent = stats.games ? `since ${shortDate(stats.first)}` : 'no games logged yet';

  const today = stats.history.length && daily && stats.history.some((game) => game.date === daily.date)
    ? daily.results.reduce((sum, result) => sum + result.score, 0)
    : null;
  const todayBand = today === null ? -1 : bandIndex(today);
  statsEls.dist.replaceChildren(...stats.counts.map((count, i) => {
    const li = document.createElement('li');
    if (i === todayBand) li.className = 'today';
    li.innerHTML = `<span class="stats-band">${bandLabel(i)}</span><div class="stats-track"><div class="stats-fill"></div><span class="stats-count">${count}</span></div>`;
    const fill = li.querySelector('.stats-fill');
    fill.style.width = `${count ? Math.max(9, (count / stats.peak) * 100) : 0}%`;
    fill.style.background = bandColor(i, 0.5);
    return li;
  }));

  if (stats.bestRound) {
    const round = stats.bestRound;
    statsEls.bestRound.hidden = false;
    statsEls.bestRound.innerHTML = `Closest guess <b>${round.base}/1000</b> · ${round.distance.toLocaleString()} km away<br>Round ${round.round} of 5 · ${shortDate(round.date)}`;
  } else {
    statsEls.bestRound.hidden = true;
  }

  const notes = ['Endless games are unscored, so they aren’t counted here.'];
  if (!stats.games) notes.unshift('Play today’s five places and these tiles start filling in.');
  else if (stats.games < 3) notes.unshift(`Averages and your longest streak settle in after a few games. ${stats.games} logged so far.`);
  statsEls.note.innerHTML = notes.join(' ');
}

function openStats() {
  renderStats();
  gameEls.start.hidden = true;
  statsScreen.hidden = false;
  document.body.className = 'game-stats';
  window.__canGuess = false;
  statsScreen.scrollTop = 0;
  statsEls.close.focus();
}

function closeStats() {
  statsScreen.hidden = true;
  gameEls.start.hidden = false;
  document.body.className = 'game-start';
  syncPassport();
  statsEntry.focus();
}

statsEntry.addEventListener('click', openStats);
statsEls.close.addEventListener('click', closeStats);
statsScreen.addEventListener('click', (e) => {
  if (e.target === statsScreen) closeStats();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !statsScreen.hidden) closeStats();
});

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
};

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
const PASSPORT_STAMPS = 5; // recent photo stamps
const PASSPORT_GOLD = 700; // /1000 and up reads gold, 400+ cyan, the rest dim
const PASSPORT_CYAN = 400;
const DOT_RADIUS = 1.008; // just proud of the sphere so the far side stays hidden
const CONTINENT_SHORT = {
  Africa: 'Africa',
  Asia: 'Asia',
  Europe: 'Europe',
  'North America': 'N. America',
  'South America': 'S. America',
  Oceania: 'Oceania',
  Antarctica: 'Antarctica',
};
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
const RARITY_CLASSES = ['rarity-common', 'rarity-uncommon', 'rarity-rare', 'rarity-legendary'];

function earnForKm(km) {
  // Passport and flyover tiers must share the exact, unrounded boundary check.
  return {
    pinpoint: EARN_PINPOINT,
    bullseye: EARN_BULLSEYE,
    near: EARN_NEAR,
  }[flyoverTier(km)] || 0;
}

// Rarity is the card-frame colour, from the location's difficulty.
function rarityFor(difficulty) {
  const d = Number(difficulty) || 5;
  if (d >= 9) return 'legendary';
  if (d >= 7) return 'rare';
  if (d >= 4) return 'uncommon';
  return 'common';
}

// Every location carries its rarity frame. Accuracy never touches that frame:
// Bullseye/Pinpoint show only as a gold badge (setProxBadge).
function applyCardTier(el, item, earned) {
  el.classList.remove(...RARITY_CLASSES, ...PROX_CLASSES.filter(Boolean));
  if (!item) return;
  const rarityClass = `rarity-${rarityFor(item?.difficulty)}`;
  el.classList.add(rarityClass);
  if (earned) el.classList.add(PROX_CLASSES[earned]);
}

// The one accuracy badge every surface uses (styles: .prox-badge in style.css).
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

function passportSummary() {
  const totals = new Map();
  for (const item of locations) {
    const name = continentOf(item);
    if (name) totals.set(name, (totals.get(name) || 0) + 1);
  }
  const counts = new Map();
  let found = 0;
  let earned = 0;
  for (const id of Object.keys(passport.visits)) {
    const item = passportLocation(id);
    if (!item) continue; // location retired from locations.json
    found += 1;
    if (passport.meta[id]?.e) earned += 1;
    const name = continentOf(item); // poles above the boxes still count as found
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  const recent = passport.order
    .slice(-40)
    .reverse()
    .map((id) => ({ item: passportLocation(id), base: passport.visits[id] }))
    .filter((spot) => spot.item);
  return {
    found,
    earned,
    total: locations.length,
    recent: recent.slice(0, PASSPORT_STAMPS).filter((spot) => spot.item.image),
    continents: [...totals]
      .map(([name, total]) => ({ name, found: counts.get(name) || 0, total }))
      .sort((a, b) => CONTINENT_ORDER.indexOf(a.name) - CONTINENT_ORDER.indexOf(b.name)),
  };
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

const passportStyle = document.createElement('style');
passportStyle.textContent = `
/* A plain scrim, not backdrop-filter: a blurred panel over the live WebGL canvas
   starves the software compositor (the stats overlay needed a frozen loop for the
   same reason) and the dots show through the tint anyway. */
.passport { width: 100%; max-width: 330px; margin: 18px 0 24px; padding: 12px 14px 13px; border-radius: 20px; border: 1px solid rgba(157,211,255,.14); background: rgba(4,10,24,.5); }
.passport[hidden] { display: none; }
.passport-count { margin: 0; color: rgba(193,224,250,.62); font-size: 13px; font-weight: 700; }
.passport-earned { color: #ffd166; }
.passport-streak { color: #ffc76a; }
.passport-count b { color: #ffc76a; font-size: 27px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -.02em; text-shadow: 0 0 22px rgba(255,199,106,.3); }
.passport-stamps { display: flex; justify-content: center; gap: 7px; margin-top: 11px; }
.passport-stamps img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: rgba(157,211,255,.08); border: 2px solid rgba(157,211,255,.28); }
.passport-stamps img[data-tier="gold"] { border-color: #ffd166; box-shadow: 0 0 12px rgba(255,209,102,.3); }
.passport-stamps img[data-tier="cyan"] { border-color: #67e8ff; }
.passport-stamps img[data-tier="dim"] { filter: saturate(.65) brightness(.7); }
.passport-continents { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; margin-top: 12px; }
.passport-continents span { position: relative; padding: 3px 8px 7px; border-radius: 999px; background: rgba(157,211,255,.07); color: rgba(193,224,250,.68); font-size: 10px; font-weight: 750; letter-spacing: .03em; white-space: nowrap; }
.passport-continents i { position: absolute; left: 8px; bottom: 3px; height: 2px; border-radius: 2px; background: linear-gradient(90deg, #ffd166, #67e8ff); opacity: .85; }
@media (max-height: 700px) {
  .passport { margin-bottom: 18px; }
  .passport-count b { font-size: 23px; }
  .passport-stamps img { width: 34px; height: 34px; }
  .passport-continents { margin-top: 9px; }
}`;
document.head.appendChild(passportStyle);

const passportBox = document.createElement('div');
passportBox.className = 'passport';
passportBox.hidden = true;
passportBox.innerHTML = `
  <p class="passport-count"><b data-passport="found">0</b> / <span data-passport="total">0</span> places found<span class="passport-earned" data-passport="earned"></span><span class="passport-streak" data-passport="streak"></span></p>
  <div class="passport-stamps" data-passport="stamps"></div>
  <div class="passport-continents" data-passport="continents"></div>`;
// Above the mode-button grid, never inside it: a fourth grid child shoves
// Survival onto a second row once the passport has a place in it.
gameEls.play.closest('.mode-buttons').before(passportBox);
const passportEls = {
  box: passportBox,
  found: passportBox.querySelector('[data-passport="found"]'),
  total: passportBox.querySelector('[data-passport="total"]'),
  earned: passportBox.querySelector('[data-passport="earned"]'),
  streak: passportBox.querySelector('[data-passport="streak"]'),
  stamps: passportBox.querySelector('[data-passport="stamps"]'),
  continents: passportBox.querySelector('[data-passport="continents"]'),
};

function syncPassport() {
  if (passportDirty) buildPassportDots();
  const summary = passportSummary();
  passportEls.box.hidden = summary.found === 0;
  gameEls.start.classList.toggle('has-passport', summary.found > 0);
  if (!summary.found) return;
  passportEls.found.textContent = summary.found.toLocaleString();
  passportEls.total.textContent = summary.total.toLocaleString();
  passportEls.earned.textContent = summary.earned ? ` · ${summary.earned.toLocaleString()} earned` : '';
  const streak = currentStreak();
  passportEls.streak.textContent = streak ? ` · 🔥 ${streak.toLocaleString()}` : '';
  passportEls.stamps.replaceChildren(...summary.recent.map((spot) => {
    const img = document.createElement('img');
    img.src = spot.item.image;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.dataset.tier = tierOf(spot.base);
    img.title = `${spot.item.short || spot.item.clue} · ${spot.base}/1000`;
    img.addEventListener('error', () => img.remove(), { once: true });
    return img;
  }));
  passportEls.continents.replaceChildren(...summary.continents.map((c) => {
    const chip = document.createElement('span');
    chip.textContent = `${CONTINENT_SHORT[c.name] || c.name} ${Math.round((c.found / c.total) * 100)}%`;
    chip.title = `${c.found} of ${c.total} ${c.name} places found`;
    const bar = document.createElement('i');
    bar.style.width = `${((c.found / c.total) * 100).toFixed(1)}%`;
    chip.append(bar);
    return chip;
  }));
}

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
// Passport page: the full collection as postcards, opened beside Stats
// ---------------------------------------------------------------------------
// Same overlay pattern as the stats screen (a fixed .screen over a frozen start
// screen, closed by ×, backdrop tap or Escape). Cards are rebuilt on each open
// and on each filter change; images lazy-load so a full 986-card passport only
// fetches what scrolls into view.
const DIFFICULTY_BANDS = [
  { key: 'easy', label: 'Easy', min: 1, max: 3 },
  { key: 'medium', label: 'Medium', min: 4, max: 6 },
  { key: 'hard', label: 'Hard', min: 7, max: 8 },
  { key: 'expert', label: 'Expert', min: 9, max: 10 },
];
const FLAG_RE = /[\u{1F1E6}-\u{1F1FF}]{2}/u;

function difficultyBand(item) {
  const band = DIFFICULTY_BANDS.find((b) => item.difficulty >= b.min && item.difficulty <= b.max);
  return band ? band.key : null;
}

function passportEntries() {
  const age = new Map(passport.order.map((id, i) => [id, i]));
  return Object.keys(passport.visits)
    .map((id) => {
      const item = passportLocation(id);
      if (!item) return null; // location retired from locations.json
      const meta = passport.meta[id] || {};
      return {
        item,
        best: meta.b ?? passport.visits[id],
        km: meta.d,
        first: meta.f,
        earned: meta.e || 0,
        tierDates: [null, meta.eb1, meta.eb2, meta.eb3],
        // Timestamped visits are always newer than legacy ones, which fall back to
        // their place in the recency order (and to the very end if that was capped).
        recency: meta.t ?? (age.has(id) ? age.get(id) : -1),
        continent: continentOf(item),
        band: difficultyBand(item),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.recency - a.recency);
}

const passportPageStyle = document.createElement('style');
passportPageStyle.textContent = `
.pp-card [hidden] { display: none !important; }
.home-links { display: flex; flex-wrap: nowrap; justify-content: center; gap: 6px; width: min(100%, 354px); max-width: calc(100vw - 32px); box-sizing: border-box; margin-top: 10px; }
.home-links > button { flex: 1 1 0; min-width: 0; margin-top: 0; padding: 0 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 360px) { .home-links > button { padding: 0 4px; font-size: 12px; } }
.passport-entry { min-height: 44px; padding: 0 14px; border: 1px solid rgba(103,232,255,.4); border-radius: 999px; background: rgba(103,232,255,.09); color: #c9f6ff; font-size: 13px; font-weight: 750; cursor: pointer; touch-action: manipulation; }
.passport-entry:active { transform: scale(.98); }
.passport-entry:disabled { opacity: .4; }
.pp-card { position: relative; box-sizing: border-box; width: 100%; max-width: 440px; min-height: 100%; margin: auto; padding: 26px 14px 20px; border-radius: 24px; overflow-x: clip; }
.pp-card h2 { margin: 0; color: #f5fbff; font-size: 21px; text-align: center; letter-spacing: -.02em; }
.pp-eyebrow { margin: 0 0 4px; color: #77caff; font-size: 10px; font-weight: 750; letter-spacing: .22em; text-align: center; text-transform: uppercase; }
.pp-header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-right: 40px; }
.pp-header-row > div { flex: 1; }
.pp-header-row .pp-eyebrow { text-align: left; margin: 0 0 2px; }
.pp-header-row h2 { text-align: left !important; font-size: 19px !important; }
.pp-share-icon { flex-shrink: 0; width: 44px; height: 44px; border: 1px solid rgba(255,209,102,.55); border-radius: 50%; background: linear-gradient(135deg, rgba(77,54,145,.95), rgba(25,47,101,.95)); color: #fff7dc; font-size: 18px; font-weight: 800; cursor: pointer; }
.pp-collections-link { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 42px; margin: 12px 0 2px; padding: 0 14px; border: 1px solid rgba(255,209,102,.25); border-radius: 13px; background: rgba(255,209,102,.06); color: #f4e8bf; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }
.pp-collections-link span { color: #ffd166; font-size: 22px; }
.pp-progress { margin: 8px 2px 0; }
.pp-count { margin: 0 0 6px; color: rgba(193,224,250,.62); font-size: 12px; font-weight: 700; text-align: center; }
.pp-count b { color: #ffc76a; font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; text-shadow: 0 0 22px rgba(255,199,106,.3); }
/* Two layers: visited as a pale track, earned as the bright gradient over it. */
.pp-bar { position: relative; height: 8px; border-radius: 8px; background: rgba(157,211,255,.1); overflow: hidden; }
.pp-bar i { position: absolute; left: 0; top: 0; height: 100%; border-radius: 8px; transition: width .4s ease-out; }
.pp-bar .pp-bar-seen { background: rgba(193,224,250,.22); }
.pp-bar .pp-bar-earned { background: linear-gradient(90deg, #67e8ff, #c4a8ff 55%, #ffd166); box-shadow: 0 0 12px rgba(255,209,102,.35); }
.pp-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 10px; }
.pp-subrow { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.pp-shown { margin: 0; color: rgba(193,224,250,.45); font-size: 11px; }
.pp-unearned { display: flex; align-items: center; gap: 4px; margin: 0; color: rgba(193,224,250,.7); font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.pp-unearned input { accent-color: #67e8ff; width: 14px; height: 14px; }
.pp-filters select { appearance: none; -webkit-appearance: none; min-height: 44px; width: 100%; padding: 0 24px 0 10px; border: 1px solid rgba(196,168,255,.35); border-radius: 999px; background: rgba(150,110,255,.12) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23d9ccff' stroke-width='1.6'/%3E%3C/svg%3E") no-repeat right 10px center; color: #ece4ff; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
.pp-filters select option { background: #0b1430; color: #ece4ff; }
.pp-shown { margin: 10px 0 0; color: rgba(193,224,250,.45); font-size: 11px; text-align: center; }
/* minmax(0) keeps the columns equal however long a caption is; the padding is
   room for the tilt so nothing pokes past the grid edge. */
.pp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; margin: 14px 0 0; padding: 4px 3px; list-style: none; }
/* A postcard: white border round the photo, caption on the card stock, and the
   best score pressed on as a round ink stamp. Alternate cards tilt a hair so the
   grid reads as a collection pinned in a book rather than a table. */
.pp-post { --tilt: -.6deg; position: relative; min-width: 0; padding: 5px 5px 8px; border: 2px solid var(--rarity, rgba(214,220,232,.16)); border-radius: 4px; background: #1a1f2e; box-shadow: 0 8px 22px rgba(0,0,0,.45), 0 1px 0 rgba(255,255,255,.12) inset; transform: rotate(var(--tilt)); transition: transform .16s ease-out, filter .16s ease-out; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.pp-post:nth-child(even) { --tilt: .7deg; }
.pp-post:active { transform: rotate(var(--tilt)) scale(.965); filter: brightness(.95); }
.pp-post:focus-visible { outline: 2px solid #67e8ff; outline-offset: 3px; }
/* While its detail is open the card has been lifted out of the book. */
.pp-post.pp-lifted { visibility: hidden; }
.pp-photo { position: relative; aspect-ratio: 4 / 3; border-radius: 2px; overflow: hidden; background: linear-gradient(135deg, #1b2c5a, #3b2a6e); }
.pp-photo::after { content: '🌍'; position: absolute; inset: 0; display: grid; place-items: center; font-size: 26px; opacity: .45; }
.pp-photo img { position: relative; z-index: 1; display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 20%; }
.pp-stamp { position: absolute; z-index: 2; right: 8px; top: 8px; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; border: 2px dashed currentColor; background: rgba(8,14,32,.82); color: #9fb6cc; font-size: 15px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; transform: rotate(12deg); box-shadow: 0 0 0 3px rgba(8,14,32,.82); text-align: center; }
.pp-stamp small { display: block; margin-top: 2px; font-size: 10px; font-weight: 800; letter-spacing: .08em; opacity: .9; text-align: center; }
.pp-stamp[data-tier="gold"] { color: #ffd166; text-shadow: 0 0 10px rgba(255,209,102,.45); }
.pp-stamp[data-tier="cyan"] { color: #67e8ff; }
/* Earned tiers. The border is rarity only (style.css); bullseye and pinpoint add
   just the gold .prox-badge on the photo. Seen cards are the same postcard in
   black and white, with a nudge to come back for it. */
.pp-post[data-earn="seen"] { background: #151923; }
.pp-post[data-earn="seen"] .pp-photo img { filter: grayscale(1) contrast(.92) brightness(.82); }
.pp-post[data-earn="seen"] .pp-name { color: #8992a8; }
.pp-name { margin: 7px 2px 0; overflow: hidden; color: #eef2ff; font-size: 13px; font-weight: 800; line-height: 1.2; letter-spacing: -.01em; text-overflow: ellipsis; white-space: nowrap; }
.pp-meta { min-height: 12px; margin: 4px 2px 0; color: #a8b0c3; font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pp-meta span { white-space: nowrap; }
.pp-tier-date { color: rgba(193,224,250,.66); font-weight: 650; }
.pp-empty { margin: 30px 8px 6px; color: rgba(224,240,255,.8); font-size: 15px; line-height: 1.5; text-align: center; }
.pp-empty::before { content: '🛂'; display: block; margin-bottom: 8px; font-size: 38px; }
.pp-play { display: block; min-height: 44px; margin: 16px auto 0; padding: 0 26px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #ffd166, #ff9f6a); color: #1b1230; font-size: 15px; font-weight: 800; cursor: pointer; touch-action: manipulation; }
.pp-note { margin: 18px 0 0; color: rgba(193,224,250,.42); font-size: 11px; line-height: 1.5; text-align: center; }
body.game-passport #hud { opacity: 0; }
@media (max-width: 360px) {
  .pp-grid { gap: 12px 9px; }
  .pp-stamp { width: 36px; height: 36px; font-size: 13px; }
}`;
document.head.appendChild(passportPageStyle);

const passportEntry = document.createElement('button');
passportEntry.className = 'passport-entry';
passportEntry.textContent = '🛂 Passport';
passportEntry.setAttribute('aria-haspopup', 'dialog');
const collectionsEntry = document.createElement('button');
collectionsEntry.className = 'passport-entry';
collectionsEntry.textContent = '🛡 Collections';
collectionsEntry.setAttribute('aria-haspopup', 'dialog');
const homeLinks = document.createElement('div');
homeLinks.className = 'home-links';
statsEntry.before(homeLinks);
homeLinks.append(statsEntry, passportEntry, collectionsEntry);

const passportScreen = document.createElement('section');
passportScreen.className = 'screen stats-screen passport-screen';
passportScreen.hidden = true;
passportScreen.innerHTML = `
  <div class="pp-card glass" role="dialog" aria-modal="true" aria-labelledby="pp-title">
    <button class="stats-close" aria-label="Close passport">×</button>
    <div class="pp-header-row">
      <div>
        <p class="pp-eyebrow">Where on Earth</p>
        <h2 id="pp-title">Your passport</h2>
      </div>
      <button class="pp-share-icon" data-pps="share" aria-label="Share my passport">↗</button>
    </div>
    <button class="pp-collections-link" type="button" data-pp="collections">🛡 View collections <span>›</span></button>
    <div class="pp-progress" data-pp="progress">
      <p class="pp-count"><b data-pp="found">0</b> / <span data-pp="total">0</span> places · <span data-pp="earned"></span></p>
      <div class="pp-bar" role="progressbar" aria-label="Postcards earned" aria-valuemin="0"><i class="pp-bar-seen" data-pp="fill"></i><i class="pp-bar-earned" data-pp="earnfill"></i></div>
    </div>
    <div class="pp-filters" data-pp="filters">
      <select data-pp="continent" aria-label="Filter by continent"><option value="">All continents</option></select>
      <select data-pp="band" aria-label="Filter by difficulty"><option value="">All difficulties</option></select>
      <select data-pp="sort" aria-label="Sort by">
        <option value="recent">Most recent</option>
        <option value="distance">Closest guess</option>
        <option value="name">Name A-Z</option>
      </select>
    </div>
    <div class="pp-subrow">
      <p class="pp-shown" data-pp="shown"></p>
      <label class="pp-unearned"><input type="checkbox" data-pp="unearned"> Unearned only</label>
    </div>
    <ul class="pp-grid" data-pp="grid"></ul>
    <div data-pp="empty" hidden>
      <p class="pp-empty"></p>
      <button class="pp-play" data-pp="play">Play today’s game</button>
    </div>
    <p class="pp-note" data-pp="note">Land within 150 km to earn a postcard in full colour, within 25 km for gold. Black-and-white cards come back in Endless once you’ve seen everywhere. Earlier stamps leave distance and date blank.</p>
  </div>`;
document.getElementById('game').appendChild(passportScreen);
passportScreenEl = passportScreen;

const ppEls = {
  close: passportScreen.querySelector('.stats-close'),
  progress: passportScreen.querySelector('[data-pp="progress"]'),
  found: passportScreen.querySelector('[data-pp="found"]'),
  total: passportScreen.querySelector('[data-pp="total"]'),
  bar: passportScreen.querySelector('.pp-bar'),
  fill: passportScreen.querySelector('[data-pp="fill"]'),
  earned: passportScreen.querySelector('[data-pp="earned"]'),
  earnFill: passportScreen.querySelector('[data-pp="earnfill"]'),
  filters: passportScreen.querySelector('[data-pp="filters"]'),
  continent: passportScreen.querySelector('[data-pp="continent"]'),
  band: passportScreen.querySelector('[data-pp="band"]'),
  sort: passportScreen.querySelector('[data-pp="sort"]'),
  unearned: passportScreen.querySelector('[data-pp="unearned"]'),
  shown: passportScreen.querySelector('[data-pp="shown"]'),
  grid: passportScreen.querySelector('[data-pp="grid"]'),
  empty: passportScreen.querySelector('[data-pp="empty"]'),
  emptyText: passportScreen.querySelector('.pp-empty'),
  play: passportScreen.querySelector('[data-pp="play"]'),
  note: passportScreen.querySelector('[data-pp="note"]'),
  collections: passportScreen.querySelector('[data-pp="collections"]'),
};
// Passport collection share card. It is created here rather than in index.html so
// it stays next to the passport data and can reuse passportEntries() directly.
const PASSPORT_SHARE_URL = new URL('/', location.href).href;
const passportShareStyle = document.createElement('style');
passportShareStyle.textContent = `
.pps { position: fixed; z-index: 14; inset: 0; box-sizing: border-box; display: grid; align-content: center; justify-items: center; gap: 14px; padding: max(18px, env(safe-area-inset-top)) 16px max(18px, env(safe-area-inset-bottom)); background: rgba(2,5,16,.9); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); overflow: auto; overscroll-behavior: contain; }
.pps[hidden] { display: none; }
.pps-card { position: relative; box-sizing: border-box; width: min(100%, 358px); padding: 22px 20px 18px; border: 1px solid rgba(184,166,255,.42); border-radius: 22px; overflow: hidden; background: radial-gradient(circle at 84% 4%, rgba(132,93,255,.34), transparent 35%), linear-gradient(145deg, #101b43, #090d25 72%); box-shadow: 0 24px 70px rgba(0,0,0,.58), inset 0 1px rgba(255,255,255,.1); color: #f7f8ff; }
.pps-card::before { content: ''; position: absolute; right: -25px; bottom: -38px; width: 150px; height: 150px; border: 1px dashed rgba(103,232,255,.22); border-radius: 50%; box-shadow: 0 0 0 18px rgba(103,232,255,.025), 0 0 0 42px rgba(196,168,255,.025); }
.pps-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.pps-kicker { margin: 0; color: #8fdfff; font-size: 10px; font-weight: 850; letter-spacing: .19em; text-transform: uppercase; }
.pps-card h3 { margin: 4px 0 0; font-size: 22px; line-height: 1; letter-spacing: -.035em; }
.pps-mark { display: grid; place-items: center; width: 42px; height: 42px; border: 2px dashed #ffd166; border-radius: 50%; color: #ffd166; font-size: 21px; transform: rotate(9deg); box-shadow: 0 0 16px rgba(255,209,102,.18); }
.pps-stats { position: relative; display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: 7px; margin-top: 20px; }
.pps-stat { min-width: 0; padding: 10px 9px 9px; border: 1px solid rgba(157,211,255,.13); border-radius: 12px; background: rgba(4,10,28,.54); }
.pps-stat:first-child { border-color: rgba(103,232,255,.3); }
.pps-stat.gold { border-color: rgba(255,209,102,.34); }
.pps-stat b { display: block; color: #eaf9ff; font-size: 21px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pps-stat:first-child b { color: #67e8ff; }
.pps-stat b small { margin-left: 1px; color: rgba(103,232,255,.62); font-size: .6em; font-weight: 800; }
.pps-stat.gold b { color: #ffd166; }
.pps-stat span { display: block; margin-top: 5px; color: rgba(218,229,255,.7); font-size: 10px; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pps-top3 { position: relative; margin: 15px 0 0; color: #f3ecff; font-size: 12px; font-weight: 700; line-height: 1.6; }
.pps-top3 b { color: #ffd166; }
.pps-url { margin: 12px 0 0; color: rgba(193,224,250,.62); font-size: 10px; font-weight: 750; letter-spacing: .04em; }
.pps-actions { display: flex; gap: 10px; width: min(100%, 358px); }
.pps-actions button { min-height: 44px; border-radius: 999px; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }
.pps-again { flex: 1; border: 0; background: linear-gradient(135deg, #ffd166, #ff9f6a); color: #21152f; }
.pps-close { width: 76px; border: 1px solid rgba(193,224,250,.28); background: rgba(14,24,54,.9); color: #e8f3ff; }
.pps-status { min-height: 17px; margin: -5px 0 0; color: rgba(218,229,255,.7); font-size: 11px; text-align: center; }
@media (max-width: 360px) { .pps-card { padding-inline: 17px; } .pps-stat { padding-inline: 7px; } .pps-stat b { font-size: 19px; } }
`;
document.head.appendChild(passportShareStyle);

const passportShareButton = passportScreen.querySelector('[data-pps="share"]');

const passportShareScreen = document.createElement('section');
passportShareScreen.className = 'pps';
passportShareScreen.hidden = true;
passportShareScreen.setAttribute('role', 'dialog');
passportShareScreen.setAttribute('aria-modal', 'true');
passportShareScreen.setAttribute('aria-labelledby', 'pps-title');
passportShareScreen.innerHTML = `
  <article class="pps-card">
    <div class="pps-top"><div><p class="pps-kicker">Where on Earth</p><h3 id="pps-title">My passport</h3></div><span class="pps-mark" aria-hidden="true">🛂</span></div>
    <div class="pps-stats">
      <div class="pps-stat"><b data-pps="visited">0/0</b><span>Places visited</span></div>
      <div class="pps-stat"><b data-pps="earned">0</b><span>Postcards</span></div>
      <div class="pps-stat gold"><b data-pps="bullseyes">0</b><span>Bullseyes</span></div>
    </div>
    <p class="pps-top3" data-pps="top3"></p>
    <p class="pps-url">where-on.earth</p>
  </article>
  <div class="pps-actions"><button class="pps-again" type="button" data-pps="again">Share again</button><button class="pps-close" type="button" data-pps="close">Close</button></div>
  <p class="pps-status" role="status" data-pps="status"></p>`;
document.body.appendChild(passportShareScreen);
const ppsEls = Object.fromEntries([...passportShareScreen.querySelectorAll('[data-pps]')].map((el) => [el.dataset.pps, el]));

function passportShareStats() {
  const entries = passportEntries();
  const withKm = entries.filter((e) => e.km != null).sort((a, b) => a.km - b.km);
  return {
    visited: entries.length,
    total: locations.length,
    earned: entries.filter((entry) => entry.earned).length,
    bullseyes: entries.filter((entry) => entry.earned >= EARN_BULLSEYE).length,
    streak: currentStreak(),
    top3: withKm.slice(0, 3).map((e) => ({ name: e.item.short, km: Math.round(e.km), image: e.item.image })),
  };
}

function passportShareText(stats) {
  const remaining = stats.total - stats.visited;
  return `My Where on Earth Passport:\n🎯 ${stats.bullseyes} Bullseyes\n🛂 ${stats.earned} Postcards\n📍 ${stats.visited} Visited\n🗺️ ${remaining} New places to explore`;
}

function fillPassportShareCard(stats) {
  // The total rides small beside the count, as on the passport header, so four-digit totals fit the tile.
  ppsEls.visited.replaceChildren(stats.visited.toLocaleString(), Object.assign(document.createElement('small'), { textContent: `/${stats.total.toLocaleString()}` }));
  ppsEls.earned.textContent = stats.earned.toLocaleString();
  ppsEls.bullseyes.textContent = stats.bullseyes.toLocaleString();
  if (stats.top3 && stats.top3.length > 0) {
    ppsEls.top3.innerHTML = '<b>Closest guesses:</b><br>' + stats.top3.map((t, i) => `${i + 1}. ${t.name}  ${t.km} km`).join('<br>');
  } else {
    ppsEls.top3.innerHTML = `🔥 <b>${stats.streak.toLocaleString()}</b> day current streak`;
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  ctx.stroke();
}

function passportShareImage(stats) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 700;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 1200, 700);
  bg.addColorStop(0, '#152756');
  bg.addColorStop(.55, '#15143d');
  bg.addColorStop(1, '#080b20');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, 700);
  const glow = ctx.createRadialGradient(1010, 0, 0, 1010, 0, 430);
  glow.addColorStop(0, 'rgba(132,93,255,.52)');
  glow.addColorStop(1, 'rgba(132,93,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1200, 700);
  ctx.fillStyle = '#8fdfff';
  ctx.font = '800 24px system-ui, sans-serif';
  ctx.fillText('WHERE ON EARTH', 72, 82);
  ctx.fillStyle = '#f7f8ff';
  ctx.font = '900 58px system-ui, sans-serif';
  ctx.fillText('My passport', 72, 150);
  ctx.font = '54px system-ui, sans-serif';
  ctx.fillText('🛂', 1040, 112);
  const boxes = [
    { x: 72, w: 360, value: stats.visited.toLocaleString(), label: 'places visited', color: '#67e8ff' },
    { x: 452, w: 290, value: stats.earned.toLocaleString(), label: 'POSTCARDS EARNED', color: '#f5fbff' },
    { x: 762, w: 290, value: stats.bullseyes.toLocaleString(), label: 'BULLSEYES', color: '#ffd166' },
  ];
  boxes.forEach((box) => {
    ctx.fillStyle = 'rgba(4,10,28,.56)';
    ctx.strokeStyle = box.color === '#ffd166' ? 'rgba(255,209,102,.48)' : 'rgba(157,211,255,.24)';
    ctx.lineWidth = 2;
    roundRect(ctx, box.x, 215, box.w, 170, 24);
    ctx.fillStyle = box.color;
    // Shrink font for long values like "1,000/1,000"
    const fontSize = box.value.length > 7 ? 40 : box.value.length > 5 ? 48 : 54;
    ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
    ctx.fillText(box.value, box.x + 28, 292);
    ctx.fillStyle = 'rgba(218,229,255,.64)';
    ctx.font = '800 19px system-ui, sans-serif';
    ctx.fillText(box.label, box.x + 28, 345);
  });
  ctx.fillStyle = '#f3ecff';
  ctx.font = '800 29px system-ui, sans-serif';
  if (stats.top3 && stats.top3.length > 0) {
    ctx.fillText('Closest guesses:', 72, 460);
    ctx.font = '700 24px system-ui, sans-serif';
    stats.top3.forEach((t, i) => {
      ctx.fillStyle = i === 0 ? '#ffd166' : '#c3d4f5';
      ctx.fillText(`${i + 1}. ${t.name}: ${t.km} km`, 72, 495 + i * 32);
    });
  } else {
    ctx.fillText(`🔥  ${stats.streak.toLocaleString()} day current streak`, 72, 460);
  }
  ctx.fillStyle = 'rgba(193,224,250,.56)';
  ctx.font = '700 21px system-ui, sans-serif';
  ctx.fillText('where-on.earth', 72, 660);

  // Closest-guess postcard image in dotted circle, bottom right
  const drawCircleImage = () => new Promise((resolve) => {
    if (!stats.top3 || !stats.top3.length || !stats.top3[0].image) {
      resolve();
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cx = 1050, cy = 560, r = 90;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      // Cover-fit the image into the circle
      const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      ctx.restore();
      // Dotted circle border
      ctx.save();
      ctx.strokeStyle = 'rgba(255,209,102,.7)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      resolve();
    };
    img.onerror = () => resolve();
    img.src = stats.top3[0].image;
  });

  return drawCircleImage().then(() => new Promise((resolve) => canvas.toBlob(resolve, 'image/png')));
}

async function sharePassport() {
  const stats = passportShareStats();
  const text = passportShareText(stats);
  fillPassportShareCard(stats);
  passportShareScreen.hidden = false;
  ppsEls.status.textContent = '';
  await new Promise(requestAnimationFrame);
  try {
    if (navigator.share) {
      const blob = await passportShareImage(stats);
      const file = blob ? new File([blob], 'where-on-earth-passport.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ title: 'My Where on Earth passport', text, url: PASSPORT_SHARE_URL, files: [file] });
      else await navigator.share({ title: 'My Where on Earth passport', text, url: PASSPORT_SHARE_URL });
      ppsEls.status.textContent = 'Passport shared!';
    } else {
      await navigator.clipboard.writeText(text);
      ppsEls.status.textContent = 'Passport stats copied. Paste them anywhere.';
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
    try {
      await navigator.clipboard.writeText(text);
      ppsEls.status.textContent = 'Passport stats copied. Paste them anywhere.';
    } catch {
      ppsEls.status.textContent = 'Sharing is unavailable on this browser.';
    }
  }
}

function closePassportShare() {
  passportShareScreen.hidden = true;
  passportShareButton.focus();
}

passportShareButton.addEventListener('click', sharePassport);
ppsEls.again.addEventListener('click', sharePassport);
ppsEls.close.addEventListener('click', closePassportShare);
passportShareScreen.addEventListener('click', (event) => { if (event.target === passportShareScreen) closePassportShare(); });


ppEls.continent.append(...CONTINENT_ORDER.map((name) => new Option(name, name)));
ppEls.band.append(...DIFFICULTY_BANDS.map((b) => new Option(`${b.label} (${b.min}–${b.max})`, b.key)));

let ppAll = []; // entries for the open page, filtered client-side

function passportCard(entry) {
  const li = document.createElement('li');
  li.className = 'pp-post';
  const earn = EARN_NAMES[entry.earned] || 'seen';
  li.dataset.earn = earn;
  applyCardTier(li, entry.item, entry.earned);
  const photo = document.createElement('div');
  photo.className = 'pp-photo';
  if (entry.item.image) {
    const img = document.createElement('img');
    img.src = entry.item.image;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => img.remove(), { once: true });
    photo.append(img);
  }
  setProxBadge(photo, entry.earned);
  // (pp-hint text removed per Sean 2026-10-07)
  // The stamp ink follows what was earned, not the raw score: gold bullseye or
  // pinpoint, cyan near miss, grey still to earn.
  const stamp = document.createElement('span');
  stamp.className = 'pp-stamp';
  stamp.dataset.tier = entry.earned >= EARN_BULLSEYE ? 'gold' : earn === 'near' ? 'cyan' : 'dim';
  stamp.setAttribute('aria-label', `${{ seen: 'Not yet earned. ', bullseye: 'Bullseye. ', pinpoint: 'Pinpoint. ' }[earn] || ''}Best score ${entry.best} out of 1000`);
  stamp.innerHTML = `<span>${entry.best}<small>${{ bullseye: '🎯', pinpoint: '📍' }[earn] || 'BEST'}</small></span>`;
  const name = document.createElement('p');
  name.className = 'pp-name';
  name.textContent = entry.item.clue || entry.item.short;
  name.title = name.textContent;
  const meta = document.createElement('p');
  meta.className = 'pp-meta';
  const tierDate = entry.tierDates[entry.earned];
  const date = document.createElement('span');
  date.className = 'pp-tier-date';
  if (tierDate) {
    const tier = { 1: 'Postcard', 2: 'Bullseye', 3: 'Pinpoint' }[entry.earned];
    date.textContent = `${tier} • ${shortDate(tierDate)}`;
    date.title = `${tier} earned`;
  }
  if (tierDate) meta.append(date);
  li.append(photo, stamp, name, meta);
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.setAttribute('aria-haspopup', 'dialog');
  li.setAttribute('aria-label', `Open postcard: ${name.textContent}`);
  li.addEventListener('click', () => openPostcard(entry, li));
  li.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openPostcard(entry, li);
  });
  return li;
}

function renderPassportGrid() {
  const continent = ppEls.continent.value;
  const band = ppEls.band.value;
  const sort = ppEls.sort.value;
  const unearnedOnly = ppEls.unearned.checked;
  let shown = ppAll.filter((e) => (!continent || e.continent === continent) && (!band || e.band === band) && (!unearnedOnly || !e.earned));
  // Sort: recent (default), distance, name
  const by = {
    distance: (a, b) => (a.km ?? Infinity) - (b.km ?? Infinity),
    name: (a, b) => (a.item.short || '').localeCompare(b.item.short || ''),
    recent: (a, b) => b.recency - a.recency,
  }[sort] || ((a, b) => b.recency - a.recency);
  shown = [...shown].sort(by);
  ppEls.grid.replaceChildren(...shown.map(passportCard));
  ppEls.shown.textContent = continent || band
    ? (shown.length ? `${shown.length.toLocaleString()} of ${ppAll.length.toLocaleString()} shown` : 'No stamps match these filters yet.')
    : '';
}

function renderPassportPage() {
  ppAll = passportEntries();
  const total = locations.length;
  const has = ppAll.length > 0;
  ppEls.found.textContent = ppAll.length.toLocaleString();
  ppEls.total.textContent = total.toLocaleString();
  const earned = ppAll.filter((e) => e.earned).length;
  const bulls = ppAll.filter((e) => e.earned >= EARN_BULLSEYE).length;
  ppEls.earned.hidden = !has;
  ppEls.earned.innerHTML = `<b>${earned.toLocaleString()}</b> postcards earned${bulls ? ` · <b>${bulls.toLocaleString()}</b> 🎯` : ''}`;
  ppEls.bar.setAttribute('aria-valuemax', String(total));
  ppEls.bar.setAttribute('aria-valuenow', String(earned));
  ppEls.fill.style.width = `${total ? (ppAll.length / total) * 100 : 0}%`;
  ppEls.earnFill.style.width = `${total ? (earned / total) * 100 : 0}%`;
  ppEls.filters.hidden = !has;
  ppEls.note.hidden = !has;
  ppEls.empty.hidden = has;
  ppEls.emptyText.textContent = 'Your passport is empty. Play your first game!';
  if (!has) {
    ppEls.grid.replaceChildren();
    ppEls.shown.textContent = '';
    return;
  }
  renderPassportGrid();
}

function openPassport() {
  renderPassportPage();
  gameEls.start.hidden = true;
  passportScreen.hidden = false;
  document.body.className = 'game-passport';
  window.__canGuess = false;
  passportScreen.scrollTop = 0;
  ppEls.close.focus();
}

function closePassport(refocus = true) {
  passportScreen.hidden = true;
  gameEls.start.hidden = false;
  document.body.className = 'game-start';
  syncPassport();
  if (refocus) passportEntry.focus();
}

passportEntry.addEventListener('click', openPassport);
ppEls.close.addEventListener('click', () => closePassport());
ppEls.continent.addEventListener('change', renderPassportGrid);
ppEls.band.addEventListener('change', renderPassportGrid);
ppEls.sort.addEventListener('change', renderPassportGrid);
ppEls.unearned.addEventListener('change', renderPassportGrid);
ppEls.play.addEventListener('click', () => {
  closePassport(false);
  gameEls.play.click();
});
passportScreen.addEventListener('click', (e) => {
  if (e.target === passportScreen) closePassport();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !passportScreen.hidden) closePassport();
});

// ---------------------------------------------------------------------------
// Collections: the 36 themed sets attached to locations.json. A postcard is
// collected when its passport entry has an earned tier (near or better).
// ---------------------------------------------------------------------------
const collectionsStyle = document.createElement('style');
collectionsStyle.textContent = `
.collections-screen { box-sizing: border-box; overflow: auto; padding: calc(env(safe-area-inset-top, 0px) + 18px) 14px calc(env(safe-area-inset-bottom, 0px) + 30px); background: #03060f; color: #e6e8ee; pointer-events: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.collections-shell { width: 100%; max-width: 390px; margin: auto; }
.collections-nav { display: flex; align-items: center; justify-content: space-between; min-height: 44px; margin-bottom: 10px; }
.collections-back { display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px; border: 0; background: none; color: rgba(214,220,232,.68); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.collections-sort { color: rgba(214,220,232,.42); font-size: 11px; font-weight: 650; }
.collections-sort-control { position: relative; display: inline-flex; align-items: center; gap: 3px; }
.collections-sort-control::after { content: ''; width: 5px; height: 5px; margin: -3px 2px 0 1px; border-right: 1px solid rgba(214,220,232,.48); border-bottom: 1px solid rgba(214,220,232,.48); transform: rotate(45deg); pointer-events: none; }
.collections-sort-select { max-width: 112px; margin: 0; padding: 7px 0; border: 0; outline: 0; appearance: none; -webkit-appearance: none; background: transparent; color: rgba(214,220,232,.62); font: inherit; font-weight: 700; text-overflow: ellipsis; cursor: pointer; }
.collections-sort-select:focus-visible { border-radius: 5px; box-shadow: 0 0 0 2px rgba(210,174,98,.45); }
.collections-sort-select option { background: #111726; color: #d6dce8; }
.collections-eyebrow { margin: 0 0 6px; color: rgba(214,220,232,.55); font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.collections-screen h2 { margin: 0; color: #f4f5f8; font-size: 27px; line-height: 1.15; letter-spacing: -.025em; }
.collections-lede { margin: 8px 0 18px; color: rgba(214,220,232,.55); font-size: 14px; line-height: 1.5; }
.collections-stats { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; margin-bottom: 18px; }
.collections-stat { padding: 11px 9px 10px; border: 1px solid rgba(214,220,232,.08); border-radius: 12px; background: #0c111c; }
.collections-stat b { display: block; color: #e6e8ee; font-size: 19px; line-height: 1; font-variant-numeric: tabular-nums; }
.collections-stat.gold b { color: #d2ae62; text-shadow: 0 0 12px rgba(210,174,98,.35); }
.collections-stat span { display: block; margin-top: 4px; color: rgba(214,220,232,.62); font-size: 10px; font-weight: 750; letter-spacing: .03em; text-transform: uppercase; }
.collection-sets { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
.collection-set { position: relative; display: flex; min-width: 0; flex-direction: column; padding: 12px; border: 1px solid rgba(214,220,232,.08); border-radius: 14px; background: linear-gradient(180deg,#111726,#0b0f19); color: inherit; text-align: left; cursor: pointer; touch-action: manipulation; }
.collection-set:active { transform: scale(.97); }
.collection-set.done { border-color: rgba(210,174,98,.45); background: linear-gradient(180deg,#1a1810,#0e1018 70%); box-shadow: 0 0 18px rgba(210,174,98,.12); }
.collection-set-top { display: flex; align-items: center; justify-content: space-between; }
.collection-icon { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid rgba(214,220,232,.1); border-radius: 10px; background: #151b2a; font-size: 18px; }
.collection-count { color: rgba(214,220,232,.55); font-size: 12px; font-weight: 800; }
.collection-set.done .collection-count { color: #d2ae62; }
.collection-name { min-height: 2.4em; margin-top: 10px; color: #e6e8ee; font-size: 14px; font-weight: 750; line-height: 1.2; }
.collection-sub { margin-top: 2px; color: rgba(214,220,232,.32); font-size: 11px; font-weight: 650; }
.collection-bar { height: 3px; margin: 10px 0; border-radius: 3px; overflow: hidden; background: rgba(214,220,232,.08); }
.collection-bar i { display: block; height: 100%; border-radius: inherit; background: rgba(214,220,232,.55); }
.collection-set.done .collection-bar i { background: #d2ae62; box-shadow: 0 0 8px rgba(210,174,98,.6); }
.collection-thumbs { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 5px; margin-top: auto; }
.collection-thumb { position: relative; aspect-ratio: 1; overflow: hidden; border: 1px solid rgba(214,220,232,.14); border-radius: 6px; background: #0a0e17; }
.collection-thumb img { width: 100%; height: 100%; object-fit: cover; }
.collection-detail-head { display: flex; align-items: center; gap: 12px; }
.collection-detail-head .collection-icon { flex: none; width: 48px; height: 48px; border-radius: 14px; font-size: 25px; }
.collection-detail-head p { margin: 4px 0 0; color: rgba(214,220,232,.55); font-size: 13px; }
.collection-progress { margin: 18px 0; padding: 14px; border: 1px solid rgba(214,220,232,.08); border-radius: 14px; background: #0c111c; }
.collection-progress-top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
.collection-progress-top b { font-size: 22px; font-variant-numeric: tabular-nums; }
.collection-progress-top span { color: rgba(214,220,232,.4); font-size: 12px; font-weight: 650; }
.collection-segments { display: flex; gap: 3px; }
.collection-segments i { flex: 1; height: 6px; border-radius: 3px; background: rgba(214,220,232,.08); }
.collection-segments i.earned { background: #d2ae62; box-shadow: 0 0 5px rgba(210,174,98,.45); }
.collection-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 14px 10px; margin: 0; padding: 0; list-style: none; }
.collection-card { position: relative; min-width: 0; padding: 5px 5px 7px; border: 2px solid var(--rarity, rgba(214,220,232,.16)); border-radius: 9px; background: #1a1f2e; }
.collection-card .photo { position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 5px; background: #0d111b; }
.collection-card img { width: 100%; height: 100%; object-fit: cover; object-position: center 30%; }
.collection-card-name { min-height: 2.3em; margin: 6px 1px 0; display: grid; place-items: center; color: #e6e8ee; font-size: 10px; font-weight: 750; line-height: 1.15; text-align: center; }
.collection-card.unearned .collection-card-name { color: rgba(214,220,232,.4); }
.collection-card-meta { margin: 3px 0 0; color: rgba(214,220,232,.62); font-size: 10px; font-weight: 750; text-align: center; text-transform: uppercase; }
.collection-complete { margin: 18px 0; padding: 14px; border: 1px solid rgba(210,174,98,.5); border-radius: 14px; background: linear-gradient(135deg,#241f12,#0e111a); color: #d2ae62; font-size: 13px; font-weight: 800; text-align: center; box-shadow: 0 0 20px rgba(210,174,98,.12); }
body.game-collections #hud { opacity: 0; }
@media (max-width:360px) { .collection-sets { gap: 8px; } .collection-set { padding: 10px; } .collection-grid { gap: 12px 8px; } }
`;
document.head.appendChild(collectionsStyle);

const SET_ICONS = ['🌋','🏛️','🏔️','🌊','🏰','🏝️','🌍','🧭'];
const collectionsScreen = document.createElement('section');
collectionsScreen.className = 'screen collections-screen';
collectionsScreen.hidden = true;
collectionsScreen.innerHTML = '<div class="collections-shell"><div class="collections-nav"><button class="collections-back" type="button"></button><div class="collections-sort"><label class="collections-sort-control">Sort: <select class="collections-sort-select" aria-label="Sort collections"><option value="completion">Completion %</option><option value="earned">Postcards earned</option><option value="closest">Closest to complete</option><option value="alpha">A–Z</option></select></label><span class="collections-sort-status" hidden></span></div></div><div data-collections="content"></div></div>';
document.getElementById('game').appendChild(collectionsScreen);
collectionsScreenEl = collectionsScreen;
const collectionsBack = collectionsScreen.querySelector('.collections-back');
const collectionsSort = collectionsScreen.querySelector('.collections-sort');
const collectionsSortControl = collectionsSort.querySelector('.collections-sort-control');
const collectionsSortSelect = collectionsSort.querySelector('.collections-sort-select');
const collectionsSortStatus = collectionsSort.querySelector('.collections-sort-status');
const collectionsContent = collectionsScreen.querySelector('[data-collections="content"]');
const COLLECTION_SORT_KEY = 'where-on-earth-collection-sort';
const COLLECTION_SORTS = new Set(['completion', 'earned', 'closest', 'alpha']);
let collectionSets = [];
let collectionReturn = 'home';
let activeCollection = null;
let collectionSort = 'completion';

try {
  const savedCollectionSort = localStorage.getItem(COLLECTION_SORT_KEY);
  if (COLLECTION_SORTS.has(savedCollectionSort)) collectionSort = savedCollectionSort;
} catch (error) {
  storageError('Read failed', COLLECTION_SORT_KEY, error);
}
collectionsSortSelect.value = collectionSort;

function buildCollectionSets() {
  const byName = new Map();
  locations.forEach((item) => (item.sets || []).forEach((name) => {
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(item);
  }));
  collectionSets = [...byName].map(([name, items], index) => ({ name, items, icon: SET_ICONS[index % SET_ICONS.length] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function collectionEarn(item) { return passport.meta[item.id]?.e || 0; }
function collectionVisited(item) { return Object.hasOwn(passport.meta, item.id); }

function sortedCollectionSets() {
  const earnedCount = (set) => set.items.filter(collectionEarn).length;
  return [...collectionSets].sort((a, b) => {
    const aEarned = earnedCount(a);
    const bEarned = earnedCount(b);
    let difference = 0;
    if (collectionSort === 'completion') difference = (bEarned * a.items.length) - (aEarned * b.items.length);
    else if (collectionSort === 'earned') difference = bEarned - aEarned;
    else if (collectionSort === 'closest') difference = (a.items.length - aEarned) - (b.items.length - bEarned);
    return difference || a.name.localeCompare(b.name);
  });
}

function collectionThumb(item) {
  const visited = collectionVisited(item);
  const wrap = document.createElement('span');
  wrap.className = `collection-thumb${visited ? '' : ' mystery'}`;
  if (!visited) {
    wrap.setAttribute('aria-label', 'Mystery location, not visited');
    return wrap;
  }
  const img = document.createElement('img');
  img.src = item.image || '';
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => img.remove(), { once: true });
  wrap.append(img);
  return wrap;
}

function renderCollectionsOverview() {
  activeCollection = null;
  collectionsBack.textContent = collectionReturn === 'passport' ? '‹ Passport' : '‹ Home';
  collectionsSortControl.hidden = false;
  collectionsSortStatus.hidden = true;
  const earnedTotal = collectionSets.reduce((sum, set) => sum + set.items.filter(collectionEarn).length, 0);
  const cardTotal = collectionSets.reduce((sum, set) => sum + set.items.length, 0);
  const complete = collectionSets.filter((set) => set.items.every(collectionEarn)).length;
  const header = document.createElement('header');
  header.innerHTML = `<p class="collections-eyebrow">Your album</p><h2>Collections</h2><p class="collections-lede">Every postcard belongs to a set. Fill a set to complete the collection.</p><div class="collections-stats"><div class="collections-stat"><b>${earnedTotal}<small> / ${cardTotal}</small></b><span>Postcards</span></div><div class="collections-stat gold"><b>${complete}</b><span>Sets complete</span></div><div class="collections-stat"><b>${collectionSets.length}</b><span>Sets</span></div></div>`;
  const grid = document.createElement('div');
  grid.className = 'collection-sets';
  sortedCollectionSets().forEach((set) => {
    const earned = set.items.filter(collectionEarn).length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `collection-set${earned === set.items.length ? ' done' : ''}`;
    button.setAttribute('aria-label', `${set.name}: ${earned} of ${set.items.length} postcards earned`);
    button.innerHTML = `<span class="collection-set-top"><span class="collection-icon">${set.icon}</span><span class="collection-count">${earned}/${set.items.length}</span></span><span class="collection-name"></span><span class="collection-sub">${earned === set.items.length ? 'Complete' : earned ? `${set.items.length - earned} to go` : 'Not started'}</span><span class="collection-bar"><i style="width:${(earned / set.items.length) * 100}%"></i></span>`;
    button.querySelector('.collection-name').textContent = set.name;
    const thumbs = document.createElement('span');
    thumbs.className = 'collection-thumbs';
    set.items.slice(0, 4).forEach((item) => thumbs.append(collectionThumb(item)));
    button.append(thumbs);
    button.addEventListener('click', () => renderCollectionDetail(set));
    grid.append(button);
  });
  collectionsContent.replaceChildren(header, grid);
}

function renderCollectionDetail(set) {
  activeCollection = set;
  collectionsBack.textContent = '‹ Collections';
  collectionsSortControl.hidden = true;
  collectionsSortStatus.hidden = false;
  collectionsSortStatus.textContent = 'Sorted by number';
  const earned = set.items.filter(collectionEarn).length;
  const head = document.createElement('div');
  head.className = 'collection-detail-head';
  head.innerHTML = `<span class="collection-icon">${set.icon}</span><div><h2></h2><p>${set.items.length} postcards</p></div>`;
  head.querySelector('h2').textContent = set.name;
  const progress = document.createElement('div');
  progress.className = 'collection-progress';
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', `${set.name} postcards earned`);
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', String(set.items.length));
  progress.setAttribute('aria-valuenow', String(earned));
  progress.innerHTML = `<div class="collection-progress-top"><b>${earned} / ${set.items.length}</b><span>${Math.round(earned / set.items.length * 100)}% collected</span></div><div class="collection-segments">${set.items.map((item) => `<i class="${collectionEarn(item) ? 'earned' : ''}"></i>`).join('')}</div>`;
  const grid = document.createElement('ol');
  grid.className = 'collection-grid';
  set.items.forEach((item, index) => {
    const tier = collectionEarn(item);
    const visited = collectionVisited(item);
    const card = document.createElement('li');
    card.className = `collection-card${tier ? '' : ' unearned'}${visited ? '' : ' mystery'}`;
    applyCardTier(card, item, tier);
    const photo = document.createElement('div');
    photo.className = 'photo';
    if (visited) {
      const img = document.createElement('img');
      img.src = item.image || '';
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => img.remove(), { once: true });
      photo.append(img);
      setProxBadge(photo, tier, 'compact');
    }
    const name = document.createElement('p');
    name.className = 'collection-card-name';
    name.textContent = visited ? item.short || item.clue : '???';
    const meta = document.createElement('p');
    meta.className = 'collection-card-meta';
    meta.textContent = `${String(index + 1).padStart(2, '0')} · ${visited ? (tier ? EARN_NAMES[tier] : 'Unearned') : 'Unvisited'}`;
    if (!visited) card.setAttribute('aria-label', `Card ${index + 1}: mystery location, not visited`);
    card.append(photo, name, meta);
    // Tap to open postcard modal (only for visited locations)
    if (visited) {
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-haspopup', 'dialog');
      const meta = passport.meta[item.id] || {};
      const entry = {
        item,
        earned: tier,
        continent: item.continent,
        tierDates: [null, meta.eb1, meta.eb2, meta.eb3],
        best: meta.b,
        km: meta.d,
        first: meta.f,
      };
      card.addEventListener('click', () => openPostcard(entry, card));
      card.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        openPostcard(entry, card);
      });
    }
    grid.append(card);
  });
  const nodes = [head];
  if (earned === set.items.length) {
    const complete = document.createElement('div');
    complete.className = 'collection-complete';
    complete.textContent = `★ Set complete · All ${set.items.length} postcards earned`;
    nodes.push(complete);
  }
  nodes.push(progress, grid);
  collectionsContent.replaceChildren(...nodes);
  collectionsScreen.scrollTop = 0;
}

function openCollections(from = 'home') {
  if (!collectionSets.length) buildCollectionSets();
  collectionReturn = from;
  gameEls.start.hidden = true;
  passportScreen.hidden = true;
  collectionsScreen.hidden = false;
  document.body.className = 'game-collections';
  window.__canGuess = false;
  renderCollectionsOverview();
  collectionsScreen.scrollTop = 0;
}

function closeCollections() {
  collectionsScreen.hidden = true;
  if (collectionReturn === 'passport') openPassport();
  else {
    gameEls.start.hidden = false;
    document.body.className = 'game-start';
    collectionsEntry.focus();
  }
}

collectionsEntry.addEventListener('click', () => openCollections('home'));
ppEls.collections.addEventListener('click', () => openCollections('passport'));
collectionsBack.addEventListener('click', () => activeCollection ? renderCollectionsOverview() : closeCollections());
collectionsSortSelect.addEventListener('change', () => {
  collectionSort = collectionsSortSelect.value;
  safeSetItem(COLLECTION_SORT_KEY, collectionSort);
  renderCollectionsOverview();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || collectionsScreen.hidden) return;
  if (activeCollection) renderCollectionsOverview();
  else closeCollections();
});

// ---------------------------------------------------------------------------
// Postcard detail: tap a card in the passport to hold it up close
// ---------------------------------------------------------------------------
// The detail card grows out of the tapped postcard (a FLIP from the card's rect,
// clipped to the card's height so the back of it unfolds below the photo) and
// shrinks back into it on close. The source card is hidden meanwhile, so it
// reads as one postcard lifted out of the book rather than a popup on top.
const postcardStyle = document.createElement('style');
postcardStyle.textContent = `
.ppd { z-index: 11; box-sizing: border-box; display: flex; overflow: auto; padding: calc(env(safe-area-inset-top, 0px) + 20px) var(--ppd-screen-gutter, 12px) calc(env(safe-area-inset-bottom, 0px) + 20px); pointer-events: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.ppd-scrim { position: fixed; inset: 0; background: rgba(2,4,9,.74); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); }
.ppd-card { --ppd-accent: #d1a943; position: relative; box-sizing: border-box; width: 100%; max-width: 380px; margin: auto; padding: 13px; border: 2px solid var(--rarity, #3f485b); border-radius: 28px; background: #1a1f2e; box-shadow: 0 24px 70px rgba(0,0,0,.72), inset 0 1px rgba(255,255,255,.08); color: #f7f8fc; transform-origin: 0 0; }
.ppd-card[data-earn="seen"] .pp-photo img { filter: grayscale(1) contrast(.92) brightness(.82); }
.ppd-front .prox-badge { top: 10px; left: 10px; gap: 5px; height: 26px; padding: 0 11px 0 8px; font-size: 11px; box-shadow: 0 2px 8px rgba(0,0,0,.55); }
.ppd-front .prox-badge i { font-size: 14px; }
.ppd-topline { display: flex; align-items: center; gap: 10px; min-height: 29px; margin-bottom: 10px; padding-right: 38px; padding-left: 3px; }
.ppd-rarity { flex: none; }
.ppd-difficulty { display: flex; align-items: center; gap: 7px; color: #9fa9bb; font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.ppd-difficulty strong { display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid #566074; border-radius: 50%; background: #242a3b; color: #fff; font-size: 13px; letter-spacing: 0; }
.ppd-front { position: relative; }
.ppd-front .pp-photo { aspect-ratio: 16 / 9; border-radius: 15px; }
.ppd-front .pp-photo::after { font-size: 44px; }
.ppd-close { position: absolute; z-index: 3; top: var(--ppd-control-inset, 6px); right: var(--ppd-control-inset, 6px); width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; background: none; cursor: pointer; touch-action: manipulation; }
.ppd-close::before { content: '×'; display: grid; place-items: center; width: 32px; height: 32px; margin: auto; border-radius: 50%; background: rgba(8,14,32,.72); color: #f5fbff; font-size: 22px; line-height: 1; }
.ppd-close:focus-visible { outline: none; }
.ppd-close:focus-visible::before { box-shadow: 0 0 0 2px #67e8ff; }
.ppd-body { padding: 14px 2px 0; color: #f7f8fc; }
.ppd-from { margin: 0; color: #8f9aaf; font-size: 10px; font-weight: 800; letter-spacing: .17em; text-transform: uppercase; }
.ppd-body h3 { margin: 4px 0 0; color: #f7f8fc; font-family: Georgia, serif; font-size: 27px; font-weight: 700; line-height: 1.1; letter-spacing: -.02em; overflow-wrap: anywhere; }
.ppd-clue { margin: 4px 0 0; color: #8f9aaf; font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.ppd-achievement { display: flex; align-items: center; justify-content: center; gap: 8px; height: 36px; margin: 14px 0 0; border: 1px solid #5d5132; border-radius: 10px; background: #242838; color: #c7a957; font-size: 11px; font-weight: 900; letter-spacing: .15em; text-transform: uppercase; }
.ppd-achievement::before { content: '\u2726'; font-size: 12px; }
.ppd-history { display: grid; gap: 5px; margin: 10px 4px 0; color: #9fa9bb; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ppd-history span { display: block; }
.ppd-history[hidden] { display: none; }
.ppd-card.prox-bullseye .ppd-achievement { border-color: #74602d; background: linear-gradient(180deg,#4a3b1d,#2b251d); color: #ffd971; }
.ppd-card.prox-pinpoint .ppd-achievement { border-color: #a76b34; background: linear-gradient(180deg,#71401e,#3d281e); color: #ffd080; }
.ppd-fact { margin: 14px 0 0; padding: 0 0 14px; border-bottom: 1px solid #303748; color: #c2c8d4; font-family: Georgia, serif; font-size: 13px; line-height: 1.52; }
.ppd-fact::before { content: 'DID YOU KNOW?'; display: block; margin-bottom: 5px; color: var(--ppd-accent); font-family: Inter, sans-serif; font-size: 10px; font-weight: 900; letter-spacing: .15em; }
.ppd-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 14px 0 0; }
.ppd-stats div { min-width: 0; padding: 10px; border: 1px solid #30384a; border-radius: 10px; background: #151a27; }
.ppd-stats dt { color: #8a95a9; font-size: 10px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
.ppd-stats dd { margin: 5px 0 0; color: #f7f8fc; font-size: 14px; font-weight: 850; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ppd-stats dd small { color: #8390a6; font-size: 10px; font-weight: 650; }
.ppd-visited { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 13px 0 0; color: #818da2; font-size: 10px; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
.ppd-visited strong { color: #c8cfdb; font-weight: 750; text-align: right; }
.ppd-hint { margin: 10px 0 0; color: #9fa9bb; font-size: 12px; font-weight: 700; text-align: center; }
.ppd-share { display: block; width: 100%; min-height: 45px; margin: 13px 0 0; padding: 0 16px; border: 1px solid #4b566b; border-radius: 12px; background: #252d40; color: #fff; font-size: 11px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; cursor: pointer; touch-action: manipulation; }
.ppd-share:active { transform: scale(.98); }
.ppd-share:focus-visible { outline: 2px solid #67e8ff; outline-offset: 2px; }
.ppd-share[hidden] { display: none; }`;
document.head.appendChild(postcardStyle);

const postcardScreen = document.createElement('section');
postcardScreen.className = 'screen ppd';
postcardScreen.hidden = true;
postcardScreen.innerHTML = `
  <div class="ppd-scrim" data-ppd="scrim"></div>
  <article class="ppd-card" role="dialog" aria-modal="true" aria-labelledby="ppd-title" data-ppd="card">
    <button class="ppd-close" aria-label="Close postcard" data-ppd="close"></button>
    <div class="ppd-topline"><span class="ppd-rarity" data-ppd="rarity"></span><span class="ppd-difficulty">Difficulty <strong data-ppd="difficulty"></strong></span></div>
    <div class="ppd-front">
      <div class="pp-photo" data-ppd="photo"></div>
    </div>
    <div class="ppd-body">
      <p class="ppd-from" data-ppd="from"></p>
      <h3 id="ppd-title" data-ppd="name"></h3>
      <p class="ppd-clue" data-ppd="clue"></p>
      <div class="ppd-achievement" data-ppd="achievement"></div>
      <div class="ppd-history" data-ppd="history" aria-label="Postcard upgrade history"></div>
      <p class="ppd-fact" data-ppd="fact"></p>
      <dl class="ppd-stats" data-ppd="stats"></dl>
      <p class="ppd-hint" data-ppd="hint"></p>
      <div class="ppd-visited"><span>First visited</span><strong data-ppd="visited"></strong></div>
      <button class="ppd-share" data-ppd="share"></button>
    </div>
  </article>`;
document.getElementById('game').appendChild(postcardScreen);

const ppdEls = Object.fromEntries([...postcardScreen.querySelectorAll('[data-ppd]')].map((el) => [el.dataset.ppd, el]));
const PPD_EASE = 'cubic-bezier(.2,.9,.25,1)';
let ppdSource = null; // the grid card the open postcard came from
let ppdOpening = null; // the open animations while they run
let ppdClosing = false;
let ppdEntry = null; // the passport entry on show

function longDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fillPostcard(entry) {
  const { item } = entry;
  const earn = EARN_NAMES[entry.earned] || 'seen';
  const rarity = rarityFor(item.difficulty);
  ppdEls.card.dataset.earn = earn;
  applyCardTier(ppdEls.card, item, entry.earned);
  // Unearned cards still advertise their rarity in the detail view.
  ppdEls.card.classList.add(`rarity-${rarity}`);
  ppdEls.rarity.textContent = rarity.toUpperCase();
  ppdEls.difficulty.textContent = String(item.difficulty || 5);
  ppdEls.photo.replaceChildren();
  if (item.image) {
    const img = document.createElement('img');
    img.src = item.image;
    img.alt = item.short || item.clue || '';
    img.decoding = 'async';
    img.addEventListener('error', () => img.remove(), { once: true });
    ppdEls.photo.append(img);
  }
  setProxBadge(ppdEls.photo, entry.earned, 'large');
  ppdEls.from.textContent = `Postcard from ${entry.continent || 'Earth'}`;
  const flag = (item.clue || '').match(FLAG_RE);
  const short = item.short || item.clue || '';
  ppdEls.name.textContent = `${short}${flag ? ` ${flag[0]}` : ''}`;
  const clue = (item.clue || '').replace(FLAG_RE, '').trim();
  ppdEls.clue.textContent = clue;
  ppdEls.clue.hidden = !clue || clue === short;
  ppdEls.fact.textContent = item.fact || '';
  ppdEls.fact.hidden = !item.fact;
  ppdEls.achievement.textContent = { pinpoint: 'Pinpoint', bullseye: 'Bullseye', near: 'Postcard', seen: 'Postcard' }[earn];
  const history = [
    ['Postcard', entry.tierDates[1]],
    ['Bullseye', entry.tierDates[2]],
    ['Pinpoint', entry.tierDates[3]],
  ].filter(([, date]) => date);
  ppdEls.history.replaceChildren(...history.map(([tier, date]) => {
    const row = document.createElement('span');
    row.textContent = `${tier} • ${shortDate(date)}`;
    return row;
  }));
  ppdEls.history.hidden = history.length === 0;
  const cells = [
    ['Best score', `${entry.best}<small> /1000</small>`],
    ['Closest guess', Number.isFinite(entry.km) ? `${entry.km.toLocaleString()}<small> km</small>` : ''],
  ];
  ppdEls.stats.replaceChildren(...cells.map(([label, value, t]) => {
    const div = document.createElement('div');
    if (t) div.dataset.tier = t;
    div.innerHTML = `<dt>${label}</dt><dd>${value}</dd>`;
    return div;
  }));
  ppdEls.hint.hidden = earn !== 'seen';
  ppdEls.hint.textContent = 'Land within 150 km to earn this postcard in colour.';
  ppdEls.visited.textContent = entry.first ? longDate(entry.first) : '';
  // Only a postcard with a known closest guess has a distance to brag about.
  ppdEntry = entry;
  clearTimeout(ppdCopiedTimer);
  ppdEls.share.hidden = !Number.isFinite(entry.km);
  ppdEls.share.textContent = SHARE_LABEL;
}

// Keyframe for the detail card sitting exactly over the grid card: scaled down
// to its width from the top-left corner, and clipped to its height.
function postcardFlipFrame(source) {
  const from = source.getBoundingClientRect();
  const to = ppdEls.card.getBoundingClientRect();
  if (!from.width || from.bottom < 0 || from.top > window.innerHeight) return null;
  const s = from.width / to.width;
  const clip = Math.max(0, to.height - from.height / s);
  return {
    transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${s})`,
    clipPath: `inset(0 0 ${clip}px 0 round ${4 / s}px)`,
  };
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function openPostcard(entry, source) {
  if (!postcardScreen.hidden) return;
  fillPostcard(entry);
  ppdSource = source;
  postcardScreen.hidden = false;
  postcardScreen.scrollTop = 0;
  // Restore stamp visibility (hidden on close to prevent FLIP glitch)
  if (ppdEls.stamp) ppdEls.stamp.style.opacity = '';
  const flip = reducedMotion() ? null : postcardFlipFrame(source);
  source.classList.add('pp-lifted');
  ppdEls.close.focus({ preventScroll: true });
  const anims = [
    ppdEls.scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' }),
    flip
      ? ppdEls.card.animate([flip, { transform: 'none', clipPath: 'inset(0 0 0px 0 round 0px)' }], { duration: 440, easing: PPD_EASE })
      : ppdEls.card.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: reducedMotion() ? 160 : 300, easing: PPD_EASE }),
    ppdEls.close.animate([{ opacity: 0 }, { opacity: 0, offset: .6 }, { opacity: 1 }], { duration: 440 }),
  ];
  ppdOpening = anims;
  anims[1].finished.then(() => { if (ppdOpening === anims) ppdOpening = null; }, () => {});
}

function hidePostcard(source) {
  postcardScreen.hidden = true;
  ppdClosing = false;
  ppdSource = null;
  if (source) {
    source.classList.remove('pp-lifted');
    if (source.isConnected) source.focus({ preventScroll: true });
  }
}

function closePostcard() {
  if (ppdClosing || postcardScreen.hidden) return;
  ppdClosing = true;
  const source = ppdSource;
  // Hide the modal stamp immediately so it doesn't glitch during the FLIP close animation
  if (ppdEls.stamp) ppdEls.stamp.style.opacity = '0';
  // Closed mid-open: play the opening backwards from where it got to rather
  // than snapping to the end first.
  if (ppdOpening) {
    const anims = ppdOpening;
    ppdOpening = null;
    anims.forEach((a) => { a.effect.updateTiming({ fill: 'both' }); a.reverse(); });
    anims[1].finished.catch(() => {}).finally(() => {
      hidePostcard(source);
      anims.forEach((a) => a.cancel());
    });
    return;
  }
  const flip = reducedMotion() || !source?.isConnected ? null : postcardFlipFrame(source);
  const opts = { duration: flip ? 360 : 220, easing: flip ? PPD_EASE : 'ease-in', fill: 'forwards' };
  const anims = [
    ppdEls.scrim.animate([{ opacity: 1 }, { opacity: 0 }], opts),
    flip
      ? ppdEls.card.animate([{ transform: 'none', clipPath: 'inset(0 0 0px 0 round 0px)' }, flip], opts)
      : ppdEls.card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], opts),
    ppdEls.close.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }),
  ];
  anims[1].finished.catch(() => {}).finally(() => {
    hidePostcard(source);
    anims.forEach((a) => a.cancel());
  });
}

ppdEls.close.addEventListener('click', closePostcard);
postcardScreen.addEventListener('click', (e) => {
  if (e.target === postcardScreen || e.target === ppdEls.scrim) closePostcard();
});
// Capture on window so Escape closes the postcard before the passport's own
// Escape handler (on document) can close the whole passport underneath it.
window.addEventListener('keydown', (e) => {
  if (postcardScreen.hidden) return;
  if (e.key === 'Escape') {
    e.stopPropagation();
    closePostcard();
  } else if (e.key === 'Tab') {
    // Close and (when shown) share are the only controls; keep focus between them.
    e.preventDefault();
    const stops = [ppdEls.close, ppdEls.share].filter((el) => !el.hidden);
    const at = stops.indexOf(document.activeElement);
    stops[(at + (e.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
  }
}, true);

// ---------------------------------------------------------------------------
// Share: brag about a postcard. The link is the homepage only, never a
// playable round, so friends land on the daily.
// ---------------------------------------------------------------------------
const HOME_URL = 'https://where-on.earth';
const SHARE_LABEL = '📮 Share this postcard';

function postcardShareText(entry) {
  const place = entry.item.short || (entry.item.clue || '').replace(FLAG_RE, '').trim();
  return `I got within ${Math.round(entry.km).toLocaleString()} km of ${place} on Where on Earth! Can you beat me? ${HOME_URL}`;
}

let ppdCopiedTimer = 0;
ppdEls.share.addEventListener('click', async () => {
  if (!ppdEntry || !Number.isFinite(ppdEntry.km)) return;
  const text = postcardShareText(ppdEntry);
  const button = ppdEls.share;
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
    button.textContent = '✓ Copied';
  } catch {
    window.prompt('Copy this to share:', text); // no clipboard (insecure context, denied)
    return;
  }
  clearTimeout(ppdCopiedTimer);
  ppdCopiedTimer = setTimeout(() => { button.textContent = SHARE_LABEL; }, 1800);
});

passport = readPassport();

locationsP.then((data) => {
  locations = data;
  locationIndex = null;
  loadDaily();
  syncPassport();
  syncDailyButton();
  gameEls.startStreak.textContent = streakText();
  gameEls.play.disabled = false;
  endlessEls.entry.disabled = false;
  gameEls.survivalEntry.disabled = false;
  updateExpeditionEntry();
  passportEntry.disabled = false;
  collectionsEntry.disabled = false;
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
  guess(lat, lng) {
    if (gameMode !== 'guess') throw new Error('A guess is not currently expected');
    activePin = (activePin + 1) % pins.length;
    pins[activePin].drop(latLngToVec3(lat, lng));
    revealGuess({ lat, lng });
  },
  get state() {
    const item = gameMode === 'guess' || gameMode === 'reveal' ? currentItem() : null;
    return { mode: gameMode, daily: JSON.parse(JSON.stringify(daily)), selected: selected.map((x) => ({ ...x })), item: item && item.id, survival: { ...survival, item: survival.item && survival.item.id } };
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
