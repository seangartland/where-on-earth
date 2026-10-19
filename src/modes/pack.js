// ---------------------------------------------------------------------------
// The Daily postcard pack (docs/daily-pack-spec.md): three cards a day from
// cities plus the Landmarks pool, played on the shared round screen with the
// PvP clue-only header, no timer and the normal earning rules (recordVisit).
// The pack screen serves before, during and after the pack; each flipped
// card opens the existing postcard detail. The saved record is
// src/meta/pack-store.js. main.js reaches this module only through
// initPack(host); round.js through its own host.
// ---------------------------------------------------------------------------
import { EARN_NAMES, EARN_BULLSEYE, EARN_PINPOINT } from '../core/config.js';
import { audio } from '../core/audio.js';
import { state } from '../core/state.js';
import { formatKm, localDateKey } from '../core/format.js';
import { buildPostcardCard } from '../meta/postcard-card.js';
import {
  PACK_CARDS, packPool, readPack, ensurePack, savePackResult, packOutcome, packSummary,
} from '../meta/pack-store.js';
import { landmarkPool } from './landmarks.js';

let host = null;
// The card in play. record is the saved record the card belongs to, so a
// round still on screen at midnight banks under its own date.
export const pack = { active: false, packIndex: 0, card: 0, item: null, record: null };

let entry;
let els;
let rowDate = '';
// The opening ritual (2026-10-18): a fresh pack starts sealed for this
// session, each unplayed card flips to its clue before its round, and a
// just-played card stamps into its slot on return. Session state only; the
// saved pack record is untouched by all of it.
let tornDate = null;
let flipping = false;
let holdIndex = -1;
let holdTimer = 0;
let landingCard = -1;
let landingKind = null;
let landingTier = 0;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function currentPack() {
  return pack.record?.packs[pack.packIndex];
}

// The home row (P1): quiet, and dimmed once today's pack is opened.
export function syncPackButton() {
  rowDate = localDateKey();
  // Called from both load chains: whichever of locations/landmarks lands
  // second re-syncs, so tolerate the other bank still being in flight.
  entry.disabled = !((host.locations || []).length && (host.landmarks || []).length);
  const { played } = packSummary(readPack(rowDate).packs[0]);
  const done = played >= PACK_CARDS;
  entry.querySelector('.mode-desc').textContent = done ? '✓ Opened · new pack at midnight'
    : played ? `${played} of ${PACK_CARDS} opened` : `${PACK_CARDS} cards today`;
  entry.classList.toggle('played', done);
}

// First tap on a new date generates today's pack and saves it before any clue.
function openPack() {
  const record = readPack();
  if (!ensurePack(record, 0, packPool(host.locations, landmarkPool()))) return;
  pack.record = record;
  pack.packIndex = 0;
  showPackScreen();
}

// The flip reveals the clue card, holds it long enough to read the location,
// then the round starts on its own. A tap on the flipped card during the hold
// starts it right away.
const CLUE_HOLD_MS = 1400;
function flipCard(li, index) {
  if (holdIndex === index) {
    window.clearTimeout(holdTimer);
    holdIndex = -1;
    startCard(index);
    return;
  }
  if (flipping || holdIndex >= 0) return;
  flipping = true;
  audio.tick();
  if (navigator.vibrate) navigator.vibrate(8);
  li.classList.add('flipped');
  window.setTimeout(() => {
    flipping = false;
    holdIndex = index;
    holdTimer = window.setTimeout(() => { holdIndex = -1; startCard(index); }, reducedMotion() ? 0 : CLUE_HOLD_MS);
  }, reducedMotion() ? 0 : 330);
}

function updatePrimary() {
  const stale = pack.record && pack.record.date !== localDateKey();
  const done = packSummary(currentPack()).played >= PACK_CARDS;
  els.primary.hidden = !stale && !done;
  els.primary.textContent = stale ? 'Open today’s pack' : 'Done';
}

