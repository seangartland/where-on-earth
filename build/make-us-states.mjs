/**
 * Build-time: Natural Earth admin-1 (US) -> assets/us-states.topo.json, in the
 * same shared-arc topology format as assets/country-outlines.topo.json
 * (build/make-country-outlines.mjs), for the Blackout "United States" scope.
 *
 * Source (gitignored, never shipped): Natural Earth v5.1.1 10m cultural,
 *   https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip
 * converted to GeoJSON (mapshaper) at scripts/difficulty/ne/ne_10m_admin_1_states_provinces.geojson.
 *
 * Units: the 50 US states (iso_a2 'US', type 'State'); District of Columbia
 * excluded (Blackout's United States scope is 50 states only). One unit per
 * key, no multi-member keys, no disputed-territory edits.
 *
 * Output: same conventions as country-outlines.topo.json: shared-arc
 * topology, arcs Douglas-Peucker simplified at the same 0.02 deg tolerance,
 * quantized on the same 1e-4 grid, object "data". topo.keys = { "US-<code>":
 * [unit id] }, topo.cut = antimeridian seam arc indices (Alaska's Aleutians
 * cross it, same as Russia/Fiji in the country file).
 * Report: docs/us-states-report.md.
 *
 * usage: node build/make-us-states.mjs
 * needs: npm i -g topojson-server topojson-client
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";

const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const req = createRequire(globalRoot + "/");
const { topology } = req("topojson-server");
const { quantize, feature } = req("topojson-client");

const NE = "scripts/difficulty/ne";
const OUT = "assets/us-states.topo.json";
const REPORT = "docs/us-states-report.md";
const TOL = 0.02;
const GRID = { scale: [1e-4, 1e-4], translate: [-180, -90] };
const DEG = Math.PI / 180;

const polysOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);
const bboxOf = (ring) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
};

// ---- 1. units ---------------------------------------------------------------
const src = JSON.parse(readFileSync(`${NE}/ne_10m_admin_1_states_provinces.geojson`, "utf8"));
const features = src.features.filter((f) => f.properties.iso_a2 === "US" && f.properties.type === "State");
if (features.length !== 50) throw new Error(`expected 50 US states, got ${features.length}`);

const units = features.map((f) => {
  const p = f.properties;
  if (`US-${p.postal}` !== p.iso_3166_2) throw new Error(`postal/iso mismatch for ${p.name}`);
  return { id: p.postal, name: p.name, polys: polysOf(f.geometry) };
});
const unit = Object.fromEntries(units.map((u) => [u.id, u]));
if (Object.keys(unit).length !== units.length) throw new Error("duplicate state ids");

// ---- 2. keys ------------------------------------------------------------
const keys = Object.fromEntries(units.map((u) => [`US-${u.id}`, [u.id]]));

// ---- 3. topology ------------------------------------------------------------
const fc = {
  type: "FeatureCollection",
  features: units.map((u) => ({
    type: "Feature", id: u.id, properties: { name: u.name },
    geometry: { type: "MultiPolygon", coordinates: u.polys },
  })),
};
const topo = topology({ data: fc });
const geoms = topo.objects.data.geometries;

// split arcs so every antimeridian seam run (consecutive vertices both on
// |lng| = 180) is its own arc, listed in topo.cut (Alaska's Aleutians wrap,
// same as Russia/Fiji in make-country-outlines.mjs; identical logic).
const onSeam = (p) => Math.abs(p[0]) === 180;
const newArcs = [], cut = [], remap = new Map();
const mapArc = (i) => {
  if (!remap.has(i)) {
    const arc = topo.arcs[i], ids = [];
    let start = 0;
    for (let j = 1; j < arc.length; j++) {
      const seam = onSeam(arc[j - 1]) && onSeam(arc[j]);
      const next = j + 1 < arc.length && onSeam(arc[j]) && onSeam(arc[j + 1]);
      if (j + 1 === arc.length || seam !== next) {
        if (seam) cut.push(newArcs.length);
        ids.push(newArcs.push(arc.slice(start, j + 1)) - 1);
        start = j;
      }
    }
    remap.set(i, ids);
  }
  return remap.get(i);
};
const rewriteRing = (ring) => ring.flatMap((a) => (a >= 0 ? mapArc(a) : mapArc(~a).slice().reverse().map((x) => ~x)));
for (const g of geoms) {
  if (g.type === "Polygon") g.arcs = g.arcs.map(rewriteRing);
  else if (g.type === "MultiPolygon") g.arcs = g.arcs.map((p) => p.map(rewriteRing));
}
const droppedArcs = topo.arcs.length - remap.size;
topo.arcs = newArcs;

// ---- 4. simplify (verbatim from make-country-outlines.mjs) -----------------
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const k = Math.cos(((pts[a][1] + pts[b][1]) / 2) * DEG);
    const ax = pts[a][0] * k, ay = pts[a][1];
    const dx = pts[b][0] * k - ax, dy = pts[b][1] - ay;
    const len = Math.hypot(dx, dy);
    let best = -1, bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] * k - ax, py = pts[i][1] - ay;
      const d = len > 1e-12 ? Math.abs(px * dy - py * dx) / len : Math.hypot(px, py);
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const closed = (a) => a.length > 4 && a[0][0] === a.at(-1)[0] && a[0][1] === a.at(-1)[1];
const original = topo.arcs;
let simple = original.map((a) => {
  if (!closed(a)) return simplify(a, TOL);
  const half = a.length >> 1;
  return [...simplify(a.slice(0, half + 1), TOL).slice(0, -1), ...simplify(a.slice(half), TOL)];
});
const polyGeoms = (g) => (g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : []);
const ringPts = (ring, arcs) => ring.reduce((n, a) => n + arcs[a < 0 ? ~a : a].length - 1, 0);
const allRings = geoms.flatMap((g) => polyGeoms(g).flat());
let restoredRings = 0, restoredPts = 0;
for (const ring of allRings) {
  if (ringPts(ring, simple) >= 3) continue;
  restoredRings++;
  for (const a of ring) {
    const i = a < 0 ? ~a : a;
    if (simple[i] !== original[i]) restoredPts += original[i].length - simple[i].length;
    simple[i] = original[i];
  }
}
topo.arcs = simple;

// ---- 5. quantize + write ----------------------------------------------------
delete topo.bbox;
const out = quantize(topo, GRID);
out.keys = keys;
out.cut = cut;
const json = JSON.stringify(out);
writeFileSync(OUT, json);
const rawB = Buffer.byteLength(json), gzB = gzipSync(json, { level: 9 }).length;

// ---- 6. verify (point-in-polygon spot check on the written file) -----------
const final = JSON.parse(readFileSync(OUT, "utf8"));
const feats = feature(final, final.objects.data).features.map((f) => ({
  id: f.id, name: f.properties.name,
  polys: polysOf(f.geometry).map((p) => ({ rings: p, bbox: bboxOf(p[0]) })),
}));
const fid = Object.fromEntries(feats.map((f) => [f.id, f]));
const pip = (ring, x, y) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const inside = (f, x, y) => f.polys.some(({ rings, bbox: [x0, y0, x1, y1] }) =>
  x >= x0 && x <= x1 && y >= y0 && y <= y1 && pip(rings[0], x, y) && !rings.slice(1).some((h) => pip(h, x, y)));
// state capitals, a spot check across sizes and shapes (incl. Alaska's seam, Hawaii's islands)
// Alaska's actual capital, Juneau, sits in a fjord too narrow for this
// generalized coastline (fails even on the raw, unsimplified NE geometry),
// so Anchorage stands in as Alaska's spot check.
const CAPITALS = {
  CA: [38.5816, -121.4944], TX: [30.2672, -97.7431], AK: [61.2181, -149.9003],
  HI: [21.3069, -157.8583], RI: [41.8240, -71.4128], NY: [42.6526, -73.7562],
  FL: [30.4383, -84.2807], WA: [47.0379, -122.9007], MI: [42.7325, -84.5555],
  LA: [30.4515, -91.1871],
};
const capRows = Object.entries(CAPITALS).map(([id, [lat, lng]]) => ({ id, hit: inside(fid[id], lng, lat) }));
const capFails = capRows.filter((r) => !r.hit);
const degenerate = geoms.flatMap((g) => polyGeoms(g).flat()).filter((r) => ringPts(r, final.arcs) < 3).length;

// Chamberlain-Duquette spherical polygon area (km2), for the size sanity check only
const R = 6371.0088;
function ringAreaKm2(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i], [lng2, lat2] = ring[i + 1];
    sum += (lng2 - lng1) * DEG * (2 + Math.sin(lat1 * DEG) + Math.sin(lat2 * DEG));
  }
  return Math.abs((sum * R * R) / 2);
}
const areaOf = (f) => f.polys.reduce((n, p) => n + ringAreaKm2(p.rings[0]) - p.rings.slice(1).reduce((m, h) => m + ringAreaKm2(h), 0), 0);
const areaRows = [["TX", 695662], ["CA", 423967]].map(([id, real]) => {
  const measured = areaOf(fid[id]);
  return { id, measured, real, deltaPct: ((measured - real) / real) * 100 };
});

// ---- 7. report --------------------------------------------------------------
const KB = (n) => `${(n / 1024).toFixed(0)} KB`;
const points = final.arcs.reduce((n, a) => n + a.length, 0);
const pass = (b) => (b ? "PASS" : "**FAIL**");
const gates = [
  [`${Object.keys(keys).length}/50 state keys built`, Object.keys(keys).length === 50],
  [`${capRows.length - capFails.length}/${capRows.length} spot-check capitals resolve inside their own state polygon`, !capFails.length],
  [`degenerate rings (< 3 points): ${degenerate}`, degenerate === 0],
];
const md = `# US states build report

Generated by \`node build/make-us-states.mjs\` on ${new Date().toISOString().slice(0, 10)}. Same format and conventions as \`build/make-country-outlines.mjs\` (docs/country-outlines-p1-report.md), reused verbatim for simplify/antimeridian-cut logic.

## Gates

${gates.map(([t, ok]) => `- ${pass(ok)}: ${t}`).join("\n")}

## Output

- \`${OUT}\`: **${KB(rawB)} raw, ${KB(gzB)} gzip -9** (${rawB.toLocaleString("en-US")} / ${gzB.toLocaleString("en-US")} B). For comparison, \`assets/country-outlines.topo.json\` (261 units, 202 keys) is 1,220 KB raw.
- ${feats.length} units (50 states, one unit per key), ${final.arcs.length.toLocaleString("en-US")} arcs, ${points.toLocaleString("en-US")} points. DP ${TOL} deg (same tolerance as the country file), grid 1e-4, object \`data\`.
- \`topo.keys\`: 50 keys, \`US-<postal>\` (e.g. \`US-CA\`). \`topo.cut\`: ${cut.length} antimeridian seam arc(s) (Alaska's Aleutians cross 180 deg, same situation as Russia/Fiji in the country file; skip when stroking, never when filling).
- ${droppedArcs} arcs dropped (merged into their seam-split replacements). ${restoredRings} ring(s) kept at full detail because DP collapsed them below a triangle, adding ${restoredPts.toLocaleString("en-US")} points.
- District of Columbia excluded (50 states only, as specced).

## Capital spot check (point-in-polygon on the written, decoded file)

| state | capital lat,lng | inside own polygon |
|---|---|---|
${capRows.map((r) => `| ${r.id} | ${CAPITALS[r.id].join(", ")} | ${r.hit ? "yes" : "**NO**"} |`).join("\n")}

## Area sanity check (spherical polygon area on this file's own geometry, see also docs/land-areas-report.md)

| state | measured km2 | reference km2 | delta |
|---|---|---|---|
${areaRows.map((r) => `| ${r.id} | ${r.measured.toLocaleString("en-US", { maximumFractionDigits: 0 })} | ${r.real.toLocaleString("en-US")} | ${r.deltaPct.toFixed(1)}% |`).join("\n")}
`;
writeFileSync(REPORT, md);
console.log(gates.map(([t, ok]) => `${ok ? "ok  " : "FAIL"} ${t}`).join("\n"));
console.log(`${OUT}: ${KB(rawB)} raw, ${KB(gzB)} gz -> ${REPORT}`);
if (gates.some(([, ok]) => !ok)) process.exit(1);
