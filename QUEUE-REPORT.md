# Queue report: friend score submission queue + signed-out note

Branch `friend-score-queue`, baseline `bf8fe12`. Built per BRIEF-FRIEND-QUEUE.md.

## Changes, file by file

- **src/core/config.js** — added `FRIEND_QUEUE_KEY = 'where-on-earth-friend-queue-v1'`, a new
  localStorage key (not added to `VERSIONED_KEYS`/`SYNC_KEYS`: it is a local-only durable queue,
  not a document synced with the account worker, same treatment as `SYNC_QUEUE_KEY`'s own storage).

- **src/account/friends.js** — the core of the build.
  - Added a tiny queue store (`readQueue`/`writeQueue`/`enqueuePending`/`dequeuePending`) against
    `FRIEND_QUEUE_KEY`, holding `{date, slot, locationId, guess, distanceKm, score}` entries deduped
    by `date+slot` (a repeat failure for the same round replaces the earlier entry rather than
    piling up).
  - Extracted `postGuess(entry, token)` — the actual `POST /v1/daily/guesses` call plus its device
    id — out of `submitDailyGuess`, so both the live submission path and the queue flush share one
    request builder.
  - `submitDailyGuess`: on no session token, or on any request failure, the entry is now enqueued
    before returning `null` (previously it just returned `null` and the submission was lost). A
    `GUESS_LOCKED` response carrying `stored` data is still treated as success and dequeues/never
    queues, per the worker facts in the brief.
  - `rememberSubmission` takes a `{ silent }` option. Silent calls update the in-memory
    `dailyPins` cache (so `cachedFriendPins`/review reads still see the result) but skip the
    `daily-progression-award` and `daily-friend-pins` window events — used for past-date flush
    entries so they submit with no UI side effects.
  - Added `flushPendingQueue()`: with a session token present, walks every queued entry, reuses
    `postGuess` + `rememberSubmission`, and:
    - fires the normal events for an entry dated today (`silent: false`),
    - submits quietly for any other date (`silent: true`),
    - drops the entry on success, on a `GUESS_LOCKED`-with-stored response, or on an
      `INVALID_DAILY_DATE` rejection,
    - otherwise leaves the entry queued for the next flush.
  - `backfillToday` is untouched.

- **src/account/sync.js** — `firstSignInMerge` now calls `flushPendingQueue()` right after its
  existing `backfillToday()` call, so a queue built up while signed out (or built up on another
  device before this one ever signed in) drains as part of the first-sign-in merge.

- **src/main.js** — the existing boot branch that runs `syncAccountProgress()` when a session
  already exists now also calls `flushPendingQueue()` (fire-and-forget, same `.catch(() => {})`
  style as its neighbor).

- **src/modes/daily-friends.js** — `enterFriendReview` now runs `flushPendingQueue()` alongside
  the existing `backfillToday()` call (`Promise.all`) before fetching friend pins, so opening the
  friends review also drains the queue.

- **src/modes/daily-game.js** / **index.html** / **src/styles/game.css** — the signed-out note.
  - `index.html`: added a `<p class="friends-today-signedout" hidden>` as the first child of the
    `#friends-today` card.
  - `src/modes/daily-game.js` (`syncFriendsToday`): when signed out (or accounts disabled), the
    card is no longer just hidden. It now shows with the note visible and the leaderboard head,
    list, and link hidden instead; when signed in, the note is hidden and the other three are
    shown before the normal leaderboard logic runs.
  - `src/styles/game.css`: styled `.friends-today-signedout`, and added `[hidden]` overrides for
    `.friends-today-head` and `.friends-today-link` — both set an explicit `display` in the
    existing rules, which otherwise beats the attribute selector's default `display: none` in the
    cascade (the same reason `.friends-today[hidden]` and `.results-globe[hidden]` already exist
    as separate rules in this file).

- **test/friend-queue.test.mjs** (new) — enqueue + dedupe on signed-out/failed submission,
  GUESS_LOCKED-with-stored never queuing, flush-on-session firing events only for today's entry
  while a still-failing entry stays queued, flush dropping an `INVALID_DAILY_DATE` entry, and a
  structural check (matching the existing regex-on-source pattern in `friends-data.test.mjs`, used
  because `daily-game.js` pulls in the three.js/DOM globe stack and isn't import-safe under plain
  Node) that the signed-out branch of `syncFriendsToday` shows the note and hides the leaderboard
  parts, and vice versa when signed in.

## Note copy

> Friends can't see this score until you sign in — queued scores send automatically once you do.

Text only, no new button: the results screen already carries a sign-in/add-friends entry point
(`syncSignedOutNudge`'s "Add friends to compare guesses" button, unchanged by this brief), so the
card's own note doesn't duplicate it.

## Test counts

Before: `node --test "test/*.mjs"` — 259 tests, 256 pass, 3 fail.
After: 264 tests, 261 pass, 3 fail.

The 3 failures are pre-existing and unrelated to this build: `test/image-mirror-transcode.test.mjs`,
`test/image-mirror-upload.test.mjs`, and `test/image-mirror-verify-image.test.mjs` all fail at
import time with `Cannot find package 'sharp'` — a missing native dependency in this clone, not a
regression from this work. Every test added or touched by this brief passes.

## Deviations from the brief

None. One judgment call, noted above: the signed-out note is text-only rather than adding a button,
since the brief allows "text only" when no *new* control is warranted, and this screen already has
a sign-in entry point elsewhere (the existing results-screen nudge) that the note would otherwise
duplicate.
