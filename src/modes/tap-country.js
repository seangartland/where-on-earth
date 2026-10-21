// ---------------------------------------------------------------------------
// Borders mode: tap the named country (docs/country-outlines-plan-opus.md §3).
// Each round draws a random difficulty band. Per-band bags ensure no country
// repeats within a run; an exhausted draw falls back to another nonempty bag.
// One miss ends the run. It earns nothing in the Passport: there is no location
// to earn.
//
// Moved out of main.js in refactor Phase 4 (Survival: Tap the Country). It
// builds on survival.js; Country Blackout (blackout.js) builds on it and is
// reached only through the host passed to initTapCountry(), as is main.js.
// ---------------------------------------------------------------------------
import { formatKm, SHARE_URL } from '../core/format.js';
import { randomDifficultyBand, setRunResultsCopy, setRunResultsMode } from './survival.js';

let host = null;
const BORDERS_BEST_KEY = 'where-on-earth-countries-best-v1';
// scope/pool: Country Blackout's continent or world (see below); null in Tap the Country
export const borders = { active: false, key: null, band: null, round: 0, found: 0, missed: false, bags: new Map(), scope: null, pool: null };
export let bordersEntry = null;

export function bordersBest() {
  try {
    return Math.max(0, Number.parseInt(localStorage.getItem(BORDERS_BEST_KEY), 10) || 0);
  } catch {
    return 0;
  }
}

function saveBordersBest(value) {
  const best = Math.max(bordersBest(), value);
  host.safeSetItem(BORDERS_BEST_KEY, String(best));
  return best;
}

// A key's flag: its most common clue flag (Denmark's places include Greenland's).
// State keys have no clue flags of their own: the US scope's own flag stands in.
let countryFlags = null;
function countryFlag(key) {
  if (host.stateData && host.stateData.keys[key]) return host.COUNTRY_FLAGS['United States'] || '🇺🇸';
  if (!countryFlags) {
    const counts = new Map();
    for (const item of host.locations) {
      const tally = counts.get(item.country) || new Map();
      const flag = host.flagForLocation(item);
      tally.set(flag, (tally.get(flag) || 0) + 1);
      counts.set(item.country, tally);
    }
    countryFlags = new Map([...counts].map(([k, tally]) => [k, host.COUNTRY_FLAGS[k] || [...tally].sort((a, b) => b[1] - a[1])[0][0]]));
  }
  return countryFlags.get(key) || '🌍';
}

export function syncBordersEntry() {
  bordersEntry.disabled = !(host.countryData && host.countryBands && host.locations.length);
  host.blackoutEntry.disabled = bordersEntry.disabled || !host.stateData || !host.landAreas;
}

// Draw without replacement within the band. If the random band is exhausted,
// use another nonempty band; only exhausting every bag ends the run. Scope
// keys outside the country band system (the US scope's state keys) have no
// band of their own, so they default to band 1 and only ever enter the draw
// through the scope's pool, never affecting an unscoped (banded) run.
function bordersPick() {
  const { countryBands } = host;
  const drawnBand = randomDifficultyBand();
  for (let band = 1; band <= 10; band += 1) {
    if (!borders.bags.has(band)) {
      const universe = band === 1 && borders.pool ? new Set([...Object.keys(countryBands), ...borders.pool]) : Object.keys(countryBands);
      borders.bags.set(band, [...universe].filter((k) => (countryBands[k] ?? 1) === band && host.hasKey(k)
        && (!borders.pool || borders.pool.has(k))));
    }
  }
  const availableBands = [...borders.bags].filter(([, bag]) => bag.length).map(([band]) => band);
  if (!availableBands.length) return null;
  borders.band = borders.bags.get(drawnBand).length
    ? drawnBand
    : availableBands[Math.floor(Math.random() * availableBands.length)];
  const bag = borders.bags.get(borders.band);
  return bag.splice(Math.floor(Math.random() * bag.length), 1)[0];
}

function bordersGo() {
  borders.round += 1;
  borders.key = bordersPick();
  borders.missed = false;
  if (!borders.key) {
    borders.round -= 1;
    showBordersGameOver();
    return;
  }
  host.showRound();
}

export function startBorders(scope = null) {
  if (!host.countryData || !host.countryBands || !host.locations.length) return;
  host.expeditionRun.active = false;
  host.endless.active = false;
  host.survival.active = false;
  borders.active = true;
  borders.round = 0;
  borders.found = 0;
  borders.missed = false;
  borders.band = null;
  borders.bags.clear();
  borders.scope = scope;
  borders.pool = scope && new Set(scope.keys);
  setRunResultsMode(scope ? 'blackout' : 'borders');
  if (scope) {
    host.resetBlackout();
    host.startBlackoutTimer();
  }
  bordersGo();
}

