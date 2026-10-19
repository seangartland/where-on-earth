// ---------------------------------------------------------------------------
// The reveal (refactor Phase 5): the answer route and travel head, the
// flyover camera flights, the bullseye snap, the photo postcard, the
// two-beat reveal (map first, then the sheet), and the reveal framing.
// initReveal(host) builds its objects and listeners at the spot the reveal
// section used to run. The host supplies the round screen elements and the
// few round-screen functions the reveal calls back into.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { DEG, FOV, SCENE_MIN_DIST, PITCH_LIMIT, EARN_NAMES, flyoverTier } from '../core/config.js';
import { clamp, smoothstep } from '../core/math.js';
import { state } from '../core/state.js';
import { audio } from '../core/audio.js';
import { fadeElement } from '../core/dom.js';
import { formatKm, countryKey, regionKey, flagForLocation } from '../core/format.js';
import { buildPostcardCard, ensurePostcardCardStyles } from '../meta/postcard-card.js';
import { ANSWER_COLOR, latLngToVec3, _UP, _RIGHT, setGlobeQuaternion, camera, globe, pointers, projectToScreen } from './scene.js';
import { showCountryOutline, clearCountryOutline, showRegionOutline, clearRegionOutline } from './outlines.js';
import { pins, correctPin, LAND_T, HOME_PITCH, nearAngle, _unitSphere } from './pin.js';

let host = null;
let gameEls = null;
export let answerLineMaterial = null;
export let answerLine;
export let travelHead;
let shockwaveMat;
let shockwave;
let bullseyeStamp;
let postcard;
let postcardImg;
let postcardPhotoFrame;
let postcardName;
let postcardMeta;
export let peekSlot;
let thumbSlots;

let travelAnimation = null;
let northUpRevealToken = 0;

// ---------------------------------------------------------------------------
// Flyover extras: accuracy tiers, synthesized sound, photo postcard
// ---------------------------------------------------------------------------
const GOLD_COLOR = new THREE.Color('#ffd45e');
const DEADPAN_LINES = ['away.', 'away. Bold.', 'away. Different continent.', 'away. Still on Earth, though.', 'away. Noted.'];

// Slow motion for the bullseye landing: scales the pins' (and shockwave's)
// clock only; the camera and DOM keep real time.
export let timeScale = 1;

function setAccuracyStamp(tier) {
  const pinpoint = tier === 'pinpoint';
  bullseyeStamp.innerHTML = pinpoint ? '<b>📍</b>PINPOINT' : '<b>🎯</b>BULLSEYE';
  bullseyeStamp.setAttribute('aria-label', pinpoint ? 'Pinpoint' : 'Bullseye');
}

const POSTCARD_W = 212;
const POSTCARD_H = 202;
// All postcard timing is real time (performance.now) from touchdown, so a slow
// device whose logical clock lags (dt is clamped) holds the card just as long.
const POSTCARD_POP_MS = 560;
const POSTCARD_HOLD_MS = 1500; // touchdown -> earliest settle
const POSTCARD_MIN_SHOW_MS = 600; // after a (late) pop finishes, before it settles
const POSTCARD_SETTLE_MS = 640;

// Whichever thumb the postcard can settle into right now, or null.
export function postcardTarget() {
  if (gameEls.reveal.hidden) return null;
  const expanded = gameEls.reveal.classList.contains('expanded');
  const thumb = expanded ? gameEls.thumb : gameEls.peekThumb;
  return thumb.hidden || (thumb === gameEls.peekThumb && peekSlot.hidden) ? null : thumb;
}

// Load the photo at full priority as the flight starts. The preload is a
// detached Image: a failed load on an in-document <img> reaches the window
// error handler and raises the boot error banner.
export let postcardPhoto = null; // { src, ok, failed } for the current reveal
export let postcardRun = null; // { b, landedAt, popAt, newUnlock, phase: 'pending' | 'out' | 'settling' }
export let postcardNewUnlock = false;
export let revealCardAt = null; // when the reveal card has finished fading in
export let afterPostcard = null; // queued until the postcard is out of the way
export function preparePostcard(item, newlyEarned, km, plain = false) {
  clearPostcard();
  revealCardAt = null;
  afterPostcard = null;
  postcardNewUnlock = Boolean(newlyEarned);
  if (!item.image) return;
  const earned = plain ? 0 : (state.passport.meta[item.id]?.e || newlyEarned || 0);
  const earnName = plain ? '' : (EARN_NAMES[earned] || 'seen');
  buildPostcardCard(item, {
    earned,
    earnName,
    meta: plain ? formatKm(km) : `${earnName[0].toUpperCase()}${earnName.slice(1)} • ${formatKm(km)}`,
  }, {
    element: postcard,
    className: 'postcard',
    loading: 'eager',
    flagForLocation,
    applyCardTier: host.applyCardTier,
  });
  postcard.hidden = true;
  postcardPhotoFrame = postcard.querySelector('.pp-photo');
  postcardImg = postcard.querySelector('img');
  postcardName = postcard.querySelector('.pp-name');
  postcardMeta = postcard.querySelector('.pp-meta');
  const photo = { src: item.image, ok: false, failed: false };
  const loader = new Image();
  loader.decoding = 'async';
  loader.onload = () => {
    photo.ok = true;
    if (postcardPhoto === photo && postcardRun && postcardRun.phase === 'pending') popPostcard();
  };
  loader.onerror = () => {
    photo.failed = true;
    if (postcardPhoto === photo && postcardRun && postcardRun.phase === 'pending') abandonPostcard();
  };
  loader.src = item.image;
  postcardPhoto = photo;
}

export function clearPostcard() {
  postcardRun = null;
  postcardPhoto = null;
  postcard.getAnimations().forEach((a) => a.cancel());
  for (const child of [postcardPhotoFrame, postcardImg, postcardName, postcardMeta]) {
    child?.getAnimations().forEach((animation) => animation.cancel());
  }
  postcard.hidden = true;
  thumbSlots.forEach((slot) => slot.classList.remove('waiting'));
}

// Earliest settle: the hold from touchdown, and never before the sheet is
// there to land in (unknown until the pullback starts).
export function postcardSettleAt(run) {
  let at = Math.max(run.landedAt + POSTCARD_HOLD_MS, revealCardAt ?? Infinity);
  if (run.popAt != null) at = Math.max(at, run.popAt + POSTCARD_POP_MS + POSTCARD_MIN_SHOW_MS);
  return at;
}

