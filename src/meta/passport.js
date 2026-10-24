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
import { currentStreak } from './stats.js';
import { buildPostcardCard, ensurePostcardCardStyles, postcardDisplayName } from './postcard-card.js';
import { passportEntryCompare, passportGroups } from './passport-grouping.mjs';

let host = null;
const PASSPORT_STAMPS = 5; // recent photo stamps
function passportSummary() {
  let found = 0;
  let earned = 0;
  for (const id of Object.keys(host.passport.visits)) {
    const item = host.passportLocation(id);
    if (!item) continue; // location retired from locations.json
    found += 1;
    if (host.passport.meta[id]?.e) earned += 1;
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
  };
}
let passportStyle;

let passportBox;
let passportEls;

export function syncPassport() {
  if (host.passportDirty) host.buildPassportDots();
  const summary = passportSummary();
  const isRecsHome = document.body.classList.contains('home-recs');
  if (isRecsHome) {
    passportEls.box.hidden = false;
  } else {
    passportEls.box.hidden = summary.found === 0;
  }
  host.gameEls.start.classList.toggle('has-passport', summary.found > 0);
  passportEls.found.textContent = summary.found.toLocaleString();
  passportEls.total.textContent = summary.total.toLocaleString();
  passportEls.earned.textContent = summary.earned ? ` · ${summary.earned.toLocaleString()} earned` : '';
  const streak = currentStreak();
  passportEls.streak.textContent = streak ? ` · ${streak.toLocaleString()}` : '';
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

// Every location, visited or not: the dex grid's full set of slots.
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

let passportScreen;

let ppEls;
// The passport is one unified shelf (cities and places together, no tabs):
// one dex with its own controls, slots and filter state (see ppDex()). The
// kind split (cities vs places) that used to be two tabs is now a Kind filter
// inside Browse, same shape as the Status filter.
let ppShelf;
let ppFilterOpenTop = 0;
let ppFilterScrollFrame = 0;

function ppOpenFiltersDex() {
  return ppShelf.els.filtersToggle.getAttribute('aria-expanded') === 'true' ? ppShelf : null;
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

// Shared by passportSlot() (postcard score pill) and the mystery-slot grid;
// no longer shared with a share card (the Share pill and its card are gone,
// Sean 2026-10-22 — see the minimal-passport report).
function formatShareKm(km) {
  if (km < 1) return '<1 km';
  if (km < 1000) return `${Math.round(km)} km`;
  if (km < 10000) return `${(Math.round(km / 100) / 10).toString()}k km`;
  return `${Math.round(km / 1000)}k km`;
}

// One template, cloned for every mystery slot: mysteries never mount an <img>
// and look identical, so building 1,000+ of them is cheap (3 nodes each).
let ppMysteryTemplate;
// The same face-down card for the Daily postcard pack's unopened slots.
export function passportMysterySlot() {
  return ppMysteryTemplate.cloneNode(true);
}

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
    showFlagInName: false,
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
  li.dataset.kind = entry.kind || '';
}

// Atlas grouping/within-group order: by country, then by name (so a country's
// slots sit together under one flag). Used for every group, and for mysteries
// at the tail of a flat sort (recency/distance are meaningless for them).
const PP_STATUS_KEY = 'where-on-earth-passport-status';
const PP_STATUSES = new Set(['earned', 'seen', 'unvisited']);

// One filterable dex per tab. `view` is the tab's container; `dex` and
// `sentinel` name the dex body and sticky sentinel by their data-pp names in it. `statusKey` is
// Places only: the Landmarks tab keeps its filters in memory (no new key).
function ppDex(view, { tab, noun, sentinel, dex, statusKey = null }) {
  const q = (name) => view.querySelector(`[data-pp="${name}"]`);
  return {
    els: {
      filters: q('filters'), filtersToggle: q('filters-toggle'), badge: q('badge'), status: q('status'), kind: q('kind'),
      grouping: q('grouping'), sort: q('sort'), sortLabel: q('sort-label'), shown: q('shown'), empty: q('empty'),
      dex: q(dex), sentinel: q(sentinel),
      summary: q('filters-summary'),
    },
    tab,
    noun,
    statusKey,
    statuses: new Set(),
    kind: 'all', // 'all' | 'city' | 'place': the Browse panel's Kind filter, replacing the old Cities/Places tabs
    grouping: 'continent',
    sorts: new Map([['continent', 'atlas'], ['country', 'atlas'], ['difficulty', 'atlas'], ['none', 'recent']]),
    accordion: new Map(),
    all: [], // every entry for the open tab, filtered client-side
    groups: [], // atlas sort only: [{ section, name, head }]
    lis: [], // every rendered slot: [{ li, entry }]
  };
}

// The Filters toggle, toolbar close and filter panel, shared by both dex tabs.
// The toggle is one wide pill that summarises the active filters.
function ppFilterControls(id) {
  return `<button type="button" class="pp-filters-btn pp-filters-pill" data-pp="filters-toggle" aria-expanded="false" aria-controls="${id}" aria-label="Browse, no status filters active"><span>Browse <b class="pp-badge" data-pp="badge" hidden></b></span><span class="pp-filters-summary" data-pp="filters-summary"></span></button>
        <button type="button" class="pp-toolbar-close" aria-label="Close passport">×</button>
        <div class="pp-filters" id="${id}" data-pp="filters" aria-hidden="true">
        <span class="pp-filter-label">Kind</span>
        <div class="pp-status pp-kind" role="group" aria-label="Filter by kind" data-pp="kind">
          <button type="button" data-kind="all" aria-pressed="true">All</button>
          <button type="button" data-kind="city" aria-pressed="false">Cities</button>
          <button type="button" data-kind="place" aria-pressed="false">Places</button>
        </div>
        <span class="pp-filter-label">Show</span>
        <div class="pp-status" role="group" aria-label="Filter by status" data-pp="status">
          <button type="button" data-status="all" aria-pressed="true">All</button>
          <button type="button" data-status="earned" aria-pressed="false">Earned</button>
          <button type="button" data-status="seen" aria-pressed="false">Seen</button>
          <button type="button" data-status="unvisited" aria-pressed="false">Unvisited</button>
        </div>
        <label class="pp-filter-label" for="${id}-grouping">Group by</label>
        <select id="${id}-grouping" data-pp="grouping" aria-label="Group by">
          <option value="continent">Continent</option>
          <option value="country">Country</option>
          <option value="difficulty">Difficulty</option>
          <option value="none">None</option>
        </select>
        <label class="pp-filter-label" data-pp="sort-label" for="${id}-sort">Sort within groups</label>
        <select id="${id}-sort" data-pp="sort" aria-label="Sort within groups">
          <option value="atlas">Country then name</option>
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

function syncPpKindButtons(dex) {
  dex.els.kind.querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.kind === dex.kind));
  });
}

const PP_COLLAPSED_KEY = 'where-on-earth-collapsed-continents';
const ppCollapsedContinents = new Set();

function savePpCollapsedContinents() {
  try { localStorage.setItem(PP_COLLAPSED_KEY, JSON.stringify([...ppCollapsedContinents])); }
  catch (error) { host.storageError('Write failed', PP_COLLAPSED_KEY, error); }
}

// Continent rows are an accordion: at most one open at a time, tracked in
// ppCollapsedContinents (PP_COLLAPSED_KEY). Every group starts collapsed on
// each Passport open (see openPassport(), which clears the per-open session
// cache); this just persists the open/closed state a tap produces so the
// within-session toggle (ppDexGroupHead) behaves consistently across a
// grouping or sort change.
function ppSetAccordionOpen(open, names) {
  names.forEach((name) => { if (name === open) ppCollapsedContinents.delete(name); else ppCollapsedContinents.add(name); });
  savePpCollapsedContinents();
}

// Shared collapsible continent row <h3 class="pp-group-head is-accordion"> for
// the Places dex (atlas sort), the Countries list (continent sort) and the
// Landmarks shelf (atlas sort). `onCollapse` toggles whatever that caller's
// group body is (a <ul>, or a running list of row <li>s) and is also called
// once up front for the saved state. `{ earned, visited, total }` fill the
// row's count and mini bar. A tap on a closed row opens it and closes the other
// rows inside the nearest [data-pp-accordion] container; a tap on the open row
// closes it, saving every known continent as collapsed.
function ppGroupHead(name, onCollapse, { earned, visited, total }) {
  const head = document.createElement('h3');
  head.className = 'pp-group-head is-accordion';
  head.tabIndex = 0;
  head.setAttribute('role', 'button');
  const label = document.createElement('span');
  label.className = 'pp-group-head-text';
  const pct = (n) => (total ? (n / total) * 100 : 0);
  label.innerHTML = `<b></b><span class="pp-group-sub">${earned.toLocaleString()} of ${total.toLocaleString()} collected</span>`;
  label.querySelector('b').textContent = name;
  const bar = document.createElement('span');
  bar.className = 'pp-bar pp-group-bar';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = `<i class="pp-bar-seen" style="width:${pct(visited)}%"></i><i class="pp-bar-earned" style="width:${pct(earned)}%"></i>`;
  head.append(label, bar);
  const apply = (collapsed) => {
    head.setAttribute('aria-expanded', String(!collapsed));
    onCollapse(collapsed);
  };
  head.ppApplyCollapse = apply;
  head.dataset.continent = name;
  const toggle = () => {
    const heads = [...head.closest('[data-pp-accordion]').querySelectorAll('.pp-group-head')];
    const names = heads.map((h) => h.dataset.continent);
    if (ppCollapsedContinents.has(name)) ppSetAccordionOpen(name, names);
    else ppSetAccordionOpen(null, [...new Set([...host.CONTINENT_ORDER, ...names])]);
    heads.forEach((h) => h.ppApplyCollapse(ppCollapsedContinents.has(h.dataset.continent)));
    // Closing a continent above this one pulls it upward; bring it back into view.
    const target = head.closest('.pp-group, .pp-ccards-head') || head;
    if (target.getBoundingClientRect().top < passportScreen.getBoundingClientRect().top) target.scrollIntoView({ block: 'start' });
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

// Every group starts collapsed on first paint, in every grouping (Sean,
// 2026-10-22): no default-open continent/first-earned-group fallback. Once
// the user taps a row open (ppDexGroupHead), that choice is cached here for
// the rest of this open so switching sort or grouping and back doesn't
// re-collapse it; openPassport() clears this cache on every fresh open, so
// the "all collapsed" first paint always wins back on reopen.
function ppInitialDexOpen(dex) {
  if (dex.accordion.has(dex.grouping)) return dex.accordion.get(dex.grouping);
  dex.accordion.set(dex.grouping, null);
  return null;
}

function ppDexGroupHead(dex, group, onCollapse, totals) {
  const head = ppGroupHead(group.label, onCollapse, totals);
  head.dataset.continent = group.key;
  if (group.flag) {
    head.classList.add('is-country');
    const flag = document.createElement('span');
    flag.className = 'pp-group-flag';
    flag.textContent = group.flag;
    flag.setAttribute('aria-hidden', 'true');
    head.prepend(flag);
  }
  const toggle = (event) => {
    event.stopImmediatePropagation();
    const next = head.getAttribute('aria-expanded') === 'true' ? null : group.key;
    dex.accordion.set(dex.grouping, next);
    const heads = [...head.closest('[data-pp-accordion]').querySelectorAll('.pp-group-head')];
    heads.forEach((candidate) => candidate.ppApplyCollapse(candidate.dataset.continent !== next));
    if (dex.grouping === 'continent') {
      ppSetAccordionOpen(next, next ? heads.map((candidate) => candidate.dataset.continent) : [...new Set([...host.CONTINENT_ORDER, ...heads.map((candidate) => candidate.dataset.continent)])]);
    }
    const target = head.closest('.pp-group') || head;
    if (target.getBoundingClientRect().top < passportScreen.getBoundingClientRect().top) target.scrollIntoView({ block: 'start' });
  };
  head.addEventListener('click', toggle, true);
  head.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle(event);
  }, true);
  return head;
}

// Build once per open, group change or sort change. Status filtering only
// toggles slots and sections, preserving each grouping's accordion state.
function renderPassportDex(dex) {
  const sort = dex.els.sort.value;
  dex.groups = [];
  dex.lis = [];
  const frag = document.createDocumentFragment();
  const groups = passportGroups(dex.all, dex.grouping, host.CONTINENT_ORDER, (key) => {
    const country = countryIndex?.get(key);
    const fallback = dex.all.find((entry) => entry.country === key);
    return country || (fallback ? { flag: host.flagForLocation(fallback.item) } : null);
  });
  if (dex.grouping !== 'none') {
    const open = ppInitialDexOpen(dex);
    for (const group of groups) {
      const items = group.entries.sort(passportEntryCompare(sort));
      const section = document.createElement('section');
      section.className = 'pp-group';
      section.dataset.group = group.key;
      const ul = document.createElement('ul');
      ul.className = 'pp-dex';
      ul.append(...items.map((entry) => {
        const li = passportSlot(entry);
        ppTagSlot(li, entry);
        dex.lis.push({ li, entry });
        return li;
      }));
      const head = ppDexGroupHead(dex, group, (collapsed) => { ul.hidden = collapsed; }, {
        earned: items.filter((entry) => entry.earned).length,
        visited: items.filter((entry) => entry.visited).length,
        total: items.length,
      });
      head.ppApplyCollapse(group.key !== open);
      section.append(head, ul);
      frag.append(section);
      dex.groups.push({ section, name: group.key, head });
    }
  } else {
    const ordered = [...dex.all].sort(passportEntryCompare(sort));
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
  applyPassportFilters(dex);
}

// Toggle-only pass: status changes never rebuild the dex.
function applyPassportFilters(dex) {
  let shown = 0;
  for (const { li, entry } of dex.lis) {
    const show = (dex.statuses.size === 0 || dex.statuses.has(li.dataset.status)) && (dex.kind === 'all' || li.dataset.kind === dex.kind);
    li.hidden = !show;
    if (show) shown += 1;
  }
  for (const { section } of dex.groups) {
    section.hidden = ![...section.querySelectorAll('.pp-slot')].some((li) => !li.hidden);
  }
  dex.els.dex.querySelectorAll('.pp-chunk').forEach((chunk) => {
    chunk.hidden = ![...chunk.querySelectorAll('.pp-slot')].some((li) => !li.hidden);
  });
  const filtered = dex.statuses.size > 0 || dex.kind !== 'all';
  dex.els.shown.textContent = filtered
    ? (shown ? `${shown.toLocaleString()} of ${dex.all.length.toLocaleString()} shown` : 'No stamps match these filters yet.')
    : `${dex.all.length.toLocaleString()} ${dex.noun}`;
  dex.els.empty.hidden = shown !== 0;
  const active = dex.statuses.size + (dex.kind !== 'all' ? 1 : 0);
  dex.els.badge.hidden = active === 0;
  dex.els.badge.textContent = active ? `•${active}` : '';
  dex.els.filtersToggle.classList.toggle('has-active', active > 0);
  dex.els.filtersToggle.setAttribute('aria-label', active ? `Browse, ${active} filters active` : 'Browse, no filters active');
  const kindLabel = dex.kind === 'city' ? 'Cities' : dex.kind === 'place' ? 'Places' : null;
  const statuses = [...dex.els.status.querySelectorAll('button')].filter((b) => dex.statuses.has(b.dataset.status)).map((b) => b.textContent);
  const grouping = dex.grouping === 'none' ? 'No grouping' : `Grouped by ${dex.grouping}`;
  const statusParts = [...(kindLabel ? [kindLabel] : []), ...statuses];
  const status = statusParts.length ? statusParts.join(', ') : `All ${dex.noun}`;
  const nondefaultSort = dex.els.sort.value !== 'atlas' ? ` · ${dex.els.sort.selectedOptions[0].text}` : '';
  dex.els.summary.textContent = `${grouping} - ${status}${nondefaultSort}`;
}

// Builds the one unified shelf: every city (host.locations) plus every place
// in the landmark pool, tagged with entry.kind so the Browse panel's Kind
// filter (All/Cities/Places) can toggle between them without a page change.
// Header counts (found/total/postcards) stay cities-only, matching what they
// always measured before the places merge.
function renderPassportPage() {
  if (!countryIndex) buildCountryIndex();
  const visited = passportEntries(); // visited cities only, for the header stats
  const cities = passportAllEntries(); // every city, visited or not, for the dex grid
  cities.forEach((entry) => { entry.kind = 'city'; });
  const age = new Map(host.passport.order.map((id, i) => [id, i]));
  const shelfItems = host.AUDIT_MODE && host.landmarks?.length ? host.landmarks : host.landmarkShelf();
  const places = shelfItems.map((item) => buildPassportEntry(item, age));
  places.forEach((entry) => { entry.kind = 'place'; });
  ppShelf.all = [...cities, ...places];
  const total = host.locations.length;
  const found = visited.length;
  ppEls.found.textContent = found.toLocaleString();
  ppEls.total.textContent = total.toLocaleString();
  const earned = visited.filter((e) => e.earned).length;
  ppEls.postcards.textContent = ` · ${earned.toLocaleString()} postcard${earned === 1 ? '' : 's'}`;
  ppEls.bar.setAttribute('aria-valuemax', String(total));
  ppEls.bar.setAttribute('aria-valuenow', String(earned));
  ppEls.fill.style.width = `${total ? (found / total) * 100 : 0}%`;
  ppEls.earnFill.style.width = `${total ? (earned / total) * 100 : 0}%`;
  renderPassportDex(ppShelf);
}

// ---------------------------------------------------------------------------
// countryIndex (built once locations arrive, next to locationIndex) groups
// every location by countryKey(); the Countries tab that used to list/detail
// it with stamp-album cards is gone (Sean, 2026-10-22; minimal-passport
// brief) — Group by Country in the Browse panel replaces it, rendering slim
// country section rows through the same ppDexGroupHead/passportGroups path
// as every other grouping. countryIndex itself stays: passportGroups() still
// reads it for each country's flag.
// ---------------------------------------------------------------------------

// 338 locations ship Wikimedia's "No image available" graphic instead of a photo.
function hasRealPhoto(item) {
  return Boolean(item.image) && !item.image.includes('No_image_available');
}

function openPassport() {
  ppShelf.accordion.clear(); // every group starts collapsed on each open (Sean, 2026-10-22)
  renderPassportPage();
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
  const badgeDistance = Number.isFinite(entry.km) ? formatShareKm(entry.km) : '';
  ppdEls.distanceBadge.hidden = !badgeDistance;
  ppdEls.distanceBadge.dataset.tier = entry.earned >= host.EARN_PINPOINT
    ? 'pinpoint'
    : entry.earned >= host.EARN_BULLSEYE ? 'bullseye' : 'ordinary';
  ppdEls.distanceBadge.replaceChildren();
  if (badgeDistance) {
    const [distance, unit] = badgeDistance.split(/\s+/, 2);
    ppdEls.distanceBadge.append(document.createTextNode(distance));
    if (unit) ppdEls.distanceBadge.append(document.createElement('br'), document.createTextNode(unit));
  }
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
  const isRecsHome = document.body.classList.contains('home-recs');
  passportStyle = document.createElement('style');
  passportStyle.textContent = `
/* A plain scrim, not backdrop-filter: a blurred panel over the live WebGL canvas
   starves the software compositor (the stats overlay needed a frozen loop for the
   same reason) and the dots show through the tint anyway. */
.passport[hidden] { display: none; }
.pp-chunk[hidden] { display: none; }
.passport { position: relative; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.passport:active { transform: scale(.99); }
.passport:focus-visible { outline: 2px solid #67e8ff; outline-offset: 2px; }
.passport { overflow: hidden; padding: 0 0 11px; border: 0; border-radius: 8px; background: var(--mail-paper); box-shadow: 0 3px 10px rgba(0,0,0,.45), inset 0 0 0 1px rgba(101,78,38,.18); }
.passport::before { content: ''; display: block; height: var(--mail-band-height); background: var(--mail-stripe); }
.passport-count { margin: 11px 76px 0 14px; color: rgba(52,72,96,.78); font-size: 13px; font-weight: 700; }
.passport-earned, .passport-streak { color: #b27c20; }
.passport-count b { color: #22355c; font-size: 27px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -.02em; text-shadow: none; }
.passport-stamps { display: flex; justify-content: flex-start; gap: 7px; margin: 11px 76px 0 14px; }
.passport-stamps img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: #fffdf6; border: 2px solid rgba(52,72,96,.35); }
.passport-stamps img[data-tier="gold"] { border-color: #b27c20; box-shadow: none; }
.passport-stamps img[data-tier="cyan"] { border-color: #34486a; }
.passport-stamps img[data-tier="dim"] { filter: saturate(.65) brightness(.7); }
.passport-postmark { position: absolute; top: 17px; right: 13px; display: grid; place-items: center; width: 56px; height: 56px; border: 2px solid rgba(52,72,96,.45); border-radius: 50%; color: rgba(52,72,96,.68); font-size: 7px; font-weight: 800; letter-spacing: .08em; line-height: 1.35; text-align: center; transform: rotate(-11deg); }
.passport-postmark time { display: block; font-size: 9px; }

/* Recommended home variant: the card as a one-line strip at the mode grid's
   width, with the default card's padding and type. The postmark centers in
   the paper below the band, inset 14px like the count. */
.home-recs .passport { box-sizing: border-box; width: min(100%, 354px); max-width: calc(100vw - 32px); }
.home-recs .passport-count { margin-right: 72px; overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.home-recs .passport-stamps, .home-recs .passport-streak { display: none; }
.home-recs .passport-postmark { top: var(--mail-band-height); bottom: 0; right: 14px; width: 44px; height: 44px; margin: auto 0; }
@media (max-height: 700px) {
  .passport { margin-bottom: 18px; }
  .passport-count b { font-size: 23px; }
  .passport-stamps img { width: 34px; height: 34px; }
}

/* In the recs variant, hide the intro sentence (.how-to) since the passport
   strip replaces it at the bottom of the stack. */
.home-recs .start-screen .how-to { display: none; }
`;
  document.head.appendChild(passportStyle);

  passportBox = document.createElement('div');
  passportBox.className = 'passport';
  passportBox.hidden = true;
  // The summary card is the Passport button.
  passportBox.setAttribute('role', 'button');
  passportBox.tabIndex = 0;
  passportBox.setAttribute('aria-label', 'Open your passport');
  passportBox.innerHTML = `
  <p class="passport-count"><b data-passport="found">0</b> / <span data-passport="total">0</span> places found<span class="passport-earned" data-passport="earned"></span><span class="passport-streak" data-passport="streak"></span></p>
  <div class="passport-stamps" data-passport="stamps"></div>
  <span class="passport-postmark" aria-hidden="true"><time></time></span>`;
  passportBox.querySelector('.passport-postmark time').textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  passportBox.addEventListener('click', openPassport);
  passportBox.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPassport(); }
  });
  // In the recs variant, place the passport strip at the bottom of the
  // start-screen stack (after the mode-buttons). In the default home, keep
  // it above the mode-buttons as before.
  if (isRecsHome) {
    host.gameEls.start.appendChild(passportBox);
  } else {
    host.gameEls.play.closest('.mode-buttons').before(passportBox);
  }
  passportEls = {
    box: passportBox,
    found: passportBox.querySelector('[data-passport="found"]'),
    total: passportBox.querySelector('[data-passport="total"]'),
    earned: passportBox.querySelector('[data-passport="earned"]'),
    streak: passportBox.querySelector('[data-passport="streak"]'),
    stamps: passportBox.querySelector('[data-passport="stamps"]'),
  };
}

export function initPassport(main) {
  host = main;
  ensurePostcardCardStyles();

  passportPageStyle = document.createElement('style');
  passportPageStyle.textContent = `
.pp-card [hidden] { display: none !important; }
.passport-entry { min-height: 44px; padding: 0 14px; border: 1px solid rgba(103,232,255,.4); border-radius: 999px; background: rgba(103,232,255,.09); color: #c9f6ff; font-size: 13px; font-weight: 750; cursor: pointer; touch-action: manipulation; }
.passport-entry:active { transform: scale(.98); }
.passport-entry:disabled { opacity: .4; }
.pp-card { --pp-toolbar-h: 44px; --pp-toolbar-top: 0px; position: relative; box-sizing: border-box; width: 100%; max-width: 440px; min-height: 100%; margin: auto; padding: 14px 14px 20px; border-radius: 24px; overflow-x: clip; } /* Keep clip: overflow:hidden breaks sticky descendants. */
[data-pp="shelf-view"] { --pp-toolbar-h: 52px; }
.pp-card h2 { margin: 0; color: #f5fbff; font-size: 21px; text-align: center; letter-spacing: -.02em; }
.pp-audit-banner { position: relative; display: flex; align-items: center; justify-content: center; gap: 7px; flex-wrap: wrap; margin: 0 0 8px; padding: 5px 8px; border: 1px solid rgba(255,209,102,.45); border-radius: 999px; background: rgba(255,209,102,.1); color: #ffd166; font-size: 10px; font-weight: 850; letter-spacing: .08em; text-align: center; text-transform: uppercase; }
.pp-audit-flags-button { min-height: 24px; padding: 1px 8px; border: 1px solid rgba(255,209,102,.55); border-radius: 999px; background: rgba(8,14,32,.45); color: #ffe29a; font: inherit; font-size: 10px; font-weight: 850; cursor: pointer; text-transform: none; }
.pp-audit-flags-panel { flex: 1 0 100%; max-height: 220px; overflow: auto; padding: 8px 4px 2px; border-top: 1px solid rgba(255,209,102,.2); color: rgba(255,244,207,.8); font-size: 11px; letter-spacing: normal; text-align: left; text-transform: none; }
.pp-audit-flags-panel ul { margin: 0; padding-left: 18px; }
.pp-audit-flags-panel li { margin: 3px 0; }
.pp-audit-flags-actions { display: flex; justify-content: flex-end; margin-bottom: 4px; }
.pp-audit-flags-actions button { padding: 3px 8px; border: 1px solid rgba(255,209,102,.4); border-radius: 999px; background: transparent; color: #ffe29a; font: inherit; font-size: 10px; font-weight: 800; cursor: pointer; }
.pp-audit-flags-status { min-height: 1.2em; margin: 4px 0 0; color: rgba(255,244,207,.62); font-size: 10px; text-align: center; }
/* Slim single-row header (Sean, 2026-10-22): title and counts share one line,
   the close × is absolutely positioned (.stats-close) so it never needs its
   own flex slot, and no Stats/Share pill lives here any more. */
.pp-header-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 0; padding-right: 40px; }
.pp-header-row h2 { flex: none; text-align: left !important; font-size: 19px !important; }
.pp-header-actions { display: flex; flex-shrink: 0; gap: 8px; }
.pp-share-icon { flex-shrink: 0; width: 44px; height: 44px; border: 1px solid rgba(255,209,102,.55); border-radius: 50%; background: linear-gradient(135deg, rgba(77,54,145,.95), rgba(25,47,101,.95)); color: #fff7dc; font-size: 18px; font-weight: 800; cursor: pointer; }
.pp-progress { margin: 8px 2px 0; }
.pp-count { flex: 1 1 auto; min-width: 0; margin: 0; color: rgba(234,246,255,.92); font-size: 13px; font-weight: 650; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.pp-count-sub { color: rgba(193,224,250,.6); font-weight: 500; }
/* Two layers: visited as a pale track, earned as the bright gradient over it. */
.pp-bar { position: relative; height: 4px; border-radius: 8px; background: rgba(157,211,255,.1); overflow: hidden; }
.pp-bar i { position: absolute; left: 0; top: 0; height: 100%; border-radius: 8px; transition: width .4s ease-out; }
.pp-bar .pp-bar-seen { background: rgba(193,224,250,.22); }
.pp-bar .pp-bar-earned { background: linear-gradient(90deg, #67e8ff, #c4a8ff 55%, #ffd166); box-shadow: 0 0 12px rgba(255,209,102,.35); }
.pp-stick-sentinel { height: 1px; margin-top: 7px; }
.pp-toolbar { position: sticky; top: var(--pp-toolbar-top); z-index: 3; display: flex; align-items: center; gap: 6px; box-sizing: border-box; height: var(--pp-toolbar-h); margin: -1px -14px 0; padding: 4px 14px; background: #0b1120; }
.pp-toolbar.is-stuck { box-shadow: 0 1px rgba(157,211,255,.14), 0 8px 18px rgba(0,0,0,.22); }
.pp-toolbar.is-stuck::before { content: ''; position: absolute; left: 0; right: 0; bottom: 100%; height: calc(env(safe-area-inset-top, 0px) + 18px); background: #0b1120; }
.pp-filters-btn { flex: none; min-height: 36px; padding: 0 10px; border: 1px solid rgba(196,168,255,.22); border-radius: 999px; background: rgba(150,110,255,.07); color: rgba(193,224,250,.7); font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; touch-action: manipulation; white-space: nowrap; }
.pp-filters-btn[aria-expanded="true"], .pp-filters-btn.has-active { border-color: #67e8ff; background: rgba(103,232,255,.14); color: #c9f6ff; }
.pp-filters-pill { display: grid; flex: 1 1 auto; align-content: center; justify-items: start; gap: 1px; min-width: 0; min-height: 44px; padding: 0 12px; border-color: rgba(157,211,255,.16); border-radius: 12px; background: rgba(157,211,255,.04); color: rgba(234,246,255,.85); font-size: 13px; font-weight: 650; text-align: left; }
.pp-filters-summary { display: block; max-width: 100%; min-width: 0; overflow: hidden; color: rgba(193,224,250,.55); font-size: 11px; font-weight: 500; text-overflow: ellipsis; }
.pp-filters-summary::after { content: ' ▾'; }
.pp-toolbar:not(.is-stuck) .pp-filters-pill ~ .pp-toolbar-close { display: none; }
.pp-badge { margin-left: 3px; color: #ffc76a; font-size: 11px; }
.pp-toolbar-close { display: grid; flex: none; place-items: center; width: 32px; height: 32px; margin-left: auto; padding: 0; border: 0; border-radius: 50%; background: rgba(157,211,255,.08); color: #e8f3ff; font: inherit; font-size: 20px; line-height: 1; opacity: 0; pointer-events: none; transition: opacity .15s ease-out; }
.pp-toolbar.is-stuck .pp-toolbar-close { opacity: 1; pointer-events: auto; }
.pp-filter-label { color: rgba(193,224,250,.5); font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.pp-status { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
.pp-status.pp-kind { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.pp-status button { min-height: 40px; padding: 0 2px; border: 1px solid rgba(196,168,255,.22); border-radius: 999px; background: rgba(150,110,255,.07); color: rgba(193,224,250,.7); font: inherit; font-size: 11px; font-weight: 750; cursor: pointer; touch-action: manipulation; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-status button[aria-pressed="true"] { border-color: #67e8ff; background: rgba(103,232,255,.14); color: #c9f6ff; }
.pp-filters { position: absolute; z-index: 4; top: 100%; left: 14px; right: 14px; display: grid; gap: 7px; padding: 12px 12px 14px; border: 1px solid rgba(157,211,255,.18); border-radius: 14px; background: #111a30; box-shadow: 0 14px 32px rgba(0,0,0,.48); opacity: 0; visibility: hidden; transform: translateY(-6px); pointer-events: none; transition: opacity .12s ease-out, transform .12s ease-out, visibility 0s linear .12s; }
.pp-filters.is-open { opacity: 1; visibility: visible; transform: translateY(0); pointer-events: auto; transition-duration: .16s; transition-delay: 0s; }
.pp-filters select { appearance: none; -webkit-appearance: none; min-height: 36px; width: 100%; padding: 0 24px 0 10px; border: 1px solid rgba(196,168,255,.35); border-radius: 999px; background: rgba(150,110,255,.12) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23d9ccff' stroke-width='1.6'/%3E%3C/svg%3E") no-repeat right 10px center; color: #ece4ff; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
.pp-filters select { min-height: 40px; padding: 0 30px 0 12px; border-radius: 10px; background-position: right 12px center; font-size: 12px; }
.pp-filters select option { background: #0b1430; color: #ece4ff; }
.pp-shown { margin: 3px 0 0; color: rgba(193,224,250,.45); font-size: 11px; text-align: center; }
.pp-empty { margin: 18px 0; color: rgba(193,224,250,.55); font-size: 12px; text-align: center; }
/* Dex grid: every slot renders once per open; filters toggle [hidden] instead
   of rebuilding, so only a sort change rebuilds the DOM (see renderPassportDex). */
.pp-dex-wrap { margin-top: 0; }
.pp-group { content-visibility: auto; contain-intrinsic-size: auto 900px; scroll-margin-top: var(--pp-toolbar-h); }
.pp-group-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0 8px; margin: 0; padding: 7px 4px; background: #0b1120; color: rgba(193,224,250,.6); font-size: 11px; font-weight: 800; letter-spacing: .04em; cursor: pointer; touch-action: manipulation; }
[data-pp="shelf-view"] .pp-group-head { min-height: 48px; box-sizing: border-box; }
.pp-group-head:focus-visible { outline: 2px solid #67e8ff; outline-offset: 2px; }
.pp-group-head-text { display: flex; flex: 1 1 auto; align-items: baseline; gap: 6px; min-width: 0; }
.pp-group-head-text::after { content: ''; flex: none; align-self: center; width: 6px; height: 6px; margin-left: 2px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); transition: transform .15s ease-out; }
.pp-group-head[aria-expanded="true"] .pp-group-head-text::after { transform: rotate(225deg); }
/* Slim single-line accordion row: name left, "n of N collected" + chevron
   right, hairline progress bar wraps full-width under the row (mockup C).
   Shared by every grouping (continent/country/difficulty). */
.pp-group-head.is-accordion { margin: 18px 0 0; padding: 0 0 8px; border: 0; border-radius: 0; background: transparent; color: rgba(193,224,250,.7); font-size: 12px; font-weight: 600; letter-spacing: normal; }
.pp-group-head.is-accordion .pp-group-head-text b { margin-right: auto; color: #eef2ff; font-size: 15px; font-weight: 800; }
.pp-group-sub { flex: none; color: rgba(193,224,250,.6); font-weight: 500; }
.pp-group-bar { flex: 0 0 100%; width: auto; height: 2px; margin-top: 8px; }
.pp-group-flag { flex: none; width: 20px; font-size: 15px; line-height: 1; text-align: center; }
/* Collapsed rows are short: skip content-visibility's 900px placeholder. */
.pp-group:has(> .is-accordion[aria-expanded="false"]) { content-visibility: visible; contain-intrinsic-size: none; }
.pp-chunk { content-visibility: auto; contain-intrinsic-size: auto 900px; }
.pp-dex { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 9px 5px; margin: 0; padding: 4px 3px; list-style: none; }
.pp-slot { position: relative; min-width: 0; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.pp-slot-photo { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; border: 2px solid rgba(214,220,232,.16); background: linear-gradient(135deg, #1b2c5a, #3b2a6e); }
.pp-slot-photo img { position: relative; z-index: 1; display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 20%; }
.pp-audit-flag { position: absolute; z-index: 4; left: 3px; top: 3px; display: grid; place-items: center; width: 27px; height: 27px; padding: 0; border: 1px solid rgba(255,255,255,.55); border-radius: 50%; background: rgba(8,14,32,.84); font-size: 14px; line-height: 1; cursor: pointer; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
.pp-audit-flag:active { transform: scale(.92); }
.pp-audit-flag-dot { position: absolute; right: -2px; bottom: -2px; display: grid; place-items: center; width: 13px; height: 13px; border: 1px solid rgba(8,14,32,.9); border-radius: 50%; background: transparent; font-size: 9px; line-height: 1; }
.pp-audit-flag[data-flag="image"] .pp-audit-flag-dot { background: #ef4444; }
.pp-audit-flag[data-flag="city"] .pp-audit-flag-dot { background: #facc15; }
.pp-slot-score { position: absolute; z-index: 2; top: 5px; right: 5px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 3px 6px; border: 1px solid transparent; border-radius: 999px; background: rgba(8,14,32,.82); color: #e6f0ff; font-size: 9px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; box-shadow: 0 1px 3px rgba(0,0,0,.5); }
.pp-slot-score[data-tier="bullseye"] { border: 1.5px solid #ffd166; background: rgba(8,14,32,.88); color: #ffd166; }
.pp-slot-score[data-tier="pinpoint"] { background: #e9b23c; color: #2b1d00; }
.pp-slot-name { margin: 4px 1px 0; overflow: hidden; color: #eef2ff; font-size: 8.5px; font-weight: 750; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.pp-slot[data-earn="seen"] .pp-slot-photo img { filter: grayscale(1) contrast(.92) brightness(.82); }
.pp-slot[data-earn="seen"] .pp-slot-name { color: #8992a8; }
/* Mystery cards keep the same neutral frame used by visited cards. */
.pp-slot.is-mystery { cursor: default; }
.pp-slot.is-mystery .pp-slot-photo { border-color: rgba(214,220,232,.16); }
.pp-slot.is-mystery .pp-slot-name { color: rgba(214,220,232,.4); letter-spacing: .1em; text-align: center; }
body.game-passport #hud { opacity: 0; }
@media (max-width: 560px) {
  .passport-screen { width: 100dvw; height: 100dvh; overflow-y: auto; padding: 0; background: #0b1120; }
  .passport-screen .pp-card { --pp-toolbar-top: env(safe-area-inset-top, 0px); width: 100dvw; max-width: none; min-height: 100dvh; margin: 0; padding: calc(env(safe-area-inset-top, 0px) + 14px) 14px calc(env(safe-area-inset-bottom, 0px) + 20px); border: 0; border-radius: 0; background: #0b1120; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
}
@media (max-width: 360px) {
  .pp-dex { gap: 9px 5px; }
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
  // The home links row is gone (Option A, 2026-10-18): the Passport summary
  // card is the Passport button, and Stats lives inside the Passport screen
  // (statsEntry is relocated into its header below). passportEntry and
  // collectionsEntry stay unappended; main.js still toggles their state.

  passportScreen = document.createElement('section');
  passportScreen.className = 'screen stats-screen passport-screen';
  passportScreen.hidden = true;
  passportScreen.innerHTML = `
  <div class="pp-card glass" role="dialog" aria-modal="true" aria-labelledby="pp-title">
    <button class="stats-close" aria-label="Close passport">×</button>
    <div class="pp-header-row">
      <h2 id="pp-title">Your passport</h2>
      <p class="pp-count"><b data-pp="found">0</b>/<span data-pp="total">0</span><span class="pp-count-sub" data-pp="postcards"></span></p>
      <div class="pp-header-actions">
        <button class="pp-share-icon" data-pp="collections" aria-label="View collections" hidden>🛡</button>
      </div>
    </div>
    <div class="pp-progress" data-pp="progress">
      <div class="pp-bar" role="progressbar" aria-label="Postcards earned" aria-valuemin="0"><i class="pp-bar-seen" data-pp="fill"></i><i class="pp-bar-earned" data-pp="earnfill"></i></div>
    </div>
    <div data-pp="shelf-view">
      <div class="pp-stick-sentinel" data-pp="shelf-sentinel"></div>
      <div class="pp-toolbar" data-pp="toolbar">
        ${ppFilterControls('pp-filters')}
      </div>
      <p class="pp-empty" data-pp="empty" hidden>No stamps match these filters yet.</p>
      <div class="pp-dex-wrap" data-pp="dex" data-pp-list data-pp-accordion></div>
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
    postcards: passportScreen.querySelector('[data-pp="postcards"]'),
    earnFill: passportScreen.querySelector('[data-pp="earnfill"]'),
    shelfView: passportScreen.querySelector('[data-pp="shelf-view"]'),
    collections: passportScreen.querySelector('[data-pp="collections"]'),
  };
  ppShelf = ppDex(ppEls.shelfView, { tab: 'shelf', noun: 'locations', sentinel: 'shelf-sentinel', dex: 'dex', statusKey: PP_STATUS_KEY });

  ppStickyObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const toolbar = entry.target.nextElementSibling;
      toolbar?.classList.toggle('is-stuck', !entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0));
    });
  }, { root: passportScreen, threshold: 0 });
  passportScreen.querySelectorAll('.pp-stick-sentinel').forEach((sentinel) => ppStickyObserver.observe(sentinel));
  if (host.AUDIT_MODE) host.mountAuditBanner(ppEls.progress);

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
    savedStatuses.filter((status) => PP_STATUSES.has(status)).forEach((status) => ppShelf.statuses.add(status));
  } catch (error) { host.storageError('Read failed', PP_STATUS_KEY, error); }
  syncPpStatusButtons(ppShelf);
  syncPpKindButtons(ppShelf);
  try {
    const raw = localStorage.getItem(PP_COLLAPSED_KEY);
    const saved = raw && JSON.parse(raw);
    // On open, EVERY group starts collapsed (Sean, 2026-10-22): ignore saved
    // collapse state so first paint is the slim row list. The per-session
    // accordion cache (ppShelf.accordion) remembers user toggles during this
    // open; we still write to localStorage on toggle for consistency but do not
    // read it back on init.
  } catch (error) { host.storageError('Read failed', PP_COLLAPSED_KEY, error); }

  passportEntry.addEventListener('click', openPassport);
  // Stats now opens from the Settings screen (src/main.js), not the Passport,
  // but its screen still has to paint above whichever screen opened it:
  // re-append it at the end of the body, the same stacking trick the other
  // overlays use.
  const statsScreenEl = document.querySelector('.stats-screen:not(.passport-screen)');
  if (statsScreenEl) document.body.appendChild(statsScreenEl);
  ppEls.close.addEventListener('click', () => closePassport());
  {
    const dex = ppShelf;
    dex.els.kind.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        dex.kind = btn.dataset.kind;
        syncPpKindButtons(dex);
        applyPassportFilters(dex);
        ppScrollToDexTop(dex);
      });
    });
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
    dex.els.sort.addEventListener('change', () => {
      dex.sorts.set(dex.grouping, dex.els.sort.value);
      const wasStuck = dex.els.filtersToggle.closest('.pp-toolbar').classList.contains('is-stuck');
      renderPassportDex(dex);
      ppScrollToDexTop(dex, wasStuck);
    });
    dex.els.grouping.addEventListener('change', () => {
      const wasStuck = dex.els.filtersToggle.closest('.pp-toolbar').classList.contains('is-stuck');
      dex.grouping = dex.els.grouping.value;
      dex.els.sort.value = dex.sorts.get(dex.grouping) || (dex.grouping === 'none' ? 'recent' : 'atlas');
      dex.els.sortLabel.textContent = dex.grouping === 'none' ? 'Sort' : 'Sort within groups';
      dex.els.sort.setAttribute('aria-label', dex.grouping === 'none' ? 'Sort' : 'Sort within groups');
      renderPassportDex(dex);
      ppScrollToDexTop(dex, wasStuck);
    });
    dex.els.filtersToggle.addEventListener('click', () => {
      const expanded = dex.els.filtersToggle.getAttribute('aria-expanded') === 'true';
      if (expanded) closePassportFilters(); else openPassportFilters(dex);
    });
  }
  passportScreen.querySelectorAll('.pp-toolbar-close').forEach((button) => button.addEventListener('click', () => closePassport()));
  document.addEventListener('pointerdown', (event) => {
    const dex = ppOpenFiltersDex();
    if (!dex) return;
    if (!dex.els.filters.contains(event.target) && !dex.els.filtersToggle.closest('.pp-toolbar').contains(event.target)) closePassportFilters();
  });
  passportScreen.addEventListener('click', (e) => {
    if (e.target === passportScreen) closePassport();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || passportScreen.hidden) return;
    if (ppOpenFiltersDex()) { closePassportFilters(); return; }
    closePassport();
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
.collection-card { position: relative; min-width: 0; padding: 5px 5px 7px; border: 2px solid rgba(214,220,232,.16); border-radius: 9px; background: #1a1f2e; }
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
.ppd-card { --ppd-accent: var(--mail-gold); position: relative; touch-action: pan-y; box-sizing: border-box; width: 100%; max-width: 380px; margin: auto; padding: 7px; border-radius: 10px; background: var(--mail-stripe-border); box-shadow: 0 24px 70px rgba(0,0,0,.72); color: #43331a; transform-origin: 0 0; }
.ppd-inner { min-height: 100%; padding: 9px 9px 12px; border-radius: 5px; background: var(--mail-paper); }
.ppd-card[data-earn="seen"] .pp-photo img { filter: grayscale(1) contrast(.92) brightness(.82); }
.ppd-front { position: relative; }
.ppd-front .pp-photo { aspect-ratio: 4 / 3; overflow: hidden; border: 4px solid #fffdf6; border-radius: 0; background: #d9cdb2; box-shadow: 0 0 0 1px rgba(101,78,38,.25), 0 2px 6px rgba(101,78,38,.3); }
.ppd-front .pp-photo::after { font-size: 44px; }
.ppd-close { position: absolute; z-index: 4; top: -12px; right: -2px; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; background: none; cursor: pointer; touch-action: manipulation; }
.ppd-close::before, .ppd-nav::before { content: '×'; display: grid; place-items: center; width: 32px; height: 32px; margin: auto; border-radius: 50%; background: rgba(44,74,124,.85); color: #fffdf6; font-size: 22px; line-height: 1; }
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
.ppd-distance-badge { position: absolute; z-index: 2; top: 8px; right: 8px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 54px; height: 54px; padding: 3px; border: 1.8px solid rgba(52,72,96,.85); border-radius: 50%; background: rgba(245,242,235,.92); outline: 1.4px solid rgba(52,72,96,.85); outline-offset: 2.5px; color: rgba(40,58,80,.95); font-size: 12px; font-weight: 850; line-height: 1.15; text-align: center; transform: rotate(-11deg); }
.ppd-distance-badge::after { content: ''; position: absolute; inset: 4px; border: 1px dashed rgba(52,72,96,.6); border-radius: 50%; pointer-events: none; }
.ppd-distance-badge[data-tier="bullseye"], .ppd-distance-badge[data-tier="pinpoint"] { border-color: #b27c20; outline-color: #b27c20; color: #b27c20; }
.ppd-distance-badge[data-tier="bullseye"]::after, .ppd-distance-badge[data-tier="pinpoint"]::after { border-color: rgba(178,124,32,.55); }
.ppd-distance-badge[hidden] { display: none; }
.ppd-body { padding: 0 5px; color: #43331a; }
.ppd-from, .ppd-pos { margin: 0; color: #7a5f36; font-size: 10px; font-weight: 800; letter-spacing: .17em; text-transform: uppercase; }
.ppd-pos { position: absolute; top: 100%; left: 0; right: 0; padding-top: 7px; font-variant-numeric: tabular-nums; text-align: center; }
.ppd-pos[hidden] { display: none; }
.ppd-body h3 { margin: 11px 0 0; color: #22355c; font-family: Inter, sans-serif; font-size: 18px; font-weight: 800; line-height: 1.1; letter-spacing: -.02em; overflow-wrap: anywhere; }
.ppd-clue { margin: 3px 0 0; color: rgba(52,72,96,.75); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: none; }
.ppd-history { display: grid; gap: 5px; margin: 11px 0 0; padding-top: 8px; border-top: 1.5px solid rgba(101,78,38,.35); color: rgba(101,78,38,.85); font-size: 10px; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
.ppd-history-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
.ppd-history-row strong { min-width: 0; color: #43331a; font-weight: 750; text-align: right; white-space: nowrap; }
.ppd-history[hidden] { display: none; }
.ppd-fact { margin: 10px 0 0; padding: 0; border: 0; color: #4c3d20; font-family: Georgia, "Times New Roman", serif; font-size: 13.5px; font-style: italic; line-height: 1.55; }
.ppd-fact::before { display: none; }
.ppd-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin: 9px 0 0; }
.ppd-stats div { min-width: 0; padding: 0; border: 0; border-radius: 0; background: none; }
.ppd-stats dt { color: rgba(101,78,38,.65); font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.ppd-stats dd { margin: 1px 0 0; color: #22355c; font-size: 14.5px; font-weight: 850; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ppd-stats dd small { color: rgba(52,72,96,.6); font-size: 9.5px; font-weight: 650; }
.ppd-hint { margin: 10px 0 0; color: rgba(101,78,38,.72); font-size: 12px; font-weight: 700; text-align: center; }
.ppd-share { display: block; width: 100%; min-height: 45px; margin: 13px 0 0; padding: 0 16px; border: 1px solid #2c4a7c; border-radius: 4px; background: #fffdf6; color: #22355c; font-size: 11px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; cursor: pointer; touch-action: manipulation; }
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
    <div class="ppd-inner">
      <div class="ppd-front">
        <div class="pp-photo" data-ppd="photo"></div>
        <span class="ppd-distance-badge" data-ppd="distanceBadge"></span>
        <button class="ppd-nav" data-dir="-1" aria-label="Previous postcard" tabindex="-1" data-ppd="prev"></button>
        <button class="ppd-nav" data-dir="1" aria-label="Next postcard" tabindex="-1" data-ppd="next"></button>
      </div>
      <div class="ppd-body">
        <h3 id="ppd-title" data-ppd="name"></h3>
        <p class="ppd-clue" data-ppd="clue"></p>
        <p class="ppd-fact" data-ppd="fact"></p>
        <div class="ppd-history" data-ppd="history" aria-label="Visit history"></div>
        <dl class="ppd-stats" data-ppd="stats"></dl>
        <p class="ppd-hint" data-ppd="hint"></p>
        <button class="ppd-share" data-ppd="share"></button>
      </div>
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
