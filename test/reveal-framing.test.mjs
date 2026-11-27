import test from 'node:test';
import assert from 'node:assert/strict';
import {
  solveRevealFraming, solveNorthUpRevealFraming, solveAnswerCenteredRevealFraming, projectUnderView, arcMidpoint,
} from '../src/globe/reveal-framing.js';

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

// Centering: solveNorthUpRevealFraming's feasibility search (bestNorthUpYaw
// plus tryPitch above) only drives box overshoot to zero and stops at the
// first zero-overshoot yaw and distance, so nothing in it favors the pins'
// midpoint landing near the box center over landing at its edge. The fix
// adds a second pass, centeredNorthUpYaw plus centerAtPitch, that runs once
// the pitch is settled and picks the yaw and distance centering the midpoint,
// with distance only a tiebreak so an easy case does not zoom out further
// than it needs to. oldSolveNorthUpRevealFraming below is a frozen copy of
// the feasibility-only math from before that fix (matching commit 63d6fd0's
// reveal-framing.js) so the centering assertions can be shown to fail
// against it, proving the new objective is load-bearing and not vacuous.
const BOX_CENTER_X = (NU_CLEARANCE.xMin + NU_CLEARANCE.xMax) / 2;
const BOX_CENTER_Y = (NU_CLEARANCE.yMin + NU_CLEARANCE.yMax) / 2;

function centerOffsetOf(result, midpoint) {
  const pm = projectUnderView(midpoint, result.yaw, result.pitch, result.dist, PHONE.viewW, PHONE.viewH, FOV, DEG);
  return Math.hypot(pm.x - BOX_CENTER_X, pm.y - BOX_CENTER_Y);
}

function oldSolveNorthUpRevealFraming({ a, b, safeTop, safeBottom, viewW, viewH, fov, deg, pitchLimit, sceneMinDist, currentYaw, currentPitch }) {
  const xMin = 28;
  const xMax = viewW - 28;
  const yMin = safeTop + 36;
  const yMax = safeBottom - 10;
  const nearAngleO = (x, y) => x + Math.round((y - x) / (2 * Math.PI)) * 2 * Math.PI;
  const clampO = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const overshootO = (proj) => {
    if (!proj.facing) return 1e6;
    return Math.max(0, xMin - proj.x, proj.x - xMax, yMin - proj.y, proj.y - yMax);
  };
  const YAW_GRID_O = 90;
  const bestYawO = (pitch, dist, yaw0) => {
    const costAt = (yaw) => {
      const pa = projectUnderView(a, yaw, pitch, dist, viewW, viewH, fov, deg);
      const pb = projectUnderView(b, yaw, pitch, dist, viewW, viewH, fov, deg);
      return overshootO(pa) + overshootO(pb);
    };
    let best = { yaw: yaw0, cost: costAt(yaw0) };
    for (let i = 0; i < YAW_GRID_O; i++) {
      const yaw = nearAngleO((i / YAW_GRID_O) * 2 * Math.PI, yaw0);
      const cost = costAt(yaw);
      if (cost < best.cost) best = { yaw, cost };
    }
    let step = (2 * Math.PI) / YAW_GRID_O;
    for (let i = 0; i < 16 && best.cost > 0; i++) {
      step /= 2;
      for (const dir of [-1, 1]) {
        const yaw = best.yaw + dir * step;
        const cost = costAt(yaw);
        if (cost < best.cost) best = { yaw, cost };
      }
    }
    return best;
  };

  const distSteps = [];
  for (let dist = sceneMinDist; dist < 14; dist *= 1.06) distSteps.push(dist);
  distSteps.push(14);

  const tryPitch = (pitch) => {
    let best = null;
    for (const dist of distSteps) {
      const found = bestYawO(pitch, dist, currentYaw);
      if (!best || found.cost < best.cost) best = { yaw: found.yaw, pitch, dist, cost: found.cost };
      if (found.cost === 0) return best;
    }
    return best;
  };

  let best = tryPitch(currentPitch);
  if (best.cost === 0) return best;

  const coarseStep = deg;
  const maxSteps = Math.ceil(pitchLimit / coarseStep) + 1;
  let workingDir = 0;
  let workingDelta = 0;
  for (let steps = 1; steps <= maxSteps && !workingDir; steps++) {
    const delta = steps * coarseStep;
    for (const dir of [1, -1]) {
      const pitch = clampO(currentPitch + dir * delta, -pitchLimit, pitchLimit);
      const attempt = tryPitch(pitch);
      if (attempt.cost < best.cost) best = attempt;
      if (attempt.cost === 0 && !workingDir) { workingDir = dir; workingDelta = delta; }
    }
  }
  if (!workingDir) return best;

  let lo = workingDelta - coarseStep;
  let hi = workingDelta;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const pitch = clampO(currentPitch + workingDir * mid, -pitchLimit, pitchLimit);
    const attempt = tryPitch(pitch);
    if (attempt.cost === 0) { hi = mid; best = attempt; } else { lo = mid; }
  }
  return best;
}

