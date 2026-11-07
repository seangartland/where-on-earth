import { EARN_NAMES, EARN_BULLSEYE, EARN_PINPOINT } from '../core/config.js';
import { audio } from '../core/audio.js';
import { state } from '../core/state.js';
import { formatKm, localDateKey } from '../core/format.js';
import { buildPostcardCard } from '../meta/postcard-card.js';
import {
  PACK_CARDS, PACK_TYPES, STAMINA_MAX, STAMINA_PERIOD, packPool, landmarkPackPool, landformPackPool, readPack, ensurePack,
  savePackResult, completePack, spend, applySkips, writePack, packOutcome, packSummary,
  packChoiceState, packProgressCount, canTearPack,
} from '../meta/pack-store.js';

let host = null;
export const PACKS = [
  { type: 'capitals', name: 'Capitals', art: 'assets/pack-world-capitals.webp', tearLine: 0.0886 },
  { type: 'landmarks', name: 'Landmarks', art: 'assets/pack-landmarks.webp', tearLine: 0.0886, aspect: '900 / 1350' },
  { type: 'landforms', name: 'Landforms', art: 'assets/pack-landforms.webp', tearLine: 0.0886, aspect: '900 / 1350' },
];
export const pack = { active: false, type: 'capitals', card: 0, item: null, record: null };

let entry;
let els;
let tickSelect = null;
// A fresh pack starts sealed for this
// session, the unplayed cards wait in one stack and the top card flips to
// its clue before its round (2026-10-29), and a played card stamps into its
// slot once the pack is done. Session state only; the
// saved pack record is untouched by all of it.
let flipping = false;
let holdIndex = -1;
let holdTimer = 0;
let landingCard = -1;
let landingKind = null;
let landingTier = 0;
let placeTimer = 0;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// Inline icons from the approved mockup (pack-stamina-mockups): the sealed
// pack stands in for the old stamina pips, the hourglass for the old emoji.
const PACK_ICON_FULL = '<svg class="pk pk-full" viewBox="0 0 24 32" width="13" height="17" aria-hidden="true"><path d="M4 3.2h16V7L17.3 5.4 14.7 7 12 5.4 9.3 7 6.7 5.4 4 7Z" fill="#ffe3a3"/><path d="M4 10.2l2.7-1.6 2.6 1.6L12 8.6l2.7 1.6 2.6-1.6L20 10.2V27a2.6 2.6 0 0 1-2.6 2.6H6.6A2.6 2.6 0 0 1 4 27Z" fill="#ffc76a"/></svg>';
const PACK_ICON_EMPTY = '<svg class="pk pk-empty" viewBox="0 0 24 32" width="13" height="17" fill="none" stroke="rgba(255,199,106,.85)" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 3.2h16V7L17.3 5.4 14.7 7 12 5.4 9.3 7 6.7 5.4 4 7Z"/><path d="M4 10.2l2.7-1.6 2.6 1.6L12 8.6l2.7 1.6 2.6-1.6L20 10.2V27a2.6 2.6 0 0 1-2.6 2.6H6.6A2.6 2.6 0 0 1 4 27Z"/></svg>';
const HOURGLASS_ICON = '<svg class="hg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#ffc76a" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 2.8h11M6.5 21.2h11M7.3 2.8v3c0 2.5 2.1 3.6 4.7 6 2.6-2.4 4.7-3.5 4.7-6v-3M7.3 21.2v-3c0-2.5 2.1-3.6 4.7-6 2.6 2.4 4.7 3.5 4.7 6v3"/><path d="M9.8 18.4 12 15.9l2.2 2.5Z" fill="#ffc76a" stroke="none" opacity=".9"/></svg>';

function currentPack() {
  return pack.record?.byType[pack.type];
}

const packConfig = () => PACKS.find((item) => item.type === pack.type);
const poolFor = (type) => type === 'capitals' ? packPool(host.locations)
  : type === 'landforms' ? landformPackPool(host.landmarks) : landmarkPackPool(host.landmarks);

