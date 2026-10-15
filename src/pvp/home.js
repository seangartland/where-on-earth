// ---------------------------------------------------------------------------
// PvP Challenge home: identity, the Direct and Open Challenge cards, join by
// code, and the remembered match and Open Challenge lists. Also the pieces the
// other PvP screens share: the element builder, the overlay panel the join
// screens render into, UI state and the status line.
//
// Screens higher up (h2h, group, play) import from here; calls back up to them
// go through pvpNav, which they fill in when they load, so the import graph
// stays acyclic (deploy versioning needs that).
// ---------------------------------------------------------------------------
import {
  pvpStore, savePvp, pvpHasIdentity, pvpRememberMatch, pvpRememberGroup, pvpMessage, pvpCleanName, pvpEnsureIdentity,
  pvpGetMatch, pvpCreateMatch, pvpCreateGroup, pvpListMyGroups,
} from './api.js';

let host = null;

// Filled in by h2h.js (showPvpMatch, openPvpJoin), group.js (showPvpGroup,
// openPvpGroupJoin) and play.js (pvpLeave, pvpPlay, pvpPlayGroup).
export const pvpNav = {};

// Small DOM builder: every player-supplied string goes in as text, never markup.
export function pvpEl(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'className') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter((child) => child != null && child !== false));
  return el;
}

// Home: identity, create, join by code, and the remembered match list. Same
// overlay panel and choice rows as the Expeditions and Blackout pickers.
export let pvpHome = null;
export let pvpHomeBody = null;

export const pvpUi = { editingName: false, status: '', statusError: false, states: new Map(), listError: '', busy: false };

// Join: an invite link (#invite=<token>, see /pvp/join in vercel.json) or a
// typed code is inspected, shown, then claimed for this device's identity.
const PVP_INVITE_KEY = 'where-on-earth-pvp-invite';
export let pvpLinkIsGroup = false;
export let pvpLinkInvite = null;

