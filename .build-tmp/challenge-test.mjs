import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const grab = (name) => src.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}\\n`))[0];
const { challengeUrl, parseChallenge, challengeResult } = new Function(
  `const MAX_KM = 20040;\n${grab('challengeUrl')}${grab('parseChallenge')}${grab('challengeResult')}return { challengeUrl, parseChallenge, challengeResult };`)();

// generation: strips existing query/hash, rounds km
const u = challengeUrl('https://x.app/demo/?foo=1#passport', 'fez-morocco', 42.4);
assert.equal(u, 'https://x.app/demo/?challenge=fez-morocco&dist=42');
// round trip
assert.deepEqual(parseChallenge(new URL(u).search), { id: 'fez-morocco', dist: 42 });
assert.deepEqual(parseChallenge('?challenge=a&dist=0'), { id: 'a', dist: 0 });
// rejects
for (const bad of ['', '?dist=5', '?challenge=a', '?challenge=a&dist=', '?challenge=a&dist=abc', '?challenge=a&dist=-1',
  '?challenge=a&dist=99999', '?challenge=%3Cscript%3E&dist=5', `?challenge=${'a'.repeat(65)}&dist=5`])
  assert.equal(parseChallenge(bad), null, bad);
// verdict
assert.equal(challengeResult(10, 42).result, 'win');
assert.equal(challengeResult(100, 42).result, 'lose');
assert.equal(challengeResult(42, 42).result, 'tie');
console.log('ALL PASS', u);
