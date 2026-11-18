# Home cleanup report

Changed files:

- `src/styles/game.css`
- `src/meta/passport.js`
- `HOME-CLEANUP-REPORT.md`

The home title uses `clamp(44px, 14vw, 60px)` and is shifted 12px left through 600px wide. The two-line title retains its font and centered appearance while leaving a clear gap before the 44px gear box at 320px, 390px, and 430px viewport widths. At 320px the calculated glyph edge is about 6px clear, with larger clearance at 390px and 430px.

Home panels are 225px tall. The pack object is 140px tall, starting 10px from the top. Its bottom clears the pack title by 11px; the title, two-line description, and 12px bottom padding fit in the lower 90px. Daily and Practice use that same 90px label area, which fits each title and two-line description without clipping or overlap.

The home Passport summary no longer creates or fills a streak postmark. The Passport card still opens normally, and the separate per-entry Passport dex postmarks remain unchanged. No requested item was omitted.
