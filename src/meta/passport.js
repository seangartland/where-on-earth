// ---------------------------------------------------------------------------
// Passport: the start-screen passport summary, the Passport page (Places,
// Countries and Landmarks tabs), Collections, the postcard detail view, the passport share
// card and the postcard share.
//
// Moved out of main.js in refactor Phase 3. The passport store itself
// (readPassport, recordVisit, earned tiers, the globe dots) stays in main.js
// because the rounds write to it; this module reads it through the host that
// main.js passes in. initPassportHome and initPassport run at the two spots
// the sections used to run, so every element is built in the same order.
// ---------------------------------------------------------------------------
import { currentStreak, statsEntry } from './stats.js';
import { buildPostcardCard, ensurePostcardCardStyles, postcardDisplayName } from './postcard-card.js';

let host = null;
const PASSPORT_STAMPS = 5; // recent photo stamps
const CONTINENT_SHORT = {
  Africa: 'Africa',
  Asia: 'Asia',
  Europe: 'Europe',
  'North America': 'N. America',
  'South America': 'S. America',
  Oceania: 'Oceania',
  Antarctica: 'Antarctica',
};
function passportSummary() {
  const totals = new Map();
  for (const item of host.locations) {
    const name = host.continentOf(item);
    if (name) totals.set(name, (totals.get(name) || 0) + 1);
  }
  const counts = new Map();
  let found = 0;
  let earned = 0;
  for (const id of Object.keys(host.passport.visits)) {
    const item = host.passportLocation(id);
    if (!item) continue; // location retired from locations.json
    found += 1;
    if (host.passport.meta[id]?.e) earned += 1;
    const name = host.continentOf(item); // poles above the boxes still count as found
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  const recent = host.passport.order
    .slice(-40)
    .reverse()
    .map((id) => ({ item: host.passportLocation(id), base: host.passport.visits[id] }))
    .filter((spot) => spot.item);
  return {
    found,
    earned,
    total: host.locations.length,
    recent: recent.slice(0, PASSPORT_STAMPS).filter((spot) => spot.item.image),
    continents: [...totals]
      .map(([name, total]) => ({ name, found: counts.get(name) || 0, total }))
      .sort((a, b) => host.CONTINENT_ORDER.indexOf(a.name) - host.CONTINENT_ORDER.indexOf(b.name)),
  };
}
let passportStyle;

let passportBox;
let passportEls;

export function syncPassport() {
  if (host.passportDirty) host.buildPassportDots();
  const summary = passportSummary();
  passportEls.box.hidden = summary.found === 0;
  host.gameEls.start.classList.toggle('has-passport', summary.found > 0);
  if (!summary.found) return;
  passportEls.found.textContent = summary.found.toLocaleString();
  passportEls.total.textContent = summary.total.toLocaleString();
  passportEls.earned.textContent = summary.earned ? ` · ${summary.earned.toLocaleString()} earned` : '';
  const streak = currentStreak();
  passportEls.streak.textContent = streak ? ` · 🔥 ${streak.toLocaleString()}` : '';
  passportEls.stamps.replaceChildren(...summary.recent.map((spot) => {
    const img = document.createElement('img');
    img.src = spot.item.image;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.dataset.tier = host.tierOf(spot.base);
    img.title = `${spot.item.short || spot.item.clue} · ${spot.base}/1000`;
    img.addEventListener('error', () => img.remove(), { once: true });
    return img;
  }));
  passportEls.continents.replaceChildren(...summary.continents.map((c) => {
    const chip = document.createElement('span');
    chip.textContent = `${CONTINENT_SHORT[c.name] || c.name} ${Math.round((c.found / c.total) * 100)}%`;
    chip.title = `${c.found} of ${c.total} ${c.name} places found`;
    const bar = document.createElement('i');
    bar.style.width = `${((c.found / c.total) * 100).toFixed(1)}%`;
    chip.append(bar);
    return chip;
  }));
}
// Same overlay pattern as the stats screen (a fixed .screen over a frozen start
// screen, closed by ×, backdrop tap or Escape). Cards are rebuilt on each open
// and on each filter change; images lazy-load so a full 986-card passport only
// fetches what scrolls into view.
const DIFFICULTY_BANDS = [
  { key: 'common', label: 'Common', min: 1, max: 3 },
  { key: 'uncommon', label: 'Uncommon', min: 4, max: 6 },
  { key: 'rare', label: 'Rare', min: 7, max: 8 },
  { key: 'legendary', label: 'Legendary', min: 9, max: 10 },
];
const FLAG_RE = /[\u{1F1E6}-\u{1F1FF}]{2}/u;
function difficultyBand(item) {
  const band = DIFFICULTY_BANDS.find((b) => item.difficulty >= b.min && item.difficulty <= b.max);
  return band ? band.key : null;
}

// Shared by the passport grid and the postgame summary cards: everything
// openPostcard()/fillPostcard() need to show a location's detail view.
function buildPassportEntry(item, age) {
  const meta = host.passport.meta[item.id] || {};
  return {
    item,
    visited: host.AUDIT_MODE || host.isVisited(item.id),
    country: host.countryKey(item),
    best: meta.b ?? host.passport.visits[item.id],
    km: meta.d,
    first: meta.f,
    earned: host.AUDIT_MODE ? host.EARN_NEAR : (meta.e || 0),
    earnedAt: meta.ea,
    // Timestamped visits are always newer than legacy ones, which fall back to
    // their place in the recency order (and to the very end if that was capped).
    recency: meta.t ?? (age?.has(item.id) ? age.get(item.id) : -1),
    continent: host.continentOf(item),
    band: difficultyBand(item),
  };
}

export function passportEntryFor(item) {
  return buildPassportEntry(item);
}

function passportEntries() {
  const age = new Map(host.passport.order.map((id, i) => [id, i]));
  return Object.keys(host.passport.visits)
    .map((id) => {
      const item = host.passportLocation(id);
      return item ? buildPassportEntry(item, age) : null; // location retired from locations.json
    })
    .filter(Boolean)
    .sort((a, b) => b.recency - a.recency);
}

// Every location, visited or not — the dex grid's full 1,301 slots.
function passportAllEntries() {
  const age = new Map(host.passport.order.map((id, i) => [id, i]));
  return host.locations.map((item) => buildPassportEntry(item, age));
}

// Built once locations arrive (next to locationIndex, below). Map<countryKey,
// { name, flag, continent, items[] }>: flag is the most frequent clue flag
// among that country's items (territories carry their own flag), continent is
// the majority item.continent.
export let countryIndex = null;
export function buildCountryIndex() {
  const byKey = new Map();
  for (const item of host.locations) {
    const key = host.countryKey(item);
    if (!byKey.has(key)) byKey.set(key, { name: key, items: [], flagCounts: new Map(), continentCounts: new Map() });
    const entry = byKey.get(key);
    entry.items.push(item);
    const flag = host.flagForLocation(item);
    entry.flagCounts.set(flag, (entry.flagCounts.get(flag) || 0) + 1);
    const continent = host.continentOf(item);
    entry.continentCounts.set(continent, (entry.continentCounts.get(continent) || 0) + 1);
  }
  const top = (counts) => [...counts].sort((a, b) => b[1] - a[1])[0][0];
  countryIndex = new Map([...byKey].map(([key, entry]) => [key, {
    name: entry.name,
    flag: top(entry.flagCounts),
    continent: top(entry.continentCounts),
    items: entry.items,
  }]));
  return countryIndex;
}

let passportPageStyle;

export let passportEntry;
export let collectionsEntry;
let homeLinks;

let passportScreen;

let ppEls;
// The Places and Landmarks tabs share one filter system: each is a dex with its
// own controls, slots and filter state (see ppDex()).
let ppPlaces;
let ppLandmarks;
let ppFilterOpenTop = 0;
let ppFilterScrollFrame = 0;

function ppOpenFiltersDex() {
  return [ppPlaces, ppLandmarks].find((dex) => dex.els.filtersToggle.getAttribute('aria-expanded') === 'true');
}

function closePassportFilters() {
  const dex = ppOpenFiltersDex();
  if (!dex) return;
  dex.els.filtersToggle.setAttribute('aria-expanded', 'false');
  dex.els.filters.setAttribute('aria-hidden', 'true');
  dex.els.filters.classList.remove('is-open');
  passportScreen.removeEventListener('scroll', onPassportFilterScroll);
}

function onPassportFilterScroll() {
  if (ppFilterScrollFrame) return;
  ppFilterScrollFrame = requestAnimationFrame(() => {
    ppFilterScrollFrame = 0;
    const top = passportScreen.scrollTop;
    if (top < ppFilterOpenTop) ppFilterOpenTop = top;
    else if (top - ppFilterOpenTop > 24) closePassportFilters();
  });
}

function openPassportFilters(dex) {
  dex.els.filtersToggle.setAttribute('aria-expanded', 'true');
  dex.els.filters.setAttribute('aria-hidden', 'false');
  dex.els.filters.classList.add('is-open');
  ppFilterOpenTop = passportScreen.scrollTop;
  passportScreen.addEventListener('scroll', onPassportFilterScroll, { passive: true });
}

let ppStickyObserver;
// Passport collection share card. It is created here rather than in index.html so
// it stays next to the passport data and can reuse passportEntries() directly.
let PASSPORT_SHARE_URL;
let passportShareStyle;

let passportShareButton;

let passportShareScreen;
let ppsEls;

function passportShareStats() {
  const entries = passportEntries();
  const withKm = entries.filter((e) => e.km != null).sort((a, b) => a.km - b.km);
  return {
    visited: entries.length,
    total: host.locations.length,
    earned: entries.filter((entry) => entry.earned).length,
    bullseyes: entries.filter((entry) => entry.earned >= host.EARN_BULLSEYE).length,
    pinpoints: entries.filter((entry) => entry.earned >= host.EARN_PINPOINT).length,
    streak: currentStreak(),
    top3: withKm.slice(0, 3),
  };
}

function formatShareKm(km) {
  return km < 1 ? '<1 km' : `${Math.round(km).toLocaleString()} km`;
}

function passportShareText(stats) {
  const remaining = stats.total - stats.visited;
  const closest = stats.top3?.length ? `\nClosest: ${stats.top3.map((entry) => `${entry.item.short} ${formatShareKm(entry.km)}`).join(' · ')}` : '';
  return `My Where on Earth Passport:\n📍 ${stats.pinpoints.toLocaleString()} Pinpoints\n🎯 ${stats.bullseyes.toLocaleString()} Bullseyes\n🛂 ${stats.earned.toLocaleString()} Postcards\n🌍 ${stats.visited.toLocaleString()} Visited\n🗺️ ${remaining.toLocaleString()} New places to explore${closest}`;
}

function fillPassportShareCard(stats) {
  ppsEls.visited.textContent = stats.visited.toLocaleString();
  ppsEls.total.textContent = stats.total.toLocaleString();
  ppsEls.barSeen.style.width = `${stats.total ? (stats.visited / stats.total) * 100 : 0}%`;
  ppsEls.barEarned.style.width = `${stats.total ? (stats.earned / stats.total) * 100 : 0}%`;
  ppsEls.earned.textContent = stats.earned.toLocaleString();
  ppsEls.bullseyes.textContent = stats.bullseyes.toLocaleString();
  ppsEls.pinpoints.textContent = stats.pinpoints.toLocaleString();
  ppsEls.top3.replaceChildren();
  ppsEls.best.hidden = !stats.top3?.length;
  ppsEls.streak.hidden = Boolean(stats.top3?.length);
  if (stats.top3?.length) {
    ppsEls.top3.replaceChildren(...stats.top3.map((entry) => {
      const li = document.createElement('li');
      li.className = 'pp-slot';
      li.dataset.earn = host.EARN_NAMES[entry.earned] || 'seen';
      host.applyCardTier(li, entry.item, entry.earned);
      li.append(...passportSlotFace(entry, formatShareKm(entry.km), { flagForPlaceholder: true }));
      return li;
    }));
  }
  while (ppsEls.top3.children.length < 3 && !ppsEls.best.hidden) ppsEls.top3.append(ppMysteryTemplate.cloneNode(true));
  ppsEls.streak.innerHTML = `🔥 <b>${stats.streak.toLocaleString()}</b> day current streak`;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  ctx.stroke();
}

function passportShareImage(stats) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 1200, 800);
  bg.addColorStop(0, '#152756');
  bg.addColorStop(.55, '#15143d');
  bg.addColorStop(1, '#080b20');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, 800);
  const glow = ctx.createRadialGradient(1010, 0, 0, 1010, 0, 430);
  glow.addColorStop(0, 'rgba(132,93,255,.52)');
  glow.addColorStop(1, 'rgba(132,93,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1200, 700);
  ctx.fillStyle = '#8fdfff';
  ctx.font = '800 24px system-ui, sans-serif';
  ctx.fillText('WHERE ON EARTH', 72, 82);
  ctx.fillStyle = '#f7f8ff';
  ctx.font = '900 58px system-ui, sans-serif';
  ctx.fillText('My passport', 72, 150);
  ctx.fillStyle = 'rgba(218,229,255,.72)';
  ctx.font = '800 24px system-ui, sans-serif';
  ctx.fillText('of ' + stats.total.toLocaleString() + ' places visited', 72 + ctx.measureText(stats.visited.toLocaleString()).width + 12, 212);
  ctx.fillStyle = '#67e8ff';
  ctx.font = '900 30px system-ui, sans-serif';
  ctx.fillText(stats.visited.toLocaleString(), 72, 212);
  ctx.fillStyle = 'rgba(157,211,255,.1)';
  ctx.fillRect(72, 230, 1056, 10);
  ctx.fillStyle = 'rgba(193,224,250,.22)';
  ctx.fillRect(72, 230, stats.total ? 1056 * stats.visited / stats.total : 0, 10);
  const earnedGradient = ctx.createLinearGradient(72, 0, 1128, 0);
  earnedGradient.addColorStop(0, '#67e8ff'); earnedGradient.addColorStop(.55, '#c4a8ff'); earnedGradient.addColorStop(1, '#ffd166');
  ctx.fillStyle = earnedGradient;
  ctx.fillRect(72, 230, stats.total ? 1056 * stats.earned / stats.total : 0, 10);
  ctx.fillStyle = '#8fdfff';
  ctx.font = '850 20px system-ui, sans-serif';
  ctx.fillText('CLOSEST GUESSES', 72, 296);

  const tileXs = [72, 432, 792];
  const mystery = (x) => {
    ctx.fillStyle = '#1b2c5a'; ctx.fillRect(x, 316, 336, 224);
    ctx.strokeStyle = 'rgba(193,224,250,.42)'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.strokeRect(x + 2, 318, 332, 220); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(214,220,232,.4)'; ctx.font = '900 80px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', x + 168, 450);
    ctx.font = '900 22px system-ui, sans-serif'; ctx.fillText('???', x + 168, 520); ctx.textAlign = 'left';
  };
  const loadImage = (src) => new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image(); img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 1500);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
  const loads = Promise.all([0, 1, 2].map((i) => {
    const entry = stats.top3?.[i];
    return entry && hasRealPhoto(entry.item) ? loadImage(entry.item.image) : Promise.resolve(null);
  }));
  const drawTile = (entry, img, x) => {
    if (!entry) return mystery(x);
    ctx.fillStyle = '#1b2c5a'; ctx.fillRect(x, 316, 336, 224);
    if (img) {
      const scale = Math.max(336 / img.width, 224 / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.save(); ctx.beginPath(); ctx.rect(x, 316, 336, 224); ctx.clip(); ctx.drawImage(img, x + (336 - w) / 2, 316 + (224 - h) * .2, w, h); ctx.restore();
    } else {
      ctx.fillStyle = '#1b2c5a'; ctx.fillRect(x, 316, 336, 224);
      ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.font = '96px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(host.flagForLocation(entry.item), x + 168, 460); ctx.textAlign = 'left';
    }
    ctx.fillStyle = 'rgba(8,14,32,.78)'; ctx.roundRect(x + 218, 328, 106, 38, 18); ctx.fill();
    ctx.fillStyle = '#e6f0ff'; ctx.font = '800 22px system-ui, sans-serif'; ctx.fillText(formatShareKm(entry.km), x + 230, 354);
    ctx.fillStyle = '#eef2ff'; ctx.font = '800 28px system-ui, sans-serif';
    const flag = host.flagForLocation(entry.item);
    const labelText = entry.item.short || entry.item.clue;
    const label = Array.from(labelText);
    let name = `${labelText} ${flag}`;
    if (ctx.measureText(name).width > 336) {
      while (ctx.measureText(`${label.join('')}… ${flag}`).width > 336 && label.length > 1) label.pop();
      name = `${label.join('')}… ${flag}`;
    }
    ctx.fillText(name, x, 580);
  };
  return loads.then((images) => {
    [0, 1, 2].forEach((i) => drawTile(stats.top3?.[i], images[i], tileXs[i]));
    const boxes = [
      { x: 72, value: stats.earned, label: 'POSTCARDS', color: '#f5fbff' },
      { x: 432, value: stats.bullseyes, label: 'BULLSEYES', color: '#ffd166' },
      { x: 792, value: stats.pinpoints, label: 'PINPOINTS', color: '#ffd166' },
    ];
    boxes.forEach((box) => {
      ctx.fillStyle = 'rgba(4,10,28,.56)'; ctx.strokeStyle = box.color === '#ffd166' ? 'rgba(255,209,102,.48)' : 'rgba(157,211,255,.24)'; ctx.lineWidth = 2; roundRect(ctx, box.x, 616, 336, 104, 20);
      ctx.fillStyle = box.color; ctx.font = '900 48px system-ui, sans-serif'; ctx.fillText(box.value.toLocaleString(), box.x + 28, 680);
      ctx.fillStyle = 'rgba(218,229,255,.64)'; ctx.font = '800 18px system-ui, sans-serif'; ctx.fillText(box.label, box.x + 28, 704);
    });
    if (!stats.top3?.length) { ctx.fillStyle = '#f3ecff'; ctx.font = '800 29px system-ui, sans-serif'; ctx.fillText(`🔥  ${stats.streak.toLocaleString()} day current streak`, 72, 400); }
    ctx.fillStyle = 'rgba(193,224,250,.56)'; ctx.font = '700 21px system-ui, sans-serif'; ctx.fillText('where-on.earth', 72, 768);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  });
}

