/**
 * Round-trip check: topojson.feature(assets/*.topo.json) must reproduce
 * assets/*.geo.json exactly (same features, properties, geometry types and
 * coordinates to within float noise, ring start points included).
 * Exits nonzero on any mismatch.
 *
 * usage: node build/verify-topojson.mjs
 */
import { readFileSync } from "node:fs";
import { feature } from "../vendor/topojson-client/src/index.js";

const NAMES = ["world", "world-10m", "lakes-10m", "rivers-10m"];
const EPS = 1e-9;
let failed = false;

for (const name of NAMES) {
  const geo = JSON.parse(readFileSync(`assets/${name}.geo.json`, "utf8"));
  const topo = JSON.parse(readFileSync(`assets/${name}.topo.json`, "utf8"));
  const back = feature(topo, topo.objects.data);
  let points = 0;
  let maxErr = 0;
  const errs = [];
  const cmp = (a, b, path) => {
    if (typeof a === "number") {
      const d = Math.abs(a - b);
      if (!(d <= maxErr)) maxErr = d;
      if (!(d <= EPS)) errs.push(`${path}: ${a} vs ${b}`);
      return;
    }
    if (!Array.isArray(b) || a.length !== b.length) {
      errs.push(`${path}: length ${a.length} vs ${b && b.length}`);
      return;
    }
    if (typeof a[0] === "number") points++;
    a.forEach((v, i) => cmp(v, b[i], `${path}[${i}]`));
  };
  if (back.features.length !== geo.features.length) errs.push("feature count differs");
  geo.features.forEach((f, i) => {
    const g = back.features[i];
    if (JSON.stringify(f.properties) !== JSON.stringify(g.properties)) errs.push(`f${i} properties differ`);
    if (f.geometry.type !== g.geometry.type) errs.push(`f${i} type ${f.geometry.type} vs ${g.geometry.type}`);
    cmp(f.geometry.coordinates, g.geometry.coordinates, `f${i}`);
  });
  console.log(`${name}: ${geo.features.length} features, ${points} points, max coord error ${maxErr.toExponential(1)}, ${errs.length ? "FAIL" : "OK"}`);
  if (errs.length) {
    failed = true;
    console.log("  " + errs.slice(0, 5).join("\n  "));
  }
}
process.exit(failed ? 1 : 0);
