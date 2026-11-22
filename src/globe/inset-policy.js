export function servedRungIndex(ladder, wantedZ, saveData) {
  let index = ladder.findIndex((rung) => rung >= wantedZ);
  if (index < 0) index = ladder.length - 1;
  return saveData && index > 0 ? index - 1 : index;
}

export function insetFetchLimit(loading, normal, burst) {
  return loading ? burst : normal;
}

export const idlePrefetchAllowed = (slow) => !slow;

// Lowest zoom the inset ladder serves. Shared by surface.js and the pilot
// page renderer, so it lives in this leaf module: page-render.js importing
// it from surface.js would close an import cycle the deploy module
// versioner cannot settle.
export const INSET_MIN_Z = 4;
// Target tile texels per device pixel, keyed to the same pixel ratio the
// renderer actually uses (scene.js caps at 3). The old constant assumed a
// 2x cap: on a 3x phone the canvas rendered at 2x and was stretched to the
// screen, and tile picks targeted the 2x buffer, so every layer landed
// about half a level softer than the display (Sean, 2026-11-10).
export const INSET_Q = 1 / Math.min(globalThis.devicePixelRatio || 1, 3);
