import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/meta/passport-store.js', import.meta.url), 'utf8');
const passportSource = readFileSync(new URL('../src/meta/passport.js', import.meta.url), 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end)).replaceAll('export ', '');
const logic = `${extract('export function readPassport()', '// Non-earning modes')}\n${extract('export function recordVisit', 'export const _dotVec')}`;

const PASSPORT_KEY = 'passport-test';
const EARN_NEAR = 1;
const EARN_BULLSEYE = 2;
const EARN_PINPOINT = 3;
const saved = new Map();
const state = { passport: { visits: {}, order: [], meta: {} } };
const readJSON = (key) => saved.has(key) ? structuredClone(saved.get(key)) : null;
const writeJSON = (key, value) => saved.set(key, structuredClone(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const earnForKm = (km) => km < 1 ? 3 : km < 50 ? 2 : km < 150 ? 1 : 0;
const localDateKey = () => '2026-10-23';
const build = new Function('state', 'readJSON', 'writeJSON', 'clamp', 'earnForKm', 'localDateKey',
  'PASSPORT_KEY', 'PASSPORT_ORDER_LIMIT', 'EARN_NEAR', 'EARN_BULLSEYE', 'EARN_PINPOINT',
  `let passportDirty = false; ${logic}; return { readPassport, recordVisit };`);
const { readPassport, recordVisit } = build(state, readJSON, writeJSON, clamp, earnForKm, localDateKey,
  PASSPORT_KEY, 240, EARN_NEAR, EARN_BULLSEYE, EARN_PINPOINT);

test('non-earning visits leave Passport state untouched', () => {
  state.passport = {
    visits: { existing: 700 },
    order: ['existing'],
    meta: { existing: { b: 700, d: 80, e: EARN_NEAR, ea: 123 } },
  };
  const before = JSON.stringify(state.passport);
  assert.equal(recordVisit('practice', 4, 0.6, false), 0);
  assert.equal(JSON.stringify(state.passport), before);
  assert.equal(saved.size, 0);
});

test('earning visits keep score, distance, tier, and first-earned behavior', () => {
  assert.equal(recordVisit('place', 900, 120.4, true), EARN_NEAR);
  const firstEarned = state.passport.meta.place.ea;
  assert.equal(state.passport.meta.place.b, 900);
  assert.equal(state.passport.meta.place.d, 120);
  assert.equal(state.passport.meta.place.e, EARN_NEAR);
  assert.ok(Number.isFinite(firstEarned));

  assert.equal(recordVisit('place', 800, 40.4, true), EARN_BULLSEYE);
  assert.equal(state.passport.meta.place.b, 900);
  assert.equal(state.passport.meta.place.d, 40);
  assert.equal(state.passport.meta.place.e, EARN_BULLSEYE);
  assert.equal(state.passport.meta.place.ea, firstEarned);
});

test('non-earning revisit preserves an earned entry and its order position', () => {
  state.passport.order.unshift('other');
  state.passport.visits.other = 500;
  state.passport.meta.other = { b: 500 };
  const before = JSON.stringify(state.passport);
  assert.equal(recordVisit('place', 1000, 0, false), 0);
  assert.equal(JSON.stringify(state.passport), before);
});

test('hidden Passport chunks retain the display fix', () => {
  assert.match(passportSource, /\.pp-chunk\[hidden\] \{ display: none; \}/);
});
