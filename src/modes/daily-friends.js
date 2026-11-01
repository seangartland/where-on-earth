// ---------------------------------------------------------------------------
// Friends on the Daily: friends' pins on the reveal and the review recap.
// Loaded only by a signed-in accounts build (dynamic imports in round.js and
// daily-game.js), so a signed-out or accounts=0 Daily never runs any of it.
// Data comes from src/account/friends.js (the POST's daily-friend-pins event,
// its memory cache, and the review GET); every distance and score shown for
// a friend is recomputed in src/game/friend-rows.js. Nothing here waits on
// the worker: a slow, failed or offline response simply shows nothing.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { TAP_MAX_MS, TAP_MAX_MOVE } from '../core/config.js';
import { clamp } from '../core/math.js';
import { state } from '../core/state.js';
import { latLngToVec3, canvas, globe } from '../globe/scene.js';
import { Pin, makeBadgeTexture } from '../globe/pin.js';
import { gameEls } from '../game/round.js';
import { friendRows, chipText, popoverText, stripChips, sameGuess } from '../game/friend-rows.js';
import { backfillToday, cachedFriendPins, fetchFriendPins, listFriends } from '../account/friends.js';
import { reviewEls, reviewFacing, screenOf, setFriendLayer } from './daily-game.js';

// Warm off-white: neither the guess orange nor ANSWER_COLOR. The exact shade
// is a visual-review call.
const FRIEND_COLOR = new THREE.Color('#f3e7d3');
const FRIEND_CORE = '#fffaf0';
const FRIEND_BRIGHT = new THREE.Color('#ffffff');
const FRIEND_PIN_SCALE = 0.7;
const FRIEND_BADGE_SCALE = 0.85; // of a full-size badge, so the initial stays readable
const SLOW_MS = 4000; // a reveal response later than this is dropped
const GLOW_MS = 1200;
const POP_MS = 2600;
const PIN_HIT = 30; // css px

let view = null; // the round whose friends are on screen (reveal or recap)
let popTimer = 0;
const pinPool = [];
const badges = new Map();
let firstPin = null; // the stored guess from another device (GUESS_LOCKED)
const _up = new THREE.Vector3();
const _w = new THREE.Vector3();

// Friend count and the player's own sharing switch: they decide between no
// strip and "No friends have played this one yet".
let friendsInfo = null;
function loadFriendsInfo(refresh = false) {
  if (!friendsInfo || refresh) {
    friendsInfo = listFriends()
      .then((r) => (r ? { count: r.friends?.length || 0, sharePins: r.me?.sharePins !== false } : null))
      .catch(() => null);
  }
  return friendsInfo;
}

function badgeFor(kind, text) {
  const key = `${kind}:${text}`;
  if (!badges.has(key)) badges.set(key, makeBadgeTexture(kind, 0, text));
  return badges.get(key);
}

function friendPin(i) {
  if (!pinPool[i]) {
    const pin = new Pin({ color: FRIEND_COLOR, badge: badgeFor('friend', '?') });
    pin.capMat.uniforms.uPulse.value = 0; // no pulse: the pulse is yours
    globe.add(pin.root);
    pinPool[i] = pin;
  }
  return pinPool[i];
}

function setGlow(pin, on) {
  pin.glowUntil = on ? performance.now() + GLOW_MS : 0;
  pin.setColor(on ? FRIEND_BRIGHT : FRIEND_COLOR, on ? '#ffffff' : FRIEND_CORE);
}

function releasePins(from = 0) {
  for (let i = from; i < pinPool.length; i++) pinPool[i].release();
}

// The cached response for the view's location, if one has landed.
function adopt(v) {
  const location = cachedFriendPins(v.date)?.locations?.[v.locationId];
  if (!location) return false;
  v.data = { friends: location.friends || [] };
  v.stored = location.mine || null;
  return true;
}

export function clearFriends() {
  clearTimeout(popTimer);
  if (view) view.strip?.remove();
  view = null;
  releasePins();
  firstPin?.release();
}

