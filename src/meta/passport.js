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
import { buildPostcardCard, postcardDisplayName } from './postcard-card.js';
import { passportEntryCompare, passportGroups } from './passport-grouping.mjs';
import { passportPackSections, packCardNumberMap, formatPackCardNumber } from './passport-packs.js';

let host = null;
const PASSPORT_STAMPS = 5; // recent photo stamps
function passportSummary() {
  let found = 0;
  let earned = 0;
  for (const id of Object.keys(host.passport.visits)) {
    const item = host.findLocation(id);
    if (!item) continue; // collectible retired from its bank
    found += 1;
    if (host.passport.meta[id]?.e) earned += 1;
  }
  const recent = host.passport.order
    .slice(-40)
    .reverse()
    .map((id) => ({ item: host.findLocation(id), base: host.passport.visits[id] }))
    .filter((spot) => spot.item);
  return {
    found,
    earned,
    total: host.locations.length + (host.landmarks?.length || 0),
    recent: recent.slice(0, PASSPORT_STAMPS).filter((spot) => spot.item.image),
  };
}

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
const FLAG_RE = /[\u{1F1E6}-\u{1F1FF}]{2}/u;

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
    tierAt: [meta.eb1, meta.eb2, meta.eb3],
    // Timestamped visits are always newer than legacy ones, which fall back to
    // their place in the recency order (and to the very end if that was capped).
    recency: meta.t ?? (age?.has(item.id) ? age.get(item.id) : -1),
    continent: host.continentOf(item),
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


export let passportEntry;
export let collectionsEntry;

let passportScreen;

let ppEls;
// The passport is one unified shelf (cities and places together, no tabs):
// one dex with its own controls, slots and filter state (see ppDex()). The
// kind split (cities vs places) that used to be two tabs is now a Kind filter
// inside Browse, same shape as the Status filter.
let ppShelf;
const ppPackOpen = new Map();
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
function passportSlot(entry, cardNumber = null) {
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
  if (cardNumber != null) {
    // Pack dex only: the card's number, small on the paper at the slot's
    // bottom-right corner. The postmark score pill owns the photo's
    // top-right, so the number stays off the photo entirely.
    li.classList.add('has-card-number');
    const number = document.createElement('span');
    number.className = 'pp-slot-number';
    number.setAttribute('aria-hidden', 'true');
    number.textContent = formatPackCardNumber(cardNumber);
    li.append(number);
  }
  bindPostcard(li, entry);
  return li;
}

// An unvisited pack card is an empty slot carrying only its number
// (Sean, 2026-10-29, modeled on the TCG Pocket dex): the place's name and
// country appear nowhere in this slot's DOM or aria-label, because the dex
// must not hand out answers for places the player has not earned yet.
// Tapping reveals only the pack and the not-yet-collected state.
export function passportUnvisitedSlot(entry, packName, cardNumber) {
  const formatted = cardNumber == null ? '' : formatPackCardNumber(cardNumber);
  const li = document.createElement('li');
  li.className = 'pp-slot pp-unvisited';
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.setAttribute('aria-expanded', 'false');
  li.setAttribute('aria-label', `${packName} card ${formatted}, not yet collected`);
  const photo = document.createElement('div');
  photo.className = 'pp-slot-photo';
  const number = document.createElement('span');
  number.className = 'pp-unvisited-number';
  number.setAttribute('aria-hidden', 'true');
  number.textContent = formatted;
  photo.append(number);
  const note = document.createElement('p');
  note.className = 'pp-unvisited-note';
  note.textContent = `${packName} pack · Not yet collected`;
  li.append(photo, note);
  const toggle = () => {
    const revealed = li.classList.toggle('is-revealed');
    li.setAttribute('aria-expanded', String(revealed));
  };
  li.addEventListener('click', toggle);
  li.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle();
  });
  return li;
}

