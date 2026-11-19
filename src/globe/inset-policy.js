export function servedRungIndex(ladder, wantedZ, saveData) {
  let index = ladder.findIndex((rung) => rung >= wantedZ);
  if (index < 0) index = ladder.length - 1;
  return saveData && index > 0 ? index - 1 : index;
}

export function insetFetchLimit(loading, normal, burst) {
  return loading ? burst : normal;
}

export const idlePrefetchAllowed = (slow) => !slow;
