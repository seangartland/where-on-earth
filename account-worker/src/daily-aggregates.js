import { isBullseye } from './daily-score.js';

export function deriveDailyAggregate(rounds) {
  const valid = rounds.filter((round) => Number.isInteger(round.slot) && round.slot >= 0 && round.slot < 5);
  return {
    complete: valid.length === 5 && new Set(valid.map((round) => round.slot)).size === 5,
    totalScore: valid.reduce((total, round) => total + round.score, 0),
    bullseyeCount: valid.filter((round) => isBullseye(round.distance_km, round.score)).length,
    distinctCountries: new Set(valid.map((round) => round.country)).size,
  };
}

function previousUtcDate(date) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - 86400000).toISOString().slice(0, 10);
}

export function consecutiveUtcStreak(completionDates, through) {
  const dates = new Set(completionDates);
  let date = through || [...dates].sort().at(-1);
  let streak = 0;
  while (date && dates.has(date)) {
    streak += 1;
    date = previousUtcDate(date);
  }
  return streak;
}
