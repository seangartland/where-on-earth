/**
 * Build-time: assets/*.geo.json -> assets/*.topo.json (loaded by src/main.js).
 *
 * geo2topo builds the topology (shared arcs, no simplification), then the arcs
 * are quantized onto the source's own 1e-4 degree grid. Every source
 * coordinate already sits on that grid (4 decimals), so quantization is
 * lossless and we still get TopoJSON's compact integer delta encoding.
 *
 * usage: node build/make-topojson.mjs
 * needs: npm i -g topojson-server topojson-client
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";

const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const { quantize } = createRequire(globalRoot + "/")("topojson-client");
const GEO2TOPO = `${globalRoot}/topojson-server/bin/geo2topo`;

// geo2topo rotates closed rings to start at a shared-arc junction. Same shape,
// but main.js simplifies closed rings by splitting at index 0, so a new start
// changes the drawn outline. Any rotated ring gets its own arc in the source
// order instead (only a handful of lake rings, so the size cost is tiny).
function restoreRingStarts(topo, geo) {
  const arcPoints = (i) => (i < 0 ? topo.arcs[~i].slice().reverse() : topo.arcs[i]);
  let restored = 0;
  topo.objects.data.geometries.forEach((g, fi) => {
    const src = geo.features[fi].geometry;
    if (g.type !== src.type) throw new Error(`geometry ${fi}: ${g.type} vs ${src.type}`);
    if (g.type !== "Polygon" && g.type !== "MultiPolygon") return;
    const polys = g.type === "Polygon" ? [g.arcs] : g.arcs;
    const srcPolys = g.type === "Polygon" ? [src.coordinates] : src.coordinates;
    polys.forEach((rings, pi) =>
      rings.forEach((ring, ri) => {
        const want = srcPolys[pi][ri];
        const start = arcPoints(ring[0])[0];
        if (start[0] === want[0][0] && start[1] === want[0][1]) return;
        rings[ri] = [topo.arcs.push(want) - 1];
        restored++;
      })
    );
  });
  return restored;
}

const NAMES =["world", "world-10m", "lakes-10m", "rivers-10m", "rivers-10m-scalerank"];
const GRID = { scale: [1e-4, 1e-4], translate: [-180, -90] };

for (const name of NAMES) {
  const src = `assets/${name}.geo.json`;
  const out = `assets/${name}.topo.json`;
  // object name "data" so the client reads topo.objects.data for every file
  const raw = execFileSync(GEO2TOPO, [`data=${src}`], { encoding: "utf8", maxBuffer: 1 << 28 });
  const topo = JSON.parse(raw);
  const restored = restoreRingStarts(topo, JSON.parse(readFileSync(src, "utf8")));
  if (restored) console.log(`  ${name}: ${restored} rotated rings restored`);
  writeFileSync(out, JSON.stringify(quantize(topo, GRID)));
  const a = statSync(src).size;
  const b = statSync(out).size;
  console.log(`${out}: ${(a / 1024).toFixed(0)} KB -> ${(b / 1024).toFixed(0)} KB (${((1 - b / a) * 100).toFixed(0)}% smaller)`);
}
