// ---------------------------------------------------------------------------
// PvP match play: the shared round screen, globe and Lock in flow. Rounds start
// on the server; the countdown runs on the server deadline mapped onto the
// monotonic clock (deadlineAt - serverNow), so device clock skew never matters.
// The round screen, game state and reveal stay in main.js; this module adapts
// them to PvP through the interface main.js passes to initPvpPlay.
// ---------------------------------------------------------------------------
import {
  pvpMatchEntry, pvpGroupEntry, savePvp, pvpMessage,
  pvpGetMatch, pvpGetGroup, pvpStartMatchRound, pvpStartGroupRound, pvpSubmitMatchGuess, pvpSubmitGroupGuess, pvpGetRoundResults,
} from './api.js';
import { pvpNav, pvpEl, pvpUi, pvpSetStatus, pvpOpponentLabel } from './home.js';
import { pvpView, showPvpMatch } from './h2h.js';
import { pvpGroupView, showPvpGroup } from './group.js';

let host = null;
let pvp = null; // main.js's PvP round state: active, matchId, round, item, ...
let gameEls = null;
let pvpVs = null;
let pvpRoundStandings = null;

export function initPvpPlay(main) {
  host = main;
  pvp = main.pvp;
  gameEls = main.gameEls;
  pvpVs = document.createElement('span');
  pvpVs.className = 'pvp-vs';
  gameEls.peekBar.querySelector('.peek-text').append(pvpVs);
  pvpRoundStandings = document.createElement('div');
  pvpRoundStandings.className = 'pvp-standings';
  pvpRoundStandings.hidden = true;
  gameEls.peekBar.append(pvpRoundStandings);
}

function pvpSubmissionId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function pvpStopTimers() {
  clearInterval(pvp.timer);
  clearTimeout(pvp.pollTimer);
  clearTimeout(pvp.resolveTimer);
  pvp.timer = pvp.pollTimer = pvp.resolveTimer = 0;
  gameEls.weight.style.color = '';
}

// Leaving PvP play: stop timers and polling; the server keeps every deadline.
export function pvpLeave() {
  pvpStopTimers();
  pvp.active = false;
  pvpRoundStandings.hidden = true;
  pvpRoundStandings.replaceChildren();
}

async function pvpPlay(round, matchId = pvpView.matchId) {
  if (pvpUi.busy) return;
  pvpUi.busy = true;
  if (host.gameMode === 'reveal') {
    gameEls.next.disabled = true;
    gameEls.next.textContent = 'Starting...';
  } else pvpSetStatus('Starting round...');
  try {
    const start = await pvpStartMatchRound(matchId, round);
    pvpBeginRound(matchId, start);
  } catch (error) {
    const stale = error.code === 'ROUND_ALREADY_RESOLVED' || error.code === 'ROUND_SEQUENCE';
    showPvpMatch(matchId);
    pvpSetStatus(stale ? 'That round has already finished. Here is the latest.' : pvpMessage(error), !stale);
  } finally {
    pvpUi.busy = false;
    gameEls.next.disabled = false;
  }
}

function pvpBeginRound(matchId, start) {
  pvpLeave();
  const now = performance.now();
  Object.assign(pvp, {
    active: true,
    group: false,
    matchId,
    challengeId: null,
    round: start.round,
    item: { ...start.location }, // id, short, clue: no photo before the guess
    state: pvpUi.states.get(matchId) || null,
    deadline: now + (start.deadlineAt - start.serverNow),
    acceptUntil: now + (start.acceptUntil - start.serverNow),
    submissionId: pvpSubmissionId(),
    submitting: false,
    timedOut: false,
    reveal: null,
    opponent: null,
    result: null,
    recordVisit: false,
  });
  host.showRound();
  pvpTick();
  pvp.timer = setInterval(pvpTick, 200);
}

async function pvpPlayGroup(round, challengeId = pvpGroupView.challengeId) {
  if (pvpUi.busy) return;
  pvpUi.busy = true;
  try {
    const start = await pvpStartGroupRound(challengeId, round);
    pvpBeginGroupRound(challengeId, start);
  } catch (error) {
    showPvpGroup(challengeId);
    pvpSetStatus(pvpMessage(error), true);
  } finally { pvpUi.busy = false; gameEls.next.disabled = false; }
}

