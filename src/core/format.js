// ---------------------------------------------------------------------------
// Formatting shared across screens (refactor Phase 3). Only formatters whose
// output is byte-identical at every call site live here; per-mode share text
// keeps its own wording and is not routed through this file.
// ---------------------------------------------------------------------------

// Distance label, e.g. "1,234 km".
export function formatKm(km) {
  return `${km.toLocaleString()} km`;
}
