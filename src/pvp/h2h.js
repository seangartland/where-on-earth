// ---------------------------------------------------------------------------
// PvP head to head: the match screen (status, totals, the round-by-round
// comparison, invite sharing, pair record and the next action), rematches,
// and joining a friend's challenge from a link or code.
// ---------------------------------------------------------------------------
import {
  PvpError, PVP_MESSAGES, pvpStore, savePvp, pvpHasIdentity, pvpMatchEntry, pvpRememberMatch, pvpMessage, pvpEnsureIdentity,
  pvpGetMatch, pvpRequestRematch, pvpJoinMatch, pvpInspectInvitation, pvpGetRecord,
} from './api.js';
import {
  pvpNav, pvpEl, pvpHome, pvpHomeBody, pvpUi, pvpSetStatus, pvpNameBlock, pvpForgetLinkInvite,
  pvpStatusKey, pvpOpponent, pvpMe, pvpOpponentLabel, showPvpHome,
} from './home.js';
import { SHARE_URL } from '../core/format.js';

let host = null;

// Match screen: status, totals, the round-by-round comparison, invite sharing,
// pair record and the next action. The results screen's card and breakdown list.
export let pvpMatchScreen = null;
let pvpMatchBody = null;
export const pvpView = { matchId: null, state: null, record: undefined, loadError: '' };

export function initPvpH2h(main) {
  host = main;
  pvpMatchScreen = document.createElement('section');
  pvpMatchScreen.className = 'screen results-screen';
  pvpMatchScreen.hidden = true;
  pvpMatchScreen.innerHTML = '<div class="results-card glass pvp-match-card"><button class="home-nav-btn finished-home-nav" type="button" aria-label="Go home">×</button><div class="pvp-match-body"></div></div>';
  host.gameEls.survivalResults.after(pvpMatchScreen);
  pvpMatchBody = pvpMatchScreen.querySelector('.pvp-match-body');
  host.pvpScreenEls.push(pvpMatchScreen);
}

function pvpRoundPoints(result) {
  if (!result) return '?';
  return result.score.toLocaleString();
}

function pvpBreakdown(state) {
  const rows = (state.rounds || []).map((round) => {
    const answer = round.answer;
    let place = 'Not played yet';
    if (round.viewerResult) place = `${answer?.short || answer?.clue || `Round ${round.round}`}${round.viewerResult.outcome === 'TIMEOUT' ? ' (timed out)' : ''}`;
    else if (round.state === 'STARTED') place = 'In progress';
    return pvpEl('li', {},
      pvpEl('b', { text: String(round.round) }),
      pvpEl('span', { className: 'place', text: place }),
      round.viewerResult ? pvpEl('span', { className: 'result-metrics' },
        pvpEl('span', { className: 'points', text: pvpRoundPoints(round.viewerResult) }),
        pvpEl('span', { className: 'distance', text: `vs ${pvpRoundPoints(round.opponentResult)}` })) : null,
    );
  });
  if (!rows.length) return null;
  return pvpEl('section', { className: 'round-breakdown' },
    pvpEl('h2', { text: 'Round by round · You vs them' }),
    pvpEl('ol', { className: 'pvp-breakdown' }, rows));
}

function pvpRecordLine() {
  const data = pvpView.record;
  if (data === undefined) return null;
  const record = data?.record;
  const text = !record ? 'Your first finished match against this player.'
    : `Head to head: ${record.played} played · ${record.wins} ${record.wins === 1 ? 'win' : 'wins'} · ${record.losses} ${record.losses === 1 ? 'loss' : 'losses'}${record.ties ? ` · ${record.ties} ${record.ties === 1 ? 'tie' : 'ties'}` : ''}`;
  return pvpEl('p', { className: 'pvp-note pvp-record', text });
}

