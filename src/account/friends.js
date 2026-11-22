import { ACCOUNTS_ENABLED, FRIEND_QUEUE_KEY } from '../core/config.js';
import { localDateKey } from '../core/format.js';
import { state } from '../core/state.js';
import { accountApi } from './api.js';
import { isSignedIn, readAccountSession } from './session.js';

const dailyPins = new Map();
const progressionAwards = new Map();

function sessionToken() {
  if (!ACCOUNTS_ENABLED || !isSignedIn()) return null;
  return readAccountSession()?.sessionToken || null;
}

async function request(path, options = {}) {
  const token = sessionToken();
  if (!token) return null;
  return accountApi(path, { ...options, token });
}

function rememberSubmission(date, locationId, response, { silent = false } = {}) {
  const existing = dailyPins.get(date) || { date, locations: {} };
  existing.locations[locationId] = {
    mine: response.stored.guess,
    friends: response.friends || [],
  };
  dailyPins.set(date, existing);
  if (silent) return response;
  if (response.progressionAward) {
    progressionAwards.set(date, response.progressionAward);
    window.dispatchEvent(new CustomEvent('daily-progression-award', { detail: { date, award: response.progressionAward } }));
  }
  window.dispatchEvent(new CustomEvent('daily-friend-pins', {
    detail: { date, locationId, ...existing.locations[locationId], stored: response.stored },
  }));
  return response;
}

export function progressionAwardFor(date) { return progressionAwards.get(date) || null; }

export function cachedFriendPins(date) {
  return dailyPins.get(date) || null;
}

// A durable queue of Daily submissions that could not reach the worker
// (signed out, or the request itself failed). Flushed whenever a session
// token becomes available; see flushPendingQueue.
function readQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FRIEND_QUEUE_KEY) || 'null');
    return Array.isArray(parsed?.entries) ? parsed.entries : [];
  } catch { return []; }
}

function writeQueue(entries) {
  try { localStorage.setItem(FRIEND_QUEUE_KEY, JSON.stringify({ _v: 1, entries })); } catch { /* best effort */ }
}

function enqueuePending(entry) {
  const entries = readQueue().filter((e) => !(e.date === entry.date && e.slot === entry.slot));
  entries.push(entry);
  writeQueue(entries);
}

function dequeuePending(date, slot) {
  const entries = readQueue();
  const next = entries.filter((e) => !(e.date === date && e.slot === slot));
  if (next.length !== entries.length) writeQueue(next);
}

async function postGuess(entry, token) {
  const body = {
    date: entry.date,
    slot: entry.slot,
    locationId: entry.locationId,
    guess: entry.guess,
    distanceKm: entry.distanceKm,
    score: entry.score,
    deviceId: readAccountSession().deviceId,
  };
  return accountApi('/v1/daily/guesses', { method: 'POST', body, token });
}

export async function submitDailyGuess(result, slot) {
  const date = state.daily?.date;
  const locationId = state.daily?.ids?.[slot];
  if (!result?.guess || !date || !locationId) return null;
  const entry = {
    date, slot, locationId,
    guess: { lat: result.guess.lat, lng: result.guess.lng },
    distanceKm: result.distance,
    score: result.score,
  };
  const token = sessionToken();
  if (!token) {
    enqueuePending(entry);
    return null;
  }
  try {
    const response = await postGuess(entry, token);
    dequeuePending(date, slot);
    return rememberSubmission(date, locationId, response);
  } catch (error) {
    if (error?.code === 'GUESS_LOCKED' && error.data?.stored) {
      dequeuePending(date, slot);
      return rememberSubmission(date, locationId, error.data);
    }
    enqueuePending(entry);
    return null;
  }
}

// Sends every queued submission now that a session token exists. Today's
// entries reuse the normal side effects (progression award, friend pins);
// past entries (yesterday's, carried signed-out) submit quietly. A date the
// worker rejects as too old (INVALID_DAILY_DATE), or already stored, is
// dropped; anything else stays queued for the next flush.
export async function flushPendingQueue() {
  const token = sessionToken();
  if (!token) return;
  const entries = readQueue();
  if (!entries.length) return;
  const today = localDateKey();
  for (const entry of entries) {
    const silent = entry.date !== today;
    try {
      const response = await postGuess(entry, token);
      dequeuePending(entry.date, entry.slot);
      rememberSubmission(entry.date, entry.locationId, response, { silent });
    } catch (error) {
      if (error?.code === 'GUESS_LOCKED' && error.data?.stored) {
        dequeuePending(entry.date, entry.slot);
        rememberSubmission(entry.date, entry.locationId, error.data, { silent });
      } else if (error?.code === 'INVALID_DAILY_DATE') {
        dequeuePending(entry.date, entry.slot);
      }
      // any other failure (offline, timeout, ...) leaves the entry queued
    }
  }
}

export async function fetchFriendPins(date) {
  const response = await request(`/v1/daily/friends?${new URLSearchParams({ date })}`);
  if (response) dailyPins.set(date, response);
  return response;
}

export async function backfillToday() {
  if (!sessionToken() || state.daily?.date !== localDateKey()) return [];
  const results = state.daily.results || [];
  return Promise.all(results.map((result, slot) => submitDailyGuess(result, slot)));
}

export function listFriends() {
  return request('/v1/friends');
}

export function updateProfile(profile) {
  return request('/v1/friends/profile', { method: 'POST', body: profile });
}

export function createInvite() {
  return request('/v1/friends/invites', { method: 'POST' });
}

export function previewInvite(token) {
  return request('/v1/friends/invites/preview', { method: 'POST', body: { token } });
}

export function acceptInvite(token) {
  return request('/v1/friends/invites/accept', { method: 'POST', body: { token } });
}

export function removeFriend(friendId) {
  return request('/v1/friends/remove', { method: 'POST', body: { friendId } });
}

export function progression() {
  return request('/v1/progression');
}

export function friendProgression(friendId) {
  return request(`/v1/progression/friend?${new URLSearchParams({ friendId })}`);
}

export function updateLoadout(loadout) {
  return request('/v1/progression/loadout', { method: 'POST', body: loadout });
}
