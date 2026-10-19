# Brief: daily postcard pack spec, with a homepage placement and cleanup review

Work in this clone (pack-work), based on current main. Sean asked
Opus to weigh in on the daily pack idea and write the spec.
Deliverable: `docs/daily-pack-spec.md`. Spec only: do not modify
source files. Leave the spec uncommitted.

## The settled design (Sean, 2026-10-18, future-features item 11)

Do not relitigate these; weigh in on everything around them:

- A daily pack of 3 postcards beside the Daily game. Each card
  opens as a round in the PvP format: clue only, pin the location,
  then the reveal (the card's photo is the reveal).
- Selection: full RNG from a mixed pool of the 805 cities and the
  427 landmarks, unique per player, repeats allowed. No weighting.
- Payout: every card pays out. Within 150 km earns the full-color
  postcard under the normal rules. A miss earns the card in black
  and white, the visited version. Black and white upgrades to
  color when the place is earned properly in any mode.
- Scores personal only (contents unique per player). Subscriber
  perk: one extra pack per day; the free pack and the Daily stay
  untouched.
- Origin: GeoDex (daily RNG packs of GeoGuessr meta cards). What
  was borrowed is the pack ritual only; rarity tiers and
  RNG-granted collection were explicitly rejected.

## What the spec must cover

1. **Your independent weigh-in first.** Does this earn its place
   beside the Daily? Ritual fatigue, the black and white card
   versus the Passport's existing mystery (unvisited) cards, what
   a repeat card does to motivation, the subscriber perk's shape.
   Say where you disagree with the settled points and why; Sean
   reads disagreement, he does not need agreement theater.
2. **Full mechanics.** Pack generation and per-day state (one new
   saved-state key: name it, give its shape, the daily reset
   semantics in the player's timezone, what happens mid-pack
   across midnight), the round flow reusing the PvP clue-only
   format, how the visited (black and white) state is stored and
   how the upgrade to color is detected across modes, where pack
   cards appear in the Passport (cities tab, landmarks tab, both),
   what counts toward visited totals and what never counts toward
   earned completion, the pack's own results/share surface (the
   per-mode share formats are deliberate and separate; propose
   whether the pack gets one and what it says), and the subscriber
   second pack (same rules; how entitlement is checked given
   accounts Phase 1 is dark behind a flag).
3. **Homepage placement.** Inventory the current home screen from
   the code (element by element, in order: Daily, Survival hub,
   Challenge, More modes, Weekly/Classics, Passport, Stats, and
   everything else that renders). Propose 2 or 3 placements for
   the pack with tradeoffs, and recommend one. Placement must
   respect settled rulings: the Daily takes the full top row;
   one home Survival button with its picker hub; More modes beside
   Challenge.
4. **Homepage cleanup opportunities.** Audit the same inventory
   for clutter: duplicated entries, dead or disabled affordances
   (Endless is disabled but its logic and any entry points remain),
   weak labels, anything two taps deep that should be one, anything
   one tap that should be two. For each item: keep, demote, merge,
   or remove, with the reason and the risk. Follow the precedent
   of the shipped Challenge page declutter (light trim over
   redesign) and Sean's plain-interface direction. Do not propose
   consolidating the per-mode share formats.
5. **Build sequence and open questions.** Ordered build steps with
   sizes, what is verifiable headlessly, what needs Sean's phone.
   End with a numbered list of decisions Sean must make, each with
   your recommendation. Keep the list complete; he answers these
   in one pass.

Write the spec so Sean can approve it at a glance: weigh-in and
recommendations up front, detail behind them.
