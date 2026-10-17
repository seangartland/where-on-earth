const DIFFICULTY_GROUPS = [
  { key: 'common', label: 'Common · 1-3' },
  { key: 'uncommon', label: 'Uncommon · 4-6' },
  { key: 'rare', label: 'Rare · 7-8' },
  { key: 'legendary', label: 'Legendary · 9-10' },
];

export function passportEntryCompare(sort) {
  if (sort === 'atlas') return (a, b) => a.country.localeCompare(b.country) || (a.item.short || '').localeCompare(b.item.short || '');
  if (sort === 'name') return (a, b) => (a.item.short || '').localeCompare(b.item.short || '');
  if (sort === 'distance') return (a, b) => Number(b.visited) - Number(a.visited) || (a.km ?? Infinity) - (b.km ?? Infinity) || a.country.localeCompare(b.country) || (a.item.short || '').localeCompare(b.item.short || '');
  return (a, b) => Number(b.visited) - Number(a.visited) || b.recency - a.recency || a.country.localeCompare(b.country) || (a.item.short || '').localeCompare(b.item.short || '');
}

export function passportGroups(entries, grouping, continentOrder, countryFor) {
  if (grouping === 'none') return [];
  const groups = new Map();
  for (const entry of entries) {
    let key;
    let label;
    let flag = '';
    if (grouping === 'continent') {
      key = entry.continent || 'Other';
      label = key;
    } else if (grouping === 'country') {
      key = entry.country || 'Other';
      label = key;
      flag = countryFor?.(key)?.flag || '';
    } else {
      const band = DIFFICULTY_GROUPS.find((candidate) => candidate.key === entry.band);
      key = band?.key || 'other';
      label = band?.label || 'Other';
    }
    if (!groups.has(key)) groups.set(key, { key, label, flag, entries: [] });
    groups.get(key).entries.push(entry);
  }
  const continentRank = new Map(continentOrder.map((name, index) => [name, index]));
  const difficultyRank = new Map(DIFFICULTY_GROUPS.map((band, index) => [band.key, index]));
  return [...groups.values()].sort((a, b) => {
    if (grouping === 'continent') return (continentRank.get(a.key) ?? Infinity) - (continentRank.get(b.key) ?? Infinity) || a.label.localeCompare(b.label);
    if (grouping === 'difficulty') return (difficultyRank.get(a.key) ?? Infinity) - (difficultyRank.get(b.key) ?? Infinity) || a.label.localeCompare(b.label);
    return a.label.localeCompare(b.label);
  });
}