function ppTagSlot(li, entry) {
  li.dataset.status = entry.visited ? (entry.earned ? 'earned' : 'seen') : 'unvisited';
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
    sorts: new Map([['continent', 'atlas'], ['country', 'atlas'], ['none', 'recent']]),
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

// Builds the pack dex from the same pool helpers as the pack screen. Pack
// members render once in their pack; visited non-members go in the final,
// collected-only section.
function renderPassportPage() {
  if (!countryIndex) buildCountryIndex();
  const age = new Map(host.passport.order.map((id, i) => [id, i]));
  const data = passportPackSections(host.locations, host.landmarks || [], host.passport.visits, host.passport.meta);
  const cardNumbers = packCardNumberMap(host.locations, host.landmarks || []);
  ppEls.packProgress.textContent = `${data.collected.toLocaleString()} / ${data.total.toLocaleString()} pack postcards collected`;
  const frag = document.createDocumentFragment();
  const addSection = ({ type, name, art, items, collected, total }, packSection = true) => {
    const section = document.createElement('section');
    section.className = 'pp-pack-section';
    section.dataset.pack = type;
    const head = document.createElement('button');
    head.className = 'pp-pack-head';
    head.type = 'button';
    const progress = packSection ? `${collected.toLocaleString()} / ${total.toLocaleString()}` : `${collected.toLocaleString()} collected`;
    head.innerHTML = `${art ? `<img src="${art}" alt="">` : '<span class="pp-pack-mail" aria-hidden="true">✉</span>'}<span class="pp-pack-title"></span><span class="pp-pack-count"></span><span class="pp-pack-chevron" aria-hidden="true"></span>`;
    head.querySelector('.pp-pack-title').textContent = name;
    head.querySelector('.pp-pack-count').textContent = progress;
    const grid = document.createElement('ul');
    grid.className = 'pp-dex pp-pack-grid';
    grid.append(...items.map((item) => {
      const entry = buildPassportEntry(item, age);
      const cardNumber = packSection ? cardNumbers.get(item.id)?.number ?? null : null;
      return entry.visited ? passportSlot(entry, cardNumber) : passportUnvisitedSlot(entry, name, cardNumber);
    }));
    const apply = (open) => {
      head.setAttribute('aria-expanded', String(open));
      grid.hidden = !open;
    };
    head.addEventListener('click', () => {
      const open = head.getAttribute('aria-expanded') !== 'true';
      ppPackOpen.set(type, open);
      apply(open);
    });
    apply(ppPackOpen.get(type) === true);
    section.append(head, grid);
    frag.append(section);
  };
  data.sections.forEach((section) => addSection(section));
  addSection({
    type: 'everything-else', name: 'Daily & Expeditions', art: null,
    items: data.everythingElse, collected: data.everythingElse.length,
  }, false);
  ppShelf.els.dex.replaceChildren(frag);
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

let passportReturn = null;

export function openPassport(returnTo = passportReturn) {
  passportReturn = typeof returnTo === 'function' ? returnTo : null;
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
  const returnTo = passportReturn;
  passportReturn = null;
  if (returnTo) {
    returnTo();
    syncPassport();
    return;
  }
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

function postmarkLines(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  return [date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(), String(date.getDate()), String(date.getFullYear())];
}

function setPostcardFlipped(flipped) {
  ppdEls.flip.classList.toggle('is-flipped', flipped);
  ppdEls.flip.setAttribute('aria-pressed', String(flipped));
  ppdEls.flip.setAttribute('aria-label', flipped ? 'Postcard back. Show the front' : 'Postcard front. Show the back');
  ppdEls.front.setAttribute('aria-hidden', String(flipped));
  ppdEls.back.setAttribute('aria-hidden', String(!flipped));
}

function fillPostcard(entry) {
  const { item } = entry;
  const earn = host.EARN_NAMES[entry.earned] || 'seen';
  ppdEls.card.dataset.earn = earn;
  host.applyCardTier(ppdEls.card, item, entry.earned);
  setPostcardFlipped(false);
  const photoImg = (alt) => {
    const img = document.createElement('img');
    img.src = item.image;
    img.alt = alt;
    img.decoding = 'async';
    img.addEventListener('error', () => img.remove(), { once: true });
    return img;
  };
  ppdEls.photo.replaceChildren();
  ppdEls.stamp.replaceChildren();
  if (item.image) {
    ppdEls.photo.append(photoImg(item.short || item.clue || ''));
    ppdEls.stamp.append(photoImg(''));
  }
  const flag = host.flagForLocation(item);
  ppdEls.name.textContent = item.short || '';
  ppdEls.country.textContent = entry.country || '';
  ppdEls.country.hidden = !entry.country;
  ppdEls.fact.textContent = item.fact || '';
  ppdEls.fact.hidden = !item.fact;
  ppdEls.addrName.textContent = item.short || '';
  ppdEls.addrCountry.textContent = `${entry.country || ''}${flag ? ` ${flag}` : ''}`.trim();
  ppdEls.addrCountry.hidden = !ppdEls.addrCountry.textContent;

  // Postmark: the stored first-earn timestamp (meta.ea), in the badge language.
  const stamped = entry.earned ? postmarkLines(entry.earnedAt) : null;
  ppdEls.postmark.hidden = !stamped;
  ppdEls.postmark.dataset.tier = entry.earned >= host.EARN_BULLSEYE ? 'gold' : 'ink';
  ppdEls.postmark.replaceChildren();
  stamped?.forEach((line, i) => {
    if (i) ppdEls.postmark.append(document.createElement('br'));
    ppdEls.postmark.append(document.createTextNode(line));
  });

  // Earn history: only the dates the store keeps (meta.f, meta.eb1 to eb3).
  ppdEls.history.replaceChildren();
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
  addHistoryRow('First visited', entry.first);
  entry.tierAt.forEach((at, i) => {
    if (Number.isFinite(at)) addHistoryRow(`${tierTitle(host.EARN_NAMES[i + 1])} earned`, tierDateKey(at));
  });
  ppdEls.history.hidden = !ppdEls.history.childElementCount;

  // Stat strip: best km and earned tier. The store keeps no source mode, so none is shown.
  ppdEls.stats.replaceChildren();
  if (entry.earned) {
    const parts = [];
    if (Number.isFinite(entry.km)) parts.push(['ppd-stat-num', formatShareKm(entry.km)]);
    parts.push(['', tierTitle(earn)]);
    parts.forEach(([className, text], i) => {
      if (i) ppdEls.stats.append(Object.assign(document.createElement('span'), { textContent: '·' }));
      ppdEls.stats.append(Object.assign(document.createElement('b'), { className, textContent: text }));
    });
  } else {
    ppdEls.stats.append(Object.assign(document.createElement('span'), { className: 'ppd-uncollected', textContent: 'Not yet collected' }));
  }
  ppdEls.hint.hidden = earn !== 'seen';
  ppdEls.hint.textContent = 'Land within 150 km to earn this postcard in colour.';
  // Only a postcard with a known closest guess has a distance to brag about.
  ppdEntry = entry;
  clearTimeout(ppdCopiedTimer);
  ppdEls.share.hidden = !Number.isFinite(entry.km);
  ppdEls.share.textContent = SHARE_LABEL;
}

function tierTitle(name) {
  return name ? name[0].toUpperCase() + name.slice(1) : '';
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
  passportBox.addEventListener('click', () => openPassport(null));
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
    <button class="icon-close" aria-label="Close passport">×</button>
    <div class="pp-header-row">
      <h2 id="pp-title">Your passport</h2>
      <div class="pp-header-actions">
        <button class="pp-share-icon" data-pp="collections" aria-label="View collections" hidden>🛡</button>
      </div>
    </div>
    <p class="pp-pack-progress" data-pp="pack-progress"></p>
    <div class="pp-progress" data-pp="progress"></div>
    <div data-pp="shelf-view">
      <div class="pp-stick-sentinel" data-pp="shelf-sentinel" hidden></div>
      <div class="pp-toolbar" data-pp="toolbar" hidden>
        ${ppFilterControls('pp-filters')}
      </div>
      <p class="pp-empty" data-pp="empty" hidden>No stamps match these filters yet.</p>
      <div class="pp-dex-wrap" data-pp="dex" data-pp-list data-pp-accordion></div>
    </div>
  </div>`;
  document.getElementById('game').appendChild(passportScreen);
  host.passportScreenEl = passportScreen;

  ppEls = {
    close: passportScreen.querySelector('.icon-close'),
    progress: passportScreen.querySelector('[data-pp="progress"]'),
    packProgress: passportScreen.querySelector('[data-pp="pack-progress"]'),
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

  passportEntry.addEventListener('click', () => openPassport(null));
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


  postcardScreen = document.createElement('section');
  postcardScreen.className = 'screen ppd';
  postcardScreen.hidden = true;
  postcardScreen.innerHTML = `
  <div class="ppd-scrim" data-ppd="scrim"></div>
  <article class="ppd-card" role="dialog" aria-modal="true" aria-labelledby="ppd-title" data-ppd="card">
    <button class="icon-close icon-close--badge" aria-label="Close postcard" data-ppd="close"></button>
    <div class="ppd-stage">
      <div class="ppd-flip" role="button" tabindex="0" aria-pressed="false" data-ppd="flip">
        <div class="ppd-flip-inner">
          <div class="ppd-face ppd-face-front" data-ppd="front">
            <div class="pp-photo" data-ppd="photo"></div>
            <span class="ppd-flip-hint" aria-hidden="true">Tap to flip</span>
            <div class="ppd-caption">
              <h3 id="ppd-title" data-ppd="name"></h3>
              <p data-ppd="country"></p>
            </div>
          </div>
          <div class="ppd-face ppd-face-back" data-ppd="back">
            <p class="ppd-fact" data-ppd="fact"></p>
            <div class="ppd-divider"></div>
            <div class="ppd-right">
              <div class="ppd-stamp-row">
                <div class="ppd-stamp" data-ppd="stamp"></div>
                <span class="ppd-postmark" data-ppd="postmark"></span>
              </div>
              <div class="ppd-addr">
                <p class="ppd-addr-name" data-ppd="addrName"></p>
                <p class="ppd-addr-country" data-ppd="addrCountry"></p>
                <div class="ppd-addr-rule"></div>
                <div class="ppd-addr-rule"></div>
              </div>
              <div class="ppd-history" data-ppd="history" aria-label="Visit history"></div>
            </div>
            <div class="ppd-stats" data-ppd="stats"></div>
          </div>
        </div>
      </div>
      <button class="ppd-nav" data-dir="-1" aria-label="Previous postcard" tabindex="-1" data-ppd="prev"></button>
      <button class="ppd-nav" data-dir="1" aria-label="Next postcard" tabindex="-1" data-ppd="next"></button>
    </div>
    <p class="ppd-hint" data-ppd="hint"></p>
    <button class="ppd-share" data-ppd="share"></button>
    <p class="ppd-pos" aria-live="polite" data-ppd="pos"></p>
  </article>`;
  document.getElementById('game').appendChild(postcardScreen);

  ppdEls = Object.fromEntries([...postcardScreen.querySelectorAll('[data-ppd]')].map((el) => [el.dataset.ppd, el]));

  ppdEls.close.addEventListener('click', closePostcard);
  ppdEls.flip.addEventListener('click', () => setPostcardFlipped(!ppdEls.flip.classList.contains('is-flipped')));
  ppdEls.flip.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    setPostcardFlipped(!ppdEls.flip.classList.contains('is-flipped'));
  });
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
      // Close, the postcard and (when shown) share are the only controls; keep focus between them.
      e.preventDefault();
      const stops = [ppdEls.close, ppdEls.flip, ppdEls.share].filter((el) => !el.hidden);
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