// Static reveal (no flyover, rounds stay fast). Only the target's outline is
// drawn, never the tapped country's: the pin, route and pill say where the tap
// landed.
export function revealBorders(tap) {
  if (host.gameMode !== 'guess') return;
  const { gameEls, peekSlot, pins, correctPin, answerLine } = host;
  const key = borders.key;
  const displayName = host.keyName(key);
  const res = host.bordersHit(key, tap, 0);
  borders.missed = !res.hit;
  if (res.hit) {
    borders.found += 1;
    if (borders.scope) {
      host.saveBlackoutBest(borders.scope, borders.found);
      host.blackoutFill(key);
    } else saveBordersBest(borders.found);
  }
  const complete = host.blackoutComplete();
  if (complete) host.completeBlackoutTimer(borders.scope);
  gameEls.number.textContent = borders.scope ? host.blackoutProgressText() : `Streak ${borders.found}`;
  host.gameMode = 'reveal';
  window.__canGuess = false;
  const headerFrom = gameEls.header.offsetHeight;
  document.body.className = `game-reveal survival borders${borders.missed ? ' survival-miss' : ''}`;
  gameEls.hint.textContent = '';
  const km = Math.round(res.km);
  const toleranceHit = res.hit && res.near && res.km > 0;
  const name = `${displayName} ${countryFlag(key)}`;
  gameEls.revealName.textContent = name;
  gameEls.peekName.textContent = name;
  gameEls.distance.textContent = borders.missed || toleranceHit ? formatKm(km) : '';
  gameEls.fact.textContent = complete ? `Found ${displayName}. That's every ${borders.scope.unit} in ${borders.scope.place}.`
    : !borders.missed ? `Found ${displayName}.`
    : `You tapped ${res.tapped || 'the ocean'}, ${km.toLocaleString()} km from ${displayName}.`;
  host.setThumb(gameEls.thumb, null);
  host.setThumb(gameEls.peekThumb, null);
  peekSlot.hidden = true;
  gameEls.survivalStreak.textContent = borders.missed
    ? `Run ended · ${borders.found} survived`
    : `${borders.found} survived`;
  gameEls.score.textContent = borders.missed ? '✗ Run over' : `${borders.found}`;
  const pill = gameEls.revealPill;
  pill.classList.remove('safe', 'miss');
  pill.textContent = !borders.missed ? `✓ ${displayName}` : res.tapped ? `✗ That's ${res.tapped}` : '✗ Ocean';
  pill.classList.add(borders.missed ? 'miss' : 'safe');
  gameEls.next.textContent = borders.missed || complete ? 'See run' : 'Keep going';
  if (headerFrom > host.REVEAL_HEADER_H) host.collapseRoundHeader(headerFrom);

  const a = host.latLngToVec3(tap.lat, tap.lng);
  const pin = toleranceHit ? host.latLngToVec3(res.near.lat, res.near.lng) : a;
  if (host.activePin >= 0) pins[host.activePin].drop(pin);
  if (borders.missed) {
    // the route runs from the tap to the nearest point of the target's border
    const { b } = host.buildAnswerPath(tap, res.near);
    correctPin.drop(b);
    answerLine.visible = true;
    host.frameRevealPoints(a, b);
    host.showCountryOutline(key, res.near, true);
    host.startRevealBeat(a, b, true);
  } else {
    const box = res.ring && res.ring.box;
    const anchor = res.near || (box ? { lng: (box[0] + box[2]) / 2, lat: (box[1] + box[3]) / 2 } : tap);
    const b = host.latLngToVec3(anchor.lat, anchor.lng);
    host.frameRevealPoints(a, b);
    host.showCountryOutline(key, tap, true);
    host.startRevealBeat(a, b, false);
  }
}

function showBordersGameOver() {
  if (borders.scope) {
    host.showBlackoutGameOver();
    return;
  }
  const { gameEls } = host;
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'survival-results';
  window.__canGuess = false;
  gameEls.survivalResults.hidden = false;
  document.body.className = 'game-results survival borders';
  const count = borders.found;
  const best = saveBordersBest(count);
  setRunResultsCopy('Survival: Tap the Country run over', 'One miss ends the run.', 'Found');
  gameEls.survivalResultTitle.textContent = `${count} ${count === 1 ? 'country' : 'countries'} found`;
  gameEls.survivalFinalStreak.textContent = count.toLocaleString();
  gameEls.survivalBestStreak.textContent = best.toLocaleString();
  gameEls.survivalShare.textContent = 'Share result';
  gameEls.survivalShareStatus.textContent = '';
}

export function bordersShareText() {
  const found = borders.found;
  return host.formatGameShare({
    title: 'Survival: Tap the Country',
    headline: `${found.toLocaleString()} ${found === 1 ? 'country' : 'countries'} found`,
    streak: bordersBest(),
    missed: borders.missed ? borders.key : null,
    url: `${SHARE_URL}?mode=tap-country`,
  });
}

// The round screen's Tap the Country variant (main.js showRound and nextRound
// call these while borders.active).
export function bordersRoundHeader() {
  const { gameEls } = host;
  // Survival's restyle; the clue is the country name and flag
  document.body.classList.add('survival', 'borders');
  gameEls.number.textContent = borders.scope ? host.blackoutProgressText() : `Streak ${borders.found}`;
  gameEls.weight.style.display = 'none';
  gameEls.survivalStreak.textContent = borders.round === 1
    ? 'One miss ends the run · Tap the globe to place your pin'
    : '';
  gameEls.dailyDate.hidden = true;
}

export function bordersClue() {
  const name = document.createElement('strong');
  name.textContent = host.keyName(borders.key);
  host.gameEls.clue.replaceChildren('Tap ', name, ` ${countryFlag(borders.key)}`);
}

export function bordersNext() {
  if (borders.missed) showBordersGameOver();
  else bordersGo();
}

// Section setup, run from main.js where the Borders section used to start.
export function initTapCountry(main) {
  host = main;
  bordersEntry = document.getElementById('borders-button');
  bordersEntry.addEventListener('click', () => startBorders());
  Promise.all([host.countriesP, host.countryBandsP]).then(syncBordersEntry, () => {});
  Promise.all([host.statesP, host.landAreasP]).then(syncBordersEntry, () => {});
}