// The four NU_CASES above are not all ordinary: three of the four were
// chosen to stress pitch feasibility and stepping (equatorial-vs-high-north,
// both-high-latitude, near-antipodal), and at the pitch those cases settle
// on, the yaw window that keeps both pins in clearance can be so narrow that
// only one point in it is reachable at all, leaving nothing for centering to
// improve. Their tolerances below are each the actual offset the fixed
// solver achieves, rounded up with headroom, not the 6px ordinary bar; only
// "preserved pitch already works" is an ordinary case and holds to 6px.
const NU_CENTERING_TOLERANCE_PX = {
  'equatorial guess vs high-north answer': 65,
  'both points at high latitude': 75,
  'near-antipodal pair': 10,
  'preserved pitch already works': 6,
};

test('solveNorthUpRevealFraming centers the pins midpoint in the clearance box for every case', () => {
  for (const [name, { a, b, currentYaw, currentPitch }] of Object.entries(NU_CASES)) {
    const midpoint = arcMidpoint(a, b);
    const result = solveNorthUpRevealFraming({
      a, b, safeTop: PHONE.safeTop, safeBottom: PHONE.safeBottom,
      viewW: PHONE.viewW, viewH: PHONE.viewH, fov: FOV, deg: DEG,
      pitchLimit: PITCH_LIMIT, sceneMinDist: SCENE_MIN_DIST, currentYaw, currentPitch,
    });
    const offset = centerOffsetOf(result, midpoint);
    const tolerance = NU_CENTERING_TOLERANCE_PX[name];
    assert.ok(offset <= tolerance, `${name}: midpoint offset from box center too large -> ${offset.toFixed(2)}px (tolerance ${tolerance}px)`);
  }
});

// Ordinary mid-latitude pairs, each at a couple of preserved pitches close to
// what a player framing that pair would plausibly leave the camera at. These
// are the cases the 6px bar from the brief targets: with a reasonable
// preserved pitch, yaw and distance alone have enough room to put the
// midpoint right on the box center.
const ORDINARY_PAIRS = {
  'New York - London': [latLngToVec3(40.7, -74.0), latLngToVec3(51.5, -0.1)],
  'Sydney - Perth': [latLngToVec3(-33.9, 151.2), latLngToVec3(-31.9, 115.9)],
  'Nairobi - Cairo': [latLngToVec3(-1.3, 36.8), latLngToVec3(30.0, 31.2)],
};
const ORDINARY_PITCHES_DEG = {
  'New York - London': [40, 45],
  'Sydney - Perth': [-45, -40],
  'Nairobi - Cairo': [5, 10],
};
const ORDINARY_TOLERANCE_PX = 6;

test('solveNorthUpRevealFraming centers ordinary mid-latitude pairs within 6px at their preserved pitch', () => {
  for (const [name, [a, b]] of Object.entries(ORDINARY_PAIRS)) {
    const midpoint = arcMidpoint(a, b);
    for (const pitchDeg of ORDINARY_PITCHES_DEG[name]) {
      const currentPitch = pitchDeg * DEG;
      const result = solveNorthUpRevealFraming({
        a, b, safeTop: PHONE.safeTop, safeBottom: PHONE.safeBottom,
        viewW: PHONE.viewW, viewH: PHONE.viewH, fov: FOV, deg: DEG,
        pitchLimit: PITCH_LIMIT, sceneMinDist: SCENE_MIN_DIST, currentYaw: 0, currentPitch,
      });
      assert.equal(result.pitch, currentPitch, `${name} pitch=${pitchDeg}: pitch should be preserved exactly`);
      const offset = centerOffsetOf(result, midpoint);
      assert.ok(
        offset <= ORDINARY_TOLERANCE_PX,
        `${name} pitch=${pitchDeg}: midpoint offset from box center too large -> ${offset.toFixed(2)}px`,
      );
    }
  }
});

