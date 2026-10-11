#!/usr/bin/env node
// One-off: add a per-item `continent` field to assets/locations.json.
// See docs/passport-redesign-opus.md §1a. A country lives on one continent
// unless a territory flag in its clue says otherwise (FLAG_CONTINENT below).

import { readFileSync, writeFileSync } from 'node:fs';

const PATH = new URL('../assets/locations.json', import.meta.url);

const COUNTRY_CONTINENT = {
  // Africa
  Nigeria: 'Africa', 'DR Congo': 'Africa', 'South Africa': 'Africa', Morocco: 'Africa',
  Tanzania: 'Africa', Angola: 'Africa', Kenya: 'Africa', "Côte d'Ivoire": 'Africa',
  Mozambique: 'Africa', Libya: 'Africa', Senegal: 'Africa', Namibia: 'Africa',
  Niger: 'Africa', Ghana: 'Africa', Ethiopia: 'Africa', Algeria: 'Africa',
  Madagascar: 'Africa', Mali: 'Africa', Malawi: 'Africa', 'Burkina Faso': 'Africa',
  Congo: 'Africa', Zimbabwe: 'Africa', Cameroon: 'Africa', Chad: 'Africa',
  Botswana: 'Africa', Somalia: 'Africa', Zambia: 'Africa', Eritrea: 'Africa',
  'Central African Republic': 'Africa', Burundi: 'Africa', Guinea: 'Africa',
  Benin: 'Africa', 'Sierra Leone': 'Africa', Uganda: 'Africa', Rwanda: 'Africa',
  Gabon: 'Africa', Togo: 'Africa', Liberia: 'Africa', Mauritania: 'Africa',
  Tunisia: 'Africa', Egypt: 'Africa', Sudan: 'Africa',

  // Asia
  China: 'Asia', India: 'Asia', Japan: 'Asia', Pakistan: 'Asia', 'South Korea': 'Asia',
  Philippines: 'Asia', Iran: 'Asia', Vietnam: 'Asia', 'Saudi Arabia': 'Asia',
  Bangladesh: 'Asia', Thailand: 'Asia', Taiwan: 'Asia', 'United Arab Emirates': 'Asia',
  Jordan: 'Asia', Malaysia: 'Asia', Yemen: 'Asia', Kazakhstan: 'Asia', Uzbekistan: 'Asia',
  Mongolia: 'Asia', Myanmar: 'Asia', Cambodia: 'Asia', Bhutan: 'Asia', Afghanistan: 'Asia',
  Syria: 'Asia', 'Sri Lanka': 'Asia', Nepal: 'Asia', Laos: 'Asia', Singapore: 'Asia',
  Azerbaijan: 'Asia', Lebanon: 'Asia', Palestine: 'Asia', Kyrgyzstan: 'Asia',
  'Timor-Leste': 'Asia', Qatar: 'Asia', Tajikistan: 'Asia', Turkmenistan: 'Asia',
  Maldives: 'Asia', Oman: 'Asia', 'North Korea': 'Asia', Armenia: 'Asia', Georgia: 'Asia',
  Iraq: 'Asia', Turkey: 'Asia', Indonesia: 'Asia', Israel: 'Asia',

  // Europe (Russia and the UK's constituent countries are explicit Sean/plan calls)
  Russia: 'Europe', Italy: 'Europe', France: 'Europe', Germany: 'Europe', Spain: 'Europe',
  Norway: 'Europe', Ukraine: 'Europe', Poland: 'Europe', Greece: 'Europe', Belgium: 'Europe',
  Switzerland: 'Europe', Portugal: 'Europe', Netherlands: 'Europe', Ireland: 'Europe',
  Austria: 'Europe', Sweden: 'Europe', 'United Kingdom': 'Europe', England: 'Europe',
  Scotland: 'Europe', Wales: 'Europe', 'Northern Ireland': 'Europe', 'Czech Republic': 'Europe',
  Croatia: 'Europe', Romania: 'Europe', Serbia: 'Europe', Finland: 'Europe', Estonia: 'Europe',
  Slovakia: 'Europe', Hungary: 'Europe', Moldova: 'Europe', Slovenia: 'Europe',
  Luxembourg: 'Europe', Belarus: 'Europe', Monaco: 'Europe', Latvia: 'Europe',
  Bulgaria: 'Europe', Liechtenstein: 'Europe', Malta: 'Europe', Lithuania: 'Europe',
  'Bosnia and Herzegovina': 'Europe', Kosovo: 'Europe', Iceland: 'Europe', Denmark: 'Europe',

  // North America
  'United States': 'North America', Canada: 'North America', Mexico: 'North America',
  Guatemala: 'North America', Honduras: 'North America', Belize: 'North America',
  Nicaragua: 'North America', Panama: 'North America', Cuba: 'North America',
  Jamaica: 'North America', Haiti: 'North America', 'Dominican Republic': 'North America',
  'El Salvador': 'North America', 'Saint Lucia': 'North America',

  // South America
  Brazil: 'South America', Colombia: 'South America', Argentina: 'South America',
  Venezuela: 'South America', Chile: 'South America', Peru: 'South America',
  Bolivia: 'South America', Ecuador: 'South America', Paraguay: 'South America',

  // Oceania
  Australia: 'Oceania', 'New Zealand': 'Oceania', 'Cook Islands': 'Oceania',
  Tuvalu: 'Oceania', Tonga: 'Oceania', Kiribati: 'Oceania', 'Papua New Guinea': 'Oceania',
  Samoa: 'Oceania', 'Marshall Islands': 'Oceania', 'Solomon Islands': 'Oceania',
  Vanuatu: 'Oceania', Palau: 'Oceania', Niue: 'Oceania', Micronesia: 'Oceania',
  Fiji: 'Oceania', Nauru: 'Oceania',

  // Antarctica
  Antarctica: 'Antarctica',
};

