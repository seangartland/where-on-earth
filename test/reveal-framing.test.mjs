import test from 'node:test';
import assert from 'node:assert/strict';
import { solveRevealFraming, projectUnderView, arcMidpoint } from '../src/globe/reveal-framing.js';

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
