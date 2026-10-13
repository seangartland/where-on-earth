# Survival header simplification report (Sol)

## Implemented

- Both Survival guess-phase eyebrows now show only `Streak N`.
- Round 1 uses the `survivalStreak` row for one merged rule and placement instruction.
- Rounds 2+ clear the `survivalStreak` row, removing the repeated flame/survived copy.
- The standalone `guess-hint` is cleared in both Survival modes. Other modes still receive the existing placement hint.
- Tap the Country keeps `daily-date` hidden during play.
- Both Survival reveal-time eyebrow refreshes use `Streak N`. Reveal status, result, and action copy is unchanged.

No Daily, run-over/results, share, random band, bag, scoring, best-streak, location, or Passport logic was changed.

## Exact guess-phase header states

The examples below use a representative country/clue. Round 8 assumes seven prior successes, so its streak value is 7. “Visible but empty” means the element remains in the Survival header DOM/CSS flow but has no text and therefore displays no status or hint line.

### Before

| Mode and round | `round-number` | `round-weight` | `daily-date` | `survival-streak` | `clue` | `guess-hint` |
| --- | --- | --- | --- | --- | --- | --- |
| Tap the Country, round 1 | Visible: `Round 1  Streak 0` | Hidden | Visible: `Survival: Tap the Country` | Visible: `One miss ends the run` | Visible: `Tap <country> <flag>` | Visible: `Tap the globe to place your pin` |
| Tap the Country, round 8 | Visible: `Round 8  Streak 7` | Hidden | Visible: `Survival: Tap the Country` | Visible: `🔥 7 survived` | Visible: `Tap <country> <flag>` | Visible: `Tap the globe to place your pin` |
| Classic Survival, round 1 | Visible: `Round 1  Streak 0` | Hidden | Hidden | Visible: `One miss over 150 km ends the run` | Visible: `<current location clue>` | Visible: `Tap the globe to place your pin` |
| Classic Survival, round 8 | Visible: `Round 8  Streak 7` | Hidden | Hidden | Visible: `🔥 7 survived` | Visible: `<current location clue>` | Visible: `Tap the globe to place your pin` |

### After

| Mode and round | `round-number` | `round-weight` | `daily-date` | `survival-streak` | `clue` | `guess-hint` |
| --- | --- | --- | --- | --- | --- | --- |
| Tap the Country, round 1 | Visible: `Streak 0` | Hidden | Hidden | Visible: `One miss ends the run · Tap the globe to place your pin` | Visible: `Tap <country> <flag>` | Visible but empty |
| Tap the Country, round 8 | Visible: `Streak 7` | Hidden | Hidden | Visible but empty (no status line) | Visible: `Tap <country> <flag>` | Visible but empty |
| Classic Survival, round 1 | Visible: `Streak 0` | Hidden | Hidden | Visible: `One miss over 150 km ends the run · Tap the globe to place your pin` | Visible: `<current location clue>` | Visible but empty |
| Classic Survival, round 8 | Visible: `Streak 7` | Hidden | Hidden | Visible but empty (no status line) | Visible: `<current location clue>` | Visible but empty |

The classic photo remains unchanged as part of the clue presentation.

## Verification

- `node --check --input-type=module < src/main.js`: passed.
- Targeted grep found no combined ``Round ${...}  Streak ${...}`` assignment in the Survival guess/reveal paths.
- Targeted grep found no difficulty text in those header paths; difficulty remains absent.
- The remaining `Survival: Tap the Country` strings are share and run-over copy, outside the play header.
