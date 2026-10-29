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
// session, the unplayed cards wait in one stack and the top card flips to
// its clue before its round (2026-10-29), and a played card stamps into its
// slot once the pack is done. Session state only; the
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

  // Recommended home variant: update pack marker on Daily button
  const isRecsHome = document.body.classList.contains('home-recs');
  if (isRecsHome) {
    const playButton = document.getElementById('play-button');
    const marker = playButton?.querySelector('.pack-marker');
    if (marker) {
      marker.hidden = done;
      marker.setAttribute('aria-label', done ? 'Pack opened' : 'Open daily postcard pack');
    }
  }
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
    // clue, flag; never the photo), then the round starts. The stack keeps
    // the order: only its top card takes the tap. Results save per slot.
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
  const stackNow = !sealedNow && !done;
  els.sealed.hidden = !sealedNow;
  els.slots.hidden = sealedNow;
  els.slots.classList.toggle('is-stack', stackNow);
  if (stackNow) {
    // The unplayed cards as one stack, next card on top (last in the DOM so
    // it paints over the rest). Cards under the top one are inert.
    const remaining = current.ids.map((id, i) => i).filter((i) => !current.results[i]);
    els.slots.replaceChildren(...remaining.map((i, depth) => {
      const li = packSlot(current.ids[i], null, i);
      li.style.setProperty('--depth', depth);
      if (depth) {
        li.inert = true;
        li.setAttribute('aria-hidden', 'true');
      }
      return li;
    }).reverse());
  } else if (!sealedNow) {
    els.slots.replaceChildren(...current.ids.map((id, i) => packSlot(id, current.results[i], i)));
  }
  if (!sealedNow) {
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
      // Mid-pack the stack slides back in with the cards still to play; on
      // the last card the played card stamps into its slot.
      const li = stackNow ? els.slots : els.slots.children[landingCard];
      if (li && !reducedMotion()) {
        const anim = li.animate(stackNow
          ? [{ transform: 'translateX(70vw)', opacity: 0 }, { transform: 'none', opacity: 1 }]
          : [{ transform: 'scale(1.16) rotate(-4deg)', opacity: 0 }, { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }],
          { duration: stackNow ? 420 : 500, easing: stackNow ? 'cubic-bezier(.2,.8,.3,1)' : 'cubic-bezier(.2, 1.4, .4, 1)' },
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
    : summary.played ? `${summary.played} of ${PACK_CARDS} opened · Tap the top card` : 'Tap the top card to flip its clue.';
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

// The tear line: the middle of the holographic crimp strip under the WHERE ON
// EARTH header, as a fraction of the pack art's height (measured on
// assets/pack-daily-dispatch.webp, strip rows 465 to 544 of 1966).
const TEAR_LINE = 0.257;
// How far above or below the line (CSS px) the finger may stray and still cut.
const TRACE_BAND = 64;

// The sealed pack. The trace is tracked on the whole pack screen, not just
// the packet: a drag that starts off the pack and crosses over it counts.
// Only horizontal travel across the pack near the tear line cuts; straying
// off the line pauses the cut, it does not reset it. Fresh packs only.
function wireSealedPack(sealed, screen) {
  let startX = 0;
  let startY = 0;
  let startT = 0;
  let lastX = 0;
  let dir = 0;
  let dragging = false;
  let tearing = false;
  let downOnPack = false;
  let progress = 0;
  let travel = 0;
  let opening = null;
  let openingTimer = 0;

  const endOpening = () => {
    if (!opening) return;
    for (const anim of opening.anims) anim.cancel();
    for (const timer of opening.timers) window.clearTimeout(timer);
    opening = null;
    window.clearTimeout(openingTimer);
    sealed.hidden = true;
    sealed.classList.remove('torn', 'opening');
    sealed.style.removeProperty('--tear');
    sealed.style.pointerEvents = '';
    sealed.style.left = '';
    sealed.style.top = '';
  };

  // The packet opens and the three cards rise out of its torn top as one
  // stack: each card is clipped at the tear line, so it shows only once it
  // is out of the opening. The stack already sits in its final place (the
  // pack's own footprint); the torn wrapper is laid over it until it fades,
  // and the stack settles back down where the pack stood.
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
    const packRect = sealed.getBoundingClientRect();
    renderPackScreen(false);
    const panel = sealed.parentElement;
    sealed.hidden = false;
    sealed.classList.add('opening');
    sealed.style.pointerEvents = 'none';
    const panelRect = panel.getBoundingClientRect();
    sealed.style.left = `${packRect.left - panelRect.left - panel.clientLeft + panel.scrollLeft}px`;
    sealed.style.top = `${packRect.top - panelRect.top - panel.clientTop + panel.scrollTop}px`;
    const tearY = packRect.top + packRect.height * TEAR_LINE;
    const anims = [sealed.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, delay: 700, easing: 'ease-out', fill: 'forwards' })];
    const timers = [];
    const RISE_MS = 1500;
    // Top card first (it is last in the DOM).
    [...els.slots.children].reverse().forEach((card, depth) => {
      const top = card.getBoundingClientRect().top;
      const h = card.offsetHeight;
      const inside = tearY - top;
      const out = tearY - h - top;
      anims.push(card.animate([
        { transform: `translateY(${inside}px)`, clipPath: `inset(0 0 ${h}px 0)`, easing: 'cubic-bezier(.25,.7,.35,1)' },
        { transform: `translateY(${out}px)`, clipPath: 'inset(0 0 0px 0)', offset: 0.4, easing: 'ease-out' },
        { transform: `translateY(${out - 14}px)`, clipPath: 'inset(0 0 0px 0)', offset: 0.55, easing: 'cubic-bezier(.3,.1,.3,1)' },
        { transform: 'none', clipPath: 'inset(0 0 0px 0)' },
      ], { duration: RISE_MS, delay: depth * 90, fill: 'both' }));
    });
    timers.push(window.setTimeout(endOpening, RISE_MS + 2 * 90 + 60));
    opening = { anims, timers };
  };

  const tearOpen = () => {
    if (tearing || tornDate === pack.record?.date) return;
    audio.tear();
    if (navigator.vibrate) navigator.vibrate(12);
    if (reducedMotion()) { finishTear(); return; }
    tearing = true;
    sealed.classList.add('tearing', 'torn');
    window.setTimeout(finishTear, 500);
  };

  // A plain tap shows where to trace: one glint runs the whole line.
  const teach = () => {
    sealed.classList.remove('teach', 'tear-rtl');
    void sealed.offsetWidth;
    sealed.classList.add('teach');
  };
  sealed.addEventListener('animationend', (event) => {
    if (event.animationName === 'pack-glint-teach') sealed.classList.remove('teach');
  });

  screen.addEventListener('pointerdown', (event) => {
    if (opening) { endOpening(); return; }
    if (sealed.hidden) return;
    if (tearing) { finishTear(); return; }
    if (event.target.closest('.home-nav-btn')) return;
    dragging = true;
    downOnPack = Boolean(event.target.closest('.pack-sealed'));
    startX = event.clientX;
    startY = event.clientY;
    startT = Date.now();
    lastX = event.clientX;
    dir = 0;
    travel = 0;
    progress = 0;
  });
  // The cut runs the way the finger first moves along the line; moving back
  // the other way, or off the line, holds it where it is.
  screen.addEventListener('pointermove', (event) => {
    if (!dragging || tearing) return;
    travel = Math.max(travel, Math.hypot(event.clientX - startX, event.clientY - startY));
    const r = sealed.getBoundingClientRect();
    const clampX = (x) => Math.min(r.right, Math.max(r.left, x));
    const dx = clampX(event.clientX) - clampX(lastX);
    lastX = event.clientX;
    if (Math.abs(event.clientY - (r.top + r.height * TEAR_LINE)) > TRACE_BAND || !dx) return;
    if (!dir) {
      dir = Math.sign(dx);
      sealed.classList.toggle('tear-rtl', dir < 0);
    }
    progress = Math.min(1, progress + Math.max(0, dx * dir) / r.width);
    sealed.style.setProperty('--tear', progress.toFixed(3));
    if (progress >= 0.9) {
      dragging = false;
      progress = 0;
      tearOpen();
    }
  });
  // Only a trace that runs nearly all the way along the line opens it.
  // Anything less springs back to zero for another try.
  const resetTear = (from) => {
    const started = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - started) / 200);
      sealed.style.setProperty('--tear', (from * (1 - t)).toFixed(3));
      if (t < 1 && !tearing) requestAnimationFrame(step);
      else sealed.style.removeProperty('--tear');
    };
    requestAnimationFrame(step);
  };
  const finishDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (downOnPack && travel < 10 && Date.now() - startT < 500) {
      if (reducedMotion()) tearOpen();
      else teach();
    } else {
      resetTear(progress);
    }
    progress = 0;
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
  sealed.style.setProperty('--line', TEAR_LINE);
  // The art carries its own wordmark and title. body is the art below the
  // tear line, strip the art above it (it flies off on the tear), flap the
  // torn edge left on the body, cut the opening split and its flare head.
  sealed.innerHTML = `
    <div class="pack-sealed-body"></div>
    <div class="pack-sealed-strip"></div>
    <div class="pack-sealed-flap"></div>
    <div class="pack-sealed-sheen"></div>
    <div class="pack-sealed-cut"><span class="pack-sealed-glint"></span></div>
    <p class="pack-sealed-hint">Trace the line to open</p>`;
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
