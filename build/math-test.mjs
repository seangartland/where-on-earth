import * as THREE from '../vendor/three/build/three.module.js';
const DEG = Math.PI / 180, PITCH_LIMIT = 85 * DEG;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const nearAngle = (a, b) => a + Math.round((b - a) / (2 * Math.PI)) * 2 * Math.PI;
let yaw = 0, pitch = 0;
const q = new THREE.Quaternion(), qx = new THREE.Quaternion(), qy = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);
const orient = (y, p) => q.multiplyQuaternions(qx.setFromAxisAngle(RIGHT, p), qy.setFromAxisAngle(UP, y));
// copy of solveGrab working on a world point D directly
function solveGrab(L, D) {
  const R = Math.hypot(D.y, D.z), alpha = Math.atan2(D.z, D.y), c = L.y / Math.max(R, 1e-6);
  const spread = Math.acos(clamp(c, -1, 1));
  const p1 = nearAngle(alpha + spread, pitch), p2 = nearAngle(alpha - spread, pitch);
  const p = Math.abs(p1 - pitch) < Math.abs(p2 - pitch) ? p1 : p2;
  const pc = clamp(p, -PITCH_LIMIT, PITCH_LIMIT), cp = Math.cos(pc), sp = Math.sin(pc);
  pitch = pc; yaw = nearAngle(Math.atan2(D.x, -D.y * sp + D.z * cp) - Math.atan2(L.x, L.z), yaw);
  return Math.abs(c) <= 1 && pc === p;
}
// 1) axis invariance over full spins at many tilts
let worst = 0;
for (let p = -85; p <= 85; p += 5) for (let y = 0; y <= 4 * 360; y += 3) {
  const ax = UP.clone().applyQuaternion(orient(y * DEG, p * DEG));
  worst = Math.max(worst, ax.distanceTo(new THREE.Vector3(0, Math.cos(p * DEG), Math.sin(p * DEG))));
  if (ax.y < Math.cos(85 * DEG) - 1e-9) throw new Error('north below horizon');
}
console.log('axis max deviation over 4 turns x all tilts:', worst.toExponential(2));
// screen-up of north: projected axis must always point up (x = 0, y > 0)
// 2) grab tracking: random grabs, small finger steps on the visible hemisphere
let maxErr = 0, solved = 0, limited = 0;
for (let t = 0; t < 20000; t++) {
  yaw = Math.random() * 20 - 10; pitch = (Math.random() * 2 - 1) * 70 * DEG;
  const D0 = new THREE.Vector3().randomDirection(); if (D0.z < 0.2) D0.z = -D0.z + 0.2; D0.normalize();
  const L = D0.clone().applyQuaternion(orient(yaw, pitch).clone().invert());
  if (Math.hypot(L.x, L.z) < 0.09) continue;
  const D = D0.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(0.05)).normalize();
  if (D.z < 0.1) continue;
  if (solveGrab(L, D)) {
    solved++;
    maxErr = Math.max(maxErr, L.clone().applyQuaternion(orient(yaw, pitch)).distanceTo(D));
  } else limited++;
}
console.log('grab solves:', solved, 'limited:', limited, 'max error (unit sphere):', maxErr.toExponential(2));
