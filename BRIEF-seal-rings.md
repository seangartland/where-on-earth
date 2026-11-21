# Brief: seal rings and holiday toppers (Codex terra build lane)

Sean approved this design on 2026-11-21: the seal's ring becomes a
selectable cosmetic chosen from earned finishes, and seals gain a holiday
topper slot (Santa hat, reindeer antlers) earned seasonally. Compact
surfaces (friends list rows, globe pins) keep the plain seal so identity
stays readable at small sizes.

Current system (read before writing): seal config { v: 2, initials, disc,
motif } in src/account/avatar.js (SEAL_DISCS, SEAL_MOTIFS, sealConfig,
renderAvatar, motifGlyph, METALS by level: bronze 1-4, silver 5-9, gold
10+). Worker gating in account-worker/src/progression.js (validateSeal,
normalizeSeal, SEAL_MOTIFS achievement map, ACHIEVEMENTS table,
ownsIdentity). Customizer Seal tab in src/account/sheet.js.

## Data model

Seal config gains two fields (v stays 2; absent fields normalize to the
defaults everywhere, client and worker):
- `ring`: 'level' (default; today's by-level metal), 'bronze', 'silver',
  'gold'.
- `topper`: null (default), 'santa-hat', 'antlers'.

## Rings

- avatar.js: the ring stroke uses the chosen finish's metal pair from the
  existing METALS table; 'level' resolves by the wearer's level exactly
  as today. Ring stroke width stays the current thin fixed stroke in
  every mode; it never grows.
- Earning: 'bronze' from level 1, 'silver' from level 5, 'gold' from
  level 10 (the same bands the metals use today). 'level' is always
  available.
- Worker: validateSeal rejects a ring the saver has not earned by level.
  validateSeal today receives earnedIds only; extend the call path so the
  saver's level is available to the check (the loadout handler has the
  profile). normalizeSeal (read path for OTHER players' seals) must not
  strip a legitimately saved ring: gate read normalization on the same
  rule using the seal owner's level where the caller has it; where it
  does not, keep the saved value (display is harmless; the write gate is
  the authority). State your choice in the report.

## Toppers

- avatar.js: draw toppers as SVG in the same style as motifGlyph (gold
  stroke family is for motifs; toppers get their own simple filled
  shapes: a red Santa hat with white trim sitting on the disc's top
  edge, and brown antlers rising from the top edge). They render ONLY in
  full mode (below).
- Earning: a seasonal achievement path. Add achievement(s) to the
  worker ACHIEVEMENTS table granting the toppers, predicate: a canonical
  Daily completed in a holiday window you define from the completion
  data available to the achievement evaluator (look at what
  processCompletion / the stats object actually carries; if dates are
  not available there, evaluate the window inside processCompletion
  where the completion date is known). Both toppers may share one
  achievement or use one each; the reward strings must fit the existing
  'type:id' reward parsing and ownsIdentity conventions ('topper:...').
  The window: December 20-26 of the current year is the default; make it
  a named constant. Report the exact mechanism you built.
- Worker: validateSeal rejects a topper whose granting achievement the
  saver has not earned (same pattern as motifs).

## Render modes (the fit rule)

renderAvatar gains an explicit compact option in its options argument:
- Full mode (default): if a topper is set, the disc scales down inside
  the seal's footprint to leave headroom above it and the topper draws
  in that space; total footprint does not grow. Ring stays thin.
- Compact mode ({ compact: true }): no topper ever; disc, initials,
  motif, and ring exactly as today.
Call sites: traveler profile headers (own and friend) and the
customizer preview use full mode. The friends list rows (54px,
mountFriendSeals in sheet.js) pass compact: true. Globe friend pins are
a separate texture path (src/globe/pin.js medallions) and stay
disc + initials only: do not touch them.

## Customizer

The Seal tab gains two pickers modeled on the existing disc/motif
pickers, same lock presentation:
- Ring: Level (auto), Bronze, Silver, Gold. Locked by level with the
  unlock level shown the way locked motifs show their condition.
- Topper: None, Santa Hat, Antlers. Locked until earned, condition
  shown.
Draft state, preview (full mode), and the save flow work exactly like
the existing fields; the saved payload includes ring and topper.
Wherever the app lists upcoming unlocks (progression-view LEVEL_UNLOCKS
drives the "Next: ... at Level N" line), the ring unlocks at 5 and 10
belong there too.

## Tests and evidence

- Worker tests: validateSeal accepts/rejects rings by level and toppers
  by achievement; normalizeSeal preserves a saved ring/topper; the
  seasonal predicate if testable in the suite's style.
- Game suite `node --test "test/*.mjs"` fully green; follow the repo's
  existing avatar/seal test patterns if any exist.
- Harness captures at 390x844 (shots-ux pattern, stub BOTH API hosts:
  api.where-on.earth and woe-account.gartland-79.workers.dev):
  (1) the Seal tab showing the Ring and Topper pickers, (2) the own
  traveler profile wearing the Santa hat in full mode, (3) the friends
  page with a seeded friend who HAS a topper saved, proving the row
  renders compact (no topper, seal unchanged). Save under
  docs/seal-rings-evidence/ and reference them in the report.

## Report and banking

LANE-REPORT.md in the repo root: per-part summary, the exact seasonal
mechanism and window constant, the normalizeSeal read-path choice, suite
results (your own counts), capture file names, and every deviation.
Commit in logical commits on this branch (seal-rings). No deploys,
neither game nor worker.
