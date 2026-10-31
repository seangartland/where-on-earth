#!/usr/bin/env node
// Sources:
// curl -L 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson' -o build/extent-sources/ne_10m_rivers_lake_centerlines.geojson
// curl -L 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson' -o build/extent-sources/ne_10m_lakes.geojson
// curl -L 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_geography_marine_polys.geojson' -o build/extent-sources/ne_10m_geography_marine_polys.geojson
// curl -L 'https://storage.googleapis.com/teow2016/Ecoregions2017.zip' -o build/extent-sources/Ecoregions2017.zip
//   then unzip it in build/extent-sources/ and run build/extract-sahara-ecoregions.py
//   to produce build/extent-sources/sahara-resolve2017.geojson (RESOLVE Ecoregions
//   2017, ECO_ID 822+842+845: the East, South and West Sahara desert ecoregions),
//   and build/extract-desert-ecoregions.py to produce the single-ecoregion
//   desert sources (Mojave ECO_ID 433, Namib 103, Atacama 598).
// curl -L 'https://api.openstreetmap.org/api/0.6/relation/318110/full' -o build/extent-sources/wall-full.osm
// curl -L 'https://api.openstreetmap.org/api/0.6/relation/318110.json' -o build/extent-sources/wall-relation.json
// curl -G 'https://services1.arcgis.com/HrMiNYsSqqPpLTDE/ArcGIS/rest/services/GBR_Marine_Park_web/FeatureServer/2/query' --data-urlencode 'where=1=1' --data-urlencode 'outFields=*' --data-urlencode 'returnGeometry=true' --data-urlencode 'geometryPrecision=5' --data-urlencode 'f=geojson' -o build/extent-sources/gbrmpa-boundary.geojson
// python3 build/fetch-diffuse-polygons.py
//   writes build/extent-sources/<id>-osm.geojson for the eight diffuse-
//   conversion polygons (UNESCO property / protected-area boundaries as
//   mapped in OpenStreetMap; ODbL, (c) OpenStreetMap contributors).
// python3 build/fetch-borders-polygons.py
//   writes build/extent-sources/<id>-osm.geojson for the borders-program
//   lane B polygons (protected-area and lake boundaries, heritage
//   boundaries and island coastlines as mapped in OpenStreetMap; ODbL,
//   (c) OpenStreetMap contributors).
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
// The 2026-10-30 second rivers round adds four more stems on the same rules:
// the Rhine under Rhine + Rhein + Rhin (its French-bank reach name), the
// Euphrates under Euphrates + Firat + Al Furat assembled from the Karasu
// headstream (the Murat arm's Keban lake centerline ends ~7 km short of the
// weld node and gaps are never bridged), the Colorado (the US river's
// component; NE also draws an Argentine Colorado under the same name) and
// the Missouri as its own card (NE's named Missouri begins at Canyon Ferry
// Lake; the Three Forks reach is not drawn under the name). The Thames is
// held out on the same gate as Parana and Murray: NE's single Thames
// centerline measures 267 km against the 346 km conventional length (77%),
// generalized and ending at Gravesend with the tidal reach undrawn; see
// docs/landforms-additions2-report-2026-10-30.md. The Rio Grande is held
// out on the same gate: NE draws the whole river under its own name,
// source to mouth, but the assembled stem measures 2,426 km against the
// 3,057 km conventional length (79%), the 1:10m generalization of a
// heavily meandering course; see docs/sweep-glaring-report-2026-10-30.md.
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
  'rhine-river': { names: ['Rhine', 'Rhein', 'Rhin'], dissolves: [], source: [8.67, 46.63], mouth: [4.06, 51.98], conventionalKm: 1230 },
  'euphrates-river': { names: ['Euphrates', 'Firat', 'Murat', 'Al Furat'], dissolves: [], source: [41.46, 40.18], mouth: [47.47, 30.97], conventionalKm: 2800 },
  'colorado-river': { names: ['Colorado'], dissolves: [], source: [-105.83, 40.47], mouth: [-114.85, 31.85], conventionalKm: 2330 },
  'missouri-river': { names: ['Missouri'], dissolves: [], source: [-111.51, 45.93], mouth: [-90.18, 38.81], conventionalKm: 3767 },
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