function packSlot(id, result, index) {
  const item = host.findLocation(id);
  let li;
  if (!result) {
    // Face down until tapped: the flip reveals the clue face only (name,
    // clue, flag; never the photo), then the round starts. Any order works;
    // the draw is fixed and results save per slot.
    li = document.createElement('li');
    li.className = 'pp-slot pack-slot pack-flip-slot';
    const name = item ? (item.short || item.clue || '') : '';
    const flag = item ? host.flagForLocation(item) : '';
    // The clue string repeats the name and ends with the flag, both of which
    // the card already shows on their own lines; the sub-line keeps only what
    // is new (the country or state part).
    let sub = item ? (item.clue || '') : '';
    for (const candidate of [item?.name, item?.short]) {
      if (candidate && sub.startsWith(candidate)) { sub = sub.slice(candidate.length); break; }
    }
    sub = sub.replace(/^[,\s]+/, '').replace(/\s{2,}/g, ' ').trim();
    if (flag) sub = sub.replaceAll(flag, '').replace(/[\s,]+$/, '').trim();
    if (sub === name) sub = '';
    li.innerHTML = `
      <div class="pack-flip">
        <div class="pack-flip-face pack-flip-back"><span class="pack-flip-mark">?</span></div>
        <div class="pack-flip-face pack-flip-front">
          <p class="pack-clue-flag">${flag}</p>
          <p class="pack-clue-name">${name}</p>
          ${sub ? `<p class="pack-clue-text">${sub}</p>` : ''}
        </div>
      </div>`;
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `Card ${index + 1}: tap to reveal the clue`);
    li.addEventListener('click', () => flipCard(li, index));
    li.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); flipCard(li, index); }
    });
  } else if (!item) {
    // Retired from the data after it was played: the name only.
    li = document.createElement('li');
    li.className = 'pp-slot is-mystery';
    li.append(
      Object.assign(document.createElement('div'), { className: 'pp-slot-photo mystery-photo' }),
      Object.assign(document.createElement('p'), { className: 'pp-slot-name', textContent: result.name || '' }),
    );
  } else {
    const passportEntry = host.passportEntryFor(item);
    const tier = passportEntry.earned >= EARN_PINPOINT ? 'pinpoint' : passportEntry.earned >= EARN_BULLSEYE ? 'bullseye' : 'ordinary';
    li = buildPostcardCard(item, {
      earned: passportEntry.earned,
      earnName: EARN_NAMES[passportEntry.earned] || 'seen',
      entry: passportEntry,
      photo: item.image ? 'image' : 'flag',
      scoreText: formatKm(result.distance),
      scoreTier: tier,
    }, { variant: 'slot', flagForLocation: host.flagForLocation, applyCardTier: host.applyCardTier });
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-haspopup', 'dialog');
    li.setAttribute('aria-label', `Open postcard: ${li.querySelector('.pp-slot-name').textContent}, ${formatKm(result.distance)}`);
    host.bindPostcard(li, passportEntry);
    // The pack is about collecting, not points: no scores on this screen,
    // just a note under the cards that changed the collection.
    if (result.postcard?.kind === 'new' || result.postcard?.kind === 'upgrade') {
      li.append(Object.assign(document.createElement('p'), {
        className: `pack-slot-note is-${result.postcard.kind === 'new' ? 'new' : 'upgrade'}`,
        textContent: result.postcard.kind === 'new' ? 'New postcard' : 'Upgraded',
      }));
    }
  }
  li.classList.add('pack-slot');
  return li;
}

function doneLine({ counts }) {
  const parts = [
    counts.new && plural(counts.new, 'new postcard'),
    counts.upgrade && `${counts.upgrade} upgraded`,
    counts.visited && `${counts.visited} visited`,
    counts.repeat && `${counts.repeat} already in your Passport`,
  ].filter(Boolean);
  return parts.join(' · ');
}

