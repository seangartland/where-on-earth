/**
 * Build-time converter: world-atlas countries-110m TopoJSON -> local GeoJSON.
 * No runtime topojson client needed by the page.
 *
 * Output FeatureCollection:
 *   - one MultiPolygon feature per country (properties.kind = "land"), names dropped
 *   - one MultiLineString of coastlines (arcs used by exactly one country, kind = "coast")
 *   - one MultiLineString of land borders (arcs shared by two countries, kind = "border")
 *
 * usage: node build/convert-topojson.mjs assets/countries-110m.json assets/world.geo.json
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: node build/convert-topojson.mjs <in.json> <out.geojson>");
  process.exit(1);
}

const topo = JSON.parse(readFileSync(inPath, "utf8"));
const { scale, translate } = topo.transform ?? { scale: [1, 1], translate: [0, 0] };
const round = (v) => Math.round(v * 1e4) / 1e4;

// Decode delta-encoded, quantized arcs into absolute [lon, lat] lines.
const arcs = topo.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  const out = new Array(arc.length);
  for (let i = 0; i < arc.length; i++) {
    x += arc[i][0];
    y += arc[i][1];
    out[i] = [round(x * scale[0] + translate[0]), round(y * scale[1] + translate[1])];
  }
  return out;
});

const arcPoints = (index) => (index < 0 ? arcs[~index].slice().reverse() : arcs[index]);

// Concatenate a ring's arcs into one closed ring.
function ring(arcIndexes) {
  const points = [];
  for (const ai of arcIndexes) {
    const pts = arcPoints(ai);
    for (let i = points.length ? 1 : 0; i < pts.length; i++) points.push(pts[i]);
  }
  return points;
}

const geoms = topo.objects.countries.geometries.filter(
  (g) => g.type === "Polygon" || g.type === "MultiPolygon"
);

// Count arc usage across countries: 1 = coastline, 2 = shared border.
const usage = new Uint8Array(arcs.length);
const eachRing = (g, fn) =>
  (g.type === "Polygon" ? [g.arcs] : g.arcs).forEach((poly) => poly.forEach(fn));
for (const g of geoms) eachRing(g, (r) => r.forEach((ai) => usage[ai < 0 ? ~ai : ai]++));

const features = [];
for (const g of geoms) {
  const polys = (g.type === "Polygon" ? [g.arcs] : g.arcs)
    .map((poly) => poly.map(ring).filter((r) => r.length >= 4))
    .filter((p) => p.length);
  if (!polys.length) continue;
  features.push({
    type: "Feature",
    properties: { kind: "land" },
    geometry: { type: "MultiPolygon", coordinates: polys },
  });
}

const coast = [];
const border = [];
arcs.forEach((a, i) => {
  if (usage[i] === 1) coast.push(a);
  else if (usage[i] >= 2) border.push(a);
});
features.push(
  { type: "Feature", properties: { kind: "coast" }, geometry: { type: "MultiLineString", coordinates: coast } },
  { type: "Feature", properties: { kind: "border" }, geometry: { type: "MultiLineString", coordinates: border } }
);

const json = JSON.stringify({ type: "FeatureCollection", features });
writeFileSync(outPath, json);
console.log(
  `wrote ${outPath}: ${features.length - 2} countries, ${coast.length} coast arcs, ${border.length} border arcs, ${(
    json.length / 1024
  ).toFixed(0)} KB`
);
