# Daily postcard pack: spec, homepage placement and cleanup review

Date: 2026-10-18. Author: Claude Opus 5.5, from Sean's settled design
(future-features item 11) and the brief `BRIEF-pack-spec.md`. Spec
only: no source files changed.

**How this was done.** I read the code on this branch, which contains
current main (7842fda). I measured the home screen with headless
Chromium against this clone at 390x844 and 390x664. The script is
`~/workspace/map-game/shots/passport/pack-home-shot.mjs`; it reads
element positions and `elementFromPoint`, and opens each hub. I
counted the pools with node, using the game's own `isPlayableLocation`
and Landmarks pool rule. Repeat rates in 1c are **modelled, not
measured**: a uniform draw model, plus a rough Daily overlap
assumption. Everything else is read from code or measured.

---

## 0. At a glance

**Verdict:** worth building, as a light bonus beside the Daily and
not a second headline. Most of the mechanics already exist, so it is
cheap. The black and white card is the Passport's existing "seen"
state. The upgrade to colour is what `recordVisit()` already does in
every earning mode. The new work is one saved key, one round variant,
one pack screen and one home row.

**Where I disagree with the settled points (details in section 1):**

1. **The pool is not 805 + 427.** The landmarks file has 427 entries,
   but only 332 are real playable landmarks (the Landmarks mode pool
   and the Passport's Landmarks shelf). The other 95 are 52 area
   features, 15 settlements and 28 landmarks that fail the playable or
   rating checks. Areas score from a centre pin that ignores their
   extent (item 8), and none of the 95 has a Passport shelf to show
   up on. I recommend **805 cities + 332 landmarks = 1,137**.
2. **"Every card pays out" holds only the first time.** For a player
   who also plays the Daily, about half of their pack cards are places
   they have already visited by month 3 (modelled). An already-colour
   repeat pays nothing new. I am not asking for weighting. I am asking
   for an honest label on repeats, and for three distinct cards within
   one pack (a 0.26% event, so invisible, and not a weighting).
3. **The subscriber perk is thin.** Free players already get unlimited
   random rounds that earn postcards (Classic Survival, Landmark
   Survival). A second pack sells more of something that is free
   elsewhere. It is harmless as a small thank-you, but it should not
   be built or pitched as a reason to subscribe. It also cannot ship
   before the payments addendum's entitlement helper exists.
4. **"PvP format" should mean the PvP look, not the PvP rules.** PvP
   rounds have a 20-second server timer and never earn postcards. The
   pack borrows the clue-only header and the plain score. It keeps the
   normal earning rules (as settled) and has **no timer**.

**Recommendations, one line each:**

- State: one new key `where-on-earth-pack-v1` holding only today's
  pack or packs. It is generated on the first tap and saved before the
  first clue, so a reload cannot reroll it.
- Midnight: the pack belongs to its local date. A round already on
  screen finishes and banks. Unplayed cards from a past date are gone,
  which is what the Daily does today.
- Black and white: no new storage. A miss calls `recordVisit()` as the
  Daily does, and that already writes the grey "seen" card.
- Results: a pack screen with three slots, face down until played.
  The same screen serves before, during and after the pack. **No new
  pack share format.** Each flipped card opens the existing postcard
  detail, which already has its own share.
- Placement: **option P1**, a slim full-width row under the Daily,
  paired with cleanup item C5 so the home screen still fits a 664 px
  tall phone without scrolling.
- Cleanup: seven light trims, listed in section 4. The most concrete
  one is that the home mute button cannot be tapped: it sits exactly
  under the settings gear (measured).

Your decisions are listed at the end (section 6), each with my
recommendation.

---

## 1. Weigh-in

### 1a. Does it earn its place beside the Daily?

Yes, narrowly, and only as a bonus. What it adds that nothing else
does:

- **Landmarks in a daily ritual.** The Daily is cities only. Landmarks
  are reachable today only through Landmark Survival and Expeditions
  stops. The pack is the one daily surface that mixes them in.
- **A small, finite daily reward.** Survival is endless and ends on a
  failure. The pack is three cards, no fail state and always finishes.
  That is the GeoDex ritual borrowed correctly.

What it does not add: a new mechanic. A pack card is a Survival round
with no fail state, under a different label. That is fine, but it
argues for keeping the pack small in every dimension: no streak, no
pack history, no leaderboard and no badge nagging on home.

**Ritual fatigue.** A daily player already has two time-bound habits:
the Daily (5 places) and the Weekly stop inside Expeditions (one stop
per day, measured: "0 of 7 stops", "Missed stops open Sunday"). The
pack would be a third. To keep it from feeling like a chore:

- No pack streak, and the pack never touches the Daily streak.
- The home row is quiet once the pack is done: "✓ Opened", dimmed
  like the Daily's played state. No red dot and no countdown on home.
- Unplayed cards are not carried over. A missed day costs one pack,
  not a backlog to clear. A backlog is what turns a ritual into
  homework.

### 1b. The black and white card versus the Passport's mystery cards

This settled point turns out to be a near no-op, and that is good
news. The Passport already has exactly three card states (measured in
`src/meta/passport.js` and the shared card CSS):

| State | Stored as | Looks like |
|---|---|---|
| Unvisited (mystery) | no `visits[id]` | no photo, faint name, `is-mystery` template |
| Seen | `visits[id]`, `meta.e` absent | photo in grayscale (`filter: grayscale(1)`), grey name, hint "Land within 150 km to earn this postcard in colour." |
| Earned | `meta.e` 1 to 3 | full colour, plus a Bullseye or Pinpoint badge |

"The card in black and white, the visited version" is the **Seen**
state. Every miss over 150 km in the Daily, Survival or Expeditions
already produces it. The reveal sheet already shows a seen photo in
grayscale (`applyThumbState`, round.js). So:

- No new visual state and no new stored field. A pack miss is a normal
  `recordVisit(id, base, km, true)` that lands over 150 km.
- Mystery cards stay distinct: no photo at all, versus a grey photo.
  The pack moves a card from mystery to seen. That is a visible
  payout, not a new rarity tier, so it stays inside the GeoDex
  rejection.
- The one consequence to accept: a pack miss pays out exactly what a
  Daily miss pays out. The pack's "every card pays out" is a framing of
  existing behaviour. I think that is right, because a pack-only grey
  variant would be a second collection system. But the pack should not
  advertise the grey card as something special.

### 1c. What a repeat card does to motivation

Settled: pure RNG, repeats allowed, no weighting. Modelled repeat
rates (uniform draw over 1,137; the "with Daily" line assumes the Daily
shows about 5 new cities a day, which is a rough estimate):

| Days of play | Pack only: chance a card is already visited | Pack + Daily |
|---|---|---|
| 30 | 8% | about 20% |
| 90 | 21% | about 50% |
| 180 | 38% | about 80% |

A repeat is one of three things:

- **A repeat of a grey card** is a second chance to colour it. This is
  the best outcome the pack has, and it is the reason the
  repeats-allowed ruling is fine.
- **A repeat of a colour card below Pinpoint** is a shot at a Bullseye
  or Pinpoint upgrade. That is a real but small payout.
- **A repeat of a Pinpoint card** pays nothing.

The pack does not need weighting. It needs to be **honest on the
reveal**: show "Already in your Passport" on a repeat card, so a dud
reads as a known dud and not a broken promise. Within a single pack,
draw three distinct cards. A duplicate inside one pack has a 0.26%
chance, so excluding it changes no odds anyone could feel, but a
duplicate would read as a bug.

### 1d. The subscriber perk's shape

Settled: one extra pack per day, with the free pack and the Daily
untouched. I agree it must not touch the Daily or the free pack.
Three concerns:

1. **The value is thin** (see disagreement 3). Survival already gives
   unlimited earning rounds for free. The second pack is "more of the
   ritual", which is a fine thank-you but a weak reason to pay.
2. **It cannot be enforced locally, and it does not need to be.** Packs
   are client-side RNG, and Settings, "Reset all data", wipes the
   key. Nothing in a pack is scarce, so a cheat gains nothing. The
   entitlement check is a gate for honest players, not a security
   boundary, and the spec treats it that way.
3. **It is blocked on infrastructure that does not exist yet.**
   `src/account/entitlements.js` is designed in
   `docs/accounts-plan-payments-addendum.md` (section 3c) but not
   built. Accounts Phase 1 is dark behind `?accounts=1`. Pack 2 should
   therefore be the last build step and ship separately.

---

## 2. Mechanics

### 2a. Pool

```
pool = state.locations.filter(isPlayableLocation)   // cities: 805 of 805 today
     + landmarkPool()                               // Landmarks mode pool: 332 of 427 today
```

Use the existing functions and no new list. `landmarkPool()`
(`src/modes/landmarks.js`) already applies `kind === 'landmark'`,
`isPlayableLocation` and the v2 rating check. It is also exactly the
Passport's Landmarks shelf (`landmarkShelf: landmarkPool` in main.js),
so every pack landmark has a place to land. Ids do not overlap between
the two files (measured: 0). The draw is uniform over the combined
list, with no weighting by type or difficulty. That means about 71%
cities and 29% landmarks, purely as a consequence of the pool sizes.

If you overrule disagreement 1 and want all 427 entries, the pool
becomes `state.landmarks.filter(isPlayableLocation)` (394 today). In
that case, 49 areas would score from a centre pin with no extent, and
62 entries would earn cards no shelf can show.

### 2b. Saved state: `where-on-earth-pack-v1`

Add it to `config.js` as `PACK_KEY` and to `VERSIONED_KEYS`, so it
gets the corrupt-backup and empty-write guards. Shape:

```js
{
  _v: 1,
  date: '2026-10-18',          // localDateKey() at generation: the player's device timezone
  packs: [                     // index 0 = free pack, 1 = subscriber pack (only if entitled)
    {
      ids: ['aberdeen-scotland', 'abu-simbel-temples', 'quito-ecuador'],  // 3 distinct ids, fixed at generation
      results: [               // one per card, same order; null until that card is revealed
        { guess: { lat, lng }, distance: 412, distanceExact: 411.7, base: 731,
          postcard: { kind: 'visited' } },      // 'new' | 'upgrade' | 'visited' | 'repeat'
        null,
        null,
      ],
    },
  ],
}
```

- **Only today.** On any read whose `date` is not `localDateKey()`, the
  record is replaced. There is no history, no stats feed and no
  streak. Stats and history stay Daily-only.
- **Generation is lazy.** A pack is generated when the player first
  taps the pack row on a new date, and it is written **before** the
  first clue shows. A reload or a tab kill resumes the same three
  cards and cannot reroll them.
- **`postcard.kind`** is computed at the reveal from the passport
  state before the guess, the same pattern as `postcardRoundOutcome()`
  (round.js). It extends that function's `'miss'` into two cases:
  `'visited'` (first visit, the grey card) and `'repeat'` (already
  visited, nothing new). `'new'` and `'upgrade'` keep their meanings.
  It is stored with the result, so reopening the pack screen tells the
  same story the reveal told.
- **A retired id** (removed from the data after generation) gets a
  fresh draw for that slot if the slot is unplayed. A played slot
  keeps its stored result and shows the card's name only.

### 2c. Daily reset and midnight

The day is `localDateKey()` (device local time), the same as the Daily
(`daily-game.js`) and the Weekly.

| Situation | Behaviour |
|---|---|
| A new date, opened from home | Today's record is replaced; the next tap generates a fresh pack |
| Midnight passes while a card is on screen (guess or reveal) | The round finishes and banks into the record under its own date. Next goes back to the pack screen, which now shows yesterday's pack as finished, with a line "Today's pack is ready" |
| Midnight passes with cards unplayed | Those cards are forfeited the next time the pack is read. This matches the Daily, whose `startGame()` reloads today's game if the saved date is stale. The home row picks up the new pack in `goHome()` → `syncPackButton()` |
| The device clock moves or the player crosses timezones | Whatever `localDateKey()` says wins. A westward flight can give a second pack in one calendar day. Nothing is scarce, so I accept it |

### 2d. Round flow (PvP clue-only presentation)

The pack runs on the shared round screen like Trivia does: a `pack`
state object `{ active, packIndex, card, item }`, plus branches in
`currentItem()`, `showRound()`, `revealGuess()`, `nextRound()`,
`goHome()` and `confirmGoHome()`.

1. **Header:** "Card 1 of 3" in the round-number slot. The weight and
   date slots are hidden, as in PvP (`showRound`'s pvp branch). Pack 2
   shows "Bonus card 1 of 3". The clue is `item.clue` (for example
   "Aberdeen, Scotland" or "Abu Simbel, Egypt 🇪🇬"), the same as every
   mode. No photo before the reveal.
2. **Guess:** the standard pin and Lock in. **No timer.** No server
   round trip: the pack is local, like the Daily.
3. **Reveal:** the standard flyover or north-up reveal and reveal
   sheet. The sheet's photo is the card's photo, and it is already in
   colour or grayscale per `applyThumbState`. The peek pill shows
   `+base` like Trivia and PvP (score out of 1,000, no multiplier).
   Earning: `recordVisit(id, base, kmExact, true)`, the normal rules.
4. **Payout moment:** an earn (new or upgrade) uses the existing
   `showEarnToast`. A first visit that lands over 150 km gets a toast
   variant: grey photo, "Visited · added to your Passport", with a
   small line "Land within 150 km anywhere to colour it". A repeat
   with nothing new gets no toast, and the reveal name carries the
   small line "Already in your Passport".
5. **Next:** "Next card", or "Done" on card 3. Both return to the pack
   screen (2g), never straight home.
6. **Leaving mid-card:** the result saves on reveal, so the home
   button needs no "progress will be lost" warning. It uses the
   Daily's message, "Your progress is saved".

### 2e. Upgrade to colour across modes

There is nothing to build. `meta.e` is per place, not per mode, and
`recordVisit()` is the only writer. The cross-mode rule as it stands
today:

| Mode | Records the visit | Can colour a grey card |
|---|---|---|
| Daily | yes | yes |
| Classic Survival, Landmark Survival | yes | yes |
| Expeditions, Weekly | yes | yes |
| Daily pack | yes | yes |
| Challenge (PvP) | yes | **no** (`canEarn` false: PvP never earns) |
| Endless (quarantined) | yes | no |
| Trivia | no | no |
| Tap the Country, Country Blackout | n/a (countries, not places) | no |

So "earned properly in any mode" means any mode except PvP and
Endless, which is how the game already works. The only pack-specific
read is the reveal's `kind` (2b).

### 2f. Passport and totals

- **Where cards appear:** a city card on the **Cities** tab and a
  landmark card on the **Landmarks** tab, each where it already
  lives. There is no pack tab and no pack filter.
- **Counts toward visited totals:** every pack card, hit or miss. That
  covers the home count "N / 805 places found" (cities only, as
  today), the grey "seen" layer of every progress bar, the country
  cards' "visited" counts and the Landmarks summary "N visited".
- **Never counts toward earned completion:** a grey card. Earned
  counts read `meta.e` everywhere (the passport summary, country
  "collected" and "✓ Complete", the Landmarks postcard count, the
  Passport share's "🛂 Postcards", and Collections while hidden).
  That is already true by construction; the pack adds no exception.

### 2g. The pack screen (results surface) and sharing

One screen, built once in the same style as the Survival hub panel. It
shows three card slots and serves every moment:

| Moment | Slots | Line | Primary button |
|---|---|---|---|
| Fresh | 3 face-down cards (the Passport mystery template) | "Three postcards. Pin each one." | Open card 1 |
| Mid-pack | played slots flipped (colour or grey card, name, km), the rest face-down | "2 of 3 opened" | Open card 3 |
| Done | all flipped, with a tier frame or badge for earns | "2 new postcards · 1 visited" and "Pack score 1,842 / 3,000" | Done (home) |
| Done, entitled to pack 2 | as above, plus a "Bonus pack" slot row, face-down | same | Open bonus pack |

- A flipped slot opens the existing postcard detail through
  `bindPostcard` (passport.js). That detail already has the per-card
  share (`postcardShareText`), so a player who wants to show off a
  card can.
- **No pack-level share format.** A pack's contents are unique per
  player, so a pack score cannot be compared and a share would invite
  a comparison that is not fair. The Daily's share is the growth
  channel, and the per-mode formats stay as they are. If you want one
  later, the honest version is a text-only "3 postcards from today's
  pack" with no score. I would still say no for launch.
- The summary must not reuse `showPostcardSummary()` as it stands: its
  counter (`postcardSummaryCounts`, daily-game.js) only knows `new` and
  `upgrade`, so a grey card would vanish from the lede ("No new
  postcards") and write `NaN` into an unused `visited` count. The pack
  screen is its own small surface, built from the
  shared `buildPostcardCard` (`src/meta/postcard-card.js`), following
  the centralize-shared-UI rule.

### 2h. Subscriber second pack

- **Same rules:** the same pool and draw, three distinct cards, the
  same earning and the same screen. Its draw is independent of pack 1,
  so a card can repeat across the two packs (settled: repeats
  allowed).
- **Gate:** `entitlement('<key>').active` from the planned
  `src/account/entitlements.js`, a synchronous read of the cached
  `where-on-earth-entitlements-v1`. With `ACCOUNTS_ENABLED` off it
  returns inactive without reading anything, so on today's site pack 2
  never appears and no code path depends on the network. The key name
  belongs to the product plan; I suggest `daily_pack_extra`
  (decision 13).
- **When it shows:** only after pack 1 is complete, as a "Bonus pack"
  row on the pack screen. It is generated on its own first tap and
  written into `packs[1]`.
- **Entitlement lapses mid-day:** a pack 2 already generated stays
  playable through its date. Only generating a new pack 2 checks the
  entitlement.
- **Non-subscribers:** no upsell line until payments are live for real.
  After that, at most one quiet line under a finished pack 1 ("Members
  get a bonus pack"), and only if the product plan wants it.
- **Sync:** the pack key is not on the sync allow-list at launch, and
  accounts are dark anyway. When accounts go live, add it with one
  merge rule: same date, take each slot's result from whichever side
  has it; different dates, the newer date wins. Without that rule, a
  player with two devices gets two free packs a day, which matters only
  once pack 2 is a paid perk (decision 12).

---

## 3. Homepage placement

### 3a. Current home screen, as rendered

Measured at 390x844 after load, top to bottom. Positions are in CSS px.

| # | Element | Source | Shows | Measured |
|---|---|---|---|---|
| 1 | Mute toggle | `main.js` `muteButtons`, prepended to `#start-screen` | always | 44x44 at (334, 12), `position: absolute`. **Covered:** `elementFromPoint` there returns the settings gear |
| 2 | Settings gear ⚙️ | `main.js` `.settings-entry` | always | 44x44 at (334, 12), `position: fixed`, z-index 95, the same box as #1 |
| 3 | Title "Where on Earth?" | `index.html` h1 | always | y 112 (returning) or 158 (new) |
| 4 | How-to line | `index.html` `.how-to` | new players only (hidden by `.has-passport`) | "Find five places. Spin the globe…" |
| 5 | Passport summary card | `passport.js` `passportBox`, inserted before the mode grid | returning players | 184 px tall: count line "30 / 805 places found · 15 earned · 🔥 4", 5 recent stamps, 6 continent chips over 2 rows (53 px). **Not tappable** (no listener) |
| 6 | Mode grid row 1: **Daily** | `#play-button`, full width | always | "Daily / 5 places daily", or "✓ See results" once played |
| 7 | (Endless) | `#endless-button` | **hidden** in markup; main.js still toggles its `disabled` | quarantined |
| 8 | Row 2 left: **Survival** | `#survival-hub-button` | always | "Three ways to play" → hub: Classic, Tap the Country, Country Blackout |
| 9 | Row 2 right: **Expeditions** | `#expeditions-button` | shown once data loads (`updateExpeditionEntry`, since 5c3a9d8) | "Themed journeys" → picker: THIS WEEK (Colonial Towns, 0 of 7 stops) + CLASSIC EXPEDITIONS (4 routes). This is the brief's "Weekly/Classics" |
| 10 | Row 3 left: **Challenge** | `#pvp-button` | always | "Play a friend" |
| 11 | Row 3 right: **More modes** | `#more-modes-button` | always | "Landmarks, photo and trivia games" → hub: Landmarks (332), Trivia clues (457), **[disabled] Photo mode, Coming soon** |
| 12 | Streak line | `#start-streak` | new players only (hidden by `.has-passport`; the streak moves into #5) | "🔥 N day streak" |
| 13 | Links row: **Stats** · **Passport** | `.home-links` | always | two 164x44 pills |
| 14 | (Collections) | third `.passport-entry` | **hidden** (Sean, 2026-10-13: wiring kept) | — |
| 15 | HUD "Drag to spin · Pinch to zoom" | `#hud` | always | bottom, y 805 |

Fit: at 390x844 the returning-player layout ends at y 720 (links row
bottom), with about 96 px of slack. **At 390x664 it ends at y 620,
with about 16 px of slack** before the start screen starts to scroll.
That slack decides the placement.

The rulings are respected as of today: the Daily has the full top row,
one Survival button opens its hub, and More modes sits beside
Challenge. Note that the brief's list puts Weekly/Classics after More
modes. On screen, Expeditions sits between Survival and Challenge.

### 3b. Options

**P1. A slim full-width row directly under the Daily (recommended).**
It goes in grid row 2, about 48 px tall, in a quieter style than a
mode button (outline only, gold edge, no fill). The text reads
"Postcard pack · 3 cards today", then "1 of 3 opened", then "✓ Opened
· new pack at midnight" (dimmed like the Daily's played state).
- Pros: second in reading order, right where the daily habit already
  is. It moves no other entry, and every ruling holds (the Daily's row
  stays full width, and Survival, Expeditions, Challenge and More modes
  keep their pairs).
- Cons: adds about 56 px. On a 664 px phone that overflows by about
  40 px unless something trims, so pair it with **C5** (continent
  chips off home, which frees about 65 px). It is also the most
  prominent option, which cuts against the fatigue concern; the quiet
  style and the dimmed done state are the mitigation.

**P2. Take Expeditions' cell beside Survival, and move Expeditions into
the More modes hub.**
- Pros: zero height change, and a clean 2x2 grid under the Daily. The
  pack gets a full mode button.
- Cons: the Weekly is a live daily cadence ("Missed stops open
  Sunday"). It would go from 2 taps to 3 to play a stop, behind a hub
  whose name says nothing about weekly content. This trades one daily
  ritual for another, and Weekly engagement likely drops (no data to
  measure it).

**P3. A third pill in the links row: Stats · Passport · Pack.**
- Pros: zero height change, the cheapest build, and the pack reads as
  part of the collection.
- Cons: the lowest prominence. A ritual that is not seen does not
  form. At about 107 px per pill the label has to shrink to "Pack". It
  also mixes a play entry into what is today a row of read-only
  screens.

**Recommendation: P1 with C5.** It is the only option that gives the
ritual a visible daily slot without demoting another mode. Its one
cost (height) is paid by removing duplication rather than content. If
you would rather not touch the passport card, P3 is the fallback, not
P2.

---

## 4. Homepage cleanup

These are light trims in the shipped Challenge-declutter style, not a
redesign. The per-mode share formats are untouched.

| # | Item | Call | Reason | Risk |
|---|---|---|---|---|
| C1 | **Mute toggle on home** (#1) | **Remove** the home instance; keep the round-screen one | It is unreachable today: the settings gear sits in the identical 44x44 box above it (measured). Players already mute from the round header, where sound actually plays | None functional, since nobody can tap it now. A player who expects mute on home has never had it |
| C2 | **Photo mode row** in More modes (disabled, "Coming soon") | **Remove** until Photo-first ships | A disabled row is a dead tap, and "coming soon" ages badly | Low. Re-adding it is one markup line |
| C3 | **More modes label** "Landmarks, photo and trivia games" | **Reword** to "Landmarks and trivia" | It advertises a mode that does not exist (C2) | None |
| C4 | **Endless home button** (#7, hidden) and its `disabled` toggles in main.js | **Remove** the dead button and the two toggles; leave `src/modes/endless.js` quarantined as you decided | A hidden button still wired up is the dead entry point the brief names. The mode's logic stays intact, so re-enabling it is a restore, not a rebuild | Low. `endlessEls.entry` is read in main.js (2 places) and endless.js init, so they need a null guard. Deleting the mode itself is a separate decision (decision 17) |
| C5 | **Continent chips** in the home passport card (6 chips, 2 rows) | **Demote**: off home, still on the Passport page | They duplicate the Passport page, which groups by continent with progress bars. They are the densest element on home, and removing them pays for P1's row | Medium-low. A player who checks continent % at a glance loses it from home (one tap away now). Count line and stamps stay |
| C6 | **Survival hub row names** "Survival: Tap the Country", "Survival: Country Blackout" | **Trim** to "Tap the Country", "Country Blackout" | The hub heading already says Survival, so the prefix repeats on every row | Low. These are labels only. Share titles and results headings keep their own wording |
| C7 | **Expeditions label** "Themed journeys" | **Reword** to the live week, for example "This week: Colonial Towns" (falls back to "Themed journeys") | The Weekly is the time-bound content in there, and the label hides it. A mode name should say why to tap today | Low. Long route names need the existing 2-line clamp; check at 390 px |
| — | Passport card not tappable (#5) | **Keep** as is | Making it a second Passport entry would duplicate the Passport pill (13) | — |
| — | Daily, Survival, Challenge, Stats, Passport, gear, how-to, streak line | **Keep** | Each is single-purpose and correctly placed by the rulings | — |
| — | Collections (#14, hidden) | **Keep hidden** | This is your 2026-10-13 decision, revisited with future-features item 7 | — |
| — | HUD "Drag to spin · Pinch to zoom" | **Keep** | Out of the pack's scope. It is the only globe hint a new player gets | — |

Taps: nothing on home is two taps deep that should be one, apart from
the Weekly stop (Expeditions → This week). C7 addresses that by making
the first tap informative, not by flattening it. Nothing is one tap
that should be two: "Reset all data" is already behind a confirm in
Settings.

---

## 5. Build sequence

| Step | Size | What | Verifiable headlessly | Needs Sean's phone |
|---|---|---|---|---|
| 1 | S | `src/meta/pack-store.js`: `PACK_KEY`, read and replace on a new date, generation over the 2a pool (3 distinct, `Math.random`), save before the first clue, retired-id redraw | Node unit test in `test/` with a fake `localStorage` and a fake date: shape, no reroll on re-read, date rollover, distinctness, pool counts 805 + 332 | — |
| 2 | M | Round variant (`src/modes/pack.js` plus branches in round.js, main.js `goHome`/`confirmGoHome`): header, no timer, `recordVisit` with earning, `kind` computation, grey-card toast, "Already in your Passport" line | Playwright through `window.__game.guess`: a hit within 150 km sets `meta.e` and a miss leaves a seen-only entry; a pack miss then a Survival hit colours the card; reload mid-pack resumes the same card; zero page errors | The reveal feel and the toast copy |
| 3 | M | The pack screen (2g) on `buildPostcardCard` and the mystery template; slot to postcard detail | Element counts per state (face-down, flipped, done); the detail opens; the score total is correct | **Yes.** This is the ritual: is opening a card satisfying, and are grey and mystery distinct on the phone |
| 4 | S | The home row (P1) with its three states, plus `syncPackButton()` in `goHome()` and at midnight | Layout measured at 390x844 and 390x664: no overflow (with C5), Daily still full width, pairs intact | Placement taste |
| 5 | S | Cleanup C1 to C7, one batch | Each by DOM check: mute absent from home, no disabled row in More modes, labels, `elementFromPoint` on the gear; `scripts/regression.sh` green | One look at the trimmed home |
| 6 | S | Batch deploy of 1 to 5 (name the cargo first) | Push verified on origin/main; Vercel READY | First live pack |
| 7 | S, **blocked** | Pack 2 behind `entitlement('daily_pack_extra')` | With a stubbed entitlement: the bonus row appears only after pack 1, is generated on its own tap, and survives a lapse | A real test-mode subscription, once the payments addendum is built |

Steps 1 to 3 are one build (they share round.js). Steps 4 and 5 can
run in the same session since they touch home only. Step 7 waits for
accounts Phase 1 to go live and for the addendum's
`src/account/entitlements.js`. The syntax check for every step includes
`node --check --input-type=module < src/main.js` (the known
CommonJS-check gap).

---

## 6. Decisions for Sean

1. **Pool.** 805 cities + the 332-entry Landmarks pool (1,137), or all
   427 landmark-file entries? *Recommend 1,137. Areas score unfairly
   until item 8, and 95 entries have no Passport shelf.*
2. **Distinct cards within one pack** (repeats across days stay
   allowed)? *Recommend yes: a 0.26% event, not a weighting.*
3. **Repeat cards: label them, never reroll.** OK to show "Already in
   your Passport" on a repeat with nothing new? *Recommend yes.*
4. **Timer.** None, or PvP's 20 seconds? *Recommend none: the pack is
   personal and local, and a timer adds stress to a bonus.*
5. **Midnight.** Forfeit unplayed cards of a past-date pack (the
   Daily's behaviour), or carry them over? *Recommend forfeit, with the
   on-screen round finishing.*
6. **Generation moment.** Lazily on the first tap, saved before the
   first clue? *Recommend yes.*
7. **State key** `where-on-earth-pack-v1`, today only, shape as in 2b?
   *Recommend yes.*
8. **Black and white = the existing "seen" state,** with no new storage
   or visual? *Recommend yes. A pack-only grey variant would be a
   second collection system.*
9. **First-visit grey-card toast** ("Visited · added to your
   Passport")? *Recommend yes, so a miss still has a payout moment.*
10. **Pack score.** Shown as per-card `+base` and a pack total out of
    3,000, saved nowhere beyond today, no streak, no Stats? *Recommend
    yes.*
11. **Pack share.** No pack-level format (per-card postcard share
    only)? *Recommend no pack share for launch.*
12. **Sync.** Pack key off the sync list until accounts go live, then
    added with the same-date merge rule? *Recommend yes.*
13. **Entitlement key name** for pack 2. *Recommend `daily_pack_extra`;
    the product plan may rename it.*
14. **Pack 2 timing.** Build it last, after the payments addendum's
    entitlement helper, and ship pack 1 without it? *Recommend yes.*
15. **Pack 2 upsell line** for non-subscribers. *Recommend none until
    payments are live, then at most one quiet line.*
16. **Home placement:** P1 (slim row under the Daily, with C5), P2
    (Expeditions' cell) or P3 (third links pill)? *Recommend P1 + C5.*
17. **Endless.** Remove only the dead home button (C4), or also delete
    `src/modes/endless.js` and its round.js branches? *Recommend the
    button only. The module stays quarantined per your earlier
    decision.*
18. **Cleanup C1 to C7.** Approve as a batch, or pick? *Recommend all
    seven.*
19. **Home label for the pack.** "Postcard pack" or "Daily pack"?
    *Recommend "Postcard pack": "Daily pack" next to "Daily" reads as
    part of the Daily game.*

## Decisions (Sean, 2026-10-18)

Sean approved all 19 recommendations in section 6 as written, with
one override:

19. **Name:** the feature is the **Daily postcard pack** (Sean's
call, overruling the "Postcard pack" recommendation), so players
can tell at a glance that it is a daily pack. The home row label
follows the name.

Decisions 1 to 18 stand as recommended: pool 805 + 332 (1,137);
three distinct cards per pack; repeats labelled, never rerolled;
no timer; unplayed cards forfeit at midnight; lazy generation saved
before the first clue; key `where-on-earth-pack-v1`, today only;
black and white is the existing seen state; grey-card toast shown;
pack total out of 3,000 with no streak and no Stats feed; no
pack-level share; pack key off the sync list until accounts go
live; entitlement key `daily_pack_extra`; pack 2 built last, after
the payments entitlement helper, pack 1 ships without it; no
upsell line until payments are live; placement P1 with cleanup C5;
Endless loses only its dead home button; cleanup C1 to C7 approved
as one batch.