// One screen for every moment: sealed, fresh, mid-pack and done (spec 2g). A
// record from an earlier date (a round finished after midnight) shows as it
// ended, with today's pack one tap away.
function renderPackScreen(deal = false) {
  const current = currentPack();
  const summary = packSummary(current);
  const stale = pack.record.date !== localDateKey();
  const done = summary.played >= PACK_CARDS;
  const sealedNow = !stale && !done && summary.played === 0 && tornDate !== pack.record.date;
  els.sealed.hidden = !sealedNow;
  els.slots.hidden = sealedNow;
  if (!sealedNow) {
    els.slots.replaceChildren(...current.ids.map((id, i) => packSlot(id, current.results[i], i)));
    // Deal-in and stamp-in run through element.animate with a timer that
    // cancels them back to the natural (visible) state: a CSS animation left
    // holding its first frame could strand a card invisible if the browser
    // stalls its clock, a timer cannot.
    if (deal && !reducedMotion()) {
      [...els.slots.children].forEach((li, i) => {
        const anim = li.animate(
          [{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
          { duration: 450, delay: i * 90, easing: 'ease-out', fill: 'backwards' },
        );
        window.setTimeout(() => anim.cancel(), 450 + i * 90 + 150);
      });
    }
    if (landingCard >= 0) {
      const li = els.slots.children[landingCard];
      if (li && !reducedMotion()) {
        const anim = li.animate(
          [{ transform: 'scale(1.16) rotate(-4deg)', opacity: 0 }, { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }],
          { duration: 500, easing: 'cubic-bezier(.2, 1.4, .4, 1)' },
        );
        window.setTimeout(() => anim.cancel(), 650);
      }
      if (landingKind === 'new' || landingKind === 'upgrade') {
        audio.thump();
        if (landingTier >= EARN_BULLSEYE) audio.chime();
        if (navigator.vibrate) navigator.vibrate(12);
      } else {
        audio.tick();
      }
      landingCard = -1;
      landingKind = null;
      landingTier = 0;
    }
  }
  els.line.textContent = sealedNow ? 'Three postcards. Pin each one.'
    : done ? doneLine(summary)
    : summary.played ? `${summary.played} of ${PACK_CARDS} opened · Tap a card to flip its clue` : 'Tap a card to flip its clue.';
  els.ready.hidden = !stale;
  els.screen.classList.toggle('sealed-on', sealedNow);
  if (sealedNow) els.primary.hidden = true;
  else updatePrimary();
}

export function showPackScreen() {
  pack.active = false;
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'pack';
  window.__canGuess = false;
  renderPackScreen();
  els.screen.hidden = false;
  document.body.classList.add('game-results');
}

function startCard(index) {
  const current = currentPack();
  holdIndex = -1;
  window.clearTimeout(holdTimer);
  host.expeditionRun.active = false;
  host.endless.active = false;
  host.borders.active = false;
  host.survival.active = false;
  pack.card = index;
  pack.item = host.findLocation(current.ids[index]);
  pack.active = true;
  host.showRound();
}

function primaryAction() {
  if (pack.record.date !== localDateKey()) {
    openPack();
    return;
  }
  const { played, nextCard } = packSummary(currentPack());
  if (played >= PACK_CARDS) host.goHome();
  else startCard(nextCard);
}

// The round screen's pack variant (round.js showRound, revealGuess, nextRound).
export function packRoundHeader() {
  const { gameEls } = host;
  document.body.classList.add('pack');
  gameEls.number.textContent = `${pack.packIndex ? 'Bonus card' : 'Card'} ${pack.card + 1} of ${PACK_CARDS}`;
  gameEls.weight.style.display = 'none';
  gameEls.dailyDate.hidden = true;
}

// Saved on reveal, so leaving mid-pack loses nothing. Returns the outcome
// the reveal shows.
export function packRecordGuess(guess, km, kmExact, base, wasVisited, previousEarn, newlyEarned) {
  const postcard = packOutcome(wasVisited, previousEarn, newlyEarned);
  savePackResult(pack.record, pack.packIndex, pack.card, {
    guess, distance: km, distanceExact: kmExact, base, postcard, name: pack.item.short || pack.item.clue || '',
  });
  landingCard = pack.card;
  landingKind = postcard.kind;
  landingTier = postcard.tier || 0;
  return postcard;
}

export function packIsLastCard() {
  return pack.card >= PACK_CARDS - 1;
}

export function packNext() {
  showPackScreen();
}

// The sealed pack. The swipe is tracked on the whole pack screen, not just
// the packet: a drag that starts off the pack and crosses over it counts,
// and the cut draws at the finger's actual position over the pack. A plain
// tap on the pack tears it too. Fresh packs only.
function wireSealedPack(sealed, screen) {
  let startX = 0;
  let startT = 0;
  let dragging = false;
  let tearing = false;
  let downOnPack = false;
  let maxProgress = 0;
  let travel = 0;
  let opening = null;
  let openingTimer = 0;

  const endOpening = () => {
    if (!opening) return;
    opening.fade.cancel();
    opening.glide.cancel();
    opening = null;
    window.clearTimeout(openingTimer);
    sealed.hidden = true;
    sealed.style.removeProperty('--tear');
    sealed.style.pointerEvents = '';
  };

  // The packet opens, the cards slide up out of it, then the wrapper fades.
  const finishTear = () => {
    if (tornDate === pack.record?.date) return;
    tornDate = pack.record.date;
    tearing = false;
    sealed.classList.remove('tearing');
    if (reducedMotion()) {
      sealed.style.removeProperty('--tear');
      renderPackScreen(false);
      return;
    }
    const packH = sealed.getBoundingClientRect().height;
    renderPackScreen(true);
    sealed.hidden = false;
    sealed.style.pointerEvents = 'none';
    const fade = sealed.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 540, easing: 'ease-out', fill: 'forwards' });
    const glide = els.slots.animate(
      [{ transform: 'translateY(0px)' }, { transform: `translateY(${-(packH + 18)}px)` }],
      { duration: 400, delay: 150, easing: 'ease-out', fill: 'forwards' },
    );
    opening = { fade, glide };
    openingTimer = window.setTimeout(endOpening, 600);
  };

  const tearOpen = () => {
    if (tearing || tornDate === pack.record?.date) return;
    audio.tear();
    if (navigator.vibrate) navigator.vibrate(12);
    if (reducedMotion()) { finishTear(); return; }
    tearing = true;
    sealed.classList.add('tearing');
    window.setTimeout(finishTear, 500);
  };

  const progressAt = (clientX) => {
    const r = sealed.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  screen.addEventListener('pointerdown', (event) => {
    if (opening) { endOpening(); return; }
    if (sealed.hidden) return;
    if (tearing) { finishTear(); return; }
    if (event.target.closest('.home-nav-btn')) return;
    dragging = true;
    downOnPack = Boolean(event.target.closest('.pack-sealed'));
    startX = event.clientX;
    startT = Date.now();
    travel = 0;
    maxProgress = progressAt(event.clientX);
    if (downOnPack) sealed.style.setProperty('--tear', maxProgress.toFixed(3));
  });
  screen.addEventListener('pointermove', (event) => {
    if (!dragging || tearing) return;
    travel = Math.max(travel, Math.abs(event.clientX - startX));
    const progress = progressAt(event.clientX);
    maxProgress = Math.max(maxProgress, progress);
    sealed.style.setProperty('--tear', progress.toFixed(3));
  });
  const finishDrag = () => {
    if (!dragging) return;
    dragging = false;
    const width = sealed.getBoundingClientRect().width || 190;
    const crossed = maxProgress >= 0.8;
    const travelled = travel >= width * 0.55;
    const flick = Date.now() - startT < 300 && travel >= 55;
    const tap = downOnPack && travel < 10 && Date.now() - startT < 400;
    if (crossed || travelled || flick || tap) tearOpen();
    else sealed.style.removeProperty('--tear');
    maxProgress = 0;
    travel = 0;
  };
  screen.addEventListener('pointerup', finishDrag);
  screen.addEventListener('pointercancel', finishDrag);
  sealed.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); tearOpen(); }
  });
}

