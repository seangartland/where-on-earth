//VERSION=3
// The Process API receives Q1 through Q4 of the 2025 global mosaic as q1..q4.
// These defaults preserve the CDSE true-colour example's 2.5 reflectance gain.
const REFLECTANCE_GAIN = 2.5;
const GAMMA = 1.0;
const CONTRAST = 1.0;
const SATURATION = 1.0;
const SUMMER_LATITUDE = 23;

function setup() {
  return {
    input: [
      { datasource: "q1", bands: ["B02", "B03", "B04", "observations"] },
      { datasource: "q2", bands: ["B02", "B03", "B04", "observations"] },
      { datasource: "q3", bands: ["B02", "B03", "B04", "observations"] },
      { datasource: "q4", bands: ["B02", "B03", "B04", "observations"] }
    ],
    output: { bands: 4, sampleType: "FLOAT32" }
  };
}

function chooseSample(samples, latitude) {
  const preferred = latitude > SUMMER_LATITUDE ? 2 : latitude < -SUMMER_LATITUDE ? 0 : -1;
  if (preferred >= 0 && samples[preferred].observations > 0) return samples[preferred];
  let best = samples[0];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].observations > best.observations) best = samples[i];
  }
  return best;
}

function tone(value) {
  return Math.pow(Math.max(0, value * REFLECTANCE_GAIN), 1 / GAMMA);
}

function evaluatePixel(samples, scenes, inputMetadata, customData, outputMetadata) {
  const sample = chooseSample(samples, inputMetadata.coordinates.lat);
  if (!sample || sample.observations <= 0) return [0, 0, 0, 0];
  let r = tone(sample.B04);
  let g = tone(sample.B03);
  let b = tone(sample.B02);
  const mean = (r + g + b) / 3;
  r = (mean + (r - mean) * SATURATION - 0.5) * CONTRAST + 0.5;
  g = (mean + (g - mean) * SATURATION - 0.5) * CONTRAST + 0.5;
  b = (mean + (b - mean) * SATURATION - 0.5) * CONTRAST + 0.5;
  return [r, g, b, 1];
}
