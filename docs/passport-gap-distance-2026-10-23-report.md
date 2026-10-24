# Passport chunk gap + practice distance report

Date: 2026-10-24 (implementation requested under the owner-approved 2026-10-23 brief)

## Changes

- Added `.pp-chunk[hidden] { display: none; }` at `src/meta/passport.js:1094`. The ungrouped dex creates 60-item `ul.pp-dex.pp-chunk` elements at lines 493-505 and marks empty chunks hidden at lines 522-524. Grouped dex sections instead use `section.pp-group` plus an unchunked `ul.pp-dex` at lines 472-490, so no other dex element relies on the chunk fix. Content visibility and chunk sizing remain unchanged at lines 1245-1246.
- Added display-only `pd` persistence. `readPassport()` sanitizes it with the same finite/non-negative/rounding treatment as `d` at `src/meta/passport-store.js:145-146`. `recordVisit()` updates it only for a finite non-earning distance, takes the closest practice distance, and preserves it through earning visits at lines 181-187.
- Kept the earn firewall intact. Read-time tier migration is guarded by `Number.isFinite(entry.d)` and calls only `earnForKm(entry.d)` at `src/meta/passport-store.js:155-156`; write-time earning calls only `earnForKm(km)` behind `canEarn` at line 189. `pd` never feeds `earnForKm` or assigns `entry.e`.
- The shared passport entry uses `d`, falling back to `pd` only when `d` is absent, at `src/meta/passport.js:96`. The Collections detail entry applies the identical fallback at line 765, so its closest-distance stat is covered too. Existing records without `pd` are left alone; there is no backfill.

## `entry.km` consumers

- Distance sort: `src/meta/passport-grouping.mjs:11`.
- Dex slot km-circle/pill value: `src/meta/passport.js:230-237`.
- Postcard detail stamp: `src/meta/passport.js:848-849`.
- Postcard detail "Closest guess" stat: `src/meta/passport.js:880-883`.
- Postcard share-button visibility: `src/meta/passport.js:892-896`.
- Postcard share text: `src/meta/passport.js:1078-1080`.

All of these receive the fallback through one of the two entry constructors above. The pill and detail presentation are unchanged, so `pd` has no distinct visual marker.

## Verification

Module syntax checks passed for every touched JavaScript module (`src/meta/passport-store.js`, `src/meta/passport.js`, and `test/passport-store-distance.test.mjs`):

```sh
node --check <file>
node --input-type=module --check < <file>
```

Focused Node harness: `test/passport-store-distance.test.mjs` extracts the store functions with mocked state/storage, following the repository's lightweight Node-test pattern. It passed and proves:

1. A non-earning visit stores rounded `pd` while leaving `d` and `e` unset.
2. A later earning visit stores `d`; read-time migration derives the tier from `d` only (the practice-only fixture deliberately has a 1 km `pd` and still gets no `e`).
3. The earning visit preserves the existing `pd`.
4. Sanitization round-trips and rounds `pd`.

```text
tests 1
pass 1
fail 0
```

Full repository suite:

```sh
node --test test/*.test.mjs
```

```text
tests 7
pass 7
fail 0
```

Earn-call grep:

```sh
rg -n 'earnForKm\([^)]*pd|earnForKm' src/meta/passport-store.js src/meta/passport.js src/meta/passport-grouping.mjs
```

The only calls reported are `earnForKm(entry.d)` at passport-store line 156 and guarded `earnForKm(km)` at line 189; there is no `pd` call.

`git diff --check` completed cleanly.
