import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sheet = readFileSync(new URL('../src/account/sheet.js', import.meta.url), 'utf8');

test('the signed-in view has a link-another-device row that fetches a code', () => {
  assert.match(sheet, /<button class="text-button account-link-device" type="button">Link another device<\/button>/);
  assert.match(sheet, /account-link-device'\)\?\.addEventListener\('click', async \(event\) => \{[\s\S]*?friendApi\('\/v1\/auth\/transfer-code', \{ method: 'POST' \}\)[\s\S]*?render\('link-device', result\)/);
});

test('the link-device view shows the code large with its expiry and instructions', () => {
  assert.match(sheet, /state === 'link-device'[\s\S]*?account-link-code">\$\{escapeHtml\(values\.code\)\}[\s\S]*?Good for \$\{Math\.round\(values\.expiresInSeconds \/ 60\)\} minutes\.[\s\S]*?Enter this code in the app or browser where you want to be signed in\./);
});

test('the signed-out view has a quiet link-code entry that expands to a code field', () => {
  assert.match(sheet, /<button class="text-button account-link-code-toggle" type="button">Have a link code\?<\/button>/);
  assert.match(sheet, /<form class="account-form account-link-code-form" data-step="link" hidden>/);
  assert.match(sheet, /account-link-code-toggle'\)\?\.addEventListener\('click', \(event\) => \{[\s\S]*?form\.hidden = !form\.hidden/);
});

test('a successful link-code redemption stores the session the same way other sign-in flows do', () => {
  assert.match(sheet, /account-link-code-form'\)\?\.addEventListener\('submit', async \(event\) => \{[\s\S]*?accountApi\('\/v1\/auth\/transfer', \{ method: 'POST', body: \{ code \} \}\)[\s\S]*?await completeSignIn\(result\)/);
  assert.match(sheet, /async function completeSignIn\(result\) \{[\s\S]*?finishSignIn\(result\)/);
  assert.match(sheet, /async function finishSignIn\(result\) \{\s*const saved = saveAccountSession\(/);
});

test('link-code sign-in errors show inline without naming which check failed', () => {
  assert.match(sheet, /status\(error\.message \|\| "That code didn't work\. Check it and try again\."\, true\)/);
});
