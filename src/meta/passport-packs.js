import { packPool, landmarkPackPool, landformPackPool } from './pack-store.js';

export const PASSPORT_PACKS = [
  { type: 'capitals', name: 'World Capitals', art: 'assets/pack-world-capitals.webp' },
  { type: 'landmarks', name: 'Landmarks', art: 'assets/pack-landmarks.webp' },
  { type: 'landforms', name: 'Landforms', art: 'assets/pack-landforms.webp' },
];

const nameOf = (item) => item.short || item.clue || '';

export function passportPackSections(locations, landmarks, visits, meta = {}) {
  const pools = {
    capitals: packPool(locations),
    landmarks: landmarkPackPool(landmarks),
    landforms: landformPackPool(landmarks),
  };
  const packIds = new Set(Object.values(pools).flat().map((item) => item.id));
  const visited = (item) => Object.hasOwn(visits, item.id);
  const earned = (item) => Number(meta[item.id]?.e) > 0;
  const sections = PASSPORT_PACKS.map((pack) => {
    const items = [...pools[pack.type]].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return { ...pack, items, collected: items.filter(earned).length, total: items.length };
  });
  const everythingElse = [...new Map([...locations, ...landmarks].map((item) => [item.id, item])).values()]
    .filter((item) => visited(item) && !packIds.has(item.id))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  return {
    sections,
    everythingElse,
    collected: sections.reduce((sum, section) => sum + section.collected, 0),
    total: sections.reduce((sum, section) => sum + section.total, 0),
  };
}