function countdownText(record, now = Date.now()) {
  const seconds = Math.max(0, Math.ceil((record.stamina.nextAt - now) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function staminaText(record, now = Date.now()) {
  if (record.stamina.stored) return `${record.stamina.stored} ${record.stamina.stored === 1 ? 'pack' : 'packs'} available`;
  return `Next pack in ${countdownText(record, now)}`;
}

export function syncPackButton() {
  entry.disabled = !(host.locations || []).length || !(host.landmarks || []).length;
  const record = readPack();
  const progress = packProgressCount(record);
  // Availability and an open pack are independent facts; show both when both
  // are true. The countdown append only applies when nothing is in progress.
  let subtitle;
  if (progress && record.stamina.stored > 0) subtitle = `${staminaText(record)} · ${progress} in progress`;
  else if (progress) subtitle = `${progress} in progress`;
  else {
    subtitle = staminaText(record);
    if (record.stamina.stored === 1) subtitle += ` · next in ${countdownText(record)}`;
  }
  entry.querySelector('.mode-desc').textContent = subtitle;
  entry.querySelector('.pack-token-count').textContent = record.skips;
  // Slim refill bar on the home button's bottom edge: same fraction as the
  // pack screen bar, full at cap.
  const { stored, nextAt } = record.stamina;
  const refillPct = stored >= STAMINA_MAX || nextAt == null ? 100
    : Math.min(100, Math.max(0, (1 - (nextAt - Date.now()) / STAMINA_PERIOD) * 100));
  entry.querySelector('.pack-home-bar i').style.width = `${refillPct.toFixed(1)}%`;
  // The gold primary treatment is state-driven: the unplayed Daily holds it;
  // once the Daily is played, Packs takes it when a pack can be opened or
  // resumed, and nothing is gold when no pack is available. This runs on the
  // 1s tick, so it flips live as the Daily completes or a pack refills.
  if (!document.body.classList.contains('home-recs')) {
    const dailyPlayed = Boolean(state.daily?.complete && state.daily?.date === localDateKey());
    entry.classList.toggle('is-gold', dailyPlayed && (stored > 0 || progress > 0));
    document.getElementById('play-button')?.classList.toggle('is-gold', !dailyPlayed);
  }

  // Recommended home variant: update pack marker on Daily button
  const isRecsHome = document.body.classList.contains('home-recs');
  if (isRecsHome) {
    const playButton = document.getElementById('play-button');
    const marker = playButton?.querySelector('.pack-marker');
    if (marker) {
      marker.hidden = record.stamina.stored < 1 && progress === 0;
      marker.setAttribute('aria-label', 'Open the postcard packs');
    }
  }
}

function openPack() {
  showPackSelect();
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
  els.line.textContent = 'Starting…';
  window.setTimeout(() => {
    flipping = false;
    holdIndex = index;
    // The face's bottom address rule fills left to right over the hold.
    const hold = reducedMotion() ? 0 : CLUE_HOLD_MS;
    if (hold) {
      li.querySelector('.pack-clue-progress i')?.animate(
        [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: hold, easing: 'linear', fill: 'forwards' });
    }
    holdTimer = window.setTimeout(() => { holdIndex = -1; startCard(index); }, hold);
  }, reducedMotion() ? 0 : 330);
}

function updatePrimary() {
  const done = packSummary(currentPack()).played >= PACK_CARDS;
  els.actions.hidden = !done;
  els.primary.textContent = 'Back to packs';
}

function packSlot(id, result, index) {
  const item = host.findLocation(id);
  let li;
  if (!result) {
    // Face down until tapped: the flip reveals the clue face only (name,
    // clue, flag; never the photo), the back's address side filled in, then
    // the round starts. The stack keeps
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
        <div class="pack-flip-face pack-flip-back pc-back" aria-hidden="true">
          <div class="pc-divider"></div>
          <div class="pc-right">
            <div class="pc-stamp-row">
              <div class="pc-stamp"></div>
              <span class="pc-postmark is-blank"></span>
            </div>
            <div class="pc-addr">
              <div class="pc-addr-rule"></div>
              <div class="pc-addr-rule"></div>
              <p class="pc-addr-pack">${packConfig().name}</p>
              <div class="pc-addr-rule"></div>
              <div class="pc-addr-rule"></div>
            </div>
          </div>
        </div>
        <div class="pack-flip-face pack-flip-front">
          <div class="pc-stamp-row">
            <div class="pc-stamp pack-clue-stamp"><span>${flag}</span></div>
          </div>
          <div class="pc-addr pack-clue-addr">
            <p class="pack-clue-name pc-caption-name">${name}</p>
            <p class="pack-clue-text pc-caption-sub">${[sub, packConfig().name].filter(Boolean).join(' · ')}</p>
            <div class="pc-addr-rule pack-clue-progress"><i></i></div>
          </div>
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

// Pack placement (src/meta/pack-placement.js): once the last card has
// stamped in and the summary has had a moment to read, the new and upgraded
// cards go into their Passport slots. Only right after the last card lands
// (reopening a finished pack does not replay it), only with the setting on,
// and the Passport button stays as it was for repeat and visited-only packs.
const PLACE_DELAY = 1600;
function packPlacements(current) {
  return current.ids
    .map((id, i) => ({ id, kind: current.results[i]?.postcard?.kind, tier: current.results[i]?.postcard?.tier || 0 }))
    .filter((card) => card.kind === 'new' || card.kind === 'upgrade');
}
function cancelPlacement() {
  window.clearTimeout(placeTimer);
  placeTimer = 0;
}
function schedulePlacement(current) {
  cancelPlacement();
  if (!state.packPlacement) return;
  const cards = packPlacements(current);
  if (!cards.length) return;
  const type = pack.type;
  placeTimer = window.setTimeout(() => {
    placeTimer = 0;
    // Still on this pack's finish screen: not left for the Passport or home.
    if (els.screen.hidden || !els.select.hidden || pack.type !== type || !document.body.classList.contains('game-results')) return;
    host.openPackPlacement(type, cards, showPackSelect);
  }, PLACE_DELAY);
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

export function showPackSelect() {
  cancelPlacement();
  pack.active = false;
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'pack';
  window.__canGuess = false;
  pack.record = readPack();
  els.heading.textContent = 'Postcard Packs';
  els.select.hidden = false;
  els.sealed.hidden = true;
  els.slots.hidden = true;
  els.line.hidden = true;
  els.actions.hidden = true;
  els.stamina.hidden = true;
  els.screen.classList.remove('sealed-on');
  const render = () => {
    if (els.select.hidden) return;
    pack.record = readPack();
    // A pack with every card played is over, but its session only cleared
    // when the player tapped the finished pack screen's primary button, so
    // leaving by any other route left a stale 'Complete' label here for
    // days. Clear finished sessions on arrival at this screen instead;
    // rewards were already banked when each card result was saved.
    for (const type of PACK_TYPES) {
      const saved = pack.record.byType[type];
      if (saved && packSummary(saved).played >= PACK_CARDS) completePack(pack.record, type);
    }
    const waitHours = pack.record.stamina.nextAt == null ? 0
      : Math.max(0, Math.ceil((pack.record.stamina.nextAt - Date.now()) / (60 * 60 * 1000)));
    els.selectStamina.innerHTML = `<div class="pack-stamina-line"><span class="pack-icons" aria-hidden="true">${pack.record.stamina.stored > 0 ? PACK_ICON_FULL : PACK_ICON_EMPTY}${pack.record.stamina.stored > 1 ? PACK_ICON_FULL : PACK_ICON_EMPTY}</span><span class="pack-stamina-text">${staminaText(pack.record)}</span><span class="pack-skip-balance">${HOURGLASS_ICON}<span>${pack.record.skips}</span></span></div>`;
    if (pack.record.stamina.stored < 2 && pack.record.skips > 0) {
      const actions = document.createElement('div');
      actions.className = 'pack-skip-actions';
      if (waitHours && pack.record.skips >= waitHours) {
        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.innerHTML = `Open a pack now (${waitHours} ${HOURGLASS_ICON})`;
        openButton.addEventListener('click', () => {
          applySkips(pack.record, waitHours);
          render();
        });
        actions.append(openButton);
      }
      if (actions.children.length) els.selectStamina.append(actions);
    }
    // Refill bar under the stamina block: full at cap (the timer pauses
    // there, so no countdown label), otherwise the elapsed fraction of the
    // current cycle, with the countdown beside it when one pack is stored.
    // At zero stored the line above already reads as the countdown.
    const { stored, nextAt } = pack.record.stamina;
    const refillPct = stored >= STAMINA_MAX || nextAt == null ? 100
      : Math.min(100, Math.max(0, (1 - (nextAt - Date.now()) / STAMINA_PERIOD) * 100));
    els.selectStamina.insertAdjacentHTML('beforeend',
      `<div class="pack-refill"><div class="pack-refill-track"><i style="width:${refillPct.toFixed(1)}%"></i></div>${stored === 1 ? `<span class="pack-refill-count">Next pack in ${countdownText(pack.record)}</span>` : ''}</div>`);
    els.choices.replaceChildren(...PACKS.map((config) => {
      const { inProgress, complete, locked } = packChoiceState(pack.record, config.type);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pack-choice';
      button.disabled = locked || (!inProgress && pack.record.stamina.stored < 1);
      // The art carries the pack name in large type, so there is no visible
      // label; the name stays on the button for assistive tech.
      button.setAttribute('aria-label', config.name);
      button.innerHTML = `<img src="${config.art}" alt=""><small>${locked ? 'Finish your open pack first' : complete ? 'Complete' : inProgress ? 'In progress' : ''}</small>`;
      button.addEventListener('click', () => {
        pack.type = config.type;
        ensurePack(pack.record, config.type, poolFor(config.type));
        showPackScreen();
      });
      return button;
    }));
  };
  tickSelect = () => {
    if (els.select.hidden) return;
    pack.record = readPack();
    render();
  };
  render();
  els.screen.hidden = false;
  document.body.classList.add('game-results');
}

// One screen for every moment: sealed, fresh, mid-pack and done.
function renderPackScreen(deal = false) {
  const current = currentPack();
  const summary = packSummary(current);
  const done = summary.played >= PACK_CARDS;
  const sealedNow = !done && summary.played === 0 && !current.torn;
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
      if (done) schedulePlacement(current);
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
  els.stamina.textContent = done ? staminaText(pack.record) : '';
  els.screen.classList.toggle('sealed-on', sealedNow);
  if (sealedNow) els.actions.hidden = true;
  else updatePrimary();
}

export function showPackScreen() {
  pack.active = false;
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'pack';
  window.__canGuess = false;
  els.select.hidden = true;
  els.line.hidden = false;
  els.stamina.hidden = false;
  els.heading.textContent = packConfig().name;
  els.sealed.style.setProperty('--art', `url('../../${packConfig().art}')`);
  els.sealed.style.setProperty('--line', packConfig().tearLine);
  els.sealed.style.aspectRatio = packConfig().aspect || '2 / 3';
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
  // From the flipped card, the place name flies up into the round header
  // while the globe fades in (View Transitions). A plain cut where the API
  // is missing or motion is reduced.
  const name = els.slots.querySelector('.flipped .pack-clue-name');
  if (!name || !document.startViewTransition || reducedMotion()) {
    host.showRound();
    return;
  }
  const root = document.documentElement;
  const { clue } = host.gameEls;
  name.style.viewTransitionName = 'pack-place';
  root.classList.add('pack-vt');
  const cleanup = () => {
    clue.style.viewTransitionName = '';
    root.classList.remove('pack-vt');
  };
  document.startViewTransition(() => {
    name.style.viewTransitionName = '';
    clue.style.viewTransitionName = 'pack-place';
    host.showRound();
  }).finished.then(cleanup, cleanup);
}

function primaryAction() {
  const { played, nextCard } = packSummary(currentPack());
  if (played >= PACK_CARDS) {
    completePack(pack.record, pack.type);
    showPackSelect();
  }
  else startCard(nextCard);
}

// The round screen's pack variant (round.js showRound, revealGuess, nextRound).
export function packRoundHeader() {
  const { gameEls } = host;
  document.body.classList.add('pack');
  gameEls.number.textContent = `${packConfig().name} · Card ${pack.card + 1} of ${PACK_CARDS}`;
  gameEls.weight.style.display = 'none';
  gameEls.dailyDate.hidden = true;
}

// Saved on reveal, so leaving mid-pack loses nothing. Returns the outcome
// the reveal shows.
export function packRecordGuess(guess, km, kmExact, base, wasVisited, previousEarn, newlyEarned) {
  const postcard = packOutcome(wasVisited, previousEarn, newlyEarned);
  savePackResult(pack.record, pack.type, pack.card, {
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
    const { line } = opening;
    const headingFrom = getComputedStyle(els.heading).opacity;
    const lineFrom = getComputedStyle(els.line).opacity;
    for (const anim of opening.anims) anim.cancel();
    for (const timer of opening.timers) window.clearTimeout(timer);
    opening = null;
    // The cards have landed: the line takes its new text, the heading and
    // line fade back in and the panel eases from its pinned sealed height to
    // the stack's.
    els.line.textContent = line;
    const panel = sealed.parentElement;
    const pinned = panel.style.minHeight;
    panel.style.minHeight = '';
    const settle = [
      panel.animate([{ minHeight: pinned }, { minHeight: `${panel.offsetHeight}px` }], { duration: 250, easing: 'ease-in-out' }),
      els.heading.animate([{ opacity: headingFrom }, { opacity: 1 }], { duration: 150, easing: 'ease-out' }),
      els.line.animate([{ opacity: lineFrom }, { opacity: 1 }], { duration: 150, easing: 'ease-out' }),
    ];
    window.setTimeout(() => { for (const anim of settle) anim.cancel(); }, 400);
    window.clearTimeout(openingTimer);
    sealed.hidden = true;
    sealed.classList.remove('torn', 'opening');
    els.slots.classList.remove('is-opening');
    sealed.style.removeProperty('--tear');
    sealed.style.pointerEvents = '';
    sealed.style.left = '';
    sealed.style.top = '';
  };

  // The packet opens and the three cards come out of its torn top one at a
  // time, top card first. The torn wrapper is layered over them, so its body
  // below the tear line hides whatever is still inside. A rising card stays
  // on its side, centered on the pack and scaled to fit its silhouette, so
  // nothing of it can show beside the pack; only once it is fully clear of
  // the lip does it move above the wrapper, turn upright (rising as it turns
  // so no corner dips back below the lip), take its fan offset and settle
  // into the stack where the pack stood. Once the last card clears, the spent
  // wrapper drops away.
  const finishTear = () => {
    pack.record = readPack();
    let current = currentPack();
    if (current.torn) return;
    if (!canTearPack(pack.record, pack.type)) {
      tearing = false;
      sealed.classList.remove('tearing', 'torn');
      sealed.style.removeProperty('--tear');
      showPackSelect();
      return;
    }
    if (!spend(pack.record)) {
      tearing = false;
      sealed.classList.remove('tearing', 'torn');
      sealed.style.removeProperty('--tear');
      showPackSelect();
      return;
    }
    pack.record = readPack();
    current = currentPack();
    current.torn = true;
    writePack(pack.record);
    tearing = false;
    sealed.classList.remove('tearing');
    if (reducedMotion()) {
      sealed.style.removeProperty('--tear');
      renderPackScreen(false);
      return;
    }
    const packRect = sealed.getBoundingClientRect();
    const panel = sealed.parentElement;
    // The stack is shorter than the sealed pack: pin the panel at its sealed
    // height so the swap cannot re-center it and drop the header onto the
    // torn lip (endOpening eases it back). The heading and line fade out as
    // the rise starts and the line takes its new text while unseen.
    panel.style.minHeight = `${panel.getBoundingClientRect().height}px`;
    const sealedLine = els.line.textContent;
    renderPackScreen(false);
    const nextLine = els.line.textContent;
    els.line.textContent = sealedLine;
    sealed.hidden = false;
    sealed.classList.add('opening');
    els.slots.classList.add('is-opening');
    sealed.style.pointerEvents = 'none';
    const panelRect = panel.getBoundingClientRect();
    sealed.style.left = `${packRect.left - panelRect.left - panel.clientLeft + panel.scrollLeft}px`;
    sealed.style.top = `${packRect.top - panelRect.top - panel.clientTop + panel.scrollTop}px`;
    const tearY = packRect.top + packRect.height * packConfig().tearLine;
    const anims = [];
    const HEADER_FADE = 150;
    for (const el of [els.heading, els.line]) {
      anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: HEADER_FADE, easing: 'ease-out', fill: 'forwards' }));
    }
    const timers = [window.setTimeout(() => { els.line.textContent = nextLine; }, HEADER_FADE)];
    const STAGGER = 150;
    const RISE = 380;
    const TURN = 300;
    const FAN = 120;
    const SETTLE = 400;
    const TOTAL = RISE + TURN + FAN + SETTLE;
    const SIDE = 34; // room each side for the card's shadow, which swings sideways when it is turned
    const GAP = 16; // clearance above the lip; covers the fan's small tilt
    // Every card sits centered in the stack (grid-area 1 / 1), so the stack's
    // own box is each card's untransformed layout box.
    const stack = els.slots.getBoundingClientRect();
    const dx = packRect.left + packRect.width / 2 - (stack.left + stack.width / 2);
    const mid = stack.top + stack.height / 2;
    const cards = [...els.slots.children].reverse();
    cards.forEach((card, order) => {
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      // On its side the card is h wide and w tall: fit both inside the pack.
      const fit = Math.min(1, (packRect.width - 2 * SIDE) / h, (packRect.bottom - tearY - 6) / w);
      const css = getComputedStyle(card);
      const at = (y, deg, scale) => `translate(${dx}px, ${y - mid}px) rotate(${deg}deg) scale(${scale})`;
      const flat = { translate: '0px 0px', rotate: '0deg' };
      const keys = [{ ...flat, zIndex: 1, transform: at(tearY + w * fit / 2 + 2, 90, fit), offset: 0, easing: 'cubic-bezier(.25,.7,.35,1)' }];
      // The turn, sampled so the card's bottom stays GAP above the lip while
      // its on-screen height changes with the angle. It starts out of the
      // pack, so it moves above the wrapper there.
      const STEPS = 9;
      for (let k = 0; k <= STEPS; k++) {
        const t = k / STEPS;
        const deg = 90 * (1 - t);
        const scale = fit + (1 - fit) * t;
        const rad = deg * Math.PI / 180;
        const half = scale * (w * Math.sin(rad) + h * Math.cos(rad)) / 2;
        const key = { ...flat, zIndex: 3, transform: at(tearY - GAP - half, deg, scale), offset: (RISE + TURN * t) / TOTAL, easing: 'linear' };
        if (!k) keys.push({ ...key, zIndex: 1 });
        keys.push(key);
      }
      keys[keys.length - 1].easing = 'ease-out';
      keys.push({ translate: css.translate, rotate: css.rotate, zIndex: 3, transform: at(tearY - GAP - h / 2, 0, 1), offset: (RISE + TURN + FAN) / TOTAL, easing: 'cubic-bezier(.3,.1,.3,1)' });
      keys.push({ translate: css.translate, rotate: css.rotate, zIndex: 3, transform: 'translate(0px, 0px) rotate(0deg) scale(1)', offset: 1 });
      anims.push(card.animate(keys, { duration: TOTAL, delay: order * STAGGER, fill: 'both' }));
    });
    // The spent wrapper stays fully opaque until the last card is clear of the
    // lip (the end of its rise), then drops away under the turning cards.
    anims.push(sealed.animate(
      [{ transform: 'none', opacity: 1 }, { opacity: 1, offset: 0.6 }, { transform: 'translateY(40%) rotate(4deg)', opacity: 0 }],
      { duration: 350, delay: (cards.length - 1) * STAGGER + RISE, easing: 'ease-in', fill: 'forwards' },
    ));
    timers.push(window.setTimeout(endOpening, TOTAL + (cards.length - 1) * STAGGER + 60));
    opening = { anims, timers, line: nextLine };
  };

  const tearOpen = () => {
    if (tearing || currentPack().torn) return;
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
    if (event.target.closest('.home-nav')) return;
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
    if (Math.abs(event.clientY - (r.top + r.height * packConfig().tearLine)) > TRACE_BAND || !dx) return;
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
    heading: screen.querySelector('#pack-heading'),
    select: screen.querySelector('.pack-select'),
    selectStamina: screen.querySelector('.pack-stamina'),
    choices: screen.querySelector('.pack-choices'),
    sealed,
    line: screen.querySelector('.pack-line'),
    slots: screen.querySelector('.pack-slots'),
    actions: screen.querySelector('.pack-actions'),
    primary: screen.querySelector('.pack-primary'),
    passport: screen.querySelector('.pack-passport'),
    stamina: screen.querySelector('.pack-complete-stamina'),
  };
  wireSealedPack(sealed, screen);
  state.packScreenEl = screen;
  entry.disabled = true;
  entry.addEventListener('click', openPack);
  els.primary.addEventListener('click', primaryAction);
  els.passport.addEventListener('click', () => host.openPassport(showPackSelect));
  screen.querySelector('.pack-back').addEventListener('click', (event) => {
    event.stopPropagation();
    if (els.select.hidden) showPackSelect();
    else host.goHome();
  });
  setInterval(() => {
    if (!screen.hidden && !els.select.hidden) tickSelect?.();
    else if (!host.gameEls.start.hidden) syncPackButton();
  }, 1000);
}