// Diffuse-conversion polygons (2026-10-30, docs/diffuse-review-2026-10-30.md):
// UNESCO World Heritage property / protected-area boundaries as mapped in
// OpenStreetMap, fetched by build/fetch-diffuse-polygons.py. Same treatment
// as the Reef and the Sahara: 0.015 degree tolerance, deviation measured per
// ring against the source ring and gated at 2.5 km.
const DIFFUSE_TOLERANCE = 0.015;
const DIFFUSE_POLYGONS = {
  'nazca-lines': { file: 'nazca-lines-osm.geojson', source: 'Lines and Geoglyphs of Nasca and Palpa, UNESCO World Heritage property boundary (ref 700) via OpenStreetMap relation 2729059', sourceUrl: 'https://www.openstreetmap.org/relation/2729059' },
  'ha-long-bay': { file: 'ha-long-bay-osm.geojson', source: 'Ha Long Bay - Cat Ba Archipelago, UNESCO World Heritage property boundary (ref 672) via OpenStreetMap relation 19465352', sourceUrl: 'https://www.openstreetmap.org/relation/19465352' },
  'kakadu': { file: 'kakadu-osm.geojson', source: 'Kakadu National Park boundary (WDPA site 67763; UNESCO World Heritage property ref 147) via OpenStreetMap relation 13000016', sourceUrl: 'https://www.openstreetmap.org/relation/13000016' },
  'lencois-maranhenses': { file: 'lencois-maranhenses-osm.geojson', source: 'Lençóis Maranhenses National Park boundary (UNESCO World Heritage property ref 1611) via OpenStreetMap relation 7458131', sourceUrl: 'https://www.openstreetmap.org/relation/7458131' },
  'redwood-national-and-state-parks': { file: 'redwood-osm.geojson', source: 'Redwood National and State Parks, UNESCO World Heritage property boundary (ref 134) via OpenStreetMap relation 9592632', sourceUrl: 'https://www.openstreetmap.org/relation/9592632' },
  'wadi-rum': { file: 'wadi-rum-osm.geojson', source: 'Wadi Rum Protected Area, UNESCO World Heritage property boundary (ref 1377) via OpenStreetMap way 243200322', sourceUrl: 'https://www.openstreetmap.org/way/243200322' },
  'zhangjiajie-national-forest-park': { file: 'zhangjiajie-osm.geojson', source: 'Wulingyuan Scenic and Historic Interest Area, UNESCO World Heritage property boundary (ref 640) via OpenStreetMap relation 18589298', sourceUrl: 'https://www.openstreetmap.org/relation/18589298' },
  'guilin-karst': { file: 'guilin-karst-osm.geojson', source: 'Guilin Karst core areas (Putao and Lijiang), South China Karst UNESCO World Heritage property boundary (ref 1248) via OpenStreetMap relations 21132393 and 21263564', sourceUrl: 'https://www.openstreetmap.org/relation/21263564' },
};
const diffuseRecords = {};
const diffuseSummary = {};
for (const [id, spec] of Object.entries(DIFFUSE_POLYGONS)) {
  const src = JSON.parse(readFileSync(new URL(`./extent-sources/${spec.file}`, import.meta.url)));
  const rawPolygons = src.geometry.coordinates;
  let maxDev = 0;
  let sourceVertices = 0;
  const polygons = rawPolygons.map((polygon) => polygon.map((ring) => {
    sourceVertices += ring.length;
    const simplified = simplifyRing(ring, DIFFUSE_TOLERANCE);
    maxDev = Math.max(maxDev, deviation(ring, simplified));
    return simplified;
  }));
  if (maxDev > 2.5) throw new Error(`${id} deviation gate failed: ${maxDev}`);
  const quantized = polygons.map((polygon) => quantize(polygon));
  const vertices = quantized.flat(2).length;
  diffuseRecords[id] = {
    type: 'polygon', polygons: quantized,
    source: spec.source, sourceUrl: spec.sourceUrl,
    license: 'ODbL', attribution: '© OpenStreetMap contributors',
    sourceVertices, vertices, maxDeviationKm: Number(maxDev.toFixed(3)),
  };
  diffuseSummary[id] = { sourceVertices, vertices, maxDeviationKm: Number(maxDev.toFixed(3)) };
}

