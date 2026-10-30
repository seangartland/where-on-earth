#!/usr/bin/env node
// Sources:
// curl -L 'https://api.openstreetmap.org/api/0.6/relation/318110/full' -o build/extent-sources/wall-full.osm
// curl -L 'https://api.openstreetmap.org/api/0.6/relation/318110.json' -o build/extent-sources/wall-relation.json
// curl -G 'https://services1.arcgis.com/HrMiNYsSqqPpLTDE/ArcGIS/rest/services/GBR_Marine_Park_web/FeatureServer/2/query' --data-urlencode 'where=1=1' --data-urlencode 'outFields=*' --data-urlencode 'returnGeometry=true' --data-urlencode 'geometryPrecision=5' --data-urlencode 'f=geojson' -o build/extent-sources/gbrmpa-boundary.geojson
//
// The authoritative Wall source is parked in build/extent-sources/ (gitignored)
// pending Sean's revisit. Reef and Canyon remain the live extent paths.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const DEGREES = Math.PI / 180;
// A 0.02 degree Reef simplification measured 2.963 km deviation and failed the
// 2.5 km gate. The verified 0.015 degree result measures 1.662 km.
const REEF_TOLERANCE = 0.015;
function distanceKm(a, b) {
  const p = a[1] * DEGREES;
  const q = b[1] * DEGREES;
  const x = (b[1] - a[1]) * DEGREES;
  const y = (b[0] - a[0]) * DEGREES;
  const h = Math.sin(x / 2) ** 2 + Math.cos(p) * Math.cos(q) * Math.sin(y / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    const cosine = Math.cos((points[start][1] + points[end][1]) / 2 * DEGREES);
    const x = points[start][0] * cosine;
    const y = points[start][1];
    const dx = points[end][0] * cosine - x;
    const dy = points[end][1] - y;
    const length = Math.hypot(dx, dy);
    let selected = -1;
    let maximum = tolerance;
    for (let i = start + 1; i < end; i++) {
      const u = points[i][0] * cosine - x;
      const v = points[i][1] - y;
      const distance = length > 1e-12 ? Math.abs(u * dy - v * dx) / length : Math.hypot(u, v);
      if (distance > maximum) {
        maximum = distance;
        selected = i;
      }
    }
    if (selected >= 0) {
      keep[selected] = 1;
      stack.push([start, selected], [selected, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

const quantize = (lines) => lines.map((line) => line.map(([lng, lat]) => [
  Number(lng.toFixed(4)), Number(lat.toFixed(4)),
]));

function pointSegmentDistance(point, a, b) {
  const cosine = Math.cos(point[1] * DEGREES);
  const x = a[0] * cosine;
  const y = a[1];
  const dx = b[0] * cosine - x;
  const dy = b[1] - y;
  const u = point[0] * cosine - x;
  const v = point[1] - y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, (u * dx + v * dy) / lengthSquared)) : 0;
  return distanceKm(point, [(x + t * dx) / cosine, y + t * dy]);
}

function deviation(raw, simplified) {
  let maximum = 0;
  for (let j = 0; j < raw.length; j++) {
    const samples = [raw[j]];
    if (j + 1 < raw.length) samples.push([(raw[j][0] + raw[j + 1][0]) / 2, (raw[j][1] + raw[j + 1][1]) / 2]);
    for (const point of samples) {
      let nearest = Infinity;
      for (let i = 1; i < simplified.length; i++) nearest = Math.min(nearest, pointSegmentDistance(point, simplified[i - 1], simplified[i]));
      maximum = Math.max(maximum, nearest);
    }
  }
  return maximum;
}

const gbrmpa = JSON.parse(readFileSync(new URL('./extent-sources/gbrmpa-boundary.geojson', import.meta.url)));
const rawReef = gbrmpa.features[0].geometry.coordinates[0];
const midpoint = rawReef.length >> 1;
const reef = [
  ...simplify(rawReef.slice(0, midpoint + 1), REEF_TOLERANCE).slice(0, -1),
  ...simplify(rawReef.slice(midpoint), REEF_TOLERANCE),
];
const reefDeviation = deviation(rawReef, reef);
const rivers = JSON.parse(readFileSync(new URL('../assets/rivers-10m-scalerank.geo.json', import.meta.url)));
const colorado = rivers.features[73].geometry.coordinates;
const canyon = quantize([colorado[2].filter(([lng]) => lng <= -111.6), colorado[3], colorado[4], colorado[5]]);

const records = {
  'great-barrier-reef': {
    type: 'polygon', polygons: [[quantize([reef])[0]]],
    source: 'Great Barrier Reef Marine Park Authority, amalgamated marine park boundary',
    sourceUrl: 'https://services1.arcgis.com/HrMiNYsSqqPpLTDE/ArcGIS/rest/services/GBR_Marine_Park_web/FeatureServer/2',
    license: 'CC BY 4.0', attribution: 'Data courtesy of the Great Barrier Reef Marine Park Authority',
    sourceVertices: rawReef.length, vertices: reef.length, maxDeviationKm: Number(reefDeviation.toFixed(3)),
  },
  'grand-canyon': {
    type: 'line', lines: canyon,
    source: 'Natural Earth 1:10m rivers, Colorado River from Lees Ferry toward Grand Wash Cliffs',
    sourceUrl: 'https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/',
    license: 'Public domain', attribution: 'Natural Earth', vertices: canyon.flat().length,
  },
};

const text = `${JSON.stringify(records, null, 2)}\n`;
const recordBytes = Object.fromEntries(Object.entries(records).map(([id, record]) => [id, Buffer.byteLength(JSON.stringify(record))]));
for (const [id, bytes] of Object.entries(recordBytes)) if (bytes > 100_000) throw new Error(`${id} exceeds 100 KB`);
if (reefDeviation > 2.5) throw new Error(`Reef deviation gate failed: ${reefDeviation}`);
if (Buffer.byteLength(text) > 500_000) throw new Error('extent sidecar exceeds 500 KB');
writeFileSync(new URL('../assets/extents.json', import.meta.url), text);
console.log(JSON.stringify({
  rawBytes: Buffer.byteLength(text), gzipBytes: gzipSync(text).length,
  reef: { sourceVertices: rawReef.length, vertices: reef.length, maxDeviationKm: reefDeviation },
  canyon: { vertices: canyon.flat().length }, recordBytes,
}, null, 2));