function pvpBeginGroupRound(challengeId, start) {
  pvpBeginRound(challengeId, start);
  Object.assign(pvp, { group: true, challengeId, matchId: null, state: pvpGroupView.state });
}

function pvpTick() {
  if (!pvp.active || host.gameMode !== 'guess') return pvpStopTimers();
  const left = pvp.deadline - performance.now();
  gameEls.weight.textContent = left > 0 ? `${Math.ceil(left / 1000)}s left` : 'Time is up';
  gameEls.weight.style.color = left <= 5000 ? '#ffc76a' : '';
  if (left > 0 || pvp.timedOut) return;
  // Visible zero: no new guesses. A lock-in already in flight may still land in
  // the server's grace window; otherwise read the server-made timeout.
  pvp.timedOut = true;
  clearInterval(pvp.timer);
  if (pvp.submitting) return;
  window.__canGuess = false;
  host.clearPendingGuess();
  host.setGuessHint('Time is up', true);
  pvp.resolveTimer = setTimeout(pvpResolveFromState, Math.max(0, pvp.acceptUntil - performance.now()) + 600);
}

export async function pvpSubmit(guess) {
  if (!pvp.active || host.gameMode !== 'guess' || pvp.submitting) return;
  if (performance.now() > pvp.acceptUntil) return;
  pvp.submitting = true;
  window.__canGuess = false;
  host.setGuessHint('Locking in...');
  const { matchId, challengeId, round } = pvp;
  try {
    const res = pvp.group ? await pvpSubmitGroupGuess(challengeId, round, pvp.submissionId, guess) : await pvpSubmitMatchGuess(matchId, round, pvp.submissionId, guess);
    if (!pvp.active || (pvp.group ? pvp.challengeId !== challengeId : pvp.matchId !== matchId) || pvp.round !== round) return;
    pvpShowResult({ round, answer: res.answer, viewerResult: { outcome: 'SUBMITTED', ...res.viewerResult }, opponentResult: res.opponentResult }, res.result || null);
  } catch (error) {
    if (!pvp.active || (pvp.group ? pvp.challengeId !== challengeId : pvp.matchId !== matchId) || pvp.round !== round) return;
    if (error.code === 'ROUND_LATE' || error.code === 'ROUND_ALREADY_RESOLVED') {
      pvpResolveFromState();
      return;
    }
    if (pvp.timedOut || performance.now() > pvp.acceptUntil) {
      pvpResolveFromState();
      return;
    }
    // Same submissionId on retry, so a request that did land is not doubled.
    window.__canGuess = true;
    host.pendingGuess = guess;
    host.showLockButton();
    host.setGuessHint(pvpMessage(error), true);
  } finally {
    pvp.submitting = false;
  }
}

// A round row (submission response or state read) onto the existing reveal.
function pvpShowResult(row, result) {
  pvpStopTimers();
  const local = host.locations.find((item) => item.id === row.answer.id);
  pvp.item = { ...local, ...row.answer }; // server coordinates win
  pvp.reveal = row.viewerResult;
  pvp.opponent = row.opponentResult || null;
  pvp.result = result;
  const entry = pvp.group ? pvpGroupEntry(pvp.challengeId) : pvpMatchEntry(pvp.matchId);
  const fresh = Boolean(entry) && !(entry.visited || []).includes(row.round);
  if (fresh) {
    entry.visited = [...(entry.visited || []), row.round];
    savePvp();
  }
  if (row.viewerResult.outcome === 'TIMEOUT') host.pvpRevealTimeout(pvp.item);
  else {
    pvp.recordVisit = fresh;
    host.revealGuess(row.viewerResult.guess, host.gameMode !== 'guess');
    pvp.recordVisit = false;
  }
  if (pvp.group) pvpLoadRoundStandings();
  else pvpPollOpponent();
}

