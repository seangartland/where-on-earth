export const SEAL_DISCS = Object.freeze({ navy: '#1e4e9c', burgundy: '#7a2230', forest: '#1f4d3a', charcoal: '#2b2f36' });
export const SEAL_MOTIFS = Object.freeze(['globe', 'plane', 'compass', 'camera', 'mountain', 'star']);
const METALS = { bronze: ['#8a5a16', '#d9a44a'], silver: ['#8f979f', '#e8ecf0'], gold: ['#b27c20', '#ffc76a'] };
const svg = (tag, attrs = {}) => { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value)); return node; };
export const initialsFor = (name) => { const words = String(name || '').trim().split(/\s+/).filter(Boolean); return (words.length > 1 ? words.slice(0, 2).map((word) => word[0]).join('') : words[0]?.[0] || 'T').toUpperCase(); };
export function sealConfig(loadout = {}, name = '') { const value = loadout?.v === 2 ? loadout : {}; return { v: 2, initials: /^[A-Za-z]{1,2}$/.test(value.initials || '') ? value.initials.toUpperCase() : initialsFor(name), disc: SEAL_DISCS[value.disc] ? value.disc : 'navy', motif: SEAL_MOTIFS.includes(value.motif) ? value.motif : 'globe', ring: ['level', 'bronze', 'silver', 'gold'].includes(value.ring) ? value.ring : 'level', topper: ['santa-hat', 'antlers', 'leaf-cluster'].includes(value.topper) ? value.topper : null }; }
export function avatarName(id = '') { return String(id).split('-').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' '); }
function motifGlyph(motif) {
  const group = svg('g', { fill: 'none', stroke: '#ffc76a', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); const add = (tag, attrs) => group.append(svg(tag, attrs));
  if (motif === 'globe') { add('circle', { cx: 50, cy: 71, r: 5 }); add('ellipse', { cx: 50, cy: 71, rx: 2.2, ry: 5 }); add('path', { d: 'M45 71h10' }); }
  if (motif === 'plane') add('path', { d: 'M44 73l12-6-5 12-2-5zM49 74l-4 3' });
  if (motif === 'compass') add('path', { d: 'M50 65l2 4 4 2-4 2-2 4-2-4-4-2 4-2z' });
  if (motif === 'camera') { add('rect', { x: 44, y: 67, width: 12, height: 8, rx: 1.5 }); add('path', { d: 'M47 67l1-2h4l1 2' }); add('circle', { cx: 50, cy: 71, r: 2 }); }
  if (motif === 'mountain') { add('path', { d: 'M43 76l5-9 3 5 2-3 4 7zM48 67l1 2 1-1' }); }
  if (motif === 'star') add('path', { fill: '#ffc76a', d: 'M50 64.5l1.8 4 4.3.4-3.2 2.8.9 4.3-3.8-2.2-3.8 2.2.9-4.3-3.2-2.8 4.3-.4z' });
  return group;
}
function topperGlyph(topper) {
  const group = svg('g'); const add = (tag, attrs) => group.append(svg(tag, attrs));
  if (topper === 'santa-hat') { add('path', { d: 'M34 27c5-16 21-23 38-17-8 4-11 12-9 18z', fill: '#c7362f' }); add('circle', { cx: 73, cy: 11, r: 5, fill: '#fff7e8' }); add('path', { d: 'M33 25h34c3 0 4 7 0 8H34c-4-1-4-7-1-8z', fill: '#fff7e8' }); }
  if (topper === 'leaf-cluster') { add('path', { d: 'M33.5 29c-8-8-5-17 5-19 5 7 2 15-5 19zm13-4c-6-10 0-18 10-18 2 9-2 16-10 18zm10 4c0-10 8-15 17-11-2 9-9 13-17 11z', fill: '#c86722' }); add('path', { d: 'M31.5 31c12-8 22-12 39-11', fill: 'none', stroke: '#7a3a16', 'stroke-width': 2.5, 'stroke-linecap': 'round' }); }
  if (topper === 'antlers') { add('path', { d: 'M42 28V11m0 8-8-7m8 1 7-7M58 28V11m0 8 8-7m-8 1-7-7', fill: 'none', stroke: '#75431f', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); }
  return group;
}
export function renderAvatar(loadout, size = 48, opts = {}) {
  const config = sealConfig(loadout, opts.name); const level = Number(opts.level) || 1; const compact = Boolean(opts.compact); const metal = config.ring === 'level' ? (level >= 10 ? 'gold' : level >= 5 ? 'silver' : 'bronze') : config.ring; const [dark, light] = METALS[metal]; const topped = !compact && config.topper;
  const wrap = document.createElement('span'); wrap.className = `paper-atlas-avatar${compact ? ' compact' : ''}`; wrap.style.width = `${size}px`; wrap.style.height = `${size}px`;
  const image = svg('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': `${config.initials} seal` }); const gradientId = `seal-${Math.random().toString(36).slice(2)}`; const gradient = svg('linearGradient', { id: gradientId, x1: 0, y1: 0, x2: 1, y2: 1 }); gradient.append(svg('stop', { offset: '0%', 'stop-color': dark }), svg('stop', { offset: '100%', 'stop-color': light }));
  const cy = topped ? 59 : 50; const outer = topped ? 39 : 48; const inner = topped ? 37 : 46; const disc = topped ? 33 : 42;
  const defs = svg('defs'); defs.append(gradient); image.append(defs, svg('circle', { cx: 50, cy, r: outer, fill: dark }), svg('circle', { cx: 50, cy, r: inner, fill: `url(#${gradientId})` }), svg('circle', { cx: 50, cy, r: disc, fill: SEAL_DISCS[config.disc] }));
  const letters = svg('text', { x: 50, y: topped ? 68 : 60, fill: '#f6edd8', 'font-family': 'Luckiest Guy, sans-serif', 'font-size': topped ? 29 : 34, 'text-anchor': 'middle' }); letters.textContent = config.initials; image.append(letters); if (size >= 40) { const motif = motifGlyph(config.motif); if (topped) motif.setAttribute('transform', 'translate(5 9) scale(.9 1)'); image.append(motif); } if (topped) image.append(topperGlyph(config.topper)); wrap.append(image); return wrap;
}
