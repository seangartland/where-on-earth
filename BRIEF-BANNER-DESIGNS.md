# Brief: replace the busy banner designs with Open Field and Low Tide

Sean's ruling, 2026-11-22: the two round 2 directions he picked (Open Field
and Low Tide, "right direction, very minimal") are meant to REPLACE the
existing busy banner designs, not join them. Baseline: production main
58da5a1. Branch: banner-designs-build. Do NOT deploy; Muse merges and
deploys after review.

## The two designs (exact specs from the round 2 mockups)

Reference implementation: ~/workspace/map-game/woe-banner2-build/
banner-mockups.html, banner-directions.md, and MOCKUP-REPORT.md (geometry
and quiet-zone notes). Colors from the game palette:

- Open Field: one uninterrupted solid forest green (#1f4d3a) field. No
  second shape, no panel, no band.
- Low Tide: navy (#1e4e9c) field with one flat burgundy (#7a2230) band at
  the bottom 20% of the card height, edge to edge, well clear of the
  identity text at both heights.

Both render at the profile-header height and the friends-row height, with
the quiet zone behind seal, name, and title holding by construction (it
does in the mockups; keep it that way).

## Step 1: inventory first

Find where banner designs are defined, how a player's selection is stored
(client and account side), and list every current design, classified as
(a) everyday selectable, (b) seasonal or achievement-gated (for example
Winter Post, Harvest), or (c) already minimal/flat. Put the inventory in
the build report.

## Scope

- Remove the busy everyday selectable designs and replace them with Open
  Field and Low Tide as the everyday set. If the inventory finds an
  existing everyday design that is already minimal in this same flat
  register, keep it and say which and why; the end state Sean wants is a
  minimal set, not a specific count.
- Seasonal and achievement-gated banners stay untouched.
- Stored selections: any saved banner choice pointing at a removed design
  must fall back gracefully to Open Field everywhere it renders (profile
  header, friends rows, anywhere else banners render) and in the design
  picker, with no blank or broken banner and no error. The picker must
  never offer a removed design.
- Seal, level, name, and title rendering stays exactly as it is. Account
  surfaces stay dark. Do not restyle anything else.

## Deliverables

- The change, committed on banner-designs-build, full test suite passing
  (node --test "test/*.mjs"), with tests covering the removed-design
  fallback.
- BANNER-BUILD-REPORT.md at the clone root: the inventory, what was
  removed, what replaced it, the fallback behavior, and anything you kept
  as already-minimal with the reason.
- Captures of both new designs at both heights (profile header and
  friends row) in shots-banner-build/, using the harness pattern from
  ~/workspace/map-game/woe-banner2-build/shots-banner-mockups/capture.mjs
  (copy it and adapt; mock BOTH account API hosts).
- No em dashes anywhere, including comments and report text.