async function sharePassport() {
  const stats = passportShareStats();
  const text = passportShareText(stats);
  fillPassportShareCard(stats);
  passportShareScreen.hidden = false;
  ppsEls.status.textContent = '';
  await new Promise(requestAnimationFrame);
  try {
    if (navigator.share) {
      const blob = await passportShareImage(stats);
      const file = blob ? new File([blob], 'where-on-earth-passport.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ title: 'My Where on Earth passport', text, url: PASSPORT_SHARE_URL, files: [file] });
      else await navigator.share({ title: 'My Where on Earth passport', text, url: PASSPORT_SHARE_URL });
      ppsEls.status.textContent = 'Passport shared!';
    } else {
      await navigator.clipboard.writeText(`${text}\n${PASSPORT_SHARE_URL}`);
      ppsEls.status.textContent = 'Passport stats copied. Paste them anywhere.';
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
    try {
      await navigator.clipboard.writeText(`${text}\n${PASSPORT_SHARE_URL}`);
      ppsEls.status.textContent = 'Passport stats copied. Paste them anywhere.';
    } catch {
      ppsEls.status.textContent = 'Sharing is unavailable on this browser.';
    }
  }
}

function closePassportShare() {
  passportShareScreen.hidden = true;
  passportShareButton.focus();
}

// One template, cloned for every mystery slot: mysteries never mount an <img>
// and look identical, so building 1,000+ of them is cheap (3 nodes each).
let ppMysteryTemplate;

// passportCard() → passportSlot(): a compact 3-up tile for the dex grid, with a
// mystery branch for unvisited places (Idea 1, docs/passport-redesign-opus.md §2).
function passportSlot(entry) {
  if (!entry.visited) return ppMysteryTemplate.cloneNode(true);
  const earn = host.EARN_NAMES[entry.earned] || 'seen';
  const tier = entry.earned >= host.EARN_PINPOINT ? 'pinpoint' : entry.earned >= host.EARN_BULLSEYE ? 'bullseye' : 'ordinary';
  const tierLabel = tier[0].toUpperCase() + tier.slice(1);
  const hasDistance = Number.isFinite(entry.km);
  const pillText = hasDistance ? formatShareKm(entry.km) : null;
  const li = buildPostcardCard(entry.item, {
    earned: entry.earned,
    earnName: earn,
    entry,
    photo: hasRealPhoto(entry.item) ? 'image' : 'flag',
    scoreText: pillText,
    scoreTier: tier,
  }, {
    variant: 'slot',
    flagForLocation: host.flagForLocation,
    applyCardTier: host.applyCardTier,
    addAuditFlagButton: host.addAuditFlagButton,
  });
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.setAttribute('aria-haspopup', 'dialog');
  li.setAttribute('aria-label', `Open postcard: ${li.querySelector('.pp-slot-name').textContent}, ${tierLabel}${hasDistance ? `, ${pillText}` : ''}`);
  bindPostcard(li, entry);
  return li;
}

function ppTagSlot(li, entry) {
  li.dataset.status = entry.visited ? (entry.earned ? 'earned' : 'seen') : 'unvisited';
  li.dataset.band = entry.band || '';
  li.dataset.continent = entry.continent || '';
}

// Atlas grouping/within-group order: by country, then by name (so a country's
// slots sit together under one flag). Used for every group, and for mysteries
// at the tail of a flat sort (recency/distance are meaningless for them).
function ppAtlasCompare(a, b) {
  return a.country.localeCompare(b.country) || (a.item.short || '').localeCompare(b.item.short || '');
}
const PP_FLAT_COMPARE = {
  distance: (a, b) => (a.km ?? Infinity) - (b.km ?? Infinity),
  name: (a, b) => (a.item.short || '').localeCompare(b.item.short || ''),
  recent: (a, b) => b.recency - a.recency,
};
const PP_STATUS_KEY = 'where-on-earth-passport-status';
const PP_STATUSES = new Set(['earned', 'seen', 'unvisited']);

// One filterable dex per tab. `view` is the tab's container; `names` maps the
// dex body and group controls to their data-pp names in it. `statusKey` is
// Places only: the Landmarks tab keeps its filters in memory (no new key).
function ppDex(view, { noun, sentinel, dex, groupControls, statusKey = null }) {
  const q = (name) => view.querySelector(`[data-pp="${name}"]`);
  return {
    els: {
      filters: q('filters'), filtersToggle: q('filters-toggle'), badge: q('badge'), status: q('status'),
      continent: q('continent'), band: q('band'), sort: q('sort'), shown: q('shown'), empty: q('empty'),
      dex: q(dex), groupControls: q(groupControls), sentinel: q(sentinel),
    },
    noun,
    statusKey,
    statuses: new Set(),
    all: [], // every entry for the open tab, filtered client-side
    groups: [], // atlas sort only: [{ section, name, head }]
    lis: [], // every rendered slot: [{ li, entry }]
  };
}

// The Filters toggle, toolbar close and filter panel, shared by both dex tabs.
function ppFilterControls(id) {
  return `<button type="button" class="pp-filters-btn" data-pp="filters-toggle" aria-expanded="false" aria-controls="${id}" aria-label="Filters, none active">Filters <b class="pp-badge" data-pp="badge" hidden></b></button>
        <button type="button" class="pp-toolbar-close" aria-label="Close passport">×</button>
        <div class="pp-filters" id="${id}" data-pp="filters" aria-hidden="true">
        <div class="pp-status" role="group" aria-label="Filter by status" data-pp="status">
          <button type="button" data-status="all" aria-pressed="true">All</button>
          <button type="button" data-status="earned" aria-pressed="false">Earned</button>
          <button type="button" data-status="seen" aria-pressed="false">Seen</button>
          <button type="button" data-status="unvisited" aria-pressed="false">Unvisited</button>
        </div>
        <select data-pp="continent" aria-label="Filter by continent" hidden><option value="">All continents</option></select>
        <select data-pp="band" aria-label="Filter by rarity"><option value="">All rarities</option></select>
        <select data-pp="sort" aria-label="Sort by">
          <option value="atlas">Atlas</option>
          <option value="recent">Most recent</option>
          <option value="distance">Closest guess</option>
          <option value="name">Name A-Z</option>
        </select>
        <p class="pp-shown" data-pp="shown"></p>
      </div>`;
}

function syncPpStatusButtons(dex) {
  dex.els.status.querySelectorAll('button').forEach((button) => {
    const active = button.dataset.status === 'all' ? dex.statuses.size === 0 : dex.statuses.has(button.dataset.status);
    button.setAttribute('aria-pressed', String(active));
  });
}

const PP_COLLAPSED_KEY = 'where-on-earth-collapsed-continents';
const ppCollapsedContinents = new Set();

function savePpCollapsedContinents() {
  try { localStorage.setItem(PP_COLLAPSED_KEY, JSON.stringify([...ppCollapsedContinents])); }
  catch (error) { host.storageError('Write failed', PP_COLLAPSED_KEY, error); }
}

function ppGroupHeadText(name, items) {
  const visited = items.filter((e) => e.visited).length;
  return `${name} · ${visited.toLocaleString()}/${items.length.toLocaleString()}`;
}

// Shared collapsible <h3 class="pp-group-head"> for both the Places dex
// (atlas sort) and the Countries list (continent sort). `onCollapse`
// toggles whatever that caller's group body is (a <ul>, or a running list
// of row <li>s) and is also called once up front for the saved state.
function ppGroupHead(name, text, onCollapse) {
  const head = document.createElement('h3');
  head.className = 'pp-group-head';
  head.tabIndex = 0;
  head.setAttribute('role', 'button');
  const label = document.createElement('span');
  label.className = 'pp-group-head-text';
  label.textContent = text;
  const chevron = document.createElement('span');
  chevron.className = 'pp-group-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  head.append(label, chevron);
  const apply = (collapsed) => {
    head.setAttribute('aria-expanded', String(!collapsed));
    onCollapse(collapsed);
  };
  head.ppApplyCollapse = apply;
  head.dataset.continent = name;
  const toggle = () => {
    const collapsed = !ppCollapsedContinents.has(name);
    if (collapsed) ppCollapsedContinents.add(name); else ppCollapsedContinents.delete(name);
    savePpCollapsedContinents();
    apply(collapsed);
  };
  head.addEventListener('click', toggle);
  head.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    toggle();
  });
  apply(ppCollapsedContinents.has(name));
  return head;
}

function setPpGroupsCollapsed(container, collapsed) {
  const heads = [...container.querySelectorAll('.pp-group-head')];
  if (!collapsed) ppCollapsedContinents.clear();
  heads.forEach((head) => {
    if (collapsed) ppCollapsedContinents.add(head.dataset.continent);
    head.ppApplyCollapse(collapsed);
  });
  savePpCollapsedContinents();
}

function ppFilteredGroupCount(dex, name) {
  const band = dex.els.band.value;
  return dex.lis.filter(({ li, entry }) => {
    const statusMatch = dex.statuses.size === 0 || dex.statuses.has(li.dataset.status);
    return (entry.continent || 'Other') === name
      && statusMatch
      && (!band || entry.band === band);
  }).length;
}

// Build once per open (or per sort change): every slot renders once, kept in
// dex.lis so status/band/continent filter changes only toggle [hidden]
// (docs/passport-redesign-opus.md §2d).
function renderPassportDex(dex) {
  const sort = dex.els.sort.value;
  const atlas = sort === 'atlas';
  dex.els.continent.hidden = atlas;
  dex.groups = [];
  dex.lis = [];
  const frag = document.createDocumentFragment();
  if (atlas) {
    const byContinent = new Map();
    for (const entry of dex.all) {
      const key = entry.continent || 'Other';
      if (!byContinent.has(key)) byContinent.set(key, []);
      byContinent.get(key).push(entry);
    }
    const order = [...host.CONTINENT_ORDER, ...[...byContinent.keys()].filter((k) => !host.CONTINENT_ORDER.includes(k))];
    for (const name of order) {
      if (!byContinent.has(name)) continue;
      const items = byContinent.get(name).sort(ppAtlasCompare);
      const section = document.createElement('section');
      section.className = 'pp-group';
      section.dataset.continent = name;
      const ul = document.createElement('ul');
      ul.className = 'pp-dex';
      ul.append(...items.map((entry) => {
        const li = passportSlot(entry);
        ppTagSlot(li, entry);
        dex.lis.push({ li, entry });
        return li;
      }));
      const head = ppGroupHead(name, ppGroupHeadText(name, items), (collapsed) => { ul.hidden = collapsed; });
      section.append(head, ul);
      frag.append(section);
      dex.groups.push({ section, name, head });
    }
  } else {
    const visited = dex.all.filter((e) => e.visited).sort(PP_FLAT_COMPARE[sort] || PP_FLAT_COMPARE.recent);
    const mysteries = dex.all.filter((e) => !e.visited).sort(ppAtlasCompare);
    const ordered = [...visited, ...mysteries];
    const CHUNK = 60;
    for (let i = 0; i < ordered.length; i += CHUNK) {
      const ul = document.createElement('ul');
      ul.className = 'pp-dex pp-chunk';
      ul.append(...ordered.slice(i, i + CHUNK).map((entry) => {
        const li = passportSlot(entry);
        ppTagSlot(li, entry);
        dex.lis.push({ li, entry });
        return li;
      }));
      frag.append(ul);
    }
  }
  dex.els.dex.replaceChildren(frag);
  dex.els.groupControls.hidden = !atlas || dex.groups.length === 0;
  applyPassportFilters(dex);
}