async function pvpLoadRoundStandings() {
  const { challengeId, round } = pvp;
  try {
    const rows = await pvpGetRoundResults(challengeId, round);
    if (!pvp.active || !pvp.group || pvp.challengeId !== challengeId || pvp.round !== round) return;
    const all = [{ displayName: 'You', result: pvp.reveal }, ...rows];
    pvpRoundStandings.replaceChildren(pvpEl('p', { className: 'eyebrow', text: `Round ${round} standings` }), ...all.sort((a, b) => (b.result?.score || 0) - (a.result?.score || 0)).map((row) => pvpEl('div', { className: 'pvp-round-row' },
      pvpEl('span', { text: row.displayName }),
      pvpEl('span', { text: row.result?.outcome === 'TIMEOUT' ? 'Out of time · 0' : `${row.result.distanceKm.toLocaleString()} km · ${row.result.score}` }),
    )));
    pvpRoundStandings.hidden = false;
  } catch (error) {
    if (error.code !== 'ROUND_NOT_UNLOCKED') console.error('[pvp] round standings', error);
  }
}

export function pvpRenderVs() {
  if (pvp.group) { pvpVs.textContent = 'Open Challenge'; return; }
  const name = pvpOpponentLabel(pvp.state);
  const o = pvp.opponent;
  if (o) {
    pvpVs.textContent = o.outcome === 'TIMEOUT' ? `${name || 'Opponent'}: out of time, 0`
      : `${name || 'Opponent'}: +${o.score} · ${o.distanceKm.toLocaleString()} km`;
  } else pvpVs.textContent = name ? `Waiting for ${name} to play this round` : 'Waiting for someone to join';
}

// While the reveal is open and the opponent has not played this round yet,
// re-read the match until the comparison appears or the match ends.
function pvpPollOpponent() {
  clearTimeout(pvp.pollTimer);
  if (!pvp.active || pvp.opponent || pvp.result) return;
  const { matchId, round } = pvp;
  pvp.pollTimer = setTimeout(async () => {
    if (document.hidden) { pvpPollOpponent(); return; }
    try {
      const state = await pvpGetMatch(matchId);
      if (!pvp.active || pvp.matchId !== matchId || pvp.round !== round || host.gameMode !== 'reveal') return;
      pvp.state = state;
      pvpUi.states.set(matchId, state);
      pvp.opponent = state.rounds.find((r) => r.round === round)?.opponentResult || null;
      pvp.result = state.result;
      pvpRenderVs();
      if (pvp.result) gameEls.next.textContent = 'Results';
      if (['EXPIRED', 'ABANDONED'].includes(state.status)) return;
    } catch { /* offline for a moment: keep waiting */ }
    pvpPollOpponent();
  }, 5000);
}

// After the visible zero (or a refused late lock-in): the state read
// materializes the server timeout, then the round reveals from it.
async function pvpResolveFromState(attempt = 0) {
  if (!pvp.active) return;
  const { matchId, challengeId, round } = pvp;
  try {
    const state = await (pvp.group ? pvpGetGroup(challengeId) : pvpGetMatch(matchId));
    if (!pvp.active || (pvp.group ? pvp.challengeId !== challengeId : pvp.matchId !== matchId) || pvp.round !== round || host.gameMode !== 'guess') return;
    pvp.state = state;
    pvpUi.states.set(matchId, state);
    const row = state.rounds.find((r) => r.round === round);
    if (row?.viewerResult) {
      pvpShowResult(row, state.result);
      return;
    }
    if (['COMPLETED', 'EXPIRED', 'ABANDONED'].includes(state.status)) {
      if (pvp.group) showPvpGroup(challengeId); else showPvpMatch(matchId);
      return;
    }
  } catch (error) {
    if (attempt >= 4) {
      if (pvp.group) showPvpGroup(challengeId); else showPvpMatch(matchId);
      pvpSetStatus(pvpMessage(error), true);
      return;
    }
  }
  if (attempt >= 4) pvp.group ? showPvpGroup(challengeId) : showPvpMatch(matchId);
  else pvp.resolveTimer = setTimeout(() => pvpResolveFromState(attempt + 1), 1500);
}

export function pvpNext() {
  const { matchId, challengeId, round } = pvp;
  if (pvp.group) {
    if (round >= 5) showPvpGroup(challengeId);
    else pvpPlayGroup(round + 1, challengeId);
  } else if (pvp.result || round >= 5) showPvpMatch(matchId);
  else pvpPlay(round + 1, matchId);
}

Object.assign(pvpNav, { pvpLeave, pvpPlay, pvpPlayGroup });
