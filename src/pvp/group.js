// ---------------------------------------------------------------------------
// Open Challenge lobby, join and leaderboard. It has its own navigation and
// data, while play (play.js) continues to use the same globe/reveal screen as H2H.
// ---------------------------------------------------------------------------
import {
  PvpError, pvpStore, pvpHasIdentity, pvpGroupEntry, pvpRememberGroup, pvpMessage, pvpCleanName, pvpEnsureIdentity,
  pvpGetGroup, pvpCloseGroupEntries, pvpInspectGroupInvitation, pvpJoinGroup,
} from './api.js';
import { pvpNav, pvpEl, pvpHome, pvpHomeBody, pvpUi, pvpSetStatus, pvpNameBlock, pvpForgetLinkInvite, showPvpHome, pvpGroupCreate } from './home.js';
import { pvpMatchScreen } from './h2h.js';

let host = null;

let pvpGroupScreen = null;
let pvpGroupBody = null;
export const pvpGroupView = { challengeId: null, state: null, loadError: '', pollTimer: 0, confirmingClose: false };

export function initPvpGroup(main) {
  host = main;
  pvpGroupScreen = document.createElement('section');
  pvpGroupScreen.className = 'screen results-screen';
  pvpGroupScreen.hidden = true;
  pvpGroupScreen.innerHTML = '<div class="results-card glass pvp-match-card"><button class="home-nav-btn finished-home-nav" type="button" aria-label="Go home">×</button><div class="pvp-group-body"></div></div>';
  pvpMatchScreen.after(pvpGroupScreen);
  pvpGroupScreen.querySelector('.home-nav-btn').addEventListener('click', () => showPvpHome());
  pvpGroupBody = pvpGroupScreen.querySelector('.pvp-group-body');
  host.pvpScreenEls.push(pvpGroupScreen);
}

function pvpPlayerLabel(player, board) {
  const same = [...(board.finishers || []), ...(board.inProgress || [])].filter((row) => row.displayName === player.displayName).length > 1;
  return same ? `${player.displayName} ${player.displaySuffix}` : player.displayName;
}

function pvpLeaderboard(state, final = false) {
  const board = state.leaderboard || { finishers: [], inProgress: [] };
  const list = (rows, finished) => pvpEl('ol', { className: 'pvp-board-list' }, rows.map((row) => pvpEl('li', { className: row.playerId === pvpStore.playerId ? 'pvp-me' : '' },
    pvpEl('span', { className: 'pvp-board-rank', text: finished ? String(row.rank) : '-' }),
    pvpEl('b', { text: `${pvpPlayerLabel(row, board)}${row.role === 'CREATOR' ? ' · Creator' : ''}` }),
    pvpEl('span', { className: 'pvp-board-score', text: finished ? `${row.total.toLocaleString()} / 5,000` : `${row.total.toLocaleString()} · ${row.resolvedRounds}/5` }),
  )));
  return pvpEl('section', { className: 'pvp-board' },
    pvpEl('p', { className: 'eyebrow', text: final ? 'Final leaderboard' : 'Leaderboard' }),
    board.finishers.length ? list(board.finishers, true) : pvpEl('p', { className: 'pvp-empty', text: 'No finishers yet.' }),
    board.inProgress.length ? pvpEl('div', {}, pvpEl('p', { className: 'eyebrow', text: 'In progress' }), list(board.inProgress, false)) : null,
  );
}

function pvpGroupShareText(state) {
  const me = state.leaderboard.finishers.find((row) => row.playerId === pvpStore.playerId);
  const players = state.entries.participantCount;
  // While entries are open, share the group join link so readers can still enter (spec section 7).
  const link = (state.entries.open && pvpGroupEntry(state.challengeId)?.shareUrl) || 'https://www.where-on.earth';
  return `Open Challenge\n${me ? `I placed ${me.rank} of ${players}` : `I scored ${state.viewer.total.toLocaleString()} with ${players} players`}\n${state.viewer.total.toLocaleString()} out of 5,000\n${link}`;
}

async function pvpShareGroupInvite(entry, button) {
  const text = `${pvpStore.displayName} opened an Open Challenge on Where on Earth? Five places, 20 seconds each. Join code ${entry.joinCode}`;
  try {
    if (navigator.share) { await navigator.share({ text, url: entry.shareUrl }); return; }
  } catch (error) { if (error?.name === 'AbortError') return; }
  pvpCopyGroupInvite(entry, button);
}

async function pvpCopyGroupInvite(entry, button) {
  try {
    await navigator.clipboard.writeText(entry.shareUrl);
    button.textContent = 'Link copied';
    pvpSetStatus('Invite link copied. Paste it to your group.');
  } catch {
    try {
      await navigator.clipboard.writeText(entry.joinCode);
      button.textContent = 'Code copied';
      pvpSetStatus('The 6-character join code was copied.');
    } catch { window.prompt('Copy this 6-character join code:', entry.joinCode); }
  }
}

