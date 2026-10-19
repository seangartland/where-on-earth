# Brief: extent-aware scoring implementation plan (plan only, no code)

Work in this clone (extent-work), based on current main. Sean
approved this work on 2026-10-17 (radius model) and asked for the
plan before any code. Deliverable: `docs/extent-aware-scoring-plan.md`.
Plan only: do not modify source files. Leave the plan uncommitted.

## The approved model (Sean's rulings, binding)

- Area features score from their edge, not their center pin:
  `adjustedKm = max(0, pinDistanceKm - extentKm)`.
- Strict no-op for every entry without `extentKm`: all 805 cities,
  every landmark without extent data, and the Daily are bit-for-bit
  unaffected. The frozen v2 difficulty scorer is not touched (this
  is runtime scoring, not difficulty scoring).
- Everything derived from distance follows the adjusted figure:
  the round score, the displayed km, the 150 km postcard line, and
  Bullseye (strictly under 25 km).
- First scope: the 9 banked area entries that already carry a
  hand-set `extentKm` in `assets/locations-landmarks-sol.json`
  (amalfi-coast 30, bering-strait 45, black-forest 80,
  daintree-rainforest 35, danube-delta 50, dead-sea 55,
  great-ocean-road 122, napa-valley-ava 30, suez-canal 97). These
  entries are currently excluded from the playable landmark pool
  by Sean's ruling until this scoring ships.
- Lakes are a follow-up data pass, not this plan's build scope:
  state what data they need and how they would join later.

## What the plan must answer

1. **Where distance lives now.** In the modularized code (src/),
   identify the exact shared distance path(s): every place a
   pin-to-target distance is computed or consumed (round scoring,
   reveal display, postcard check, Bullseye/Pinpoint, Survival
   elimination at 150 km, PvP rounds, Weekly Expeditions stops,
   Trivia if it computes distance). One choke point or several:
   say which, with file and function names.
2. **The change.** Where `extentKm` is read, how the adjusted
   distance propagates so every consumer in (1) gets the adjusted
   figure without duplicating the adjustment, and how the no-op
   property is guaranteed structurally (not by convention).
3. **Mode-by-mode effects.** Classic modes, Landmarks mode (the 9
   entries join the playable pool: what flips them in), Survival
   and Survival: Tap the Country, PvP (landmark rounds?), Weekly
   Expeditions (the three live island stops: Easter Island,
   Galapagos, Lord Howe have no extentKm; state whether they stay
   center-scored in this scope), Daily (must be untouched: say why
   it cannot be affected), Endless (disabled; note only).
4. **Reveal copy.** The 0 km case ("inside the feature") and the
   general adjusted case: what the player sees for km and score,
   consistent with existing reveal patterns. Postcard and Bullseye
   behavior at the boundary (adjusted exactly 150, exactly 25).
5. **Edge cases.** Entries whose extent exceeds any plausible
   guess distance; guesses on the far side of a large feature;
   extent versus the pin-noise floor (median pin error 0.78 km);
   the Gurudongmar Lake entry (parked data repair, not playable:
   confirm it stays out).
6. **Verification.** A test plan that proves: the 9 entries score
   by adjusted distance at sampled guess points (inside, at the
   border, outside); a sample of city and no-extent landmark
   rounds produce identical scores and km before and after the
   change; the Daily for a fixed date is unchanged.
7. **Build sequence and size.** Ordered steps with an effort
   estimate per step, what can be verified headlessly, and what
   needs Sean's phone check. Flag any step that needs a Sean
   decision before it can be built, as a numbered open question
   with your recommendation.

Write the plan for Sean to approve at a glance: headline first,
then the answers in order, open questions last.