export function initPvpHome(main) {
  host = main;
  pvpHome = document.createElement('section');
  pvpHome.className = 'expedition-picker';
  pvpHome.hidden = true;
  pvpHome.innerHTML = `<div class="expedition-panel pvp-panel" role="dialog" aria-modal="true" aria-labelledby="pvp-heading">
  <h2 id="pvp-heading">Challenge a friend</h2>
  <p>Five places, 20 seconds each. Highest total out of 5,000 wins.</p>
  <div class="pvp-body"></div>
</div>`;
  document.body.appendChild(pvpHome);
  const pvpHomeClose = host.createHomeButton();
  pvpHomeClose.classList.add('finished-home-nav'); // nothing in progress to confirm
  pvpHome.querySelector('.expedition-panel').prepend(pvpHomeClose);
  pvpHomeBody = pvpHome.querySelector('.pvp-body');
  pvpHome.addEventListener('click', (event) => { if (event.target === pvpHome) host.goHome(); });
  host.pvpScreenEls.push(pvpHome);

  // The list re-renders on its own as state reads land, so typing in the fields
  // above it is never wiped.
  pvpUi.listBlock = pvpEl('div', { className: 'pvp-block pvp-lists' });

  pvpLinkIsGroup = new URLSearchParams(location.search).get('from') === 'group';
  pvpLinkInvite = (() => {
    const m = location.hash.match(/^#invite=([A-Za-z0-9_-]{16,})$/);
    try {
      if (m) {
        // Survives the index.html version-check reload, which may land after this.
        sessionStorage.setItem(PVP_INVITE_KEY, m[1]);
        history.replaceState(null, '', location.pathname + location.search);
      }
      return m ? m[1] : sessionStorage.getItem(PVP_INVITE_KEY);
    } catch {
      return m ? m[1] : null;
    }
  })();

  pvpHome.addEventListener('click', (event) => {
    const group = event.target.closest('[data-pvp-group]');
    if (group) { pvpNav.showPvpGroup(group.dataset.pvpGroup); return; }
    const row = event.target.closest('[data-pvp-match]');
    if (row) pvpNav.showPvpMatch(row.dataset.pvpMatch);
  });
  document.getElementById('pvp-button').addEventListener('click', () => showPvpHome());
}

export function pvpForgetLinkInvite() {
  try { sessionStorage.removeItem(PVP_INVITE_KEY); } catch { /* private mode */ }
}

export function pvpSetStatus(text, error = false) {
  pvpUi.status = text;
  pvpUi.statusError = error;
  for (const node of document.querySelectorAll('.pvp-status[role="status"]')) {
    if (node.closest('[hidden]')) continue;
    node.textContent = text;
    node.classList.toggle('error', error);
  }
}

export function pvpNameBlock({ submitLabel, onSubmit }) {
  const input = pvpEl('input', { type: 'text', maxLength: 24, autocomplete: 'nickname', enterkeyhint: 'done', placeholder: 'Your name', 'aria-label': 'Your name', value: pvpStore.displayName });
  const submit = async () => {
    const { name, error } = pvpCleanName(input.value);
    if (error) { pvpSetStatus(error, true); input.focus(); return; }
    await onSubmit(name);
  };
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') submit(); });
  return pvpEl('div', { className: 'pvp-block' },
    pvpEl('p', { className: 'eyebrow', text: 'Your name' }),
    pvpEl('div', { className: 'pvp-field' }, input, pvpEl('button', { type: 'button', className: 'primary', text: submitLabel, onclick: submit })),
    pvpEl('p', { className: 'pvp-note', text: 'Your name and challenges live on this device only. Clearing site data or switching browsers starts a fresh identity.' }),
  );
}

const PVP_STATUS_LABELS = {
  'your-turn': 'Your turn',
  'their-turn': 'Their turn',
  waiting: 'Waiting for opponent',
  completed: 'Completed',
  expired: 'Expired',
  ended: 'Ended',
};

// One plain status per match, from a state read.
export function pvpStatusKey(state) {
  if (!state) return null;
  if (state.status === 'COMPLETED') return 'completed';
  if (state.status === 'EXPIRED') return 'expired';
  if (state.status === 'ABANDONED') return 'ended';
  if (state.viewer?.nextRound) return 'your-turn';
  return state.status === 'OPEN' ? 'waiting' : 'their-turn';
}

export const pvpOpponent = (state) => state?.players?.find((p) => p.role !== state.role) || null;
export const pvpMe = (state) => state?.players?.find((p) => p.role === state.role) || null;

export function pvpOpponentLabel(state) {
  const opponent = pvpOpponent(state);
  if (!opponent) return null;
  const me = pvpMe(state);
  // Same names read as one person; the stable suffix tells them apart.
  return me && me.displayName === opponent.displayName ? `${opponent.displayName} ${opponent.displaySuffix}` : opponent.displayName;
}

function pvpResultLine(state) {
  const result = state.result;
  if (!result) return '';
  if (result.winnerRole === 'TIE') return `Tied at ${result.totals[0].total.toLocaleString()}`;
  const won = result.winnerRole === state.role;
  return `${won ? 'Won' : 'Lost'} by ${result.margin.toLocaleString()}`;
}

function pvpMatchRow(entry) {
  const state = pvpUi.states.get(entry.matchId);
  const key = pvpStatusKey(state);
  const opponent = pvpOpponentLabel(state);
  const title = opponent ? `vs ${opponent}` : entry.role === 'CHALLENGER' ? 'Open challenge' : 'Challenge';
  let detail = state ? PVP_STATUS_LABELS[key] : state === null ? 'Could not load' : 'Loading';
  if (key === 'completed') detail = `${detail} · ${pvpResultLine(state)}`;
  else if (key === 'waiting' && entry.joinCode) detail = `${detail} · Code ${entry.joinCode}`;
  const played = state?.viewer && Number.isFinite(state.viewer.nextRound) ? state.viewer.nextRound - 1 : state?.status === 'COMPLETED' || key === 'their-turn' || key === 'waiting' ? 5 : null;
  return pvpEl('button', { type: 'button', className: 'expedition-choice', 'data-pvp-match': entry.matchId },
    pvpEl('span', { className: 'pvp-progress', text: played == null ? '' : `${played}/5` }),
    pvpEl('span', {}, pvpEl('strong', { text: title }), pvpEl('small', { text: detail })),
    pvpEl('span', { className: 'badge', text: '›' }),
  );
}

function renderPvpHome() {
  const blocks = [];
  if (!pvpHasIdentity() || pvpUi.editingName) {
    blocks.push(pvpNameBlock({
      submitLabel: pvpHasIdentity() ? 'Save' : 'Continue',
      onSubmit: async (name) => {
        if (pvpUi.busy) return;
        pvpUi.busy = true;
        pvpSetStatus(pvpHasIdentity() ? '' : 'Setting up...');
        try {
          await pvpEnsureIdentity(name);
          pvpUi.editingName = false;
          pvpUi.status = '';
          renderPvpHome();
        } catch (error) {
          pvpSetStatus(pvpMessage(error), true);
        } finally {
          pvpUi.busy = false;
        }
      },
    }));
  } else {
    blocks.push(pvpEl('div', { className: 'pvp-block pvp-who' },
      pvpEl('span', {}, 'Playing as ', pvpEl('b', { text: pvpStore.displayName })),
      pvpEl('button', { type: 'button', className: 'text-button', text: 'Change name', onclick: () => { pvpUi.editingName = true; renderPvpHome(); } }),
    ));
    blocks.push(pvpEl('div', { className: 'pvp-format-card' },
      pvpEl('h3', { text: 'Direct challenge' }),
      pvpEl('p', { text: 'Five places against one friend.' }),
      pvpEl('button', { type: 'button', className: 'primary pvp-wide', text: 'Create a challenge', onclick: pvpCreate }),
    ));
    blocks.push(pvpEl('div', { className: 'pvp-format-card' },
      pvpEl('h3', { text: 'Open Challenge' }),
      pvpEl('p', { text: 'One link, one map set, up to 50 players.' }),
      pvpEl('button', { type: 'button', className: 'primary pvp-wide', text: 'Create an Open Challenge', onclick: pvpGroupCreate }),
    ));
    const code = pvpEl('input', { type: 'text', className: 'pvp-code', maxLength: 6, autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, enterkeyhint: 'go', placeholder: 'Code', 'aria-label': 'Six character join code' });
    const join = () => {
      const value = code.value.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(value)) { pvpSetStatus('Join codes are 6 letters and numbers.', true); code.focus(); return; }
      pvpNav.openPvpJoin({ joinCode: value });
    };
    code.addEventListener('keydown', (event) => { if (event.key === 'Enter') join(); });
    blocks.push(pvpEl('div', { className: 'pvp-block pvp-join' },
      pvpEl('p', { className: 'eyebrow', text: 'Have a code?' }),
      pvpEl('div', { className: 'pvp-field' }, code, pvpEl('button', { type: 'button', className: 'primary', text: 'Join', onclick: join })),
    ));
  }
  blocks.push(pvpEl('p', { className: `pvp-status${pvpUi.statusError ? ' error' : ''}`, role: 'status', text: pvpUi.status }));
  if (pvpHasIdentity()) blocks.push(pvpUi.listBlock);
  renderPvpList();
  pvpHomeBody.replaceChildren(...blocks);
}