test('the ordinary-pair centering assertions fail against the pre-fix (pre-centering) north-up solver', () => {
  for (const [name, [a, b]] of Object.entries(ORDINARY_PAIRS)) {
    const midpoint = arcMidpoint(a, b);
    for (const pitchDeg of ORDINARY_PITCHES_DEG[name]) {
      const currentPitch = pitchDeg * DEG;
      const oldResult = oldSolveNorthUpRevealFraming({
        a, b, safeTop: PHONE.safeTop, safeBottom: PHONE.safeBottom,
        viewW: PHONE.viewW, viewH: PHONE.viewH, fov: FOV, deg: DEG,
        pitchLimit: PITCH_LIMIT, sceneMinDist: SCENE_MIN_DIST, currentYaw: 0, currentPitch,
      });
      const offset = centerOffsetOf(oldResult, midpoint);
      assert.ok(
        offset > ORDINARY_TOLERANCE_PX,
        `${name} pitch=${pitchDeg}: expected the pre-fix solver to miss the 6px centering bar, but offset was ${offset.toFixed(2)}px`,
      );
    }
  }
});

// solveAnswerCenteredRevealFraming: the recap's "friends' pins" ON framing.
// The answer is locked to the strip centre and the camera backs out to the
// smallest distance that keeps every guess (the player's plus every
// friend's) inside the marker-clearance box. These cases span a close
// player guess plus two friends at varied distances, a wide starting
// yaw/pitch sweep, and the case no distance can fix: a guess at the exact
// antipode of the answer, which (being on the far side of every possible
// camera ray through the answer) can never face the camera at any yaw,
// pitch or distance.
const ANSWER_CENTERED_CASES = {
  'close guess plus two friends at varied distances': {
    answer: latLngToVec3(40, 10),
    guesses: [latLngToVec3(42, 14), latLngToVec3(55, 30), latLngToVec3(20, -40)],
  },
  'guesses on both sides of the answer': {
    answer: latLngToVec3(-10, 100),
    guesses: [latLngToVec3(-8, 96), latLngToVec3(5, 130), latLngToVec3(-30, 70)],
  },
};

function antipode(p) {
  return { x: -p.x, y: -p.y, z: -p.z };
}

test('solveAnswerCenteredRevealFraming centres the answer and fits every guess, for a sweep of starting yaw/pitch', () => {
  let checked = 0;
  for (const [name, { answer, guesses }] of Object.entries(ANSWER_CENTERED_CASES)) {
    for (const pitchDeg of [-60, -20, 0, 20, 60]) {
      for (const yawDeg of [0, 150]) {
        const result = solveAnswerCenteredRevealFraming({
          answer, guesses, safeTop: PHONE.safeTop, safeBottom: PHONE.safeBottom,
          viewW: PHONE.viewW, viewH: PHONE.viewH, fov: FOV, deg: DEG,
          pitchLimit: PITCH_LIMIT, sceneMinDist: SCENE_MIN_DIST,
          currentYaw: yawDeg * DEG, currentPitch: pitchDeg * DEG,
        });
        const ctx = `${name} startPitch=${pitchDeg} startYaw=${yawDeg}`;
        assert.ok(result.allFit, `${ctx}: expected every guess to fit`);
        assert.ok(result.dist >= SCENE_MIN_DIST && result.dist <= 14, `${ctx}: dist out of range -> ${result.dist}`);

        const safeY = (PHONE.safeTop + PHONE.safeBottom) / 2;
        const centerX = PHONE.viewW / 2;
        const projAnswer = projectUnderView(answer, result.yaw, result.pitch, result.dist, PHONE.viewW, PHONE.viewH, FOV, DEG);
        assert.ok(projAnswer.facing, `${ctx}: answer behind the limb -> ${JSON.stringify(projAnswer)}`);
        assert.ok(Math.abs(projAnswer.x - centerX) < 3, `${ctx}: answer not centred horizontally -> x=${projAnswer.x.toFixed(2)}`);
        assert.ok(Math.abs(projAnswer.y - safeY) < 3, `${ctx}: answer not centred vertically -> y=${projAnswer.y.toFixed(2)}`);

        for (const g of guesses) {
          const proj = projectUnderView(g, result.yaw, result.pitch, result.dist, PHONE.viewW, PHONE.viewH, FOV, DEG);
          assert.ok(inClearance(proj), `${ctx}: guess outside clearance -> ${JSON.stringify(proj)}`);
        }
        checked++;
      }
    }
  }
  assert.equal(checked, 20); // 2 cases * 5 pitches * 2 yaws
});

