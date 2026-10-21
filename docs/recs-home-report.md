# Recs Home Variant Build Report

## Files Touched

1. **src/main.js** - Added URL parameter detection (`?home=recs`), `setupRecsHome()` function, and integration into `goHome()` and initial load chain
2. **src/meta/passport.js** - Modified `syncPassport()` to render compressed passport card for recs variant; added `count` reference to `passportEls`; added recs variant CSS in `initPassportHome()`
3. **src/styles/game.css** - Added all recs variant styles (`.home-recs` scoped)

## Variant Structure

The recs variant (`?home=recs`) applies the `home-recs` class to `<body>` and modifies the home screen as follows:

### Passport Card (Compressed)
- Single line: "X found · Y earned" (no total, no "places found" label, no streak)
- Peek globes row (stamps) hidden via CSS
- Postmark repositioned and resized (top: 10px, right: 10px, 48x48px)
- Paper travel-document styling preserved; still tappable to open full Passport

### Daily Button
- Sub-line updated to "5 places · about 2 minutes"
- Pack button (#pack-button) hidden entirely
- Pack marker (✦) added as separate tap target on Daily button (position: absolute, top 50%, right 14px)
- Marker visibility controlled by `syncPackButton()`: visible when pack available, hidden when opened
- Tapping marker opens sealed pack screen; tapping button body starts Daily

### Expeditions Button
- Shown via `.recs-visible` class (unchanged content)

### More Ways to Play Row
- Single full-width button labeled "More ways to play" with sub-line "Practice, Tap the Country, and more"
- Opens existing Practice hub (survival-hub) which contains Survival, Tap the Country, Blackout, Trivia
- Original Practice and Challenge buttons hidden via CSS

### Player State
- Reads same stored state as default home (passport, streak, expedition progress, pack availability)
- No storage key changes
- No scoring or flow changes

## Captures Produced (390x844 @2x)

1. **recs-home.png** - Variant home screen with `?home=recs`
2. **recs-sealed-pack.png** - Sealed pack screen after tapping pack marker on Daily button
3. **recs-practice-hub.png** - Practice hub after tapping "More ways to play" button
4. **default-home.png** - Default home screen (no parameter) proving no visual change

All captures located in `demo/shots/recs-home-review/`.

## Departures from Existing Components

1. **Passport card text rendering**: Modified `syncPassport()` to generate different innerHTML for recs variant (`passportEls.count.innerHTML`) rather than updating individual span elements. This was necessary because the default HTML structure includes " / total places found" text nodes that cannot be individually hidden via CSS alone.

2. **Pack marker initialization**: Removed `marker.hidden = true` from `setupRecsHome()`; visibility now fully controlled by `syncPackButton()` which runs after marker creation in both `goHome()` and initial load chain.

3. **More ways to play row**: Changed from two-button row (Practice + Challenge) to single button per brief. The single button opens the Practice hub; Challenge/PvP is not directly accessible from this row (the hub does not contain Challenge placement as shipped, contrary to brief assumption).

4. **syncPackButton call order**: Moved `syncPackButton()` calls to execute after `setupRecsHome()` in both `goHome()` and initial load chain, ensuring the pack marker exists when visibility is computed.

## Verification

- Syntax checks pass: `node --check` on all modified JS files
- `git diff --check` clean (no whitespace issues)
- Four 390px captures produced via review harness
- Default home visually unchanged (verified via default-home.png capture)