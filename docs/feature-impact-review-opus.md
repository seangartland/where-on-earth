# Where on Earth: feature impact review

Date: 2026-10-13 - Author: Claude Opus 5.5 (model ID `claude-opus-5-5`), reviewing directly in this run, no delegation. This replaces an earlier draft in this file.

Method: I read `future-features.md` (2026-10-08), `docs/pvp-mode-plan-sol.md`, the earlier draft of this file, `docs/daily-mechanism-rec-opus.md` and `../docs/daily-archive-design.md`. I checked a few facts in the code and data myself:
- Measured: `assets/locations.json` has 805 entries. `assets/locations-landmarks-sol.json` has 909, every one with an `image` field. Whether those images have passed the same audit as the city images is something I did not check.
- Measured: `assets/daily-pins.json` holds 4 dates (2026-10-12 to 2026-10-15). `scripts/pin-daily.mjs` only pins the in-play window around each deploy (`windowDates`).
- Read: Collections is hidden with `hidden` attributes (`main.js:7083`, `main.js:7098`). Its screen, sort and state code are all still there. Expeditions (`assets/expeditions.json`, `expeditionRun`) are a working themed-run mode that does not depend on Endless.
- Unresolved: in this checkout, `showRound()` shows only the text clue, and the photo is set during the reveal (`main.js:4652`). The PvP plan records Sean saying the live game shows the photo before the guess. I could not reconcile the two from here, so anything that depends on photo timing is marked as such.

Every effort figure below is my estimate. None of it was built or timed.

## 1. Verdict

**Top pick: #7, the Collections rethink, designed as the connection between the Passport and the archive subscription.**

The one thing missing from the current plans is a reason for a free player to want the archive. Sean's paid hook is "play past days' games." On its own that sells only to people who want more puzzles. A collection that shows "you are missing 4 postcards in Japan, and 2 of them were in past dailies" makes the archive solve a problem the player can see. Of everything on the list, only Collections can create that pull.

- **Daily retention: strong.** With 805 cities and 5 per day, the Daily alone would take about 161 days to show each city once. A collection that spans that pool gives players a long goal that renews every day, which is what a pre-scale daily game needs most. Streaks reward showing up. Collections reward showing up and also give each round a stake beyond its score.
- **Subscription conversion: the strongest on the list.** Collections turns archive replay from "more puzzles" into "finish what you started." It also fits the other two drivers Sean identified. Practice depth (Survival and Expeditions) becomes a free way to fill collections, so the paywall is a shortcut, not a lock. That keeps the free game honest and the upgrade reason clear.
- **Acquisition and sharing: moderate.** A finished-collection card is shareable, but it is not the main acquisition item. That job now belongs to PvP challenge links, which are already in flight. Collections does not need to drive acquisition because PvP covers it.
- **Effort (estimate): small to medium build after a real design pass.** Rendering, sorting and state already exist behind two `hidden` attributes. Most of the cost is design work that needs Sean's taste: what a collection is now (country, region including the shipped US display regions, theme), what counts toward it (Daily and Survival earn postcards; PvP records visits only, per the 2026-10-13 decision), and how missing items point to archive days. I can't tell from here why the old version felt wrong, so this plan assumes the rethink starts from Sean's own notes, not from the hidden code.

**Runner-up: #1, Landmarks, re-scoped as the first practice pack and not as an Endless mode.**

The data changed a lot since the list was written. The landmark pool is not the 143 entries the doc counted. It is 909 entries in a separate file, outside active play. That is more than the whole active city set, and it is the most recognizable content the game owns. It goes directly at "practice depth," one of Sean's three subscription drivers and something MapTap charges for. With Endless disabled, its home should be Expeditions (themed landmark runs such as castles, ruins and sacred sites) and possibly a landmark Survival variant. It must stay out of the Daily and PvP. Both already exclude landmarks, and changing that would re-deal future dailies.

- Effort (estimate): medium. It is not the "small filter swap" the doc described. It needs loading a second dataset on demand, a clue pass (some names give away the country), a check that the 909 images meet the city image bar, and a rule for whether landmarks earn postcards and count toward Collections. That last rule is a reason to do Collections first.
- It ranks below Collections because it adds content without adding a reason to come back. Without a collection or progress layer, a landmark pack is a one-weekend novelty.