// Border-conversion polygons, program lane A (2026-10-30,
// docs/scan5-borders-inventory-2026-10-30.md): subjects with defined borders
// get their actual borders instead of radius circles. Natural Earth 1:10m
// lakes and geography marine polygons (public domain); the Dead Sea is the
// union of its two named basin polygons. Same treatment as the Sahara and
// the diffuse polygons: 0.015 degree tolerance, deviation measured per ring
// against the source ring and gated at 2.5 km. Two inventory entries are
// held out of this block, on measured evidence in
// docs/borders-batch-a-report-2026-10-30.md: aral-sea (the NE polygons are
// the shrunken remnant seas; the card's anchor, the historic lake's P625,
// sits 104.6 km from the nearest remnant shoreline, so the conversion
// cannot pass anchor QA without a pin move Sean has not ruled on) and
// strait-of-gibraltar (NE's named marine feature is five small fragments
// that do not cover the strait's channel or the card's anchor).
const NE_POLYGON_TOLERANCE = 0.015;
function processPolygons(rawPolygons, tolerance) {
  let maxDev = 0;
  let sourceVertices = 0;
  const polygons = rawPolygons.map((polygon) => polygon.map((ring) => {
    sourceVertices += ring.length;
    const simplified = simplifyRing(ring, tolerance);
    maxDev = Math.max(maxDev, deviation(ring, simplified));
    return simplified;
  }));
  const quantized = polygons.map((polygon) => quantize(polygon));
  return { polygons: quantized, sourceVertices, vertices: quantized.flat(2).length, maxDeviationKm: maxDev };
}
const neFeaturePolygons = (collection, names) => collection.features
  .filter((feature) => names.includes(feature.properties.name))
  .flatMap((feature) => (feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates));
