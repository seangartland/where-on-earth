export function visibleTileCoordinates(win) {
  const tiles = [];
  for (let y = win.vy0; y <= win.vy1; y++) for (let x = win.vx0; x <= win.vx1; x++) tiles.push({ x: ((x % win.n) + win.n) % win.n, y });
  return tiles;
}
