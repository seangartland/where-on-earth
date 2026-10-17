// ---------------------------------------------------------------------------
// PvP Challenge home: one create button (Open Challenge as a text button), join
// by code, identity, and the merged list of remembered matches and Open Challenges. Also the pieces the
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

export const pvpUi = { editingName: false, pendingCreate: null, showCode: false, capHit: false, status: '', statusError: false, states: new Map(), listError: '', busy: false };

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
  pvpUi.createSlot = pvpEl('div', { className: 'pvp-block pvp-create' });

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
  const title = opponent ? `vs ${opponent}` : entry.role === 'CHALLENGER' ? 'Waiting for a friend' : 'Challenge';
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

const PVP_CAP_NOTE = 'You have 3 challenges open. A slot frees up when one is finished, expires, or you close entries on an Open Challenge.';

// Order: the list (when it has rows), the create slot, the status line, the
// code join (behind "Have a code?") and the identity footer.
function renderPvpHome() {
  const blocks = [pvpUi.listBlock, pvpUi.createSlot];
  blocks.push(pvpEl('p', { className: `pvp-status${pvpUi.statusError ? ' error' : ''}`, role: 'status', text: pvpUi.status }));
  if (pvpUi.showCode) {
    const code = pvpEl('input', { type: 'text', className: 'pvp-code', maxLength: 6, autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, enterkeyhint: 'go', placeholder: 'Code', 'aria-label': 'Six character join code' });
    const join = () => {
      const value = code.value.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(value)) { pvpSetStatus('Join codes are 6 letters and numbers.', true); code.focus(); return; }
      pvpNav.openPvpJoin({ joinCode: value });
    };
    code.addEventListener('keydown', (event) => { if (event.key === 'Enter') join(); });
    blocks.push(pvpEl('div', { className: 'pvp-block pvp-join' },
      pvpEl('div', { className: 'pvp-field' }, code, pvpEl('button', { type: 'button', className: 'primary', text: 'Join', onclick: join })),
    ));
  }
  blocks.push(pvpEl('div', { className: 'pvp-block pvp-who pvp-footer' },
    pvpUi.showCode ? null : pvpEl('button', { type: 'button', className: 'text-button', text: 'Have a code?', onclick: () => { pvpUi.showCode = true; renderPvpHome(); pvpHomeBody.querySelector('.pvp-code')?.focus(); } }),
    pvpHasIdentity() ? pvpEl('span', {}, 'Playing as ', pvpEl('b', { text: pvpStore.displayName }), ' · ',
      pvpEl('button', { type: 'button', className: 'text-button', text: 'Change name', onclick: () => { pvpUi.editingName = true; renderPvpHome(); } })) : null,
  ));
  renderPvpCreateSlot();
  renderPvpList();
  pvpHomeBody.replaceChildren(...blocks);
}

// The one primary action. Swapped for the name block when a create is tapped
// with no identity (or on rename), and for the cap note at three open.
function renderPvpCreateSlot() {
  const slot = pvpUi.createSlot;
  if (pvpUi.editingName || pvpUi.pendingCreate) {
    slot.replaceChildren(pvpNameBlock({
      submitLabel: pvpUi.editingName ? 'Save' : 'Create',
      onSubmit: async (name) => {
        if (pvpUi.busy) return;
        pvpUi.busy = true;
        pvpSetStatus(pvpHasIdentity() ? '' : 'Setting up...');
        try {
          await pvpEnsureIdentity(name);
        } catch (error) {
          pvpSetStatus(pvpMessage(error), true);
          return;
        } finally {
          pvpUi.busy = false;
        }
        const create = pvpUi.pendingCreate;
        pvpUi.editingName = false;
        pvpUi.pendingCreate = null;
        pvpUi.status = '';
        renderPvpHome();
        if (create) create();
      },
    }));
  } else if (pvpUi.capHit || pvpOpenSlots() >= 3) {
    slot.replaceChildren(pvpEl('p', { className: 'pvp-note', text: PVP_CAP_NOTE }));
  } else {
    const start = (create) => () => {
      if (pvpHasIdentity()) { create(); return; }
      pvpUi.pendingCreate = create;
      pvpSetStatus('');
      renderPvpCreateSlot();
      slot.querySelector('input')?.focus();
    };
    slot.replaceChildren(
      pvpEl('button', { type: 'button', className: 'primary pvp-wide', text: 'Challenge a friend', onclick: start(pvpCreate) }),
      pvpEl('button', { type: 'button', className: 'text-button', text: 'Start an Open Challenge for a group', onclick: start(pvpGroupCreate) }),
    );
  }
}

