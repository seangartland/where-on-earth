# ELO implementation report

## Files changed

- `pvp-worker/src/rating.js`: pure ELO math and rating rules.
- `pvp-worker/src/index.js`: rating storage, completion updates, rating payloads, and the direct-match 8-second timer.
- `src/pvp/h2h.js`, `src/pvp/home.js`, `src/pvp/play.js`, and `src/styles/pvp.css`: rating display and the last-3-second countdown warning.
- `test/rating.test.mjs`: rating-math unit tests.

## Rating write and idempotency

The rating write is in the RECORDS Durable Object's `/apply-completion` transaction, next to the existing `pair_records` write. It creates or updates `player_ratings` for both direct-match players using their pre-match match counts for K. The existing `completion_ledger` match-id guard remains the exactly-once boundary. The transaction also stores that match's rating results in `completion_rating_results`, so a retried completion returns the original before, after, and change rather than applying ELO again.

Only direct head-to-head MatchRoom completions call `/apply-completion`. Open Challenges use their separate group room path and never touch ratings. Group timing stays at 20 seconds.

## Payloads

Completed H2H state and final submission responses include raw-precision `rating: { before, after, change, matches, provisional }` for the requester and `opponentRating: { rating, matches, provisional }` when available. The client rounds only for display. `/v1/records/:opponentId` now includes `rating: { rating, matches, provisional } | null` for the requesting player.

## Timer behavior

New H2H rounds derive their deadline from `RULES.roundSeconds` and grace from `RULES.graceMilliseconds`, producing 8 seconds plus the existing 2-second acceptance grace. Existing in-progress rounds retain their saved deadlines. The client gold countdown threshold is now the last 3 seconds.

## Tests

Added 6 rating unit tests covering symmetry, favourite and underdog gains, draw behavior, the K switch, provisional status, and the fresh-start default. The full root suite was run with `node --test "test/*.mjs"`; see the final handoff for its result and any sandbox limitation.