function render(v) {
  if (v !== view || !v.settled || !v.data) return;
  const rows = friendRows(v.data.friends, v.answer);
  const key = JSON.stringify([rows.map((r) => [r.friendId, r.guess.lat, r.guess.lng]), v.stored]);
  if (key === v.key) return;
  v.key = key;
  v.rows = rows;
  v.expanded = false;
  rows.forEach((row, i) => {
    const pin = friendPin(i);
    pin.badge.material.map = badgeFor('friend', row.initial);
    setGlow(pin, false);
    pin.drop(latLngToVec3(row.guess.lat, row.guess.lng));
    pin.t = -i * 0.08; // a light stagger, nearest first
  });
  releasePins(rows.length);
  if (rows.length) {
    mountStrip(v);
    return;
  }
  // Nobody's pin for this place: a muted line if you have friends (and see
  // their pins), otherwise no strip at all.
  v.strip?.remove();
  v.strip = null;
  firstPin?.release();
  loadFriendsInfo().then((info) => {
    if (v === view && v.key === key && info?.count && info.sharePins) mountStrip(v);
  });
}

function mountStrip(v) {
  const strip = v.strip || document.createElement('div');
  strip.className = 'friends-strip';
  strip.setAttribute('aria-label', "Friends' pins");
  strip.replaceChildren();
  // GUESS_LOCKED from another device: friends saw the stored guess, so it is
  // drawn and labelled; the local pin and result stay as they are.
  const otherDevice = v.mode === 'reveal' && v.stored && !sameGuess(v.stored, v.localGuess);
  if (otherDevice) {
    strip.append(Object.assign(document.createElement('p'), { className: 'friends-note', textContent: 'Your first guess (other device)' }));
    if (!firstPin) {
      firstPin = new Pin({ badge: badgeFor('guess', '1ST') });
      firstPin.capMat.uniforms.uPulse.value = 0;
      globe.add(firstPin.root);
    }
    firstPin.drop(latLngToVec3(v.stored.lat, v.stored.lng));
  } else firstPin?.release();
  if (v.rows.length) {
    v.chips = Object.assign(document.createElement('div'), { className: 'friends-chips' });
    strip.append(v.chips);
    renderChips(v);
  } else {
    strip.append(Object.assign(document.createElement('p'), { className: 'friends-empty', textContent: 'No friends have played this one yet' }));
  }
  v.pop = Object.assign(document.createElement('p'), { className: 'friend-pop', hidden: true });
  v.pop.setAttribute('role', 'status');
  strip.append(v.pop);
  if (!strip.isConnected) {
    if (v.mode === 'reveal') gameEls.peekBar.after(strip);
    else reviewEls.card.querySelector('.score-line').after(strip);
  }
  v.strip = strip;
}

function renderChips(v) {
  const { chips, more } = stripChips(v.rows, v.expanded);
  v.chips.replaceChildren(...chips.map((row, i) => {
    const chip = Object.assign(document.createElement('button'), { type: 'button', className: 'review-pill friend-chip' });
    chip.append(Object.assign(document.createElement('b'), { textContent: row.name }), ` ${row.distance}`);
    chip.setAttribute('aria-label', chipText(row));
    chip.addEventListener('click', () => showPopover(v, i));
    return chip;
  }));
  if (more) {
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'review-pill friend-chip', textContent: `+${more}` });
    button.setAttribute('aria-label', `Show all ${v.rows.length} friends`);
    button.addEventListener('click', () => {
      v.expanded = true;
      renderChips(v);
    });
    v.chips.append(button);
  }
}

function showPopover(v, i) {
  if (v !== view || !v.pop) return;
  v.pop.textContent = popoverText(v.rows[i]);
  v.pop.hidden = false;
  clearTimeout(popTimer);
  popTimer = setTimeout(() => { if (v.pop) v.pop.hidden = true; }, POP_MS);
  setGlow(pinPool[i], true);
}

// Nearest front-facing friend pin under a tap; true if one was hit.
function pickFriend(x, y) {
  const v = view;
  if (!v?.settled || !v.rows?.length) return false;
  let best = -1;
  let bestD = PIN_HIT;
  v.rows.forEach((row, i) => {
    const pin = pinPool[i];
    if (!pin.root.visible || reviewFacing(latLngToVec3(row.guess.lat, row.guess.lng)) <= 0) return;
    for (const part of [pin.core, pin.badge]) {
      const [sx, sy] = screenOf(part.getWorldPosition(_w));
      const d = Math.hypot(sx - x, sy - y);
      if (d < bestD) { best = i; bestD = d; }
    }
  });
  if (best < 0) return false;
  showPopover(v, best);
  return true;
}

