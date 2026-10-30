#!/usr/bin/env node
// Sources:
// curl -L 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson' -o build/extent-sources/ne_10m_rivers_lake_centerlines.geojson
// curl -L 'https://storage.googleapis.com/teow2016/Ecoregions2017.zip' -o build/extent-sources/Ecoregions2017.zip
//   then unzip it in build/extent-sources/ and run build/extract-sahara-ecoregions.py
//   to produce build/extent-sources/sahara-resolve2017.geojson (RESOLVE Ecoregions
//   2017, ECO_ID 822+842+845: the East, South and West Sahara desert ecoregions).
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
// Same tolerance for the Sahara rings: measured deviation 1.665 km.
const SAHARA_TOLERANCE = 0.015;
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

function simplifyRing(ring, tolerance) {
  const midpoint = ring.length >> 1;
  return [
    ...simplify(ring.slice(0, midpoint + 1), tolerance).slice(0, -1),
    ...simplify(ring.slice(midpoint), tolerance),
  ];
}

const saharaSrc = JSON.parse(readFileSync(new URL('./extent-sources/sahara-resolve2017.geojson', import.meta.url)));
const saharaRawPolygons = saharaSrc.features[0].geometry.coordinates;
let saharaDeviation = 0;
let saharaSourceVertices = 0;
const saharaPolygons = saharaRawPolygons.map((polygon) => polygon.map((ring) => {
  saharaSourceVertices += ring.length;
  const simplified = simplifyRing(ring, SAHARA_TOLERANCE);
  saharaDeviation = Math.max(saharaDeviation, deviation(ring, simplified));
  return simplified;
}));
const saharaVertices = saharaPolygons.flat(2).length;

// Whole-river main stems from Natural Earth 1:10m rivers (2026-10-30 chunk).
// Each river's main stem is the path through the endpoint graph of its NE
// segments between the graph nodes nearest the source and mouth seeds: the
// river's own course under its reach names (the Lualaba is the Congo's upper
// course, the Lancang the Mekong's, the Kagera the Nile's headline source
// branch, the Ertis/Ertix the Irtysh's Kazakh/Chinese reaches). True
// tributaries stay out. The Yukon also takes the unnamed dissolve-648 lake
// reaches between its named segments above Whitehorse. Assembled length vs
// the conventional published length is gated at 80%: Parana (66%) and Murray
// (59%) failed and are held out; see docs/rivers-additions-report-2026-10-30.md.
const RIVER_TOLERANCE = 0.015;
const neRivers = JSON.parse(readFileSync(new URL('./extent-sources/ne_10m_rivers_lake_centerlines.geojson', import.meta.url)));
const neSegments = [];
for (const feature of neRivers.features) {
  const lines = feature.geometry.type === 'MultiLineString' ? feature.geometry.coordinates : [feature.geometry.coordinates];
  for (const line of lines) {
    let length = 0;
    for (let i = 1; i < line.length; i++) length += distanceKm(line[i - 1], line[i]);
    neSegments.push({ name: feature.properties.name, dissolve: feature.properties.dissolve, line, length });
  }
}

