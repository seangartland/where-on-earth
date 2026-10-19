# Pacing and monetization model

Decided by Sean 2026-10-18, building on Sol's pool-unification weigh-in (docs/pool-unification-weighin.md). This doc is the single spec for the unification batch, the home cleanup, the Practice earning rules, and the pack landmark guarantee. Where it conflicts with the weigh-in, this doc wins; the weigh-in's other recommendations stand as adopted.

## The model in one paragraph

Postcards are earned on calendar-paced surfaces only: the Daily, the Daily postcard pack, and Expeditions. Everything else is Practice: it records visits and personal bests, and never earns or upgrades a postcard. Because earning is paced by the calendar, a subscription can sell speed (more earning chances) without selling content. The free game stays complete: a free player can finish the whole Passport, at the calendar's pace.

## Earning surfaces (free tier)

| Surface | Earning rule | Pace |
|---|---|---|
| Daily | 5 city rounds, postcards as today | 5 guaranteed city draws per day |
| Daily postcard pack | 3 cards, color postcard inside 150 km, black and white visit otherwise | 3 draws per day; one of the 3 is always a landmark (see guarantee) |
| Expeditions (Weekly + Classics) | Postcards as today | Weekly: one stop unlocks per day, catch-up Sunday. Classics: finite routes |

City math: the Daily alone floors city completion at 161 days for 805 cities. Passport totals are unchanged: landmark postcards never count toward city, country, or continent totals.

## Practice surfaces

Practice records visits and per-mode bests only. It never earns a postcard and never upgrades an earned postcard's tier or best distance.

- Survival (merged, see unification): the practice ground. Its headline stays rounds survived and best streaks.
- Tap the Country and Country Blackout: unchanged in their own country loops; they sit in the Practice hub.
- Trivia: unchanged (never earned).
- PvP: unchanged (visits only, already practice by this definition).

Nothing already earned is taken away. Existing bests are preserved (unification decision: bests are the read-time max of the legacy keys).

## Home structure

Five tappable zones plus the settings gear, in order:

1. Passport card: the whole card is the Passport button (Option A, decided 2026-10-18). The Stats/Passport links row is deleted; Stats moves into the Passport screen.
2. Daily (full row, as today).
3. Daily postcard pack row (live since 2026-10-18).
4. Expeditions.
5. Practice: one hub holding Survival, Tap the Country, Country Blackout, and Trivia. The hub carries the practice promise in its copy: these modes do not earn postcards.

The More modes hub is retired (its last tenant, Trivia, moves into Practice). The Challenge button's placement is unchanged by this doc; it is a social surface, not a practice mode.

## Unification (adopted from the weigh-in, with overrides)

- Scope: Survival only. Landmark Survival merges into Classic Survival over one pool of every playable city plus the Landmark pool (805 + 341 = 1,146 at decision time, including the 9 extent-aware areas; the total floats as the bank grows, 1,166 after lakes and parks batch 1 landed the same evening).
- Draw: Classic's uniform band 1-10 over the merged pool, plus the weigh-in's draw fix (item-uniform within the ramp range). Measured effect: worst cohort overdraw falls from 9.2x to about 1.5x; any single landmark's share of runs falls from 12.9% to about 0.6%.
- `?mode=landmarks` aliases to Survival. The `?area=` test hook keeps working through the merged pool.
- Passport tabs unchanged. Daily stays cities-only. The PvP catalog stays cities-only.
- Override vs the weigh-in: the hub is not retired outright; it returns as the single Practice hub above. Earning changes per this doc (Survival stops earning postcards), which the weigh-in did not propose.

## Pack landmark guarantee

Of the 3 daily pack cards, exactly one slot is drawn from the pack pool's landmark subset (332 point landmarks at build time) and the other two from the full pack pool (1,137). Cards within a day's pack stay distinct. The guarantee applies when a day's pack is generated; a pack already generated for today is not redrawn. This is the landmark drip that replaces Landmark Survival's earning: landmarks get at least one guaranteed daily draw, plus Weekly route stops.

## Monetization (the lever, not yet the build)

What a subscription sells is more chances to complete the Passport faster. Candidate paid shelf, all specced elsewhere and gated below: one extra daily pack (entitlement key `daily_pack_extra`, pack spec decision), the Daily archive, and optionally one earning Survival run per day for subscribers while free Survival stays practice. The free Daily and the free pack are never reduced.

Gates before any charging is built: (1) accounts live (Phase 1 is built dark; Sean's Google OAuth client, Resend setup, and iPhone acceptance check are open); (2) Gate G2 from the payments addendum: the served imagery must be legally cleared for commercial use (our own mosaic passing its review gate, or EOX's commercial license); (3) the payments addendum's eight decisions. Nothing in this batch builds charging. The one structural requirement now: earning rules live in one shared place in code, so an entitlement can widen them later without a second refactor.

## Build order

1. Unification core (merged pool, draw fix, alias, bests preservation).
2. Practice earning rules and the home restructure (Option A card, Stats into Passport, Practice hub, Expeditions button).
3. Pack landmark guarantee.
4. One batched deploy, cargo named, production-verified, then Sean's phone check.