const neLakes = JSON.parse(readFileSync(new URL('./extent-sources/ne_10m_lakes.geojson', import.meta.url)));
const neMarine = JSON.parse(readFileSync(new URL('./extent-sources/ne_10m_geography_marine_polys.geojson', import.meta.url)));
const LAKES_URL = 'https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-lakes/';
const MARINE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_geography_marine_polys.geojson';
const NE_LAKE_POLYGONS = {
  'dead-sea': { names: ['Dead Sea'], source: 'Natural Earth 1:10m lakes, "Dead Sea" (northern and southern basin polygons)' },
  'lake-victoria': { names: ['Lake Victoria'], source: 'Natural Earth 1:10m lakes, "Lake Victoria"' },
  'lake-malawi': { names: ['Lake Malawi'], source: 'Natural Earth 1:10m lakes, "Lake Malawi"' },
  'lake-tanganyika': { names: ['Lake Tanganyika'], source: 'Natural Earth 1:10m lakes, "Lake Tanganyika"' },
  'lake-baikal': { names: ['Lake Baikal'], source: 'Natural Earth 1:10m lakes, "Lake Baikal"' },
  'lake-balkhash': { names: ['Lake Balkhash'], source: 'Natural Earth 1:10m lakes, "Lake Balkhash"' },
  'lake-superior': { names: ['Lake Superior'], source: 'Natural Earth 1:10m lakes, "Lake Superior"' },
  'lake-michigan': { names: ['Lake Michigan'], source: 'Natural Earth 1:10m lakes, "Lake Michigan"' },
  'lake-huron': { names: ['Lake Huron'], source: 'Natural Earth 1:10m lakes, "Lake Huron"' },
  'lake-erie': { names: ['Lake Erie'], source: 'Natural Earth 1:10m lakes, "Lake Erie"' },
  'lake-ontario': { names: ['Lake Ontario'], source: 'Natural Earth 1:10m lakes, "Lake Ontario"' },
  'great-salt-lake': { names: ['Great Salt Lake'], source: 'Natural Earth 1:10m lakes, "Great Salt Lake"' },
  'loch-ness': { names: ['Loch Ness'], source: 'Natural Earth 1:10m lakes, "Loch Ness"' },
};
const NE_MARINE_POLYGONS = {
  'caspian-sea': { names: ['Caspian Sea'], source: 'Natural Earth 1:10m geography marine polygons, "Caspian Sea"' },
  'bay-of-fundy': { names: ['Bay of Fundy'], source: 'Natural Earth 1:10m geography marine polygons, "Bay of Fundy"' },
};
const nePolygonRecords = {};
const nePolygonSummary = {};
for (const [id, spec] of Object.entries(NE_LAKE_POLYGONS)) {
  const foundNames = spec.names.filter((name) => neLakes.features.some((feature) => feature.properties.name === name));
  if (foundNames.length !== spec.names.length) throw new Error(`${id}: NE lake feature(s) missing for ${spec.names.filter((name) => !foundNames.includes(name)).join(', ')}`);
  const processed = processPolygons(neFeaturePolygons(neLakes, spec.names), NE_POLYGON_TOLERANCE);
  if (processed.maxDeviationKm > 2.5) throw new Error(`${id} deviation gate failed: ${processed.maxDeviationKm}`);
  nePolygonRecords[id] = {
    type: 'polygon', polygons: processed.polygons,
    source: spec.source, sourceUrl: LAKES_URL,
    license: 'Public domain', attribution: 'Natural Earth',
    sourceVertices: processed.sourceVertices, vertices: processed.vertices, maxDeviationKm: Number(processed.maxDeviationKm.toFixed(3)),
  };
  nePolygonSummary[id] = { sourceVertices: processed.sourceVertices, vertices: processed.vertices, maxDeviationKm: Number(processed.maxDeviationKm.toFixed(3)) };
}
for (const [id, spec] of Object.entries(NE_MARINE_POLYGONS)) {
  const foundNames = spec.names.filter((name) => neMarine.features.some((feature) => feature.properties.name === name));
  if (foundNames.length !== spec.names.length) throw new Error(`${id}: NE marine feature(s) missing for ${spec.names.filter((name) => !foundNames.includes(name)).join(', ')}`);
  const processed = processPolygons(neFeaturePolygons(neMarine, spec.names), NE_POLYGON_TOLERANCE);
  if (processed.maxDeviationKm > 2.5) throw new Error(`${id} deviation gate failed: ${processed.maxDeviationKm}`);
  nePolygonRecords[id] = {
    type: 'polygon', polygons: processed.polygons,
    source: spec.source, sourceUrl: MARINE_URL,
    license: 'Public domain', attribution: 'Natural Earth',
    sourceVertices: processed.sourceVertices, vertices: processed.vertices, maxDeviationKm: Number(processed.maxDeviationKm.toFixed(3)),
  };
  nePolygonSummary[id] = { sourceVertices: processed.sourceVertices, vertices: processed.vertices, maxDeviationKm: Number(processed.maxDeviationKm.toFixed(3)) };
}

