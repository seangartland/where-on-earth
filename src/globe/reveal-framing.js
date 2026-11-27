// ---------------------------------------------------------------------------
// Pure geometry for the reveal camera framing solve used by frameRevealPoints
// (src/globe/reveal.js): given the two globe-local answer/guess points, where
// to put yaw/pitch/distance so their midpoint lands in the on-screen strip.
// No DOM, no three.js, no module-level state - every input is a parameter -
// so this can be exercised directly by test/reveal-framing.test.mjs as well
// as by the live game.
// ---------------------------------------------------------------------------
const nearAngle = (a, b) => a + Math.round((b - a) / (2 * Math.PI)) * 2 * Math.PI;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const normalize = (v) => {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

// Midpoint of the shortest arc between unit vectors a and b: the normalized
// vector sum, or a x (0,1,0) when a and b are antipodal (matches reveal.js's
// fallback elsewhere for the vanishingly rare exact-antipodal case).
export function arcMidpoint(a, b) {
  const sum = { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  if (sum.x * sum.x + sum.y * sum.y + sum.z * sum.z < 1e-8) {
    return normalize({ x: -a.z, y: 0, z: a.x });
  }
  return normalize(sum);
}

// Nearest intersection (along the ray's forward direction) of the ray from
// (0, 0, dist) in direction dir with the unit sphere at the origin; the same
// hit THREE.Ray#intersectSphere returns for a ray that starts outside the
// sphere and points through it.
function raySphereNear(dist, dir) {
  const b = 2 * dist * dir.z; // 2 * origin.dot(dir), origin = (0, 0, dist)
  const c = dist * dist - 1;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / 2;
  const t2 = (-b + sq) / 2;
  const t = t1 >= 0 ? t1 : t2;
  if (t < 0) return null;
  return { x: t * dir.x, y: t * dir.y, z: dist + t * dir.z };
}

function rotateY(v, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: c * v.x + s * v.z, y: v.y, z: -s * v.x + c * v.z };
}
function rotateX(v, pitch) {
  const c = Math.cos(pitch), s = Math.sin(pitch);
  return { x: v.x, y: c * v.y - s * v.z, z: s * v.y + c * v.z };
}

// Screen position (and whether it faces the camera) of a globe-local point
// under the globe orientation RX(pitch) * RY(yaw), with the camera at
// (0, 0, dist) looking down -Z. Mirrors the projection math homeRevealView
// already uses (reveal.js) for the same camera model.
export function projectUnderView(point, yaw, pitch, dist, viewW, viewH, fov, deg) {
  const p = rotateX(rotateY(point, yaw), pitch);
  const tanV = Math.tan((fov / 2) * deg);
  const aspect = viewW / viewH;
  const depth = dist - p.z;
  const facing = (dist * p.z - 1) / Math.hypot(p.x, p.y, depth) >= 0.25; // in front of the limb
  const x = (0.5 + p.x / (depth * tanV * aspect) / 2) * viewW;
  const y = (0.5 - p.y / (depth * tanV) / 2) * viewH;
  return { x, y, facing };
}

// The reveal camera framing solve: distance to fit both points (plus
// clearance) in the strip, then yaw/pitch putting their midpoint at the
// strip's vertical centre. Two (yaw, pitch) pairs solve the midpoint
// placement exactly; PITCH_LIMIT can clamp one of them far from its unclamped
// solution, so candidates are scored by where their midpoint actually lands
// post-clamp (facing the camera, closest to the strip centre) rather than by
// closeness to wherever the camera was last pointed.
export function solveRevealFraming({
  a, b, safeTop, safeBottom, viewW, viewH, fov, deg, pitchLimit, sceneMinDist,
  currentYaw, currentPitch,
}) {
  const safeY = (safeTop + safeBottom) / 2;
  const safeRadius = Math.max(40, Math.min(viewW / 2 - 28, safeY - safeTop, safeBottom - safeY));
  const separation = Math.acos(clamp(dot(a, b), -1, 1));
  const halfAngle = Math.min(84 * deg, separation / 2 + 4 * deg);
  const screenSlope = (safeRadius / (viewH / 2)) * Math.tan((fov / 2) * deg);
  const screenFit = Math.cos(halfAngle) + Math.sin(halfAngle) / Math.max(screenSlope, 0.02);
  const horizonFit = halfAngle < Math.PI / 2 ? 1 / Math.max(Math.cos(halfAngle), 0.04) : 14;
  const dist = clamp(Math.max(screenFit, horizonFit) * 1.04, sceneMinDist, 14);

  const midpoint = arcMidpoint(a, b);

  const ndcY = 1 - (safeY / viewH) * 2;
  const tanV = Math.tan((fov / 2) * deg);
  const dir = normalize({ x: 0, y: ndcY * tanV, z: -1 });
  const target = raySphereNear(dist, dir) || { x: 0, y: 0, z: 1 };

  const R = Math.hypot(target.y, target.z);
  const alpha = Math.atan2(target.z, target.y);
  const spread = Math.acos(clamp(midpoint.y / Math.max(R, 1e-6), -1, 1));

  const centerX = viewW / 2;
  let best = null;
  for (const raw of [alpha + spread, alpha - spread]) {
    const pitch = clamp(nearAngle(raw, currentPitch), -pitchLimit, pitchLimit);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const mx = target.x;
    const mz = -target.y * sp + target.z * cp;
    const yaw = nearAngle(Math.atan2(mx, mz) - Math.atan2(midpoint.x, midpoint.z), currentYaw);
    const proj = projectUnderView(midpoint, yaw, pitch, dist, viewW, viewH, fov, deg);
    const score = (proj.facing ? 0 : 1e6) + Math.abs(proj.y - safeY) + Math.abs(proj.x - centerX);
    if (!best || score < best.score) best = { yaw, pitch, score };
  }
  return { yaw: best.yaw, pitch: best.pitch, dist };
}

// Cost of a projected point relative to the marker-clearance box: 0 inside
// (and facing), otherwise the largest single-axis overshoot. Summed over both
// points this is the objective solveNorthUpRevealFraming drives to zero.
function boxOvershoot(proj, xMin, xMax, yMin, yMax) {
  if (!proj.facing) return 1e6;
  return Math.max(0, xMin - proj.x, proj.x - xMax, yMin - proj.y, proj.y - yMax);
}

const YAW_GRID = 90;

// Best yaw (coarse grid plus local bisection) for a fixed pitch and dist:
// minimizes the combined box overshoot of both points. Yaw is the only axis
// north-up framing is free to spin at a fixed pitch, since rotateX leaves x
// untouched, so this is the north-up analogue of the yaw+pitch search
// solveRevealFraming does for the flyover camera.
function bestNorthUpYaw(a, b, pitch, dist, currentYaw, viewW, viewH, fov, deg, xMin, xMax, yMin, yMax) {
  const costAt = (yaw) => {
    const pa = projectUnderView(a, yaw, pitch, dist, viewW, viewH, fov, deg);
    const pb = projectUnderView(b, yaw, pitch, dist, viewW, viewH, fov, deg);
    return boxOvershoot(pa, xMin, xMax, yMin, yMax) + boxOvershoot(pb, xMin, xMax, yMin, yMax);
  };
  let best = { yaw: currentYaw, cost: costAt(currentYaw) };
  for (let i = 0; i < YAW_GRID; i++) {
    const yaw = nearAngle((i / YAW_GRID) * 2 * Math.PI, currentYaw);
    const cost = costAt(yaw);
    if (cost < best.cost) best = { yaw, cost };
  }
  let step = (2 * Math.PI) / YAW_GRID;
  for (let i = 0; i < 16 && best.cost > 0; i++) {
    step /= 2;
    for (const dir of [-1, 1]) {
      const yaw = best.yaw + dir * step;
      const cost = costAt(yaw);
      if (cost < best.cost) best = { yaw, cost };
    }
  }
  return best;
}

// Best yaw at a fixed pitch and dist among yaws with zero box overshoot, for
// the one whose projected midpoint lands closest to the clearance box center.
// Same grid-plus-bisection shape as bestNorthUpYaw, but any non-fitting yaw
// always scores above every fitting one (so centering never trades away
// clearance), and refinement keeps going once a fit is found, since centering
// is the next objective rather than a stopping condition.
function centeredNorthUpYaw(a, b, midpoint, pitch, dist, currentYaw, viewW, viewH, fov, deg, xMin, xMax, yMin, yMax, centerX, centerY) {
  const scoreAt = (yaw) => {
    const pa = projectUnderView(a, yaw, pitch, dist, viewW, viewH, fov, deg);
    const pb = projectUnderView(b, yaw, pitch, dist, viewW, viewH, fov, deg);
    const overshoot = boxOvershoot(pa, xMin, xMax, yMin, yMax) + boxOvershoot(pb, xMin, xMax, yMin, yMax);
    if (overshoot > 0) return 1e6 + overshoot;
    const pm = projectUnderView(midpoint, yaw, pitch, dist, viewW, viewH, fov, deg);
    return Math.hypot(pm.x - centerX, pm.y - centerY);
  };
  let best = { yaw: currentYaw, score: scoreAt(currentYaw) };
  for (let i = 0; i < YAW_GRID; i++) {
    const yaw = nearAngle((i / YAW_GRID) * 2 * Math.PI, currentYaw);
    const score = scoreAt(yaw);
    if (score < best.score) best = { yaw, score };
  }
  let step = (2 * Math.PI) / YAW_GRID;
  for (let i = 0; i < 16; i++) {
    step /= 2;
    for (const dir of [-1, 1]) {
      const yaw = best.yaw + dir * step;
      const score = scoreAt(yaw);
      if (score < best.score) best = { yaw, score };
    }
  }
  return best;
}

// Centering improves with distance almost everywhere on this camera model
// (a farther-back view gives yaw more room to carry the midpoint toward the
// box center before either pin falls out of clearance), so chasing the
// lowest possible offset without a stopping point would zoom out to the
// distance ladder's top rung on nearly every reveal, trading away the
// solver's distance character for pixels of centering nobody would notice.
// CENTER_TOLERANCE_PX is the "good enough" bar from the brief: the smallest
// distance that already lands the midpoint within it is kept, matching the
// fitted solve's own distance. Only when no distance on the ladder reaches
// that bar does this fall back to whichever distance centers best, since
// centering still outranks distance when nothing "good enough" exists.
const CENTER_TOLERANCE_PX = 6;

// Given a pitch already known to admit a fitting yaw+distance, scans the same
// distance ladder the feasibility search uses for the (yaw, dist) that lands
// the midpoint in the box center, preferring the smallest distance that is
// within CENTER_TOLERANCE_PX and otherwise the smallest offset found.
function centerAtPitch(a, b, midpoint, pitch, distSteps, currentYaw, viewW, viewH, fov, deg, xMin, xMax, yMin, yMax, centerX, centerY) {
  let best = null;
  for (const dist of distSteps) {
    const found = centeredNorthUpYaw(a, b, midpoint, pitch, dist, currentYaw, viewW, viewH, fov, deg, xMin, xMax, yMin, yMax, centerX, centerY);
    if (!best || found.score < best.score - 1e-6) best = { yaw: found.yaw, pitch, dist, score: found.score };
    if (best.score <= CENTER_TOLERANCE_PX) break;
  }
  return best;
}

// The north-up reveal camera framing solve: yaw rotates the globe around its
// polar axis only (zero roll, north stays up), pitch is preserved from
// whatever the player left the camera at whenever a yaw+distance solution
// exists that fits both points inside the marker-clearance box, facing the
// camera. Only when no such solution exists at the preserved pitch does this
// step the pitch toward a working one, by the smallest amount that works.
// Once the pitch is settled (preserved or stepped), a second pass at that one
// pitch picks the yaw+distance centering the pins' midpoint in the box,
// since the feasibility search above only has to find any fit, not the
// best-centered one.
export function solveNorthUpRevealFraming({
  a, b, safeTop, safeBottom, viewW, viewH, fov, deg, pitchLimit, sceneMinDist,
  currentYaw, currentPitch,
}) {
  const xMin = 28;
  const xMax = viewW - 28;
  const yMin = safeTop + 36;
  const yMax = safeBottom - 10;
  const centerX = (xMin + xMax) / 2;
  const centerY = (yMin + yMax) / 2;
  const midpoint = arcMidpoint(a, b);

  const distSteps = [];
  for (let dist = sceneMinDist; dist < 14; dist *= 1.06) distSteps.push(dist);
  distSteps.push(14);

  const tryPitch = (pitch) => {
    let best = null;
    for (const dist of distSteps) {
      const found = bestNorthUpYaw(a, b, pitch, dist, currentYaw, viewW, viewH, fov, deg, xMin, xMax, yMin, yMax);
      if (!best || found.cost < best.cost) best = { yaw: found.yaw, pitch, dist, cost: found.cost };
      if (found.cost === 0) return best;
    }
    return best;
  };

  let best = tryPitch(currentPitch);
  if (best.cost === 0) {
    return centerAtPitch(a, b, midpoint, currentPitch, distSteps, currentYaw, viewW, viewH, fov, deg, xMin, xMax, yMin, yMax, centerX, centerY);
  }

  const coarseStep = deg; // 1 degree
  const maxSteps = Math.ceil(pitchLimit / coarseStep) + 1;
  let workingDir = 0;
  let workingDelta = 0;
  for (let steps = 1; steps <= maxSteps && !workingDir; steps++) {
    const delta = steps * coarseStep;
    for (const dir of [1, -1]) {
      const pitch = clamp(currentPitch + dir * delta, -pitchLimit, pitchLimit);
      const attempt = tryPitch(pitch);
      if (attempt.cost < best.cost) best = attempt;
      if (attempt.cost === 0 && !workingDir) { workingDir = dir; workingDelta = delta; }
    }
  }
  if (!workingDir) return best; // no fit found even at the pitch limit; best effort

  let lo = workingDelta - coarseStep;
  let hi = workingDelta;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const pitch = clamp(currentPitch + workingDir * mid, -pitchLimit, pitchLimit);
    const attempt = tryPitch(pitch);
    if (attempt.cost === 0) { hi = mid; best = attempt; } else { lo = mid; }
  }
  return centerAtPitch(a, b, midpoint, best.pitch, distSteps, currentYaw, viewW, viewH, fov, deg, xMin, xMax, yMin, yMax, centerX, centerY);
}

