import test from 'node:test';
import assert from 'node:assert/strict';
import { solveRevealFraming, solveNorthUpRevealFraming, projectUnderView, arcMidpoint } from '../src/globe/reveal-framing.js';

// frameRevealPoints (src/globe/reveal.js) picked between two valid pitch
// solutions by closeness to whatever pitch the camera happened to be left at.
// Both solutions are geometrically exact before PITCH_LIMIT clamps them, but
// clamping can push the "closer" one far from its unclamped solution, landing
// the midpoint at the screen edge instead of the safe strip. This sweeps a
// wide range of leftover pitches/yaws, guess/answer pairs and screen strips
// to prove the fix (score-by-result in solveRevealFraming) always frames both
// pins on screen and the midpoint inside the strip, which the old
// closest-to-current-pitch pick did not.

const DEG = Math.PI / 180;
const FOV = 36;
const PITCH_LIMIT = 75 * DEG;
const SCENE_MIN_DIST = 1.32;

// Same lat/lng -> unit vector convention as src/globe/scene.js#latLngToVec3.
function latLngToVec3(lat, lng) {
  const phi = (lng + 180) * DEG;
  const la = lat * DEG;
  return { x: -Math.cos(phi) * Math.cos(la), y: Math.sin(la), z: Math.sin(phi) * Math.cos(la) };
}

const PAIRS = {
  'transatlantic blowout': [latLngToVec3(42.36, -71.06), latLngToVec3(33.57, -7.59)], // Boston -> Casablanca
  'southern hemisphere': [latLngToVec3(-34.6, -58.38), latLngToVec3(-33.92, 18.42)], // Buenos Aires -> Cape Town
  'close guess': [latLngToVec3(48.8566, 2.3522), latLngToVec3(50.8503, 4.3517)], // Paris -> Brussels, ~264 km
  transpacific: [latLngToVec3(35.68, 139.69), latLngToVec3(34.05, -118.24)], // Tokyo -> Los Angeles
};

const STRIPS = {
  phone: { viewW: 390, viewH: 844, safeTop: 102, safeBottom: 676 },
  desktop: { viewW: 1440, viewH: 900, safeTop: 96, safeBottom: 640 },
};

const PITCHES_DEG = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75];
const YAWS_DEG = [0, 120, 240];

function onScreen(proj, viewW, viewH) {
  return proj.facing && proj.x >= 0 && proj.x <= viewW && proj.y >= 0 && proj.y <= viewH;
}

test('frameRevealPoints solve keeps both pins on screen and the midpoint in the strip for every leftover pitch/yaw', () => {
  let checked = 0;
  for (const [stripName, strip] of Object.entries(STRIPS)) {
    for (const [pairName, [a, b]] of Object.entries(PAIRS)) {
      for (const pitchDeg of PITCHES_DEG) {
        for (const yawDeg of YAWS_DEG) {
          const result = solveRevealFraming({
            a, b, safeTop: strip.safeTop, safeBottom: strip.safeBottom,
            viewW: strip.viewW, viewH: strip.viewH, fov: FOV, deg: DEG,
            pitchLimit: PITCH_LIMIT, sceneMinDist: SCENE_MIN_DIST,
            currentYaw: yawDeg * DEG, currentPitch: pitchDeg * DEG,
          });
          const ctx = `${stripName}/${pairName} startPitch=${pitchDeg} startYaw=${yawDeg}`;

          const projA = projectUnderView(a, result.yaw, result.pitch, result.dist, strip.viewW, strip.viewH, FOV, DEG);
          const projB = projectUnderView(b, result.yaw, result.pitch, result.dist, strip.viewW, strip.viewH, FOV, DEG);
          assert.ok(onScreen(projA, strip.viewW, strip.viewH), `guess pin off screen or behind the limb: ${ctx} -> ${JSON.stringify(projA)}`);
          assert.ok(onScreen(projB, strip.viewW, strip.viewH), `answer pin off screen or behind the limb: ${ctx} -> ${JSON.stringify(projB)}`);

          const midpoint = arcMidpoint(a, b);
          const projMid = projectUnderView(midpoint, result.yaw, result.pitch, result.dist, strip.viewW, strip.viewH, FOV, DEG);
          assert.ok(projMid.facing, `midpoint behind the limb: ${ctx} -> ${JSON.stringify(projMid)}`);
          assert.ok(
            projMid.y >= strip.safeTop && projMid.y <= strip.safeBottom,
            `midpoint outside the strip: ${ctx} y=${projMid.y.toFixed(1)} strip=[${strip.safeTop},${strip.safeBottom}]`,
          );
          checked++;
        }
      }
    }
  }
  // 2 strips * 4 pairs * 11 pitches * 3 yaws
  assert.equal(checked, 264);
});

// frameNorthUpRevealPoints (src/globe/reveal.js) preserved the player's pitch
// unconditionally and only rotated yaw to center the arc midpoint, with
// distance from the same closed-form fit frameRevealPoints uses. That fit
// assumes the two points land symmetrically around the screen center, which
// only holds when the preserved pitch happens to put the connecting arc
// there; at other pitches, or at high latitude, a pin can land above the
// strip, behind the header, past the limb, or off-screen. These cases FAIL
// against that old behavior (reproduced inline below as oldNorthUpFraming,
// matching the pre-fix frameNorthUpRevealPoints math) and PASS against
// solveNorthUpRevealFraming, at phone viewport 390x844.
const PHONE = STRIPS.phone;
const NU_CLEARANCE = {
  xMin: 28, xMax: PHONE.viewW - 28,
  yMin: PHONE.safeTop + 36, yMax: PHONE.safeBottom - 10,
};

