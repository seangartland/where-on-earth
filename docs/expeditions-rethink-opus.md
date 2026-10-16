# Expeditions rethink: Other hub, weekly expeditions, passport swipe

Date: 2026-10-15. Author: Claude Opus 5.5, writing directly (design only, no code or data changed, nothing deployed).

## Method

Every number in this doc carries a label. **Measured** means I computed it from the repo at commit f05b5fa with a script or a grep. **Estimated** means a judgment or a forecast, including all effort figures. **Judgment** marks design calls.

Files read: `future-features.md` (all, with items 1, 3 and 8 closely), `docs/landmark-slice-a-report.md`, `src/modes/expeditions.js`, `src/meta/passport.js` (`passportSlot`, `renderPassportDex`, `renderCountryDetail`, `renderLandmarkShelf`, `fillPostcard`, `openPostcard`, `closePostcard`, the `.ppd` styles), `src/modes/daily-game.js` (the postcard haul cards), `src/modes/survival.js` and `src/modes/endless.js` (pick logic), `src/daily.js` (`isPlayableLocation`, `isLaunchExcluded`, `isLandmark`), `src/core/format.js` (`localDateKey`), `src/core/state.js`, `src/styles/game.css` (`.mode-buttons`, global `touch-action`), `index.html` (home buttons and Survival hub markup), `assets/locations.json`, `assets/locations-landmarks-sol.json`, `assets/expeditions.json`, `assets/trivia-bank.json`, and the git history of the landmarks file (every commit that added entries to it).

"Playable" below means the game's own `isPlayableLocation()` test: a real image (not Wikimedia's No_image_available graphic) and not Antarctic.

## Fact check of the brief

| Brief claim | Result |
|---|---|
| 805 cities in `locations.json` | Confirmed (measured). |
| 916 entries in the landmarks file | Confirmed (measured). |
| Landmarks load into `state.landmarks`, never `state.locations` | Confirmed (measured: the only readers of `state.landmarks` are `passport-store.js` `findLocation()` and `expeditions.js`). |
| Daily, Survival, PvP, Country Blackout draw from cities only | Confirmed. Tap the Country and Blackout play countries, not places; they read `host.locations` only to build country data. PvP's server owns its own location list. |
| 4 expeditions, 7 stops each, 28 stops, 11 cities, 17 landmarks | Confirmed (measured): Volcano Week 7 landmarks, Capital Cities 7 cities, Ancient Wonders 7 landmarks, Island Hopping 3 landmarks and 4 cities. No stop repeats. |
| 143 landmarks carry `sets`, 32 set names | 150 today (measured). The 7 entries authored in Slice A all carry sets, so 143 is the pre-Slice-A figure. 32 set names in the landmarks file is correct; the cities file adds 4 more (36 across both, measured). |
| "The other 899 landmarks can be seen in no mode" | The arithmetic is right (916 minus 17) but the premise is not. See below. |

### The 899 figure is not 899 landmarks

The landmarks file is the preserved bucket for everything removed from the city list, not a landmark list. I replayed its git history and attributed each current entry to the commit that added it (measured):

