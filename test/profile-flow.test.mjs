import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sheet = readFileSync(new URL('../src/account/sheet.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('home profile entry opens a neutral profile sheet directly', () => {
  assert.match(sheet, /function ensureSheet\(\)/);
  assert.match(sheet, /function renderProfileLoading\(\)[\s\S]*?profile-loader[\s\S]*?Loading profile…[\s\S]*?renderAvatar\(\{\}, 84\)/);
  assert.match(sheet, /export async function openTravelerProfile\(friendId = ''\) \{\s*renderProfileLoading\(\);/);
  assert.match(sheet, /export async function openProfileSheet\(trigger\)[\s\S]*?await openTravelerProfile\(\);/);
  assert.doesNotMatch(sheet, /<p class="account-copy" aria-live="polite">Loading profile…<\/p>/);
  assert.match(main, /const \{ openProfileSheet \} = await import\('\.\/account\/sheet\.js'\);[\s\S]*?await openProfileSheet\(trigger\);/);
  assert.doesNotMatch(main, /async openTravelerProfile\(trigger\)[\s\S]*?openAccountSheet\(trigger\)/);
});

test('own profile close dismisses the sheet while friend profile close returns to account', () => {
  assert.match(sheet, /if \(mine\) closeAccountSheet\(\);\s*else render\('signed-in', readAccountSession\(\) \|\| \{\}\);/);
});

test('the own profile folds the friends list and invite flow inline instead of a separate page', () => {
  assert.doesNotMatch(sheet, /account-open-friends/);
  assert.doesNotMatch(sheet, /function renderFriendsPage\(\)/);
  assert.match(sheet, /function friendsSectionHtml\(\)[\s\S]*?traveler-friends[\s\S]*?friends-page-list[\s\S]*?friends-add[\s\S]*?account-invite\b/);
  assert.match(sheet, /mountFriendSeals\(\);\s*bind\(readAccountSession\(\) \|\| \{\}\);/);
  assert.match(sheet, /openTravelerProfile\(friendId = ''\)[\s\S]*?if \(mine && !friendsState\) friendsState = await friendApi\('\/v1\/friends'\)/);
});
