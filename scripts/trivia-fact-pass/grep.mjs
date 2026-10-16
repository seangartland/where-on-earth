// Search one entry's cached Wikipedia text for a pattern (case-insensitive).
// Usage: node scripts/trivia-fact-pass/grep.mjs <id> <regex> [<id> <regex> ...]
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const cache = JSON.parse(fs.readFileSync(path.join(HERE, 'wiki-cache.json'), 'utf8'));
const a = process.argv.slice(2);
for (let i = 0; i < a.length; i += 2) {
  const w = cache[a[i]];
  const re = new RegExp(a[i + 1], 'i');
  const hits = (w?.text || '').replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).filter(s => re.test(s));
  console.log(`== ${a[i]} /${a[i + 1]}/ (${w?.title}): ${hits.length} hits`);
  hits.slice(0, 5).forEach(s => console.log('  ' + s.slice(0, 300)));
}
