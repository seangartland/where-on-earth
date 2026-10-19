# Unifying cities and landmarks into one pool: weigh-in

Date: 2026-10-18. Prepared from `BRIEF-unify-weighin.md`.
This is a weigh-in only. No source files were changed.

**How this was done.** I read the code on this branch (HEAD 802025e).
I counted the pools with node, using the game's own `isPlayableLocation`
and `isLandmark` from `src/daily.js` and a copy of the
`isPoolLandmark` rule from `src/modes/landmarks.js`. The draw
probabilities in section 2 are **computed exactly** from the draw code
as written, not simulated. They need one **assumption**: how long runs
last. I use a 5-round run because there is no telemetry on real run
lengths. I did **not** re-measure the home screen. I reused
the 390x844 and 390x664 measurements in `docs/daily-pack-spec.md` §3a,
which were taken today. Since that spec's commit (5277bbb),
`index.html`, `main.js` and `passport.js` have not changed, and the only
change under `src/modes/` is the extent build in `landmarks.js`
(checked with `git log`).

---

## 0. Verdict

**Recommended scope: a fourth one, "Survival only, with a draw fix".**

1. Merge Landmark Survival into Classic Survival as one mode over
   805 cities + 341 landmarks (1,146).
2. Fix the draw policy in the same change.
3. Leave the Passport's three tabs alone.
4. Keep the Daily cities-only.

This is scope 2 without the Passport half.

Why:

- **Survival is where the real simplification is.** Merging it removes
  a whole hub. Once the approved cleanup C2 takes the dead Photo row
  out of More modes, Landmark Survival and Trivia are the only rows
  left. Merge Landmark Survival and the hub has one row, so the home
  cell can open Trivia directly. That is one less screen, one less tap
  to Trivia, one less best streak, one less share format and one less
  deep-link mode. Nothing else on the list removes a screen.
- **The rigging effect is a draw-policy bug, not a pool-size problem.**
  Landmark Survival picks a band first and then an item inside it. Its
  difficulty-3 band has only 8 entries, so CERN comes up in **12.9% of
  runs, 9.2 times a flat draw**. Merging the pools cuts CERN to 1.3% of
  runs. A uniform band draw over the merged pool brings the
  most-overdrawn item down to **1.5 times** a flat draw (section 2). The
  draw fix is needed whichever scope you pick.
- **The Passport merge simplifies almost nothing and runs into a
  ruling.** A type filter replaces one tab button with one filter
  control. The two dex tabs already share all their code (`ppDex`). The
  version that would genuinely simplify things, an "All" view with one
  completion number, needs a combined total, and the ruling that
  "landmark postcards never count toward city totals" forbids that
  (section 3b).
- **A mixed Daily is technically possible but a bad trade.** The pin
  contract can take it. It would cost three edits to the contract file,
  a new boot dependency, a Daily whose round 5 is landmarks half the
  time, and—if “one playable pool everywhere” is literal—a rebuild of
  PvP's catalog and scoring (section 4).
  The approved Daily postcard pack is the right place to put landmarks
  in a daily ritual. It is **not built yet**, though (section 6).

---

## 1. Today's pool consumers (read from code)