// Territory flags override their sovereign country's continent.
const FLAG_CONTINENT = {
  '🇷🇪': 'Africa', // Réunion (France)
  '🇳🇨': 'Oceania', // New Caledonia (France)
  '🇵🇫': 'Oceania', // French Polynesia (France)
  '🇬🇱': 'North America', // Greenland (Denmark)
  '🇵🇷': 'North America', // Puerto Rico (United States)
  '🇭🇰': 'Asia', // Hong Kong (China)
  '🇲🇴': 'Asia', // Macao (China)
};

const locations = JSON.parse(readFileSync(PATH, 'utf8'));

const missingCountries = new Set();
let overridden = 0;
const next = locations.map((item) => {
  let continent = COUNTRY_CONTINENT[item.country];
  if (!continent) missingCountries.add(item.country);
  const flags = item.clue?.match(/\p{Regional_Indicator}{2}/gu) || [];
  for (const flag of flags) {
    if (FLAG_CONTINENT[flag] && FLAG_CONTINENT[flag] !== continent) {
      continent = FLAG_CONTINENT[flag];
      overridden += 1;
      break;
    }
  }
  // Rebuild so `continent` sits right after `country` for a readable diff.
  // (A couple of items already carry a stale `continent` from an earlier
  // experiment; drop it so the freshly computed value always wins.)
  const { continent: _stale, ...rest } = item;
  const out = {};
  for (const [k, v] of Object.entries(rest)) {
    out[k] = v;
    if (k === 'country') out.continent = continent ?? null;
  }
  return out;
});

if (missingCountries.size) {
  console.error('Missing continent mapping for:', [...missingCountries]);
  process.exit(1);
}

writeFileSync(PATH, `${JSON.stringify(next, null, 2)}\n`);

const counts = new Map();
for (const item of next) counts.set(item.continent, (counts.get(item.continent) || 0) + 1);
console.log(`Wrote continent for ${next.length} locations (${overridden} territory overrides applied).`);
console.log('Per-continent counts:', Object.fromEntries(counts));
