import { DEG } from '../core/config.js';
import { clamp, distanceKm } from '../core/math.js';

let data = null;

export function setExtentData(value) {
  data = value;
}

export function extentFor(item) {
  return item?.kind === 'extent' ? data?.[item.id] || null : null;
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function nearestOnLines(lines, p) {
  const c = Math.max(0.05, Math.cos(p.lat * DEG));
  const wrap = (d) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);
  let best = { km: Infinity, lat: 0, lng: 0 };
  for (const line of lines) for (let i = 1; i < line.length; i++) {
    const ax = wrap(line[i - 1][0] - p.lng) * c;
    const ay = line[i - 1][1] - p.lat;
    const bx = wrap(line[i][0] - p.lng) * c;
    const by = line[i][1] - p.lat;
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? clamp(-(ax * dx + ay * dy) / len, 0, 1) : 0;
    const q = { lat: p.lat + ay + dy * t, lng: p.lng + (ax + dx * t) / c };
    const km = distanceKm(p, q);
    if (km < best.km) best = { km, lat: q.lat, lng: q.lng };
  }
  return best;
}

export function nearestExtentPoint(item, p) {
  const extent = extentFor(item);
  if (!extent) return null;
  if (extent.type === 'polygon') {
    for (const polygon of extent.polygons) {
      if (pointInRing(p.lng, p.lat, polygon[0])
        && !polygon.slice(1).some((hole) => pointInRing(p.lng, p.lat, hole))) {
        return { km: 0, lat: p.lat, lng: p.lng };
      }
    }
    return nearestOnLines(extent.polygons.flat(), p);
  }
  return nearestOnLines(extent.lines, p);
}

export function extentLines(item) {
  const extent = extentFor(item);
  return extent?.type === 'polygon' ? extent.polygons.flat() : extent?.lines || [];
}