function renderPvpList() {
  pvpUi.listBlock.replaceChildren(
    pvpEl('p', { className: 'eyebrow', text: 'Your challenges' }),
    pvpStore.matches.length ? pvpEl('div', { className: 'expedition-list' }, pvpStore.matches.map(pvpMatchRow))
      : pvpEl('p', { className: 'pvp-empty', text: 'No challenges yet. Create one and send the link to a friend.' }),
    ...(pvpUi.listError ? [pvpEl('p', { className: 'pvp-status error', text: pvpUi.listError })] : []),
    pvpEl('p', { className: 'eyebrow', text: 'Your open challenges' }),
    pvpUi.groupItems?.length ? pvpEl('div', { className: 'expedition-list' }, pvpUi.groupItems.filter((item) => item.role === 'CREATOR').map(pvpGroupRow))
      : pvpEl('p', { className: 'pvp-empty', text: 'No Open Challenges created yet.' }),
    pvpEl('p', { className: 'eyebrow', text: 'Challenges you joined' }),
    pvpUi.groupItems?.some((item) => item.role !== 'CREATOR') ? pvpEl('div', { className: 'expedition-list' }, pvpUi.groupItems.filter((item) => item.role !== 'CREATOR').map(pvpGroupRow))
      : pvpEl('p', { className: 'pvp-empty', text: 'No joined Open Challenges yet.' }),
  );
}

