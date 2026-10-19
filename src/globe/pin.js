// ---------------------------------------------------------------------------
// Pins and view interaction (refactor Phase 5): the pin meshes, placing the
// guess pin, and the drag, fling, pinch and wheel model of the globe view.
// initPin(host) builds the pins and wires the input at the spot these
// sections used to run. The host supplies the Lock in button and the
// post-game review's tap target, which live above the globe, and the reveal
// and outline line materials that resize() keeps at the canvas resolution.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { DEG, FOV, MIN_DIST, PITCH_LIMIT, MAX_SPIN, TAP_MAX_MS, GUESS_TAP_MAX_MS, TAP_MAX_MOVE } from '../core/config.js';
import { clamp } from '../core/math.js';
import { state } from '../core/state.js';
import {
  PIN_COLOR, ANSWER_COLOR, latLngToVec3, vec3ToLatLng, setGlobeQuaternion, canvas, hud, renderer, camera, globe, pointers, radPerPx,
} from './scene.js';
import { outlineMaterials } from './surface.js';

let host = null;
let guessBadgeTex;
let answerBadgeTex;
let capGeometry;
let stemGeometry;
export let pins;
export let correctPin;

// ---------------------------------------------------------------------------
// Pin
// ---------------------------------------------------------------------------
// round (1-5) adds a number disc to the badge for the post-game review
export function makeBadgeTexture(kind, round = 0) {
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

const CAP_RADIUS = 0.075; // angular radius of the pulse rings at zoom scale 1

const REST_H = 0.072;
const DROP_H = 0.34;
export const LAND_T = 0.36;

export class Pin {
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

// Client (CSS px) point -> NDC, relative to the canvas's own box.
export function clientToNdc(clientX, clientY, out) {
  return out.set(((clientX - viewLeft) / state.viewW) * 2 - 1, -((clientY - viewTop) / state.viewH) * 2 + 1);
}

// Globe-local unit normal under a screen point, or null off the globe.
export function globeNormalAt(clientX, clientY) {
  const ndc = clientToNdc(clientX, clientY, new THREE.Vector2());
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  globe.updateMatrixWorld();
  const local = ray.ray.clone().applyMatrix4(globe.matrixWorld.clone().invert());
  const hit = local.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
  return hit ? hit.normalize() : null;
}

// Place (or move) the unconfirmed guess pin under a screen point.
export function placeGuessPin(clientX, clientY) {
  if (!window.__canGuess) return;
  const normal = globeNormalAt(clientX, clientY);
  if (!normal) return; // tapped space, not the globe
  if (state.activePin >= 0) pins[state.activePin].release();
  state.activePin = (state.activePin + 1) % pins.length;
  pins[state.activePin].drop(normal);
  if (navigator.vibrate) navigator.vibrate(8);
  state.pendingGuess = vec3ToLatLng(normal);
  host.showLockButton();
  host.setGuessHint('Tap elsewhere to move it, or lock it in');
}

// ---------------------------------------------------------------------------
// View state and interaction
// ---------------------------------------------------------------------------
// Desktop-globe model: orientation = RX(pitch) * RY(yaw). The polar axis in
// world space is RX(pitch) * (0,1,0), which does not depend on yaw, so the
// globe spins without limit about its own axis and that axis never precesses.
// pitch is the tilt toward the viewer (= latitude at screen centre), clamped
// so you can look down at the poles but north never flips past the top.
// Start centred on lat 20, lng 10, drifting in from a wider view.
export const _home = latLngToVec3(20, 10);
export const HOME_PITCH = 20 * DEG; // load-time tilt; the flyover pullback settles back to it

// nearest equivalent of angle a to reference b (keeps yaw continuous)
export const nearAngle = (a, b) => a + Math.round((b - a) / (2 * Math.PI)) * 2 * Math.PI;

// world-space point on the unit sphere under a screen point, or null
export const _ray = new THREE.Raycaster();
export const _unitSphere = new THREE.Sphere(new THREE.Vector3(), 1);
export function sphereHit(clientX, clientY, out) {
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
export const _D = new THREE.Vector3();
export function solveGrab(L, clientX, clientY) {
  if (!sphereHit(clientX, clientY, _D)) return false;
  const R = Math.hypot(_D.y, _D.z);
  const alpha = Math.atan2(_D.z, _D.y);
  const c = L.y / Math.max(R, 1e-6);
  const spread = Math.acos(clamp(c, -1, 1));
  const p1 = nearAngle(alpha + spread, state.pitch);
  const p2 = nearAngle(alpha - spread, state.pitch);
  const p = Math.abs(p1 - state.pitch) < Math.abs(p2 - state.pitch) ? p1 : p2;
  if (Math.abs(p) > PITCH_LIMIT) return null;
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const mx = _D.x;
  const mz = -_D.y * sp + _D.z * cp; // z-row of RX(-p) D
  state.pitch = p;
  state.yaw = nearAngle(Math.atan2(mx, mz) - Math.atan2(L.x, L.z), state.yaw);
  return Math.abs(c) <= 1;
}

export function computeFit() {
  const aspect = state.viewW / state.viewH;
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
export let viewLeft = 0;
export let viewTop = 0;
export function resize() {
  const r = canvas.getBoundingClientRect();
  viewLeft = r.left;
  viewTop = r.top;
  state.viewW = Math.max(1, r.width || window.innerWidth);
  state.viewH = Math.max(1, r.height || window.innerHeight);
  renderer.setSize(state.viewW, state.viewH, false);
  camera.aspect = state.viewW / state.viewH;
  camera.updateProjectionMatrix();
  const firstRun = state.fitDist === 3 && state.dist === 6;
  state.fitDist = computeFit();
  state.maxDist = state.fitDist * 1.55;
  if (firstRun) {
    state.targetDist = state.fitDist;
    state.dist = state.fitDist * 1.45;
  }
  state.targetDist = clamp(state.targetDist, MIN_DIST, state.maxDist);
  outlineMaterials.forEach((m) => m.resolution.set(state.viewW, state.viewH));
  if (host.answerLineMaterial) host.answerLineMaterial.resolution.set(state.viewW, state.viewH);
  if (host.countryOutline) host.countryOutline.mats.forEach((m) => m.resolution.set(state.viewW, state.viewH));
  if (host.regionOutline) host.regionOutline.mats.forEach((m) => m.resolution.set(state.viewW, state.viewH));
}

// Zoom scales altitude, not distance from the centre: map scale goes with
// altitude, so a pinch or wheel notch feels the same at any depth instead of
// slamming through the last few hundred km near MIN_DIST.
const zoomTo = (from, factor) => clamp(1 + (from - 1) * factor, MIN_DIST, state.maxDist);

let samples = []; // recent {t, yaw, pitch} while dragging, for release velocity
let tap = null;
export let pinch = null;
let grab = null; // globe-local point held under the finger centroid
let grabWorld = null; // the same point in world space, or null off the globe
let dragAt = null; // centroid already applied to the view
let interacted = false;
const _inv = new THREE.Quaternion();

function markInteraction() {
  state.lastInteraction = performance.now();
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
  setGlobeQuaternion(globe, state.yaw, state.pitch);
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
  const g = grabWorld ? Math.cos(state.pitch) * grabWorld.z - Math.sin(state.pitch) * grabWorld.y : 1;
  state.yaw += ((c.x - dragAt.x) * k * g) / Math.max(g * g, 0.35 * 0.35);
  state.pitch = clamp(state.pitch + (c.y - dragAt.y) * k, -PITCH_LIMIT, PITCH_LIMIT);
  grabAt(c.x, c.y);
}

function resetAnchor() {
  const c = centroid();
  grabAt(c.x, c.y);
  samples = [{ t: performance.now(), yaw: state.yaw, pitch: state.pitch }];
  pinch = pointers.size >= 2 ? { span: pinchSpan(), dist: state.targetDist } : null;
}

// Move the view so the grabbed point follows the finger centroid. Runs on
// pointer moves and every frame (a pinch zoom shifts the mapping between moves).
export function applyDrag() {
  const c = centroid();
  // At the limit the exact solve can still hold a point by whirling yaw about
  // the nearby pole, so stay on screen deltas until the drag tilts back off it.
  if (grab && Math.abs(state.pitch) < PITCH_LIMIT) {
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
  samples.push({ t: now, yaw: state.yaw, pitch: state.pitch });
  while (samples.length > 2 && now - samples[0].t > 90) samples.shift();
}

// Pins, the starting view, and every input listener, in their original order.
export function initPin(main) {
  host = main;
  guessBadgeTex = makeBadgeTexture('guess');
  answerBadgeTex = makeBadgeTexture('answer');
  capGeometry = new THREE.SphereGeometry(1.0025, 72, 18, 0, Math.PI * 2, 0, 0.25);
  stemGeometry = new THREE.CylinderGeometry(0.0026, 0.0026, 1, 8, 1, true).translate(0, 0.5, 0);
  pins = [new Pin(), new Pin()];
  pins.forEach((p) => globe.add(p.root));
  correctPin = new Pin({ color: ANSWER_COLOR, badge: answerBadgeTex, answer: true });
  globe.add(correctPin.root);
  state.yaw = Math.atan2(-_home.x, _home.z); // yaw facing lng 10
  state.pitch = HOME_PITCH;
  window.addEventListener('resize', resize);
  // The canvas box can change without a window resize (iOS toolbar, rotation settle).
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  resize();
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    state.revealView = null; // the reveal starts framed, but remains freely explorable
    state.vYaw = state.vPitch = 0; // grab stops the spin, and the idle drift with it
    state.autoSpin = 0;
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
      state.targetDist = clamp(want, MIN_DIST, state.maxDist);
      // Past a limit, re-base so reversing the pinch responds immediately.
      if (state.targetDist !== want) pinch = { span, dist: state.targetDist };
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
      if (tap && e.type === 'pointerup' && state.gameMode === 'guess' && now - tap.t < GUESS_TAP_MAX_MS) {
        if (!host.nearLockButton(e.clientX, e.clientY) && !host.nearTopUI(e.clientX, e.clientY)) placeGuessPin(e.clientX, e.clientY);
      } else if (tap && e.type === 'pointerup' && now - tap.t < TAP_MAX_MS) {
        if (state.gameMode === 'review') host.pickReviewRound(e.clientX, e.clientY);
      } else if (samples.length >= 2) {
        // fling: carry the view's own angular velocity over the last ~90 ms
        const last = samples[samples.length - 1];
        const first = samples[0];
        const dt = (last.t - first.t) / 1000;
        if (now - last.t < 60 && dt > 0.008) {
          state.vYaw = clamp((last.yaw - first.yaw) / dt, -MAX_SPIN, MAX_SPIN);
          state.vPitch = clamp((last.pitch - first.pitch) / dt, -MAX_SPIN, MAX_SPIN);
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
      state.targetDist = zoomTo(state.targetDist, Math.exp(e.deltaY * unit));
      markInteraction();
    },
    { passive: false }
  );
  // iOS Safari page-zoom gestures
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) =>
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false })
  );
}
