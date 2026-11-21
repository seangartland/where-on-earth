// Straits and canals held out of the Landmarks pack (waterways batch, 2026-11-21; Sean's brief: these are
// Waters pool entries, no generic landmarks-pool step). Same treatment as PACK_MOUNTAIN_RANGE_IDS: the
// entries stay in the landmarks bank, so Survival and Trivia keep drawing them, and the set seeds the
// future Waters pack. landmarkPackPool in pack-store.js excludes these ids. Written by
// scripts/waterways/stage.py --merge; edit that script, not this file.
export const PACK_WATERS_IDS = new Set([
  'bosphorus',
  'dardanelles',
  'suez-canal',
  'strait-of-malacca',
  'strait-of-magellan',
  'english-channel',
  'corinth-canal',
  'golden-gate',
  'bab-el-mandeb',
  'taiwan-strait',
  'cook-strait',
  'oresund',
  'kiel-canal',
  'erie-canal',
  'grand-canal-china',
  'canal-du-midi',
  'strait-of-messina',
  'straits-of-florida',
  'bass-strait',
]);