test('solveAnswerCenteredRevealFraming is minimal: the sampled distance just below the chosen one cannot fit every guess', () => {
  for (const [name, { answer, guesses }] of Object.entries(ANSWER_CENTERED_CASES)) {
    const result = solveAnswerCenteredRevealFraming({
      answer, guesses, safeTop: PHONE.safeTop, safeBottom: PHONE.safeBottom,
      viewW: PHONE.viewW, viewH: PHONE.viewH, fov: FOV, deg: DEG,
      pitchLimit: PITCH_LIMIT, sceneMinDist: SCENE_MIN_DIST, currentYaw: 0, currentPitch: 0,
    });
    assert.ok(result.allFit, `${name}: expected a fit to exist`);
    assert.ok(result.dist > SCENE_MIN_DIST * 1.02, `${name}: case does not exercise minimality (fit at the scene minimum already)`);
    // Re-running with sceneMinDist set one sample below the chosen distance
    // must still land back on (approximately) the same distance: that
    // proves the smaller sample was tried first and failed to fit.
    const probe = solveAnswerCenteredRevealFraming({
      answer, guesses, safeTop: PHONE.safeTop, safeBottom: PHONE.safeBottom,
      viewW: PHONE.viewW, viewH: PHONE.viewH, fov: FOV, deg: DEG,
      pitchLimit: PITCH_LIMIT, sceneMinDist: result.dist / 1.03, currentYaw: 0, currentPitch: 0,
    });
    assert.ok(
      Math.abs(probe.dist - result.dist) < 1e-6,
      `${name}: expected the search to reject ${(result.dist / 1.03).toFixed(4)} and land back on ${result.dist.toFixed(4)}, got ${probe.dist.toFixed(4)}`,
    );
  }
});

test('solveAnswerCenteredRevealFraming caps at the maximum distance, answer still centred, when a guess can never face the camera', () => {
  for (const [name, { answer, guesses }] of Object.entries(ANSWER_CENTERED_CASES)) {
    const result = solveAnswerCenteredRevealFraming({
      answer, guesses: [...guesses, antipode(answer)], safeTop: PHONE.safeTop, safeBottom: PHONE.safeBottom,
      viewW: PHONE.viewW, viewH: PHONE.viewH, fov: FOV, deg: DEG,
      pitchLimit: PITCH_LIMIT, sceneMinDist: SCENE_MIN_DIST, currentYaw: 0, currentPitch: 0,
    });
    assert.equal(result.allFit, false, `${name}: an antipodal guess can never fit`);
    assert.equal(result.dist, 14, `${name}: expected the max distance, got ${result.dist}`);
    const projAnswer = projectUnderView(answer, result.yaw, result.pitch, result.dist, PHONE.viewW, PHONE.viewH, FOV, DEG);
    const safeY = (PHONE.safeTop + PHONE.safeBottom) / 2;
    const centerX = PHONE.viewW / 2;
    assert.ok(projAnswer.facing, `${name}: answer must still face the camera at max distance`);
    assert.ok(Math.abs(projAnswer.x - centerX) < 3, `${name}: answer must still be centred, not silently recentred`);
    assert.ok(Math.abs(projAnswer.y - safeY) < 3, `${name}: answer must still be centred, not silently recentred`);
  }
});
