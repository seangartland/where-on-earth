#!/usr/bin/env node
// Landmark data pass, phase 2: give every landmarks-file entry missing
// `continent` one from the existing country-to-continent code path.
// Source order: (1) scripts/add-continent.mjs COUNTRY_CONTINENT, with its
// FLAG_CONTINENT territory override, read from that file's own source text
// (no copied table); (2) the country-to-continent pairs already stored in
// assets/locations.json, for countries added to the city game after that
// script ran; (3) JUDGMENT below, for entries neither covers. Entries that
// already carry a continent are left alone. Only `continent` is written,
// placed right after `country` as add-continent.mjs does.
// Usage (from demo/): node scripts/landmark-pass/continent.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const F = new URL('../../assets/locations-landmarks-sol.json', import.meta.url);
const SRC = readFileSync(new URL('../add-continent.mjs', import.meta.url), 'utf8');

function objectLiteral(name) {
  const at = SRC.indexOf(`const ${name} = {`);
  if (at < 0) throw new Error(`${name} not found in add-continent.mjs`);
  const start = SRC.indexOf('{', at);
  return Function(`return ${SRC.slice(start, SRC.indexOf('};', start) + 1)}`)();
}
const COUNTRY_CONTINENT = objectLiteral('COUNTRY_CONTINENT');
const FLAG_CONTINENT = objectLiteral('FLAG_CONTINENT');

const fromCities = {};
for (const c of JSON.parse(readFileSync(new URL('../../assets/locations.json', import.meta.url), 'utf8'))) {
  // France and Denmark have territory cities (Reunion, Greenland); keep the first, mainland, value.
  if (c.continent && !(c.country in fromCities)) fromCities[c.country] = c.continent;
}

// Entries no table covers. Reasons are repeated in docs/landmark-data-pass-report.md.
const JUDGMENT = {
  'bering-strait': ['North America', 'country is International Waters; the pin sits on the US-Russia line and the Russia table value (Europe) does not fit a Pacific strait'],
  'strait-of-gibraltar': ['Europe', 'country is International Waters and the clue names no country; the strait is named for Gibraltar, a European territory on its north shore'],
  'pico-do-fogo-cape-verde': ['Africa', 'Cape Verde is in neither table; it is an African island state'],
};

const items = JSON.parse(readFileSync(F, 'utf8'));
const log = { table: 0, flag: 0, cities: 0, judgment: 0, kept: 0 };
const missing = [];
const next = items.map((item) => {
  if (item.continent) { log.kept++; return item; }
  let continent = COUNTRY_CONTINENT[item.country];
  let how = 'table';
  const flags = item.clue?.match(/\p{Regional_Indicator}{2}/gu) || [];
  for (const flag of flags) {
    if (FLAG_CONTINENT[flag] && FLAG_CONTINENT[flag] !== continent) { continent = FLAG_CONTINENT[flag]; how = 'flag'; break; }
  }
  if (!continent && fromCities[item.country]) { continent = fromCities[item.country]; how = 'cities'; }
  if (!continent && JUDGMENT[item.id]) { continent = JUDGMENT[item.id][0]; how = 'judgment'; }
  if (!continent) { missing.push(`${item.id} (${item.country})`); return item; }
  log[how]++;
  if (how !== 'table') console.log(`${how}: ${item.id} (${item.country}) -> ${continent}`);
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    out[k] = v;
    if (k === 'country') out.continent = continent;
  }
  return out;
});

if (missing.length) {
  console.error('No continent for:', missing);
  process.exit(1);
}
writeFileSync(F, JSON.stringify(next, null, 1));
console.log(log);
