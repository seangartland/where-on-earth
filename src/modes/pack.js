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

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function currentPack() {
  return pack.record?.packs[pack.packIndex];
}

// The home row (P1): quiet, and dimmed once today's pack is opened.
export function syncPackButton() {
  rowDate = localDateKey();
  entry.disabled = !(host.locations.length && host.landmarks.length);
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

function packSlot(id, result, index) {
  const item = host.findLocation(id);
  let li;
  if (!result) {
    li = host.passportMysterySlot();
    li.setAttribute('aria-label', `Card ${index + 1}, not opened yet`);
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
  }
  li.classList.add('pack-slot');
  if (result) li.append(Object.assign(document.createElement('p'), { className: 'pack-slot-base', textContent: `+${(Number(result.base) || 0).toLocaleString()}` }));
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

// One screen for every moment: fresh, mid-pack and done (spec 2g). A record
// from an earlier date (a round finished after midnight) shows as it ended,
// with today's pack one tap away.
function renderPackScreen() {
  const current = currentPack();
  const summary = packSummary(current);
  const stale = pack.record.date !== localDateKey();
  const done = summary.played >= PACK_CARDS;
  els.slots.replaceChildren(...current.ids.map((id, i) => packSlot(id, current.results[i], i)));
  els.line.textContent = done ? doneLine(summary)
    : summary.played ? `${summary.played} of ${PACK_CARDS} opened` : 'Three postcards. Pin each one.';
  els.score.hidden = !done;
  els.score.textContent = `Pack score ${summary.score.toLocaleString()} / ${(PACK_CARDS * 1000).toLocaleString()}`;
  els.ready.hidden = !stale;
  els.primary.textContent = stale ? 'Open today’s pack' : done ? 'Done' : `Open card ${summary.nextCard + 1}`;
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
  return postcard;
}

export function packIsLastCard() {
  return pack.card >= PACK_CARDS - 1;
}

export function packNext() {
  showPackScreen();
}

export function initPack(main) {
  host = main;
  entry = document.getElementById('pack-button');
  const screen = document.getElementById('pack-screen');
  els = {
    screen,
    line: screen.querySelector('.pack-line'),
    slots: screen.querySelector('.pack-slots'),
    score: screen.querySelector('.pack-score'),
    ready: screen.querySelector('.pack-ready'),
    primary: screen.querySelector('.pack-primary'),
  };
  state.packScreenEl = screen;
  entry.disabled = true;
  entry.addEventListener('click', openPack);
  els.primary.addEventListener('click', primaryAction);
  // Midnight: the row picks up the new pack while home is showing.
  const rollover = () => { if (localDateKey() !== rowDate && !host.gameEls.start.hidden) syncPackButton(); };
  setInterval(rollover, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) rollover(); });
}
