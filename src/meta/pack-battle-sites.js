// Battle sites held out of the Landmarks pack (Sean, 2026-10-30: same
// treatment as the ancient cities). These entries live in the location
// bank, not in PACK_LANDMARK_IDS, so Survival and Trivia keep drawing them,
// and the set seeds a future Battlegrounds pack.
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