function assembleRiver(names, dissolves, sourceSeed, mouthSeed) {
  const segs = neSegments.filter((s) => names.includes(s.name) || dissolves.includes(s.dissolve));
  const SNAP = 0.05;
  const nodes = [];
  const nodeKey = (pt) => {
    for (let k = 0; k < nodes.length; k++) {
      if (Math.abs(nodes[k][0] - pt[0]) < SNAP && Math.abs(nodes[k][1] - pt[1]) < SNAP) return k;
    }
    nodes.push(pt);
    return nodes.length - 1;
  };
  const segNodes = segs.map((s) => [nodeKey(s.line[0]), nodeKey(s.line[s.line.length - 1])]);
  const adj = new Map();
  segNodes.forEach(([a, b], i) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push([b, i]);
    adj.get(b).push([a, i]);
  });
  const nearestNode = (seed) => {
    let best = -1; let bestDistance = Infinity;
    nodes.forEach((pt, k) => {
      const d = distanceKm(pt, seed);
      if (d < bestDistance) { bestDistance = d; best = k; }
    });
    return best;
  };
  const src = nearestNode(sourceSeed);
  const dst = nearestNode(mouthSeed);
  const dist = new Map([[src, 0]]);
  const prev = new Map();
  const queue = [[0, src]];
  while (queue.length) {
    let minIndex = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i][0] < queue[minIndex][0]) minIndex = i;
    const [du, u] = queue.splice(minIndex, 1)[0];
    if (du > (dist.get(u) ?? Infinity)) continue;
    if (u === dst) break;
    for (const [v, si] of adj.get(u) ?? []) {
      const w = segs[si].length;
      if ((dist.get(v) ?? Infinity) > du + w) {
        dist.set(v, du + w);
        prev.set(v, [u, si]);
        queue.push([dist.get(v), v]);
      }
    }
  }
  if (!dist.has(dst)) throw new Error('river assembly: no path');
  const path = [];
  let node = dst;
  while (node !== src) {
    const [u, si] = prev.get(node);
    path.push(si);
    node = u;
  }
  path.reverse();
  const points = [];
  let current = src;
  for (const si of path) {
    const [a, b] = segNodes[si];
    const oriented = a === current ? segs[si].line : [...segs[si].line].reverse();
    current = a === current ? b : a;
    if (points.length) points.push(...oriented.slice(1));
    else points.push(...oriented);
  }
  return { points, lengthKm: dist.get(dst) };
}

const RIVERS = {
  'nile-river': { names: ['Nile', 'El Bahr el Abyad', 'Bahr el Jebel', 'Albert Nile', 'Victoria Nile', 'Kagera'], dissolves: [], source: [29.59, -2.98], mouth: [31.24, 30.12], conventionalKm: 6650 },
  'amazon-river': { names: ['Amazonas', 'Ucayali'], dissolves: [], source: [-71.67, -15.34], mouth: [-52.71, -1.58], conventionalKm: 6400 },
  'yangtze-river': { names: ['Yangtze', 'Chang Jiang', 'Jinsha', 'Tongtian'], dissolves: [], source: [92.99, 34.10], mouth: [119.61, 32.20], conventionalKm: 6300 },
  'mississippi-river': { names: ['Mississippi'], dissolves: [], source: [-95.18, 47.22], mouth: [-89.41, 28.94], conventionalKm: 3730 },
  'congo-river': { names: ['Congo', 'Lualaba'], dissolves: [], source: [26.25, -11.74], mouth: [13.18, -5.86], conventionalKm: 4700 },
  'ganges-river': { names: ['Ganges'], dissolves: [], source: [79.84, 30.89], mouth: [90.01, 22.49], conventionalKm: 2525 },
  'danube-river': { names: ['Danube', 'Donau'], dissolves: [], source: [8.18, 48.09], mouth: [29.7, 45.4], conventionalKm: 2850 },
  'yenisei-river': { names: ['Yenisey', 'Verkhniy Yenisey', 'Bol’shoy Yenisey'], dissolves: [], source: [98.73, 52.52], mouth: [83.18, 70.08], conventionalKm: 3487 },
  'yellow-river': { names: ['Huang'], dissolves: [], source: [96.16, 35.13], mouth: [119.03, 37.80], conventionalKm: 5464 },
  'amur-river': { names: ['Amur', 'Heilong Jiang'], dissolves: [], source: [121.41, 53.32], mouth: [140.71, 53.11], conventionalKm: 2824 },
  'mekong-river': { names: ['Mekong', 'Lancang'], dissolves: [], source: [96.94, 31.97], mouth: [106.7, 9.0], conventionalKm: 4350 },
  'mackenzie-river': { names: ['Mackenzie'], dissolves: [], source: [-113.70, 61.25], mouth: [-135.18, 69.26], conventionalKm: 1738 },
  'lena-river': { names: ['Lena'], dissolves: [], source: [107.98, 54.00], mouth: [126.69, 72.29], conventionalKm: 4294 },
  'niger-river': { names: ['Niger'], dissolves: [], source: [-10.73, 9.09], mouth: [5.50, 5.14], conventionalKm: 4180 },
  'volga-river': { names: ['Volga'], dissolves: [], source: [32.60, 57.25], mouth: [47.56, 45.77], conventionalKm: 3530 },
  'yukon-river': { names: ['Yukon'], dissolves: ['648River', '648Lake Centerline'], source: [-134.49, 60.55], mouth: [-164.48, 62.75], conventionalKm: 3190 },
  'indus-river': { names: ['Indus'], dissolves: [], source: [79.73, 32.44], mouth: [67.65, 23.93], conventionalKm: 3180 },
  'zambezi-river': { names: ['Zambezi'], dissolves: [], source: [24.27, -11.38], mouth: [36.13, -18.81], conventionalKm: 2574 },
  'ob-irtysh-river': { names: ['Ob', 'Irtysh', 'Ertis', 'Ertix'], dissolves: [], source: [90.33, 47.65], mouth: [68.96, 66.81], conventionalKm: 5410 },
};