// Touchdown of the answer pin (globe-local point b). A photo still loading
// pops late, as long as that is still before the settle would have happened.
export function postcardLanded(b) {
  if (!postcardPhoto || postcardPhoto.failed) {
    postcardDone();
    return;
  }
  const run = { b, landedAt: performance.now(), popAt: null, newUnlock: postcardNewUnlock, phase: 'pending' };
  postcardRun = run;
  if (postcardPhoto.ok) popPostcard();
  const tick = () => {
    if (postcardRun !== run || run.phase === 'settling') return;
    const now = performance.now();
    if (now >= postcardSettleAt(run)) {
      if (run.phase === 'pending') abandonPostcard();
      else settlePostcard();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Run fn once no postcard is (or is about to be) on screen. The earn toast
// waits on this: it sits in the same band as the held postcard and would
// cover the photo, which on a bullseye pops right as the toast appears.
export function whenPostcardDone(fn) {
  if (postcardPhoto && !postcardPhoto.failed) afterPostcard = fn;
  else fn();
}

export function postcardDone() {
  const fn = afterPostcard;
  afterPostcard = null;
  if (fn) fn();
}

export function postcardCardShown(fadeMs) {
  revealCardAt = performance.now() + fadeMs;
}

// The photo never arrived in time: drop the placeholder and let the thumb
// fade in whenever it loads.
export function abandonPostcard() {
  postcardRun = null;
  postcardPhoto = null;
  thumbSlots.forEach((slot) => slot.classList.remove('waiting'));
  host.revealThumbCurrent();
  for (const thumb of [gameEls.thumb, gameEls.peekThumb]) {
    const fadeIn = () => thumb.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    if (!thumb.complete) thumb.addEventListener('load', fadeIn, { once: true });
  }
  postcardDone();
}

export function popPostcard() {
  const run = postcardRun;
  run.phase = 'out';
  run.popAt = performance.now();
  postcardImg.src = postcardPhoto.src;
  const v = run.b.clone().multiplyScalar(1.02).applyQuaternion(globe.quaternion).project(camera);
  const fromX = ((v.x + 1) / 2) * state.viewW;
  const fromY = ((1 - v.y) / 2) * state.viewH;
  // Hold it in the band below the reveal framing (where the sheet will rise),
  // so it never covers the pins while the map has the stage, and clear of the
  // distance pill at the very bottom.
  const x = state.viewW / 2;
  const y = Math.min(state.viewH - 96 - POSTCARD_H / 2, Math.max(revealStrip().safeBottom + POSTCARD_H / 2 + 10, state.viewH * 0.72));
  run.x = x - POSTCARD_W / 2;
  run.y = y - POSTCARD_H / 2;
  postcard.hidden = false;
  postcard.animate([
    { transform: `translate(${fromX - POSTCARD_W / 2}px, ${fromY - POSTCARD_H / 2}px) scale(.08) rotate(0deg)`, opacity: 0 },
    { transform: `translate(${run.x}px, ${run.y - 16}px) scale(1.06) rotate(-7deg)`, opacity: 1, offset: 0.6 },
    { transform: `translate(${run.x}px, ${run.y}px) scale(1) rotate(-4deg)`, opacity: 1 },
  ], { duration: POSTCARD_POP_MS, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'forwards' });
}

// Morph the postcard into the thumb's exact box: the frame, text and tilt
// melt away while the photo grows to the slot's size and corner radius. Both
// are the same src with object-fit: cover, so the final swap is invisible.
export function settlePostcard() {
  const run = postcardRun;
  run.phase = 'settling';
  if (!run.newUnlock) {
    postcard.getAnimations().forEach((a) => a.cancel());
    postcard.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: 'ease-out', fill: 'forwards' }).onfinish = () => {
      if (postcardRun !== run) return;
      host.revealThumbCurrent();
      clearPostcard();
      postcardDone();
    };
    return;
  }
  const thumb = postcardTarget();
  run.thumb = thumb;
  if (!thumb) {
    postcard.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).onfinish = () => {
      if (postcardRun !== run) return;
      host.revealThumbCurrent();
      clearPostcard();
      postcardDone();
    };
    return;
  }
  thumb.decode().catch(() => {}); // start decoding now; it is needed at the swap
  const r = thumb.getBoundingClientRect();
  const timing = { duration: POSTCARD_SETTLE_MS, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' };
  const lift = 0.2; // a short pick-up beat before it glides down
  postcard.getAnimations().forEach((a) => a.cancel());
  postcard.animate([
    { transform: `translate(${run.x}px, ${run.y}px) scale(1) rotate(-4deg)`, width: `${POSTCARD_W}px`, padding: '5px 5px 8px', borderWidth: '2px', borderRadius: '4px', backgroundColor: '#1a1f2e', boxShadow: '0 8px 22px rgba(0,0,0,.45), 0 1px 0 rgba(255,255,255,.12) inset' },
    { transform: `translate(${run.x}px, ${run.y - 10}px) scale(1.04) rotate(-6deg)`, width: `${POSTCARD_W}px`, padding: '5px 5px 8px', borderWidth: '2px', borderRadius: '4px', backgroundColor: '#1a1f2e', boxShadow: '0 22px 40px rgba(0,0,0,.4), 0 2px 6px rgba(0,0,0,.3)', offset: lift },
    { transform: `translate(${r.left}px, ${r.top}px) scale(1) rotate(0deg)`, width: `${r.width}px`, padding: '0px', borderWidth: '0px', borderRadius: '10px', backgroundColor: 'rgba(26,31,46,0)', boxShadow: '0 0 0 rgba(0,0,0,0), 0 0 0 rgba(0,0,0,0)' },
  ], timing).onfinish = () => {
    if (postcardRun !== run) return;
    // Hold the postcard over the slot until the thumb can actually paint.
    if (thumb.complete) swapPostcard(run);
    else thumb.decode().then(() => swapPostcard(run), () => swapPostcard(run));
  };
  postcardPhotoFrame.animate([
    { height: '148px', borderRadius: '2px' },
    { height: '148px', borderRadius: '2px', offset: lift },
    { height: `${r.height}px`, borderRadius: '10px' },
  ], timing);
  for (const text of [postcardName, postcardMeta]) {
    const height = `${text.getBoundingClientRect().height}px`;
    text.animate([
      { height, opacity: 1 },
      { height, opacity: 1, offset: lift },
      { height: '0px', opacity: 0, offset: 0.7 },
      { height: '0px', opacity: 0 },
    ], timing);
  }
}

export function swapPostcard(run) {
  if (postcardRun !== run) return;
  host.revealThumbCurrent();
  clearPostcard();
  postcardDone();
  audio.tick();
  // The slot takes the weight: a small press and rebound.
  run.thumb.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(.975)', offset: 0.35 },
    { transform: 'scale(1.008)', offset: 0.7 },
    { transform: 'scale(1)' },
  ], { duration: 300, easing: 'ease-out' });
}

export function resetFlyoverExtras() {
  timeScale = 1;
  shockwave.visible = false;
  audio.whooshStop();
  correctPin.setColor(ANSWER_COLOR);
  setCameraFov(FOV);
  clearPostcard();
  afterPostcard = null;
  bullseyeStamp.getAnimations().forEach((a) => a.cancel());
  bullseyeStamp.hidden = true;
  document.body.classList.remove('bullseye');
  const pill = gameEls.travelDistance;
  pill.classList.remove('suspense', 'deadpan');
  pill.querySelector('small').textContent = 'away';
}

export function clearReveal() {
  travelAnimation = null;
  northUpRevealToken += 1;
  travelHead.visible = false;
  setCameraNear(0.05);
  gameEls.travelDistance.getAnimations().forEach((a) => a.cancel());
  gameEls.travelDistance.hidden = true;
  hideRevealSheet();
  resetFlyoverExtras();
  correctPin.release();
  answerLine.visible = false;
  clearCountryOutline();
  clearRegionOutline();
  state.revealView = null;
  for (const pin of pins) pin.release();
  state.activePin = -1;
  host.clearPendingGuess();
  host.hideReviewVisuals();
}

// Rotation axis of the shortest great circle from a to b. Coincident or exactly
// antipodal points have no unique circle (slerp divides by sin(pi) = 0 there),
// so route through the same midpoint frameRevealPoints falls back to.
export function routeAxis(a, b) {
  const axis = new THREE.Vector3().crossVectors(a, b);
  if (axis.lengthSq() > 1e-12) return axis.normalize();
  const mid = new THREE.Vector3().crossVectors(a, _UP);
  if (mid.lengthSq() < 1e-12) mid.copy(_RIGHT);
  return axis.crossVectors(a, mid.normalize()).normalize();
}

// The route floats ROUTE_LIFT above the surface mid-flight but eases down to
// radius 1 at both ends, so it emerges from (and lands at) the pin bases. A
// constant 1.012 left the line start hovering ~6x the shrunken flight-pin
// height above the guess pin, a visible gap from the low flyover camera.
// Line vertices, head marker and camera target all share this radius.
export const ROUTE_LIFT = 0.012;
export const ROUTE_RAMP = 2 * DEG;
export function routeRadius(angle, t) {
  const s = clamp((Math.min(t, 1 - t) * angle) / ROUTE_RAMP, 0, 1);
  return 1 + ROUTE_LIFT * s * s * (3 - 2 * s);
}

