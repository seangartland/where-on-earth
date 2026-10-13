// Regions plan analysis: file size of a dissolved first-level region layer at DP 0.02°, 1e-4 grid,
// using the same steps as build/make-country-outlines.mjs (topology -> mergeArcs per region -> drop unused
// arcs -> main.js DP on arcs, closed rings in halves -> restore rings DP collapsed -> quantize).
// usage: node scripts/regions-analysis/region-sizes.mjs   (reads .build-tmp/regions/regions-{all,used}.geojson)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
const req = createRequire(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim() + "/");
const { topology } = req("topojson-server");
const { quantize, mergeArcs } = req("topojson-client");
const DEG = Math.PI / 180;

function simplify(pts, tol) { // main.js simplify(), verbatim (as make-country-outlines.mjs)
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const k = Math.cos(((pts[a][1] + pts[b][1]) / 2) * DEG);
    const ax = pts[a][0] * k, ay = pts[a][1], dx = pts[b][0] * k - ax, dy = pts[b][1] - ay, len = Math.hypot(dx, dy);
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
const polyGeoms = (g) => (g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : []);

for (const name of ["used", "all"]) for (const TOL of [0.02, 0.01, 0.05]) {
  const fc = JSON.parse(readFileSync(`.build-tmp/regions/regions-${name}.geojson`, "utf8"));
  const topo = topology({ data: fc });
  const by = new Map();
  for (const g of topo.objects.data.geometries) {
    const r = g.properties.r; if (!by.has(r)) by.set(r, { key: g.properties.key, polys: [] });
    by.get(r).polys.push(...polyGeoms(g));
  }
  const geoms = [...by].map(([r, v]) => {
    const m = mergeArcs(topo, v.polys.map((arcs) => ({ type: "Polygon", arcs })));
    return { type: m.type, arcs: m.arcs, id: r, properties: { k: v.key } };
  });
  // keep only arcs still referenced, renumbered
  const remap = new Map(), arcs = [];
  const map = (a) => { const i = a < 0 ? ~a : a; if (!remap.has(i)) remap.set(i, arcs.push(topo.arcs[i]) - 1); const j = remap.get(i); return a < 0 ? ~j : j; };
  for (const g of geoms) g.arcs = g.type === "Polygon" ? g.arcs.map((r) => r.map(map)) : g.arcs.map((p) => p.map((r) => r.map(map)));
  const simple = arcs.map((a) => closed(a) ? (() => { const h = a.length >> 1; return [...simplify(a.slice(0, h + 1), TOL).slice(0, -1), ...simplify(a.slice(h), TOL)]; })() : simplify(a, TOL));
  const ringPts = (ring, A) => ring.reduce((n, a) => n + A[a < 0 ? ~a : a].length - 1, 0);
  for (const g of geoms) for (const ring of polyGeoms(g).flat()) if (ringPts(ring, simple) < 3) for (const a of ring) { const i = a < 0 ? ~a : a; simple[i] = arcs[i]; }
  const t = { type: "Topology", arcs: simple, objects: { data: { type: "GeometryCollection", geometries: geoms } } };
  const out = quantize(t, { scale: [1e-4, 1e-4], translate: [-180, -90] });
  const json = JSON.stringify(out);
  // interior arcs = arcs used by two different regions of the same game key (what Step B would stroke
  // in addition to the country outline)
  const owners = new Map();
  for (const g of geoms) for (const ring of polyGeoms(g).flat()) for (const a of ring) { const i = a < 0 ? ~a : a; (owners.get(i) ?? owners.set(i, new Set()).get(i)).add(g.id); }
  let interior = 0, interiorPts = 0;
  for (const [i, s] of owners) if (s.size > 1) { interior++; interiorPts += simple[i].length; }
  console.log(`${name.padEnd(4)} tol ${TOL}: ${geoms.length} regions, ${simple.length} arcs, ${simple.reduce((n, a) => n + a.length, 0)} pts, ` +
    `raw ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB, gz ${(gzipSync(json, { level: 9 }).length / 1024).toFixed(0)} KB; interior arcs ${interior} (${interiorPts} pts)`);
}

// Variant "interior only": Step B strokes only region edges that are not already the country outline, so
// ship just the interior arcs (shared by two regions of one key) plus per-region arc-index lists.
for (const name of ["used", "all"]) {
  const TOL = 0.02;
  const fc = JSON.parse(readFileSync(`.build-tmp/regions/regions-${name}.geojson`, "utf8"));
  const topo = topology({ data: fc });
  const by = new Map();
  for (const g of topo.objects.data.geometries) { const r = g.properties.r; if (!by.has(r)) by.set(r, []); by.get(r).push(...polyGeoms(g)); }
  const owners = new Map();
  for (const [r, polys] of by) {
    const m = mergeArcs(topo, polys.map((arcs) => ({ type: "Polygon", arcs })));
    for (const ring of polyGeoms(m).flat()) for (const a of ring) { const i = a < 0 ? ~a : a; (owners.get(i) ?? owners.set(i, new Set()).get(i)).add(r); }
  }
  const arcs = [], regions = {};
  for (const [i, s] of owners) if (s.size > 1) {
    const a = topo.arcs[i];
    const j = arcs.push(closed(a) ? (() => { const h = a.length >> 1; return [...simplify(a.slice(0, h + 1), TOL).slice(0, -1), ...simplify(a.slice(h), TOL)]; })() : simplify(a, TOL)) - 1;
    for (const r of s) (regions[r] ??= []).push(j);
  }
  const t = { type: "Topology", arcs, objects: {} };
  const out = quantize(t, { scale: [1e-4, 1e-4], translate: [-180, -90] });
  out.regions = regions;
  const json = JSON.stringify(out);
  console.log(`interior-only ${name}: ${Object.keys(regions).length} regions with interior edges, ${arcs.length} arcs, ${arcs.reduce((n, a) => n + a.length, 0)} pts, raw ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB, gz ${(gzipSync(json, { level: 9 }).length / 1024).toFixed(0)} KB`);
}

// Correct "used" interior variant: interior = shared by two regions in the FULL layer (a used region's border
// with an unused neighbour is still interior), then keep only arcs a used region needs.
{
  const TOL = 0.02;
  const used = new Set(JSON.parse(readFileSync(".build-tmp/regions/regions-used.geojson", "utf8")).features.map((f) => f.properties.r));
  const fc = JSON.parse(readFileSync(".build-tmp/regions/regions-all.geojson", "utf8"));
  const topo = topology({ data: fc });
  const by = new Map();
  for (const g of topo.objects.data.geometries) { const r = g.properties.r; if (!by.has(r)) by.set(r, []); by.get(r).push(...polyGeoms(g)); }
  const owners = new Map();
  for (const [r, polys] of by) {
    const m = mergeArcs(topo, polys.map((arcs) => ({ type: "Polygon", arcs })));
    for (const ring of polyGeoms(m).flat()) for (const a of ring) { const i = a < 0 ? ~a : a; (owners.get(i) ?? owners.set(i, new Set()).get(i)).add(r); }
  }
  const arcs = [], regions = {};
  for (const [i, s] of owners) if (s.size > 1 && [...s].some((r) => used.has(r))) {
    const a = topo.arcs[i];
    const j = arcs.push(closed(a) ? (() => { const h = a.length >> 1; return [...simplify(a.slice(0, h + 1), TOL).slice(0, -1), ...simplify(a.slice(h), TOL)]; })() : simplify(a, TOL)) - 1;
    for (const r of s) if (used.has(r)) (regions[r] ??= []).push(j);
  }
  const out = quantize({ type: "Topology", arcs, objects: {} }, { scale: [1e-4, 1e-4], translate: [-180, -90] });
  out.regions = regions;
  const json = JSON.stringify(out);
  const none = [...used].filter((r) => !regions[r]);
  console.log(`interior-only used(from all): ${Object.keys(regions).length} regions, ${arcs.length} arcs, ${arcs.reduce((n, a) => n + a.length, 0)} pts, raw ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB, gz ${(gzipSync(json, { level: 9 }).length / 1024).toFixed(0)} KB; used regions with NO interior edge: ${none.length} ${none.join(" ")}`);
}

// Junction check: where an interior region edge ends on the country outline, how far is its endpoint from
// the shipped P1 outline (assets/country-outlines.topo.json, decoded)? Large gaps = visible dangling ends.
{
  const { feature } = req("topojson-client");
  const P1 = JSON.parse(readFileSync("assets/country-outlines.topo.json", "utf8"));
  const segs = [];
  for (const f of feature(P1, P1.objects.data).features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of polys) for (const r of p) for (let i = 1; i < r.length; i++) segs.push([r[i - 1], r[i]]);
  }
  const cell = new Map(), key = (x, y) => `${Math.floor(x)},${Math.floor(y)}`;
  for (const s of segs) for (let x = Math.floor(Math.min(s[0][0], s[1][0])); x <= Math.floor(Math.max(s[0][0], s[1][0])); x++)
    for (let y = Math.floor(Math.min(s[0][1], s[1][1])); y <= Math.floor(Math.max(s[0][1], s[1][1])); y++) (cell.get(`${x},${y}`) ?? cell.set(`${x},${y}`, []).get(`${x},${y}`)).push(s);
  const segKm = (x, y, a, b) => { const k = Math.cos(y * DEG); const ax = (a[0] - x) * k, ay = a[1] - y, bx = (b[0] - x) * k, by = b[1] - y; const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0; return Math.hypot(ax + t * dx, ay + t * dy) * 111.32; };
  const near = (x, y) => { let b = Infinity; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of cell.get(key(x + i, y + j)) ?? []) b = Math.min(b, segKm(x, y, s[0], s[1])); return b; };
  const used = new Set(JSON.parse(readFileSync(".build-tmp/regions/regions-used.geojson", "utf8")).features.map((f) => f.properties.r));
  const fc = JSON.parse(readFileSync(".build-tmp/regions/regions-all.geojson", "utf8"));
  const topo = topology({ data: fc });
  const deg = new Map(), owners = new Map(), by = new Map();
  for (const g of topo.objects.data.geometries) { const r = g.properties.r; if (!by.has(r)) by.set(r, []); by.get(r).push(...polyGeoms(g)); }
  for (const [r, polys] of by) { const m = mergeArcs(topo, polys.map((arcs) => ({ type: "Polygon", arcs }))); for (const ring of polyGeoms(m).flat()) for (const a of ring) { const i = a < 0 ? ~a : a; (owners.get(i) ?? owners.set(i, new Set()).get(i)).add(r); } }
  const inter = [...owners].filter(([, s]) => s.size > 1 && [...s].some((r) => used.has(r))).map(([i]) => topo.arcs[i]);
  // an endpoint is a junction with the outline if it is not shared by another interior arc end (degree 1)
  const pk = (p) => p.join(","); for (const a of inter) for (const p of [a[0], a.at(-1)]) deg.set(pk(p), (deg.get(pk(p)) ?? 0) + 1);
  const d = []; for (const a of inter) for (const p of [a[0], a.at(-1)]) if (deg.get(pk(p)) === 1 || owners.size === 0) d.push(near(p[0], p[1]));
  d.sort((a, b) => a - b); const q = (f) => d[Math.min(d.length - 1, Math.floor(f * d.length))].toFixed(2);
  console.log(`junctions: ${d.length} interior-edge endpoints meeting the outline; km to P1 outline p50 ${q(0.5)} p90 ${q(0.9)} p99 ${q(0.99)} max ${d.at(-1).toFixed(2)}; >2 km: ${d.filter((x) => x > 2).length}`);
}
