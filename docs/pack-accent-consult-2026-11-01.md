# Pack word accents and Passport headers: design consult (2026-11-01)

Method: Opus 5.5 (Claude Code), judgment only, nothing was built. The three v2 candidate images under `pack-hero-candidates-v2/` could not be opened in this session (read permission was denied outside the repo). The verdicts below use the shipped pack art in `assets/` (`pack-world-capitals.webp` London dusk, `pack-landmarks.webp` Eiffel day, `pack-landforms.webp` Delicate Arch day), which has the same foil and the same gold and blue wordmark, plus the scene descriptions in the brief. The Passport analysis uses the live code: `src/meta/passport-packs.js` and the `.pp-pack-*` rules in `src/styles/game.css` (lines 1069 to 1079). The per-pack colors are a starting spec and must be checked against the actual v2 renders before they are locked.

## Q1. Per-pack word accents

Verdict: yes, differentiate, but only through the outline and glow, plus a small tint shift inside the gold family. The foil, seal, band and tear line already make the three packs read as one product line, so the word is the one place left to signal which pack this is without breaking that system. The uniform blue also clashes with some photos. On the shipped art the blue outline is what keeps gold letters readable over the orange Delicate Arch sand, and blue blends into the blue Paris sky the moment the word gets near it. One accent color per pack, set against the photo's main colors, makes the word read better and gives each pack a name color players can learn. Keep the letterform, the bevel, the 3D depth and the gold base the same on all three so they stay one family. Capitals keeps the current blue, which stays the house accent and matches the cyan tear line.

### Exact treatments

All values assume the 900 px wide pack art. The letterform, bevel depth, drop shadow and placement stay identical across packs.

| Pack | Letter fill (gold gradient, top to bottom) | Outline / bevel edge | Outer glow | Why it works on the photo |
|---|---|---|---|---|
| CAPITALS (Tokyo dusk aerial) | Classic gold: `#FFF3B0` to `#E8B53A` to `#A8741A` | Deep navy `#0B2A6B`, 6 px | Electric blue `#3FA9FF`, 55 to 60% opacity, 18 px blur | It stays the baseline. Blue matches dusk sky and neon city light, and the gold picks up the warm window lights. If the word sits over sky in the v2 crop rather than over the lit city, push the outline darker (`#081E4F`) instead of changing hue. |
| LANDMARKS (Eiffel Tower, day) | Rose gold, slightly warmer: `#FFE6C7` to `#E3A06A` to `#9A5A2E` | Garnet `#5A1420`, 6 px | Coral red `#FF6B57`, 50 to 55% opacity, 18 px blur | A warm red is the complement of the daytime blue sky and green Champ de Mars, so it stands out without fighting them. The copper lean matches the tower's bronze ironwork and fits monuments and plaques. |
| LANDFORMS (Delicate Arch, winter sunset) | Champagne, paler: `#FFF8DA` to `#E6CC7A` to `#9C8236` | Spruce `#0F3D33`, 6 px | Jade `#3ED9A0`, 50 to 55% opacity, 18 px blur | A cool green is the complement of red sandstone and the orange and pink sunset, so the letters lift off the rock. Champagne gold keeps them from melting into the warm light. Green also suggests earth and growth. |

Guardrails: keep glow opacity at 60% or below so the gold, not the halo, carries the word. No second glow color and no gradient in the outline. The fill tints must stay close enough that, side by side, all three read as gold first and as a tint second. If any of them reads as pink or green in the v2 renders, pull its middle stop back toward `#E8B53A`.

## Q2. Passport section headers

Verdict: yes, switch to text only, but do not reuse the 3D gold wordmark in the header. The current header (`.pp-pack-head`) shrinks a 900 x 1350 pack image into a 38 x 44 px thumbnail. At that size the photo turns into a smudge and the word on it is unreadable, and each section still has to fetch and decode a full pack image. On a 390 px screen with three repeating collapsible rows, the thumbnail adds weight without helping anyone find their place. Gold bevel lettering with a glow does not work at 16 px either: on the cream `--mail-paper` header the gold fill fails contrast and the glow just blurs. The identity should carry through in a form that survives small sizes: the pack word, the pack's outline color as the text ink, and the pack's glow color as a bar and a progress fill. This gives three clearly separate, scannable rows when a player has all three sections, and it ties each row back to the wrapper by color. That is the same principle as Pokemon's text-only grouping, adapted to the Passport's paper style.

### Header spec (390 px)

- Layout: replace the image column. Grid becomes `4px minmax(0,1fr) auto 12px` (accent bar, word, count, chevron). Min height goes from 58 px to 48 px. Keep the full-width button, so the tap target stays 48 px or more.
- Accent bar: 4 px wide, full header height, in the pack's glow color (`#3FA9FF`, `#FF6B57`, `#3ED9A0`). This is a decorative bar, not text, so there is no contrast requirement.
- Word: the wrapper word in caps (CAPITALS, LANDMARKS, LANDFORMS) so it matches the pack. 16 px, weight 900, letter spacing `0.06em`, solid ink in the pack's outline color (`#0B2A6B`, `#5A1420`, `#0F3D33`). All three are dark enough for AA contrast on the cream paper. No gradient, glow or bevel at this size.
- Count: keep `.pp-pack-count` as is (for example `12 / 50`, tabular numbers, muted navy), right-aligned.
- Progress: a 3 px bar across the bottom edge of the header, track `rgba(52,72,96,.12)`, filled in the pack's glow color to `collected / total`. This shows progress for each section even while it is collapsed.
- Chevron: unchanged.
- Everything Else section: keep its envelope icon (`.pp-pack-mail`). Being the only header with an icon now helps it stand apart from the three packs.

Naming note for Sean: `PASSPORT_PACKS` names the first pack "World Capitals", but the wrapper says CAPITALS. The spec above uses the wrapper word so the header matches the pack. Please confirm before it is built.