export function buildAnswerPath(guess, answer) {
  const a = latLngToVec3(guess.lat, guess.lng);
  const b = latLngToVec3(answer.lat, answer.lng);
  const angle = a.angleTo(b);
  const axis = routeAxis(a, b);
  // Dense enough that the progressively revealed head remains smooth even on
  // near-antipodal trips (drawRange advances through these vertices).
  const count = Math.max(48, Math.ceil(angle / (0.35 * DEG)));
  const points = [];
  for (let i = 0; i <= count; i++) {
    points.push(a.clone().applyAxisAngle(axis, (i / count) * angle).multiplyScalar(routeRadius(angle, i / count)));
  }
  answerLine.geometry.dispose();
  answerLine.geometry = new LineGeometry().setPositions(points.flatMap((point) => point.toArray()));
  answerLine.geometry.instanceCount = points.length - 1;
  answerLine.computeLineDistances();
  return { a, b, points, axis, angle };
}

// The answer's borders: its country, plus its state inside it when the
// answer is a US city (regionKey is null for landmarks by design).
function showAnswerOutlines(item, fade) {
  showCountryOutline(countryKey(item), item, fade);
  const rk = regionKey(item);
  if (rk) showRegionOutline(rk, item, fade);
  else clearRegionOutline();
}

export function placeRevealVisual(guess, answer) {
  const { a, b } = buildAnswerPath(guess, answer);
  if (state.activePin >= 0) pins[state.activePin].drop(a);
  correctPin.drop(b);
  answerLine.visible = true;
  frameRevealPoints(a, b);
  showAnswerOutlines(answer, false);
  return { a, b };
}

export function beginNorthUpReveal(guess, answer, km, newlyEarned, tier, options = {}) {
  const { a, b } = buildAnswerPath(guess, answer);
  if (state.activePin >= 0) pins[state.activePin].drop(a);
  if (tier === 'bullseye' || tier === 'pinpoint') correctPin.setColor(GOLD_COLOR, '#fff6d8');
  correctPin.drop(b);
  answerLine.visible = true;
  gameEls.distance.textContent = formatKm(km);
  preparePostcard(answer, newlyEarned, km, options.plain);
  frameNorthUpRevealPoints(a, b);
  showAnswerOutlines(answer, true);
  startRevealBeat(a, b, tier !== 'bullseye');
  const token = ++northUpRevealToken;
  const watchLanding = () => {
    if (token !== northUpRevealToken || state.gameMode !== 'reveal') return;
    if (correctPin.t < LAND_T) {
      requestAnimationFrame(watchLanding);
      return;
    }
    if (tier === 'bullseye' || tier === 'pinpoint') {
      audio.thump(1.7);
      audio.chime();
    } else {
      audio.thump();
      if (tier === 'blowout') audio.bwomp();
    }
    postcardLanded(b);
  };
  requestAnimationFrame(watchLanding);
}

export function beginTravelReveal(guess, answer, km, newlyEarned, tier = flyoverTier(km), options = {}) {
  if (state.revealViewPreference === 'north-up') {
    beginNorthUpReveal(guess, answer, km, newlyEarned, tier, options);
    return;
  }
  const path = buildAnswerPath(guess, answer);
  const flight = travelFlightProfile(km);
  answerLine.visible = false;
  answerLine.geometry.instanceCount = 0;
  correctPin.root.visible = false;
  correctPin.state = 'idle';
  gameEls.distance.textContent = formatKm(km);
  gameEls.travelDistance.querySelector('span').textContent = '0 km';
  gameEls.travelDistance.hidden = true;
  preparePostcard(answer, newlyEarned, km, options.plain);
  travelAnimation = {
    ...path,
    km,
    tier,
    flyAlt: flight.altitude,
    flyBack: flight.trail,
    // Short hops used to crawl and long hauls rush at a fixed 2.1 s. A near
    // miss takes longer so it can decelerate into the answer; a blowout whips.
    travelDuration: tier === 'near' ? 3.1
      : tier === 'blowout' ? 1.2
      : THREE.MathUtils.lerp(1.8, 2.4, smoothstep(clamp((km - 100) / 12000, 0, 1))),
    progress: tier === 'near' ? nearMissProgress : travelProgress,
    diveDuration: tier === 'blowout' ? 0.5 : 0.8,
    // The blowout holds on the deadpan distance before pulling back.
    arriveDuration: tier === 'blowout' ? 1.5 : 0.5,
    lastT: 0,
    elapsed: 0,
    answerDropped: false,
    startDist: state.dist,
    pullbackStarted: false,
    pinBlend: 0,
    flyRef: null,
  };
  // The close flight camera sits ~0.1 above the ground; the default 0.05 near
  // plane sliced through the surface at the bottom of the frame and at the pin.
  setCameraNear(0.005);
  state.vYaw = state.vPitch = state.autoSpin = 0;
}

// Bullseye: no flight. Snap-zoom onto the answer, drop a gold pin, roll a
// shockwave across the surface in slow motion, stamp it, then the usual pullback.
export function beginBullseyeReveal(guess, answer, km, newlyEarned, tier = flyoverTier(km), options = {}) {
  if (state.revealViewPreference === 'north-up') {
    beginNorthUpReveal(guess, answer, km, newlyEarned, tier, options);
    return;
  }
  const path = buildAnswerPath(guess, answer);
  answerLine.visible = false;
  correctPin.root.visible = false;
  correctPin.state = 'idle';
  correctPin.setColor(GOLD_COLOR, '#fff6d8');
  gameEls.distance.textContent = formatKm(km);
  preparePostcard(answer, newlyEarned, km, options.plain);
  travelAnimation = {
    ...path,
    km,
    // Keep the landing stamp in sync with the exact-distance classification
    // selected in revealGuess; `km` is rounded only for display.
    tier,
    elapsed: 0,
    startDist: state.dist,
    answerDropped: false,
    pullbackStarted: false,
    pinBlend: 0,
  };
  state.vYaw = state.vPitch = state.autoSpin = 0;
}

export let cameraNearBase = 0.05;
export function setCameraNear(near) {
  cameraNearBase = near;
  applyCameraNear();
}
// Deep player zoom sits ~0.03 above the surface, inside the 0.05 near plane:
// pull the plane in with altitude so it never slices the globe.
export function applyCameraNear() {
  const near = Math.min(cameraNearBase, Math.max((state.dist - 1) * 0.5, 0.002));
  if (camera.near === near) return;
  camera.near = near;
  camera.updateProjectionMatrix();
}