## 2. How today's state changes the original ranking

- **#5 Country-survival: done.** It shipped as Survival: Tap the Country. Remove it from the list.
- **#4 Country borders layer: done in the form that mattered.** The one-border-at-a-time outlines cover the reveal-readability case and the Tap the Country prerequisite. An always-on layer has no remaining dependents, and the doc itself warned that it makes the game easier.
- **#7 Collections: moves from blocked to first.** Sean's revisit condition (the expanded list) is met. The archive subscription is now a concrete plan, and Collections is the item on the list that does the most to make that plan sell.
- **#1 Landmarks: moves down from "cheapest win" to runner-up, with a different scope.** It is bigger in content (909, not 143), more expensive (separate file, image and clue checks, Passport rules), and it loses Endless. It also gains a better reason to exist: it is the obvious seed for a practice library.
- **#2 Photo-first: moves down, and its premise needs checking.** The doc assumed the photo only appears after the reveal. Sean says the live game shows it before the guess. If he is right, "Photo-first" now means a nameless variant: guess from the photo alone. That only works on distinctive images, and with the active pool cities-only, the doc's own caution applies (city photos are often generic skylines). Its natural home is a later variant of the landmark pack, after a guessability audit. It is not a standalone next feature.
- **#6 Country Blackout: stays mid-pack.** Its prerequisites shipped, so it is cheaper than when Sean proposed it. But it upgrades a secondary mode, and its share image only reaches people who already play Tap the Country. Per-country masking of the satellite texture on the globe is real shader or overlay work. My estimate is medium, not small. It is a good polish item, not the next highest-impact item.
- **#3 Nature mode: moves down.** Endless is off, the pool is small (about 117 in the old count, and I don't know how many survive in the cities-only split), and it still needs extent-aware scoring for lakes and islands.
- **Themed Endless from `sets`: blocked.** It is built entirely on Endless, which is off. Its useful idea (themed pickers) already exists as Expeditions.
- **PvP: not ranked.** It is decided and in flight. It matters to this review in two ways. It now carries acquisition, which frees the rest of the roadmap to focus on retention and conversion. And it competes for Sean's bandwidth, which is why the sequence below is short.

One prerequisite that is not on the list but matters for the subscription: **the archive record has a gap risk.** `pin-daily.mjs` pins only dates in play when a deploy happens. Any day between two batched deploys is not pinned, and if the next deploy changes the pool, those past days would re-deal. The archive would then show games nobody was served. The fix looks small: on each deploy, backfill every date since the last pin from the live pool, which has not changed since that deploy. My estimate is about an hour plus a test. It should land before the next pool-changing deploy, because each unpinned day permanently weakens the product Sean plans to charge for.

## 3. New idea

None. I looked for something that beats Collections on combined impact and did not find one. Weak-spots practice and better zoom are already on Sean's list of drivers, taken from MapTap, so they are not my ideas. The pin backfill above is a fix, not a feature. I am not adding an idea just to fill this section.

## 4. Sequenced top 3

This assumes PvP's tech spec and MVP take most of Sean's build time for the next few weeks. The sequence is designed to fit around PvP, not compete with it.

