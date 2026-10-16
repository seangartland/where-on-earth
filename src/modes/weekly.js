// ---------------------------------------------------------------------------
// Weekly Expeditions, free tier (docs/expeditions-rethink-opus.md, Proposal 3):
// the calendar math. One route a week from assets/weekly-expeditions.json,
// picked from the player's LOCAL date; stop i opens on weekday i (Monday 0),
// and on Sunday every unplayed stop of the week opens (catch-up Sunday).
// Pure functions only: storage, the picker card and the session live in
// expeditions.js.
// ---------------------------------------------------------------------------
const DAY_MS = 86400000;
// Week 0 starts Monday 2026-10-19. Frozen once shipped: moving it reshuffles
// every past and future week, the same rule as the Daily bands.
const EPOCH_UTC = Date.UTC(2026, 9, 19);
export const WEEK_STOPS = 7;

export const positiveMod = (n, m) => ((n % m) + m) % m;

// Whole calendar days from the epoch to the local date. Counting on the local
// Y-M-D (not elapsed milliseconds) keeps DST changes from shifting a day.
function epochDays(date) {
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - EPOCH_UTC) / DAY_MS);
}

function dayKey(days) {
  const d = new Date(EPOCH_UTC + days * DAY_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// The week containing `date`: index (negative before the epoch), its Monday and
// Sunday as YYYY-MM-DD, today's weekday (Monday 0 to Sunday 6) and its route.
export function weekOf(date, routes) {
  const days = epochDays(date);
  const index = Math.floor(days / 7);
  return {
    index,
    start: dayKey(index * 7),
    end: dayKey(index * 7 + 6),
    weekday: positiveMod(days, 7),
    route: routes.length ? routes[positiveMod(index, routes.length)] : null,
  };
}

// One state per stop: 'played' (done for the week), 'open' (playable now) or
// 'locked' (a later day, or an earlier missed day before Sunday).
export function stopStates(week, played = {}) {
  return Array.from({ length: WEEK_STOPS }, (_, i) => {
    if (played[i] != null) return 'played';
    return i === week.weekday || week.weekday === WEEK_STOPS - 1 ? 'open' : 'locked';
  });
}
