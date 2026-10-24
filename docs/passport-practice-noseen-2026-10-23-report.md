# Passport practice no-seen corrective build — 2026-10-23

## Result

`recordVisit()` now returns `0` immediately when `canEarn` is false (`src/meta/passport-store.js:171-173`). It does not change `visits`, `meta`, `order`, `passportDirty`, or persisted storage. There is no migration: previously stored non-earning visits remain, while future non-earning rounds are absent from the Passport.

The superseded display-only practice-distance mechanism was removed completely. `readPassport()` carries only `d` (`src/meta/passport-store.js:135-161`), and both the shared Passport entry and Collections detail entry again read `meta.d` directly (`src/meta/passport.js:89-102`, `759-767`). Earning-mode code after the new guard is unchanged from the pre-`pd` implementation; the source diff against `HEAD` contains only the guard/comment in `passport-store.js`.

Fix 1 remains exactly present as `.pp-chunk[hidden] { display: none; }` at `src/meta/passport.js:1094`.

## `recordVisit` caller trace

There is one production call, at `src/game/round.js:266-267`:

```js
const record = pvp.active ? pvp.recordVisit : !restoring && !trivia.active;
recordVisit(..., !endless.active && !pvp.active && !survival.active)
```

- Daily: `canEarn` is true (all three flags are false).
- Pack: `canEarn` is true.
- Expeditions: `canEarn` is true.
- Endless Practice: `canEarn` is false because `endless.active` is true.
- Survival Practice: `canEarn` is false because `survival.active` is true.
- PvP: `canEarn` is false because `pvp.active` is true. `pvp.recordVisit` is also the accepted-round freshness gate, so replays do not call the store (`src/pvp/play.js:176-185`).
- Trivia: the `record` expression is false, so it does not call `recordVisit`.
- A restored non-PvP reveal: the `record` expression is false. A PvP replay is suppressed by `pvp.recordVisit`.

`rg -n 'recordVisit\(' src --glob '!main.js.bak-*'` found only that call and the function declaration (plus a header comment). The excluded `main.js.bak-*` files are inactive backups, not module callers.

## Count behavior

The home Passport count now grows only from paced-surface encounters going forward. `passportSummary()` counts keys in `host.passport.visits` at `src/meta/passport.js:18-25`, and the home value is rendered from that result at lines 44-56. Since false-`canEarn` rounds no longer add keys, Practice and PvP no longer increase it; Daily, pack, and Expeditions do. Existing historical keys are retained because there is no migration.

The requested “Daily share `places visited` line” is not present in this checkout, so it cannot read Passport state or be confirmed as doing so. The Daily share is built solely from the Daily date, score, and five result scores at `src/modes/daily-game.js:125-132`, and that exact text is passed to sharing at line 495. The only active formatter that emits the literal `places visited` is `formatGameShare()` at `src/core/format.js:57-64`; for Survival it receives the run-local `count` at `src/modes/survival.js:148-156`, not a Passport count. Therefore the accurate behavior is: home counts paced Passport encounters only going forward; current Daily share has no places-visited line. No unrelated share behavior was changed in this corrective build.

## Verification

The Node harness in `test/passport-store-distance.test.mjs` proves:

1. A false-`canEarn` call returns `0`, leaves the JSON serialization of an existing store byte-for-byte identical, and does not call `writeJSON`.
2. True-`canEarn` calls retain the prior behavior: maximum `b`, minimum rounded `d`, tier earning/upgrading, and the original `ea` first-earned timestamp.
3. A false-`canEarn` call after earning leaves the full serialized entry and its order position unchanged.
4. The CSS check confirms Fix 1 remains present.

Commands and results:

```text
node test/passport-store-distance.test.mjs
4 tests, 4 passed, 0 failed

node --test test/*.test.mjs
7 tests, 7 passed, 0 failed

node --check src/meta/passport-store.js
passed

node --check src/meta/passport.js
passed

node --check test/passport-store-distance.test.mjs
passed

git diff --check
clean

rg -n '\.pd\b|\bpd\s*:|\bpd\]' src --glob '!main.js.bak-*'
no matches

rg -n '\.pp-chunk\[hidden\] \{ display: none; \}' src/meta/passport.js
1094:.pp-chunk[hidden] { display: none; }
```

The `pd` check targets property access, object-field syntax, and bracket usage rather than the raw two-letter substring, avoiding false positives in unrelated identifiers and words. Active `src` is clean; inactive backup bundles were excluded from the caller/property audits.
