// Paper Atlas's deterministic asset compositor. It accepts only catalog IDs;
// callers never pass SVG, paths, colors, or transforms.
export const AVATAR_CATALOG = Object.freeze({
  backdrop: ['cream-paper', 'atlas-navy', 'ochre-sun'], skinTone: ['tone-1', 'tone-2', 'tone-3', 'tone-4', 'tone-5', 'tone-6'],
  faceShape: ['oval', 'round', 'angular'], eyes: ['open', 'almond', 'round-eyes', 'hooded'],
  faceDetail: ['clean', 'soft-brows', 'bold-brows', 'freckles', 'travel-lines'], facialHair: ['none', 'stubble', 'mustache', 'short-beard', 'full-beard'],
  hairHeadwear: ['close-crop', 'soft-curls', 'coil-crown', 'long-waves', 'center-part', 'gray-sweep', 'newsboy-cap', 'backward-cap', 'teal-wrap'],
  faceAccessory: ['none', 'round-glasses', 'square-glasses'], clothing: ['cream-field-shirt', 'ochre-scarf', 'atlas-jacket', 'route-jacket', 'map-shirt'],
  travelAccessory: ['none', 'backpack-straps', 'cream-headphones', 'camera'], frame: ['plain-paper', 'postmark'],
});
export const AVATAR_DEFAULT = Object.freeze({ backdrop: 'cream-paper', skinTone: 'tone-4', faceShape: 'oval', eyes: 'open', faceDetail: 'clean', facialHair: 'none', hairHeadwear: 'close-crop', faceAccessory: 'none', clothing: 'cream-field-shirt', travelAccessory: 'none', frame: 'plain-paper' });
const assetSlot = { skinTone: 'skin-tone', faceShape: 'face-shape', faceDetail: 'face-detail', facialHair: 'facial-hair', hairHeadwear: 'hair-headwear', faceAccessory: 'face-accessory', travelAccessory: 'travel-accessory' };
const names = (id) => id.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
export function avatarParts(loadout = {}) { return Object.fromEntries(Object.entries(AVATAR_CATALOG).map(([slot, ids]) => [slot, ids.includes(loadout[slot]) ? loadout[slot] : AVATAR_DEFAULT[slot]])); }
export function avatarName(id) { return names(id); }
export function renderAvatar(loadout, size = 48, compact = false) {
  const wrap = document.createElement('span'); wrap.className = `paper-atlas-avatar${compact ? ' compact' : ''}`;
  wrap.style.width = `${size}px`; wrap.style.height = `${size}px`;
  const parts = avatarParts(loadout);
  ['backdrop', 'clothing', 'skinTone', 'faceShape', 'eyes', 'faceDetail', 'facialHair', 'hairHeadwear', 'faceAccessory', 'travelAccessory', 'frame'].forEach((slot) => {
    const id = parts[slot];
    const image = document.createElement('img'); image.className = `paper-atlas-layer paper-atlas-${slot}`;
    image.alt = ''; image.setAttribute('aria-hidden', 'true'); image.src = `/assets/avatar/${assetSlot[slot] || slot}/${id}.svg`;
    wrap.append(image);
  });
  return wrap;
}
