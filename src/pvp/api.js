// ---------------------------------------------------------------------------
// PvP challenges: async five-round matches against one friend, run by the
// woe-pvp Worker (docs/pvp-tech-spec-sol.md; pvp-worker/src/index.js is the
// contract). The server owns locations, deadlines and scores. Identity is a
// device-local playerId + token; nothing here touches Daily, streaks or history.
//
// This module is the worker client: identity, token storage and every H2H and
// Open Challenge request. main.js hands in its storage helpers via initPvpApi.
// ---------------------------------------------------------------------------
const PVP_API = 'https://woe-pvp.gartland-79.workers.dev';
const PVP_KEY = 'where-on-earth-pvp-v1';
const PVP_CLIENT_VERSION = '2026.10.13';
const PVP_GROUP_CLIENT_VERSION = '2026.10.14';
const PVP_MATCH_LIMIT = 30; // remembered matches, newest first

let host = null;

export class PvpError extends Error {
  constructor(code, message, status = 0, details = null) {
    super(message);
    Object.assign(this, { code, status, details });
  }
}

export let pvpStore = null;

export function initPvpApi(main) {
  host = main;
  pvpStore = (() => {
    const saved = host.readJSON(PVP_KEY);
    const store = saved && typeof saved === 'object' ? saved : {};
    return {
      playerId: typeof store.playerId === 'string' ? store.playerId : null,
      playerToken: typeof store.playerToken === 'string' ? store.playerToken : null,
      displayName: typeof store.displayName === 'string' ? store.displayName : '',
      matches: Array.isArray(store.matches) ? store.matches.filter((m) => m && typeof m.matchId === 'string') : [],
      groups: Array.isArray(store.groups) ? store.groups.filter((g) => g && typeof g.challengeId === 'string') : [],
    };
  })();
}

export function savePvp() {
  pvpStore.matches = pvpStore.matches.slice(0, PVP_MATCH_LIMIT);
  pvpStore.groups = pvpStore.groups.slice(0, PVP_MATCH_LIMIT);
  host.writeJSON(PVP_KEY, pvpStore);
}

export const pvpHasIdentity = () => Boolean(pvpStore.playerId && pvpStore.playerToken);
export const pvpMatchEntry = (matchId) => pvpStore.matches.find((m) => m.matchId === matchId) || null;
export const pvpGroupEntry = (challengeId) => pvpStore.groups.find((g) => g.challengeId === challengeId) || null;

export function pvpRememberMatch(entry) {
  const existing = pvpMatchEntry(entry.matchId);
  if (existing) Object.assign(existing, entry);
  else pvpStore.matches.unshift({ visited: [], ...entry });
  savePvp();
}

export function pvpRememberGroup(entry) {
  const existing = pvpGroupEntry(entry.challengeId);
  if (existing) Object.assign(existing, entry);
  else pvpStore.groups.unshift(entry);
  savePvp();
}

async function pvpApi(path, { method = 'GET', body, auth = true, withStatus = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth) headers.authorization = `Bearer ${pvpStore.playerToken}`;
  let response;
  try {
    response = await fetch(PVP_API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  } catch {
    throw new PvpError('NETWORK', 'Could not reach the challenge service. Check your connection and try again.');
  }
  let data = null;
  try { data = await response.json(); } catch { /* empty or non-JSON body */ }
  if (!response.ok) {
    const error = data && data.error;
    throw new PvpError(error?.code || `HTTP_${response.status}`, error?.message || 'The challenge service had a problem. Try again.', response.status, error?.details || null);
  }
  return withStatus ? { status: response.status, data } : data;
}

// Plain copy for the errors a player can actually hit; anything else uses the
// Worker's own message.
export const PVP_MESSAGES = {
  OPEN_CHALLENGE_CAP: 'You have 3 open challenges. Finish one or let it expire before starting another. They are listed below.',
  RATE_LIMITED: 'Too many tries. Wait a minute and try again.',
  SERVICE_DISABLED: 'New challenges are paused right now. Try again later.',
  UNAUTHORIZED: 'This device is no longer recognized by the challenge service.',
  INVITATION_NOT_FOUND: 'This challenge is no longer available.',
  INVITATION_EXPIRED: 'This challenge has expired.',
  MATCH_EXPIRED: 'This challenge has expired.',
  MATCH_ABANDONED: 'This challenge was ended.',
  MATCH_NOT_FOUND: 'This challenge is no longer available.',
  SEAT_TAKEN: 'Someone else already accepted this challenge.',
  SELF_CHALLENGE: 'This is your own challenge. Send the link to a friend.',
  INVALID_DISPLAY_NAME: 'That name cannot be used. Try letters and numbers, up to 24 characters.',
  REMATCH_PENDING: 'A rematch is being set up. Try again in a moment.',
  REMATCH_EXISTS: 'A rematch for this match has already started.',
  MATCH_NOT_COMPLETED: 'Rematches open once both players finish.',
  CHALLENGE_EXPIRED: 'This Open Challenge has expired.',
  CHALLENGE_NOT_FOUND: 'This Open Challenge is no longer available.',
  CHALLENGE_FULL: 'This Open Challenge is full.',
  ENTRIES_CLOSED: 'Entries are closed for this Open Challenge.',
  CREATOR_ONLY: 'Only the creator can close entries.',
};
export const pvpMessage = (error) => PVP_MESSAGES[error?.code] || error?.message || 'Something went wrong. Try again.';

export function pvpCleanName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name) return { error: 'Enter a name first.' };
  if ([...name].length > 24) return { error: 'Use 24 characters or fewer.' };
  if (/[<>\p{Cc}‪-‮⁦-⁩]/u.test(name)) return { error: 'That name cannot be used. Try letters and numbers.' };
  return { name };
}

