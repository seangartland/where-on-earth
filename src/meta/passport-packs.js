import { packPool, landmarkPackPool, landformPackPool } from './pack-store.js';

export const PASSPORT_PACKS = [
  { type: 'capitals', name: 'World Capitals', art: 'assets/pack-world-capitals.webp' },
  { type: 'landmarks', name: 'Landmarks', art: 'assets/pack-landmarks.webp' },
  { type: 'landforms', name: 'Landforms', art: 'assets/pack-landforms.webp' },
];

const nameOf = (item) => item.short || item.clue || '';

// Card numbers are derived, never stored: a card's number is its 1-based
// position in its pack's pool, in the order passportPackSections renders
// the pack (alphabetical within the pack). Membership changes renumber
// automatically; when Sean locks the packs, only this helper's source
// changes (to the frozen numbers) and every surface keeps calling it.
export function formatPackCardNumber(number) {
  return String(number).padStart(3, '0');
}

export function packCardNumberMap(locations, landmarks) {
  const { sections } = passportPackSections(locations, landmarks, {});
  const map = new Map();
  for (const section of sections) {
    section.items.forEach((item, index) => map.set(item.id, { pack: section.type, number: index + 1 }));
  }
  return map;
}

export function packCardNumber(locations, landmarks, packType, entryId) {
  const hit = packCardNumberMap(locations, landmarks).get(entryId);
  return hit && hit.pack === packType ? hit.number : null;
}

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