function pvpGroupRow(item) {
  const progress = item.progress === 'FINISHED' ? 'Finished' : item.progress === 'PLAYING' ? 'In progress' : item.status === 'EXPIRED' ? 'Expired' : 'Not started';
  return pvpEl('button', { type: 'button', className: 'expedition-choice', 'data-pvp-group': item.challengeId },
    pvpEl('span', { className: 'pvp-progress', text: item.progress === 'FINISHED' ? `#${item.rank || '-'}` : `${item.total || 0}` }),
    pvpEl('span', {}, pvpEl('strong', { text: item.creator?.displayName || 'Open Challenge' }), pvpEl('small', { text: `${progress} · ${item.participantCount} player${item.participantCount === 1 ? '' : 's'}` })),
    pvpEl('span', { className: 'badge', text: '›' }),
  );
}

// Read every remembered match in parallel. A purged match (404) is forgotten;
// a network failure keeps the row and says so.
async function refreshPvpList() {
  if (!pvpHasIdentity()) return;
  pvpUi.listError = '';
  let unreachable = false;
  await Promise.all(pvpStore.matches.map(async (entry) => {
    try {
      pvpUi.states.set(entry.matchId, await pvpGetMatch(entry.matchId));
    } catch (error) {
      if (error.code === 'MATCH_NOT_FOUND' || error.code === 'FORBIDDEN') {
        pvpStore.matches = pvpStore.matches.filter((m) => m.matchId !== entry.matchId);
        pvpUi.states.delete(entry.matchId);
      } else {
        pvpUi.states.set(entry.matchId, null);
        if (error.code === 'NETWORK') unreachable = true;
      }
    }
  }));
  try {
    pvpUi.groupItems = await pvpListMyGroups();
    for (const item of pvpUi.groupItems) pvpRememberGroup({ challengeId: item.challengeId, role: item.role, createdAt: item.createdAt });
  } catch (error) {
    if (error.code === 'NETWORK') unreachable = true;
    else pvpUi.listError = pvpMessage(error);
  }
  savePvp();
  if (unreachable) pvpUi.listError = 'Could not reach the challenge service. Your challenges will load when you are back online.';
  renderPvpList();
}

export function showPvpHome(status = '', error = false) {
  pvpNav.pvpLeave();
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'pvp-home';
  window.__canGuess = false;
  pvpUi.status = status;
  pvpUi.statusError = error;
  pvpUi.editingName = false;
  pvpHome.querySelector('h2').textContent = 'Challenge a friend';
  pvpHome.querySelector('h2 + p').textContent = 'Five places, 20 seconds each. Highest total out of 5,000 wins.';
  renderPvpHome();
  pvpHome.hidden = false;
  refreshPvpList();
}

async function pvpCreate() {
  if (pvpUi.busy) return;
  pvpUi.busy = true;
  pvpSetStatus('Creating your challenge...');
  try {
    const created = await pvpCreateMatch();
    pvpRememberMatch({ matchId: created.matchId, role: 'CHALLENGER', shareUrl: created.shareUrl, joinCode: created.joinCode, createdAt: created.createdAt });
    pvpUi.busy = false;
    pvpNav.showPvpMatch(created.matchId, { justCreated: true });
  } catch (error) {
    pvpUi.busy = false;
    pvpSetStatus(pvpMessage(error), true);
    if (error.code === 'OPEN_CHALLENGE_CAP') refreshPvpList();
  }
}

export async function pvpGroupCreate() {
  if (pvpUi.busy) return;
  pvpUi.busy = true;
  pvpSetStatus('Creating your Open Challenge...');
  try {
    const created = await pvpCreateGroup();
    pvpRememberGroup({ challengeId: created.challengeId, role: 'CREATOR', shareUrl: created.shareUrl, joinCode: created.joinCode, createdAt: created.createdAt });
    pvpUi.busy = false;
    pvpNav.showPvpGroup(created.challengeId, { justCreated: true });
  } catch (error) {
    pvpUi.busy = false;
    pvpSetStatus(pvpMessage(error), true);
  }
}
