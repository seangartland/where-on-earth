# Pacing build, phase 3 report: pack landmark guarantee

Built by Muse Wonder in-session, 2026-10-18. Spec: docs/pacing-and-monetization.md.

## What changed

- `src/meta/pack-store.js`: a freshly generated pack now draws one slot from the pack pool's landmark subset (332 point landmarks), the other two from the full pack pool (1,137), then shuffles the three so the landmark is not always the first card. The repair path (an unplayed slot whose id left the pool) also keeps the guarantee: if no other slot holds a landmark, the replacement is drawn from the landmark subset. A pack already generated for today is never redrawn, so packs stored before this change load exactly as they were.

## Verification

- New test file `test/pack-guarantee.test.mjs`: 5 of 5 pass, including 500 simulated days with a seeded RNG (every pack held at least one landmark and three distinct cards), the landmark landing in more than one slot across days, a stored landmark-free pack loading unchanged, and the repair case.
- Full node suite: all six test files pass (41 tests), syntax clean.

## Count note

The merged Survival pool is no longer the 1,146 measured in phase 1: the lakes and parks batch banked 20 new extent-aware areas the same evening (b42338f), so the Landmark pool stands at 361 and the merged pool at 1,166. The composition rule is unchanged (every playable city plus landmarkPool()); only the bank grew, exactly as the design intends. The pack pool is unaffected (1,137): the new entries are areas, which the pack excludes by the approved decision.
