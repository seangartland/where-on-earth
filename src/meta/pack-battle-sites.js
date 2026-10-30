// Battle sites held out of the Landmarks pack (Sean, 2026-10-30: same
// treatment as the ancient cities). These entries stay in the landmarks
// bank, so Survival and Trivia keep drawing them, and the set seeds a
// future Battlegrounds pack. landmarkPackPool in pack-store.js excludes
// these ids.
export const PACK_BATTLE_SITE_IDS = new Set([
  'alamo-san-antonio',
  'anzac-cove',
  'battle-of-hastings',
  'bunker-hill-monument',
  'gettysburg-battlefield',
  'little-bighorn-battlefield',
  'masada-israel',
  'pearl-harbor-uss-arizona',
  'thermopylae',
]);
