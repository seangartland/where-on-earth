//VERSION=3
// The Process API receives the 2025 global mosaic BYOC collection as dated scenes.
// These values lift mosaic land without changing the source reflectance scale.
const REFLECTANCE_GAIN = 2.9;
const GAMMA = 0.9;
const CONTRAST = 1.0;
const SATURATION = 1.05;
const HIGHLIGHT_KNEE = 0.72;
const PREFERRED_MONTHS = __PREFERRED_MONTHS__;

function setup() {
  return {
    input: [
      { bands: ["B02", "B03", "B04", "observations"] }
    ],
    mosaicking: Mosaicking.TILE,
    output: { bands: 4, sampleType: "AUTO" }
  };
}

function chooseSample(samples, scenes) {
  let preferred;
  let best;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (!best || sample.observations > best.observations) best = sample;
    const month = new Date(scenes.tiles[i].date).getUTCMonth() + 1;
    if (PREFERRED_MONTHS.includes(month) && sample.observations > 0 && (!preferred || sample.observations > preferred.observations)) {
      preferred = sample;
    }
  }
  return preferred || best;
}

function tone(value) {
  const lifted = Math.pow(Math.max(0, value / 10000 * REFLECTANCE_GAIN), 1 / GAMMA);
  if (lifted <= HIGHLIGHT_KNEE) return lifted;
  return HIGHLIGHT_KNEE + (1 - HIGHLIGHT_KNEE) * (1 - Math.exp(-(lifted - HIGHLIGHT_KNEE) / (1 - HIGHLIGHT_KNEE)));
}

function evaluatePixel(samples, scenes) {
  const sample = chooseSample(samples, scenes);
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
