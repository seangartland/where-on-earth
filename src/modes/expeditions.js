// ---------------------------------------------------------------------------
// Expeditions: player-selected, ordered seven-stop challenges. Progress is
// independent for every theme and only advances while that expedition is active.
//
// Moved out of main.js in refactor Phase 4. The picker's styles (shared with
// the Blackout picker and the Survival hub) stay injected from main.js where
// they always were. main.js reaches this module, and it reaches main.js, only
// through initExpeditions(host) at the spot the section used to run.
// ---------------------------------------------------------------------------
import { isPlayableLocation } from '../daily.js';

let host = null;
let expeditions = [];
let expeditionState = { progress: {} };
export const expeditionRun = { active: false, expedition: null, item: null, index: 0 };

export let expeditionPicker = null;
let expeditionList = null;

function loadExpeditionState() {
  const saved = host.readJSON(host.EXPEDITION_KEY);
  expeditionState = saved && saved.progress && typeof saved.progress === 'object' ? saved : { progress: {} };
}

function expeditionProgress(expedition) {
  const saved = expeditionState.progress[expedition.id] || {};
  const total = expeditionLocations(expedition).length;
  const completed = host.clamp(Number(saved.completed) || 0, 0, total);
  return { completed, complete: completed >= total };
}

function expeditionLocations(expedition) {
  return expedition.locationIds
    .map((id) => host.findLocation(id))
    .filter(isPlayableLocation);
}

function expeditionLocation(expedition, index) {
  return expeditionLocations(expedition)[index];
}

// Stops resolve against both the cities and the landmarks file, so the entry
// stays disabled until both have loaded (a half-loaded list would skew progress).
export function updateExpeditionEntry() {
  const ready = Boolean(host.locations.length && host.landmarks
    && expeditions.some((expedition) => expeditionLocations(expedition).length));
  // The button starts hidden in the markup so it never shows before it can be
  // played; readiness is also what reveals it (previously nothing un-hid it,
  // so the mode was unreachable from the home screen).
  host.gameEls.expeditionsEntry.hidden = !ready;
  host.gameEls.expeditionsEntry.disabled = !ready;
}

export function completeExpeditionRound() {
  const expedition = expeditionRun.expedition;
  const progress = expeditionProgress(expedition);
  progress.completed = Math.max(progress.completed, expeditionRun.index + 1);
  progress.complete = progress.completed >= expeditionLocations(expedition).length;
  expeditionState.progress[expedition.id] = progress;
  host.writeJSON(host.EXPEDITION_KEY, expeditionState);
}

function renderExpeditionPicker(highlightId = '') {
  expeditionList.replaceChildren(...expeditions.filter((expedition) => expeditionLocations(expedition).length).map((expedition) => {
    const progress = expeditionProgress(expedition);
    const total = expeditionLocations(expedition).length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'expedition-choice';
    button.dataset.expeditionId = expedition.id;
    if (expedition.id === highlightId) button.dataset.justCompleted = 'true';
    button.innerHTML = `<span class="emoji"></span><span><strong></strong><small></small></span><span class="badge"></span>`;
    button.querySelector('.emoji').textContent = expedition.emoji || '🧭';
    button.querySelector('strong').textContent = expedition.theme;
    button.querySelector('small').textContent = progress.complete ? `${total}/${total} completed · Replay` : `${progress.completed}/${total} completed`;
    button.querySelector('.badge').textContent = progress.complete ? '🏅' : '›';
    return button;
  }));
}

function showExpeditionPicker(highlightId = '') {
  expeditionRun.active = false;
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'expeditions';
  window.__canGuess = false;
  renderExpeditionPicker(highlightId);
  expeditionPicker.hidden = false;
}

function startExpedition(id) {
  const expedition = expeditions.find((item) => item.id === id);
  if (!expedition) return;
  const progress = expeditionProgress(expedition);
  const index = progress.complete ? 0 : progress.completed;
  const item = expeditionLocation(expedition, index);
  if (!item) return;
  expeditionPicker.hidden = true;
  host.survival.active = false;
  host.endless.active = false;
  host.borders.active = false;
  expeditionRun.active = true;
  expeditionRun.expedition = expedition;
  expeditionRun.index = index;
  expeditionRun.item = item;
  host.runHaul.length = 0;
  host.showRound();
}

// assets/expeditions.json arrived (main.js starts the fetch with the other loads).
export function expeditionsLoaded(data) {
  expeditions = Array.isArray(data) ? data : [];
  loadExpeditionState();
  updateExpeditionEntry();
}

// The round screen's Expeditions variant (main.js showRound, revealGuess and
// nextRound call these while expeditionRun.active).
export function expeditionRoundHeader() {
  const { gameEls } = host;
  document.body.classList.add('expedition-mode');
  const total = expeditionLocations(expeditionRun.expedition).length;
  gameEls.number.textContent = `${expeditionRun.expedition.emoji || '🧭'} ${expeditionRun.expedition.theme} · ${expeditionRun.index + 1}/${total}`;
  gameEls.weight.style.display = 'none';
  gameEls.dailyDate.hidden = true;
}

export function expeditionRevealCard(pill) {
  const { gameEls } = host;
  const total = expeditionLocations(expeditionRun.expedition).length;
  const finished = expeditionRun.index + 1 >= total;
  gameEls.score.textContent = `${expeditionRun.index + 1}/${total}`;
  pill.textContent = finished ? '🏅 Expedition complete!' : `${expeditionRun.index + 1}/${total} complete`;
  pill.classList.add('safe');
  gameEls.next.textContent = finished ? 'See badge' : 'Next stop';
}

export function expeditionNext() {
  if (expeditionRun.index + 1 >= expeditionLocations(expeditionRun.expedition).length) {
    const { id } = expeditionRun.expedition;
    host.showRunHaul(() => showExpeditionPicker(id), 'See badge');
  }
  else {
    expeditionRun.index += 1;
    expeditionRun.item = expeditionLocation(expeditionRun.expedition, expeditionRun.index);
    host.showRound();
  }
}

// Section setup, run from main.js right after the picker styles are injected.
export function initExpeditions(main) {
  host = main;
  expeditionPicker = document.createElement('section');
  expeditionPicker.className = 'expedition-picker';
  expeditionPicker.hidden = true;
  expeditionPicker.innerHTML = `<div class="expedition-panel" role="dialog" aria-modal="true" aria-labelledby="expedition-heading">
  <h2 id="expedition-heading">Choose an expedition</h2>
  <p>Hand-picked stops, played in order.</p>
  <div class="expedition-list"></div>
</div>`;
  document.body.appendChild(expeditionPicker);
  expeditionPicker.querySelector('.expedition-panel').prepend(host.createHomeButton());
  expeditionList = expeditionPicker.querySelector('.expedition-list');

  host.gameEls.expeditionsEntry.addEventListener('click', () => showExpeditionPicker());
  expeditionPicker.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-expedition-id]');
    if (choice) startExpedition(choice.dataset.expeditionId);
    else if (event.target === expeditionPicker) host.goHome();
  });
}
