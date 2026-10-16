// Trivia fact pass worklist: for each playable entry in a slice, print the
// clue, the fact, the resolved Wikipedia article (and its distance from the
// pin), and the article sentences that share the most key terms (numbers,
// capitalised words, long words) with the fact and clue.
// Usage: node scripts/trivia-fact-pass/worklist.mjs <from> <to> [nSentences]
//   (from/to are 1-based positions in the playable list, bank order)
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const bank = JSON.parse(fs.readFileSync(path.join(HERE, '../../assets/trivia-bank.json'), 'utf8'));
const cache = JSON.parse(fs.readFileSync(path.join(HERE, 'wiki-cache.json'), 'utf8'));
const [from, to, nS = 6] = process.argv.slice(2).map(Number);
const playable = bank.filter(e => e.photo === 'verified');

const STOP = new Set('which where what this that with from their there these those about after before while within world first most also into over under than been were have known built where'.split(' '));
function terms(s) {
  const t = new Set();
  for (const m of s.match(/\d[\d,.]*/g) || []) t.add(m.replace(/[,.]$/, '').replace(/,/g, ''));
  for (const w of s.match(/[\p{L}'’-]+/gu) || []) {
    const l = w.toLowerCase().replace(/['’]s$/, '');
    if (l.length >= 6 && !STOP.has(l)) t.add(l.slice(0, Math.max(6, l.length - 2)));
    else if (/^\p{Lu}/u.test(w) && l.length >= 4 && !STOP.has(l)) t.add(l);
  }
  return [...t];
}

playable.slice(from - 1, to).forEach((e, i) => {
  const w = cache[e.id] || {};
  console.log(`\n### ${from + i}. ${e.id} | ${e.short} | d${e.difficulty} | wiki: ${w.title} (${w.km ?? '?'} km)`);
  console.log('CLUE: ' + e.clue);
  console.log('FACT: ' + e.fact);
  if (!w.text) return;
  const T = terms(e.fact + ' ' + e.clue);
  const sents = w.text.replace(/\n+/g, ' \n').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 20);
  const scored = sents.map((s, k) => {
    const low = s.toLowerCase().replace(/,(?=\d{3})/g, '');
    return { k, s, n: T.filter(t => low.includes(t)).length };
  }).filter(x => x.n > 0).sort((a, b) => b.n - a.n || a.k - b.k).slice(0, nS).sort((a, b) => a.k - b.k);
  for (const x of scored) console.log(`  [${x.n}] ${x.s.slice(0, 320)}`);
});