function oldNorthUpFraming(a, b, currentYaw, currentPitch) {
  const safeY = (PHONE.safeTop + PHONE.safeBottom) / 2;
  const safeRadius = Math.max(40, Math.min(PHONE.viewW / 2 - 28, safeY - PHONE.safeTop, PHONE.safeBottom - safeY));
  const dot3 = (u, v) => u.x * v.x + u.y * v.y + u.z * v.z;
  const clamp3 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const nearAngle3 = (x, y) => x + Math.round((y - x) / (2 * Math.PI)) * 2 * Math.PI;
  const separation = Math.acos(clamp3(dot3(a, b), -1, 1));
  const halfAngle = Math.min(84 * DEG, separation / 2 + 4 * DEG);
  const screenSlope = (safeRadius / (PHONE.viewH / 2)) * Math.tan((FOV / 2) * DEG);
  const screenFit = Math.cos(halfAngle) + Math.sin(halfAngle) / Math.max(screenSlope, 0.02);
  const horizonFit = halfAngle < Math.PI / 2 ? 1 / Math.max(Math.cos(halfAngle), 0.04) : 14;
  const dist = clamp3(Math.max(screenFit, horizonFit) * 1.04, SCENE_MIN_DIST, 14);
  let m = { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  const len = Math.hypot(m.x, m.y, m.z);
  m = len * len < 1e-8 ? { x: -a.z, y: 0, z: a.x } : { x: m.x / len, y: m.y / len, z: m.z / len };
  const yaw = nearAngle3(Math.atan2(-m.x, m.z), currentYaw);
  return { yaw, pitch: currentPitch, dist };
}

function inClearance(proj) {
  return proj.facing
    && proj.x >= NU_CLEARANCE.xMin && proj.x <= NU_CLEARANCE.xMax
    && proj.y >= NU_CLEARANCE.yMin && proj.y <= NU_CLEARANCE.yMax;
}

const NU_CASES = {
  // (a) equatorial guess vs a high-north answer at a shallow preserved pitch.
  'equatorial guess vs high-north answer': {
    a: latLngToVec3(2, -10), b: latLngToVec3(78, 40), currentYaw: 0, currentPitch: 5 * DEG,
  },
  // (b) both points at high latitude.
  'both points at high latitude': {
    a: latLngToVec3(70, -100), b: latLngToVec3(82, 60), currentYaw: 0.5, currentPitch: -10 * DEG,
  },
  // (c) a near-antipodal pair (~141 degrees apart).
  'near-antipodal pair': {
    a: latLngToVec3(-20, 10), b: latLngToVec3(-10, -145), currentYaw: 0, currentPitch: -70 * DEG,
  },
  // (d) the preserved pitch already frames both pins; must be kept exactly.
  'preserved pitch already works': {
    a: latLngToVec3(10, 0), b: latLngToVec3(-5, 15), currentYaw: 0, currentPitch: 0,
  },
};

test('solveNorthUpRevealFraming cases fail under the old closed-form pitch-preserving fit', () => {
  for (const [name, { a, b, currentYaw, currentPitch }] of Object.entries(NU_CASES)) {
    const old = oldNorthUpFraming(a, b, currentYaw, currentPitch);
    const projA = projectUnderView(a, old.yaw, old.pitch, old.dist, PHONE.viewW, PHONE.viewH, FOV, DEG);
    const projB = projectUnderView(b, old.yaw, old.pitch, old.dist, PHONE.viewW, PHONE.viewH, FOV, DEG);
    if (name === 'preserved pitch already works') {
      assert.ok(inClearance(projA) && inClearance(projB), `${name}: expected the old fit to already work`);
    } else {
      assert.ok(!inClearance(projA) || !inClearance(projB), `${name}: expected the old fit to fail, but both pins landed in clearance`);
    }
  }
});

test('solveNorthUpRevealFraming keeps both pins in clearance, facing, north-up, for every case', () => {
  for (const [name, { a, b, currentYaw, currentPitch }] of Object.entries(NU_CASES)) {
    const result = solveNorthUpRevealFraming({
      a, b, safeTop: PHONE.safeTop, safeBottom: PHONE.safeBottom,
      viewW: PHONE.viewW, viewH: PHONE.viewH, fov: FOV, deg: DEG,
      pitchLimit: PITCH_LIMIT, sceneMinDist: SCENE_MIN_DIST, currentYaw, currentPitch,
    });
    assert.ok(result.dist >= SCENE_MIN_DIST && result.dist <= 14, `${name}: dist out of range -> ${result.dist}`);
    assert.ok(Math.abs(result.pitch) <= PITCH_LIMIT + 1e-9, `${name}: pitch exceeds PITCH_LIMIT -> ${result.pitch}`);

    const projA = projectUnderView(a, result.yaw, result.pitch, result.dist, PHONE.viewW, PHONE.viewH, FOV, DEG);
    const projB = projectUnderView(b, result.yaw, result.pitch, result.dist, PHONE.viewW, PHONE.viewH, FOV, DEG);
    assert.ok(inClearance(projA), `${name}: guess pin outside clearance -> ${JSON.stringify(projA)}`);
    assert.ok(inClearance(projB), `${name}: answer pin outside clearance -> ${JSON.stringify(projB)}`);

    if (name === 'preserved pitch already works') {
      assert.equal(result.pitch, currentPitch, `${name}: pitch must be preserved exactly`);
    }
  }
});
