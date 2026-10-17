// ---------------------------------------------------------------------------
// Country Blackout: Tap the Country's run (borders above, with borders.scope
// set) over one scope, the whole world or one continent. Each found country
// drops its satellite imagery for the classic map, so the globe fills in as
// the run goes. The mask is an equirectangular canvas on the globe's UVs, laid
// out like the land texture: white where found. The globe shader scales the
// satellite mix by (1 - mask), so it holds through rotation, zoom and the
// detail insets, and it never draws a border.
//
// Moved out of main.js in refactor Phase 4, mask canvas and scope picker
// included. It builds on tap-country.js (the run) and survival.js (the
// run-over screen); main.js reaches it, and it reaches main.js, only through
// initBlackout(host) at the spot the section used to run.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { SHARE_URL } from '../core/format.js';
import { runResultsMode, setRunResultsCopy } from './survival.js';
import { borders, startBorders } from './tap-country.js';

let host = null;
const BLACKOUT_BEST_KEY = 'where-on-earth-blackout-best-v1';
const BLACKOUT_MIN_COUNTRIES = 10; // smaller scopes aren't a real run
const BLACKOUT_EMOJI = { Africa: '🌍', Europe: '🌍', Asia: '🌏', Oceania: '🌏', 'North America': '🌎', 'South America': '🌎' };
export let blackoutEntry = null;
let blackoutTex = null;

// Scopes on the game's own continent assignments (the Passport's countryIndex).
function blackoutScopes() {
  const { countryBands, countryData, countryIndex } = host;
  const keys = Object.keys(countryBands).filter((k) => countryData.keys[k]);
  const scopes = [{ id: 'world', label: 'Full World', place: 'the world', done: 'World', emoji: '🌐', keys }];
  for (const name of host.CONTINENT_ORDER) {
    const inScope = keys.filter((k) => countryIndex && countryIndex.get(k)?.continent === name);
    if (inScope.length < BLACKOUT_MIN_COUNTRIES) continue;
    scopes.push({ id: name.toLowerCase().replace(/ /g, '-'), label: name, place: name, done: name, emoji: BLACKOUT_EMOJI[name] || '🌐', keys: inScope });
  }
  return scopes;
}

function blackoutBest(scope) {
  try {
    return Math.max(0, Number.parseInt(localStorage.getItem(`${BLACKOUT_BEST_KEY}-${scope.id}`), 10) || 0);
  } catch {
    return 0;
  }
}

export function saveBlackoutBest(scope, value) {
  const best = Math.max(blackoutBest(scope), value);
  host.safeSetItem(`${BLACKOUT_BEST_KEY}-${scope.id}`, String(best));
  return best;
}

export const blackoutComplete = () => Boolean(borders.scope && !borders.missed && borders.found === borders.scope.keys.length);
export const blackoutProgressText = () => `Streak ${borders.found} · ${borders.found}/${borders.scope.keys.length} found`;

export function resetBlackout() {
  const { renderer } = host;
  if (!blackoutTex) {
    const W = renderer.capabilities.maxTextureSize >= 4096 ? 4096 : 2048; // as the land texture
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = W / 2;
    blackoutTex = new THREE.CanvasTexture(cv);
    blackoutTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    blackoutTex.minFilter = THREE.LinearMipmapLinearFilter;
    blackoutTex.generateMipmaps = true;
    host.globeMat.uniforms.uBlackout.value = blackoutTex;
  }
  const cv = blackoutTex.image;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cv.width, cv.height);
  blackoutTex.needsUpdate = true;
}

// Paint a found country into the mask: every ring of its units, holes kept
// (evenodd), plus a thin stroke so microstates still show as a dot.
export function blackoutFill(key) {
  const geom = host.countryGeom(key);
  if (!geom || !blackoutTex) return;
  const cv = blackoutTex.image;
  const ctx = cv.getContext('2d');
  const path = new Path2D();
  for (const ring of geom.rings) host.addToPath(path, host.unwrap(ring.pts), cv.width, cv.height, true);
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  ctx.fill(path, 'evenodd');
  ctx.lineJoin = 'round';
  ctx.lineWidth = host.ISLAND_BLOB_TEXELS * (cv.width / 4096);
  ctx.stroke(path);
  blackoutTex.needsUpdate = true;
}

// The filled map shows for the run and its result screen, never elsewhere.
export function syncBlackoutMask() {
  const on = runResultsMode === 'blackout' && (borders.active || host.gameMode === 'survival-results');
  host.globeMat.uniforms.uBlackoutMix.value = on ? 1 : 0;
}

