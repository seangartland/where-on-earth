# Profile loading report

The boot loader uses a dark navy surface, cream and muted light text, gold accents, a seal-like circular focal point, and the `Loading world map…` stage line. The profile loader mirrors that language with the default navy traveler seal, muted `Loading profile…` stage line, dark glass panel, shared palette variables, and restrained animated skeleton rows.

Files changed:

- `src/account/sheet.js`
- `src/styles/game.css`
- `test/profile-flow.test.mjs`

The profile loading treatment is rendered at the shared profile fetch boundary, covering own profiles, friend profiles, and friend-list profile taps without changing fetch order or the loaded profile layout. The shimmer respects `prefers-reduced-motion` like the boot loader.

Suite result: `node --test "test/*.mjs"` passed, 33 tests passed and 0 failed.

Capture list: skipped as instructed because this sandbox cannot run Chromium. The orchestrator will capture the profile loading state, loaded profile, and boot loader at banking.

## Banking verification (orchestrator, 2026-11-21)

- Independent suite run in the clone: `node --test "test/*.mjs"` passed, 151 tests passed and 0 failed. (The 33 above was the lane's count at its run; the suite has since grown with parallel banked work.)
- Captures produced at banking in `docs/profile-loading-evidence/` (390x844, harness `shots/profile-loading/capture.mjs`): `profile-loading-390x844.png`, `profile-loaded-390x844.png`, `boot-loader-390x844.png`. Sighted and judged consistent: dark glass panel, navy seal medallion, muted centered `Loading profile…` stage line in the boot loader's style, skeleton header mirroring the real profile card, three skeleton rows. The loaded profile capture came from the existing seal-rings harness in the same clone because a held-route fulfill did not settle the sheet fetch in this Chromium build; the loading and boot captures are from the new harness. The boot capture caught the loader's fade-out moment (Ready, 100%).
- Diff read: loaded-state markup, layout, and load order are unchanged. The only behavioral change is the interim state, now rendered at the shared `openTravelerProfile` boundary, so own profile, friend profile, and friend-list profile taps all use it. No other bare-text profile interim state remains in `src/account/sheet.js`.
- Banked to prod main, suite re-run there, pushed and verified on origin/main. No deploy: rides the next deploy batch.
