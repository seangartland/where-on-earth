# Airmail stripe removal report — 2026-10-29

## Surface review

- **Passport dex slots:** Removed the red/blue top band from visited slots, so their photo frame now begins 6px higher against the plain paper face. The explicitly excluded muted beige mystery-slot band remains unchanged in appearance and uses a local 6px height instead of the deleted shared token.
- **Passport panel:** Removed the top band, allowing the count and stamps to move up by the band's former 6px height. In the compact recommended-home variant, the postmark now centers over the full clean paper height (`top: 0`).
- **Pack envelope/message view:** Removed the full decorative border element and its CSS. The existing thin paper border, stamp outline, postmark, divider, and message/address lines remain intact.
- **Daily postcard summary:** Removed the top band and reduced top padding from 20px to 14px, so there is no reserved 6px strip. The inset paper edge is now the plain top treatment.
- **Expedition picker:** Removed the top bands and their 5px text/icon compensation. The paper cards retain their inset border and shadow, with content reading naturally from the clean top edge.
- **PvP challenge list:** Removed the top band and moved the envelope-flap shading from `top: 6px` to `top: 0`, preserving the envelope treatment without an empty stripe-height gap.
- **Daily reveal peek:** Removed the stripe overlay from the thumbnail. Its existing white photo frame and paper-colored outline now form the complete top edge.
- **Unvisited Passport dex hatch:** Replaced the faint red/blue diagonal colors with warm neutral greys at the same `.09` and `.07` alpha values over `#f3ead7` paper.

Postage stamps, postmarks, the pack tear strip, gameplay behavior, and the beige mystery-slot pattern were not changed.

## Capture handoff

`shots/nostripe/capture.mjs` follows the repository fake-origin harness: it serves this worktree from disk at `https://game.local`, suppresses WebGL draw calls after startup, captures through CDP, and uses a 390×844 viewport. It writes:

1. `01-passport-dex.png`
2. `02-pack-message.png`
3. `03-daily-summary.png`
4. `04-expedition-picker.png`
5. `05-pvp-challenges.png`
6. `06-daily-reveal-peek.png`

The script was syntax-checked here but not launched because this sandbox cannot run Chromium, as noted in the brief.

## Verification

All changed JavaScript and the capture script passed both syntax forms:

```text
node --check <file>
node --input-type=module --check < <file>
```

The required repository-wide grep for the three retired identifiers produced no matches (the adjacent shell strings keep this report from becoming a match itself):

```text
$ rg -n --hidden --glob '!node_modules/**' 'mail''-stripe|mail''-stripe-border|pack''-airmail-edge' .
(no output; exit 1)
PASS: no retired decorative-border identifier references
```

The old unvisited-slot hatch colors are also absent:

```text
$ rg -n --hidden --glob '!node_modules/**' 'rgba\(155,61,66,.09\)|rgba\(50,73,105,.07\)' .
(no output; exit 1)
PASS: no red/blue unvisited hatch colors
```

The full requested suite passed:

```text
$ node --test test/*.test.mjs
tests 13
pass 13
fail 0
duration_ms 23968.874476
```

`git diff --check` also passed with no output.