// RESOLVE-exact deserts (same program lane): the single ecoregion actually
// named for each subject, extracted by build/extract-desert-ecoregions.py
// and handled exactly like the Sahara (0.015 degree tolerance, per-ring
// deviation gated at 2.5 km).
const RESOLVE_DESERTS = {
  'mojave-desert': { ecoId: 433, ecoName: 'Mojave desert' },
  'namib': { ecoId: 103, ecoName: 'Namib Desert' },
  'atacama': { ecoId: 598, ecoName: 'Atacama desert' },
};
const desertRecords = {};
const desertSummary = {};
for (const [id, spec] of Object.entries(RESOLVE_DESERTS)) {
  const src = JSON.parse(readFileSync(new URL(`./extent-sources/${id}-resolve2017.geojson`, import.meta.url)));
  const processed = processPolygons(src.features[0].geometry.coordinates, NE_POLYGON_TOLERANCE);
  if (processed.maxDeviationKm > 2.5) throw new Error(`${id} deviation gate failed: ${processed.maxDeviationKm}`);
  desertRecords[id] = {
    type: 'polygon', polygons: processed.polygons,
    source: `RESOLVE Ecoregions 2017, ${spec.ecoName} ecoregion (ECO_ID ${spec.ecoId})`,
    sourceUrl: 'https://storage.googleapis.com/teow2016/Ecoregions2017.zip',
    license: 'CC BY 4.0', attribution: 'Ecoregions 2017 © RESOLVE',
    sourceVertices: processed.sourceVertices, vertices: processed.vertices, maxDeviationKm: Number(processed.maxDeviationKm.toFixed(3)),
  };
  desertSummary[id] = { sourceVertices: processed.sourceVertices, vertices: processed.vertices, maxDeviationKm: Number(processed.maxDeviationKm.toFixed(3)) };
}

