import { ACCOUNTS_ENABLED } from '../core/config.js';
import { localDateKey } from '../core/format.js';
import { state } from '../core/state.js';
import { accountApi } from './api.js';
import { isSignedIn, readAccountSession } from './session.js';

const dailyPins = new Map();

function sessionToken() {
  if (!ACCOUNTS_ENABLED || !isSignedIn()) return null;
  return readAccountSession()?.sessionToken || null;
}

async function request(path, options = {}) {
  const token = sessionToken();
  if (!token) return null;
  return accountApi(path, { ...options, token });
}

function rememberSubmission(date, locationId, response) {
  const existing = dailyPins.get(date) || { date, locations: {} };
  existing.locations[locationId] = {
    mine: response.stored.guess,
    friends: response.friends || [],
  };
  dailyPins.set(date, existing);
  window.dispatchEvent(new CustomEvent('daily-friend-pins', {
    detail: { date, locationId, ...existing.locations[locationId], stored: response.stored },
  }));
  return response;
}

export function cachedFriendPins(date) {
  return dailyPins.get(date) || null;
}

export async function submitDailyGuess(result, slot) {
  const token = sessionToken();
  const date = state.daily?.date;
  const locationId = state.daily?.ids?.[slot];
  if (!token || !result?.guess || !date || !locationId) return null;
  const body = {
    date,
    slot,
    locationId,
    guess: { lat: result.guess.lat, lng: result.guess.lng },
    distanceKm: result.distance,
    score: result.score,
    deviceId: readAccountSession().deviceId,
  };
  try {
    return rememberSubmission(date, locationId, await accountApi('/v1/daily/guesses', {
      method: 'POST', body, token,
    }));
  } catch (error) {
    if (error?.code === 'GUESS_LOCKED' && error.data?.stored) {
      return rememberSubmission(date, locationId, error.data);
    }
    return null;
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