function renderPvpGroup() {
  const state = pvpGroupView.state;
  const entry = pvpGroupEntry(pvpGroupView.challengeId);
  const blocks = [pvpEl('header', { className: 'postcard-summary-header' }, pvpEl('p', { className: 'eyebrow', text: 'Open Challenge' }), pvpEl('h2', { text: state?.viewer?.progress === 'FINISHED' ? 'Challenge complete' : 'Open Challenge' }))];
  if (!state) {
    blocks.push(pvpEl('p', { className: `pvp-status${pvpGroupView.loadError ? ' error' : ''}`, text: pvpGroupView.loadError || 'Loading...' }));
    if (pvpGroupView.loadError) blocks.push(pvpEl('button', { type: 'button', className: 'primary pvp-wide', text: 'Try again', onclick: loadPvpGroup }));
  } else {
    const expires = new Date(state.expiresAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const count = state.entries.participantCount;
    blocks.push(pvpEl('p', { className: 'postcard-summary-lede', text: `${count} of ${state.entries.participantCap} players · ${state.entries.open ? `Open until ${expires}` : state.status === 'EXPIRED' ? 'Expired' : 'Entries closed'}` }));
    if (entry?.shareUrl && state.entries.open) {
      blocks.push(pvpEl('div', { className: 'pvp-block pvp-invite' },
        pvpEl('p', { className: 'eyebrow', text: 'Reusable join code' }),
        pvpEl('p', { className: 'pvp-code-big', text: entry.joinCode }),
        pvpEl('div', { className: 'pvp-actions' },
          pvpEl('button', { type: 'button', className: 'primary', text: 'Share invite link', onclick: (event) => pvpShareGroupInvite(entry, event.currentTarget) }),
          pvpEl('button', { type: 'button', className: 'text-button', text: 'Copy link', onclick: (event) => pvpCopyGroupInvite(entry, event.currentTarget) }))));
    }
    blocks.push(pvpLeaderboard(state, state.viewer.progress === 'FINISHED'));
    if (state.viewer.progress === 'FINISHED') {
      const me = state.leaderboard.finishers.find((row) => row.playerId === pvpStore.playerId);
      if (me) blocks.push(pvpEl('p', { className: 'postcard-summary-lede', text: `You placed ${me.rank} of ${count} with ${me.total.toLocaleString()} out of 5,000.` }));
      blocks.push(pvpEl('div', { className: 'pvp-actions' },
        pvpEl('button', { type: 'button', className: 'primary', text: 'Share result', onclick: (event) => host.shareResult(pvpGroupShareText(state), event.currentTarget, pvpGroupBody.querySelector('.pvp-status')) }),
        pvpEl('button', { type: 'button', className: 'primary', text: 'New Open Challenge', onclick: pvpGroupCreate })));
    } else if (state.viewer.nextRound && state.status !== 'EXPIRED') {
      const row = state.rounds.find((round) => round.round === state.viewer.nextRound);
      blocks.push(pvpEl('button', { type: 'button', className: 'primary pvp-wide', text: `${row?.state === 'STARTED' ? 'Resume' : 'Start'} round ${state.viewer.nextRound}`, onclick: () => pvpNav.pvpPlayGroup(state.viewer.nextRound) }));
    }
    if (state.role === 'CREATOR' && state.entries.open) {
      blocks.push(pvpGroupView.confirmingClose ? pvpEl('div', { className: 'pvp-confirm' },
        pvpEl('p', { text: 'Close entries? Everyone already joined can still finish.' }),
        pvpEl('div', { className: 'pvp-actions' }, pvpEl('button', { type: 'button', className: 'primary', text: 'Close entries', onclick: pvpCloseGroup }), pvpEl('button', { type: 'button', className: 'text-button', text: 'Cancel', onclick: () => { pvpGroupView.confirmingClose = false; renderPvpGroup(); } })))
        : pvpEl('button', { type: 'button', className: 'text-button', text: 'Close entries', onclick: () => { pvpGroupView.confirmingClose = true; renderPvpGroup(); } }));
    }
  }
  blocks.push(pvpEl('p', { className: `pvp-status${pvpUi.statusError ? ' error' : ''}`, role: 'status', text: pvpUi.status }));
  blocks.push(pvpEl('button', { type: 'button', className: 'text-button', text: 'All challenges', onclick: () => showPvpHome() }));
  pvpGroupBody.replaceChildren(...blocks.filter(Boolean));
}

async function loadPvpGroup() {
  const challengeId = pvpGroupView.challengeId;
  try {
    const state = await pvpGetGroup(challengeId);
    if (pvpGroupView.challengeId !== challengeId || pvpGroupScreen.hidden) return;
    pvpGroupView.state = state;
    pvpGroupView.loadError = '';
    renderPvpGroup();
    clearTimeout(pvpGroupView.pollTimer);
    if (state.status !== 'EXPIRED') pvpGroupView.pollTimer = setTimeout(loadPvpGroup, 10000);
  } catch (error) {
    pvpGroupView.loadError = pvpMessage(error);
    renderPvpGroup();
  }
}

export function showPvpGroup(challengeId, { justCreated = false } = {}) {
  pvpNav.pvpLeave();
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'pvp-group';
  window.__canGuess = false;
  clearTimeout(pvpGroupView.pollTimer);
  Object.assign(pvpGroupView, { challengeId, state: null, loadError: '', confirmingClose: false });
  pvpUi.status = justCreated ? 'Open Challenge created. Share the link or code, then play when you are ready.' : '';
  pvpUi.statusError = false;
  pvpGroupScreen.hidden = false;
  document.body.classList.add('game-results');
  renderPvpGroup();
  loadPvpGroup();
}

async function pvpCloseGroup() {
  try {
    await pvpCloseGroupEntries(pvpGroupView.challengeId);
    pvpGroupView.confirmingClose = false;
    pvpSetStatus('Entries closed. Everyone already joined can still finish.');
    loadPvpGroup();
  } catch (error) { pvpSetStatus(pvpMessage(error), true); }
}

function renderPvpGroupJoin() {
  const invite = pvpUi.groupInvite;
  const blocks = [];
  pvpHome.querySelector('h2').textContent = 'Group challenge';
  if (invite) {
    const creator = invite.creator.displayName === pvpStore.displayName ? `${invite.creator.displayName} ${invite.creator.displaySuffix}` : invite.creator.displayName;
    const expires = new Date(invite.expiresAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    pvpHome.querySelector('h2 + p').textContent = `${creator}'s Open Challenge · ${invite.participantCount} of ${invite.participantCap} players · Open until ${expires}.`;
    if (!invite.unavailable && (!pvpHasIdentity() || pvpUi.editingName)) blocks.push(pvpNameBlock({ submitLabel: pvpHasIdentity() ? 'Save' : 'Join', onSubmit: (name) => pvpGroupAccept(name) }));
    else if (!invite.unavailable) blocks.push(pvpEl('div', { className: 'pvp-actions' }, pvpEl('button', { type: 'button', className: 'primary', text: 'Join Open Challenge', onclick: () => pvpGroupAccept() })));
  } else pvpHome.querySelector('h2 + p').textContent = pvpUi.statusError ? '' : 'Loading the Open Challenge...';
  blocks.push(pvpEl('p', { className: `pvp-status${pvpUi.statusError ? ' error' : ''}`, role: 'status', text: pvpUi.status }));
  blocks.push(pvpEl('button', { type: 'button', className: 'text-button', text: 'Back to challenges', onclick: () => { pvpForgetLinkInvite(); showPvpHome(); } }));
  pvpHomeBody.replaceChildren(...blocks);
}

export async function openPvpGroupJoin(credential) {
  pvpNav.pvpLeave(); host.clearReveal(); host.hideScreens(); host.gameMode = 'pvp-group-join'; window.__canGuess = false;
  host.pvp.joinCredential = credential; pvpUi.groupInvite = null; pvpUi.editingName = false; pvpUi.status = ''; pvpUi.statusError = false;
  renderPvpGroupJoin(); pvpHome.hidden = false;
  try {
    const invite = await pvpInspectGroupInvitation(credential);
    if (host.gameMode !== 'pvp-group-join') return;
    if (pvpGroupEntry(invite.challengeId)) { pvpForgetLinkInvite(); showPvpGroup(invite.challengeId); return; }
    pvpUi.groupInvite = invite;
  } catch (error) {
    pvpUi.status = pvpMessage(error); pvpUi.statusError = true;
    if (['ENTRIES_CLOSED', 'CHALLENGE_FULL'].includes(error.code) && error.details?.challengeId) pvpUi.groupInvite = { ...error.details, unavailable: true };
    if (error.code !== 'NETWORK') pvpForgetLinkInvite();
  }
  renderPvpGroupJoin();
}

async function pvpGroupAccept(name = pvpStore.displayName) {
  const invite = pvpUi.groupInvite;
  if (!invite || pvpUi.busy) return;
  pvpUi.busy = true; pvpSetStatus('Joining...');
  try {
    const cleaned = pvpCleanName(name); if (cleaned.error) throw new PvpError('INVALID_DISPLAY_NAME', cleaned.error);
    await pvpEnsureIdentity(cleaned.name);
    const joined = await pvpJoinGroup(invite.challengeId, host.pvp.joinCredential);
    pvpRememberGroup({ challengeId: invite.challengeId, role: joined.role, createdAt: Date.now() });
    pvpForgetLinkInvite(); pvpUi.busy = false; showPvpGroup(invite.challengeId);
  } catch (error) { pvpUi.busy = false; pvpSetStatus(pvpMessage(error), true); renderPvpGroupJoin(); }
}

Object.assign(pvpNav, { showPvpGroup, openPvpGroupJoin });