// Border-conversion polygons, program lane B (2026-10-30,
// docs/scan5-borders-inventory-2026-10-30.md, batches 3, 6, 7, 8):
// protected-area boundaries, lake shorelines, heritage boundaries and
// island coastlines as mapped in OpenStreetMap, fetched by
// build/fetch-borders-polygons.py. Same treatment as the diffuse polygons
// and lane A: 0.015 degree tolerance, deviation measured per ring against
// the source ring and gated at 2.5 km. Three of the brief's targets are
// held out of this block, on measured evidence in
// docs/borders-batch-b-report-2026-10-30.md: daintree-rainforest (the
// inventoried relation 10179476 maps three small reserve parcels totalling
// ~0.5 km2; the card's anchor sits 3.58 km from the nearest parcel edge),
// banaue-rice-terraces-ph (the five UNESCO cluster polygons are the honest
// footprint but the card's anchor sits 4.83 km from the nearest cluster
// edge), chocolate-hills (the card's anchor sits 8.30 km outside the raw
// Natural Monument relation 15100962 boundary), amsterdam-canals-d34-7
// (the city's anchor sits 0.017 km outside the raw Grachtengordel way
// 222278733 boundary, 0.119 km against the simplified ring; this lane does
// not nudge anchors), and strait-of-gibraltar (OSM's only strait feature
// is way 1134960966, an 8-node open GNS label line; no water or strait
// polygon relation covers the channel).
const BORDERS_OSM_TOLERANCE = 0.015;
// Small features (a few km across: Moraine Lake, Lake Bled, Crater Lake,
// the Copacabana beach polygon, the individual Banaue terrace clusters and
// the Amsterdam canal ring) are smaller than
// the standard tolerance and collapse to triangles at 0.015 degrees; they
// use a finer tolerance so the shipped ring keeps the feature's shape. The
// 2.5 km deviation gate is unchanged and measured the same way.
const BORDERS_OSM_FINE_TOLERANCE = 0.002;
const BORDERS_OSM_FINE = new Set(['moraine-lake', 'lake-bled', 'crater-lake', 'copacabana-beach-rio', 'banaue-rice-terraces-ph', 'amsterdam-canals-d34-7', 'daintree-rainforest']);
const BORDERS_OSM_POLYGONS = {
  'kruger-national-park': { file: 'kruger-national-park-osm.geojson', source: 'Kruger National Park boundary via OpenStreetMap relation 1752987', sourceUrl: 'https://www.openstreetmap.org/relation/1752987' },
  'serengeti-national-park': { file: 'serengeti-national-park-osm.geojson', source: 'Serengeti National Park boundary via OpenStreetMap relation 4475047', sourceUrl: 'https://www.openstreetmap.org/relation/4475047' },
  'lake-titicaca': { file: 'lake-titicaca-osm.geojson', source: 'Lake Titicaca shoreline via OpenStreetMap relation 3000330', sourceUrl: 'https://www.openstreetmap.org/relation/3000330' },
  'lake-toba': { file: 'lake-toba-osm.geojson', source: 'Lake Toba shoreline via OpenStreetMap relation 306034', sourceUrl: 'https://www.openstreetmap.org/relation/306034' },
  'crater-lake': { file: 'crater-lake-osm.geojson', source: 'Crater Lake shoreline via OpenStreetMap relation 147401', sourceUrl: 'https://www.openstreetmap.org/relation/147401' },
  'lake-bled': { file: 'lake-bled-osm.geojson', source: 'Lake Bled shoreline via OpenStreetMap relation 646', sourceUrl: 'https://www.openstreetmap.org/relation/646' },
  'lake-como': { file: 'lake-como-osm.geojson', source: 'Lake Como shoreline via OpenStreetMap relation 541757', sourceUrl: 'https://www.openstreetmap.org/relation/541757' },
  'moraine-lake': { file: 'moraine-lake-osm.geojson', source: 'Moraine Lake shoreline via OpenStreetMap way 356877446', sourceUrl: 'https://www.openstreetmap.org/way/356877446' },
  'yellowstone-national-park': { file: 'yellowstone-national-park-osm.geojson', source: 'Yellowstone National Park boundary via OpenStreetMap relation 1453306', sourceUrl: 'https://www.openstreetmap.org/relation/1453306' },
  'grand-teton-national-park': { file: 'grand-teton-national-park-osm.geojson', source: 'Grand Teton National Park boundary via OpenStreetMap relation 1492555', sourceUrl: 'https://www.openstreetmap.org/relation/1492555' },
  'plitvice-lakes': { file: 'plitvice-lakes-osm.geojson', source: 'Plitvice Lakes National Park boundary via OpenStreetMap relation 10047860', sourceUrl: 'https://www.openstreetmap.org/relation/10047860' },
  'masai-mara': { file: 'masai-mara-osm.geojson', source: 'Masai Mara National Reserve boundary via OpenStreetMap relation 15467577', sourceUrl: 'https://www.openstreetmap.org/relation/15467577' },
  'okavango-delta': { file: 'okavango-delta-osm.geojson', source: 'Okavango Delta boundary via OpenStreetMap relation 349348', sourceUrl: 'https://www.openstreetmap.org/relation/349348' },
  'danube-delta': { file: 'danube-delta-osm.geojson', source: 'Danube Delta Biosphere Reserve boundary via OpenStreetMap relation 12436972', sourceUrl: 'https://www.openstreetmap.org/relation/12436972' },
  'bering-strait': { file: 'bering-strait-osm.geojson', source: 'Bering Strait polygon via OpenStreetMap relation 11315299', sourceUrl: 'https://www.openstreetmap.org/relation/11315299' },
  'socotra': { file: 'socotra-osm.geojson', source: 'Socotra island coastline via OpenStreetMap relation 1577075', sourceUrl: 'https://www.openstreetmap.org/relation/1577075' },
  'santorini-caldera': { file: 'santorini-caldera-osm.geojson', source: 'Santorini caldera ring island coastlines (Thera, Thirasia, Aspronisi, Nea Kameni, Palea Kameni) via OpenStreetMap relations 453964, 533902, 533905, 533903, 533904', sourceUrl: 'https://www.openstreetmap.org/relation/453964' },
  'copacabana-beach-rio': { file: 'copacabana-beach-rio-osm.geojson', source: 'Copacabana Beach polygon via OpenStreetMap relation 5514745', sourceUrl: 'https://www.openstreetmap.org/relation/5514745' },
  // The four fixes lane (2026-10-30): conversions lane B held on measured QA
  // and Sean ruled on each. Daintree uses the Daintree National Park
  // boundary (relation 8478278), not the inventory's three reserve parcels
  // (relation 10179476). Banaue is the five UNESCO cluster relations.
  // Amsterdam Canals is the Grachtengordel protected-area way.
  'daintree-rainforest': { file: 'daintree-rainforest-osm.geojson', source: 'Daintree National Park boundary via OpenStreetMap relation 8478278', sourceUrl: 'https://www.openstreetmap.org/relation/8478278' },
  'banaue-rice-terraces-ph': { file: 'banaue-rice-terraces-ph-osm.geojson', source: 'Rice Terraces of the Philippine Cordilleras UNESCO cluster boundaries (Batad, Bangaan, Hungduan, Mayoyao, Nagacadan) via OpenStreetMap relations 8167057, 7628655, 7137867, 8171344, 7575218', sourceUrl: 'https://www.openstreetmap.org/relation/8167057' },
  'chocolate-hills': { file: 'chocolate-hills-osm.geojson', source: 'Chocolate Hills Natural Monument boundary via OpenStreetMap relation 15100962', sourceUrl: 'https://www.openstreetmap.org/relation/15100962' },
  'amsterdam-canals-d34-7': { file: 'amsterdam-canals-d34-7-osm.geojson', source: 'Amsterdam Grachtengordel canal ring boundary via OpenStreetMap way 222278733', sourceUrl: 'https://www.openstreetmap.org/way/222278733' },
};
const bordersOsmRecords = {};
const bordersOsmSummary = {};
for (const [id, spec] of Object.entries(BORDERS_OSM_POLYGONS)) {
  const src = JSON.parse(readFileSync(new URL(`./extent-sources/${spec.file}`, import.meta.url)));
  const processed = processPolygons(src.geometry.coordinates, BORDERS_OSM_FINE.has(id) ? BORDERS_OSM_FINE_TOLERANCE : BORDERS_OSM_TOLERANCE);
  if (processed.maxDeviationKm > 2.5) throw new Error(`${id} deviation gate failed: ${processed.maxDeviationKm}`);
  bordersOsmRecords[id] = {
    type: 'polygon', polygons: processed.polygons,
    source: spec.source, sourceUrl: spec.sourceUrl,
    license: 'ODbL', attribution: '© OpenStreetMap contributors',
    sourceVertices: processed.sourceVertices, vertices: processed.vertices, maxDeviationKm: Number(processed.maxDeviationKm.toFixed(3)),
  };
  bordersOsmSummary[id] = { sourceVertices: processed.sourceVertices, vertices: processed.vertices, maxDeviationKm: Number(processed.maxDeviationKm.toFixed(3)) };
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
  ...diffuseRecords,
  ...nePolygonRecords,
  ...desertRecords,
  ...bordersOsmRecords,
};