// Called every frame from updateReview, with the main pin scale.
function updateFriends(dt, scale) {
  const now = performance.now();
  for (const pin of [...pinPool, firstPin]) {
    if (!pin || pin.state === 'idle') continue;
    if (pin.glowUntil && now > pin.glowUntil) setGlow(pin, false);
    pin.update(dt, state.elapsed, scale * FRIEND_PIN_SCALE * (pin.glowUntil ? 1.25 : 1));
    if (pin.state === 'idle') continue;
    pin.badge.scale.multiplyScalar(FRIEND_BADGE_SCALE / FRIEND_PIN_SCALE);
    // badge sprites ignore depth, so fade them out as their pin rounds the limb
    _up.set(0, 1, 0).applyQuaternion(pin.root.quaternion);
    pin.badge.material.opacity *= clamp((reviewFacing(_up) + 0.02) / 0.12, 0, 1);
  }
}

// ---------------------------------------------------------------------------
// The reveal: called from revealGuess for every Daily round. settle() is run
// from the earn toast's whenPostcardDone hook; pins never drop before it, nor
// before the reveal sheet is up.
// ---------------------------------------------------------------------------
export function beginFriendReveal({ date, slot, answer, guess, restoring }) {
  clearFriends();
  const v = { mode: 'reveal', date, slot, locationId: state.daily.ids[slot], answer, localGuess: guess, startedAt: performance.now(), data: null, settled: false };
  view = v;
  loadFriendsInfo();
  if (!adopt(v) && restoring) {
    fetchFriendPins(date).then(() => {
      if (performance.now() - v.startedAt <= SLOW_MS && adopt(v)) render(v);
    }).catch(() => {});
  }
  return { settle: () => settleReveal(v) };
}

function settleReveal(v) {
  const ready = () => {
    if (v !== view || state.gameMode !== 'reveal') return;
    if (gameEls.reveal.hidden) {
      requestAnimationFrame(ready);
      return;
    }
    v.settled = true;
    render(v);
  };
  ready();
}

window.addEventListener('daily-friend-pins', (event) => {
  const v = view;
  const d = event.detail || {};
  if (!v || v.mode !== 'reveal' || d.date !== v.date || d.locationId !== v.locationId) return;
  if (performance.now() - v.startedAt > SLOW_MS) return;
  v.data = { friends: d.friends || [] };
  v.stored = d.stored?.guess || d.mine || null;
  render(v);
});

// Friend pins on the reveal take taps too (the review's go through pickReviewRound).
let tapAt = null;
canvas.addEventListener('pointerdown', (e) => { tapAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  const tap = tapAt;
  tapAt = null;
  if (!tap || state.gameMode !== 'reveal' || performance.now() - tap.t > TAP_MAX_MS) return;
  if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_MAX_MOVE) return;
  pickFriend(e.clientX, e.clientY);
});

// ---------------------------------------------------------------------------
// The review: one backfill and one GET when it opens; a round's friends show
// only while its recap is open.
// ---------------------------------------------------------------------------
export function enterFriendReview(date, openSlot = -1) {
  loadFriendsInfo(true);
  Promise.resolve(backfillToday())
    .catch(() => {})
    .then(() => fetchFriendPins(date))
    .then(() => {
      if (view?.mode === 'recap' && view.date === date && adopt(view)) render(view);
    })
    .catch(() => {});
  if (openSlot >= 0) showFriendRecap(openSlot, date);
}

export function showFriendRecap(slot, date = state.daily.date) {
  clearFriends();
  const v = { mode: 'recap', date, slot, locationId: state.daily.ids[slot], answer: state.selected[slot], data: null, settled: true };
  view = v;
  if (adopt(v)) render(v);
}

// ---------------------------------------------------------------------------
// Results: no friends yet gets one quiet way in, never a strip mid-game.
// ---------------------------------------------------------------------------
export async function syncCompareButton() {
  const info = await loadFriendsInfo(true);
  let button = gameEls.results.querySelector('.friends-compare');
  if (!info || info.count) {
    if (button) button.hidden = true;
    return;
  }
  if (!button) {
    button = Object.assign(document.createElement('button'), { type: 'button', className: 'text-button friends-compare', textContent: 'Compare pins with friends' });
    gameEls.results.querySelector('.results-globe').after(button);
    button.addEventListener('click', async () => {
      const { openAccountSheet } = await import('../account/sheet.js');
      await openAccountSheet(button);
      document.querySelector('.account-friends')?.scrollIntoView({ block: 'nearest' });
    });
  }
  button.hidden = false;
}

setFriendLayer({ update: updateFriends, clear: clearFriends, pick: pickFriend, recap: showFriendRecap });