// Only the blowout whip-pan widens the lens; everything that solves framing
// assumes FOV, so it is always restored before the pullback.
export function setCameraFov(fov) {
  if (camera.fov === fov) return;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// Two-beat reveal: the map plays alone (route, framing, score pill, distance
// riding the line) for REVEAL_BEAT_MS, then the bottom sheet peeks up. The
// peek bar carries name, score, distance and Next; a tap (or swipe up) opens
// the photo and fact underneath.
// ---------------------------------------------------------------------------
export const REVEAL_BEAT_MS = 1500;
export const SHEET_SLIDE_MS = 380;
export const SHEET_PEEK_H = 80;
export const REVEAL_HEADER_H = 52; // the collapsed one-line header, see styles/game.css
export let sheetTimer = 0;
export let lineLabel = null; // { mid, a, b } globe-local, while the label is on

// Beat one. Called as the camera starts settling on the final framing.
export function startRevealBeat(a, b, showLabel = true) {
  gameEls.revealPill.hidden = !gameEls.revealPill.textContent;
  if (!gameEls.revealPill.hidden) {
    gameEls.revealPill.animate([
      { opacity: 0, transform: 'translateX(-50%) translateY(-6px) scale(.92)' },
      { opacity: 1, transform: 'translateX(-50%) translateY(0) scale(1)' },
    ], { duration: 320, delay: 360, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' }); // after the header collapse
  }
  if (showLabel) showLineLabel(a, b);
  clearTimeout(sheetTimer);
  sheetTimer = setTimeout(() => showRevealSheet(true), REVEAL_BEAT_MS);
  postcardCardShown(REVEAL_BEAT_MS + SHEET_SLIDE_MS);
}

export function showRevealSheet(animate) {
  clearTimeout(sheetTimer);
  sheetTimer = 0;
  if (state.gameMode !== 'reveal') return;
  const sheet = gameEls.reveal;
  sheet.getAnimations().forEach((a) => a.cancel());
  sheet.hidden = false;
  if (animate) {
    sheet.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
      { duration: SHEET_SLIDE_MS, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' });
  }
  // The score moves into the peek bar; the floating pill bows out.
  if (!gameEls.revealPill.hidden) fadeElement(gameEls.revealPill, false, 220);
}

export function hideRevealSheet() {
  clearTimeout(sheetTimer);
  sheetTimer = 0;
  gameEls.reveal.getAnimations().forEach((a) => a.cancel());
  gameEls.reveal.hidden = true;
  setSheetExpanded(false);
  gameEls.revealPill.getAnimations().forEach((a) => a.cancel());
  gameEls.revealPill.hidden = true;
  gameEls.header.getAnimations().forEach((a) => a.cancel());
  hideLineLabel();
}

export function setSheetExpanded(expanded) {
  gameEls.reveal.classList.toggle('expanded', expanded);
  gameEls.peekBar.setAttribute('aria-expanded', String(expanded));
  gameEls.sheetContent.setAttribute('aria-hidden', String(!expanded));
}

// The clue header snaps to its one-line height (so the framing below can
// rely on it) and the change is played back as a FLIP height animation.
export function collapseRoundHeader(fromHeight) {
  const header = gameEls.header;
  header.getAnimations().forEach((a) => a.cancel());
  header.animate([{ height: `${fromHeight}px` }, { height: `${REVEAL_HEADER_H}px` }],
    { duration: 340, easing: 'cubic-bezier(.3,.8,.2,1)' });
  gameEls.revealName.animate([
    { opacity: 0, transform: 'translateY(6px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration: 300, delay: 140, easing: 'ease-out', fill: 'backwards' });
}

// The unobscured strip the reveal frames its pins into: below the collapsed
// header and score pill, and inside the top 60% of the screen so the peek bar
// (and most of the expanded sheet) never sits on a pin.
export function revealStrip() {
  const top = gameEls.header.getBoundingClientRect().top || 14;
  const safeTop = Math.min(state.viewH * 0.36, top + REVEAL_HEADER_H + 40);
  const safeBottom = Math.max(safeTop + 120, Math.min(state.viewH * 0.6, state.viewH - SHEET_PEEK_H - 24));
  return { safeTop, safeBottom };
}

export function showLineLabel(a, b) {
  const mid = a.clone().add(b);
  if (mid.lengthSq() < 1e-8) mid.copy(a).cross(_UP);
  lineLabel = { mid: mid.normalize().multiplyScalar(1 + ROUTE_LIFT), a: a.clone(), b: b.clone() };
  const el = gameEls.lineDistance;
  el.textContent = gameEls.distance.textContent;
  el.hidden = true; // updateLineLabel() shows it once it has a position
  el.dataset.fresh = '1';
}

export function hideLineLabel() {
  lineLabel = null;
  gameEls.lineDistance.getAnimations().forEach((a) => a.cancel());
  gameEls.lineDistance.hidden = true;
}

export const _labelS = new THREE.Vector3();

// The lowest screen y the label may reach: the top of the reveal sheet (live,
// so it follows the slide-in and the expand), and the postcard's held spot
// when it is out over the label's column (padded for its tilt and pop lift).
export function lineLabelFloor(x, w) {
  const gap = 8;
  let floor = state.viewH - gap;
  if (!gameEls.reveal.hidden) floor = Math.min(floor, gameEls.reveal.getBoundingClientRect().top - gap);
  const run = postcardRun;
  if (!postcard.hidden && run && run.y != null && x < run.x + POSTCARD_W + 12 && x + w > run.x - 12) {
    floor = Math.min(floor, run.y - 16 - gap);
  }
  return floor;
}

// Pin the distance to the route midpoint every frame. When the pins are close
// on screen the label lifts above them instead of sitting on the markers.
export function updateLineLabel() {
  if (!lineLabel) return;
  const el = gameEls.lineDistance;
  const m = projectToScreen(lineLabel.mid, _labelS);
  const onScreen = m.facing && m.x > 0 && m.x < state.viewW && m.y > 0 && m.y < state.viewH;
  if (!onScreen) {
    el.hidden = true;
    return;
  }
  const { a, b } = lineLabel;
  const pa = projectToScreen(a, _labelS);
  const pb = projectToScreen(b, _labelS);
  // Long routes: the label sits on the line like a map label. Short ones:
  // it steps off the line along its upward normal, clear of both pins; when
  // the pins all but coincide it rises above their heads.
  const dx = pb.x - pa.x, dy = pb.y - pa.y;
  const len = Math.hypot(dx, dy);
  let ox = 0, oy = 0;
  if (len < 56) oy = -52;
  else if (len < 170) {
    const sign = dx >= 0 ? 1 : -1; // pick the normal that points up the screen
    ox = (dy / len) * 30 * sign;
    oy = (-dx / len) * 30 * sign;
  }
  const w = el.offsetWidth || 80;
  const h = el.offsetHeight || 26;
  const x = clamp(m.x + ox - w / 2, 8, state.viewW - w - 8);
  let y = m.y + oy - 14;
  // Never let the sheet or the held postcard cover the distance: rise above them.
  const floor = lineLabelFloor(x, w);
  if (y + h > floor) y = Math.max(8, floor - h);
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  if (el.hidden) {
    el.hidden = false;
    if (el.dataset.fresh) {
      delete el.dataset.fresh;
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 200, easing: 'ease-out', fill: 'backwards' });
    }
  }
}

export function travelView(point) {
  const direction = point.clone().normalize();
  return {
    yaw: Math.atan2(-direction.x, direction.z),
    pitch: clamp(Math.asin(clamp(direction.y, -1, 1)), -PITCH_LIMIT, PITCH_LIMIT),
  };
}

export function followTravelPoint(point, lambda = 12) {
  const view = travelView(point);
  state.revealView = { yaw: nearAngle(view.yaw, state.yaw), pitch: view.pitch, lambda };
}

// Trapezoidal velocity: ease in over the first and out over the last
// TRAVEL_RAMP of the leg, constant cruise between. The old linear progress
// lurched from a standstill at the end of the dive. Head, line, camera and
// counter all share this progress, so they stay in lockstep.
export const TRAVEL_RAMP = 0.18;
export function travelProgress(u) {
  const v = 1 / (1 - TRAVEL_RAMP);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < TRAVEL_RAMP) return (v * u * u) / (2 * TRAVEL_RAMP);
  if (u > 1 - TRAVEL_RAMP) return 1 - (v * (1 - u) ** 2) / (2 * TRAVEL_RAMP);
  return v * (u - TRAVEL_RAMP / 2);
}

// Near miss: the same quick ease-in, then a long cubic ease-out so the head,
// line and counter all crawl the last few km together. The ease-in constant is
// solved so velocity is continuous where the two pieces meet.
export const NEAR_RAMP = 0.15;
export const NEAR_K = 3 / (2 * NEAR_RAMP + NEAR_RAMP * NEAR_RAMP);
export function nearMissProgress(u) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < NEAR_RAMP) return NEAR_K * u * u;
  const head = NEAR_K * NEAR_RAMP * NEAR_RAMP;
  const s = (u - NEAR_RAMP) / (1 - NEAR_RAMP);
  return head + (1 - head) * (1 - (1 - s) ** 3);
}

// Unit vector on the route, globe-local; t outside 0..1 extends the circle.
export function travelPointAt(anim, t, out = new THREE.Vector3()) {
  return out.copy(anim.a).applyAxisAngle(anim.axis, t * anim.angle);
}

// At 0.05 (~320 km) short hops often framed only blank ocean or plain; 0.11
// (~700 km) keeps coastlines, rivers and lakes in view while still reading as
// a low flyover. The trail scales with it to hold the same look-down angle.
export const FLY_ALT = 0.11;             // short-hop altitude above the surface (globe radii)
export const FLY_BACK = 4.6 * DEG;       // short-hop trail keeps the camera close to the route
export const FLY_DROP_BACK = 0.3 * DEG;  // nearly overhead by the time the pin lands
export const _flyM = new THREE.Matrix4();
export const _flyQ = new THREE.Quaternion();
export const _flyUp = new THREE.Vector3();
export const _flyFwd = new THREE.Vector3();
export const _flyPos = new THREE.Vector3();
export const _flyDir = new THREE.Vector3();
export const _flyTarget = new THREE.Vector3();

// Pull progressively farther away as the route grows. Short trips keep a
// close (but context-revealing) flyover; medium trips rise enough to reveal curvature; long
// hauls climb to a planetary view. The wider trail at altitude aims farther
// along the great circle instead of staring straight down at passing terrain.
export function travelFlightProfile(km) {
  if (km <= 1000) return { altitude: FLY_ALT, trail: FLY_BACK };
  if (km <= 5000) {
    const t = smoothstep((km - 1000) / 4000);
    return {
      altitude: THREE.MathUtils.lerp(FLY_ALT, 0.35, t),
      trail: THREE.MathUtils.lerp(FLY_BACK, 22 * DEG, t),
    };
  }
  const t = smoothstep(clamp((km - 5000) / 7000, 0, 1));
  return {
    altitude: THREE.MathUtils.lerp(0.35, 0.85, t),
    trail: THREE.MathUtils.lerp(22 * DEG, 40 * DEG, t),
  };
}

// World-space flight pose for route progress t. The camera and target are both
// on the great circle, so there is no lateral drift, and looking at the exact
// head position keeps the glow and the end of the line locked to screen centre.
// Over the last 20% the trail closes up, pitching the camera toward the surface
// for a near-overhead pin placement.
export function flightPose(anim, t) {
  const dropT = smoothstep(clamp((t - 0.8) / 0.2, 0, 1));
  const trail = THREE.MathUtils.lerp(anim.flyBack, FLY_DROP_BACK, dropT);
  const altitude = THREE.MathUtils.lerp(anim.flyAlt, FLY_ALT, dropT);
  travelPointAt(anim, t - trail / Math.max(anim.angle, 1e-6), _flyUp).applyQuaternion(globe.quaternion);
  _flyPos.copy(_flyUp).multiplyScalar(1 + altitude);
  travelPointAt(anim, t, _flyTarget).multiplyScalar(routeRadius(anim.angle, t)).applyQuaternion(globe.quaternion);
  // Keeping the route tangent as screen-up makes the revealed line run through
  // the centre of the view and remains stable as the camera turns downward.
  _flyFwd.copy(anim.axis).applyQuaternion(globe.quaternion).cross(_flyTarget).normalize();
  _flyM.lookAt(_flyPos, _flyTarget, _flyFwd);
  _flyQ.setFromRotationMatrix(_flyM);
}

// Blend from the orbit camera frame() just placed (w = 0) to the flight pose
// (w = 1). Direction is slerped and radius lerped so the path stays outside
// the globe; orientation is a quaternion slerp, which cannot hit the lookAt
// singularity a lerped up-vector does.
//
// Southbound routes put the flight pose ~180 deg of roll from the north-up
// orbit view, where shortest-path slerp flips between rolling left and right
// as the globe settles. The flight quaternion's sign is kept continuous from
// frame to frame instead (anim.flyRef, reset whenever w = 0 or 1 so the choice
// never shows), and the blend never re-picks the short way.
export function placeTravelCamera(anim, t, w) {
  flightPose(anim, t);
  if (!anim.flyRef) {
    if (_flyQ.dot(camera.quaternion) < 0) negateQuaternion(_flyQ);
    anim.flyRef = new THREE.Quaternion();
  } else if (_flyQ.dot(anim.flyRef) < 0) negateQuaternion(_flyQ);
  anim.flyRef.copy(_flyQ);
  if (w >= 1) {
    camera.position.copy(_flyPos);
    camera.quaternion.copy(_flyQ);
  } else {
    const r = THREE.MathUtils.lerp(camera.position.length(), _flyPos.length(), w);
    _flyDir.copy(camera.position).normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(_flyDir, _flyPos.clone().normalize());
    _flyDir.applyQuaternion(new THREE.Quaternion().slerp(turn, w));
    camera.position.copy(_flyDir).multiplyScalar(r);
    slerpDirect(camera.quaternion, _flyQ, w);
  }
  camera.updateMatrixWorld();
}

export function negateQuaternion(q) {
  return q.set(-q.x, -q.y, -q.z, -q.w);
}

// q = slerp(q, target, w) along the arc the signs describe (no shortest-path flip).
export function slerpDirect(q, target, w) {
  const theta = Math.acos(clamp(q.dot(target), -1, 1));
  const s = Math.sin(theta);
  if (s < 1e-5) return q.slerp(target, w);
  const ka = Math.sin((1 - w) * theta) / s;
  const kb = Math.sin(w * theta) / s;
  return q.set(
    q.x * ka + target.x * kb,
    q.y * ka + target.y * kb,
    q.z * ka + target.z * kb,
    q.w * ka + target.w * kb,
  ).normalize();
}

// Constant on-screen size: the fixed 0.0008 radius suited only the close
// short-hop camera and vanished on medium and long hauls flown higher up.
export const _headW = new THREE.Vector3();
export function sizeTravelHead(k = 1) {
  _headW.copy(travelHead.position).applyQuaternion(globe.quaternion);
  travelHead.scale.setScalar(Math.max(camera.position.distanceTo(_headW) * 0.015 * k, 1e-6));
}

// During the travel the pins are sized from their real distance to the flight
// camera (blended in/out by anim.pinBlend). Sized for the orbit distance they
// filled the screen at take-off, and the answer pin fell from above the camera.
export const _pinW = new THREE.Vector3();
export function travelPinScale(pin, base) {
  const w = travelAnimation ? travelAnimation.pinBlend : 0;
  if (!(w > 0) || !pin.root.visible) return base;
  _pinW.set(0, 1, 0).applyQuaternion(pin.root.quaternion).applyQuaternion(globe.quaternion);
  const close = clamp(camera.position.distanceTo(_pinW) / Math.max(state.fitDist - 1, 0.1), 0.01, 6);
  return THREE.MathUtils.lerp(base, close, w);
}

// Reveal the route up to t, ending the last drawn segment exactly at the head
// instead of at the next vertex (which poked out ahead of the marker).
export function trimTravelLine(anim, t) {
  const data = answerLine.geometry.attributes.instanceStart.data;
  const segments = anim.points.length - 1;
  if (anim.trimmedSeg != null) anim.points[anim.trimmedSeg + 1].toArray(data.array, anim.trimmedSeg * 6 + 3);
  anim.trimmedSeg = null;
  if (t >= 1) {
    answerLine.geometry.instanceCount = segments;
  } else {
    const seg = Math.min(segments - 1, Math.floor(clamp(t, 0, 1) * segments));
    travelPointAt(anim, t).multiplyScalar(routeRadius(anim.angle, t)).toArray(data.array, seg * 6 + 3);
    anim.trimmedSeg = seg;
    answerLine.geometry.instanceCount = seg + 1;
  }
  data.needsUpdate = true;
}

// Fired once per reveal, the frame the answer pin touches down (its own clock,
// so it follows the bullseye slow motion).
export function answerLanded(anim) {
  anim.landed = true;
  if (anim.tier === 'bullseye' || anim.tier === 'pinpoint') {
    audio.thump(1.7);
    audio.chime();
  } else {
    audio.thump();
    if (anim.tier === 'blowout') audio.bwomp();
  }
  postcardLanded(anim.b);
}

export function watchAnswerLanding(anim) {
  if (anim.answerDropped && !anim.landed && correctPin.t >= LAND_T) answerLanded(anim);
}

// Pull back to the north-up framing of both pins, handing the distance over
// to the reveal card. Shared by the flight and the bullseye.
export function startPullback(anim) {
  anim.pullbackStarted = true;
  anim.pullbackAt = anim.elapsed;
  // The answer's country fades in as the map plays alone, not at touchdown,
  // where it would compete with the postcard pop.
  showAnswerOutlines(host.currentItem(), true);
  travelHead.visible = false;
  setCameraNear(0.05);
  setCameraFov(FOV);
  audio.whooshStop();
  anim.pullbackDist = state.dist;
  anim.pullbackFrom = { yaw: state.yaw, pitch: state.pitch };
  frameRevealPoints(anim.a, anim.b);
  // Settle on the load-time tilt (north up, 20 deg toward the viewer) rather
  // than whatever pitch centred the route; the existing yaw/pitch ease below
  // carries the globe there during the pullback, so there is no extra turn.
  anim.pullbackTo = homeRevealView(anim.a, anim.b, state.revealView);
  state.targetDist = anim.pullbackTo.dist;
  anim.finalDist = state.targetDist;
  // Hand the distance over from the flight pill to the label riding the
  // route; the sheet follows once the map has had its beat.
  if (!gameEls.travelDistance.hidden) fadeElement(gameEls.travelDistance, false, 200);
  if (!bullseyeStamp.hidden) fadeElement(bullseyeStamp, false, 260);
  startRevealBeat(anim.a, anim.b, anim.tier !== 'bullseye');
}

export function updatePullback(anim, pullbackDuration = 1.0) {
  const since = anim.elapsed - anim.pullbackAt;
  const pullbackT = smoothstep(clamp(since / pullbackDuration, 0, 1));
  state.targetDist = anim.pullbackDist + (anim.finalDist - anim.pullbackDist) * pullbackT;
  anim.pinBlend = Math.min(anim.pinBlend, 1 - pullbackT);
  // Ease the view across instead of retargeting the damper in one step, which
  // started the globe turning at full speed (a visible kick on long routes).
  // A touch during the pullback hands the view to the player.
  if (pointers.size > 0) anim.viewFree = true;
  if (!anim.viewFree) {
    state.revealView = {
      yaw: THREE.MathUtils.lerp(anim.pullbackFrom.yaw, anim.pullbackTo.yaw, pullbackT),
      pitch: THREE.MathUtils.lerp(anim.pullbackFrom.pitch, anim.pullbackTo.pitch, pullbackT),
      lambda: 14,
    };
  }
  if (since >= pullbackDuration) {
    state.targetDist = anim.finalDist;
    if (!anim.viewFree) state.revealView = anim.pullbackTo;
    travelAnimation = null;
  }
}

export function updateBullseyeAnimation(anim, dt) {
  const zoomStart = 0.45; // let the guess pin land first
  const dropAt = 0.95;
  const slowFor = 1.0; // real seconds of slow motion after touchdown
  if (anim.elapsed < zoomStart) return;
  if (!anim.zooming) {
    anim.zooming = true;
    audio.whooshStart();
  }
  // Snap: a fast damper straight down onto the answer, a quick rising zip.
  followTravelPoint(anim.b, 14);
  if (!anim.landed) state.targetDist = Math.max(SCENE_MIN_DIST, 1.42);
  const zip = clamp((anim.elapsed - zoomStart) / 0.45, 0, 1);
  audio.whooshSet(Math.sin(Math.PI * zip) * 0.8, 0.3 + 0.7 * zip);
  if (zip >= 1) audio.whooshStop();

  if (anim.elapsed >= dropAt && !anim.answerDropped) {
    correctPin.drop(anim.b);
    anim.answerDropped = true;
  }
  watchAnswerLanding(anim);
  if (!anim.landed) return;

  if (anim.landedAt == null) {
    anim.landedAt = anim.elapsed;
    anim.wave = 0;
    shockwave.quaternion.setFromUnitVectors(_UP, anim.b);
    shockwave.visible = true;
    // Stamp the empty map above the pins: the postcard pops into the band
    // below them at the same moment and would bury it there.
    const v = anim.b.clone().multiplyScalar(1.02).applyQuaternion(globe.quaternion).project(camera);
    const pinY = ((1 - v.y) / 2) * state.viewH;
    const headerBottom = gameEls.header.getBoundingClientRect().bottom || 60;
    bullseyeStamp.style.top = `${Math.max(headerBottom + 80, pinY - 140)}px`;
    setAccuracyStamp(anim.tier);
    bullseyeStamp.hidden = false;
    bullseyeStamp.animate([
      { transform: 'translate(-50%, -50%) rotate(-24deg) scale(2.6)', opacity: 0 },
      { transform: 'translate(-50%, -50%) rotate(-7deg) scale(.92)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%, -50%) rotate(-9deg) scale(1)', opacity: 1 },
    ], { duration: 380, delay: 120, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'backwards' });
    if (navigator.vibrate) navigator.vibrate([18, 40, 30]);
  }
  const since = anim.elapsed - anim.landedAt;
  // Drop into slow motion on impact and ease back to full speed.
  timeScale = since < slowFor ? 0.3 : THREE.MathUtils.lerp(0.3, 1, smoothstep(clamp((since - slowFor) / 0.4, 0, 1)));
  // A slow push-in while time is stretched.
  state.targetDist = Math.max(SCENE_MIN_DIST, 1.42 - 0.05 * smoothstep(clamp(since / slowFor, 0, 1)));
  anim.wave += (dt * timeScale) / 0.9;
  shockwaveMat.uniforms.uP.value = Math.min(anim.wave, 1);
  shockwaveMat.uniforms.uRadius.value = 0.3 * anim.pinScale;
  shockwave.visible = anim.wave < 1;

  if (since < slowFor + 0.55) return;
  if (!anim.pullbackStarted) {
    answerLine.visible = true; // the whole (tiny) route, as in the static reveal
    startPullback(anim);
  }
  updatePullback(anim);
}

export function updateTravelAnimation(dt, pinScale) {
  if (!travelAnimation) return;
  const anim = travelAnimation;
  anim.elapsed += dt;
  anim.pinScale = pinScale;
  if (anim.tier === 'bullseye' || anim.tier === 'pinpoint') {
    updateBullseyeAnimation(anim, dt);
    return;
  }
  const diveStart = 0.6; // 0.5 s pin drop, then a tiny breath before the dive
  const diveDuration = anim.diveDuration;
  const travelDuration = anim.travelDuration;
  const arriveDuration = anim.arriveDuration;
  const arriveBlend = 0.5;
  const flyDist = Math.max(SCENE_MIN_DIST, 1 + anim.flyAlt);
  const arriveDist = Math.max(SCENE_MIN_DIST, 1.52);
  const flyStart = diveStart + diveDuration;
  const arriveStart = flyStart + travelDuration;
  const pullbackStart = arriveStart + arriveDuration;

  if (anim.elapsed < diveStart) return;

  // The dive and arrive phases blend the camera between the orbit view and the
  // flight pose; previously both ends hard-cut (orbit altitude 0.36 looking
  // straight down <-> first-person at 0.075), and on arrival the orbit view was
  // still centred on the guess, so it snapped back and swung across the globe.
  if (anim.elapsed < flyStart) {
    const diveT = smoothstep(clamp((anim.elapsed - diveStart) / diveDuration, 0, 1));
    followTravelPoint(anim.a, 10);
    state.targetDist = anim.startDist + (flyDist - anim.startDist) * diveT;
    anim.pinBlend = diveT;
    placeTravelCamera(anim, 0, diveT);
    audio.whooshStart();
    audio.whooshSet(0.35 * diveT, 0.15 * diveT);
    return;
  }

  const travelU = (anim.elapsed - flyStart) / travelDuration;
  const travelT = anim.progress(travelU);
  if (anim.elapsed < arriveStart) {
    answerLine.visible = true;
    if (gameEls.travelDistance.hidden) {
      gameEls.travelDistance.hidden = false;
      fadeElement(gameEls.travelDistance, true, 220);
    }
    trimTravelLine(anim, travelT);
    const head = travelPointAt(anim, travelT);
    travelHead.position.copy(head).multiplyScalar(routeRadius(anim.angle, travelT));
    travelHead.visible = true;
    // Keep the orbit view moving with the flight so that when the camera blends
    // back out on arrival it is already above the answer. Interpolating the
    // endpoint views (rather than chasing the head's yaw) avoids a sudden
    // 180 deg globe spin, and a sweep of the world-space lighting, whenever a
    // route passes near a pole.
    if (!anim.flightViews) {
      const from = travelView(anim.a);
      const to = travelView(anim.b);
      from.yaw = nearAngle(from.yaw, state.yaw);
      to.yaw = nearAngle(to.yaw, from.yaw);
      anim.flightViews = { from, to };
    }
    const { from, to } = anim.flightViews;
    state.revealView = {
      yaw: THREE.MathUtils.lerp(from.yaw, to.yaw, travelT),
      pitch: THREE.MathUtils.lerp(from.pitch, to.pitch, travelT),
      lambda: 10,
    };
    state.targetDist = flyDist;
    anim.pinBlend = 1;
    // Whoosh: volume follows the progress velocity (relative to cruise), pitch
    // the real ground speed, so a blowout screams and a near miss sighs.
    const rate = dt > 0 ? (travelT - anim.lastT) / (dt / travelDuration) : 0;
    anim.lastT = travelT;
    const level = clamp(rate / 1.22, 0, 1);
    const groundSpeed = clamp((rate * anim.angle) / travelDuration / 1.9, 0, 1);
    audio.whooshSet(0.35 + 0.65 * level, level * (0.25 + 0.75 * Math.sqrt(groundSpeed)));
    // Whip-pan: the lens widens with speed so the globe streaks past.
    if (anim.tier === 'blowout') setCameraFov(FOV + 14 * level);
    placeTravelCamera(anim, travelT, 1);
    sizeTravelHead();
    // Same progress as the head (the old ease-out counter ran ~35% ahead of
    // the marker mid-flight).
    gameEls.travelDistance.querySelector('span').textContent = formatKm(Math.round(anim.km * travelT));
    if (anim.tier === 'near') gameEls.travelDistance.classList.toggle('suspense', travelU > 0.45);
    return;
  }

  if (!anim.answerDropped) {
    trimTravelLine(anim, 1);
    setCameraFov(FOV);
    audio.whooshStop();
    const pill = gameEls.travelDistance;
    pill.querySelector('span').textContent = formatKm(anim.km);
    pill.classList.remove('suspense');
    if (anim.tier === 'blowout') {
      pill.classList.add('deadpan');
      pill.querySelector('small').textContent = DEADPAN_LINES[Math.floor(Math.random() * DEADPAN_LINES.length)];
    }
    correctPin.drop(anim.b);
    anim.answerDropped = true;
    anim.flyRef = null; // w is ~1 here, so re-picking the short way is invisible
  }
  watchAnswerLanding(anim);
  if (anim.elapsed < pullbackStart) {
    const arriveT = smoothstep(clamp((anim.elapsed - arriveStart) / arriveBlend, 0, 1));
    followTravelPoint(anim.b, 10);
    state.targetDist = flyDist + (arriveDist - flyDist) * arriveT;
    placeTravelCamera(anim, 1, 1 - arriveT);
    // Shrink the head into the landing pin instead of blinking it out.
    const shrink = 1 - clamp((anim.elapsed - arriveStart) / 0.18, 0, 1);
    travelHead.position.copy(anim.b).multiplyScalar(routeRadius(anim.angle, 1));
    travelHead.visible = shrink > 0;
    if (shrink > 0) sizeTravelHead(smoothstep(shrink));
    return;
  }

  if (!anim.pullbackStarted) startPullback(anim);
  updatePullback(anim);
}

// Put the midpoint of the shortest great-circle arc in the unobscured strip
// between the clue header and result card, then back the camera up until the
// two endpoints (plus marker clearance) fit inside that strip.
export function safeStrip(headerEl, cardEl) {
  const header = headerEl.getBoundingClientRect();
  const card = cardEl.getBoundingClientRect();
  const safeTop = Math.min(state.viewH * 0.42, header.bottom + 18);
  return { safeTop, safeBottom: Math.max(safeTop + 80, card.top - 18) };
}

export function frameRevealPoints(a, b, strip = revealStrip()) {
  const { safeTop, safeBottom } = strip;
  const safeY = (safeTop + safeBottom) / 2;
  const safeRadius = Math.max(40, Math.min(state.viewW / 2 - 28, safeY - safeTop, safeBottom - safeY));
  const separation = a.angleTo(b);
  const halfAngle = Math.min(84 * DEG, separation / 2 + 4 * DEG);
  const screenSlope = (safeRadius / (state.viewH / 2)) * Math.tan((FOV / 2) * DEG);
  const screenFit = Math.cos(halfAngle) + Math.sin(halfAngle) / Math.max(screenSlope, 0.02);
  const horizonFit = halfAngle < Math.PI / 2 ? 1 / Math.max(Math.cos(halfAngle), 0.04) : 14;
  state.targetDist = clamp(Math.max(screenFit, horizonFit) * 1.04, SCENE_MIN_DIST, 14);

  // Slerp's halfway point is simply the normalized vector sum, except for the
  // vanishingly rare antipodal case where a stable perpendicular is used.
  const midpoint = a.clone().add(b);
  if (midpoint.lengthSq() < 1e-8) midpoint.copy(a).cross(_UP);
  midpoint.normalize();

  // Aim that midpoint at the safe area's vertical centre rather than beneath
  // the result card. This is the same two-axis solve used by globe dragging.
  const ndcY = 1 - (safeY / state.viewH) * 2;
  const rayDir = new THREE.Vector3(0, ndcY * Math.tan((FOV / 2) * DEG), -1).normalize();
  const ray = new THREE.Ray(new THREE.Vector3(0, 0, state.targetDist), rayDir);
  const target = ray.intersectSphere(_unitSphere, new THREE.Vector3()) || new THREE.Vector3(0, 0, 1);
  const R = Math.hypot(target.y, target.z);
  const alpha = Math.atan2(target.z, target.y);
  const spread = Math.acos(clamp(midpoint.y / Math.max(R, 1e-6), -1, 1));
  const candidates = [alpha + spread, alpha - spread].map((p) => clamp(nearAngle(p, state.pitch), -PITCH_LIMIT, PITCH_LIMIT));
  const targetPitch = candidates.reduce((best, p) => Math.abs(p - state.pitch) < Math.abs(best - state.pitch) ? p : best);
  const cp = Math.cos(targetPitch), sp = Math.sin(targetPitch);
  const mx = target.x;
  const mz = -target.y * sp + target.z * cp;
  const targetYaw = nearAngle(Math.atan2(mx, mz) - Math.atan2(midpoint.x, midpoint.z), state.yaw);
  state.revealView = { yaw: targetYaw, pitch: targetPitch };
  state.vYaw = state.vPitch = state.autoSpin = 0;
}

// North-up reveals preserve the player's pitch and rotate only around the
// globe's polar axis. Distance still changes as needed to keep both pins in view.
export function frameNorthUpRevealPoints(a, b, strip = revealStrip()) {
  const { safeTop, safeBottom } = strip;
  const safeY = (safeTop + safeBottom) / 2;
  const safeRadius = Math.max(40, Math.min(state.viewW / 2 - 28, safeY - safeTop, safeBottom - safeY));
  const separation = a.angleTo(b);
  const halfAngle = Math.min(84 * DEG, separation / 2 + 4 * DEG);
  const screenSlope = (safeRadius / (state.viewH / 2)) * Math.tan((FOV / 2) * DEG);
  const screenFit = Math.cos(halfAngle) + Math.sin(halfAngle) / Math.max(screenSlope, 0.02);
  const horizonFit = halfAngle < Math.PI / 2 ? 1 / Math.max(Math.cos(halfAngle), 0.04) : 14;
  state.targetDist = clamp(Math.max(screenFit, horizonFit) * 1.04, SCENE_MIN_DIST, 14);

  const midpoint = a.clone().add(b);
  if (midpoint.lengthSq() < 1e-8) midpoint.copy(a).cross(_UP);
  midpoint.normalize();
  const targetYaw = nearAngle(Math.atan2(-midpoint.x, midpoint.z), state.yaw);
  state.revealView = { yaw: targetYaw, pitch: state.pitch };
  state.vYaw = state.vPitch = state.autoSpin = 0;
}

// The view frameRevealPoints picked, re-solved at the load-time pitch: yaw
// centres the route midpoint horizontally and the distance backs off until
// both pins sit in the safe strip, clear of the horizon. Routes too far from
// the equator to fit that way step the pitch toward the solved one.
export function homeRevealView(a, b, solved) {
  const { safeTop, safeBottom } = revealStrip();
  const tanV = Math.tan((FOV / 2) * DEG);
  const aspect = state.viewW / state.viewH;
  const midpoint = a.clone().add(b);
  if (midpoint.lengthSq() < 1e-8) midpoint.copy(a).cross(_UP);
  midpoint.normalize();
  const y = nearAngle(Math.atan2(-midpoint.x, midpoint.z), solved.yaw);
  const probe = new THREE.Object3D();
  const p = new THREE.Vector3();
  const fits = (d) => [a, b].every((point) => {
    p.copy(point).applyQuaternion(probe.quaternion);
    const depth = d - p.z;
    if ((d * p.z - 1) / Math.hypot(p.x, p.y, depth) < 0.25) return false; // near or past the limb
    const sx = (0.5 + p.x / (depth * tanV * aspect) / 2) * state.viewW;
    const sy = (0.5 - p.y / (depth * tanV) / 2) * state.viewH;
    return sx > 28 && sx < state.viewW - 28 && sy > safeTop + 36 && sy < safeBottom - 10; // pin heads stand above the point
  });
  for (let k = 0; k <= 1; k += 0.25) {
    const tryPitch = THREE.MathUtils.lerp(HOME_PITCH, solved.pitch, k);
    setGlobeQuaternion(probe, y, tryPitch);
    for (let d = state.targetDist; d <= Math.min(14, state.targetDist * 1.3); d *= 1.04) {
      if (fits(d)) return { yaw: y, pitch: tryPitch, dist: d };
    }
  }
  return { ...solved, dist: state.targetDist };
}

// The route line, travel head, shockwave, bullseye stamp, postcard and thumb
// slots, then the reveal sheet's listeners, in their original order.
export function initReveal(main) {
  host = main;
  gameEls = main.gameEls;
  ensurePostcardCardStyles();
  answerLineMaterial = new LineMaterial({
    color: '#b9f7ff',
    linewidth: 2.4, // CSS pixels; stays legible when the final view pulls back
    transparent: true,
    opacity: 0.94,
    depthTest: false,
    depthWrite: false,
  });
  answerLineMaterial.resolution.set(state.viewW, state.viewH);
  answerLine = new LineSegments2(new LineGeometry(), answerLineMaterial);
  answerLine.visible = false;
  answerLine.renderOrder = 6;
  globe.add(answerLine);

  // A solid emissive-looking marker avoids the noisy transparent fringe of the
  // old additive glow sprite while remaining easy to see against the route.
  travelHead = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 12),
    new THREE.MeshBasicMaterial({ color: ANSWER_COLOR, depthTest: false, depthWrite: false }),
  );
  travelHead.visible = false;
  travelHead.renderOrder = 7;
  // Rescaled every frame by sizeTravelHead() to a constant on-screen size.
  travelHead.scale.setScalar(0.0008);
  globe.add(travelHead);

  // Gold ring that rolls out across the surface when a bullseye lands. Sized in
  // update from the pin scale so it reads the same at any zoom.
  shockwaveMat = new THREE.ShaderMaterial({
    uniforms: { uP: { value: 0 }, uRadius: { value: 0.06 }, uColor: { value: GOLD_COLOR } },
    vertexShader: /* glsl */ `
    varying vec3 vPos;
    void main() {
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
    fragmentShader: /* glsl */ `
    uniform float uP;
    uniform float uRadius;
    uniform vec3 uColor;
    varying vec3 vPos;
    void main() {
      float r = acos(clamp(normalize(vPos).y, -1.0, 1.0)) / uRadius;
      float a = 0.0;
      for (int i = 0; i < 2; i++) {
        float p = clamp((uP - float(i) * 0.16) / 0.84, 0.0, 1.0);
        float rr = 1.0 - pow(1.0 - p, 3.0);
        float w = 0.025 + p * 0.07;
        a += pow(1.0 - p, 1.6) * smoothstep(w, 0.0, abs(r - rr)) * (i == 0 ? 1.4 : 0.7) * step(0.001, p);
      }
      a += exp(-r * r * 30.0) * pow(1.0 - uP, 2.0) * 0.6; // flash at the impact point
      gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.98, 0.9), 0.25) * a, 1.0);
    }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  shockwave = new THREE.Mesh(new THREE.SphereGeometry(1.0028, 96, 24, 0, Math.PI * 2, 0, 0.4), shockwaveMat);
  shockwave.visible = false;
  shockwave.renderOrder = 3;
  globe.add(shockwave);

  bullseyeStamp = document.createElement('p');
  bullseyeStamp.className = 'bullseye-stamp';
  bullseyeStamp.hidden = true;
  document.body.append(bullseyeStamp);

  setAccuracyStamp('bullseye');

  postcard = document.createElement('figure');
  postcard.className = 'pp-post postcard';
  postcard.hidden = true;
  document.body.append(postcard);
  // The thumb sits in a slot that shows a dashed outline while the postcard is
  // out, so the card never shows an unexplained gap where the photo will land.
  // The sheet has two: the peek bar's square (where the postcard lands while
  // the sheet is collapsed) and the expanded content's wide thumb.
  const thumbSlot = document.createElement('div');
  thumbSlot.className = 'thumb-slot';
  gameEls.thumb.before(thumbSlot);
  thumbSlot.append(gameEls.thumb);
  peekSlot = gameEls.peekThumb.parentElement;
  thumbSlots = [thumbSlot, peekSlot];
  // The reveal sheet is hidden during the flight, so a lazy thumb would only
  // start fetching once the sheet appears, after the postcard needs it.
  gameEls.thumb.loading = 'eager';

  gameEls.peekBar.addEventListener('click', (e) => {
    if (sheetSwiped) {
      sheetSwiped = false;
      return;
    }
    if (e.target.closest('#next-button')) return;
    setSheetExpanded(!gameEls.reveal.classList.contains('expanded'));
  });
  gameEls.peekBar.addEventListener('keydown', (e) => {
    if (e.target !== gameEls.peekBar || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    setSheetExpanded(!gameEls.reveal.classList.contains('expanded'));
  });
  // A vertical flick on the sheet opens or closes it; the click that follows
  // the pointerup is swallowed so it does not toggle straight back.
  let sheetSwipeY = null;
  let sheetSwiped = false;
  gameEls.reveal.addEventListener('pointerdown', (e) => {
    sheetSwipeY = e.clientY;
    sheetSwiped = false;
  });
  gameEls.reveal.addEventListener('pointerup', (e) => {
    if (sheetSwipeY == null) return;
    const dy = e.clientY - sheetSwipeY;
    sheetSwipeY = null;
    if (Math.abs(dy) < 24 || e.target.closest('#next-button')) return;
    sheetSwiped = true;
    setSheetExpanded(dy < 0);
  });
  gameEls.reveal.addEventListener('pointercancel', () => { sheetSwipeY = null; });

}
