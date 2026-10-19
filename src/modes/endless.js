// ---------------------------------------------------------------------------
// Endless mode: unscored random locations from the full pool
//
// QUARANTINED (refactor Phase 4): Endless is disabled by Sean's decision (its
// home button is hidden in index.html) and kept intact here, not deleted and
// not re-enabled. main.js reaches it, and it reaches main.js, only through
// initEndless(host) at the spot the section used to run.
// ---------------------------------------------------------------------------
import { isLandmark, isPlayableLocation } from '../daily.js';

let host = null;
export const endless = { active: false, item: null, bag: [], count: 0 };

// Endless reuses the survival mode restyle (index.html).
// Endless button is now in HTML (mode-buttons div), just get the reference
export let endlessEls = null;

// Pure random: every guess picks from all playable image-backed locations.
// Repeats are expected; dailies are the way to see new places.
function endlessPick() {
  const all = host.locations.filter((item) => isPlayableLocation(item) && !isLandmark(item));
  // Keep track of recent picks to avoid repeats (last 50)
  if (!endless.recent) endless.recent = [];
  let pick = all[Math.floor(Math.random() * all.length)];
  let guard = 0;
  while (endless.recent.includes(pick.id) && guard++ < 20) {
    pick = all[Math.floor(Math.random() * all.length)];
  }
  endless.recent.push(pick.id);
  if (endless.recent.length > 50) endless.recent.shift();
  endless.item = pick;
  return pick;
}

function endlessGo(item) {
  if (!item) return;
  host.expeditionRun.active = false;
  host.survival.active = false;
  host.borders.active = false;
  endless.active = true;
  endless.item = item;
  endless.count += 1;
  host.showRound();
}

export function endlessNext() {
  endlessGo(endlessPick());
}

// The round screen's Endless variant (main.js showRound calls this while
// endless.active).
export function endlessRoundHeader() {
  const { gameEls } = host;
  document.body.classList.add('endless');
  gameEls.number.textContent = `Endless · #${endless.count}`;
  gameEls.weight.style.display = 'none';
  gameEls.dailyDate.hidden = true;
}

// Section setup, run from main.js where the Endless section used to start.
export function initEndless(main) {
  host = main;
  const endlessEntry = document.getElementById('endless-button');
  endlessEls = { entry: endlessEntry };
  // The home button was removed (cleanup C4); the mode itself stays quarantined.
  endlessEntry?.addEventListener('click', () => {
    if (!host.locations.length) return;
    endless.count = 0;
    endlessNext();
  });
}
