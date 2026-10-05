/**
 * Build-time converter: Natural Earth 50m lakes -> small local GeoJSON of the big lakes.
 *
 * Source (download once into assets/, never fetched at runtime):
 *   curl -sSfL -o assets/ne_50m_lakes.geojson \
 *     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson
 *
 * Keeps lakes whose largest ring spans at least MIN_LAKE degrees (same extent
 * measure as the globe's MIN_ISLAND rule), drops duplicate geometries and all
 * properties except the name, and rounds coordinates to 1e-4 deg.
 * The Caspian is not in this dataset: it's already open water in world.geo.json.
 *
 * Output FeatureCollection: one MultiPolygon feature per lake (properties.kind = "lake").
 *
 * usage: node build/convert-lakes.mjs assets/ne_50m_lakes.geojson assets/lakes.geo.json
 */
import { readFileSync, writeFileSync } from "node:fs";

const MIN_LAKE = 1.0;
const DEG = Math.PI / 180;

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: node build/convert-lakes.mjs <in.geojson> <out.geojson>");
  process.exit(1);
}

const round = (v) => Math.round(v * 1e4) / 1e4;

// matches ringExtent() in src/main.js
function ringExtent(pts) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return Math.hypot((x1 - x0) * Math.cos(((y0 + y1) / 2) * DEG), y1 - y0);
}

const src = JSON.parse(readFileSync(inPath, "utf8"));
const seen = new Set();
const features = [];
for (const f of src.features) {
  const g = f.geometry;
  if (!g) continue;
  const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates)
    .filter((poly) => ringExtent(poly[0]) >= MIN_LAKE)
    .map((poly) => poly.map((ring) => ring.map(([x, y]) => [round(x), round(y)])));
  if (!polys.length) continue;
  const key = JSON.stringify(polys[0][0].slice(0, 3));
  if (seen.has(key)) continue; // NE lists a few lakes twice (Lake Volta, Zaysan, Fort Peck)
  seen.add(key);
  features.push({
    type: "Feature",
    properties: { kind: "lake", name: f.properties.name },
    geometry: { type: "MultiPolygon", coordinates: polys },
  });
}

const json = JSON.stringify({ type: "FeatureCollection", features });
writeFileSync(outPath, json);
console.log(`wrote ${outPath}: ${features.length} lakes >= ${MIN_LAKE} deg, ${(json.length / 1024).toFixed(0)} KB`);