const text = `${JSON.stringify(records, null, 2)}\n`;
const recordBytes = Object.fromEntries(Object.entries(records).map(([id, record]) => [id, Buffer.byteLength(JSON.stringify(record))]));
for (const [id, bytes] of Object.entries(recordBytes)) if (bytes > 100_000) throw new Error(`${id} exceeds 100 KB`);
if (reefDeviation > 2.5) throw new Error(`Reef deviation gate failed: ${reefDeviation}`);
if (saharaDeviation > 2.5) throw new Error(`Sahara deviation gate failed: ${saharaDeviation}`);
// The sidecar cap was 500 KB when it held 34 records; the 2026-10-30
// borders program takes it to 52 records in this lane (the OSM lane adds
// more), so the cap moves to 1 MB. It stays a blowup guard, not a budget.
if (Buffer.byteLength(text) > 1_000_000) throw new Error('extent sidecar exceeds 1 MB');
writeFileSync(new URL('../assets/extents.json', import.meta.url), text);
console.log(JSON.stringify({
  rawBytes: Buffer.byteLength(text), gzipBytes: gzipSync(text).length,
  reef: { sourceVertices: rawReef.length, vertices: reef.length, maxDeviationKm: reefDeviation },
  canyon: { vertices: canyon.flat().length },
  sahara: { sourceVertices: saharaSourceVertices, vertices: saharaVertices, maxDeviationKm: saharaDeviation }, rivers: riverSummary, diffuse: diffuseSummary, nePolygons: nePolygonSummary, deserts: desertSummary, bordersOsm: bordersOsmSummary, recordBytes,
}, null, 2));