| Origin | Entries | Playable | Carry sets | What they are |
|---|---|---|---|---|
| Non-city removals (f496ba0 "Remove 290 non-city locations", the later "Remove N landmarks" commits, Slice A's 7) | 380 | 320 | 123 | Landmarks, natural sites, a few stray cities (Lima, Gold Coast) |
| Settlement removals (1074646 "Country trim", 434; 5e2ba15 "Remove 31 hamlets"; Rankin Inlet) | 466 | 295 | 7 | Ordinary cities, suburbs and hamlets cut on purpose (Guarulhos, Coquitlam, Huainan, Qaanaaq) |
| Mixed (Sean flag batches, proximity duplicates, old towns) | 70 | 63 | 20 | By my hand read about 46 landmarks (Sagrada Familia, Uluru, Gullfoss, eight Old Towns) and about 24 settlements (Atafu, Soweto, Pietermaritzburg) (estimated) |

Consequences, all measured unless marked:

- **Only about 426 entries are landmark content** (380 plus about 46, estimated), and **about 360 of those are playable** (320 plus about 40, estimated). The other 466 are cities that the country trim and hamlet cuts removed for being redundant or too small. Putting them into a "Landmarks" mode would bring back exactly what those cuts took out.
- **Every one of the 916 entries has `category: "city"`.** `isLandmark()` keys off `category`, so the code cannot tell a landmark from a cut suburb, and if anything ever merges this file into `state.locations`, the Daily's landmark filter will let all 916 through. Any Landmarks mode needs a real classification field first.
- **886 of 916 entries carry the old difficulty formula** (`F·A·K·C·S` in `difficultyWhy`); only 30 carry the v2 formula (`p·fb·K·iso`) that all 805 cities use. Landmark difficulty is not comparable with city difficulty and should not drive a difficulty mix until it is re-rated with v2. The v2 scorer exists and Slice A ran it on 7 entries (`docs/landmark-slice-a-data/rated-v2-landmarks.json`).
- **289 entries lack `continent`**, including 234 of the 320 playable non-city entries. `fillPostcard()` prints "Postcard from {continent}" and falls back to "Postcard from Earth", so most landmark postcards would read "from Earth" today.
- **238 entries are unplayable**: 219 carry the No_image_available graphic, 19 are Antarctic (overlap of 1). 60 of the unplayable are non-city.
- **66 entries share a photo with another entry** beyond the No_image placeholder (one Mexico City aerial is used by 8 districts). Almost all are in the settlement bucket.

This changes the scale of Proposal 2 and the route count in Proposal 3, and it means a data pass is a prerequisite for both.

---

## Proposal 1: Passport swipe navigation

### Verdict
Yes. Small, self-contained, and the dex is exactly the kind of list people flip through. Ship it first.

### Design
**Which lists.** Swipe moves through the list the card was opened from, in the order the player currently sees it, skipping anything hidden by filters and skipping mystery slots (mysteries are not openable today: `passportSlot()` returns a cloned template with no click handler, measured). That gives four sources, all of which already call `openPostcard(entry, source)`:

1. Places dex (`renderPassportDex`): the visible, filtered, sorted order. In Atlas sort the order crosses continent groups, which is fine; skip collapsed groups.
2. Country detail (`renderCountryDetail`): that country's visited entries only.
3. Landmarks shelf (`renderLandmarkShelf`): visited landmarks.
4. The end-of-run postcard haul (`daily-game.js` line 133): the cards just earned. Cheap to include and a natural place to flip (judgment).

Collections also calls `openPostcard` but is hidden; a generic implementation covers it for free.

**Shape.** Change `openPostcard(entry, source)` to `openPostcard(entry, source, siblings)`, where `siblings` is a function returning the current ordered `[{ entry, el }]` for that list (a function, so filters applied while the card is open are respected). Each renderer already holds this list (`ppDexLis`, the country `entries`, the shelf `entries`). On a swipe: call the existing `fillPostcard(next.entry)`, set `ppdSource = next.el` so the FLIP close animation returns to the right tile, and `scrollIntoView({ block: 'nearest' })` that tile behind the scrim so the close lands on screen. `postcardFlipFrame()` already returns null for off-screen tiles and falls back to the fade, so nothing breaks if the scroll fails. Card change animation: a 180 ms horizontal slide and fade on `.ppd-card`, none under reduced motion.

**Gestures and conflicts.**
- `html, body` set `touch-action: none` globally (measured, `game.css` line 7). The `.ppd` overlay scrolls because a scroll container resets touch behaviour. Put `touch-action: pan-y` on `.ppd-card` so the browser keeps vertical scrolling and hands horizontal movement to JS through pointer events.
- Recognise a swipe on `pointerup` only when horizontal travel is at least 48 px, horizontal travel is at least 1.5 times vertical travel, and the gesture lasted under 600 ms. Anything else is a tap or a scroll. These thresholds are estimates to tune on the phone.
- Ignore gestures that start on the close button, the share button, or the audit flag button, and ignore starts within 20 px of either screen edge, which avoids iOS's edge back-swipe.
- The globe canvas is behind the overlay and the overlay has `pointer-events: auto`, so the globe never sees the drag. Scrim tap-to-close keeps working for taps; after a recognised swipe, set a flag that swallows the click the browser fires next, so a swipe that ends over the scrim never closes the card.
- Keyboard: Left and Right arrows do the same while the card is open (desktop and accessibility).
- At the ends: a short rubber-band nudge, no wrap-around (judgment: wrapping hides where the list ends).

**Discoverability.** A small "12 of 41" line under the card, plus low-contrast chevrons at the card's left and right edges that are also tap targets. Without a visible cue most players never discover a swipe (judgment).

### Effort (estimated)
About half a day to one day for a mid-tier builder: roughly 80 to 150 lines in `passport.js` plus a few in `daily-game.js`, then a 390 px phone-width verification in the pp-shot harness (swipe in each of the four lists, filter change while open, close lands on the right tile).

### Risks
- iOS Safari treats `pan-y` inside a nested scroller inconsistently in some versions; the verification must include a real device check by Sean, not only headless Chromium.
- A sideways-ish vertical scroll could flip a card by accident. The 1.5 ratio guards this; tune if it misfires.
- Re-rendering the dex while the card is open (sort change) invalidates element references; the `siblings` function design handles this, a captured array would not.

### Open questions
- Should the haul screen swipe too? (Recommended yes.)
- Chevrons visible always, or only on first open with a one-time hint? (Recommended always, low contrast.)

---

## Proposal 2: an "Other" home button and a Landmarks mode

### Verdict
Yes to the hub, yes to a Landmarks mode, but on about 360 curated landmarks, not 899, and only after a data pass. Push back on the label: "Other" reads as a junk drawer on a home screen. Recommend "More modes" with the descriptor "Landmarks and more" (judgment).

### The hub
Built on the Survival hub precedent exactly: a `section.expedition-picker` with the shared `.expedition-panel`, home button, heading, one-line description, and `.expedition-choice` rows with a `data-hub-best` line (all present in `index.html` today, measured). No new components.

**v1 ships:**
1. **Landmarks** (playable).
2. **Guess the photo**, a disabled row reading "Coming soon". There is no true precedent for a stub: the Survival hub's Blackout row is disabled only until the country data loads (`tap-country.js` line 55, measured), so this is a new use of the same disabled `.expedition-choice` styling. One stub row is enough; a hub of stubs looks unfinished (judgment).

**Later rows:** Guess the photo (photo-first), Trivia clues, Nature (future-features item 3, after extent-aware scoring from item 8). The trivia bank already exists and nothing loads it: `assets/trivia-bank.json` holds 1,303 riddle-style clues (measured), 183 of which cover playable non-settlement landmarks (measured). That makes Trivia clues the cheapest second mode, cheaper than photo-first, whose cost is a per-photo guessability review.

### Home layout
`.mode-buttons` is a two-column grid (measured, `game.css` line 378). Today the visible buttons are Daily (full top row), Survival and Expeditions (row 2), and Challenge alone in row 3 at half width (Endless is hidden; measured from `index.html` and the Slice A addendum). Adding a fifth button puts More modes beside Challenge and **fills the current orphan slot**, so the fifth button improves the layout rather than crowding it. Moving Expeditions into the hub would recreate the orphan (Survival and Challenge in row 2, More modes alone in row 3).

**Expeditions stays top-level.** It is a hand-built progression mode, and if Proposal 3 ships it becomes a daily-return mode, which is the last thing to bury one tap deeper (judgment).

### How Landmarks mode plays
**Rules: Classic Survival on the landmark pool.** One miss over 150 km ends the run; each round draws a random difficulty band (`survivalPick()` in `survival.js`, measured). Reasons (judgment): the run structure, best-score line, results screen and share text all exist; a landmark is a single point so the 150 km rule stays fair (future-features item 1 made the same point); and Survival's short failing runs suit a pool where some entries are hard. The implementation is a pool parameter on the existing Survival code plus its own best-score key, not a new mode module.

Alternative considered: an Endless-style untimed tour. Rejected for v1 because Survival has the results screen, best score and share text a new mode needs, and Endless has none of them (it is unscored, per `endless.js`) and is itself hidden on the home screen today (measured).

**Pool:** the curated landmark set only. Exclude the 466 settlement-origin entries, the about 24 settlements in the mixed bucket, stray cities in the non-city bucket, unplayable entries, Antarctic entries, and the 9 entries with `extentKm` (area features score unfairly from a centre pin until future-features item 8 lands).

**Difficulty mix:** after the v2 re-rate, use Survival's uniform band draw but cap bands 9 and 10 at a lower weight early in a run (for example bands 9 and 10 only after 5 survived). Reason: the old-formula figures put 536 of 916 entries at 7 or harder (measured), and if the re-rate confirms that skew, a uniform draw ends most runs on an obscure site by round three (estimated). Decide the ramp after the re-rate, not before.

**Postcards:** earned with the existing 150 km rule. They land on the Passport's Landmarks tab, which must switch its source from `expeditionLandmarks()` (the 17 stops) to the full curated list. The summary line becomes "X of ~360 landmark postcards". Landmarks keep staying out of city, country and continent totals, as Slice A designed. Mystery slots for 360 entries are cheap; the Places dex already renders 805.

### Data prerequisites (this is where the cost is)
1. A classification field on every landmarks-file entry (for example `kind: landmark | settlement`), set by a free-model lane and spot-checked by a frontier model, per the review-before-scale rule.
2. v2 difficulty re-rate of the about 426 landmark entries with the existing scorer.
3. Continent backfill for the 234 playable non-city entries missing it.
4. Image backfill for the 60 unplayable non-city entries (optional; the pool is viable without them).

### Effort (estimated)
- Data pass: one to two days of ladder data lanes plus a frontier review of a pilot.
- Code: about one day (hub markup and wiring copied from the Survival hub, Survival pool parameter and best key, shelf source swap, share text, home button), plus 390 px verification.

### Risks
- Shipping before the classification exists would leak cut suburbs into a mode called Landmarks. The data pass is a hard gate.
- Landmark clues follow the city format "Name, Country flag" (906 of 916 include the country, measured). That gives away the country, as it does for cities; acceptable for v1, and moot for photo-first, which hides the clue.
- A second Survival variant risks blurring with the Survival hub. The hub row copy should say what differs ("Famous places, one miss ends the run").

### Open questions
- Hub label: "More modes" or Sean's "Other"?
- Should Landmarks be Survival rules (recommended) or a fixed 10-round scored tour?
- Include the 9 area features once item 8 ships, or keep them for a Nature mode?

---

## Proposal 3: Weekly Expeditions

### Verdict
Yes to a weekly expedition with one stop unlocking per day. Push back on two parts: the free missed-day rule as implied (a lost day is lost forever) and on building a paid tier for this feature. There is no account, payment or entitlement code anywhere in the repo (measured: no match for subscription, premium, paywall, stripe or checkout), and all expedition progress lives in localStorage (`where-on-earth-expedition-v1`). A paid gate checked on the client is trivially bypassed, so "paid replay" first needs accounts and server-side entitlements, which is a project far larger than the weekly mode itself.

### Design
**Week and day boundary.** Reuse `localDateKey()` (local midnight, the same boundary as the Daily, measured in `format.js`). The week runs Monday to Sunday by local date. Week number = whole weeks since a fixed launch Monday; the expedition shown = `pool[weekNumber % pool.length]`, computed on the client exactly as the Daily computes its day number, so no server is needed. Stop N (1 to 7) unlocks on day N of the week. Players who change their device clock can unlock early; the Daily already has the same exposure, so no new risk.

**The free player's missed day: catch-up Sunday.** A stop is playable on its own day. On Sunday, every stop missed earlier in the week opens as well. A free player who misses Tuesday can still finish 7 of 7, but only by coming back on Sunday, which keeps the daily pull and turns Sunday into a second hook (judgment). Stops missed and not caught up by Sunday close with the week.

**Outcome at week's end.**
- 7 of 7: the week's badge, like today's 🏅.
- 4 to 6: a lesser "partial" stamp on the picker card. Every postcard earned on a played stop is kept regardless.
- Fewer than 4: no stamp; postcards kept.

Losing earned postcards over a missed day would feel like a penalty for having a life; losing the badge is enough stake (judgment).

**Paid tier, if and when accounts exist:** catch up any missed stop on any day of that week (not only Sunday), and replay past weeks from an archive. Free players never lose access to the current week's content, which keeps the Weekly from feeling like a paywall (judgment).

**Placement.** The Expeditions picker gets a "This week" card at the top (theme, 7 stop dots showing played, open, locked, missed) above the classic expeditions. The Daily results screen gains a one-line link "Today's expedition stop is open", so the Weekly stacks onto the existing daily habit instead of competing with it (judgment). The home button descriptor changes from "Themed journeys" to "New stop daily" while a stop is open.

**The 4 current expeditions** stay always open as "Classic expeditions" under the weekly card. They are the onboarding to the format, their 17 landmark postcards are already on people's shelves, and removing content players have started would cost goodwill for no gain (judgment). They are also excluded from the rotation pool so the Weekly always shows new stops.

**Storage.** A new key (for example `where-on-earth-weekly-v1`) holding `{ week, played: { stopIndex: dateKey } }`. The existing expedition key is untouched.

### How big can the rotation be? (measured, with a defined quality bar)
"Quality" here means a route where every stop is (1) playable, (2) not a settlement-origin entry, (3) not a stop of the current 4 expeditions, (4) on its own unique photo, and the route has (5) at least 4 countries with at most 2 stops per country. Stops may not repeat across routes, so each week is all new postcards.

I packed routes greedily from the `sets` tags across both files, smallest sets first so scarce stops go to their tightest theme. Result (measured): **18 routes** clear that mechanical bar. Only **4 are landmark-majority** (three History Was Here routes and Southeast Asia). The other 14 are city-majority (Megacities, two Capital Cities, Port Cities, Island Nations, Desert Cities, Great Rivers, Wine Country, Mediterranean Islands, Caribbean, Middle East, Arctic Circle, Mining Towns, Himalaya). Sets that fail: Andes and Nordic Coast (too few countries), Pacific Islands, Volcanoes and Wonders of the World (most stops already used by the current expeditions), Ancient Ruins and Colonial Towns (shared photos), and every set under 7 entries.

Two further concerns the mechanical bar does not catch (judgment):
- City-majority routes replay places the Daily and Survival already serve, so their postcards are often already owned. The weekly is most valuable when it is landmark-heavy.
- My packer did not optimise difficulty spread. A taste pass would likely drop or rebuild about a third of the 18 (estimated), leaving about 12 good routes.

**"A few dozen" weeks needs authoring.** 264 playable non-settlement landmark entries carry no `sets` tag and are in no expedition (measured). That is enough raw material for about 25 more landmark-led routes (estimated, at 7 stops each with some loss to quality), which would bring the pool to about 36, or about 8 months before the first repeat (estimated). The authoring is judgment work: a frontier model proposes themed routes over the classified data, Sean approves the list.

### Relationship to Slice B
Slice B planned a clue and image pass plus new expeditions from the sets. Weekly Expeditions absorbs the second half: the new expeditions become the weekly rotation pool instead of more always-open entries. The first half folds into the Proposal 2 data pass, which needs the same classification, re-rate, continent and image work. The clue pass matters less than planned: clues follow the same "Name, Country" format as cities, so the leak is the format, not individual entries. **Recommendation: retire Slice B as a standalone slice** and split it into "landmark data pass" and "weekly route authoring".

### Effort (estimated)
- Code, free tier: two to three days (week math, unlock and catch-up rules, picker card with stop dots, Daily results link, badge and partial stamp, share text, storage), plus verification that fakes dates across a week boundary.
- Content: one to two days for route authoring and review, after the data pass.
- Paid tier: not estimated; it depends on an account and payment system that does not exist.

### Risks
- One stop a day is a 30-second session. If it feels thin next to the Daily's 5 places, consider 2 stops a day over a 4-day expedition instead (judgment, worth a playtest).
- Players in time zones far apart see different days at the same moment, as with the Daily. Fine unless a shared leaderboard is added.
- Rotation math tied to a launch Monday must be frozen once shipped, the same rule as the Daily bands (future-features item 1: changing the bands reshuffles every future Daily).

### Open questions
- Monday or Sunday week start?
- Catch-up Sunday (recommended) versus strict day-locking versus a rolling open window?
- Build accounts and payments at all, and for what bundle beyond this feature?

---

## (a) Recommended sequence

1. **Passport swipe.** Independent of everything else and small. Can start now.
2. **Landmark data pass** (replaces Slice B's clue and image half): classification field, v2 re-rate, continent backfill, optional image backfill. Free-model lanes, frontier review of a pilot before scale.
3. **More modes hub v1 with Landmarks** (Survival rules) and the Landmarks shelf switched to the curated list. Depends on step 2.
4. **Weekly route authoring** (replaces Slice B's new-expeditions half): about 36 routes, frontier-proposed, Sean-approved. Depends on step 2; can overlap with step 3.
5. **Weekly Expeditions, free tier**, with catch-up Sunday and the 4 classics kept.
6. **Trivia clues** as the second hub mode (the bank exists), then **Guess the photo** after a photo guessability review.
7. **Paid tier** only after a separate decision on accounts and payments.

## (b) Decisions for Sean

1. **Should Landmarks mode use the about 360 curated landmarks rather than all 899 unseen entries?** Recommended: yes. 466 of the 916 are cities and hamlets that the country trim and hamlet cuts removed on purpose.
2. **Approve a landmark data pass (classification field, v2 re-rate, continent backfill) as the gate for Proposals 2 and 3?** Recommended: yes. Every entry says `category: city`, 886 use the old difficulty formula, and 234 playable landmarks would read "Postcard from Earth".
3. **Hub label: "Other" or "More modes"?** Recommended: "More modes". "Other" reads as leftovers on the home screen.
4. **Does Expeditions stay top-level?** Recommended: yes. Moving it recreates the orphan half-width button, and the Weekly makes it a daily-return mode.
5. **Landmarks mode rules?** Recommended: Classic Survival on the landmark pool. All the run, results and share code exists, and point landmarks keep the 150 km rule fair.
6. **Second hub mode: Trivia clues or Guess the photo?** Recommended: Trivia clues. 1,303 clues are already written and unused; photo-first needs a per-photo review first.
7. **Free missed-day rule for the Weekly?** Recommended: catch-up Sunday. It keeps the daily pull without making a missed day permanent.
8. **What happens to earned postcards on an incomplete week?** Recommended: always kept; only the badge depends on 7 of 7.
9. **Keep the 4 current expeditions always open?** Recommended: yes, as "Classic expeditions" outside the rotation. Players have progress in them and they teach the format.
10. **Build a paid tier now?** Recommended: no. There is no account or payment code, and a localStorage check is trivially bypassed; ship the free Weekly first and decide on accounts separately.
11. **If a paid tier is built later, what does it unlock?** Recommended: any-day catch-up within the week plus the archive of past weeks. The current week stays fully finishable for free.
12. **Rotation size before launch?** Recommended: about 36 routes (about 8 months). The sets alone support 18 mechanically and about 12 after taste, so authoring is needed.
13. **Retire Slice B as a standalone slice?** Recommended: yes. Its two halves become the landmark data pass and weekly route authoring.
14. **Swipe scope?** Recommended: Places dex, country detail, Landmarks shelf and the end-of-run haul, with visible chevrons and a "12 of 41" counter. Those are every list that opens a postcard today.
