# Brief: weigh in on unifying cities and landmarks into one pool across the game

Sean's question (2026-10-18): should the game unify its two
location banks (805 cities in `assets/locations.json`, 427
landmark-file entries in `assets/locations-landmarks-sol.json`)
into one pool across the whole game? His motivation is
simplifying the game and its screens. Deliverable:
`docs/pool-unification-weighin.md`. Weigh-in only: do not modify
source files. Leave it uncommitted.

## Scope of "unification" to evaluate

Three scopes; weigh each and recommend one (or a fourth you
derive):

1. **Full:** one playable pool everywhere. The Daily draws from
   all locations, Survival is one mode over everything, one
   Passport dex with one completion number, one "places found"
   count, and the Classic/Landmark Survival split is retired.
2. **Survival + Passport:** Survival unifies into one mode over
   the combined pool (retire the split and merge the bests);
   the Passport becomes one dex with filters (All / Cities /
   Landmarks / Areas) instead of two tabs; the Daily stays
   cities-only.
3. **Passport only:** one dex with filters; everything else
   untouched.

## What the weigh-in must be grounded in (read the code and data)

- **Current pool consumers:** Daily (`src/modes/daily-game.js`,
  pinned, cities only), Classic Survival, Landmark Survival
  (`src/modes/survival.js` sources with its band ramp and
  per-mode pool config), Expeditions (mixed already), PvP
  (server catalog from cities only, in `pvp-worker/src/`), the
  Daily postcard pack (designed in `docs/daily-pack-spec.md`,
  draws from both pools uniformly), Trivia (its own bank).
- **Draw behavior today:** the Survival band ramp concentrates
  early rounds in difficulties 1-5; the landmark pool's thin
  cohorts (difficulty 3 has 8 entries of 341) create the
  perceived-rigging effect Sean reported (CERN four times in
  three games, measured honest). Show, with numbers from the
  data, how each scope changes this.
- **Completion and saved state:** Passport shelves, per-mode
  share texts, best-streak keys per mode, country and continent
  completion math, `VERSIONED_KEYS` and what merges or migrates.
- **The Daily's pin mechanism:** what "pinned Daily from a
  unified pool" does to generation, comparability, and the
  subscription-era promise around the exact daily game.

## Settled rulings you must not quietly overrule

Landmark postcards never count toward city totals; Trivia's bank
is self-contained; per-mode share formats are deliberate and
separate; the Daily pin behavior and saved keys are a contract.
If a scope needs any of these to change, name the ruling, say
so, and treat it as a decision for Sean rather than a premise.

## The deliverable's shape

- Your independent verdict and recommended scope, up front.
- A simplification ledger: which screens, tabs, hubs, bests, and
  share formats disappear or merge under each scope, grounded in
  the current UI (measure the home screen and hubs like the pack
  spec did if it helps).
- The cost side: what breaks or migrates under each scope
  (bests migration, completion-math changes, Daily identity,
  PvP pressure), priced separately from the benefits.
- A build and migration sequence at the end, with sizes.
- A numbered decision list for Sean with your recommendations.
- Where you disagree with the orchestrator's stated lean (it
  favored scope 2 and argued the Daily is doing brand work; the
  pack is already the mixed daily surface), say so explicitly
  and make your case. Sean reads disagreement.

For reference on the pattern, the orchestrator's own lean in
chat was: keep the banks, unify draw policy, unify Survival and
the Passport, keep the Daily cities-only. Test that against the
code, not the chat.