async function pvpShareInvite(entry, button) {
  const text = `${pvpStore.displayName} challenged you on Where on Earth? Five places, 20 seconds each. Join code ${entry.joinCode}`;
  try {
    if (navigator.share) {
      await navigator.share({ text, url: entry.shareUrl });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  pvpCopyInvite(entry, button);
}

async function pvpCopyInvite(entry, button) {
  try {
    await navigator.clipboard.writeText(entry.shareUrl);
    button.textContent = 'Link copied';
    pvpSetStatus('Invite link copied. Paste it to a friend.');
  } catch {
    window.prompt('Copy this link to share:', entry.shareUrl); // no clipboard (insecure context, denied)
  }
}

function renderPvpMatch() {
  const state = pvpView.state;
  const entry = pvpMatchEntry(pvpView.matchId);
  const blocks = [];
  const header = (title, lede) => pvpEl('header', { className: 'postcard-summary-header' },
    pvpEl('p', { className: 'eyebrow', text: 'Challenge' }),
    pvpEl('h2', { text: title }),
    lede ? pvpEl('p', { className: 'postcard-summary-lede', text: lede }) : null);
  if (!state) {
    blocks.push(header(pvpView.loadError ? 'Could not load' : 'Loading...', pvpView.loadError));
    if (pvpView.loadError) blocks.push(pvpEl('div', { className: 'pvp-actions' }, pvpEl('button', { type: 'button', className: 'primary', text: 'Try again', onclick: loadPvpMatch })));
  } else {
    const key = pvpStatusKey(state);
    const opponent = pvpOpponentLabel(state);
    const oppName = opponent || 'Your opponent';
    const me = pvpMe(state);
    const opp = pvpOpponent(state);
    const next = state.viewer?.nextRound;
    if (key === 'completed') {
      const { winnerRole, margin } = state.result;
      blocks.push(header(winnerRole === 'TIE' ? 'Tied' : winnerRole === state.role ? 'You won' : `${oppName} won`,
        winnerRole === 'TIE' ? 'Same total. Totals are out of 5,000.' : `${winnerRole === state.role ? 'Won' : 'Lost'} by ${margin.toLocaleString()} ${margin === 1 ? 'point' : 'points'}. Totals are out of 5,000.`));
    } else if (key === 'expired') {
      blocks.push(header('Expired', 'Time ran out before both players finished. It does not count toward your record.'));
    } else if (key === 'ended') {
      blocks.push(header('Ended', 'This challenge was ended early. It does not count toward your record.'));
    } else if (key === 'your-turn') {
      blocks.push(header('Your turn', `Round ${next} of 5 is next. Each round gives you 20 seconds, and the timer starts when you tap play.${state.status === 'OPEN' ? ' Nobody has joined yet, so you can play now and your friend can play later.' : ''}`));
    } else if (key === 'waiting') {
      blocks.push(header('Waiting for opponent', 'You have played all five rounds. Send the link or code so a friend can play the same places.'));
    } else {
      blocks.push(header('Their turn', `You have played all five rounds. ${oppName} has played ${opp?.resolvedRounds ?? 0} of 5.`));
    }
    if (me?.visibleTotal != null || state.viewer?.total != null) {
      const myTotal = state.result ? state.result.totals.find((t) => t.role === state.role).total : state.viewer.total;
      const oppTotal = state.result ? state.result.totals.find((t) => t.role !== state.role).total : null;
      blocks.push(pvpEl('div', { className: 'survival-best-card' },
        pvpEl('div', {}, pvpEl('strong', { text: myTotal.toLocaleString() }), pvpEl('span', { text: state.result ? 'You' : 'You so far' })),
        pvpEl('div', {}, pvpEl('strong', { text: oppTotal != null ? oppTotal.toLocaleString() : opp ? `${opp.resolvedRounds ?? 0}/5` : '0/5' }),
          pvpEl('span', { text: oppTotal != null ? oppName : `${opponent || 'Opponent'} played` })),
      ));
    }
    if (state.status === 'OPEN' && state.role === 'CHALLENGER' && entry?.shareUrl) {
      const share = pvpEl('button', { type: 'button', className: 'primary', text: 'Share invite link', onclick: (event) => pvpShareInvite(entry, event.currentTarget) });
      const copy = pvpEl('button', { type: 'button', className: 'text-button', text: 'Copy link', onclick: (event) => pvpCopyInvite(entry, event.currentTarget) });
      blocks.push(pvpEl('div', { className: 'pvp-block pvp-invite' },
        pvpEl('p', { className: 'eyebrow', text: 'Join code' }),
        pvpEl('p', { className: 'pvp-code-big', text: entry.joinCode }),
        pvpEl('div', { className: 'pvp-actions' }, share, copy)));
    }
    blocks.push(pvpRecordLine());
    blocks.push(pvpBreakdown(state));
    const actions = [];
    if (key === 'completed') {
      actions.push(pvpEl('button', { type: 'button', className: 'primary', text: 'Rematch', onclick: () => pvpRematch(state) }));
      actions.push(pvpEl('button', { type: 'button', className: 'primary', text: 'Share result', onclick: (event) => host.shareResult(pvpShareText(state), event.currentTarget, pvpMatchBody.querySelector('.pvp-status')) }));
    }
    if (next && !['COMPLETED', 'EXPIRED', 'ABANDONED'].includes(state.status)) {
      const started = state.rounds?.find((r) => r.round === next)?.state === 'STARTED';
      actions.push(pvpEl('button', { type: 'button', className: 'primary', text: `${started ? 'Resume' : 'Play'} round ${next}`, onclick: () => pvpNav.pvpPlay(next) }));
    }
    blocks.push(pvpEl('div', { className: 'pvp-actions' }, actions));
  }
  blocks.push(pvpEl('p', { className: `pvp-status${pvpUi.statusError ? ' error' : ''}`, role: 'status', text: pvpUi.status }));
  blocks.push(pvpEl('div', { className: 'pvp-actions' }, pvpEl('button', { type: 'button', className: 'text-button', text: 'All challenges', onclick: () => showPvpHome() })));
  pvpMatchBody.replaceChildren(...blocks.filter(Boolean));
}

// The game's share format: who won, both totals, then each round.
function pvpShareText(state) {
  const { totals, winnerRole, margin } = state.result;
  const myName = pvpMe(state)?.displayName || 'Me';
  const oppName = pvpOpponentLabel(state) || 'Opponent';
  const mine = totals.find((t) => t.role === state.role).total;
  const theirs = totals.find((t) => t.role !== state.role).total;
  const winner = winnerRole === state.role ? myName : oppName;
  return host.formatGameShare({
    title: 'Challenge',
    titleSep: ' · ',
    headline: winnerRole === 'TIE' ? `${myName} and ${oppName} tied` : `${winner} won by ${margin.toLocaleString()}`,
    guesses: [
      `${myName} ${mine.toLocaleString()} vs ${oppName} ${theirs.toLocaleString()}`,
      ...state.rounds.map((r) => `Round ${r.round}: ${r.viewerResult?.score ?? 0} vs ${r.opponentResult?.score ?? 0}`),
    ],
    url: `${SHARE_URL}?mode=challenge`,
  });
}

// One canonical rematch per finished match: the first request creates it (ours
// to share); a later request by the other player gets that same match back and
// joins it with its invite.
async function pvpRematch(state) {
  if (pvpUi.busy) return;
  pvpUi.busy = true;
  pvpSetStatus('Setting up a rematch...');
  try {
    const { status, data } = await pvpRequestRematch(state.matchId);
    const label = data.series?.label === 'Decider' ? 'Decider' : 'Rematch';
    if (pvpMatchEntry(data.matchId)) {
      pvpUi.busy = false;
      showPvpMatch(data.matchId);
      return;
    }
    if (status === 201) {
      pvpRememberMatch({ matchId: data.matchId, role: 'CHALLENGER', shareUrl: data.shareUrl, joinCode: data.joinCode, createdAt: data.createdAt, rematchOf: state.matchId });
      pvpUi.busy = false;
      showPvpMatch(data.matchId, { justCreated: true });
      pvpSetStatus(`${label} created. Send the link or code to ${pvpOpponentLabel(state) || 'your opponent'}, then play your five rounds.`);
      return;
    }
    const inviteToken = data.shareUrl?.split('#invite=')[1];
    if (!inviteToken) throw new PvpError('REMATCH_EXISTS', PVP_MESSAGES.REMATCH_EXISTS);
    await pvpJoinMatch(data.matchId, { inviteToken });
    pvpRememberMatch({ matchId: data.matchId, role: 'INVITEE', createdAt: Date.now(), rematchOf: state.matchId });
    pvpUi.busy = false;
    showPvpMatch(data.matchId);
    pvpSetStatus(`You joined ${pvpOpponentLabel(state) || 'your opponent'}'s ${label.toLowerCase()}.`);
  } catch (error) {
    pvpUi.busy = false;
    if (error.code === 'REMATCH_EXISTS' && pvpMatchEntry(error.details?.matchId)) {
      showPvpMatch(error.details.matchId);
      return;
    }
    pvpSetStatus(pvpMessage(error), true);
  }
}

async function pvpLoadRecord(state, retry = true) {
  const opponent = pvpOpponent(state);
  if (!opponent) return;
  try {
    const data = await pvpGetRecord(opponent.playerId);
    if (pvpView.state !== state) return;
    pvpView.record = data;
    renderPvpMatch();
    // The pair record is written just after completion; catch up once if it lags.
    if (retry && state.status === 'COMPLETED' && data.record?.lastMatchId !== state.matchId) {
      setTimeout(() => { if (pvpView.state === state) pvpLoadRecord(state, false); }, 2500);
    }
  } catch { /* the record line is optional; the match still shows */ }
}

async function loadPvpMatch() {
  const matchId = pvpView.matchId;
  pvpView.loadError = '';
  try {
    const state = await pvpGetMatch(matchId);
    if (pvpView.matchId !== matchId || pvpMatchScreen.hidden) return;
    pvpUi.states.set(matchId, state);
    const finished = state.status === 'COMPLETED' && pvpView.state && pvpView.state.status !== 'COMPLETED';
    pvpView.state = state;
    renderPvpMatch();
    pvpLoadRecord(state);
    if (finished) pvpSetStatus(`${pvpOpponentLabel(state) || 'Your opponent'} finished. Here is the result.`);
    // Waiting on the other player: keep the screen current until it completes.
    clearTimeout(pvpView.pollTimer);
    if (['their-turn', 'waiting'].includes(pvpStatusKey(state))) {
      pvpView.pollTimer = setTimeout(() => { if (pvpView.matchId === matchId && !pvpMatchScreen.hidden) loadPvpMatch(); }, 10000);
    }
  } catch (error) {
    if (pvpView.matchId !== matchId) return;
    if (error.code === 'MATCH_NOT_FOUND') {
      pvpStore.matches = pvpStore.matches.filter((m) => m.matchId !== matchId);
      savePvp();
    }
    if (pvpView.state) pvpSetStatus(pvpMessage(error), true);
    else {
      pvpView.loadError = pvpMessage(error);
      renderPvpMatch();
    }
  }
}

export function showPvpMatch(matchId, { justCreated = false } = {}) {
  pvpNav.pvpLeave();
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'pvp-match';
  window.__canGuess = false;
  pvpView.record = undefined;
  pvpView.matchId = matchId;
  pvpView.state = pvpUi.states.get(matchId) || null;
  pvpUi.status = justCreated ? 'Challenge created. Share the link or code, then play your five rounds.' : '';
  pvpUi.statusError = false;
  pvpMatchScreen.hidden = false;
  document.body.classList.add('game-results');
  renderPvpMatch();
  loadPvpMatch();
}

function renderPvpJoin() {
  const invite = pvpUi.invite;
  const blocks = [];
  if (invite) {
    const name = invite.challenger.displayName;
    const label = name === pvpStore.displayName ? `${name} ${invite.challenger.displaySuffix}` : name;
    const expires = new Date(invite.expiresAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    pvpHome.querySelector('h2').textContent = `${label} challenged you`;
    pvpHome.querySelector('h2 + p').textContent = `Five places, 20 seconds each. Highest total out of 5,000 wins. Open until ${expires}.`;
    if (!pvpHasIdentity() || pvpUi.editingName) {
      blocks.push(pvpNameBlock({ submitLabel: pvpHasIdentity() ? 'Save' : 'Accept', onSubmit: (picked) => (pvpHasIdentity() ? pvpRename(picked, renderPvpJoin) : pvpAccept(picked)) }));
    } else {
      blocks.push(pvpEl('div', { className: 'pvp-block pvp-who' },
        pvpEl('span', {}, 'Playing as ', pvpEl('b', { text: pvpStore.displayName })),
        pvpEl('button', { type: 'button', className: 'text-button', text: 'Change name', onclick: () => { pvpUi.editingName = true; renderPvpJoin(); } }),
      ));
      blocks.push(pvpEl('div', { className: 'pvp-block' }, pvpEl('button', { type: 'button', className: 'primary pvp-wide', text: 'Accept challenge', onclick: () => pvpAccept() })));
    }
  } else {
    pvpHome.querySelector('h2').textContent = 'Challenge';
    pvpHome.querySelector('h2 + p').textContent = pvpUi.statusError ? '' : 'Loading the challenge...';
  }
  blocks.push(pvpEl('p', { className: `pvp-status${pvpUi.statusError ? ' error' : ''}`, role: 'status', text: pvpUi.status }));
  blocks.push(pvpEl('div', { className: 'pvp-actions' }, pvpEl('button', { type: 'button', className: 'text-button', text: invite ? 'Not now' : 'Back to challenges', onclick: () => { pvpForgetLinkInvite(); showPvpHome(); } })));
  pvpHomeBody.replaceChildren(...blocks);
}

async function pvpRename(name, rerender) {
  await pvpEnsureIdentity(name);
  pvpUi.editingName = false;
  pvpUi.status = '';
  rerender();
}

export async function openPvpJoin(credential) {
  pvpNav.pvpLeave();
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'pvp-join';
  window.__canGuess = false;
  host.pvp.joinCredential = credential;
  pvpUi.invite = null;
  pvpUi.editingName = false;
  pvpUi.status = '';
  pvpUi.statusError = false;
  renderPvpJoin();
  pvpHome.hidden = false;
  try {
    const invite = await pvpInspectInvitation(credential);
    if (host.gameMode !== 'pvp-join' || host.pvp.joinCredential !== credential) return;
    if (pvpMatchEntry(invite.matchId)) {
      // Our own challenge (or one already joined here): just open it.
      pvpForgetLinkInvite();
      showPvpMatch(invite.matchId);
      return;
    }
    pvpUi.invite = invite;
  } catch (error) {
    if (host.gameMode !== 'pvp-join') return;
    if (error.code === 'INVITATION_NOT_FOUND') {
      pvpNav.openPvpGroupJoin(credential);
      return;
    }
    pvpForgetLinkInvite();
    pvpUi.status = pvpMessage(error);
    pvpUi.statusError = true;
  }
  renderPvpJoin();
}

async function pvpAccept(name = pvpStore.displayName) {
  const invite = pvpUi.invite;
  if (!invite || pvpUi.busy) return;
  pvpUi.busy = true;
  pvpSetStatus('Joining...');
  try {
    await pvpEnsureIdentity(name);
    await pvpJoinMatch(invite.matchId, host.pvp.joinCredential);
    pvpRememberMatch({ matchId: invite.matchId, role: 'INVITEE', createdAt: Date.now() });
    pvpForgetLinkInvite();
    pvpUi.busy = false;
    showPvpMatch(invite.matchId);
  } catch (error) {
    pvpUi.busy = false;
    if (error.code === 'SELF_CHALLENGE' && pvpMatchEntry(invite.matchId)) {
      showPvpMatch(invite.matchId);
      return;
    }
    if (error.code !== 'NETWORK' && error.code !== 'RATE_LIMITED' && error.code !== 'INVALID_DISPLAY_NAME') pvpForgetLinkInvite();
    if (pvpHasIdentity()) renderPvpJoin();
    pvpSetStatus(pvpMessage(error), true);
  }
}

Object.assign(pvpNav, { showPvpMatch, openPvpJoin });
