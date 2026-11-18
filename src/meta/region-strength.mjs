export function regionStrength(entries, continentOrder) {
  const order = new Map(continentOrder.map((continent, index) => [continent, index]));
  const regions = new Map();
  for (const { continent, best } of entries) {
    if (!continent || !Number.isFinite(best)) continue;
    const region = regions.get(continent) || { continent, found: 0, totalBest: 0 };
    region.found += 1;
    region.totalBest += best;
    regions.set(continent, region);
  }
  const rows = [...regions.values()]
    .map(({ continent, found, totalBest }) => ({ continent, found, avgBest: Math.round(totalBest / found), qualifies: found >= 5 }))
    .sort((a, b) => (order.get(a.continent) ?? Infinity) - (order.get(b.continent) ?? Infinity) || a.continent.localeCompare(b.continent));
  const qualifying = rows.filter((row) => row.qualifies);
  const compare = (direction) => (a, b) => direction * (b.avgBest - a.avgBest)
    || b.found - a.found || (order.get(a.continent) ?? Infinity) - (order.get(b.continent) ?? Infinity) || a.continent.localeCompare(b.continent);
  return {
    rows,
    strongest: qualifying.length ? [...qualifying].sort(compare(1))[0] : null,
    weakest: qualifying.length > 1 ? [...qualifying].sort(compare(-1))[0] : null,
  };
}
