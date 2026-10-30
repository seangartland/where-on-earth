import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/modes/pack.js', import.meta.url), 'utf8');

test('pack summary renders a Passport action beside the primary action', () => {
  assert.match(html, /<div class="pack-actions" hidden>[\s\S]*class="primary pack-primary"[\s\S]*>Back to packs<[\s\S]*class="pack-passport"[\s\S]*>Passport</);
});

test('pack actions are visible only when the shared done condition is true', () => {
  assert.match(source, /const done = packSummary\(currentPack\(\)\)\.played >= PACK_CARDS;\s*els\.actions\.hidden = !done;/);
  assert.match(source, /els\.passport\.addEventListener\('click', \(\) => host\.openPassport\(showPackSelect\)\)/);
  assert.doesNotMatch(source, /els\.passport\.hidden\s*=/);
});

test('pack copy is stamina-based and selection ticks rebuild skip actions', () => {
  assert.doesNotMatch(html, /Today's cards|Today’s pack is ready/);
  assert.doesNotMatch(source, /three cards a day|today's pack|earlier date/);
  assert.match(source, /tickSelect = \(\) => \{[\s\S]*pack\.record = readPack\(\);\s*render\(\);/);
});
