# Survival header simplification proposal (Sol)

## Direction

Make the Survival header a clue card, not a mode explainer. Keep one compact progress line, make the clue the visual focus, and show the rules/instruction only in round 1. From round 2 onward, the card should contain progress plus the clue—nothing else.

This preserves Sean's required active streak in the header while removing the two sources of repetition in `showRound()`: the separate `survivalStreak` line repeats the streak already present in `round-number`, and the persistent “Survival: Tap the Country” line repeats the mode the player just selected.

Difficulty must remain absent. It should not be restored in either Survival header.

## What is busy today

1. **`ROUND N · STREAK N` — keep.** This is the useful run state and the required home for the live streak. It should remain a single, quiet eyebrow. “Round” and “streak” are related but not duplicates: round counts the current attempt, while streak counts completed successes (so round 8 correctly shows streak 7 before the guess).
2. **Mode line — drop.** “Survival: Tap the Country” earns no persistent row. The player chose that labeled mode on the home screen, and the country-form clue immediately distinguishes it from classic Survival. Classic currently hides this row already.
3. **Status line — first-round-only, then drop.** On round 1 it communicates the one fact with real stakes. On later rounds, `🔥 N survived` merely restates `STREAK N` with a second noun and a decorative icon.
4. **Clue — keep and prioritize.** This is the card's job. For Tap the Country it is the large country target; for classic Survival it is the photo/city clue.
5. **Hint — merge into the round-1 rule, then drop.** “Tap the globe to place your pin” is onboarding, not persistent game state. It should not consume a row after the player has completed a round.

The resulting rhythm is deliberately asymmetric: round 1 has one short onboarding line; established play is stripped down.

## Survival: Tap the Country

### Recommended composition

Round 1 (three text lines):

```text
ROUND 1 · STREAK 0
Tap Somalia 🇸🇴
One miss ends the run · Tap the globe to place your pin
```

Round 8 (two text lines):

```text
ROUND 8 · STREAK 7
Tap Somalia 🇸🇴
```

The first line keeps element 1. Element 2 is dropped. Elements 3 and 5 become one subdued, first-round-only onboarding line. Element 4 remains the large primary line. After round 1, both onboarding clauses disappear because neither changes during the run.

Do not show `🔥 7 survived` beneath `STREAK 7`; the flame adds emphasis but no information. If a visual accent is desired, color the `STREAK 7` portion of the eyebrow rather than adding another row.

## Classic Survival

Classic needs the same hierarchy, with the photo treated as part of the clue rather than as extra metadata. Its unique rule is the 150 km threshold, so that replaces the country mode's generic miss rule in the first-round onboarding line.

Round 1:

```text
ROUND 1 · STREAK 0
[photo]
Abidjan, Côte d’Ivoire 🇨🇮
One miss over 150 km ends the run · Tap the globe to place your pin
```

Round 8:

```text
ROUND 8 · STREAK 7
[photo]
Abidjan, Côte d’Ivoire 🇨🇮
```

As in Tap the Country, element 1 stays; there is no persistent mode line; elements 3 and 5 merge and appear only in round 1; and element 4—here the photo plus city clue—stays dominant. The photo is not another “line” to trim: it carries clue content, so simplifying around it is more important than shrinking or removing it.

The wording should remain **“over 150 km”**, matching the actual `SURVIVAL_LIMIT_KM` loss condition and the run-over screen. Avoid shortening this to “within 150 km” in the active card because that describes success, while the sentence is explaining what ends the run.

## What the player loses—and where it still lives

- **A persistent mode name:** no gameplay information is lost. The home screen labels both `Survival` / `Within 150 km` and `Survival:` / `Tap the Country`; the clue format also makes the active variant self-evident. The run-over eyebrow and share title name the mode again at the end.
- **A persistent rule reminder:** after round 1, the player no longer sees the loss rule while guessing. That is an intentional trade: it was taught at entry, and the classic result pill says `Over 150 km` on failure while both run-over screens restate their rule. Tap the Country's result copy says one miss ends the run.
- **The flame and “survived” wording during guesses:** no count is lost; the same value remains in `STREAK N`. Success/reveal UI can still celebrate survival, and the results screen shows survived/found plus best streak.
- **The repeated tap instruction:** after round 1, none. Pin placement is already learned through the first attempt and reinforced by the interaction itself. If testing shows players returning after a long interruption are confused, restore the hint contextually on an invalid/no-pin action—not as permanent header furniture.

## Daily header

Leave Daily as is. Its rows are not equivalent clutter: `Round N of 5`, the optional points multiplier, the date, the clue, and the placement hint communicate distinct daily-specific state. Daily is also a five-round, once-a-day flow, so retaining the hint is more defensible than in an uninterrupted Survival run.

Do share the visual principle: keep metadata quiet and the clue dominant. Do not force structural consistency by removing Daily's date or hint merely to match Survival; consistency of hierarchy matters more than identical row counts across modes.
