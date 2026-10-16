# Trivia promotion and Landmarks filter persistence: recommendation memo

Date: 2026-10-16. Written by Claude Opus 5.5, directly in one session (no delegation). Read-only except this file: no code or data changed.

## Question 1: run promotion now, and how to cut it

**Recommendation: run it now, cut by band need (option b), with a band target instead of "promote everything". Pilot 30 entries from the thin bands, then fill 9-10 (all 137 held), then 7-8 and 3-4 until each reaches 150 playable. Stop there and reassess. Run the text gates (fact, then uniqueness) before photo sourcing so entries that fail never cost a photo search. Send the 21 unscored entries to the locations skill for v2 scoring in parallel; each joins the slice for its band once scored.**

## Question 2: Landmarks filter persistence

**Recommendation: keep Landmarks filters memory-only. Do not add a key now.** If Sean or players say the reset is annoying, add exactly one key then, holding status only, mirroring Places. Waiting costs nothing; a key added now is a permanent contract.

---

## Question 1: reasoning

### What I measured (assets/trivia-bank.json, at a701a78)

Measured with node over the bank file. Matches the brief except where marked.

| | Count |
|---|---|
| Entries | 1,303 |
| Playable (`photo === 'verified'`) | 432 |
| Held out | 871 |
| Held, wrong photo | 850 |
| Held, no image and no difficulty | 21 |

By band (the game draws one target per band per game, `BANDS` in src/modes/trivia.js):

| Band | 1-2 | 3-4 | 5-6 | 7-8 | 9-10 | unscored |
|---|---|---|---|---|---|---|
| Playable | 159 | 63 | 116 | 62 | 32 | 0 |
| Held out | 97 | 283 | 150 | 183 | 137 | 21 |

Corrections to the brief's figures:

- **Held band 3-4 is 283, not 201** (difficulty 3: 136, difficulty 4: 147).
- **The "233 easiest" (difficulty 1 to 3) straddles two bands**: 97 are in band 1-2 and 136 are difficulty 3, which is band 3-4. So option (a) is partly a 3-4 slice already.
- **Shared clusters: I could not reproduce 580 in 128.** Measured: 656 held entries share their photo with another entry, across 204 photos. 360 of them sit on 87 photos that verify nobody; 296 sit on 117 photos that verify one other entry. This matches the repair report's 656. It does not change the recommendation, because every held entry needs a new photo either way.
- **8 of the 21 unscored entries have a difficulty in assets/locations.json**: Dalian 7, Nagoya 3, Kaduna 7, Patna 7, Agra 6, Managua 4, Panama City 3, Niagara-on-the-Lake 9. The other 13 are absent there. I have not verified that those 8 values came from the frozen v2 scorer, so they are leads for the locations skill, not scores. They do show that the 21 are not all "famous end": Agra sits at 6.

### Why band need beats the famous end

The game draws one clue from each band, so a band's depth sets how often a player sees repeats in that round. The chance that a round's clue is one the player has already seen, after 30 games (computed: expected distinct clues seen after 30 random draws from N):

| Band size | 32 | 62 | 116 | 150 | 159 |
|---|---|---|---|---|---|
| Repeat chance in that round | 61% | 39% | 23% | 18% | 17% |

Today's hardest round (9-10, 32 entries) repeats more than three times as often as the easiest (1-2, 159). The repair report already called 9-10 the thinnest band. Option (a) puts 97 of its entries into band 1-2, the deepest band, where they lower the repeat rate from 17% to about 11%. That is the least valuable place for the work. Players never see the pool, so a missing famous city (Chongqing, Agra) is invisible in play; a hard round that repeats is not.

A smaller point against (a): "famous" here means the scorer's difficulty, and the held difficulty-1 list includes Zaozhuang, Wuzhong, Bao'an and Weifang next to Chongqing and Shenzhen. It is not the famous end a player would recognise.

### Why not defer until after photo-first (option c)

- Photo-first is planned on the landmark shelf, not the trivia bank (future-features.md item 2: "launched on landmarks", with its own guessability review). The two do not compete for the same pool, and promotion does not block or wait on that build.
- Deferring leaves the 9-10 round at 32 entries for the whole photo-first build.
- Trivia's photo standard is looser than photo-first's: the photo is shown at the reveal, after the guess, so it only has to show the place. A photo-first photo must also be guessable with no visible text or caption. Promotion cannot reuse photo-first work that does not exist yet, so waiting saves nothing.

### Why a band target instead of all 871

At 150 per band, the thin bands match the 1-2 band's repeat rate (18% vs 17%). Beyond that the returns drop fast, and the remaining held entries are the lowest-quality part of the bank: bulk-backfill cities whose clues the repair report found were often never unique ("location-only clues for obscure towns ... were never unique even before their compass phrase was cut"). Promote what the game needs, not the whole backlog.

### What the gates cost before, and why the order changes

From the three reports:

- Photo verdicts: 713 photos judged in one Opus session, 632 of them from the filename alone. That pass judged existing photos. Promotion has to **find** a correct photo, which no pass has done at scale. That cost is unmeasured, and it is the reason for a pilot.
- Fact pass: 432 entries in one Opus session, 161 facts corrected (37%), heavier in the older entries (85 of the first 108). Expect the held entries to need at least that rate.
- Uniqueness: 432 clues in one Opus session, 53 flagged (12%), all rewritten, 0 pulled. Expect a higher flag rate and some pulls on held entries, given the clue-quality note above.

The existing passes ran photo first because the photos already existed. For promotion the photo is the expensive, unmeasured step, so it goes last: fact and clue check, then uniqueness, then photo. An entry pulled at a text gate never costs a photo search.

## Question 1: slice plan

Each slice runs the same gate chain, one entry at a time, and banks its working state every 50 entries (commit and push) so a VM kill costs minutes:

1. **Fact and clue check** against the English Wikipedia article, using the fact pass's rules and tools (scripts/trivia-fact-pass/, cached extracts). Wrong facts rewritten from the source; an entry whose premise cannot be salvaged is pulled.
2. **Uniqueness test**: name a real competitor that fits every stated fact, or PASS. Flagged clues are rewritten under the uniqueness rules or pulled.
3. **Photo**: source one Commons image that shows the place, at the game's format (Commons thumb, 500px), and record a verdict in the trivia-photo-verdicts format (method F, M or V). No photo found means the entry stays held.
4. **Flag and validate**: set `photo: "verified"` only on entries that cleared all three. A validator diffs the bank against the slice's base commit (only fact, clue, image and photo may change, on listed entries only; zero em dashes; counts reconcile). Trivia harness (shots/trivia/trivia-shot.mjs) must pass 28 of 28 before the slice's last commit.

| Slice | Entries | Source | Purpose | Gate |
|---|---|---|---|---|
| 0, pilot | 30 | 10 from 9-10, 10 from 7-8, 10 from 3-4; mix cities and moments | Measure per-entry cost and pass rate per gate, per band | Frontier review of the pilot's output and scripts before slice 1 (review-before-scale) |
| 1 | 127 | rest of held 9-10 | Fill the thinnest band; no surplus, so take all | Gate chain |
| 2 | until 7-8 has 150 playable (88 passes needed; 173 candidates left) | held 7-8, bank order | Second-thinnest band | Gate chain |
| 3 | until 3-4 has 150 playable (87 passes needed; 273 candidates left) | held 3-4, bank order | Third-thinnest band | Gate chain |
| Parallel | 21 | unscored entries | v2 difficulty from the locations skill (dependency; no scores invented here) | Each scored entry joins the slice for its band, or the backlog if its band is already full |
| Stop | | | Reassess 5-6 (116) and the backlog with Sean | |

Expected playable pool when slices 0 to 3 are done:

| Band | 1-2 | 3-4 | 5-6 | 7-8 | 9-10 | Total |
|---|---|---|---|---|---|---|
| Now | 159 | 63 | 116 | 62 | 32 | 432 |
| After | 159 | 150 | 116 | 150 | 32 to 169 | 607 to 744 |

7-8 and 3-4 hit 150 as long as the pass rate stays above about half (88 of 183 and 87 of 283), which is likely. 9-10 has no surplus: it lands at 32 plus however many of the 137 pass. Many held 9-10 entries are obscure moment sites (Parliament Square Traffic Signal Site, Former Marsh Supermarket, Nipomo Migrant Camp Site) where a photo that shows the place may not exist. I have no measured pass rate for them; the pilot gives one, and the 9-10 figure should be projected from it rather than guessed now.

---

## Question 2: reasoning

What the code does today (src/meta/passport.js):

- Places saves only its **status** choice, to `where-on-earth-passport-status` (`PP_STATUS_KEY`). Its band, continent and sort are already memory-only.
- Landmarks keeps all its filters in memory (`statusKey = null`). They survive tab switches and reopening the passport within a session, and reset on reload (docs/landmark-filters-report.md, deviation 1).
- Collapsed continents are already shared across tabs through the existing `where-on-earth-collapsed-continents` key, so the only gap is the Landmarks status filter.

Why memory-only is right for now:

- **Use.** Places is the main collection, where a player returns to a saved "show me what I haven't earned" view across sessions. Landmarks is a 332-card shelf the player browses. One tap restores a status filter on a shelf that size. Even Places persists only one of its four controls, so "Landmarks persists nothing" is a small step from Places, not a different design.
- **Saved-data discipline.** Keys are a contract with every installed copy: once shipped, a key has to be read, migrated or kept forever. Keys were added only when a feature needed one (`where-on-earth-weekly-v1` for weekly progress, `where-on-earth-best-trivia` for the Trivia best). A Landmarks status key would store a convenience, not progress.
- **Reversible.** Adding the key later needs no migration: an absent key means "All", which is today's behaviour. Removing a shipped key is the harder direction.

I do not have usage data for either tab, so this rests on how the tabs are built, not on measured player behaviour. The trigger to revisit is a complaint from Sean or a player. If that comes, the change is one new key, `where-on-earth-passport-landmark-status` or similar, holding status only, passed as the Landmarks dex's `statusKey`.