// First PvP entry creates the identity; later name changes only relabel future
// matches (the Worker snapshots a name when a seat is created or claimed).
export async function pvpEnsureIdentity(name) {
  if (pvpHasIdentity()) {
    if (name && name !== pvpStore.displayName) {
      pvpStore.displayName = name;
      savePvp();
    }
    return;
  }
  const created = await pvpApi('/v1/players', { method: 'POST', body: { displayName: name }, auth: false });
  pvpStore.playerId = created.playerId;
  pvpStore.playerToken = created.playerToken;
  pvpStore.displayName = created.displayName;
  savePvp();
}

// Head to head matches. Names come from the store at request time.
export const pvpGetMatch = (matchId) => pvpApi(`/v1/matches/${matchId}`);

export const pvpCreateMatch = () => pvpApi('/v1/matches', { method: 'POST', body: { displayName: pvpStore.displayName, clientVersion: PVP_CLIENT_VERSION } });

export const pvpRequestRematch = (matchId) => pvpApi(`/v1/matches/${matchId}/rematches`, { method: 'POST', body: { displayName: pvpStore.displayName, clientVersion: PVP_CLIENT_VERSION }, withStatus: true });

// credential is { inviteToken } or { joinCode }.
export const pvpJoinMatch = (matchId, credential) => pvpApi(`/v1/matches/${matchId}/join`, { method: 'POST', body: { ...credential, displayName: pvpStore.displayName, clientVersion: PVP_CLIENT_VERSION } });

export const pvpInspectInvitation = (credential) => pvpApi('/v1/invitations/inspect', { method: 'POST', body: credential, auth: false });

export const pvpGetRecord = (opponentId) => pvpApi(`/v1/records/${encodeURIComponent(opponentId)}`);

export const pvpStartMatchRound = (matchId, round) => pvpApi(`/v1/matches/${matchId}/rounds/${round}/start`, { method: 'POST', body: {} });

export const pvpSubmitMatchGuess = (matchId, round, submissionId, guess) => pvpApi(`/v1/matches/${matchId}/rounds/${round}/submission`, { method: 'PUT', body: { submissionId, guess: { lat: guess.lat, lng: guess.lng } } });

// Open Challenges.
export const pvpGetGroup = (challengeId) => pvpApi(`/v1/group-challenges/${challengeId}`);

export const pvpCreateGroup = () => pvpApi('/v1/group-challenges', { method: 'POST', body: { displayName: pvpStore.displayName, clientVersion: PVP_GROUP_CLIENT_VERSION } });

// Every Open Challenge this player created or joined, all pages.
export async function pvpListMyGroups() {
  const items = [];
  let cursor = null;
  do {
    const query = new URLSearchParams({ scope: 'mine', limit: '20' });
    if (cursor) query.set('cursor', cursor);
    const groups = await pvpApi(`/v1/group-challenges?${query}`);
    items.push(...(groups.challenges || []));
    cursor = groups.nextCursor;
  } while (cursor);
  return items;
}

export const pvpCloseGroupEntries = (challengeId) => pvpApi(`/v1/group-challenges/${challengeId}/close`, { method: 'POST', body: {} });

export const pvpInspectGroupInvitation = (credential) => pvpApi('/v1/group-invitations/inspect', { method: 'POST', body: credential, auth: false });

export const pvpJoinGroup = (challengeId, credential) => pvpApi(`/v1/group-challenges/${challengeId}/join`, { method: 'POST', body: { ...credential, displayName: pvpStore.displayName, clientVersion: PVP_GROUP_CLIENT_VERSION } });

export const pvpStartGroupRound = (challengeId, round) => pvpApi(`/v1/group-challenges/${challengeId}/rounds/${round}/start`, { method: 'POST', body: {} });

export const pvpSubmitGroupGuess = (challengeId, round, submissionId, guess) => pvpApi(`/v1/group-challenges/${challengeId}/rounds/${round}/submission`, { method: 'PUT', body: { submissionId, guess: { lat: guess.lat, lng: guess.lng } } });

// Every participant's result for one round, all pages.
export async function pvpGetRoundResults(challengeId, round) {
  const rows = [];
  let cursor = null;
  do {
    const query = new URLSearchParams({ limit: '25' });
    if (cursor) query.set('cursor', cursor);
    const page = await pvpApi(`/v1/group-challenges/${challengeId}/rounds/${round}/results?${query}`);
    rows.push(...(page.participantResults || []));
    cursor = page.nextCursor;
  } while (cursor);
  return rows;
}
