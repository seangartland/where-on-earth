# Home truncation build report

Implemented 12 October 2026.

## Changes

- Kept the three mode controls in one row and increased their minimum height from 54px to 62px.
- Reduced the normal horizontal mode-pill padding from 10px to 8px (the existing 7px rule remains at 360px), allowed subtitle text to wrap, and defensively limited it to two lines without an ellipsis.
- Changed the Daily subtitle to **5 places daily** and its completed state to **✓ See results**.
- Changed the plain Survival subtitle to **Within 150 km**.
- Renamed the player-facing Borders mode to **Survival: Tap the Country**. Its home pill uses **Survival:** on the first line and **Tap the Country** on the second. The same display name now appears in the live round header and the run-over eyebrow. Internal `borders` code/state names remain unchanged.
- Made the passport summary explicitly `border-box` and set its width to `min(100%, 330px)`, so its declared width now includes its padding and border.

No deployment was performed.

## Verification

`node --check --input-type=module < src/main.js` passes.

`git diff --check` passes.

Chromium cannot be launched in this sandbox, so the following results are **calculated**, not browser-rendered observations. I repeated the review's font-metric method with the locally installed Noto Sans Bold for 750-weight mode names and Noto Sans SemiBold for 650-weight subtitles. The calculation uses the CSS grid widths, gaps, borders, padding, and the 13px/10px type overrides at 360px.

| Viewport | Mode row | Pill border-box | Text client width |
|---:|---:|---:|---:|
| 390px | 354px | 112.67px | 94.67px |
| 375px | 343px | 109.00px | 91.00px |
| 360px | 328px | 105.33px | 89.33px |

The text client width subtracts the 1px borders and 8px padding per side, or the existing 7px padding per side at 360px. The Daily button has no visible border, so using the bordered-pill width for it is conservative.

| Changed home label | 390px text / client | 375px text / client | 360px text / client | Result |
|---|---:|---:|---:|---|
| Daily | 35.31 / 94.67px | 35.31 / 91.00px | 32.81 / 89.33px | fits |
| 5 places daily | 71.52 / 94.67px | 71.52 / 91.00px | 65.02 / 89.33px | fits |
| ✓ See results | 67.61 / 94.67px | 67.61 / 91.00px | 61.48 / 89.33px | fits |
| Survival | 56.20 / 94.67px | 56.20 / 91.00px | 52.19 / 89.33px | fits |
| Within 150 km | 77.08 / 94.67px | 77.08 / 91.00px | 70.05 / 89.33px | fits |
| Survival: | 60.19 / 94.67px | 60.19 / 91.00px | 55.89 / 89.33px | fits |
| Tap the Country | 85.56 / 94.67px | 85.56 / 91.00px | 77.78 / 89.33px | fits |

Thus every changed home label has calculated `scrollWidth <= clientWidth` at 390px, 375px, and 360px. The narrowest reserve is **5.44px** for “Tap the Country” at 375px. The title/subtitle pairs occupy two lines within the 62px pill height; subtitles are permitted up to two lines and are clipped only as a defensive third-line guard.

The two other changed player-facing labels also fit by the same method:

- The live-header **Survival: Tap the Country** is approximately 139.5px including its declared letter spacing, against approximately 300px / 285px / 270px at 390px / 375px / 360px.
- The results eyebrow **Survival: Tap the Country run over** is approximately 284.47px after its CSS uppercase transform and declared letter spacing, against approximately 308px / 301px / 286px at 390px / 375px / 360px. It fits at all three widths; the 360px reserve is approximately 1.53px. The element also permits normal wrapping rather than hiding overflow.

These calculations assert no horizontal truncation for the changed labels, but they do not replace a later visual check in iOS/SF Pro when a browser-capable environment is available.
