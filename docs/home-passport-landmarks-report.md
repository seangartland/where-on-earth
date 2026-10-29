# Home Passport landmark-count fix report

Date: 2026-10-29  
Model: GPT-5 (Codex)

## Result

The home Passport summary now resolves recorded visits with `findLocation()`, so both city and landmark-bank postcards contribute to `found`, `earned`, and the five recent stamps. The denominator is computed from the same loaded banks as `host.locations.length + (host.landmarks?.length || 0)`. With the current data this is 804 cities + 410 landmarks = 1,214 collectibles; no count is hardcoded.

Because the banks load independently, `syncPassport()` now runs when the landmark request settles successfully. The optional landmark length keeps an earlier city-load sync safe, and the later sync replaces the temporary cities-only denominator with the complete total.

## `passportLocation` call-site sweep

- `src/meta/passport.js`, formerly in `passportSummary()` twice: changed both visit counting and recent-stamp resolution to `host.findLocation()`. This is the home summary path requested by the brief.
- `src/meta/passport.js`, `passportEntries()`: deliberately left city-only. It is an unused legacy helper (there are no callers); the current Passport shelf is built by `renderPassportPage()` through `passportPackSections(host.locations, host.landmarks, visits)`, which already covers both banks. It therefore does not cause another live collection surface to read empty or undercount landmark holders.
- `src/meta/passport-store.js`, `findLocation()`: deliberately unchanged. Its city-first `passportLocation(id) || landmarkLocation(id)` behavior is the combined lookup now used by the home summary.
- `src/meta/passport-store.js`, `buildPassportDots()`: deliberately left city-only. This is the start-screen globe dot cloud, not the home collection count/card, and the store comment explicitly preserves landmark exclusion from geographic city totals/surfaces.
- `src/modes/audit.js`, audit-flag label fallback: deliberately unchanged. It already prefers `host.findLocation`; `passportLocation` is only compatibility fallback when a host does not provide the combined lookup.
- `src/main.js`: the remaining occurrences import `passportLocation` and expose it on `passportHost`; they do not perform a lookup themselves and were deliberately retained for the city-only consumers above.

No additional live collection surface with the reported empty/undercounted symptom was found.

## Tests

`node --test test/*.test.mjs`: 13 test files passed, 0 failed.

New coverage in `test/passport-summary.test.mjs` verifies:

- a landmark-only passport has `found = 1`, `earned = 1`, the landmark in recent stamps, and the combined total;
- a mixed passport counts one city plus one landmark exactly once each;
- the recommended-home branch still forces the card visible and renders the same shared summary values.

## 390×844 capture

`shots/home-passport-landmark/capture.mjs` is a deterministic real-app harness. It seeds localStorage with only the first landmark having a real image (`abu-simbel-temples`), loads both default and `?home=recs` at 390×844 CSS px (DPR 2), and asserts before saving that the visible card reads `1 / 1,214 places found · 1 earned`. On default home it also expects one recent landmark stamp; recommended home intentionally hides the stamp row but uses the same count.

No PNG could be produced in this managed run because every available Chromium binary exited before opening a page:

- `/opt/meta-chromium/chrome`: after supplying the required signed Hatch WebGL policy, Crashpad failed at `setsockopt` with `Operation not permitted` and exited with SIGTRAP.
- cached full Chromium: the same Crashpad `setsockopt` denial and SIGTRAP.
- alternate Chrome headless shell: `sandbox_host_linux.cc` failed during shutdown with `Operation not permitted` and exited with SIGTRAP.

These are pre-page browser-launch failures, not application or capture-assertion failures. The harness is left in the tree for a browser-capable rerun. Even a successful desktop Chromium capture would not prove behavior on iOS Safari; that remains the explicit visual-verification blind spot.

## Banking note (orchestrator checkback, 2026-10-29)

Banked from a clean worktree at origin/main 4edcb6e because the extent-pilot lane was actively editing src/main.js in the shared demo tree; the banked main.js change is only the syncPassport() line above. The lane's 1,214 total was correct at its baseline (804 cities + 410 landmarks at dcbc900). Landmark scrub commits bbce71b and a5fd591 landed on origin/main after the lane finished and reduced the landmark bank to 332, so the current dynamic total is 804 + 332 = 1,136. No count is hardcoded in code or in the capture harness (both compute from the banks). The capture harness's first wait referenced window.__game.state.landmarks, a field __game.state does not expose; the orchestrator replaced it with a __game-defined wait, keeping the visible-card assertion unchanged. Its page.screenshot call also hung in the headless shell on this WebGL page, so the orchestrator switched it to the CDP Page.captureScreenshot pattern already used by shots/passport/pp-shot.mjs. Reran successfully at 390x844 by the orchestrator (see capture-results.json and the PNGs in shots/home-passport-landmark/): the home Passport card is visible with a landmarks-only seeded passport, reading 1 / 1,136 places found, 1 earned, with one recent stamp. Desktop Chromium does not prove iOS Safari.
