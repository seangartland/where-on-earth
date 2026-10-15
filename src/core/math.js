// ---------------------------------------------------------------------------
// Small numeric helpers shared by the globe and the game (refactor Phase 5).
// ---------------------------------------------------------------------------
import { DEG } from './config.js';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));
export const smoothstep = (t) => t * t * (3 - 2 * t);

export function distanceKm(a, b) {
  const p1 = a.lat * DEG;
  const p2 = b.lat * DEG;
  const dp = (b.lat - a.lat) * DEG;
  const dl = (b.lng - a.lng) * DEG;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
