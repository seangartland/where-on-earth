import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sheet = readFileSync(new URL('../src/account/sheet.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const config = readFileSync(new URL('../src/core/config.js', import.meta.url), 'utf8');

test('a one-time seen flag is defined in the storage-key style of the other flags', () => {
  assert.match(config, /export const PWA_SIGNIN_PROMPT_SEEN_KEY = 'where-on-earth-pwa-signin-prompt-seen';/);
});

test('isStandalonePwa checks display-mode and the iOS standalone flag', () => {
  assert.match(sheet, /export function isStandalonePwa\(\) \{\s*return window\.matchMedia\?\.\('\(display-mode: standalone\)'\)\.matches \|\| window\.navigator\?\.standalone === true;\s*\}/);
});

test('boot opens the account sheet exactly once when standalone, signed out, and the flag is unset', () => {
  assert.match(main, /const \{ consumeAuthReturn, isStandalonePwa \} = await import\('\.\/account\/sheet\.js'\);/);
  assert.match(main, /else if \(!isSignedIn\(\) && isStandalonePwa\(\) && localStorage\.getItem\(PWA_SIGNIN_PROMPT_SEEN_KEY\) === null\) \{[\s\S]*?localStorage\.setItem\(PWA_SIGNIN_PROMPT_SEEN_KEY, '1'\);[\s\S]*?await openAccountSheet\(\)\.catch\(\(\) => \{\}\);[\s\S]*?\}/);
});

test('the flag is set before the sheet opens, so a thrown open never leaves the prompt able to fire again', () => {
  const block = main.match(/else if \(!isSignedIn\(\)[\s\S]*?\n {4,6}\}/)[0];
  const setIndex = block.indexOf('localStorage.setItem(PWA_SIGNIN_PROMPT_SEEN_KEY');
  const openIndex = block.indexOf('openAccountSheet()');
  assert.ok(setIndex > -1 && openIndex > -1 && setIndex < openIndex);
});

test('the prompt never fires for a pending friend invite or once already signed in', () => {
  assert.match(main, /if \(window\.getPendingFriendToken\?\.\(\)\) \{[\s\S]*?\} else if \(!isSignedIn\(\) && isStandalonePwa\(\)/);
});

test('the signed-out view shows the bring-your-progress-over line only when standalone', () => {
  assert.match(sheet, /const standaloneCopy = isStandalonePwa\(\) \? '<p class="account-copy account-pwa-copy">Already playing in your browser\? Sign in the same way here to bring your progress over\.<\/p>' : '';/);
  assert.match(sheet, /<h2 id="account-title">Save your progress<\/h2>\s*\$\{standaloneCopy\}/);
});

test('the quiet link-code entry is untouched by the standalone copy', () => {
  assert.match(sheet, /<button class="text-button account-link-code-toggle" type="button">Have a link code\?<\/button>/);
});
