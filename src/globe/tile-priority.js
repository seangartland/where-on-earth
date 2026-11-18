// Keep visible tiles ahead of the pan margin, then sharpen outward from the
// focal tile. tx is unwrapped so an antimeridian window remains contiguous.
export function tilePriority(visible, tx, ty, ccx, ccy) {
  return (visible ? 0 : 1000) + Math.hypot(tx + 0.5 - ccx, ty + 0.5 - ccy);
}

export function sortTilesCenterOut(tiles) {
  return tiles.sort((a, b) => a.pri - b.pri);
}
