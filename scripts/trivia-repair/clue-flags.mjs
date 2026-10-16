// Flags trivia clues for the phase 3 clue pass. Prints one block per class.
//   node scripts/trivia-repair/clue-flags.mjs [bank-path]
import { readFileSync } from 'node:fs';

const COMPASS = /\b(north|south|east|west|northern|southern|eastern|western|central|northeast(?:ern)?|northwest(?:ern)?|southeast(?:ern)?|southwest(?:ern)?|far[- ]\w+)[\s-]+((?:[A-Z][\w'’.-]*\s?)+)/;
const GENERIC = new Set(['mount', 'lake', 'city', 'national', 'park', 'island', 'islands', 'river', 'castle', 'the', 'of', 'old', 'town', 'new',
  'great', 'saint', 'san', 'santa', 'fort', 'cathedral', 'temple', 'palace', 'bridge', 'valley', 'cape', 'bay', 'station', 'battle', 'first',
  'state', 'and', 'site', 'house', 'tower', 'church', 'museum', 'gate', 'falls', 'desert', 'sea', 'canyon', 'de', 'la', 'del', 'el']);
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nameTokens = (short) => norm(short).split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !GENERIC.has(t));

// Second compass form: a named place before the compass word ("New Zealand's far north", "southwest of Jakarta").
const COMPASS2 = /\b([A-Z][\w'’.-]*(?:\s[A-Z][\w'’.-]*)*'s\s(?:far\s)?(?:north|south|east|west|northern|southern|eastern|western|central|north-?east(?:ern)?|north-?west(?:ern)?|south-?east(?:ern)?|south-?west(?:ern)?)\b|\b(?:north|south|east|west|north-?east|north-?west|south-?east|south-?west)\s+of\s+(?:the\s)?[A-Z][\w'’.-]*)/;
export function flag(bank) {
const classes = { compass: [], compassOf: [], ownName: [], deictic: [], stub: [] };
for (const e of bank) {
  const c = e.clue || '';
  const m = c.match(COMPASS);
  if (m) classes.compass.push([e, m[0].trim()]);
  const m2 = !m && c.match(COMPASS2);
  if (m2) classes.compassOf.push([e, m2[0].trim()]);
  const hit = nameTokens(e.short).filter((t) => new RegExp(`\\b${t}`).test(norm(c)));
  if (hit.length) classes.ownName.push([e, hit.join(',')]);
  const d = c.match(/\b(this|these|pictured|shown|the photo|in the picture)\b[^?]*/i);
  if (d && /\b(this|these)\s+(\w+\s){0,2}(bridge|building|tower|temple|church|statue|castle|ruin|ruins|structure|monument|mosque|landmark|stone|arch|wall|place|spot|site|view|scene|photo|picture|lake|mountain|peak|square|street|fortress|palace|cathedral)/i.test(c)) classes.deictic.push([e, d[0].slice(0, 50)]);
  if (c.length < 45) classes.stub.push([e, `${c.length} chars`]);
}
const coords = new Map();
for (const e of bank) {
  const k = `${e.lat},${e.lng}`;
  coords.set(k, [...(coords.get(k) || []), e]);
}
const shared = [...coords].filter(([, es]) => es.length > 1);
const noDiff = bank.filter((e) => !Number.isInteger(e.difficulty));
return { classes, shared, noDiff };
}

if (process.argv[1]?.endsWith('clue-flags.mjs')) {
  const bank = JSON.parse(readFileSync(process.argv[2] || new URL('../../assets/trivia-bank.json', import.meta.url), 'utf8'));
  const { classes, shared, noDiff } = flag(bank);
  const show = (e) => `${e.id} [d${e.difficulty ?? '-'}${e.photo ? ' V' : ''}] ${e.clue}`;
  for (const [k, rows] of Object.entries(classes)) {
    console.log(`\n== ${k}: ${rows.length}`);
    for (const [e, why] of rows) console.log(`  ${show(e)}   <${why}>`);
  }
  console.log(`\n== shared coordinates: ${shared.length}`);
  for (const [k, es] of shared) console.log(`  ${k}: ${es.map((e) => `${e.id} (${e.short})`).join(' | ')}`);
  console.log(`\n== missing difficulty: ${noDiff.length}`);
  console.log('  ' + noDiff.map((e) => e.id).join(', '));
}