| Consumer | Pool | Draw | Best / saved state | Share |
|---|---|---|---|---|
| Daily (`daily-game.js`, `daily.js`) | cities only: `bandQueues` filters `!isLandmark` | 5 bands (1-2 … 9-10), a seeded shuffle per band, day N takes index N mod band length; pins first (`resolvePinnedIds`) | `GAME_KEY`, `STREAK_KEY`, `HISTORY_KEY` (versioned) | Daily "I scored" format |
| Classic Survival (`survival.js` `CLASSIC`) | 805 cities | **uniform band 1-10** every round (Sean's random-band change, `survival-random-report-sol.md`), then a uniform item in that band | `where-on-earth-survival-best-v1` (plain integer) | title "Survival", `?mode=survival` |
| Landmark Survival (`landmarks.js` `landmarksSource`) | 427 file entries narrow to `landmarkPool()`: **341** (332 rated landmarks + 9 areas with an extent since 823c25a) | **ramp** `[1,3],[1,4],[2,5]…[9,10]`, a uniform band inside the range, then a uniform item | `where-on-earth-best-landmarks-survival` (plain integer) | title "Landmark Survival · ", `?mode=landmarks` |
| Expeditions and the Weekly | already mixed: `findLocation()` resolves cities, then landmarks | fixed routes | `EXPEDITION_KEY`, `WEEKLY_KEY` | — |
| PvP (`pvp-worker/src/`) | a server `CATALOG` built from `locations.json` only (`category === 'city'`), with `CATALOG_VERSION` a sha256 | 5 bands, server RNG, no repeated country | server-side records | PvP formats |
| Daily postcard pack (`daily-pack-spec.md`) | approved but unbuilt: 805 cities + 332 point landmarks (1,137), uniform; it excludes the 9 areas added to `landmarkPool()` later | 3 distinct cards a day | `where-on-earth-pack-v1` (planned) | none (approved) |
| Trivia | its own `trivia-bank.json` (ruling: self-contained) | — | `where-on-earth-best-trivia` | Trivia format |

Facts that matter later:

- **Classic and Landmark Survival use different band rules today.** The
  brief says "the Survival band ramp concentrates early rounds in
  difficulties 1-5". That is true of Landmark Survival only. Classic is
  uniform 1-10. A merged mode has to pick one rule.
- Ids never collide between the two files (0 collisions). Both files
  rate difficulty with the same v2 scorer (the same `difficultyWhy`
  format), so their bands are comparable.
- The passport store is already one record. `recordVisit()` writes
  every id into `PASSPORT_KEY`. The split exists only at read time:
  `passportLocation()` is cities only, and `landmarkLocation()` is
  landmarks only.
- Home, Places, country and continent completion are all calculated
  from `host.locations` / `state.locations` only. The Landmark shelf
  separately counts `host.landmarkShelf()`. Thus Scope 3 can rearrange
  navigation without migrating visits, but an All total in Scope 1 or
  2 changes presentation semantics even though the saved record is
  already shared.
- Survival best keys are **not** in `VERSIONED_KEYS`. They are plain
  integers, but both are on the account sync allow-list (`sync.js`
  `FIXED_KEYS`, `merge.js` `BEST_KEY_PATTERN`, and
  `test/account-merge.test.mjs`).

---

## 2. Draw behaviour: the CERN effect in numbers

Pool cohorts by difficulty (measured):

| Difficulty | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Cities (805) | 80 | 61 | 76 | 108 | 105 | 103 | 98 | 78 | 63 | 33 |
| Landmark pool (341) | 15 | 15 | **8** | 36 | 53 | 47 | 53 | 23 | 48 | 43 |
| Merged (1,146) | 95 | 76 | 84 | 144 | 158 | 150 | 151 | 101 | 111 | 76 |

The difficulty-3 landmarks are Area 51, Delphi, the Great Sphinx, the
CERN ATLAS Experiment, the Matterhorn summit, Medellín, the Terracotta
Army and Mount Vesuvius.

Exact per-run figures from the draw code. Runs are 5 rounds unless
noted. "Flat" means every item in the pool is equally likely.

| Policy | P(CERN in a run) | CERN per run | Most-drawn item vs flat | Landmark share, rounds 1-5 |
|---|---|---|---|---|
| **Landmark Survival today** (341, ramp, band then item) | **12.9%** (1 in 7.4) | 0.135 | **9.2x** (every d3 item) | 100% |
| Classic Survival today (805, uniform band) | 0 | 0 | 2.4x (d10 cities, the thinnest band) | 0% |
| Landmarks only, ramp, **item-uniform within the range** (the fix, no merge) | 5.5% (1 in 18) | 0.056 | 3.8x | 100% |
| Merged, ramp, band then item | 1.3% (1 in 78) | 0.013 | 3.0x (d3 cities such as Algiers) | 15% → 31% |
| Merged, ramp, item-uniform within the range | 1.0% (1 in 96) | 0.010 | 2.4x | 15% → 31% |
| **Merged, uniform band 1-10** (Classic's rule) | 0.6% (1 in 168) | 0.006 | **1.5x** | 29% every round |

Reading it:

- **The code is honest. The pool is lopsided.** Under the ramp, rounds
  1 to 4 draw a difficulty-3 band about 1.08 times per run, and that
  band holds 8 landmarks. So each of the 8 shows up about once every
  7.4 runs. CERN four times in three games is still rare, even under
  today's code: about 1 in 1,900 (5e-4) for at least four CERN
  appearances across three independent five-round runs. It is the kind
  of streak a frequent player will eventually hit, but it
  is not what a typical session looks like. Sean's sighting is
  consistent with honest code plus a thin cohort plus luck.
- **The draw fix alone** (item-uniform within the ramp's range) cuts
  the over-draw from 9.2x to 3.8x with no merge. It is about five lines
  in `survivalPick()`.
- **Merging dilutes the landmarks.** Under the ramp, early rounds are
  85% cities, because the merged d1-d3 cohorts are mostly cities. A
  Landmark Survival fan loses the "famous places" run. Under the
  uniform band, landmarks are a steady 29% of rounds, and the flattest
  item spread of any option (1.5x).
- **The ramp leaves items unreachable in short runs.** With 5-round
  runs, 288 merged items (difficulty 9 and 10 before round 6) have zero
  chance. That is by design, but it means a short player never sees
  most of the hardest landmarks.

**Recommendation for the merged mode: Classic's uniform band 1-10.**
It is your own standing ruling for Classic. It has the flattest spread
and gives landmarks a fair, steady share. It also means Classic
players notice nothing except landmarks appearing. The ramp's
onboarding value is real, but the Daily already gives new players a
graded climb.

---

## 3. Simplification ledger

### 3a. What disappears or merges under each scope

| Surface | Today | Scope 3: Passport only | Scope 2: Survival + Passport | **Recommended: Survival only** | Scope 1: Full |
|---|---|---|---|---|---|
| Home grid | Daily · Survival / Expeditions · Challenge / More modes | unchanged | More modes cell → **Trivia** direct | same as scope 2 | same as scope 2 |
| More modes hub | Landmarks, Trivia, Photo (disabled; C2 removes it) | unchanged | **gone** (one row left) | **gone** | gone |
| Survival hub | Classic, Tap the Country, Blackout | unchanged | the Classic row is just "Survival", with the merged best | same | same |
| Survival modes | 2 (Classic, Landmark) | 2 | **1** | **1** | 1 |
| Survival bests | 2 keys | 2 | 1 shown | 1 shown | 1 |
| Share formats | Survival, Landmark Survival (plus the others) | unchanged | Landmark Survival's retired | same | same, and the Daily's content changes |
| Deep links | `?mode=survival`, `?mode=landmarks` | unchanged | `landmarks` aliases to Survival | same | same |
| Passport tabs | Places, Countries, Landmarks | **2** (Places with a type filter, Countries) | 2 | **3, unchanged** | 2 |
| Completion numbers | home "N / 805 places found"; Places header; "X of 341 landmark postcards" | per filter (see 3b) | per filter | unchanged | **one number**: needs the ruling changed |
| Daily | cities | cities | cities | cities | mixed |
| PvP catalog | cities | cities | cities | cities | **mixed** if “everywhere” is literal; L server cost (section 5) |

Net count of things that go away under the recommended scope: **one
hub screen, one mode, one best line, one share format, and one tap
from home to Trivia.** Scope 2 adds one tab removed, but one filter
control added. Scope 3 alone removes one tab button and nothing else.

That hub-screen saving is conditional on shipping the already approved
C2 cleanup from the pack spec. On the branch as it stands, the disabled
Photo row remains; if C2 is held back, a Survival merge leaves Trivia
plus Photo in More modes and the hub cannot disappear yet. The mode,
best and share-format savings do not depend on C2.

For Scope 1, the last cell should read **mixed** if “everywhere” means
what it says. Leaving PvP cities-only is a narrower fifth scope, not Full.

Home height does not change under any scope. The grid keeps its pairs,
and P1 (the pack row) plus C5 are still what pays for fitting the
664 px phone, per the pack spec.

One caveat on removing the hub: Photo-first (future-features item 2)
is the next new mode. When it ships, More modes probably comes back as
a two-row hub. Removing it now and re-adding it later is one markup
block, so I would still remove it now (decision 4).

### 3b. Why I would not merge the Passport tabs

- **There is no code saving.** Places and Landmarks are already one
  component, `ppDex()`, with shared filters, slots and the mystery
  template. The Landmarks tab is about 15 lines (`renderLandmarkShelf`
  plus its markup). A type filter is about the same amount of code in a
  different place.
- **A Cities / Landmarks filter is just the tabs again.** The only
  version that is simpler for the player is **All**. All needs a header
  number, and every option for that number has a cost:
  - "N / 1,146" is a combined total. It is not literally a city total,
    but it sits where "places found" sits and reads the same way. In my
    reading that crosses the "never count toward city totals" ruling,
    and it is your call, not mine.
  - Showing no number on All loses the progress bar that tops the page.
- **Grouping by country under All breaks the numbers.** The dex groups
  by continent and country. With landmarks mixed in, Italy's group in
  Places would show more cards than Italy's row on the Countries tab
  ("12/36 places"), which by ruling excludes landmarks. The same page
  would show two different counts for Italy.
- **"Areas" as a filter is too small.** There are 9 areas in the pool.
  A filter chip for 9 cards is noise. If the tabs do merge, fold areas
  into Landmarks, as the shelf does today.

If you want the Passport merge anyway for the look, the honest form is:
Places with two type chips (Cities by default, Landmarks), each with
its own header number, and no All. That changes no ruling. Size M.

---

## 4. The Daily from a unified pool

What it would take, read from `src/daily.js`, `daily-game.js` and
`daily-mechanism-rec-opus.md`:

- **Three edits in the contract file.** `bandQueues` (the
  `!isLandmark` filter), `resolvePinnedIds` (`usable` rejects
  landmarks) and `loadDaily` (its `.filter(… && !isLandmark)` would
  throw out a pinned landmark and restart the player on a recomputed
  game). All three must change together. The pin step imports the same
  file, and `scripts/lib/deployed-daily.mjs` runs production's own
  copy, so the first deploy is safe: dates in the window keep their
  city pins. **Every date after that window reshuffles**, because every
  band queue changes length. The contract allows that ("adding a
  location takes effect at the first date outside W"), so this is not a
  breach.
- **The new band sizes, and what the Daily would become:**

  | Daily round (weight) | R1 (x1) | R2 (x1) | R3 (x2) | R4 (x3) | R5 (x3) |
  |---|---|---|---|---|---|
  | Cities today | 141 | 184 | 208 | 176 | 96 |
  | Merged | 171 | 228 | 308 | 252 | 187 |
  | Landmark share | 18% | 19% | 32% | 30% | **49%** |

  The x3 finale would be a landmark about half the time. Day-to-day
  comparability changes too: a player's average after the change is not
  comparable with their average before it. Same-day comparability, the
  thing the share sells, is unaffected because everyone still gets the
  same game.
- **A new boot dependency.** The Daily needs only `locations.json`
  today. The landmarks file (280 KB) loads as non-critical. Its failure
  disables Expeditions and Landmarks, nothing more. A mixed Daily makes
  that file critical: if it fails, the Daily fails.
- **Area scoring in the Daily.** The 9 areas score by edge distance
  (`scoring.js`, since today). That is fine in a local Daily, but it
  is the first rule a server would have to copy (section 5).
- **Archive and replay (the subscription-era promise).** The pins log
  is already the record of what was served. Under a mixed Daily, a
  replay depends on both files keeping their ids. The tombstone file
  the mechanism doc plans for "when the subscription becomes real"
  would have to cover the landmarks file too. That file is the younger
  and less settled bank: 489 entries were removed on 2026-10-15
  (`locations-landmarks-removed-2026-10-15.json`) and 9 areas were
  added today. Substitution keeps a past day playable, but it changes
  that day's game. A paid archive that quietly replaces a past round is
  the weak spot of the archive promise, and a mixed Daily makes it
  more likely.

Those are the three contract gates, not the whole implementation. The
client and pin step must also pass a combined list into them, and
`loadDaily()` must resolve saved ids across both catalogs; today it
searches `state.locations` only. That wiring is where the second file
becomes a critical Daily dependency.

**Verdict on the Daily: keep it cities-only.** The pin mechanism can
take the change. What decides it is cost against gain: three contract
edits, a critical second file, a half-landmark finale and pressure on
PvP, in exchange for a pool the pack and Survival will already put in
front of players daily.

---

## 5. Cost side, priced separately

| Cost | Scope 3: Passport only | Scope 2: Survival + Passport | Survival only (recommended) | Scope 1: Full |
|---|---|---|---|---|
| **Bests migration** | none | Show `max(classic, landmark)` at read time. New runs write the Classic key. Freeze and never delete the landmark key; it stays on the sync allow-list and in `BEST_KEY_PATTERN`. No write migration | same | same |
| **Draw / mode identity** | none | Classic players start seeing landmarks (29% per round under the recommended rule); Landmark players lose their all-landmark run | same | same, plus Daily and PvP pool changes |
| **Share formats** | none | Retire Landmark Survival's format with its mode; surviving formats remain separate. This needs Sean's ruling because per-mode formats are settled | same | same; Daily/PvP formats need not change, but their content does |
| **Deep links** | none | Alias `?mode=landmarks` to Survival | same | same |
| **Boot dependency** | none beyond today's optional landmark shelf | Survival must wait for both files; a city-only fallback keeps it playable if landmarks fail | same | the Daily becomes dependent on both files too |
| **Completion math** | Per-filter headers; an All total needs Sean to change the city-total ruling | same | none | Scope 1 requires the home and Passport to show one combined number, so it **requires** that ruling change |
| **Saved Passport state** | No migration: `PP_VIEW_KEY` never persists `landmarks`, and `PP_STATUS_KEY` is Places-only; new filter state may stay in memory | same | none | same as Scope 3 |
| **`VERSIONED_KEYS`** | none | none: Survival bests are unversioned raw integers | none | none if `GAME_KEY` retains its shape; only its ids change |
| **Daily identity** | none | none | none | every future unpinned date reshuffles; R5 is about half landmarks; replay now depends on two catalogs |
| **PvP** | none | none | none | **L if Full means everywhere.** Rebuild `build-catalog.mjs` from both files, port edge-distance scoring to the Worker and parity test, and bump `CATALOG_VERSION`. Open matches store their locations at init, so they survive. Keeping PvP cities-only avoids this cost but is not Full |
| **Daily postcard pack** | no change | Its approved 1,137-item pool is close to, but not identical to, merged Survival: it omits 9 areas | same | Its distinct reason (“the daily mixed surface”) disappears. Adding the 9 areas to its approved pool is a separate Sean decision |

---

## 6. Where I disagree with the orchestrator's lean

The lean was: keep the banks, unify the draw policy, unify Survival
and the Passport, and keep the Daily cities-only, because the Daily is
doing brand work and the pack is already the mixed daily surface.

1. **Keep the banks, unify Survival: I agree.** That is my core
   recommendation.
2. **"Unify draw policy" needs a concrete rule, and merging is not the
   fix.** Merging alone, with the ramp kept, still over-draws d3 cities
   3x. The rigging effect comes from band-then-item over thin cohorts.
   The fix is choosing the band rule, and I recommend Classic's uniform
   band (1.5x). A merge without that choice moves the problem from
   landmarks to cities.
3. **The Passport: I disagree.** Merging it saves one tab button and no
   code, and the version that would really simplify things (All with
   one number) runs into the city-totals ruling and puts two counts
   for one country on the same page. I would leave the tabs.
4. **"The pack is already the mixed daily surface": not yet.** It is
   specced and approved, but nothing in `src/` implements it (no
   `PACK_KEY`, no pack module). Today the game has no mixed daily
   surface. The argument holds only once the pack ships, so the order
   matters: ship the pack before or with the Survival merge, so
   landmarks never lose their daily presence.
5. **"The Daily is doing brand work": right conclusion, unmeasured
   reason.** There is no data on the Daily's brand effect. The grounds
   I can show from the code are the ones in section 4: three contract
   edits, a critical second file, a 49%-landmark finale and PvP
   pressure. I would rest the decision on those.

---

## 7. Build and migration sequence (recommended scope)

| Step | Size | What | Verifiable headlessly | Needs Sean's phone |
|---|---|---|---|---|
| 1 | S | One pool function, `survivalPool()` = playable cities + current `landmarkPool()` | Node test: count 1,146, including 9 areas, with 0 id collisions | — |
| 2 | S | The Survival draw over the merged pool under the chosen rule (uniform band recommended); wait for the landmark request to settle, then fall back to cities only on failure | Node test of the exact per-item expectation (section 2's method): max under 1.6x flat, no zero-chance items; rejected landmark promise starts a city-only run | — |
| 3 | S | Bests: `max(survival-best-v1, best-landmarks-survival)` on read; writes to the Classic key; no key deleted | Unit test with a fake `localStorage`: landmark best 12, classic 7 → shows 12, and a run of 13 writes 13 to the Classic key; the sync tests still green | — |
| 4 | M | Retire the Landmark Survival entry: remove `landmarksSource` and the More modes hub; the home cell opens Trivia directly; `?mode=landmarks` aliases to Survival; one Survival share format; the hub row label "Survival" | DOM checks: no More modes hub, the Trivia cell opens Trivia, both deep links start a Survival run; `scripts/regression.sh` green; `node --check --input-type=module < src/main.js` | Hub and home look, at 390 px |
| 5 | S | Batch deploy with the pack (name the cargo first) | Push verified on origin/main; Vercel READY | First merged run |

That is about one focused build session for steps 1 to 4. Running it
alongside or after pack steps 1 to 3 avoids two passes over
`survival.js` and `round.js`, but the two pool functions must remain
distinct unless Sean separately adds the 9 areas to the approved pack.

If you add the Passport merge (scope 2), it is one more **M** step:
type chips on Places, the Landmarks tab removed, per-chip header
numbers, and areas folded into Landmarks. It needs a phone check for
the filter's feel.

If you choose Full (scope 1), add **M** for the Daily edits in
`daily.js`, `daily-game.js` and the pin dry-run, and **L** for PvP
(catalog, server scoring parity and version), plus your ruling changes
first.

---

## 8. Decisions for Sean

1. **Scope.** Full, Survival + Passport, Passport only, or Survival
   only with the draw fix? *Recommend Survival only.*
2. **Band rule for the merged Survival.** Classic's uniform 1-10, or
   Landmark's ramp? *Recommend uniform: your Classic ruling, the
   flattest spread (1.5x), landmarks a steady 29%.*
3. **Retiring Landmark Survival's share format** along with the mode.
   This touches the per-mode share-format ruling, so it is your call.
   *Recommend yes: the surviving formats are unchanged.*
4. **More modes hub.** Remove it and point the home cell at Trivia, then
   re-add the hub when Photo-first ships? *Recommend yes.*
5. **Merged best.** Read-time `max` of both keys, landmark key frozen
   and never deleted? *Recommend yes. A fresh start would wipe streaks
   players earned.*
6. **`?mode=landmarks`.** Alias it to the merged Survival? *Recommend
   yes, so old shared links still land in a run.*
7. **The Passport tabs.** Leave Places, Countries and Landmarks as they
   are? *Recommend yes. If you want the merge anyway: Cities and
   Landmarks chips, no All, areas inside Landmarks.*
8. **A combined completion number** (only if you overrule 7 and want
   an All view). This changes the city-totals ruling. *Recommend no.*
9. **The Daily.** Keep it cities-only? *Recommend yes.*
10. **Order against the pack.** Ship the Survival merge with, or after,
    the Daily postcard pack, so landmarks keep a daily surface?
    *Recommend shipping them together in one batch.*
11. **PvP.** Keep Challenge's catalog cities-only, and do not open the
    server scoring change? *Recommend yes. If you choose literal Full,
    this answer must be no and the Worker change is part of that scope.*
12. **Areas in the approved pack.** Keep its settled 805 + 332 pool, or
    expand it to the current 1,146 Survival/Passport pool? *Recommend
    keeping 1,137 for this decision; revisit areas only from pack play
    evidence, not as collateral work from Survival unification.*
