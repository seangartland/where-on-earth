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

test('the own profile routes its friend count to the dark Friends page', () => {
  assert.match(sheet, /account-open-friends/);
  assert.match(sheet, /function renderFriendsPage\(\)/);
  assert.match(sheet, /mountFriendSeals\(\)/);
  assert.match(sheet, /openTravelerProfile\(friendId = ''\)[\s\S]*?if \(mine && !friendsState\) friendsState = await friendApi\('\/v1\/friends'\)/);
});