export function initPack(main) {
  host = main;
  entry = document.getElementById('pack-button');
  const screen = document.getElementById('pack-screen');
  const sealed = document.createElement('div');
  sealed.className = 'pack-sealed';
  sealed.hidden = true;
  sealed.setAttribute('role', 'button');
  sealed.tabIndex = 0;
  sealed.setAttribute('aria-label', 'Open the pack');
  sealed.innerHTML = `
    <div class="pack-sealed-strip"></div>
    <div class="pack-sealed-flap"></div>
    <div class="pack-sealed-cut"></div>
    <div class="pack-sealed-face">
      <span class="pack-flip-mark">?</span>
      <p class="pack-sealed-name">Daily postcard pack</p>
      <p class="pack-sealed-sub">3 postcards</p>
      <p class="pack-sealed-hint">Swipe across the top to tear it open</p>
    </div>`;
  screen.querySelector('.pack-panel').insertBefore(sealed, screen.querySelector('.pack-slots'));
  els = {
    screen,
    sealed,
    line: screen.querySelector('.pack-line'),
    slots: screen.querySelector('.pack-slots'),
    ready: screen.querySelector('.pack-ready'),
    primary: screen.querySelector('.pack-primary'),
  };
  wireSealedPack(sealed, screen);
  state.packScreenEl = screen;
  entry.disabled = true;
  entry.addEventListener('click', openPack);
  els.primary.addEventListener('click', primaryAction);
  // Midnight: the row picks up the new pack while home is showing.
  const rollover = () => { if (localDateKey() !== rowDate && !host.gameEls.start.hidden) syncPackButton(); };
  setInterval(rollover, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) rollover(); });
}