0. **Pin backfill (before the next pool-changing deploy).** About an hour (estimate). It protects the archive's future value at almost no cost.
1. **Collections rethink.** Design now, while PvP is in spec. That uses Sean's judgment, not build hours. Build after the PvP MVP. Ship it free, filled by the Daily and Survival, with a "seen in the 2026-10-xx daily" marker on missing items that the archive can later turn into a replay button. Estimate: a short design pass, then a small-to-medium build on the existing code.
2. **Landmark practice pack via Expeditions.** It comes after Collections, so the rule for how landmarks count toward collections and postcards is already decided. Start with 3 to 5 themed expeditions from the 909 pool, after a clue pass and image check. A ladder lane can run that data work in parallel with step 1. Estimate: medium, with the data audit as the long pole.
3. **Daily archive replay plus subscription (Sean's plan, not a list item).** It goes third on purpose. Pins started 2026-10-12, so the archive will hold only about 90 days of history by mid-January 2027. Shipping it before then sells a thin library. By then Collections gives players a reason to want it, and the landmark pack gives the subscription a second item to bundle.

From the list itself, the top 3 are Collections, Landmarks (as practice), then Country Blackout as the next polish slot once the archive ships.

## 5. Cut or shelve

- **Cut: Themed Endless from `sets`.** It depends on a disabled mode, and Expeditions already do the job.
- **Cut: Country borders as an always-on layer.** The shipped outlines cover the need, and an always-on layer makes the game easier.
- **Shelve: Nature mode.** It needs the most scoring work for the smallest pool, and its main home (Endless) is off. Revisit only if Endless returns or a nature expedition proves there is demand.
- **Shelve: Photo-first as a standalone mode.** First confirm what the live game shows before the guess. If it is still wanted, fold it into the landmark pack as a later nameless variant, after a guessability audit.
- **Keep but defer: Country Blackout.** It is a good idea with a good share image, but it is aimed at a secondary mode. Do it after the subscription exists.

## Addendum (2026-10-13): the Passport counterpoint and why Collections was hidden

Author: Claude Opus 5.5, in this run. Method: I took Sean's two facts as given and measured the set tags myself in `assets/locations.json` and `assets/locations-landmarks-sol.json`. The Collections screen builds its sets from the `sets` field on active locations (`buildCollectionSets`, `main.js:8226`).

What I measured:
- Only 144 of the 805 active cities carry any set tag. 25 of the 36 sets have any active member, and most have between 1 and 9. The largest is Capital Cities with 18. Lakes, African Safari and Southeast Asia have 1 each.
- 11 sets have no active members at all. Wonders of the World, Antarctic Outposts, Andes, Volcanoes, Sacred Sites, Waterfalls, Fjords & Glaciers, Canyons & Gorges, Mountains, Pacific Islands and Castles exist only in the landmark file. That file's 143 tagged entries are where the sets are deepest (History Was Here 32, Antarctic Outposts 13, Andes 10).

**Verdict: I concede the pick. Collections does not rank first.**

My argument rested on "you are missing 4 postcards in Japan." Sean is right that the Passport Countries tab already does this. The only new part was the link to past dailies, and that is a marker on the existing country detail, not a feature of its own. Fact 2 removes what was left. With the active pool cities-only, the sets are thin, and the best ones point at content nobody can play. My retention claim also fails on these numbers: with 5 Daily cities a day from 805, a 6-city set takes about 161 days to be dealt in full. That is not a daily goal.

**What survives of Collections:** themed sets as the progress layer of the landmark pack. Wonders of the World, Ancient Ruins, Antarctic Outposts, History Was Here and Volcanoes are good collections, but each one needs landmark content in play. They should ship with that content, as each themed expedition's completion tracker, and never before it. The Collections screen and its code can be reused for this, but it should stay hidden as a standalone home screen.

**Revised top pick: the Landmark practice pack via Expeditions, with its themed collections built in.**
- Subscription conversion: the strongest. Practice depth is one of Sean's three paid drivers. 909 photographed landmarks are the most recognizable content the game owns, and they are not in the Daily or PvP. That makes them a clean thing to sell.
- Retention: moderate to strong. My earlier objection was that a pack without a progress layer is a one-weekend novelty. Pack-scoped collections solve that, and they are small enough to finish (5 to 32 items), unlike the city sets.
- Acquisition: moderate. A landmark photo is a better share image than a city skyline, but PvP challenge links still carry acquisition.
- Effort (estimate, not measured): medium. Same long pole as before: a clue pass, image checks on the 909, and Sean deciding whether landmarks earn Passport postcards. That decision now belongs to this item and no longer blocks Collections.

**Revised sequence:**
0. Pin backfill before the next pool-changing deploy. Unchanged.
1. Landmark practice pack via Expeditions, with collections such as Wonders of the World, Ancient Ruins and Antarctic Outposts as each pack's progress. A ladder lane can start the data audit while PvP is in spec.
2. Daily archive replay and subscription, with a small "dealt on 2026-10-xx" marker on missing cities in the Passport country detail that links to the archive day. This is the part of my Collections idea that still holds, and it goes on the Passport.
3. Country Blackout. Unchanged: good polish with a good share image, after the subscription exists.

Collections as a standalone screen moves to "keep hidden." Bring it back only if a cities-only theme set proves worth having on its own, and none of the current 25 does.
