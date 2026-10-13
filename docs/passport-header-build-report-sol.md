# Passport header build report

Implemented the approved design from `docs/passport-header-review-opus.md` in `src/main.js`.

## What changed

- Replaced the separate status and continent-jump rows with one 44px sticky toolbar containing Filters, the existing jump chips, and a compact close button shown while stuck.
- Moved the existing status controls, rarity control, sort control, conditional continent control, and shown count into an absolutely positioned filter panel. The panel does not change grid layout.
- Added the active-filter badge/highlight and accessible label. The badge counts non-default status, rarity, and the conditional continent filter; sort is not counted.
- Added panel dismissal by toggle, Escape, outside pointerdown, and more than 24px of downward scrolling since opening or the latest upward movement.
- Offset sticky continent headings and chip jump targets by the toolbar height.
- Gave both Countries list and Countries detail views the same sticky-toolbar slot, including the compact stuck close control.
- Kept `ppFilteredGroupCount`, chip-triggered `ppExpand()`, collapse-state persistence, and toggle-only status/rarity/continent filtering unchanged.
- Kept the zero-result message in the dex area so it remains visible while the panel is closed.

No changes were needed in `src/style.css` or `index.html`; the Passport component's existing styles and markup live in `src/main.js`.

## Verification

- PASS: `node --check --input-type=module < src/main.js`
- PASS: `git diff --check`
- Code-path review confirms that `ppFilteredGroupCount` still supplies both group-heading and chip counts, jump chips still call `head.ppExpand()` before `scrollIntoView`, and `where-on-earth-collapsed-continents` persistence is unchanged.

### 390×844 measurements

The target states are laid out as follows from the implemented CSS:

| State | Review target | Implemented CSS geometry |
|---|---:|---:|
| Resting grid start | about 211px | about 207–211px |
| Scrolled coverage | about 73px | 44px toolbar + 29px group heading = 73px |
| Open floating panel | about 128px | about 123px; absolute/out of flow |

I could not obtain valid headless measurements in this sandbox. The default `/opt/meta-chromium/chrome` aborted on a denied crashpad socket operation, and `/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell` aborted in `sandbox_host_linux.cc` with `Operation not permitted`. These are browser-launch failures before the page loads, not harness or application failures.

Run from the repository to collect the measured values and screenshots:

```sh
node /home/hatch/workspace/map-game/shots/passport/hdr-measure.mjs
```

If the default browser cannot launch, point the harness `executablePath` at:

```text
/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell
```

The review harness predates the approved markup and should also record `.pp-toolbar`, reopen Filters before clicking the hidden All status control, and measure after the 1200px scroll. A temporary adjusted copy was attempted here, but browser startup was blocked as described above.

## Remaining device check

As the review notes, verify the sticky safe-area cover once in the standalone PWA on a real notched iPhone; Chromium cannot reproduce the real iOS safe-area inset.