const riverRecords = {};
const riverSummary = {};
for (const [id, river] of Object.entries(RIVERS)) {
  const { points, lengthKm } = assembleRiver(river.names, river.dissolves, river.source, river.mouth);
  const coverage = lengthKm / river.conventionalKm;
  if (coverage < 0.8) throw new Error(`${id} coverage gate failed: ${(coverage * 100).toFixed(1)}%`);
  const simplified = quantize([simplify(points, RIVER_TOLERANCE)])[0];
  const dev = deviation(points, simplified);
  if (dev > 2.5) throw new Error(`${id} deviation gate failed: ${dev}`);
  riverRecords[id] = {
    type: 'line', lines: [simplified],
    source: `Natural Earth 1:10m rivers, ${river.names.join(' + ')} main stem`,
    sourceUrl: 'https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/',
    license: 'Public domain', attribution: 'Natural Earth',
    sourceVertices: points.length, vertices: simplified.length,
    maxDeviationKm: Number(dev.toFixed(3)), lengthKm: Math.round(lengthKm),
  };
  riverSummary[id] = { lengthKm: Math.round(lengthKm), coveragePct: Number((coverage * 100).toFixed(1)), vertices: simplified.length, maxDeviationKm: Number(dev.toFixed(3)) };
}

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
  'sahara': {
    type: 'polygon', polygons: saharaPolygons.map((polygon) => quantize(polygon)),
    source: 'RESOLVE Ecoregions 2017, East Sahara Desert + South Sahara desert + West Sahara desert ecoregions (ECO_ID 822, 842, 845)',
    sourceUrl: 'https://storage.googleapis.com/teow2016/Ecoregions2017.zip',
    license: 'CC BY 4.0', attribution: 'Ecoregions 2017 © RESOLVE',
    sourceVertices: saharaSourceVertices, vertices: saharaVertices, maxDeviationKm: Number(saharaDeviation.toFixed(3)),
  },
  ...riverRecords,
};

const text = `${JSON.stringify(records, null, 2)}\n`;
const recordBytes = Object.fromEntries(Object.entries(records).map(([id, record]) => [id, Buffer.byteLength(JSON.stringify(record))]));
for (const [id, bytes] of Object.entries(recordBytes)) if (bytes > 100_000) throw new Error(`${id} exceeds 100 KB`);
if (reefDeviation > 2.5) throw new Error(`Reef deviation gate failed: ${reefDeviation}`);
if (saharaDeviation > 2.5) throw new Error(`Sahara deviation gate failed: ${saharaDeviation}`);
if (Buffer.byteLength(text) > 500_000) throw new Error('extent sidecar exceeds 500 KB');
writeFileSync(new URL('../assets/extents.json', import.meta.url), text);
console.log(JSON.stringify({
  rawBytes: Buffer.byteLength(text), gzipBytes: gzipSync(text).length,
  reef: { sourceVertices: rawReef.length, vertices: reef.length, maxDeviationKm: reefDeviation },
  canyon: { vertices: canyon.flat().length },
  sahara: { sourceVertices: saharaSourceVertices, vertices: saharaVertices, maxDeviationKm: saharaDeviation }, rivers: riverSummary, recordBytes,
}, null, 2));