// Scope picker: the Expeditions picker's shared panel and choice styles.
export let blackoutPicker = null;
let blackoutList = null;
let blackoutScopeList = [];

export function showBlackoutPicker() {
  if (!host.countryData || !host.countryBands || !host.locations.length) return;
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'blackout-scope';
  window.__canGuess = false;
  blackoutScopeList = blackoutScopes();
  blackoutList.replaceChildren(...blackoutScopeList.map((scope) => {
    const total = scope.keys.length;
    const best = blackoutBest(scope);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'expedition-choice';
    button.dataset.blackoutScope = scope.id;
    button.innerHTML = `<span class="emoji"></span><span><strong></strong><small></small></span><span class="badge"></span>`;
    button.querySelector('.emoji').textContent = scope.emoji;
    button.querySelector('strong').textContent = scope.label;
    button.querySelector('small').textContent = best >= total ? `${total}/${total} found · Replay`
      : best ? `${total} countries · Best ${best}/${total}` : `${total} countries`;
    button.querySelector('.badge').textContent = best >= total ? '🏅' : '›';
    return button;
  }));
  blackoutPicker.hidden = false;
}

// The Survival hub's Blackout row (survival.js showSurvivalHub).
export function blackoutBestSummary() {
  if (blackoutEntry.disabled) return '';
  let top = null;
  for (const scope of blackoutScopes()) {
    const best = Math.min(blackoutBest(scope), scope.keys.length);
    if (best && (!top || best / scope.keys.length > top.best / top.total)) top = { label: scope.label, best, total: scope.keys.length };
  }
  return top ? `Best ${top.label} ${top.best}/${top.total}` : '';
}

export function showBlackoutGameOver() {
  const { gameEls } = host;
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'survival-results';
  window.__canGuess = false;
  gameEls.survivalResults.hidden = false;
  const { scope, found } = borders;
  const total = scope.keys.length;
  const complete = blackoutComplete();
  document.body.className = `game-results survival borders blackout${complete ? ' blackout-complete' : ''}`;
  const best = saveBlackoutBest(scope, found);
  if (complete) {
    setRunResultsCopy(`Country Blackout: ${scope.label}`, `Every country in ${scope.place}, found in one run without a miss.`, 'Found');
    gameEls.survivalResultTitle.textContent = `🏅 ${scope.done} complete`;
  } else {
    setRunResultsCopy(`Country Blackout: ${scope.label}`, 'One miss ends the run.', 'Found');
    gameEls.survivalResultTitle.textContent = `${found} of ${total} ${total === 1 ? 'country' : 'countries'} found`;
  }
  gameEls.survivalFinalStreak.textContent = `${found}/${total}`;
  gameEls.survivalBestStreak.textContent = `${best}/${total}`;
  gameEls.survivalShare.textContent = 'Share result';
  gameEls.survivalShareStatus.textContent = '';
}

// Only found countries count: the run-ending miss is named, never counted.
export function blackoutShareText() {
  const { scope, found } = borders;
  const total = scope.keys.length;
  return host.formatGameShare({
    title: `Country Blackout: ${scope.label}`,
    titleSep: ' · ',
    headline: blackoutComplete() ? `${scope.done} complete: all ${total} countries found` : `${found} of ${total} countries found`,
    streak: blackoutBest(scope),
    streakLabel: 'Best',
    missed: borders.missed ? borders.key : null,
    url: `${SHARE_URL}?mode=blackout`,
  });
}

// Section setup, run from main.js where the Blackout section used to start.
export function initBlackout(main) {
  host = main;
  blackoutEntry = document.getElementById('blackout-button');
  blackoutPicker = document.createElement('section');
  blackoutPicker.className = 'expedition-picker';
  blackoutPicker.hidden = true;
  blackoutPicker.innerHTML = `<div class="expedition-panel" role="dialog" aria-modal="true" aria-labelledby="blackout-heading">
  <h2 id="blackout-heading">Country Blackout</h2>
  <p>Every country you find turns blue. One miss ends the run.</p>
  <div class="expedition-list"></div>
</div>`;
  document.body.appendChild(blackoutPicker);
  blackoutPicker.querySelector('.expedition-panel').prepend(host.createHomeButton());
  blackoutList = blackoutPicker.querySelector('.expedition-list');

  blackoutEntry.addEventListener('click', showBlackoutPicker);
  blackoutPicker.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-blackout-scope]');
    if (choice) {
      const scope = blackoutScopeList.find((s) => s.id === choice.dataset.blackoutScope);
      if (!scope) return;
      blackoutPicker.hidden = true;
      startBorders(scope);
    } else if (event.target === blackoutPicker) host.goHome();
  });
}
