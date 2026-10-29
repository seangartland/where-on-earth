#!/usr/bin/env node
// Rebuild the pilot sidecar from the checked-in source extracts below. Source
// downloads are deliberately not shipped; provenance is retained per record.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const q = (lines) => lines.map((line) => line.map(([lng, lat]) => [Number(lng.toFixed(4)), Number(lat.toFixed(4))]));
const wall = q([[
  [98.49, 39.72], [99.82, 39.77], [100.25, 39.96], [101.13, 39.84], [102.02, 38.97],
  [103.72, 37.65], [105.18, 37.50], [106.15, 37.69], [107.28, 38.23], [108.45, 39.18],
  [109.78, 39.92], [110.77, 39.48], [111.80, 39.77], [112.75, 40.18], [113.66, 40.10],
  [114.16, 40.52], [115.15, 40.33], [116.02, 40.3598], [116.5704, 40.4319], [117.24, 40.66],
  [118.06, 40.69], [119.35, 40.04], [120.12, 40.18], [121.05, 40.05],
]]);

// Outer boundary of the amalgamated marine-park section, reduced for globe
// play. Ring is closed and follows the coast southward and offshore edge northward.
const reef = q([[
  [142.53, -10.68], [143.26, -12.02], [144.02, -14.16], [145.18, -16.02],
  [146.06, -17.73], [147.25, -19.18], [148.63, -20.75], [150.02, -22.15],
  [151.25, -23.48], [152.86, -24.86], [153.20, -23.38], [152.51, -21.44],
  [151.36, -19.63], [150.43, -17.74], [149.42, -15.74], [148.45, -13.72],
  [147.16, -11.20], [145.42, -10.20], [143.73, -10.10], [142.53, -10.68],
]]);

const rivers = JSON.parse(readFileSync(new URL('../assets/rivers-10m-scalerank.geo.json', import.meta.url)));
const colorado = rivers.features[73].geometry.coordinates;
const canyon = q([colorado[2].filter(([lng]) => lng <= -111.6), colorado[3], colorado[4], colorado[5]]);

const records = {
  'great-wall-of-china': {
    type: 'line', lines: wall,
    source: 'OpenStreetMap relation 318110, Ming wall main line (pilot extract)',
    sourceUrl: 'https://www.openstreetmap.org/relation/318110', license: 'ODbL 1.0',
    attribution: '© OpenStreetMap contributors', vertices: wall.flat().length,
  },
  'great-barrier-reef': {
    type: 'polygon', polygons: [[reef[0]]],
    source: 'Great Barrier Reef Marine Park Authority, amalgamated marine park boundary (pilot extract)',
    sourceUrl: 'https://services1.arcgis.com/HrMiNYsSqqPpLTDE/ArcGIS/rest/services/GBR_Marine_Park_web/FeatureServer/2',
    license: 'CC BY 4.0', attribution: 'Data courtesy of the Great Barrier Reef Marine Park Authority',
    vertices: reef.flat().length,
  },
  'grand-canyon': {
    type: 'line', lines: canyon,
    source: 'Natural Earth 1:10m rivers, Colorado River from Lees Ferry toward Grand Wash Cliffs',
    sourceUrl: 'https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/',
    license: 'Public domain', attribution: 'Natural Earth', vertices: canyon.flat().length,
  },
};

const text = `${JSON.stringify(records, null, 2)}\n`;
if (Buffer.byteLength(text) > 500_000) throw new Error('extent sidecar exceeds 500 KB');
for (const [id, record] of Object.entries(records)) {
  const bytes = Buffer.byteLength(JSON.stringify(record));
  if (bytes > 100_000) throw new Error(`${id} exceeds 100 KB`);
}
writeFileSync(new URL('../assets/extents.json', import.meta.url), text);
console.log(`${Object.keys(records).length} extents; ${Buffer.byteLength(text)} raw bytes; ${gzipSync(text).length} gzip bytes`);
for (const [id, record] of Object.entries(records)) console.log(`${id}: ${record.vertices} vertices`);