// Slots the Worker holds against the shared cap of 3: a direct match you
// created that nobody has joined yet (joining frees it), and an Open Challenge
// you created that is still OPEN with no one else in it (the first join frees
// it). Group list items carry status, the source of entries.open. A miss here
// only under-counts; the server's OPEN_CHALLENGE_CAP stays the authority.
function pvpOpenSlots() {
  const now = Date.now();
  const direct = pvpStore.matches.filter((entry) => {
    const state = pvpUi.states.get(entry.matchId);
    return entry.role === 'CHALLENGER' && state?.status === 'OPEN' && !(state.expiresAt <= now);
  }).length;
  const groups = (pvpUi.groupItems || []).filter((item) => item.role === 'CREATOR' && item.status === 'OPEN' && item.participantCount === 1 && !(item.expiresAt <= now)).length;
  return direct + groups;
}

// One list: your turn, then waiting on others, then finished; newest first
// within each. No header and no empty line when there is nothing to show.
function pvpMatchOrder(entry) {
  const key = pvpStatusKey(pvpUi.states.get(entry.matchId));
  return key === 'your-turn' ? 0 : key === 'completed' || key === 'expired' || key === 'ended' ? 2 : 1;
}

function pvpGroupOrder(item) {
  const over = item.status === 'EXPIRED' || item.status === 'SETTLED';
  if (item.progress === 'FINISHED') return over ? 2 : 1;
  return over ? 2 : 0;
}

function renderPvpList() {
  const rows = [
    ...pvpStore.matches.map((entry) => ({ order: pvpMatchOrder(entry), at: entry.createdAt, row: () => pvpMatchRow(entry) })),
    ...(pvpUi.groupItems || []).map((item) => ({ order: pvpGroupOrder(item), at: item.createdAt, row: () => pvpGroupRow(item) })),
  ].sort((a, b) => a.order - b.order || (new Date(b.at).getTime() || 0) - (new Date(a.at).getTime() || 0));
  pvpUi.listBlock.replaceChildren(
    ...(rows.length ? [pvpEl('p', { className: 'eyebrow', text: 'Your games' }), pvpEl('div', { className: 'expedition-list' }, rows.map((r) => r.row()))] : []),
    ...(pvpUi.listError ? [pvpEl('p', { className: 'pvp-status error', text: pvpUi.listError })] : []),
  );
}

function pvpGroupRow(item) {
  const players = `${item.participantCount} player${item.participantCount === 1 ? '' : 's'}`;
  const detail = item.progress === 'FINISHED' ? (item.rank ? `Finished · #${item.rank}` : 'Finished')
    : item.status === 'EXPIRED' ? 'Expired'
      : item.progress === 'PLAYING' ? `In progress · ${(item.total || 0).toLocaleString()}` : 'Not started';
  return pvpEl('button', { type: 'button', className: 'expedition-choice', 'data-pvp-group': item.challengeId },
    pvpEl('span', { className: 'pvp-progress', text: '' }),
    pvpEl('span', {}, pvpEl('strong', { text: `Open Challenge · ${players}` }), pvpEl('small', { text: detail })),
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
    const cached = pvpUi.states.get(entry.matchId);
    if (cached && ['COMPLETED', 'EXPIRED', 'ABANDONED'].includes(cached.status)) return;
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
  if (!pvpUi.editingName && !pvpUi.pendingCreate) renderPvpCreateSlot();
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
  pvpUi.pendingCreate = null;
  pvpUi.showCode = false;
  pvpUi.capHit = false;
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
    if (pvpCapHit(error)) return;
    pvpSetStatus(pvpMessage(error), true);
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
    if (pvpCapHit(error)) return;
    pvpSetStatus(pvpMessage(error), true);
  }
}

// A server cap answer on the home sheet shows the cap note in the create slot,
// not the status line. From other screens it stays a status message.
function pvpCapHit(error) {
  if (error.code !== 'OPEN_CHALLENGE_CAP' || pvpHome.hidden) return false;
  pvpUi.capHit = true;
  pvpSetStatus('');
  renderPvpCreateSlot();
  refreshPvpList();
  return true;
}
