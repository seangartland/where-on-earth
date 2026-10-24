# Passport dex density report — 2026-10-23

## Files touched

- `src/meta/passport.js` — changed the dex to five columns, tightened its gaps and names, added the requested distance formatting, and disabled name flags only for dex slots.
- `src/meta/postcard-card.js` — added the opt-out seam for compact-card name flags and updated the dex score circle and mystery stripe overrides.
- `docs/passport-density-2026-10-23-report.md` — recorded the implementation and verification results.

## Verification

### Module syntax

All required commands exited 0 with no output:

```text
node --check src/meta/passport.js
node --check --input-type=module < src/meta/passport.js
node --check src/meta/postcard-card.js
node --check --input-type=module < src/meta/postcard-card.js
```

### Repository test suite

Command:

```text
node --test test/*.test.mjs
```

Result: 6 tests passed, 0 failed, 0 skipped.

```text
✔ test/account-merge.test.mjs
✔ test/extent-aware-scoring.test.mjs
✔ test/pack-guarantee.test.mjs
✔ test/pack-store.test.mjs
✔ test/passport-grouping.test.mjs
✔ test/survival-merge.test.mjs
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

### `formatShareKm` vectors

A Node unit-style harness extracted and evaluated the formatter from `src/meta/passport.js`:

```text
0.4 -> <1 km
5 -> 5 km
965 -> 965 km
1000 -> 1k km
2400 -> 2.4k km
9000 -> 9k km
9999 -> 10k km
10000 -> 10k km
12300 -> 12k km
20015 -> 20k km
```

In particular, 9999 produces `10k km` via the requested one-decimal rounding and trailing-zero trim.

### Caller proofs

The formatter grep was:

```text
$ rg -n --glob '!node_modules/**' --glob '!vendor/**' "formatShareKm\\s*\\(" src
src/meta/passport.js:208:function formatShareKm(km) {
src/meta/passport.js:231:  const pillText = hasDistance ? formatShareKm(entry.km) : null;
```

This proves the dex slot score pill is the only consumer.

The shared-card caller grep showed that reveal, Daily, and pack still pass their flag resolver and use the new default `showFlagInName: true`; only `passportSlot` passes `showFlagInName: false`. The postcard detail modal remains a direct flagged call:

```text
src/globe/reveal.js:92:  buildPostcardCard(item, {
src/globe/reveal.js:100:    flagForLocation,
src/modes/daily-game.js:102:  const card = buildPostcardCard(item, {
src/modes/daily-game.js:106:  }, { flagForLocation, applyCardTier });
src/modes/pack.js:158:    li = buildPostcardCard(item, {
src/modes/pack.js:165:    }, { variant: 'slot', flagForLocation: host.flagForLocation, applyCardTier: host.applyCardTier });
src/meta/passport.js:232:  const li = buildPostcardCard(entry.item, {
src/meta/passport.js:241:    flagForLocation: host.flagForLocation,
src/meta/passport.js:244:    showFlagInName: false,
src/meta/passport.js:853:  ppdEls.name.textContent = postcardDisplayName(item, host.flagForLocation);
```

A minimal DOM harness also exercised the shared builder and the aria-label construction path:

```text
dex name: Paris
dex aria-label: Open postcard: Paris, Ordinary
default compact name: Paris 🇫🇷
```

`git diff --check -- src/meta/passport.js src/meta/postcard-card.js` passed with no output.

## Not changed / observations

- No Daily or mode share-text formatter was changed.
- Bullseye/pinpoint colors, the score-circle paper background, and `rotate(-11deg)` remain unchanged.
- The muted mystery band selector is scoped to `.pp-dex`. The current pack grid is `.pack-slots`, and its unopened cards use a separate flip-card structure in `src/modes/pack.js`; although `passportMysterySlot` is exposed on the mode host, the pack does not currently call it. Therefore the new band does not render in the pack context and cannot look wrong there. No pack special case was added.
- Existing unrelated working-tree changes were preserved. No commit, push, or deploy was performed.
