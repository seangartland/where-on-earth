// Paper Atlas's compact, deterministic renderer. It intentionally accepts
// only catalog IDs; callers never pass SVG, paths, colors, or transforms.
export const AVATAR_CATALOG = Object.freeze({
  backdrop: ['cream-paper', 'atlas-navy', 'ochre-sun'], skinTone: ['tone-1', 'tone-2', 'tone-3', 'tone-4', 'tone-5', 'tone-6'],
  faceShape: ['oval', 'round', 'angular'], eyes: ['open', 'almond', 'round-eyes', 'hooded'],
  faceDetail: ['clean', 'soft-brows', 'bold-brows', 'freckles', 'travel-lines'], facialHair: ['none', 'stubble', 'mustache', 'short-beard', 'full-beard'],
  hairHeadwear: ['close-crop', 'soft-curls', 'coil-crown', 'long-waves', 'center-part', 'gray-sweep', 'newsboy-cap', 'backward-cap', 'teal-wrap'],
  faceAccessory: ['none', 'round-glasses', 'square-glasses'], clothing: ['cream-field-shirt', 'ochre-scarf', 'atlas-jacket', 'route-jacket', 'map-shirt'],
  travelAccessory: ['none', 'backpack-straps', 'cream-headphones', 'camera'], frame: ['plain-paper', 'postmark'],
});
export const AVATAR_DEFAULT = Object.freeze({ backdrop: 'cream-paper', skinTone: 'tone-4', faceShape: 'oval', eyes: 'open', faceDetail: 'clean', facialHair: 'none', hairHeadwear: 'close-crop', faceAccessory: 'none', clothing: 'cream-field-shirt', travelAccessory: 'none', frame: 'plain-paper' });
const names = (id) => id.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
const tone = ['#F2C6A5', '#E9AF87', '#D9966F', '#C9825B', '#A96545', '#875039'];

export function avatarParts(loadout = {}) { return Object.fromEntries(Object.entries(AVATAR_CATALOG).map(([slot, ids]) => [slot, ids.includes(loadout[slot]) ? loadout[slot] : AVATAR_DEFAULT[slot]])); }
export function avatarName(id) { return names(id); }
export function renderAvatar(loadout, size = 48, compact = false) {
  const p = avatarParts(loadout); const skin = tone[AVATAR_CATALOG.skinTone.indexOf(p.skinTone)];
  const back = p.backdrop === 'atlas-navy' ? '#173E68' : p.backdrop === 'ochre-sun' ? '#D7A63D' : '#F6EDD8';
  const cloth = p.clothing === 'atlas-jacket' ? '#173E68' : p.clothing === 'route-jacket' ? '#2F7D83' : p.clothing === 'map-shirt' ? '#F6EDD8' : p.clothing === 'ochre-scarf' ? '#D7A63D' : '#F6EDD8';
  const hair = p.hairHeadwear.includes('teal') ? '#2F7D83' : p.hairHeadwear.includes('gray') ? '#A8A39A' : p.hairHeadwear.includes('cap') ? '#173E68' : '#102B48';
  const face = p.faceShape === 'round' ? 'M155 148 Q256 75 357 148 L360 290 Q346 360 256 365 Q166 360 152 290Z' : p.faceShape === 'angular' ? 'M157 140 L355 140 L374 280 L318 354 L194 354 L138 280Z' : 'M165 130 Q256 80 347 130 L365 275 Q340 360 256 370 Q172 360 147 275Z';
  const svg = `<svg viewBox="0 0 512 512" aria-hidden="true" focusable="false"><circle data-slot="backdrop" cx="256" cy="256" r="244" fill="${back}"/><path data-slot="body" d="M105 512 Q130 350 256 345 Q382 350 407 512Z" fill="${skin}"/><path data-slot="clothing" d="M75 512 Q100 348 256 352 Q412 348 437 512Z" fill="${cloth}" stroke="#102B48" stroke-width="8"/><path data-slot="faceShape" d="${face}" fill="${skin}" stroke="#102B48" stroke-width="7"/><path data-slot="hairHeadwear" d="M142 205 Q145 70 256 65 Q367 70 370 205 Q330 155 256 165 Q182 155 142 205Z" fill="${hair}" stroke="#102B48" stroke-width="7"/><g data-slot="eyes" fill="#F6EDD8" stroke="#102B48" stroke-width="7"><ellipse cx="216" cy="220" rx="22" ry="${p.eyes === 'hooded' ? 10 : 16}"/><ellipse cx="296" cy="220" rx="22" ry="${p.eyes === 'hooded' ? 10 : 16}"/><circle cx="216" cy="222" r="7" fill="#102B48"/><circle cx="296" cy="222" r="7" fill="#102B48"/></g><path data-slot="faceDetail" d="M185 189 Q216 177 240 190 M272 190 Q296 177 327 189" fill="none" stroke="#102B48" stroke-width="7" stroke-linecap="round"/><path d="M220 303 Q256 324 292 303" fill="none" stroke="#102B48" stroke-width="7" stroke-linecap="round"/><g data-slot="facialHair" fill="#102B48" opacity="${p.facialHair === 'none' ? 0 : .9}"><path d="M205 278 Q256 258 307 278 L294 330 Q256 350 218 330Z"/></g>${p.faceAccessory !== 'none' ? '<g data-slot="faceAccessory" fill="none" stroke="#173E68" stroke-width="8"><circle cx="216" cy="220" r="34"/><circle cx="296" cy="220" r="34"/><path d="M250 220h12"/></g>' : ''}${p.travelAccessory === 'camera' ? '<rect data-slot="travelAccessory" x="322" y="380" width="68" height="53" rx="8" fill="#9A5C3E" stroke="#102B48" stroke-width="7"/>' : ''}<circle data-slot="frame" cx="256" cy="256" r="244" fill="none" stroke="#F6EDD8" stroke-width="${p.frame === 'postmark' ? 18 : 9}" stroke-dasharray="${p.frame === 'postmark' ? '12 7' : '0'}"/></svg>`;
  const wrap = document.createElement('span'); wrap.className = `paper-atlas-avatar${compact ? ' compact' : ''}`; wrap.style.width = `${size}px`; wrap.style.height = `${size}px`; wrap.innerHTML = svg; return wrap;
}
