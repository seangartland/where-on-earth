# Where on Earth: future features (post-launch)

Date: 2026-10-08 · Author: Claude Opus 5.5, ranking directly (no delegation)
Method: I measured category and image counts from `assets/locations.json` and read `src/main.js` to see what the code already supports (the `isLaunchExcluded()` filter, `scoreGuess()` scoring, and where the photo appears). Effort sizes are my estimates, not builds.

## Data on hand (measured)
| Category | Tagged | Playable (has a real image) | Countries |
|---|---|---|---|
| landmark | 160 | 143 | 67 |
| mountain | 39 | 37 | 24 |
| island | 35 | 31 | 15 |
| natural | 16 | 14 | 11 |
| lake | 15 | 15 | 11 |
| park | 13 | 13 | 5 |
| waterfall | 7 | 7 | 7 |

- **Nature pool:** 117 playable. About 4 of them are mis-tagged in `natural` (Marina Bay Sands, Old Cavendish Laboratory, Tokyo Bay Odaiba, Hand of the Desert), and all four belong in `landmark`.
- **`extentKm`:** only 20 of 1,926 locations have it, and none of the lakes or islands I sampled do.
- **Country borders:** `assets/countries-110m.json` is already in the repo, but `main.js` never loads it.
- **Photos:** today the photo only appears after the reveal. The clue is the place name plus its country.

## Ranked by value ÷ effort

### 1. Landmarks mode: small
- **What it is:** Endless and Survival played on the 143 landmark locations. Swap the `!isLandmark(item)` filter for a category filter, then add a mode button and descriptor.
- **Why players want it:** It's the most recognizable content in the database (pyramids, cathedrals, ruins), and it's a fresh pool for people who've finished with cities. A landmark is a single point, so the existing distance scoring stays fair.
- **Watch:** Keep it out of the Daily. Changing the daily bands reshuffles every future daily (see `launch-priority.md` §6). Do a quick clue pass, because some landmark names make the country obvious.

### 2. Photo-first ("Where's this?"), launched on landmarks: medium
- **What it is:** The round opens on the photo with no name, the player guesses, and the reveal shows the name and fact. The postcard and thumb components already render `item.image`. This mostly reorders the existing round flow.
- **Why players want it:** It's the biggest change in gameplay of anything on this list. It turns "do you know where X is" into "can you read this scene", which is the GeoGuessr hook, and it gives share cards a strong visual.
- **Why landmarks first:** Landmark photos are distinctive. City photos are often generic skylines, and nobody has verified that the 1,207 audited images are guessable without a caption.
- **Effort driver:** Each photo needs a "guessable, no visible text or caption" check before it enters the pool. That review step is data work (ladder lane, frontier spot-check), not code.

### 3. Nature mode: medium
- **What it is:** Endless and Survival on the 117 mountains, islands, lakes, parks, waterfalls and other natural sites.
- **Why players want it:** Different knowledge from cities, and it fits the globe aesthetic, especially with the rivers and lakes layers already in place.
- **Effort driver:** Scoring. A guess on the far shore of a big lake, or the wrong end of a long island, gets scored as a miss. It needs extent-aware scoring (distance to the feature's edge, or a radius discount from `extentKm`), plus filling in `extentKm` for about 50 lakes and islands. Re-tag the 4 bad `natural` entries first.
- **Note:** The pool is small, about 117 locations. It's a good fit for Survival and expedition-style runs and too thin for its own daily.

### 4. Country borders layer: medium
- **What it is:** Faint country outlines on the globe from the bundled `countries-110m.json`, behind a toggle or on the reveal only.
- **Why players want it:** Better orientation in every mode, and it makes the reveal easier to read ("you were one country off"). It's also the prerequisite for #5.
- **Effort driver:** Drawing lines on the three.js globe the same way the coast and rivers layers are drawn, then tuning the style so the hint doesn't make the game too easy.

### 5. Country-survival mode: large
- **What it is:** Name a country and click inside it. Missing the country ends the run.
- **Why players want it:** A simple, tense rule that's easy to explain and share.
- **Effort driver:** Point-in-polygon hit testing, and handling microstates. At 110m resolution many small countries are missing or tiny, so it needs 50m data or a forgiveness radius. It also needs its own country list with difficulty bands, since the location difficulty scores don't carry over. Do #4 first.

### 6. Country Blackout: medium (Sean's idea, 2026-10-12)
- **What it is:** Survival: Tap the Country (shipped 2026-10-12 as item #5) with a progressive map transformation. Each time a country is guessed correctly, that country is blacked out on the globe: its satellite imagery is removed and only the blue stylized map (the classic view's rendering) shows there. The globe visibly fills in as the run advances.
- **Why players want it:** The map itself becomes the scoreboard. Progress you can see, a strong run identity, and a natural share image: a half-blacked-out globe says how far you got without any numbers.
- **Builds on:** The shipped country geometry (`country-outlines.topo.json`) and hit testing, the Survival: Tap the Country run structure, and the existing classic blue style. The real work is masking the satellite texture per country on the globe as countries fall.
- **Watch:** Countries never repeat within a run, so the blackout is progression and identity rather than a scoring change. One second-order effect to playtest: removing a found country's satellite detail also removes orientation context for neighbouring unfound countries, which may quietly raise difficulty late in a run.

### 7. Collections revisit (Sean, 2026-10-12)
- **State:** Collections is HIDDEN as of 2026-10-12: the home-screen button and the Passport shield button carry `hidden`; all Collections rendering, state, and wiring remain in the code, so reinstating is removing two attributes.
- **Revisit when:** the expanded location list has landed (the Oct 13 city batches take the dataset from 754 toward 812). Reconsider what Collections should be with the larger list before unhiding, rather than restoring it unchanged by default.

### Also cheap (not on the original list)
- **Themed Endless from existing `sets`:** small. The tags already exist (Volcanoes 14, Castles 11, Ancient Ruins 12, Sacred Sites 12…), so this is a picker over data already on hand. Good filler between bigger releases.

## Top 3 recommendations
1. **Landmarks mode.** Cheapest win: a filter swap over 143 strong locations that are ready now. Ship it as the first post-launch content drop.
2. **Photo-first, landmarks only.** The highest-value new mechanic. Its main cost is a photo-guessability review, which can start while #1 ships. Expand to nature, then to cities, as more images pass review.
3. **Nature mode.** Do the extent-aware scoring together with it, or the lakes and islands will feel unfair. That scoring work also helps any future area-based mode.

Borders and country-survival come after these. Borders on their own are a reasonable mid-size polish item. Country-survival has the highest effort and adds the most new data dependencies.