const ANSWER_CENTER_DIST_STEP = 1.03; // ~80 samples from sceneMinDist to 14

// The recap's "friends' pins" ON framing: the answer locked to the exact
// centre of the safe strip, and the camera backed out to the smallest
// distance (stepped geometrically from sceneMinDist to 14) at which every
// guess - the player's own plus every friend's - lands inside the same
// marker-clearance box the north-up solve uses, facing the camera. Yaw and
// pitch are free (this is not a north-up framing): for a given distance,
// there are exactly two pitch solutions that put the answer exactly on
// centre pre-clamp, and the better-landing one post-clamp is kept, the same
// two-candidate scoring solveRevealFraming uses for its midpoint. When no
// sampled distance fits every guess, the answer stays centred at the
// maximum distance (14) rather than silently falling back to some other
// point; allFit tells the caller which case it got.
export function solveAnswerCenteredRevealFraming({
  answer, guesses, safeTop, safeBottom, viewW, viewH, fov, deg, pitchLimit, sceneMinDist,
  currentYaw, currentPitch,
}) {
  const maxDist = 14;
  const safeY = (safeTop + safeBottom) / 2;
  const centerX = viewW / 2;
  const xMin = 28;
  const xMax = viewW - 28;
  const yMin = safeTop + 36;
  const yMax = safeBottom - 10;
  const tanV = Math.tan((fov / 2) * deg);
  const ndcY = 1 - (safeY / viewH) * 2;
  const dir = normalize({ x: 0, y: ndcY * tanV, z: -1 });

  const centerAt = (dist) => {
    const target = raySphereNear(dist, dir) || { x: 0, y: 0, z: 1 };
    const R = Math.hypot(target.y, target.z);
    const alpha = Math.atan2(target.z, target.y);
    const spread = Math.acos(clamp(answer.y / Math.max(R, 1e-6), -1, 1));
    let best = null;
    for (const raw of [alpha + spread, alpha - spread]) {
      const pitch = clamp(nearAngle(raw, currentPitch), -pitchLimit, pitchLimit);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const mz = -target.y * sp + target.z * cp;
      const yaw = nearAngle(Math.atan2(target.x, mz) - Math.atan2(answer.x, answer.z), currentYaw);
      const proj = projectUnderView(answer, yaw, pitch, dist, viewW, viewH, fov, deg);
      const score = (proj.facing ? 0 : 1e6) + Math.abs(proj.y - safeY) + Math.abs(proj.x - centerX);
      if (!best || score < best.score) best = { yaw, pitch, score };
    }
    return { yaw: best.yaw, pitch: best.pitch };
  };

  const allFitAt = (yaw, pitch, dist) => guesses.every((g) => {
    const proj = projectUnderView(g, yaw, pitch, dist, viewW, viewH, fov, deg);
    return proj.facing && proj.x >= xMin && proj.x <= xMax && proj.y >= yMin && proj.y <= yMax;
  });

  for (let dist = sceneMinDist; dist < maxDist; dist *= ANSWER_CENTER_DIST_STEP) {
    const { yaw, pitch } = centerAt(dist);
    if (allFitAt(yaw, pitch, dist)) return { yaw, pitch, dist, allFit: true };
  }
  const { yaw, pitch } = centerAt(maxDist);
  return { yaw, pitch, dist: maxDist, allFit: allFitAt(yaw, pitch, maxDist) };
}
