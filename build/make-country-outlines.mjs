/**
 * Build-time: Natural Earth admin-0 -> assets/country-outlines.topo.json
 * (docs/country-outlines-plan-opus.md, phase P1). Not loaded by the game yet.
 *
 * Sources (gitignored, never shipped): Natural Earth v5.1.1 10m cultural,
 *   https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip
 *   https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_map_units.zip
 * converted to GeoJSON in scripts/difficulty/ne/.
 *
 * Units: admin-0 countries minus GBR, plus the four UK nations from map units.
 * Sean's decisions (plan §6): D1 disputed areas follow the game's names, so
 * Crimea moves from Russia to Ukraine and Western Sahara gets its full
 * territory (Morocco is cut at the 27°40'N line); Somaliland and N. Cyprus are
 * Somalia / Cyprus members. D2 territories are members of the sovereign key.
 *
 * Output: shared-arc topology, arcs Douglas-Peucker simplified at 0.02° (same
 * lat-squashed DP as main.js), quantized on the 1e-4 grid, object "data".
 * Extra fields: topo.keys = { "<game key>": [unit ids] }, topo.cut = indices of
 * antimeridian seam arcs (fill/hit-test only, never stroke).
 * Report: docs/country-outlines-p1-report.md. The build fails if a key or a
 * location does not resolve.
 *
 * usage: node build/make-country-outlines.mjs
 * needs: npm i -g topojson-server topojson-client
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";

const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const req = createRequire(globalRoot + "/");
const { topology } = req("topojson-server");
const { quantize, feature, mergeArcs } = req("topojson-client");

const NE = "scripts/difficulty/ne";
const OUT = "assets/country-outlines.topo.json";
const REPORT = "docs/country-outlines-p1-report.md";
const TOL = 0.02;
const GRID = { scale: [1e-4, 1e-4], translate: [-180, -90] };
const FALLBACK_KM = 50;
const DEG = Math.PI / 180;

// game key -> NE name, where they differ
const ALIAS = {
  "United States": "United States of America",
  "DR Congo": "Democratic Republic of the Congo",
  Congo: "Republic of the Congo",
  "Czech Republic": "Czechia",
  Eswatini: "eSwatini",
  Micronesia: "Federated States of Micronesia",
  Tanzania: "United Republic of Tanzania",
  Bahamas: "The Bahamas",
  "Vatican City": "Vatican",
  Serbia: "Republic of Serbia",
  "Sao Tome and Principe": "São Tomé and Principe",
  "Côte d'Ivoire": "Ivory Coast",
  "Timor-Leste": "East Timor",
};
// game key -> unit ids, where a key is more than its own unit (plan §1.1)
const MEMBERS = {
  Denmark: ["DNK", "GRL", "FRO"],
  China: ["CHN", "HKG", "MAC"],
  "United States": ["USA", "PRI"],
  France: ["FRA", "NCL", "PYF"],
  Somalia: ["SOM", "SOL"],
  Cyprus: ["CYP", "CYN", "CNM"],
};

const load = (f) => JSON.parse(readFileSync(`${NE}/${f}.geojson`, "utf8")).features;
const polysOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);
const bboxOf = (ring) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
};

// ---- 1. units ---------------------------------------------------------------
const units = [];
for (const f of load("ne_10m_admin_0_countries")) {
  const p = f.properties;
  if (p.ADM0_A3 === "GBR") continue;
  units.push({ id: p.ADM0_A3, name: p.NAME, admin: p.ADMIN, polys: polysOf(f.geometry) });
}
for (const f of load("ne_10m_admin_0_map_units")) {
  const p = f.properties;
  if (["ENG", "SCT", "WLS", "NIR"].includes(p.GU_A3))
    units.push({ id: p.GU_A3, name: p.NAME, admin: p.GEOUNIT, polys: polysOf(f.geometry) });
}
const unit = Object.fromEntries(units.map((u) => [u.id, u]));
if (Object.keys(unit).length !== units.length) throw new Error("duplicate unit ids");

// D1 Crimea: Russia's polygon inside the Crimea box (one polygon, measured) -> Ukraine
const inCrimea = (poly) => { const [x0, y0, x1, y1] = bboxOf(poly[0]); return x0 > 32 && x1 < 37 && y0 > 44 && y1 < 46.5; };
const crimea = unit.RUS.polys.filter(inCrimea);
if (crimea.length !== 1) throw new Error(`expected 1 Crimea polygon in RUS, got ${crimea.length}`);
unit.RUS.polys = unit.RUS.polys.filter((p) => !inCrimea(p));
unit.UKR.polys.push(crimea[0]);

// D1 Western Sahara: NE's Morocco includes the area west of the berm. Cut it at
// the latitude of SAH's northern corner (the 27°40'N border) and give the south
// piece to SAH. The cut runs from the coast crossing to that corner, a vertex
// both rings already share, so the new border is exact on both sides.
{
  if (unit.MAR.polys.length !== 1 || unit.SAH.polys.length !== 1) throw new Error("MAR/SAH shape changed");
  const mar = unit.MAR.polys[0][0];
  const sah = unit.SAH.polys[0][0];
  const L = Math.max(...sah.map((p) => p[1]));
  const corner = sah.find((p) => p[1] === L);
  const ci = mar.findIndex((p) => p[0] === corner[0] && p[1] === corner[1]);
  // the coast crossing is the westmost crossing of y = L
  let si = -1;
  for (let i = 0; i < mar.length - 1; i++)
    if ((mar[i][1] - L) * (mar[i + 1][1] - L) < 0 && (si < 0 || mar[i][0] < mar[si][0])) si = i;
  if (ci < 0 || si < 0 || si > ci) throw new Error("Morocco cut points not found");
  const [a, b] = [mar[si], mar[si + 1]];
  const t = (L - a[1]) / (b[1] - a[1]);
  const X = [+(a[0] + t * (b[0] - a[0])).toFixed(6), L];
  // mar[si] is south of L and mar[si+1] north, so si+1..ci is the Moroccan side
  const north = [X, ...mar.slice(si + 1, ci + 1), X];
  const south = [...mar.slice(ci, -1), ...mar.slice(0, si + 1), X, mar[ci]];
  unit.MAR.polys = [[north]];
  unit.SAH.polys.push([south]);
}

// NE quirk: on one stretch of the Sudan / Bir Tawil border, Sudan has a notch
// vertex where BRT has a collinear one (5 cm off line), leaving a ~0.03 km²
// sliver and two separate arcs. BRT takes Sudan's vertex so the border is one
// shared arc; Sudan is unchanged.
{
  const r = unit.BRT.polys[0][0];
  const i = r.findIndex((p) => p[0] === 33.717264 && p[1] === 21.730947);
  if (i < 0 || !unit.SDN.polys.some((p) => p[0].some((q) => q[0] === 33.560882 && q[1] === 21.709118)))
    throw new Error("Bir Tawil patch no longer matches the NE source");
  r[i] = [33.560882, 21.709118];
}

// ---- 2. keys ----------------------------------------------------------------
const locations = JSON.parse(readFileSync("assets/locations.json", "utf8"));
const gameKeys = [...new Set(locations.map((l) => l.country))].sort();
const byAdmin = {};
for (const u of units) byAdmin[u.admin] = u.id;
const keys = {};
const unresolved = [];
for (const k of gameKeys) {
  const ids = MEMBERS[k] || [byAdmin[ALIAS[k] || k]].filter(Boolean);
  if (!ids.length || ids.some((id) => !unit[id])) unresolved.push(k);
  else keys[k] = ids;
}
if (unresolved.length) throw new Error(`unresolved keys: ${unresolved.join(", ")}`);

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
const polyGeoms = (g) => (g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : []);

// dissolve the borders the D1 edits made internal (Perekop, the berm)
for (const id of ["UKR", "SAH"]) {
  const g = geoms.find((x) => x.id === id);
  const m = mergeArcs(topo, polyGeoms(g).map((arcs) => ({ type: "Polygon", arcs })));
  g.type = m.type; g.arcs = m.arcs;
}

// rebuild the arc list: drop arcs no geometry uses any more, and split arcs so
// every antimeridian seam run (consecutive vertices both on |lng| = 180) is
// its own arc, listed in topo.cut
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

// ---- 4. simplify ------------------------------------------------------------
function simplify(pts, tol) { // main.js simplify(), verbatim
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
  const half = a.length >> 1; // as cleanCoast: a closed ring is simplified as two halves
  return [...simplify(a.slice(0, half + 1), TOL).slice(0, -1), ...simplify(a.slice(half), TOL)];
});
// a ring DP collapsed below a triangle (Vatican, Monaco-size islets) keeps its
// full detail: hit-testing small nations needs a real polygon
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

// ---- 6. verify (on the written file, decoded the way the client will) -------
const final = JSON.parse(readFileSync(OUT, "utf8"));
const feats = feature(final, final.objects.data).features.map((f) => ({
  id: f.id, name: f.properties.name,
  polys: polysOf(f.geometry).map((p) => ({ rings: p, bbox: bboxOf(p[0]) })),
}));
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
// km from (x, y) to segment a-b, local equirectangular (fine at < 100 km)
const segKm = (x, y, a, b) => {
  const k = Math.cos(y * DEG);
  const ax = (a[0] - x) * k, ay = a[1] - y, bx = (b[0] - x) * k, by = b[1] - y;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy) * 111.32;
};
const distKm = (f, x, y) => {
  let best = Infinity;
  for (const { rings, bbox: [x0, y0, x1, y1] } of f.polys) {
    if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) continue;
    for (const r of rings) for (let i = 1; i < r.length; i++) best = Math.min(best, segKm(x, y, r[i - 1], r[i]));
  }
  return best;
};
const fid = Object.fromEntries(feats.map((f) => [f.id, f]));
const rows = locations.map((l) => {
  const own = keys[l.country];
  const hit = feats.find((f) => inside(f, l.lng, l.lat));
  const row = { id: l.id, key: l.country, unit: hit?.id ?? null };
  if (hit && own.includes(hit.id)) return { ...row, how: "inside" };
  const ownKm = Math.min(...own.map((id) => distKm(fid[id], l.lng, l.lat)));
  let near = null, nearKm = Infinity;
  for (const f of feats) { const d = distKm(f, l.lng, l.lat); if (d < nearKm) { nearKm = d; near = f.id; } }
  return { ...row, how: hit ? "in-other" : "ocean", ownKm, near, nearOwn: own.includes(near) };
});
const ocean = rows.filter((r) => r.how === "ocean");
const other = rows.filter((r) => r.how === "in-other");
const failed = rows.filter((r) => r.how !== "inside" && !(r.ownKm <= FALLBACK_KM && (r.how === "in-other" || r.nearOwn)));

// shared borders: a segment two units both draw must come from one arc. Two
// arcs over the same segment are only a mismatch if one unit draws it from arc
// i alone and another from arc j alone (DP can fold two arcs of the same unit
// onto one segment, which draws identically)
const users = final.arcs.map(() => new Set());
for (const g of final.objects.data.geometries)
  for (const a of polyGeoms(g).flat(2)) users[a < 0 ? ~a : a].add(g.id);
const segArcs = new Map();
final.arcs.forEach((arc, i) => {
  let x = 0, y = 0, prev = null;
  for (const [dx, dy] of arc) {
    x += dx; y += dy;
    if (prev) {
      const s = prev < `${x},${y}` ? `${prev}|${x},${y}` : `${x},${y}|${prev}`;
      segArcs.set(s, (segArcs.get(s) || new Set()).add(i));
    }
    prev = `${x},${y}`;
  }
});
// (NE's own source borders are not always vertex-identical, so units outside
// every game key are listed in the report but do not fail the build)
const keyed = new Set(Object.values(keys).flat());
const mismatches = [];
let foldedSegs = 0;
for (const [s, set] of segArcs) {
  if (set.size < 2) continue;
  const arcs = [...set];
  const only = (i) => [...users[i]].filter((u) => arcs.every((j) => j === i || !users[j].has(u)));
  const units = arcs.flatMap(only);
  if (arcs.filter((i) => only(i).length).length > 1) mismatches.push({ s, units });
  else foldedSegs++;
}
const dupSegs = mismatches.filter((m) => m.units.some((u) => keyed.has(u))).length;
const arcsOf = (id) => new Set(polyGeoms(final.objects.data.geometries.find((g) => g.id === id)).flat(2).map((a) => (a < 0 ? ~a : a)));
const memberRows = Object.entries(MEMBERS).map(([k, ids]) => {
  const sets = ids.map(arcsOf);
  const shared = new Set();
  sets.forEach((s, i) => sets.slice(i + 1).forEach((t) => s.forEach((a) => t.has(a) && shared.add(a))));
  const g = final.objects.data.geometries.filter((x) => ids.includes(x.id));
  const merged = mergeArcs(final, g.flatMap((x) => polyGeoms(x).map((arcs) => ({ type: "Polygon", arcs }))));
  const left = merged.arcs.flat(2).filter((a) => shared.has(a < 0 ? ~a : a)).length;
  return { k, ids, shared: shared.size, left };
});
const degenerate = final.objects.data.geometries.flatMap((g) => polyGeoms(g).flat()).filter((r) => ringPts(r, final.arcs) < 3).length;

// ---- 7. report --------------------------------------------------------------
const KB = (n) => `${(n / 1024).toFixed(0)} KB`;
const points = final.arcs.reduce((n, a) => n + a.length, 0);
const nonOwn = ocean.concat(other);
const pass = (b) => (b ? "PASS" : "**FAIL**");
const gates = [
  [`${Object.keys(keys).length}/${gameKeys.length} game keys resolve to geometry`, Object.keys(keys).length === gameKeys.length],
  [`${locations.length - failed.length}/${locations.length} locations resolve to their own key (≤ ${FALLBACK_KM} km fallback)`, !failed.length],
  [`${ocean.length} off-polygon pins: max ${Math.max(0, ...ocean.map((r) => r.ownKm)).toFixed(1)} km, nearest unit is own key for ${ocean.filter((r) => r.nearOwn).length}/${ocean.length}`, ocean.every((r) => r.nearOwn && r.ownKm <= FALLBACK_KM)],
  [`border segments a game-key unit draws from a different arc than its neighbour: ${dupSegs} (all units: ${mismatches.length}; same-unit DP folds: ${foldedSegs})`, dupSegs === 0],
  [`member borders left after merge: ${memberRows.reduce((n, r) => n + r.left, 0)}`, memberRows.every((r) => r.left === 0)],
  [`degenerate rings (< 3 points): ${degenerate}`, degenerate === 0],
];
const md = `# Country outlines P1: build report

Generated by \`node build/make-country-outlines.mjs\` on ${new Date().toISOString().slice(0, 10)}. All numbers below are measured on the written file, decoded with topojson-client (\`feature\`), the same path the client will use.

## Gates

${gates.map(([t, ok]) => `- ${pass(ok)}: ${t}`).join("\n")}

## Output

- \`${OUT}\`: **${KB(rawB)} raw, ${KB(gzB)} gzip -9** (${rawB.toLocaleString("en-US")} / ${gzB.toLocaleString("en-US")} B). Plan expectation: 1,131 KB / 436 KB.
- ${feats.length} units, ${final.arcs.length.toLocaleString("en-US")} arcs, ${points.toLocaleString("en-US")} points. DP ${TOL}°, grid 1e-4, object \`data\`.
- \`topo.keys\`: ${Object.keys(keys).length} game keys. \`topo.cut\`: ${cut.length} antimeridian seam arcs (skip when stroking).
- ${droppedArcs} arcs dropped as internal after the D1 merges. ${restoredRings} rings (tiny islets and microstates) kept at full detail because DP collapsed them below a triangle, adding ${restoredPts.toLocaleString("en-US")} points; the plan's size estimate left them collapsed, which would make them untappable.

## D1 / D2 geometry edits

- Crimea: Russia's Crimea polygon moved to Ukraine and merged (Perekop border dissolved).
- Western Sahara: Morocco cut along the 27°40'N line (from the coast to SAH's northern corner); the southern piece joined SAH and was merged (berm dissolved). Morocco is now the area north of the line.
- Multi-unit keys (borders between members are shared arcs; \`mergeArcs\` over the members leaves none of them):

| key | members | shared member arcs | left after merge |
|---|---|---|---|
${memberRows.map((r) => `| ${r.k} | ${r.ids.join(", ")} | ${r.shared} | ${r.left} |`).join("\n")}

${mismatches.length ? `Segments two units draw from separate arcs (NE source borders that are not vertex-identical; after DP they coincide exactly, so they draw the same line). None involve a game-key unit unless the gate above fails:

${mismatches.map((m) => `- ${m.units.join(" / ")}, grid segment \`${m.s}\``).join("\n")}

` : ""}## Locations not strictly inside their own key (${nonOwn.length})

${rows.length - nonOwn.length} of ${rows.length} pins are inside one of their key's polygons. The rest resolve by the ≤ ${FALLBACK_KM} km fallback:

| location | key | inside unit | km to own key | nearest unit |
|---|---|---|---|---|
${nonOwn.sort((a, b) => b.ownKm - a.ownKm).map((r) => `| ${r.id} | ${r.key} | ${r.unit ?? "none"} | ${r.ownKm.toFixed(2)} | ${r.near}${r.nearOwn ? "" : " (not own)"} |`).join("\n")}
${failed.length ? `\n**Unresolved:** ${failed.map((r) => r.id).join(", ")}\n` : ""}
## Open item for Sean

The MEMBERS table follows plan §1.1 exactly: territories are folded into a sovereign key only where a dataset location needs it. Other NE territory units (e.g. Guam, Aruba, Falklands, Åland) stay standalone units with no game key. If D2 should cover every territory, that is a MEMBERS-table change and a rebuild.
`;
writeFileSync(REPORT, md);
console.log(gates.map(([t, ok]) => `${ok ? "ok  " : "FAIL"} ${t}`).join("\n"));
console.log(`${OUT}: ${KB(rawB)} raw, ${KB(gzB)} gz -> ${REPORT}`);
if (failed.length || gates.some(([, ok]) => !ok)) process.exit(1);
