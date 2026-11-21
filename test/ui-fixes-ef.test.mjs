import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const passport = readFileSync(new URL('../src/meta/passport.js', import.meta.url), 'utf8');
const sheet = readFileSync(new URL('../src/account/sheet.js', import.meta.url), 'utf8');
const progression = readFileSync(new URL('../src/account/progression-view.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/game.css', import.meta.url), 'utf8');

test('home progression uses the account loadout at the enlarged seal size and refreshes after saving', () => {
  assert.match(passport, /progression\(\)\.then\(\(profile\).*renderXpBar\(profile, \{ compact: true, sealSize: 60 \}\)/s);
  assert.match(sheet, /window\.dispatchEvent\(new CustomEvent\('progression-loadout-change'\)\)/);
  assert.match(progression, /renderAvatar\(profile\.loadout\?\.avatar, sealSize/);
  assert.match(css, /\.passport-xp \{[^}]*min-height: 76px[^}]*padding: 7px 0 8px/s);
  assert.match(css, /\.passport-xp \.xp-bar-seal \{ width: 60px; height: 60px; \}/);
});

test('own traveler profile contains exactly the approved XP explainer copy', () => {
  const copy = 'Earn XP in the Daily. The closer your guesses, the more you earn.';
  assert.equal(sheet.split(copy).length - 1, 1);
  assert.match(sheet, /class="profile-xp-explainer">Earn XP in the Daily\. The closer your guesses, the more you earn\.<\/p>/);
  assert.match(css, /\.profile-xp > \.profile-xp-explainer \{ color: rgba\(var\(--rgb-mist\),\.57\); line-height: 1\.35; \}/);
});
