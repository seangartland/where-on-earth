// ---------------------------------------------------------------------------
// Review-surface state and geometry shared by daily-game.js (which owns the
// Daily review screen) and daily-friends.js (the friends overlay on it).
// Kept in its own module so neither mode imports the other: the deploy-time
// module versioner cannot settle an import cycle.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { state } from '../core/state.js';
import { globe, camera } from '../globe/scene.js';

// The review screen's elements, set by daily-game when it builds the screen.
export let reviewEls = null;
export function setReviewEls(els) { reviewEls = els; }

// The friends overlay (daily-friends.js), registered once a signed-in build
// loads it; null otherwise.
let friendLayer = null;
export function setFriendLayer(layer) { friendLayer = layer; }
export function getFriendLayer() { return friendLayer; }

// Facing factor of a globe-local surface point: > 0 in front of the limb.
export const _rv = new THREE.Vector3();
export function reviewFacing(local) {
  _rv.copy(local).applyQuaternion(globe.quaternion);
  return (_rv.z * state.dist - 1) / Math.hypot(_rv.x, _rv.y, state.dist - _rv.z);
}

export const _rp = new THREE.Vector3();
export function screenOf(world) {
  _rp.copy(world).project(camera);
  return [((_rp.x + 1) / 2) * state.viewW, ((1 - _rp.y) / 2) * state.viewH];
}