// Toggle-only pass: status/band/continent changes never rebuild the dex.
function applyPassportFilters(dex) {
  const band = dex.els.band.value;
  const continent = dex.els.continent.hidden ? '' : dex.els.continent.value;
  let shown = 0;
  for (const { li, entry } of dex.lis) {
    const show = (dex.statuses.size === 0 || dex.statuses.has(li.dataset.status))
      && (!band || entry.band === band)
      && (!continent || li.dataset.continent === continent);
    li.hidden = !show;
    if (show) shown += 1;
  }
  for (const group of dex.groups) {
    const { section, name, head } = group;
    section.hidden = ![...section.querySelectorAll('.pp-slot')].some((li) => !li.hidden);
    const total = section.querySelectorAll('.pp-slot').length;
    const count = ppFilteredGroupCount(dex, name);
    head.querySelector('.pp-group-head-text').textContent = `${name} · ${count.toLocaleString()}/${total.toLocaleString()}`;
  }
  const filtered = dex.statuses.size > 0 || band || continent;
  dex.els.shown.textContent = filtered
    ? (shown ? `${shown.toLocaleString()} of ${dex.all.length.toLocaleString()} shown` : 'No stamps match these filters yet.')
    : `${dex.all.length.toLocaleString()} ${dex.noun}`;
  dex.els.empty.hidden = shown !== 0;
  const active = dex.statuses.size + Number(Boolean(band)) + Number(Boolean(continent));
  dex.els.badge.hidden = active === 0;
  dex.els.badge.textContent = active ? `•${active}` : '';
  dex.els.filtersToggle.classList.toggle('has-active', active > 0);
  dex.els.filtersToggle.setAttribute('aria-label', active ? `Filters, ${active} active` : 'Filters, none active');
}

function renderPassportPage() {
  const visited = passportEntries(); // visited only, for the header stats and share card
  ppPlaces.all = passportAllEntries(); // every location, for the dex grid
  const total = host.locations.length;
  const found = visited.length;
  ppEls.found.textContent = found.toLocaleString();
  ppEls.total.textContent = total.toLocaleString();
  const earned = visited.filter((e) => e.earned).length;
  const bulls = visited.filter((e) => e.earned >= host.EARN_BULLSEYE).length;
  const pins = visited.filter((e) => e.earned >= host.EARN_PINPOINT).length;
  ppEls.earned.hidden = found === 0;
  const stat = (n, label) => `<span class="pp-stat"><b>${n.toLocaleString()}</b> ${label}</span>`;
  ppEls.earned.innerHTML = [stat(earned, 'postcards'), bulls ? stat(bulls, '🎯') : '', pins ? stat(pins, '📍') : ''].filter(Boolean).join(' · ');
  ppEls.bar.setAttribute('aria-valuemax', String(total));
  ppEls.bar.setAttribute('aria-valuenow', String(earned));
  ppEls.fill.style.width = `${total ? (found / total) * 100 : 0}%`;
  ppEls.earnFill.style.width = `${total ? (earned / total) * 100 : 0}%`;
  renderPassportDex(ppPlaces);
}

// ---------------------------------------------------------------------------
// Idea 2: the Countries tab. countryIndex (built once locations arrive, next
// to locationIndex) groups every location by countryKey(); this is a
// list/detail renderer over it, reusing passportSlot() for the detail grid
// (docs/passport-redesign-opus.md §3). England/Scotland/Wales/Northern
// Ireland/United Kingdom stay five separate rows (Sean, 2026-10-11). The list
// cards lead with postcards earned, not places visited, same logic as
// catching vs. seeing (Sean, 2026-10-11, docs/country-cards-opus.md); the
// "12/36" detail-head wording is places visited, unchanged.
// ---------------------------------------------------------------------------

// 338 locations ship Wikimedia's "No image available" graphic instead of a photo.
function hasRealPhoto(item) {
  return Boolean(item.image) && !item.image.includes('No_image_available');
}

function countryProgress(key) {
  const country = countryIndex.get(key);
  let visited = 0;
  let earned = 0;
  let cover = null;
  let coverRank = -1;
  for (const item of country.items) {
    if (!host.AUDIT_MODE && !host.isVisited(item.id)) continue;
    visited += 1;
    const meta = host.passport.meta[item.id] || {};
    if (host.AUDIT_MODE || meta.e) earned += 1;
    if (!hasRealPhoto(item)) continue;
    const rank = (meta.e || 0) * 2000 + (meta.b ?? host.passport.visits[item.id] ?? 0);
    if (rank > coverRank) { cover = { item, earned: meta.e || 0 }; coverRank = rank; }
  }
  return { visited, earned, total: country.items.length, cover };
}

const PP_COUNTRY_SORTS = {
  earned: (a, b) => b.earned - a.earned || a.name.localeCompare(b.name),
  closest: (a, b) => (a.total - a.earned) - (b.total - b.earned) || a.name.localeCompare(b.name),
  alpha: (a, b) => a.name.localeCompare(b.name),
  continent: (a, b) => host.CONTINENT_ORDER.indexOf(a.continent) - host.CONTINENT_ORDER.indexOf(b.continent) || a.name.localeCompare(b.name),
};

function renderCountryList() {
  const rows = [...countryIndex.values()].map((country) => ({
    ...countryProgress(country.name),
    name: country.name,
    flag: country.flag,
    continent: country.continent,
  }));
  const sort = ppEls.countrySort.value;
  rows.sort(PP_COUNTRY_SORTS[sort] || PP_COUNTRY_SORTS.earned);
  const earnedCountries = rows.filter((r) => r.earned > 0).length;
  const completeCountries = rows.filter((r) => r.total > 0 && r.earned === r.total).length;
  ppEls.countrySummary.textContent = `${earnedCountries} of ${rows.length} countries · ${completeCountries} complete`;
  const list = document.createElement('ul');
  list.className = 'pp-dex pp-ccards';
  const countryGroups = sort === 'continent'
    ? [...rows.reduce((groups, row) => {
      const name = row.continent || 'Other';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(row);
      return groups;
    }, new Map())]
    : [['', rows]];
  ppEls.countryGroupControls.hidden = sort !== 'continent' || countryGroups.length === 0;
  countryGroups.forEach(([group, groupRows]) => {
    const groupCards = [];
    if (sort === 'continent') {
      const visited = groupRows.reduce((sum, row) => sum + row.visited, 0);
      const total = groupRows.reduce((sum, row) => sum + row.total, 0);
      const headLi = document.createElement('li');
      headLi.className = 'pp-ccards-head';
      const head = ppGroupHead(group, `${group} · ${visited.toLocaleString()}/${total.toLocaleString()}`, (collapsed) => {
        groupCards.forEach((card) => { card.hidden = collapsed; });
      });
      headLi.append(head);
      list.append(headLi);
    }
    groupRows.forEach((row) => {
    const complete = row.total > 0 && row.earned === row.total;
    const state = row.visited === 0 ? 'unvisited' : row.earned > 0 ? 'earned' : 'seen';
    const li = document.createElement('li');
    li.className = `pp-ccard${complete ? ' is-complete' : ''}`;
    li.dataset.state = state;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `${row.name}: ${row.earned} postcard${row.earned === 1 ? '' : 's'} earned, ${row.visited} of ${row.total} places visited`);
    const photo = document.createElement('div');
    photo.className = 'pp-ccard-photo';
    const flag = document.createElement('span');
    flag.className = 'pp-ccard-flag';
    flag.textContent = row.flag;
    flag.setAttribute('aria-hidden', 'true');
    if (row.cover) {
      const img = document.createElement('img');
      img.src = row.cover.item.image;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => { img.remove(); photo.classList.add('is-flagtile'); }, { once: true });
      photo.append(img);
    } else {
      photo.classList.add('is-flagtile');
    }
    const bar = document.createElement('span');
    bar.className = 'pp-bar pp-ccard-bar';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = `<i class="pp-bar-seen" style="width:${row.total ? (row.visited / row.total) * 100 : 0}%"></i><i class="pp-bar-earned" style="width:${row.total ? (row.earned / row.total) * 100 : 0}%"></i>`;
    photo.append(flag, bar);
    const name = document.createElement('p');
    name.className = 'pp-ccard-name';
    name.textContent = row.name;
    const meta = document.createElement('p');
    meta.className = 'pp-ccard-meta';
    meta.innerHTML = complete ? '✓ Complete' : `<b>${row.earned}</b> postcard${row.earned === 1 ? '' : 's'}`;
    const sub = document.createElement('p');
    sub.className = 'pp-ccard-sub';
    sub.textContent = `${row.visited}/${row.total} places`;
    button.append(photo, name, meta, sub);
    button.addEventListener('click', () => openCountryDetail(row.name));
    li.append(button);
    groupCards.push(li);
  });
    list.append(...groupCards);
  });
  ppEls.countryListBody.replaceChildren(list);
}

function openCountryDetail(key) {
  ppCountryListScroll = passportScreen.scrollTop;
  ppActiveCountry = key;
  renderCountryDetail(key);
}

function renderCountryDetail(key) {
  const country = countryIndex.get(key);
  const age = new Map(host.passport.order.map((id, i) => [id, i]));
  const entries = country.items
    .map((item) => buildPassportEntry(item, age))
    .sort((a, b) => (a.visited === b.visited ? 0 : a.visited ? -1 : 1) || (a.item.short || '').localeCompare(b.item.short || ''));
  const visited = entries.filter((e) => e.visited).length;
  const earned = entries.filter((e) => e.earned).length;
  ppEls.countryHead.innerHTML = `
    <div class="pp-country-head-row">
      <span class="pp-country-head-flag">${country.flag}</span>
      <div><h3></h3><p>${visited} / ${entries.length} places · ${earned} postcard${earned === 1 ? '' : 's'}</p></div>
    </div>
    <span class="pp-bar pp-country-bar"><i class="pp-bar-seen" style="width:${entries.length ? (visited / entries.length) * 100 : 0}%"></i><i class="pp-bar-earned" style="width:${entries.length ? (earned / entries.length) * 100 : 0}%"></i></span>`;
  ppEls.countryHead.querySelector('h3').textContent = country.name;
  ppEls.countryDex.replaceChildren(...entries.map((entry) => {
    const li = passportSlot(entry);
    ppTagSlot(li, entry);
    return li;
  }));
  ppEls.countryList.hidden = true;
  ppEls.countryDetail.hidden = false;
}

function closeCountryDetail() {
  ppActiveCountry = null;
  ppEls.countryDetail.hidden = true;
  ppEls.countryList.hidden = false;
  passportScreen.scrollTop = ppCountryListScroll;
}

// The Landmarks shelf: the curated landmark pool (host.landmarkShelf), apart
// from Places and Countries so a landmark never counts toward a country or
// continent total. Same slots, mystery cards and filters as the city dex.
function renderLandmarkShelf() {
  const age = new Map(host.passport.order.map((id, i) => [id, i]));
  // Audit mode previews the whole landmarks bank, not just expedition stops.
  const shelfItems = host.AUDIT_MODE && host.landmarks?.length ? host.landmarks : host.landmarkShelf();
  const entries = shelfItems.map((item) => buildPassportEntry(item, age));
  const visited = entries.filter((e) => e.visited).length;
  const earned = entries.filter((e) => e.earned).length;
  ppEls.landmarkSummary.textContent = `${earned} of ${entries.length} landmark postcards · ${visited} visited`;
  ppLandmarks.all = entries;
  // Continent choices come from the shelf itself (the curated pool has no
  // Antarctica stop; the audit bank does).
  const { continent } = ppLandmarks.els;
  const picked = continent.value;
  const present = host.CONTINENT_ORDER.filter((name) => entries.some((e) => e.continent === name));
  continent.replaceChildren(new Option('All continents', ''), ...present.map((name) => new Option(name, name)));
  continent.value = present.includes(picked) ? picked : '';
  renderPassportDex(ppLandmarks);
}

const PP_VIEW_KEY = 'where-on-earth-passport-view';
let ppView = 'places';
let ppActiveCountry = null;
let ppCountryListScroll = 0;

function setPassportView(view) {
  closePassportFilters();
  ppView = view;
  // The saved view stays places or countries: no new stored value for the shelf.
  if (view !== 'landmarks') host.safeSetItem(PP_VIEW_KEY, view);
  ppEls.tabs.querySelectorAll('[role="tab"]').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.view === view)));
  ppEls.placesView.hidden = view !== 'places';
  ppEls.countriesView.hidden = view !== 'countries';
  ppEls.landmarksView.hidden = view !== 'landmarks';
  if (view === 'landmarks') renderLandmarkShelf();
  if (view !== 'countries') return;
  if (!countryIndex) buildCountryIndex();
  if (ppActiveCountry) renderCountryDetail(ppActiveCountry);
  else renderCountryList();
}

function openPassport() {
  renderPassportPage();
  ppActiveCountry = null;
  setPassportView(ppView);
  host.gameEls.start.hidden = true;
  passportScreen.hidden = false;
  document.body.className = 'game-passport';
  window.__canGuess = false;
  passportScreen.scrollTop = 0;
  ppEls.close.focus();
}

function closePassport(refocus = true) {
  closePassportFilters();
  passportScreen.hidden = true;
  host.gameEls.start.hidden = false;
  document.body.className = 'game-start';
  syncPassport();
  if (refocus) passportEntry.focus();
}
// After a filter change in a stuck toolbar, land back at the top of the dex.
function ppScrollToDexTop(dex, wasStuck = dex.els.filtersToggle.closest('.pp-toolbar').classList.contains('is-stuck')) {
  if (wasStuck) passportScreen.scrollTop = dex.els.sentinel.offsetTop;
}

// ---------------------------------------------------------------------------
// Collections: the 36 themed sets attached to locations.json. A postcard is
// collected when its passport entry has an earned tier (near or better).
// ---------------------------------------------------------------------------
let collectionsStyle;

const SET_ICONS = ['🌋','🏛️','🏔️','🌊','🏰','🏝️','🌍','🧭'];
let collectionsScreen;
let collectionsBack;
let collectionsSort;
let collectionsSortControl;
let collectionsSortSelect;
let collectionsSortStatus;
let collectionsContent;
const COLLECTION_SORT_KEY = 'where-on-earth-collection-sort';
const COLLECTION_SORTS = new Set(['completion', 'earned', 'closest', 'alpha']);
let collectionSets = [];
let collectionReturn = 'home';
let activeCollection = null;
let collectionSort = 'completion';

