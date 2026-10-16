#!/usr/bin/env node
// Checks assets/weekly-expeditions.json, the Weekly Expeditions route pool.
// Every stop must be a playable city in assets/locations.json or pass the
// Landmarks pool rule (isPoolLandmark) in the landmarks file. No stop may
// repeat across routes or reuse a classic expedition stop (assets/expeditions.json).
// Per route: exactly 7 stops, at least 4 countries, at most 2 stops per country,
// mean difficulty 3 to 8, one stop at 4 or below and one at 6 or above, stops in
// non-decreasing difficulty. Also: 34 to 38 routes, unique slug ids, name and sub
// present with no em dashes, and no photo shared between two stops.
// Usage (from demo/): node scripts/validate-weekly-expeditions.mjs

import { readFileSync } from 'node:fs';
import { isPlayableLocation } from '../src/daily.js';
import { isPoolLandmark } from '../src/modes/landmarks.js';

const load = (path) => JSON.parse(readFileSync(new URL(`../assets/${path}`, import.meta.url), 'utf8'));
const routes = load('weekly-expeditions.json');
const cities = new Map(load('locations.json').map((x) => [x.id, x]));
const landmarks = new Map(load('locations-landmarks-sol.json').map((x) => [x.id, x]));
const classicStops = new Set(load('expeditions.json').flatMap((e) => e.locationIds));

// The data stores the UK nations separately and Cape Verde under two spellings;
// count each as one country so a route cannot pass on a naming technicality.
const COUNTRY_ALIASES = { England: 'United Kingdom', Scotland: 'United Kingdom', Wales: 'United Kingdom', 'Northern Ireland': 'United Kingdom', 'Cabo Verde': 'Cape Verde' };
const countryOf = (x) => COUNTRY_ALIASES[x.country] || x.country;

const STOPS = 7;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const failures = [];
const fail = (msg) => failures.push(msg);

if (!Array.isArray(routes)) {
  console.log('FAIL: weekly-expeditions.json is not an array');
  process.exit(1);
}
if (routes.length < 34 || routes.length > 38) fail(`route count ${routes.length} is outside 34 to 38`);

const routeIds = new Set();
const stopOwner = new Map();
const imageOwner = new Map();
const lines = [];

for (const route of routes) {
  const rid = route?.id;
  if (typeof rid !== 'string' || !SLUG.test(rid)) fail(`bad route id: ${JSON.stringify(rid)}`);
  if (routeIds.has(rid)) fail(`duplicate route id: ${rid}`);
  routeIds.add(rid);
  for (const field of ['name', 'sub']) {
    const text = route?.[field];
    if (typeof text !== 'string' || !text.trim()) fail(`${rid}: missing ${field}`);
    else if (text.includes('—')) fail(`${rid}: em dash in ${field}`);
  }
  const ids = Array.isArray(route?.locationIds) ? route.locationIds : [];
  if (ids.length !== STOPS) fail(`${rid}: ${ids.length} stops, expected ${STOPS}`);

  const stops = [];
  for (const id of ids) {
    const reused = stopOwner.has(id);
    if (reused) fail(`${rid}: stop ${id} already used by ${stopOwner.get(id)}`);
    else stopOwner.set(id, rid);
    if (classicStops.has(id)) fail(`${rid}: stop ${id} is a classic expedition stop`);
    const city = cities.get(id);
    const landmark = landmarks.get(id);
    let item = null;
    if (city) {
      if (isPlayableLocation(city)) item = city;
      else fail(`${rid}: city ${id} is not playable`);
    } else if (landmark) {
      if (isPoolLandmark(landmark)) item = landmark;
      else fail(`${rid}: ${id} fails the landmark pool rule (kind ${landmark.kind})`);
    } else fail(`${rid}: unresolved stop ${id}`);
    if (!item) continue;
    if (reused) { stops.push(item); continue; }
    if (imageOwner.has(item.image)) fail(`${rid}: ${id} shares its photo with ${imageOwner.get(item.image)}`);
    else imageOwner.set(item.image, id);
    stops.push(item);
  }
  if (stops.length !== ids.length) continue;

  const perCountry = new Map();
  for (const s of stops) perCountry.set(countryOf(s), (perCountry.get(countryOf(s)) || 0) + 1);
  if (perCountry.size < 4) fail(`${rid}: ${perCountry.size} countries, need at least 4`);
  for (const [country, n] of perCountry) if (n > 2) fail(`${rid}: ${n} stops in ${country}, max 2`);

  const diffs = stops.map((s) => s.difficulty);
  if (diffs.some((d) => !Number.isInteger(d))) fail(`${rid}: a stop has no integer difficulty`);
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  if (mean < 3 || mean > 8) fail(`${rid}: mean difficulty ${mean.toFixed(2)} outside 3 to 8`);
  if (Math.min(...diffs) > 4) fail(`${rid}: no stop at difficulty 4 or below`);
  if (Math.max(...diffs) < 6) fail(`${rid}: no stop at difficulty 6 or above`);
  if (diffs.some((d, i) => i > 0 && d < diffs[i - 1])) fail(`${rid}: stops not in non-decreasing difficulty order`);

  const landmarkCount = stops.filter((s) => landmarks.has(s.id)).length;
  const countries = [...perCountry].map(([c, n]) => (n > 1 ? `${c} x${n}` : c)).join(', ');
  lines.push(`${rid.padEnd(22)} diff [${diffs.join(' ')}] mean ${mean.toFixed(2)} | ${landmarkCount} landmarks, ${STOPS - landmarkCount} cities | ${perCountry.size} countries: ${countries}`);
}

console.log(`${routes.length} routes, ${stopOwner.size} distinct stops`);
for (const line of lines) console.log(`  ${line}`);
if (failures.length) {
  console.log(`FAIL: ${failures.length} problem(s)`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log('PASS');
