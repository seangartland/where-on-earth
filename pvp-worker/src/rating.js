export const DEFAULT_RATING = 1200;

export function expectedScore(mine, opponent) {
  return 1 / (1 + 10 ** ((opponent - mine) / 400));
}

export function kFactor(matches) {
  return matches < 10 ? 40 : 20;
}

export function actualScore(mine, opponent) {
  return mine === opponent ? 0.5 : mine > opponent ? 1 : 0;
}

export function updateRating({ rating = DEFAULT_RATING, matches = 0 }, opponent, score) {
  const before = rating;
  const after = before + kFactor(matches) * (score - expectedScore(before, opponent.rating));
  const nextMatches = matches + 1;
  return { before, after, change: after - before, matches: nextMatches, provisional: nextMatches < 5 };
}