function buildCollectionSets() {
  const byName = new Map();
  host.locations.forEach((item) => (item.sets || []).forEach((name) => {
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(item);
  }));
  collectionSets = [...byName].map(([name, items], index) => ({ name, items, icon: SET_ICONS[index % SET_ICONS.length] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function collectionEarn(item) { return host.passport.meta[item.id]?.e || 0; }
function collectionVisited(item) { return host.isVisited(item.id); }

function sortedCollectionSets() {
  const earnedCount = (set) => set.items.filter(collectionEarn).length;
  return [...collectionSets].sort((a, b) => {
    const aEarned = earnedCount(a);
    const bEarned = earnedCount(b);
    let difference = 0;
    if (collectionSort === 'completion') difference = (bEarned * a.items.length) - (aEarned * b.items.length);
    else if (collectionSort === 'earned') difference = bEarned - aEarned;
    else if (collectionSort === 'closest') difference = (a.items.length - aEarned) - (b.items.length - bEarned);
    return difference || a.name.localeCompare(b.name);
  });
}

function collectionThumb(item) {
  const visited = collectionVisited(item);
  const wrap = document.createElement('span');
  wrap.className = `collection-thumb${visited ? '' : ' mystery-photo'}`;
  if (!visited) {
    wrap.setAttribute('aria-label', 'Mystery location, not visited');
    return wrap;
  }
  const img = document.createElement('img');
  img.src = item.image || '';
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => img.remove(), { once: true });
  wrap.append(img);
  return wrap;
}

function renderCollectionsOverview() {
  activeCollection = null;
  collectionsBack.textContent = collectionReturn === 'passport' ? '‹ Passport' : '‹ Home';
  collectionsSortControl.hidden = false;
  collectionsSortStatus.hidden = true;
  const earnedTotal = collectionSets.reduce((sum, set) => sum + set.items.filter(collectionEarn).length, 0);
  const cardTotal = collectionSets.reduce((sum, set) => sum + set.items.length, 0);
  const complete = collectionSets.filter((set) => set.items.every(collectionEarn)).length;
  const header = document.createElement('header');
  header.innerHTML = `<p class="collections-eyebrow">Your album</p><h2>Collections</h2><p class="collections-lede">Every postcard belongs to a set. Fill a set to complete the collection.</p><div class="collections-stats"><div class="collections-stat"><b>${earnedTotal}<small> / ${cardTotal}</small></b><span>Postcards</span></div><div class="collections-stat gold"><b>${complete}</b><span>Sets complete</span></div><div class="collections-stat"><b>${collectionSets.length}</b><span>Sets</span></div></div>`;
  const grid = document.createElement('div');
  grid.className = 'collection-sets';
  sortedCollectionSets().forEach((set) => {
    const earned = set.items.filter(collectionEarn).length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `collection-set${earned === set.items.length ? ' done' : ''}`;
    button.setAttribute('aria-label', `${set.name}: ${earned} of ${set.items.length} postcards earned`);
    button.innerHTML = `<span class="collection-set-top"><span class="collection-icon">${set.icon}</span><span class="collection-count">${earned}/${set.items.length}</span></span><span class="collection-name"></span><span class="collection-sub">${earned === set.items.length ? 'Complete' : earned ? `${set.items.length - earned} to go` : 'Not started'}</span><span class="collection-bar"><i style="width:${(earned / set.items.length) * 100}%"></i></span>`;
    button.querySelector('.collection-name').textContent = set.name;
    const thumbs = document.createElement('span');
    thumbs.className = 'collection-thumbs';
    set.items.slice(0, 4).forEach((item) => thumbs.append(collectionThumb(item)));
    button.append(thumbs);
    button.addEventListener('click', () => renderCollectionDetail(set));
    grid.append(button);
  });
  collectionsContent.replaceChildren(header, grid);
}

function renderCollectionDetail(set) {
  activeCollection = set;
  collectionsBack.textContent = '‹ Collections';
  collectionsSortControl.hidden = true;
  collectionsSortStatus.hidden = false;
  collectionsSortStatus.textContent = 'Sorted by number';
  const earned = set.items.filter(collectionEarn).length;
  const head = document.createElement('div');
  head.className = 'collection-detail-head';
  head.innerHTML = `<span class="collection-icon">${set.icon}</span><div><h2></h2><p>${set.items.length} postcards</p></div>`;
  head.querySelector('h2').textContent = set.name;
  const progress = document.createElement('div');
  progress.className = 'collection-progress';
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', `${set.name} postcards earned`);
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', String(set.items.length));
  progress.setAttribute('aria-valuenow', String(earned));
  progress.innerHTML = `<div class="collection-progress-top"><b>${earned} / ${set.items.length}</b><span>${Math.round(earned / set.items.length * 100)}% collected</span></div><div class="collection-segments">${set.items.map((item) => `<i class="${collectionEarn(item) ? 'earned' : ''}"></i>`).join('')}</div>`;
  const grid = document.createElement('ol');
  grid.className = 'collection-grid';
  grid.dataset.ppList = '';
  set.items.forEach((item, index) => {
    const tier = collectionEarn(item);
    const visited = collectionVisited(item);
    const card = document.createElement('li');
    card.className = `collection-card${tier ? '' : ' unearned'}${visited ? '' : ' mystery'}`;
    host.applyCardTier(card, item, tier);
    const photo = document.createElement('div');
    photo.className = `photo${visited ? '' : ' mystery-photo'}`;
    if (visited) {
      const img = document.createElement('img');
      img.src = item.image || '';
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => img.remove(), { once: true });
      photo.append(img);
    }
    const name = document.createElement('p');
    name.className = 'collection-card-name';
    name.textContent = visited ? item.short || item.clue : '???';
    const meta = document.createElement('p');
    meta.className = 'collection-card-meta';
    meta.textContent = `${String(index + 1).padStart(2, '0')} · ${visited ? (tier ? host.EARN_NAMES[tier] : 'Unearned') : 'Unvisited'}`;
    if (!visited) card.setAttribute('aria-label', `Card ${index + 1}: mystery location, not visited`);
    card.append(photo, name, meta);
    // Tap to open postcard modal (only for visited locations)
    if (visited) {
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-haspopup', 'dialog');
      const meta = host.passport.meta[item.id] || {};
      const entry = {
        item,
        earned: tier,
        earnedAt: meta.ea,
        continent: host.continentOf(item),
        best: meta.b,
        km: meta.d,
        first: meta.f,
      };
      bindPostcard(card, entry);
    }
    grid.append(card);
  });
  const nodes = [head];
  if (earned === set.items.length) {
    const complete = document.createElement('div');
    complete.className = 'collection-complete';
    complete.textContent = `★ Set complete · All ${set.items.length} postcards earned`;
    nodes.push(complete);
  }
  nodes.push(progress, grid);
  collectionsContent.replaceChildren(...nodes);
  collectionsScreen.scrollTop = 0;
}

function openCollections(from = 'home') {
  if (!collectionSets.length) buildCollectionSets();
  collectionReturn = from;
  host.gameEls.start.hidden = true;
  passportScreen.hidden = true;
  collectionsScreen.hidden = false;
  document.body.className = 'game-collections';
  window.__canGuess = false;
  renderCollectionsOverview();
  collectionsScreen.scrollTop = 0;
}

function closeCollections() {
  collectionsScreen.hidden = true;
  if (collectionReturn === 'passport') openPassport();
  else {
    host.gameEls.start.hidden = false;
    document.body.className = 'game-start';
    collectionsEntry.focus();
  }
}

// ---------------------------------------------------------------------------
// Postcard detail: tap a card in the passport to hold it up close
// ---------------------------------------------------------------------------
// The detail card grows out of the tapped postcard (a FLIP from the card's rect,
// clipped to the card's height so the back of it unfolds below the photo) and
// shrinks back into it on close. The source card is hidden meanwhile, so it
// reads as one postcard lifted out of the book rather than a popup on top.
let postcardStyle;

let postcardScreen;

let ppdEls;
const PPD_EASE = 'cubic-bezier(.2,.9,.25,1)';
let ppdSource = null; // the grid card the open postcard came from
let ppdOpening = null; // the open animations while they run
let ppdClosing = false;
let ppdEntry = null; // the passport entry on show

function longDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function tierDateKey(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return host.localDateKey(date);
}

function fillPostcard(entry) {
  const { item } = entry;
  const earn = host.EARN_NAMES[entry.earned] || 'seen';
  ppdEls.card.dataset.earn = earn;
  host.applyCardTier(ppdEls.card, item, entry.earned);
  ppdEls.photo.replaceChildren();
  if (item.image) {
    const img = document.createElement('img');
    img.src = item.image;
    img.alt = item.short || item.clue || '';
    img.decoding = 'async';
    img.addEventListener('error', () => img.remove(), { once: true });
    ppdEls.photo.append(img);
  }
  ppdEls.from.textContent = `Postcard from ${entry.continent || 'Earth'}`;
  const short = item.short || '';
  ppdEls.name.textContent = postcardDisplayName(item, host.flagForLocation);
  const clue = (item.clue || '').replace(FLAG_RE, '').trim();
  ppdEls.clue.textContent = clue;
  ppdEls.clue.hidden = !clue || clue === short;
  ppdEls.fact.textContent = item.fact || '';
  ppdEls.fact.hidden = !item.fact;
  ppdEls.history.replaceChildren();
  const historyDate = entry.earned ? tierDateKey(entry.earnedAt) : entry.first || '';
  const addHistoryRow = (label, date) => {
    if (!date) return;
    const row = document.createElement('div');
    row.className = 'ppd-history-row';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const dateEl = document.createElement('strong');
    dateEl.textContent = longDate(date);
    row.append(labelEl, dateEl);
    ppdEls.history.append(row);
  };
  addHistoryRow(entry.earned ? 'Postcard earned' : 'First visited', historyDate);
  ppdEls.history.hidden = !historyDate;
  const cells = [
    ['Best score', `${entry.best}<small> /1000</small>`],
    ['Closest guess', Number.isFinite(entry.km) ? `${entry.km.toLocaleString()}<small> km</small>` : ''],
  ];
  ppdEls.stats.replaceChildren(...cells.map(([label, value, t]) => {
    const div = document.createElement('div');
    if (t) div.dataset.tier = t;
    div.innerHTML = `<dt>${label}</dt><dd>${value}</dd>`;
    return div;
  }));
  ppdEls.hint.hidden = earn !== 'seen';
  ppdEls.hint.textContent = 'Land within 150 km to earn this postcard in colour.';
  // Only a postcard with a known closest guess has a distance to brag about.
  ppdEntry = entry;
  clearTimeout(ppdCopiedTimer);
  ppdEls.share.hidden = !Number.isFinite(entry.km);
  ppdEls.share.textContent = SHARE_LABEL;
}

// Keyframe for the detail card sitting exactly over the grid card: scaled down
// to its width from the top-left corner, and clipped to its height.
function postcardFlipFrame(source) {
  const from = source.getBoundingClientRect();
  const to = ppdEls.card.getBoundingClientRect();
  if (!from.width || from.bottom < 0 || from.top > window.innerHeight) return null;
  const s = from.width / to.width;
  const clip = Math.max(0, to.height - from.height / s);
  return {
    transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${s})`,
    clipPath: `inset(0 0 ${clip}px 0 round ${4 / s}px)`,
  };
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Swipe navigation (docs/expeditions-rethink-opus.md, Proposal 1): every
// openable card is registered here, and a swipe walks the [data-pp-list]
// container it sits in, in DOM order, skipping anything under [hidden].
// Mystery slots are never registered, so they are skipped too.
const postcardEntries = new WeakMap();
let ppdSiblings = null; // () => [{ entry, el }] for the list the card came from

export function bindPostcard(el, entry) {
  postcardEntries.set(el, entry);
  el.addEventListener('click', () => openPostcard(entry, el));
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openPostcard(entry, el);
  });
}

// A function rather than an array, so filters, collapsed groups, or a re-sort
// applied while the card is open are read fresh on every swipe.
function postcardSiblings(source) {
  const root = source.closest('[data-pp-list]');
  if (!root) return null;
  const shown = (el) => {
    for (let node = el; node && node !== root; node = node.parentElement) if (node.hidden) return false;
    return true;
  };
  return () => [...root.querySelectorAll('[role="button"]')]
    .filter((el) => postcardEntries.has(el) && shown(el))
    .map((el) => ({ entry: postcardEntries.get(el), el }));
}

// Where the open card sits in its list. A re-sort replaces the tiles, so fall
// back to the place id and move the lifted state onto the new tile.
function ppdLocate() {
  const list = ppdSiblings ? ppdSiblings() : [];
  let at = list.findIndex(({ el }) => el === ppdSource);
  if (at < 0 && ppdEntry) at = list.findIndex(({ entry }) => entry.item.id === ppdEntry.item.id);
  if (at >= 0 && list[at].el !== ppdSource) {
    ppdSource?.classList.remove('pp-lifted');
    ppdSource = list[at].el;
    ppdSource.classList.add('pp-lifted');
  }
  return { list, at };
}

function syncPostcardNav({ list, at }) {
  const many = list.length > 1;
  ppdEls.pos.hidden = !many || at < 0;
  if (many && at >= 0) ppdEls.pos.textContent = `${(at + 1).toLocaleString()} of ${list.length.toLocaleString()}`;
  ppdEls.prev.hidden = !many;
  ppdEls.next.hidden = !many;
  ppdEls.prev.classList.toggle('is-end', at === 0);
  ppdEls.next.classList.toggle('is-end', at === list.length - 1);
}

// dir 1 is the next card (swipe left), -1 the previous one. No wrap-around:
// past either end the card nudges and stays put.
function stepPostcard(dir) {
  if (postcardScreen.hidden || ppdClosing) return;
  const { list, at } = ppdLocate();
  let next;
  if (at >= 0) next = list[at + dir];
  else if (ppdSource?.isConnected) {
    // The open card was filtered out: step to its nearest shown neighbour.
    const after = (el) => Boolean(ppdSource.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    next = dir > 0 ? list.find(({ el }) => after(el)) : list.findLast(({ el }) => !after(el));
  } else next = dir > 0 ? list[0] : list[list.length - 1];
  if (ppdOpening) {
    ppdOpening.forEach((a) => a.finish());
    ppdOpening = null;
  }
  if (!next) {
    if (!reducedMotion()) ppdEls.card.animate([{ transform: 'none' }, { transform: `translateX(${-dir * 14}px)` }, { transform: 'none' }], { duration: 240, easing: 'ease-out' });
    return;
  }
  fillPostcard(next.entry);
  ppdSource?.classList.remove('pp-lifted');
  ppdSource = next.el;
  ppdSource.classList.add('pp-lifted');
  ppdSource.scrollIntoView({ block: 'nearest' });
  postcardScreen.scrollTop = 0;
  syncPostcardNav(ppdLocate());
  if (!reducedMotion()) ppdEls.card.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
}

export function openPostcard(entry, source, siblings = postcardSiblings(source)) {
  if (!postcardScreen.hidden) return;
  fillPostcard(entry);
  ppdSource = source;
  ppdSiblings = siblings;
  syncPostcardNav(ppdLocate());
  postcardScreen.hidden = false;
  postcardScreen.scrollTop = 0;
  // Restore stamp visibility (hidden on close to prevent FLIP glitch)
  if (ppdEls.stamp) ppdEls.stamp.style.opacity = '';
  const flip = reducedMotion() ? null : postcardFlipFrame(source);
  source.classList.add('pp-lifted');
  ppdEls.close.focus({ preventScroll: true });
  const anims = [
    ppdEls.scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' }),
    flip
      ? ppdEls.card.animate([flip, { transform: 'none', clipPath: 'inset(0 0 0px 0 round 0px)' }], { duration: 440, easing: PPD_EASE })
      : ppdEls.card.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: reducedMotion() ? 160 : 300, easing: PPD_EASE }),
    ppdEls.close.animate([{ opacity: 0 }, { opacity: 0, offset: .6 }, { opacity: 1 }], { duration: 440 }),
  ];
  ppdOpening = anims;
  anims[1].finished.then(() => { if (ppdOpening === anims) ppdOpening = null; }, () => {});
}

function hidePostcard(source) {
  postcardScreen.hidden = true;
  ppdClosing = false;
  ppdSource = null;
  ppdSiblings = null;
  if (source) {
    source.classList.remove('pp-lifted');
    if (source.isConnected) source.focus({ preventScroll: true });
  }
}

function closePostcard() {
  if (ppdClosing || postcardScreen.hidden) return;
  ppdClosing = true;
  if (!ppdSource?.isConnected) ppdLocate(); // re-sorted while open: land on the new tile
  const source = ppdSource;
  // Hide the modal stamp immediately so it doesn't glitch during the FLIP close animation
  if (ppdEls.stamp) ppdEls.stamp.style.opacity = '0';
  // Closed mid-open: play the opening backwards from where it got to rather
  // than snapping to the end first.
  if (ppdOpening) {
    const anims = ppdOpening;
    ppdOpening = null;
    anims.forEach((a) => { a.effect.updateTiming({ fill: 'both' }); a.reverse(); });
    anims[1].finished.catch(() => {}).finally(() => {
      hidePostcard(source);
      anims.forEach((a) => a.cancel());
    });
    return;
  }
  // A swipe slide or end nudge still running would skew the measured start.
  ppdEls.card.getAnimations().forEach((a) => a.finish());
  const flip = reducedMotion() || !source?.isConnected ? null : postcardFlipFrame(source);
  const opts = { duration: flip ? 360 : 220, easing: flip ? PPD_EASE : 'ease-in', fill: 'forwards' };
  const anims = [
    ppdEls.scrim.animate([{ opacity: 1 }, { opacity: 0 }], opts),
    flip
      ? ppdEls.card.animate([{ transform: 'none', clipPath: 'inset(0 0 0px 0 round 0px)' }, flip], opts)
      : ppdEls.card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], opts),
    ppdEls.close.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }),
  ];
  anims[1].finished.catch(() => {}).finally(() => {
    hidePostcard(source);
    anims.forEach((a) => a.cancel());
  });
}

// ---------------------------------------------------------------------------
// Share: brag about a postcard. The link is the homepage only, never a
// playable round, so friends land on the daily.
// ---------------------------------------------------------------------------
const HOME_URL = 'https://where-on.earth';
const SHARE_LABEL = 'Share this postcard';

export function postcardShareText(entry) {
  const place = entry.item.short || (entry.item.clue || '').replace(FLAG_RE, '').trim();
  return `I got within ${Math.round(entry.km).toLocaleString()} km of ${place} on Where on Earth! ${HOME_URL}`;
}

let ppdCopiedTimer = 0;

export function initPassportHome(main) {
  host = main;
  passportStyle = document.createElement('style');
  passportStyle.textContent = `
/* A plain scrim, not backdrop-filter: a blurred panel over the live WebGL canvas
   starves the software compositor (the stats overlay needed a frozen loop for the
   same reason) and the dots show through the tint anyway. */
.passport { box-sizing: border-box; width: min(100%, 330px); max-width: 330px; margin: 18px 0 24px; padding: 12px 14px 13px; border-radius: 20px; border: 1px solid rgba(157,211,255,.14); background: rgba(4,10,24,.5); }
.passport[hidden] { display: none; }
.passport-count { margin: 0; color: rgba(193,224,250,.62); font-size: 13px; font-weight: 700; }
.passport-earned { color: #ffd166; }
.passport-streak { color: #ffc76a; }
.passport-count b { color: #ffc76a; font-size: 27px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -.02em; text-shadow: 0 0 22px rgba(255,199,106,.3); }
.passport-stamps { display: flex; justify-content: center; gap: 7px; margin-top: 11px; }
.passport-stamps img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: rgba(157,211,255,.08); border: 2px solid rgba(157,211,255,.28); }
.passport-stamps img[data-tier="gold"] { border-color: #ffd166; box-shadow: 0 0 12px rgba(255,209,102,.3); }
.passport-stamps img[data-tier="cyan"] { border-color: #67e8ff; }
.passport-stamps img[data-tier="dim"] { filter: saturate(.65) brightness(.7); }
.passport-continents { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; margin-top: 12px; }
.passport-continents span { position: relative; padding: 3px 8px 7px; border-radius: 999px; background: rgba(157,211,255,.07); color: rgba(193,224,250,.68); font-size: 10px; font-weight: 750; letter-spacing: .03em; white-space: nowrap; }
.passport-continents i { position: absolute; left: 8px; bottom: 3px; height: 2px; border-radius: 2px; background: linear-gradient(90deg, #ffd166, #67e8ff); opacity: .85; }
@media (max-height: 700px) {
  .passport { margin-bottom: 18px; }
  .passport-count b { font-size: 23px; }
  .passport-stamps img { width: 34px; height: 34px; }
  .passport-continents { margin-top: 9px; }
}`;
  document.head.appendChild(passportStyle);

  passportBox = document.createElement('div');
  passportBox.className = 'passport';
  passportBox.hidden = true;
  passportBox.innerHTML = `
  <p class="passport-count"><b data-passport="found">0</b> / <span data-passport="total">0</span> places found<span class="passport-earned" data-passport="earned"></span><span class="passport-streak" data-passport="streak"></span></p>
  <div class="passport-stamps" data-passport="stamps"></div>
  <div class="passport-continents" data-passport="continents"></div>`;
  // Above the mode-button grid, never inside it: a fourth grid child shoves
  // Survival onto a second row once the passport has a place in it.
  host.gameEls.play.closest('.mode-buttons').before(passportBox);
  passportEls = {
    box: passportBox,
    found: passportBox.querySelector('[data-passport="found"]'),
    total: passportBox.querySelector('[data-passport="total"]'),
    earned: passportBox.querySelector('[data-passport="earned"]'),
    streak: passportBox.querySelector('[data-passport="streak"]'),
    stamps: passportBox.querySelector('[data-passport="stamps"]'),
    continents: passportBox.querySelector('[data-passport="continents"]'),
  };
}

export function initPassport(main) {
  host = main;
  ensurePostcardCardStyles();

  passportPageStyle = document.createElement('style');
  passportPageStyle.textContent = `
.pp-card [hidden] { display: none !important; }
.home-links { display: flex; flex-wrap: nowrap; justify-content: center; gap: 6px; width: min(100%, 354px); max-width: calc(100vw - 32px); box-sizing: border-box; margin-top: 10px; }
.home-links > button { flex: 1 1 0; min-width: 0; margin-top: 0; padding: 0 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 360px) { .home-links > button { padding: 0 4px; font-size: 12px; } }
.passport-entry { min-height: 44px; padding: 0 14px; border: 1px solid rgba(103,232,255,.4); border-radius: 999px; background: rgba(103,232,255,.09); color: #c9f6ff; font-size: 13px; font-weight: 750; cursor: pointer; touch-action: manipulation; }
.passport-entry:active { transform: scale(.98); }
.passport-entry:disabled { opacity: .4; }
.pp-card { --pp-toolbar-h: 44px; position: relative; box-sizing: border-box; width: 100%; max-width: 440px; min-height: 100%; margin: auto; padding: 14px 14px 20px; border-radius: 24px; overflow-x: clip; } /* Keep clip: overflow:hidden breaks sticky descendants. */
.pp-card h2 { margin: 0; color: #f5fbff; font-size: 21px; text-align: center; letter-spacing: -.02em; }
.pp-audit-banner { position: relative; display: flex; align-items: center; justify-content: center; gap: 7px; flex-wrap: wrap; margin: 0 0 8px; padding: 5px 8px; border: 1px solid rgba(255,209,102,.45); border-radius: 999px; background: rgba(255,209,102,.1); color: #ffd166; font-size: 10px; font-weight: 850; letter-spacing: .08em; text-align: center; text-transform: uppercase; }
.pp-audit-flags-button { min-height: 24px; padding: 1px 8px; border: 1px solid rgba(255,209,102,.55); border-radius: 999px; background: rgba(8,14,32,.45); color: #ffe29a; font: inherit; font-size: 10px; font-weight: 850; cursor: pointer; text-transform: none; }
.pp-audit-flags-panel { flex: 1 0 100%; max-height: 220px; overflow: auto; padding: 8px 4px 2px; border-top: 1px solid rgba(255,209,102,.2); color: rgba(255,244,207,.8); font-size: 11px; letter-spacing: normal; text-align: left; text-transform: none; }
.pp-audit-flags-panel ul { margin: 0; padding-left: 18px; }
.pp-audit-flags-panel li { margin: 3px 0; }
.pp-audit-flags-actions { display: flex; justify-content: flex-end; margin-bottom: 4px; }
.pp-audit-flags-actions button { padding: 3px 8px; border: 1px solid rgba(255,209,102,.4); border-radius: 999px; background: transparent; color: #ffe29a; font: inherit; font-size: 10px; font-weight: 800; cursor: pointer; }
.pp-audit-flags-status { min-height: 1.2em; margin: 4px 0 0; color: rgba(255,244,207,.62); font-size: 10px; text-align: center; }
.pp-header-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; padding-right: 40px; }
.pp-header-row h2 { flex: 1; text-align: left !important; font-size: 19px !important; }
.pp-header-actions { display: flex; flex-shrink: 0; gap: 8px; }
.pp-share-icon { flex-shrink: 0; width: 44px; height: 44px; border: 1px solid rgba(255,209,102,.55); border-radius: 50%; background: linear-gradient(135deg, rgba(77,54,145,.95), rgba(25,47,101,.95)); color: #fff7dc; font-size: 18px; font-weight: 800; cursor: pointer; }
.pp-progress { margin: 8px 2px 0; }
.pp-count { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 4px; color: rgba(193,224,250,.62); font-size: 12px; font-weight: 700; text-align: left; }
.pp-count-main { white-space: nowrap; }
.pp-count [data-pp="earned"] { min-width: 0; overflow: hidden; text-align: right; white-space: nowrap; text-overflow: ellipsis; }
.pp-stat { white-space: nowrap; }
.pp-count b { color: #ffc76a; font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; text-shadow: 0 0 22px rgba(255,199,106,.3); }
/* Two layers: visited as a pale track, earned as the bright gradient over it. */
.pp-bar { position: relative; height: 4px; border-radius: 8px; background: rgba(157,211,255,.1); overflow: hidden; }
.pp-bar i { position: absolute; left: 0; top: 0; height: 100%; border-radius: 8px; transition: width .4s ease-out; }
.pp-bar .pp-bar-seen { background: rgba(193,224,250,.22); }
.pp-bar .pp-bar-earned { background: linear-gradient(90deg, #67e8ff, #c4a8ff 55%, #ffd166); box-shadow: 0 0 12px rgba(255,209,102,.35); }
.pp-tabs { display: flex; gap: 6px; margin-top: 8px; }
.pp-tabs button { flex: 1 1 0; min-height: 34px; border: 1px solid rgba(157,211,255,.18); border-radius: 11px; background: rgba(157,211,255,.05); color: rgba(193,224,250,.62); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; touch-action: manipulation; }
.pp-tabs button[aria-selected="true"] { border-color: rgba(103,232,255,.5); background: rgba(103,232,255,.1); color: #c9f6ff; }
.pp-stick-sentinel { height: 1px; margin-top: 7px; }
.pp-toolbar { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: 6px; box-sizing: border-box; height: var(--pp-toolbar-h); margin: -1px -14px 0; padding: 4px 14px; background: #0b1120; }
.pp-toolbar.is-stuck { box-shadow: 0 1px rgba(157,211,255,.14), 0 8px 18px rgba(0,0,0,.22); }
.pp-toolbar.is-stuck::before { content: ''; position: absolute; left: 0; right: 0; bottom: 100%; height: calc(env(safe-area-inset-top, 0px) + 18px); background: #0b1120; }
.pp-filters-btn { flex: none; min-height: 36px; padding: 0 10px; border: 1px solid rgba(196,168,255,.22); border-radius: 999px; background: rgba(150,110,255,.07); color: rgba(193,224,250,.7); font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; touch-action: manipulation; white-space: nowrap; }
.pp-filters-btn[aria-expanded="true"], .pp-filters-btn.has-active { border-color: #67e8ff; background: rgba(103,232,255,.14); color: #c9f6ff; }
.pp-group-controls { display: flex; justify-content: flex-end; gap: 6px; margin: 5px 0 3px; }
.pp-group-controls .pp-filters-btn { min-height: 30px; }
.pp-badge { margin-left: 3px; color: #ffc76a; font-size: 11px; }
.pp-toolbar-close { display: grid; flex: none; place-items: center; width: 32px; height: 32px; margin-left: auto; padding: 0; border: 0; border-radius: 50%; background: rgba(157,211,255,.08); color: #e8f3ff; font: inherit; font-size: 20px; line-height: 1; opacity: 0; pointer-events: none; transition: opacity .15s ease-out; }
.pp-toolbar.is-stuck .pp-toolbar-close { opacity: 1; pointer-events: auto; }
.pp-status { display: grid; grid-column: 1 / -1; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
.pp-status button { min-height: 36px; padding: 0 2px; border: 1px solid rgba(196,168,255,.22); border-radius: 999px; background: rgba(150,110,255,.07); color: rgba(193,224,250,.7); font: inherit; font-size: 11px; font-weight: 750; cursor: pointer; touch-action: manipulation; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-status button[aria-pressed="true"] { border-color: #67e8ff; background: rgba(103,232,255,.14); color: #c9f6ff; }
.pp-filters { position: absolute; z-index: 4; top: 100%; left: 14px; right: 14px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 6px; padding: 10px; border: 1px solid rgba(157,211,255,.18); border-radius: 14px; background: #111a30; box-shadow: 0 14px 32px rgba(0,0,0,.48); opacity: 0; visibility: hidden; transform: translateY(-6px); pointer-events: none; transition: opacity .12s ease-out, transform .12s ease-out, visibility 0s linear .12s; }
.pp-filters.is-open { opacity: 1; visibility: visible; transform: translateY(0); pointer-events: auto; transition-duration: .16s; transition-delay: 0s; }
.pp-filters select, .pp-country-sort { appearance: none; -webkit-appearance: none; min-height: 36px; width: 100%; padding: 0 24px 0 10px; border: 1px solid rgba(196,168,255,.35); border-radius: 999px; background: rgba(150,110,255,.12) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23d9ccff' stroke-width='1.6'/%3E%3C/svg%3E") no-repeat right 10px center; color: #ece4ff; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
.pp-filters select option { background: #0b1430; color: #ece4ff; }
.pp-shown { grid-column: 1 / -1; margin: 0; color: rgba(193,224,250,.45); font-size: 11px; text-align: center; }
.pp-empty { margin: 18px 0; color: rgba(193,224,250,.55); font-size: 12px; text-align: center; }
/* Dex grid: every slot renders once per open; filters toggle [hidden] instead
   of rebuilding, so only a sort change rebuilds the DOM (see renderPassportDex). */
.pp-dex-wrap { margin-top: 0; }
.pp-group { content-visibility: auto; contain-intrinsic-size: auto 900px; scroll-margin-top: var(--pp-toolbar-h); }
.pp-group-head { position: sticky; top: var(--pp-toolbar-h); z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0; padding: 7px 4px; background: #0b1120; color: rgba(193,224,250,.6); font-size: 11px; font-weight: 800; letter-spacing: .04em; cursor: pointer; touch-action: manipulation; }
.pp-group-head:focus-visible { outline: 2px solid #67e8ff; outline-offset: 2px; }
.pp-group-head::after { content: ''; flex: none; width: 6px; height: 6px; margin: -3px 3px 0 0; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); transition: transform .15s ease-out; }
.pp-group-head[aria-expanded="true"]::after { margin-top: 3px; transform: rotate(225deg); }
.pp-group-head-text { min-width: 0; }
.pp-chunk { content-visibility: auto; contain-intrinsic-size: auto 900px; }
.pp-dex { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 8px; margin: 0; padding: 4px 3px; list-style: none; }
.pp-slot { position: relative; min-width: 0; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.pp-slot-photo { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; border: 2px solid var(--rarity, rgba(214,220,232,.16)); background: linear-gradient(135deg, #1b2c5a, #3b2a6e); }
.pp-slot-photo img { position: relative; z-index: 1; display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 20%; }
.pp-audit-flag { position: absolute; z-index: 4; left: 3px; top: 3px; display: grid; place-items: center; width: 27px; height: 27px; padding: 0; border: 1px solid rgba(255,255,255,.55); border-radius: 50%; background: rgba(8,14,32,.84); font-size: 14px; line-height: 1; cursor: pointer; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
.pp-audit-flag:active { transform: scale(.92); }
.pp-audit-flag-dot { position: absolute; right: -2px; bottom: -2px; display: grid; place-items: center; width: 13px; height: 13px; border: 1px solid rgba(8,14,32,.9); border-radius: 50%; background: transparent; font-size: 9px; line-height: 1; }
.pp-audit-flag[data-flag="image"] .pp-audit-flag-dot { background: #ef4444; }
.pp-audit-flag[data-flag="city"] .pp-audit-flag-dot { background: #facc15; }
.pp-slot-score { position: absolute; z-index: 2; top: 5px; right: 5px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 3px 6px; border: 1px solid transparent; border-radius: 999px; background: rgba(8,14,32,.82); color: #e6f0ff; font-size: 9px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; box-shadow: 0 1px 3px rgba(0,0,0,.5); }
.pp-slot-score[data-tier="bullseye"] { border: 1.5px solid #ffd166; background: rgba(8,14,32,.88); color: #ffd166; }
.pp-slot-score[data-tier="pinpoint"] { background: #e9b23c; color: #2b1d00; }
.pp-slot-name { margin: 4px 1px 0; overflow: hidden; color: #eef2ff; font-size: 10px; font-weight: 750; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.pp-slot[data-earn="seen"] .pp-slot-photo img { filter: grayscale(1) contrast(.92) brightness(.82); }
.pp-slot[data-earn="seen"] .pp-slot-name { color: #8992a8; }
/* Mystery cards keep the same neutral frame used by visited cards. */
.pp-slot.is-mystery { cursor: default; }
.pp-slot.is-mystery .pp-slot-photo { border-color: rgba(214,220,232,.16); }
.pp-slot.is-mystery .pp-slot-name { color: rgba(214,220,232,.4); letter-spacing: .1em; text-align: center; }
/* Countries tab */
.pp-country-summary { flex: 1; min-width: 0; margin: 0; overflow: hidden; color: rgba(193,224,250,.55); font-size: 11px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.pp-country-sort { flex: none; width: 126px; }
.pp-country-toolbar .collections-back { min-height: 36px; }
/* Country cards: same grid and size as .pp-slot, but read as a *stack* of
   postcards (offset card edges behind), with a neutral frame instead of rarity,
   a flag chip and a progress strip. Never carries a prox badge or score pill.
   Postcards earned leads (meta line); places visited is secondary (sub line) —
   it's about earning, not visiting (Sean, 2026-10-11). */
.pp-ccards { margin-top: 10px; }
.pp-ccards-head { grid-column: 1 / -1; }
.pp-ccards .pp-group-head { position: static; margin: 6px 0 0; background: transparent; }
.pp-ccard { min-width: 0; }
.pp-ccard > button { display: block; width: 100%; padding: 6px 6px 0 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.pp-ccard > button:active .pp-ccard-photo { transform: scale(.97); }
.pp-ccard > button:focus-visible { outline: 2px solid #67e8ff; outline-offset: 2px; border-radius: 10px; }
.pp-ccard-photo { position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden; border: 1.5px solid rgba(157,211,255,.28); background: linear-gradient(135deg, #1b2c5a, #3b2a6e);
  /* two card edges peeking out top-right = "a stack of postcards" (own box-shadow is not clipped by overflow) */
  box-shadow: 3px -3px 0 -1px #24304d, 3px -3px 0 0 rgba(157,211,255,.18), 6px -6px 0 -2px #18203a, 6px -6px 0 -1px rgba(157,211,255,.1); transition: transform .12s ease-out; }
.pp-ccard-photo img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 20%; }
/* bottom scrim so the flag chip and strip read on any photo */
.pp-ccard-photo::after { content: ''; position: absolute; inset: auto 0 0 0; height: 42%; background: linear-gradient(transparent, rgba(8,14,32,.72)); pointer-events: none; }
.pp-ccard-flag { position: absolute; z-index: 1; left: 5px; bottom: 8px; font-size: 18px; line-height: 1; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
.pp-ccard-bar { position: absolute; z-index: 1; left: 0; right: 0; bottom: 0; height: 4px; border-radius: 0; background: rgba(8,14,32,.6); }
.pp-ccard-bar i { border-radius: 0; }
.pp-ccard-name { margin: 5px 1px 0; overflow: hidden; color: #eef2ff; font-size: 11px; font-weight: 800; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.pp-ccard-meta, .pp-ccard-sub { margin: 1px 1px 0; overflow: hidden; color: rgba(193,224,250,.62); font-size: 10px; font-weight: 700; line-height: 1.25; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
.pp-ccard-meta b { color: #eef2ff; font-weight: 800; }
/* states */
.pp-ccard[data-state="seen"] .pp-ccard-photo img { filter: grayscale(1) contrast(.92) brightness(.82); }
.pp-ccard[data-state="unvisited"] .pp-ccard-photo { border-color: rgba(214,220,232,.12); box-shadow: none; }
.pp-ccard[data-state="unvisited"] .pp-ccard-flag { filter: grayscale(1); opacity: .45; }
.pp-ccard[data-state="unvisited"] :is(.pp-ccard-name, .pp-ccard-meta, .pp-ccard-sub) { color: rgba(193,224,250,.4); }
/* no photo: the flag becomes the picture */
.pp-ccard-photo.is-flagtile { background: radial-gradient(circle at 50% 42%, #1d2a48, #0b1120 75%); }
.pp-ccard-photo.is-flagtile::after { display: none; }
.pp-ccard-photo.is-flagtile .pp-ccard-flag { inset: 0; display: grid; place-items: center; font-size: 40px; filter: none; }
/* complete: gold frame and gold stack edges; the leading (postcards) line turns gold too */
.pp-ccard.is-complete .pp-ccard-photo { border-color: #ffd166; box-shadow: 3px -3px 0 -1px #3a2f12, 3px -3px 0 0 rgba(255,209,102,.5), 6px -6px 0 -2px #2a2310, 6px -6px 0 -1px rgba(255,209,102,.3); }
.pp-ccard.is-complete .pp-ccard-meta { color: #ffd166; }
@media (max-width: 360px) { .pp-ccard-flag { font-size: 16px; } }
.pp-country-head { margin-top: 10px; }
.pp-country-head-row { display: flex; align-items: center; gap: 12px; }
.pp-country-head-flag { flex: none; font-size: 40px; }
.pp-country-head h3 { margin: 0; color: #f5fbff; font-size: 19px; }
.pp-country-head p { margin: 2px 0 0; color: rgba(193,224,250,.55); font-size: 12px; }
.pp-country-head .pp-country-bar { width: 100%; height: 4px; margin-top: 10px; }
.pp-country-dex { margin-top: 12px; }
body.game-passport #hud { opacity: 0; }
@media (max-width: 360px) {
  .pp-dex { gap: 8px 6px; }
}
@media (prefers-reduced-motion: reduce) { .pp-filters { transform: none; } }`;
  document.head.appendChild(passportPageStyle);

  passportEntry = document.createElement('button');
  passportEntry.className = 'passport-entry';
  passportEntry.textContent = 'Passport';
  passportEntry.setAttribute('aria-haspopup', 'dialog');
  collectionsEntry = document.createElement('button');
  collectionsEntry.className = 'passport-entry';
  collectionsEntry.textContent = '🛡 Collections';
  collectionsEntry.setAttribute('aria-haspopup', 'dialog');
  collectionsEntry.hidden = true; // Temporarily hide Collections without removing its navigation wiring.
  homeLinks = document.createElement('div');
  homeLinks.className = 'home-links';
  statsEntry.before(homeLinks);
  homeLinks.append(statsEntry, passportEntry, collectionsEntry);

  passportScreen = document.createElement('section');
  passportScreen.className = 'screen stats-screen passport-screen';
  passportScreen.hidden = true;
  passportScreen.innerHTML = `
  <div class="pp-card glass" role="dialog" aria-modal="true" aria-labelledby="pp-title">
    <button class="stats-close" aria-label="Close passport">×</button>
    <div class="pp-header-row">
      <h2 id="pp-title">Your passport</h2>
      <div class="pp-header-actions">
        <button class="pp-share-icon" data-pp="collections" aria-label="View collections" hidden>🛡</button>
        <button class="pp-share-icon" data-pps="share" aria-label="Share my passport">↗</button>
      </div>
    </div>
    <div class="pp-progress" data-pp="progress">
      <p class="pp-count"><span class="pp-count-main"><b data-pp="found">0</b> / <span data-pp="total">0</span> places</span><span data-pp="earned"></span></p>
      <div class="pp-bar" role="progressbar" aria-label="Postcards earned" aria-valuemin="0"><i class="pp-bar-seen" data-pp="fill"></i><i class="pp-bar-earned" data-pp="earnfill"></i></div>
    </div>
    <div class="pp-tabs" role="tablist" data-pp="tabs">
      <button type="button" role="tab" data-view="places" aria-selected="true">Places</button>
      <button type="button" role="tab" data-view="countries" aria-selected="false">Countries</button>
      <button type="button" role="tab" data-view="landmarks" aria-selected="false">Landmarks</button>
    </div>
    <div data-pp="places-view">
      <div class="pp-stick-sentinel" data-pp="places-sentinel"></div>
      <div class="pp-toolbar" data-pp="toolbar">
        ${ppFilterControls('pp-filters')}
      </div>
      <div class="pp-group-controls" data-pp="places-group-controls">
        <button type="button" class="pp-filters-btn" data-group-action="expand">Expand all</button>
        <button type="button" class="pp-filters-btn" data-group-action="collapse">Collapse all</button>
      </div>
      <p class="pp-empty" data-pp="empty" hidden>No stamps match these filters yet.</p>
      <div class="pp-dex-wrap" data-pp="dex" data-pp-list></div>

    </div>
    <div data-pp="countries-view" hidden>
      <div data-pp="country-list">
        <div class="pp-stick-sentinel" data-pp="country-list-sentinel"></div>
        <div class="pp-toolbar pp-country-toolbar"><p class="pp-country-summary" data-pp="country-summary"></p>
          <select class="pp-country-sort" data-pp="country-sort" aria-label="Sort countries">
          <option value="earned">Most earned</option>
          <option value="closest">Closest to complete</option>
          <option value="alpha">A–Z</option>
          <option value="continent">By continent</option>
          </select><button type="button" class="pp-toolbar-close" aria-label="Close passport">×</button></div>
        <div class="pp-group-controls" data-pp="country-group-controls" hidden>
          <button type="button" class="pp-filters-btn" data-group-action="expand">Expand all</button>
          <button type="button" class="pp-filters-btn" data-group-action="collapse">Collapse all</button>
        </div>
        <div data-pp="country-list-body"></div>
      </div>
      <div data-pp="country-detail" hidden>
        <div class="pp-stick-sentinel" data-pp="country-detail-sentinel"></div>
        <div class="pp-toolbar pp-country-toolbar"><button class="collections-back" type="button" data-pp="country-back">‹ Countries</button><button type="button" class="pp-toolbar-close" aria-label="Close passport">×</button></div>
        <div class="pp-country-head" data-pp="country-head"></div>
        <ul class="pp-dex pp-country-dex" data-pp="country-dex" data-pp-list></ul>
      </div>
    </div>
    <div data-pp="landmarks-view" hidden>
      <div class="pp-stick-sentinel" data-pp="landmarks-sentinel"></div>
      <div class="pp-toolbar pp-country-toolbar"><p class="pp-country-summary" data-pp="landmark-summary"></p>
        ${ppFilterControls('pp-landmark-filters')}
      </div>
      <div class="pp-group-controls" data-pp="landmark-group-controls">
        <button type="button" class="pp-filters-btn" data-group-action="expand">Expand all</button>
        <button type="button" class="pp-filters-btn" data-group-action="collapse">Collapse all</button>
      </div>
      <p class="pp-empty" data-pp="empty" hidden>No stamps match these filters yet.</p>
      <div class="pp-dex-wrap" data-pp="landmark-dex" data-pp-list></div>
    </div>
  </div>`;
  document.getElementById('game').appendChild(passportScreen);
  host.passportScreenEl = passportScreen;

  ppEls = {
    close: passportScreen.querySelector('.stats-close'),
    progress: passportScreen.querySelector('[data-pp="progress"]'),
    found: passportScreen.querySelector('[data-pp="found"]'),
    total: passportScreen.querySelector('[data-pp="total"]'),
    bar: passportScreen.querySelector('.pp-bar'),
    fill: passportScreen.querySelector('[data-pp="fill"]'),
    earned: passportScreen.querySelector('[data-pp="earned"]'),
    earnFill: passportScreen.querySelector('[data-pp="earnfill"]'),
    tabs: passportScreen.querySelector('[data-pp="tabs"]'),
    placesView: passportScreen.querySelector('[data-pp="places-view"]'),
    countriesView: passportScreen.querySelector('[data-pp="countries-view"]'),
    collections: passportScreen.querySelector('[data-pp="collections"]'),
    countryList: passportScreen.querySelector('[data-pp="country-list"]'),
    countryDetail: passportScreen.querySelector('[data-pp="country-detail"]'),
    countrySummary: passportScreen.querySelector('[data-pp="country-summary"]'),
    countrySort: passportScreen.querySelector('[data-pp="country-sort"]'),
    countryListBody: passportScreen.querySelector('[data-pp="country-list-body"]'),
    countryGroupControls: passportScreen.querySelector('[data-pp="country-group-controls"]'),
    countryBack: passportScreen.querySelector('[data-pp="country-back"]'),
    countryHead: passportScreen.querySelector('[data-pp="country-head"]'),
    countryDex: passportScreen.querySelector('[data-pp="country-dex"]'),
    landmarksView: passportScreen.querySelector('[data-pp="landmarks-view"]'),
    landmarkSummary: passportScreen.querySelector('[data-pp="landmark-summary"]'),
  };
  ppPlaces = ppDex(ppEls.placesView, { noun: 'places', sentinel: 'places-sentinel', dex: 'dex', groupControls: 'places-group-controls', statusKey: PP_STATUS_KEY });
  ppLandmarks = ppDex(ppEls.landmarksView, { noun: 'landmarks', sentinel: 'landmarks-sentinel', dex: 'landmark-dex', groupControls: 'landmark-group-controls' });

  ppStickyObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const toolbar = entry.target.nextElementSibling;
      toolbar?.classList.toggle('is-stuck', !entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0));
    });
  }, { root: passportScreen, threshold: 0 });
  passportScreen.querySelectorAll('.pp-stick-sentinel').forEach((sentinel) => ppStickyObserver.observe(sentinel));
  if (host.AUDIT_MODE) host.mountAuditBanner(ppEls.progress);
  PASSPORT_SHARE_URL = new URL('/', location.href).href;
  passportShareStyle = document.createElement('style');
  passportShareStyle.textContent = `
.pps { position: fixed; z-index: 14; inset: 0; box-sizing: border-box; display: grid; align-content: center; justify-items: center; gap: 14px; padding: max(18px, env(safe-area-inset-top)) 16px max(18px, env(safe-area-inset-bottom)); background: rgba(2,5,16,.9); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); overflow: auto; overscroll-behavior: contain; }
.pps[hidden] { display: none; }
.pps-card [hidden] { display: none !important; }
.pps-card { position: relative; box-sizing: border-box; width: min(100%, 358px); padding: 22px 20px 18px; border: 1px solid rgba(184,166,255,.42); border-radius: 22px; overflow: hidden; background: radial-gradient(circle at 84% 4%, rgba(132,93,255,.34), transparent 35%), linear-gradient(145deg, #101b43, #090d25 72%); box-shadow: 0 24px 70px rgba(0,0,0,.58), inset 0 1px rgba(255,255,255,.1); color: #f7f8ff; }
.pps-card::before { content: ''; position: absolute; right: -25px; bottom: -38px; width: 150px; height: 150px; border: 1px dashed rgba(103,232,255,.22); border-radius: 50%; box-shadow: 0 0 0 18px rgba(103,232,255,.025), 0 0 0 42px rgba(196,168,255,.025); }
.pps-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.pps-kicker { margin: 0; color: #8fdfff; font-size: 10px; font-weight: 850; letter-spacing: .19em; text-transform: uppercase; }
.pps-card h3 { margin: 4px 0 0; font-size: 22px; line-height: 1; letter-spacing: -.035em; }
.pps-progress { position: relative; margin-top: 12px; }
.pps-visited { margin: 0 0 6px; color: rgba(218,229,255,.72); font-size: 12px; font-weight: 750; }
.pps-visited b { color: #67e8ff; font-size: 15px; font-weight: 900; font-variant-numeric: tabular-nums; }
.pps-label { position: relative; margin: 16px 0 7px; color: #8fdfff; font-size: 10px; font-weight: 850; letter-spacing: .19em; text-transform: uppercase; }
.pps-top3 { position: relative; padding: 4px 3px; }
.pps-top3 .pp-slot { cursor: default; }
.pps-km { white-space: nowrap; }
.pps-flag { position: absolute; inset: 0; display: grid; place-items: center; font-size: 34px; filter: drop-shadow(0 2px 4px rgba(0,0,0,.5)); }
.pps-streak { position: relative; margin: 15px 0 0; color: #f3ecff; font-size: 12px; font-weight: 700; }
.pps-streak b { color: #ffd166; }
.pps-stats { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 14px 3px 0; }
.pps-stat { min-width: 0; padding: 10px 9px 9px; border: 1px solid rgba(157,211,255,.13); border-radius: 12px; background: rgba(4,10,28,.54); }
.pps-stat.gold { border-color: rgba(255,209,102,.34); }
.pps-stat b { display: block; color: #eaf9ff; font-size: 21px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pps-stat.gold b { color: #ffd166; }
.pps-stat span { display: block; margin-top: 5px; color: rgba(218,229,255,.7); font-size: 10px; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pps-top3 { position: relative; margin: 15px 0 0; color: #f3ecff; font-size: 12px; font-weight: 700; line-height: 1.6; }
.pps-top3 b { color: #ffd166; }
.pps-url { margin: 12px 0 0; color: rgba(193,224,250,.62); font-size: 10px; font-weight: 750; letter-spacing: .04em; }
.pps-actions { display: flex; gap: 10px; width: min(100%, 358px); }
.pps-actions button { min-height: 44px; border-radius: 999px; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }
.pps-again { flex: 1; border: 0; background: linear-gradient(135deg, #ffd166, #ff9f6a); color: #21152f; }
.pps-close { width: 76px; border: 1px solid rgba(193,224,250,.28); background: rgba(14,24,54,.9); color: #e8f3ff; }
.pps-status { min-height: 17px; margin: -5px 0 0; color: rgba(218,229,255,.7); font-size: 11px; text-align: center; }
@media (max-width: 360px) { .pps-card { padding-inline: 17px; } .pps-stat { padding-inline: 7px; } .pps-stat b { font-size: 19px; } }
`;
  document.head.appendChild(passportShareStyle);

  passportShareButton = passportScreen.querySelector('[data-pps="share"]');

  passportShareScreen = document.createElement('section');
  passportShareScreen.className = 'pps';
  passportShareScreen.hidden = true;
  passportShareScreen.setAttribute('role', 'dialog');
  passportShareScreen.setAttribute('aria-modal', 'true');
  passportShareScreen.setAttribute('aria-labelledby', 'pps-title');
  passportShareScreen.innerHTML = `
  <article class="pps-card">
    <div class="pps-top"><div><p class="pps-kicker">Where on Earth</p><h3 id="pps-title">My passport</h3></div></div>
    <div class="pps-progress">
      <p class="pps-visited"><b data-pps="visited">0</b> of <span data-pps="total">0</span> places visited</p>
      <div class="pp-bar" aria-hidden="true"><i class="pp-bar-seen" data-pps="barSeen"></i><i class="pp-bar-earned" data-pps="barEarned"></i></div>
    </div>
    <section class="pps-best" data-pps="best" aria-labelledby="pps-best-title">
      <p class="pps-label" id="pps-best-title">Closest guesses</p>
      <ol class="pp-dex pps-top3" data-pps="top3"></ol>
    </section>
    <p class="pps-streak" data-pps="streak" hidden></p>
    <div class="pps-stats">
      <div class="pps-stat"><b data-pps="earned">0</b><span>Postcards</span></div>
      <div class="pps-stat gold"><b data-pps="bullseyes">0</b><span>Bullseyes</span></div>
      <div class="pps-stat gold"><b data-pps="pinpoints">0</b><span>Pinpoints</span></div>
    </div>
    <p class="pps-url">where-on.earth</p>
  </article>
  <div class="pps-actions"><button class="pps-again" type="button" data-pps="again">Share again</button><button class="pps-close" type="button" data-pps="close">Close</button></div>
  <p class="pps-status" role="status" data-pps="status"></p>`;
  document.body.appendChild(passportShareScreen);
  ppsEls = Object.fromEntries([...passportShareScreen.querySelectorAll('[data-pps]')].map((el) => [el.dataset.pps, el]));

  passportShareButton.addEventListener('click', sharePassport);
  ppsEls.again.addEventListener('click', sharePassport);
  ppsEls.close.addEventListener('click', closePassportShare);
  passportShareScreen.addEventListener('click', (event) => { if (event.target === passportShareScreen) closePassportShare(); });


  ppPlaces.els.continent.append(...host.CONTINENT_ORDER.map((name) => new Option(name, name)));
  for (const dex of [ppPlaces, ppLandmarks]) dex.els.band.append(...DIFFICULTY_BANDS.map((b) => new Option(b.label, b.key)));

  ppMysteryTemplate = document.createElement('li');
  ppMysteryTemplate.className = 'pp-slot is-mystery';
  ppMysteryTemplate.setAttribute('aria-label', 'Mystery location, not visited');
  ppMysteryTemplate.append(
    Object.assign(document.createElement('div'), { className: 'pp-slot-photo mystery-photo' }),
    Object.assign(document.createElement('p'), { className: 'pp-slot-name', textContent: '???' }),
  );
  try {
    const savedStatus = localStorage.getItem(PP_STATUS_KEY);
    const savedStatuses = savedStatus?.startsWith('[') ? JSON.parse(savedStatus) : [savedStatus];
    savedStatuses.filter((status) => PP_STATUSES.has(status)).forEach((status) => ppPlaces.statuses.add(status));
  } catch (error) { host.storageError('Read failed', PP_STATUS_KEY, error); }
  syncPpStatusButtons(ppPlaces);
  try {
    const raw = localStorage.getItem(PP_COLLAPSED_KEY);
    if (raw) JSON.parse(raw).forEach((name) => ppCollapsedContinents.add(name));
  } catch (error) { host.storageError('Read failed', PP_COLLAPSED_KEY, error); }
  try {
    const savedView = localStorage.getItem(PP_VIEW_KEY);
    if (savedView === 'places' || savedView === 'countries') ppView = savedView;
  } catch (error) { host.storageError('Read failed', PP_VIEW_KEY, error); }

  passportEntry.addEventListener('click', openPassport);
  ppEls.close.addEventListener('click', () => closePassport());
  ppEls.tabs.querySelectorAll('[role="tab"]').forEach((tab) => {
    tab.addEventListener('click', () => setPassportView(tab.dataset.view));
  });
  for (const dex of [ppPlaces, ppLandmarks]) {
    dex.els.status.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const status = btn.dataset.status;
        if (status === 'all') dex.statuses.clear();
        else if (dex.statuses.has(status)) dex.statuses.delete(status);
        else dex.statuses.add(status);
        if (dex.statusKey) host.safeSetItem(dex.statusKey, JSON.stringify([...dex.statuses]));
        syncPpStatusButtons(dex);
        applyPassportFilters(dex);
        ppScrollToDexTop(dex);
      });
    });
    const applyControlFilter = () => {
      applyPassportFilters(dex);
      ppScrollToDexTop(dex);
    };
    dex.els.continent.addEventListener('change', applyControlFilter);
    dex.els.band.addEventListener('change', applyControlFilter);
    dex.els.sort.addEventListener('change', () => {
      const wasStuck = dex.els.filtersToggle.closest('.pp-toolbar').classList.contains('is-stuck');
      renderPassportDex(dex);
      ppScrollToDexTop(dex, wasStuck);
    });
    dex.els.filtersToggle.addEventListener('click', () => {
      const expanded = dex.els.filtersToggle.getAttribute('aria-expanded') === 'true';
      if (expanded) closePassportFilters(); else openPassportFilters(dex);
    });
    dex.els.groupControls.addEventListener('click', (event) => {
      const action = event.target.closest('[data-group-action]')?.dataset.groupAction;
      if (action) setPpGroupsCollapsed(dex.els.dex, action === 'collapse');
    });
  }
  passportScreen.querySelectorAll('.pp-toolbar-close').forEach((button) => button.addEventListener('click', () => closePassport()));
  document.addEventListener('pointerdown', (event) => {
    const dex = ppOpenFiltersDex();
    if (!dex) return;
    if (!dex.els.filters.contains(event.target) && !dex.els.filtersToggle.closest('.pp-toolbar').contains(event.target)) closePassportFilters();
  });
  ppEls.countrySort.addEventListener('change', renderCountryList);
  ppEls.countryGroupControls.addEventListener('click', (event) => {
    const action = event.target.closest('[data-group-action]')?.dataset.groupAction;
    if (action) setPpGroupsCollapsed(ppEls.countryListBody, action === 'collapse');
  });
  ppEls.countryBack.addEventListener('click', closeCountryDetail);
  passportScreen.addEventListener('click', (e) => {
    if (e.target === passportScreen) closePassport();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || passportScreen.hidden) return;
    if (ppOpenFiltersDex()) { closePassportFilters(); return; }
    if (ppView === 'countries' && ppActiveCountry) closeCountryDetail();
    else closePassport();
  });

  collectionsStyle = document.createElement('style');
  collectionsStyle.textContent = `
.collections-screen { box-sizing: border-box; overflow: auto; padding: calc(env(safe-area-inset-top, 0px) + 18px) 14px calc(env(safe-area-inset-bottom, 0px) + 30px); background: #03060f; color: #e6e8ee; pointer-events: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.collections-shell { width: 100%; max-width: 390px; margin: auto; }
.collections-nav { display: flex; align-items: center; justify-content: space-between; min-height: 44px; margin-bottom: 10px; }
.collections-back { display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px; border: 0; background: none; color: rgba(214,220,232,.68); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.collections-sort { color: rgba(214,220,232,.42); font-size: 11px; font-weight: 650; }
.collections-sort-control { position: relative; display: inline-flex; align-items: center; gap: 3px; }
.collections-sort-control::after { content: ''; width: 5px; height: 5px; margin: -3px 2px 0 1px; border-right: 1px solid rgba(214,220,232,.48); border-bottom: 1px solid rgba(214,220,232,.48); transform: rotate(45deg); pointer-events: none; }
.collections-sort-select { max-width: 112px; margin: 0; padding: 7px 0; border: 0; outline: 0; appearance: none; -webkit-appearance: none; background: transparent; color: rgba(214,220,232,.62); font: inherit; font-weight: 700; text-overflow: ellipsis; cursor: pointer; }
.collections-sort-select:focus-visible { border-radius: 5px; box-shadow: 0 0 0 2px rgba(210,174,98,.45); }
.collections-sort-select option { background: #111726; color: #d6dce8; }
.collections-eyebrow { margin: 0 0 6px; color: rgba(214,220,232,.55); font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.collections-screen h2 { margin: 0; color: #f4f5f8; font-size: 27px; line-height: 1.15; letter-spacing: -.025em; }
.collections-lede { margin: 8px 0 18px; color: rgba(214,220,232,.55); font-size: 14px; line-height: 1.5; }
.collections-stats { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; margin-bottom: 18px; }
.collections-stat { padding: 11px 9px 10px; border: 1px solid rgba(214,220,232,.08); border-radius: 12px; background: #0c111c; }
.collections-stat b { display: block; color: #e6e8ee; font-size: 19px; line-height: 1; font-variant-numeric: tabular-nums; }
.collections-stat.gold b { color: #d2ae62; text-shadow: 0 0 12px rgba(210,174,98,.35); }
.collections-stat span { display: block; margin-top: 4px; color: rgba(214,220,232,.62); font-size: 10px; font-weight: 750; letter-spacing: .03em; text-transform: uppercase; }
.collection-sets { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
.collection-set { position: relative; display: flex; min-width: 0; flex-direction: column; padding: 12px; border: 1px solid rgba(214,220,232,.08); border-radius: 14px; background: linear-gradient(180deg,#111726,#0b0f19); color: inherit; text-align: left; cursor: pointer; touch-action: manipulation; }
.collection-set:active { transform: scale(.97); }
.collection-set.done { border-color: rgba(210,174,98,.45); background: linear-gradient(180deg,#1a1810,#0e1018 70%); box-shadow: 0 0 18px rgba(210,174,98,.12); }
.collection-set-top { display: flex; align-items: center; justify-content: space-between; }
.collection-icon { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid rgba(214,220,232,.1); border-radius: 10px; background: #151b2a; font-size: 18px; }
.collection-count { color: rgba(214,220,232,.55); font-size: 12px; font-weight: 800; }
.collection-set.done .collection-count { color: #d2ae62; }
.collection-name { min-height: 2.4em; margin-top: 10px; color: #e6e8ee; font-size: 14px; font-weight: 750; line-height: 1.2; }
.collection-sub { margin-top: 2px; color: rgba(214,220,232,.32); font-size: 11px; font-weight: 650; }
.collection-bar { height: 3px; margin: 10px 0; border-radius: 3px; overflow: hidden; background: rgba(214,220,232,.08); }
.collection-bar i { display: block; height: 100%; border-radius: inherit; background: rgba(214,220,232,.55); }
.collection-set.done .collection-bar i { background: #d2ae62; box-shadow: 0 0 8px rgba(210,174,98,.6); }
.collection-thumbs { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 5px; margin-top: auto; }
.collection-thumb { position: relative; aspect-ratio: 1; overflow: hidden; border: 1px solid rgba(214,220,232,.14); border-radius: 6px; background: #0a0e17; }
.collection-thumb img { width: 100%; height: 100%; object-fit: cover; }
.collection-detail-head { display: flex; align-items: center; gap: 12px; }
.collection-detail-head .collection-icon { flex: none; width: 48px; height: 48px; border-radius: 14px; font-size: 25px; }
.collection-detail-head p { margin: 4px 0 0; color: rgba(214,220,232,.55); font-size: 13px; }
.collection-progress { margin: 18px 0; padding: 14px; border: 1px solid rgba(214,220,232,.08); border-radius: 14px; background: #0c111c; }
.collection-progress-top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
.collection-progress-top b { font-size: 22px; font-variant-numeric: tabular-nums; }
.collection-progress-top span { color: rgba(214,220,232,.4); font-size: 12px; font-weight: 650; }
.collection-segments { display: flex; gap: 3px; }
.collection-segments i { flex: 1; height: 6px; border-radius: 3px; background: rgba(214,220,232,.08); }
.collection-segments i.earned { background: #d2ae62; box-shadow: 0 0 5px rgba(210,174,98,.45); }
.collection-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 14px 10px; margin: 0; padding: 0; list-style: none; }
.collection-card { position: relative; min-width: 0; padding: 5px 5px 7px; border: 2px solid var(--rarity, rgba(214,220,232,.16)); border-radius: 9px; background: #1a1f2e; }
.collection-card .photo { position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 5px; background: #0d111b; }
.collection-card img { width: 100%; height: 100%; object-fit: cover; object-position: center 30%; }
.collection-card-name { min-height: 2.3em; margin: 6px 1px 0; display: grid; place-items: center; color: #e6e8ee; font-size: 10px; font-weight: 750; line-height: 1.15; text-align: center; }
.collection-card.unearned .collection-card-name { color: rgba(214,220,232,.4); }
.collection-card-meta { margin: 3px 0 0; color: rgba(214,220,232,.62); font-size: 10px; font-weight: 750; text-align: center; text-transform: uppercase; }
.collection-complete { margin: 18px 0; padding: 14px; border: 1px solid rgba(210,174,98,.5); border-radius: 14px; background: linear-gradient(135deg,#241f12,#0e111a); color: #d2ae62; font-size: 13px; font-weight: 800; text-align: center; box-shadow: 0 0 20px rgba(210,174,98,.12); }
body.game-collections #hud { opacity: 0; }
@media (max-width:360px) { .collection-sets { gap: 8px; } .collection-set { padding: 10px; } .collection-grid { gap: 12px 8px; } }
`;
  document.head.appendChild(collectionsStyle);
  collectionsScreen = document.createElement('section');
  collectionsScreen.className = 'screen collections-screen';
  collectionsScreen.hidden = true;
  collectionsScreen.innerHTML = '<div class="collections-shell"><div class="collections-nav"><button class="collections-back" type="button"></button><div class="collections-sort"><label class="collections-sort-control">Sort: <select class="collections-sort-select" aria-label="Sort collections"><option value="completion">Completion %</option><option value="earned">Postcards earned</option><option value="closest">Closest to complete</option><option value="alpha">A–Z</option></select></label><span class="collections-sort-status" hidden></span></div></div><div data-collections="content"></div></div>';
  document.getElementById('game').appendChild(collectionsScreen);
  host.collectionsScreenEl = collectionsScreen;
  collectionsBack = collectionsScreen.querySelector('.collections-back');
  collectionsSort = collectionsScreen.querySelector('.collections-sort');
  collectionsSortControl = collectionsSort.querySelector('.collections-sort-control');
  collectionsSortSelect = collectionsSort.querySelector('.collections-sort-select');
  collectionsSortStatus = collectionsSort.querySelector('.collections-sort-status');
  collectionsContent = collectionsScreen.querySelector('[data-collections="content"]');

  try {
    const savedCollectionSort = localStorage.getItem(COLLECTION_SORT_KEY);
    if (COLLECTION_SORTS.has(savedCollectionSort)) collectionSort = savedCollectionSort;
  } catch (error) {
    host.storageError('Read failed', COLLECTION_SORT_KEY, error);
  }
  collectionsSortSelect.value = collectionSort;

  collectionsEntry.addEventListener('click', () => openCollections('home'));
  ppEls.collections.addEventListener('click', () => openCollections('passport'));
  collectionsBack.addEventListener('click', () => activeCollection ? renderCollectionsOverview() : closeCollections());
  collectionsSortSelect.addEventListener('change', () => {
    collectionSort = collectionsSortSelect.value;
    host.safeSetItem(COLLECTION_SORT_KEY, collectionSort);
    renderCollectionsOverview();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || collectionsScreen.hidden) return;
    if (activeCollection) renderCollectionsOverview();
    else closeCollections();
  });

  postcardStyle = document.createElement('style');
  postcardStyle.textContent = `
.ppd { z-index: 11; box-sizing: border-box; display: flex; overflow: auto; padding: calc(env(safe-area-inset-top, 0px) + 20px) var(--ppd-screen-gutter, 12px) calc(env(safe-area-inset-bottom, 0px) + 20px); pointer-events: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.ppd-scrim { position: fixed; inset: 0; background: rgba(2,4,9,.74); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); }
.ppd-card { --ppd-accent: #d1a943; position: relative; touch-action: pan-y; box-sizing: border-box; width: 100%; max-width: 380px; margin: auto; padding: 13px; border: 2px solid var(--rarity, #3f485b); border-radius: 28px; background: #1a1f2e; box-shadow: 0 24px 70px rgba(0,0,0,.72), inset 0 1px rgba(255,255,255,.08); color: #f7f8fc; transform-origin: 0 0; }
.ppd-card[data-earn="seen"] .pp-photo img { filter: grayscale(1) contrast(.92) brightness(.82); }
.ppd-front .prox-badge { top: 10px; left: 10px; gap: 5px; height: 26px; padding: 0 11px 0 8px; font-size: 11px; box-shadow: 0 2px 8px rgba(0,0,0,.55); }
.ppd-front .prox-badge i { font-size: 14px; }
.ppd-front { position: relative; }
.ppd-front .pp-photo { aspect-ratio: 16 / 9; border-radius: 15px; }
.ppd-front .pp-photo::after { font-size: 44px; }
.ppd-close { position: absolute; z-index: 3; top: var(--ppd-control-inset, 6px); right: var(--ppd-control-inset, 6px); width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; background: none; cursor: pointer; touch-action: manipulation; }
.ppd-close::before, .ppd-nav::before { content: '×'; display: grid; place-items: center; width: 32px; height: 32px; margin: auto; border-radius: 50%; background: rgba(8,14,32,.72); color: #f5fbff; font-size: 22px; line-height: 1; }
/* Previous and next: the close button's circle, quieter, centred on the photo edges. */
.ppd-nav { position: absolute; z-index: 3; top: 50%; width: 44px; height: 44px; margin-top: -22px; padding: 0; border: 0; background: none; cursor: pointer; opacity: .55; touch-action: manipulation; }
.ppd-nav[data-dir="-1"] { left: 0; }
.ppd-nav[data-dir="1"] { right: 0; }
.ppd-nav[data-dir="-1"]::before { content: '‹'; padding-bottom: 3px; box-sizing: border-box; }
.ppd-nav[data-dir="1"]::before { content: '›'; padding-bottom: 3px; box-sizing: border-box; }
.ppd-nav.is-end { opacity: .2; }
.ppd-nav[hidden] { display: none; }
.ppd-close:focus-visible { outline: none; }
.ppd-close:focus-visible::before { box-shadow: 0 0 0 2px #67e8ff; }
.ppd-body { padding: 14px 2px 0; color: #f7f8fc; }
.ppd-from, .ppd-pos { margin: 0; color: #8f9aaf; font-size: 10px; font-weight: 800; letter-spacing: .17em; text-transform: uppercase; }
.ppd-pos { position: absolute; top: 100%; left: 0; right: 0; padding-top: 7px; font-variant-numeric: tabular-nums; text-align: center; }
.ppd-pos[hidden] { display: none; }
.ppd-body h3 { margin: 4px 0 0; color: #f7f8fc; font-family: Georgia, serif; font-size: 27px; font-weight: 700; line-height: 1.1; letter-spacing: -.02em; overflow-wrap: anywhere; }
.ppd-clue { margin: 4px 0 0; color: #8f9aaf; font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.ppd-history { display: grid; gap: 5px; margin: 13px 0 0; color: #818da2; font-size: 10px; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
.ppd-history-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
.ppd-history-row strong { min-width: 0; color: #c8cfdb; font-weight: 750; text-align: right; white-space: nowrap; }
.ppd-history[hidden] { display: none; }
.ppd-fact { margin: 14px 0 0; padding: 0 0 14px; border-bottom: 1px solid #303748; color: #c2c8d4; font-family: Georgia, serif; font-size: 13px; line-height: 1.52; }
.ppd-fact::before { content: 'DID YOU KNOW?'; display: block; margin-bottom: 5px; color: var(--ppd-accent); font-family: Inter, sans-serif; font-size: 10px; font-weight: 900; letter-spacing: .15em; }
.ppd-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 14px 0 0; }
.ppd-stats div { min-width: 0; padding: 10px; border: 1px solid #30384a; border-radius: 10px; background: #151a27; }
.ppd-stats dt { color: #8a95a9; font-size: 10px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
.ppd-stats dd { margin: 5px 0 0; color: #f7f8fc; font-size: 14px; font-weight: 850; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ppd-stats dd small { color: #8390a6; font-size: 10px; font-weight: 650; }
.ppd-hint { margin: 10px 0 0; color: #9fa9bb; font-size: 12px; font-weight: 700; text-align: center; }
.ppd-share { display: block; width: 100%; min-height: 45px; margin: 13px 0 0; padding: 0 16px; border: 1px solid #4b566b; border-radius: 12px; background: #252d40; color: #fff; font-size: 11px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; cursor: pointer; touch-action: manipulation; }
.ppd-share:active { transform: scale(.98); }
.ppd-share:focus-visible { outline: 2px solid #67e8ff; outline-offset: 2px; }
.ppd-share[hidden] { display: none; }`;
  document.head.appendChild(postcardStyle);

  postcardScreen = document.createElement('section');
  postcardScreen.className = 'screen ppd';
  postcardScreen.hidden = true;
  postcardScreen.innerHTML = `
  <div class="ppd-scrim" data-ppd="scrim"></div>
  <article class="ppd-card" role="dialog" aria-modal="true" aria-labelledby="ppd-title" data-ppd="card">
    <button class="ppd-close" aria-label="Close postcard" data-ppd="close"></button>
    <div class="ppd-front">
      <div class="pp-photo" data-ppd="photo"></div>
      <button class="ppd-nav" data-dir="-1" aria-label="Previous postcard" tabindex="-1" data-ppd="prev"></button>
      <button class="ppd-nav" data-dir="1" aria-label="Next postcard" tabindex="-1" data-ppd="next"></button>
    </div>
    <div class="ppd-body">
      <p class="ppd-from" data-ppd="from"></p>
      <h3 id="ppd-title" data-ppd="name"></h3>
      <p class="ppd-clue" data-ppd="clue"></p>
      <p class="ppd-fact" data-ppd="fact"></p>
      <dl class="ppd-stats" data-ppd="stats"></dl>
      <p class="ppd-hint" data-ppd="hint"></p>
      <div class="ppd-history" data-ppd="history" aria-label="Visit history"></div>
      <button class="ppd-share" data-ppd="share"></button>
    </div>
    <p class="ppd-pos" aria-live="polite" data-ppd="pos"></p>
  </article>`;
  document.getElementById('game').appendChild(postcardScreen);

  ppdEls = Object.fromEntries([...postcardScreen.querySelectorAll('[data-ppd]')].map((el) => [el.dataset.ppd, el]));

  ppdEls.close.addEventListener('click', closePostcard);
  ppdEls.prev.addEventListener('click', () => stepPostcard(-1));
  ppdEls.next.addEventListener('click', () => stepPostcard(1));
  // Swipe: judged on pointerup only, so vertical scrolling (pan-y) and taps
  // behave as before. Buttons and the 20px screen edges (iOS back swipe) never
  // start one.
  let swipe = null;
  let swallowClickUntil = 0;
  ppdEls.card.addEventListener('pointerdown', (e) => {
    swipe = null;
    if (!e.isPrimary || e.button > 0 || e.target.closest('button')) return;
    if (e.clientX < 20 || e.clientX > window.innerWidth - 20) return;
    swipe = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
  });
  window.addEventListener('pointercancel', () => { swipe = null; });
  window.addEventListener('pointerup', (e) => {
    const start = swipe;
    swipe = null;
    if (!start || e.pointerId !== start.id || postcardScreen.hidden) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < 1.5 * Math.abs(dy) || e.timeStamp - start.t >= 600) return;
    // A swipe released over the scrim would otherwise close the card.
    swallowClickUntil = e.timeStamp + 400;
    stepPostcard(dx < 0 ? 1 : -1);
  });
  postcardScreen.addEventListener('click', (e) => {
    if (e.timeStamp >= swallowClickUntil) return;
    swallowClickUntil = 0;
    e.stopImmediatePropagation();
  }, true);
  postcardScreen.addEventListener('click', (e) => {
    if (e.target === postcardScreen || e.target === ppdEls.scrim) closePostcard();
  });
  // Capture on window so Escape closes the postcard before the passport's own
  // Escape handler (on document) can close the whole passport underneath it.
  window.addEventListener('keydown', (e) => {
    if (postcardScreen.hidden) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePostcard();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      stepPostcard(e.key === 'ArrowRight' ? 1 : -1);
    } else if (e.key === 'Tab') {
      // Close and (when shown) share are the only controls; keep focus between them.
      e.preventDefault();
      const stops = [ppdEls.close, ppdEls.share].filter((el) => !el.hidden);
      const at = stops.indexOf(document.activeElement);
      stops[(at + (e.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
    }
  }, true);
  ppdEls.share.addEventListener('click', async () => {
    if (!ppdEntry || !Number.isFinite(ppdEntry.km)) return;
    const text = postcardShareText(ppdEntry);
    const button = ppdEls.share;
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = '✓ Copied';
    } catch {
      window.prompt('Copy this to share:', text); // no clipboard (insecure context, denied)
      return;
    }
    clearTimeout(ppdCopiedTimer);
    ppdCopiedTimer = setTimeout(() => { button.textContent = SHARE_LABEL; }, 1800);
  });
}
