# Passport Group by design plan

Date: 2026-10-17. Scope: design only. No product code or data changes are part of this plan.

## Recommendation

Replace the rarity filter in Places and Landmarks with a separate **Group by** control. Ship four choices: **Continent**, **Country**, **Difficulty**, and **None**. Keep status as a filter and keep sort as an independent, within-section order. Default to Continent, which preserves today's Atlas presentation.

Keep the Countries tab. Group by Country is useful for browsing individual place cards, but it does not replace a country collection overview. The tab uniquely shows one card per country, postcard completion at a glance, a best postcard image or flag tile, complete-country treatment, and a country detail page. Removing it would exchange a calm 202-item overview for as many as 202 accordion headings mixed with place cards.

Apply the same model to Landmarks. Do not persist the new group choice in the first release. Keep the existing status key and continent-collapse key unchanged.

## 1. Verified current UI and player jobs

The following inventory comes from `src/meta/passport.js`, not from the proposal shorthand.

### Surfaces

- The Passport has Places, Countries, and Landmarks tabs.
- Places builds a dex from every location. The current data set has 805 places.
- Countries derives one row per `countryKey()`. The current data set has 202 countries. A country opens a detail page containing all of that country's place cards.
- Landmarks builds a separate curated shelf. The current shelf has 332 entries. Landmarks do not count toward place, country, or continent totals.

### Places and Landmarks panel

Both tabs use the same `ppFilterControls()` markup and behavior, but they have separate in-memory state.

| Control | Current choices | Actual behavior | Player job |
| --- | --- | --- | --- |
| Status segmented control | All, Earned, Seen, Unvisited | All clears the status set. The other three can be combined. A card is Earned when a postcard was earned, Seen when visited without earning, or Unvisited. | Review wins, revisit near misses, or find undiscovered collection slots. |
| Continent filter | All continents plus available continents | Hidden when Atlas is selected. Shown for flat sorts, where it limits cards to one continent. Landmarks derives available choices from its shelf. | Narrow a flat result set geographically. |
| Rarity filter | All rarities, Common 1 to 3, Uncommon 4 to 6, Rare 7 to 8, Legendary 9 to 10 | Filters cards by the difficulty band computed from `item.difficulty`. The code and accessible label say rarity, although the underlying value is difficulty. | Find hard or easy places and inspect progress in a band. |
| Sort | Atlas, Most recent, Closest guess, Name A-Z | Atlas groups by continent, orders continents by `CONTINENT_ORDER`, then cards by country and name. Other sorts are flat: visited cards use the chosen order, while unvisited mystery cards sit at the end in Atlas order. Closest uses best distance, most recent uses recency, and name uses display name. | Browse geographically, revisit recent play, find best guesses, or locate a known name. |
| Result line | Total noun count or `n of total shown` | Updates after filters; a zero result also shows the empty message. | Confirm scope and understand an empty result. |

The pill currently says `Filters` and a summary such as `All places · Atlas`. Its badge counts active status, rarity, and continent filters. Sort is summarized but is not counted as a filter.

Places persists only its selected status set to `where-on-earth-passport-status`, as a JSON array containing zero or more of `earned`, `seen`, and `unvisited`. Landmarks state is memory-only. The difficulty selection is not persisted and is not inside the saved Places value. This storage shape is a compatibility contract.

### Countries tab

The list summary is `x of 202 countries · y complete`. Its choices are Most earned, Closest to complete, A-Z, and By continent. By continent is the current default and uses the shared continent accordion.

Each country card leads with postcards earned, then shows places visited out of total. It uses the player's best available postcard image as the cover, or a large flag tile when there is no usable visited image. Complete countries get a distinct gold treatment. Opening a card shows the country flag, visited and postcard counts, a two-layer progress bar, and every place in the country with visited entries first.

### Accordion

Atlas Places, By continent Countries, and Atlas Landmarks share one accordion implementation and one `where-on-earth-collapsed-continents` string-array key. Section heads show the continent, `earned of total collected`, a mini bar with visited and earned layers, and a chevron. The code intends exactly one open section. A toggle-close correction is in flight, including support for zero open sections, so implementation must rebase on that behavior rather than restore the current early-return rule.

## 2. Proposed grouping model

Filtering decides which cards qualify. Grouping partitions those qualifying cards. Sorting orders cards inside each section. Grouping never changes earned, visited, or total definitions.

Section totals should describe the full group, as today, while a section is hidden when no cards match the active filter. This preserves stable progress numbers while the `n of total shown` line explains the filtered result. Do not rewrite a head to imply that filtered cards are the group's full collection.

| Group by | Section head | Section order | Default card order | Mini bar |
| --- | --- | --- | --- | --- |
| Continent | `Europe` and `34 of 181 collected` | `CONTINENT_ORDER`, then unknown values alphabetically | Atlas: country A-Z, then place A-Z | Seen width is visited / all places in continent. Earned width is earned / all places in continent. |
| Country | Flag plus `Japan` and `8 of 17 collected` | Country name A-Z | Place name A-Z | Seen width is visited / all places in country. Earned width is earned / all places in country. |
| Difficulty | `Common · 1-3`, `Uncommon · 4-6`, `Rare · 7-8`, `Legendary · 9-10` and the usual collected count | Easy to hard in the existing band order | Country A-Z, then place A-Z | Seen width is visited / all places in band. Earned width is earned / all places in band. |
| None | No section head | Not applicable | Country A-Z, then place A-Z | Not applicable. |

Use the existing labels Common, Uncommon, Rare, and Legendary so cards, filters, and prior player vocabulary stay aligned. Use Difficulty as the control label because that is what the underlying score represents.

Country section flags come from the existing `countryIndex` majority flag. If a flag is unavailable, reserve the same leading width and omit it rather than substituting a new icon.

### Filters and sort composition

- Status remains a multi-select filter with All, Earned, Seen, and Unvisited.
- Remove the rarity select entirely.
- Remove the continent filter. It currently exists only as a compensating control for flat sorts. Group by Continent offers geographic browsing, while Group by None plus an extra continent filter would preserve a niche combination at the cost of panel clutter. If Sean considers `Europe + Most recent` essential, retain the continent filter as a follow-up decision rather than hiding it in this change.
- Keep Sort as a second select with Atlas, Most recent, Closest guess, and Name A-Z.
- Rename Atlas in the visible UI to **Country then name**. Atlas currently bundles grouping and ordering, so leaving that label after they are separated would be ambiguous. Its stored value may remain `atlas` internally.
- Sort applies independently within every group. Most recent, Closest guess, and Name A-Z use their current comparators. In each section, unvisited cards remain after visited cards for Most recent and Closest guess because those values do not exist for mysteries. Country then name can mix visited and unvisited according to country and name, matching today's Atlas.
- Section order never changes when sort changes. This avoids sections jumping around and makes Group by carry one clear meaning.
- Default state is Group by Continent, Country then name, All statuses. It is visually and behaviorally equivalent to today's unfiltered Atlas default.

Status does not earn a place as a grouping in the first release. It duplicates a control players already understand, creates only three coarse sections, and makes combinations such as filtering Earned while grouping by Status nonsensical. Status is better at answering “show me what remains” than at organizing a collection. Earned tier is also rejected: tier is not the current status model and would introduce new product semantics.

## 3. What replaces the difficulty filter

Group by Difficulty improves the completion job. A player can compare all four bands at once, see earned and visited progress per band, and open the band they care about. The old filter could show only one band and gave no band-level progress summary.

It is worse for the focused “show only Legendary places, ordered by closest guess” job. Group by Difficulty still puts Legendary in a section, but the other three headings remain on screen. With a one-open accordion their cards stay out of the way, yet the view is not a true single-band result. It is also less direct when combined with a status filter because the head's denominator remains the full band while only matching cards appear.

Recommendation: accept that small loss for a calmer panel and better progress comparison. Validate it in the rendered options. If focused band hunting proves important, the least cluttered fallback is tapping an already-open difficulty head's count to isolate that band, but that is a new interaction and should not be included without separate approval.

## 4. The Countries question

### End state A: keep Countries as is

Places gains Group by Country, while Countries stays a dedicated overview and detail route.

Player benefit: Group by Country answers “show me my Japanese places.” Countries answers “which countries have I completed, and where am I close?” The player keeps flags, best postcard covers, one-card-per-country scanning, complete treatment, country-level sort choices, and the detail page.

Cost: Country is represented in two surfaces, and Group by Country can produce up to 202 accordion headings.

### End state B: replace Countries with Group by Country

Remove the tab and its detail page. Country heads lead directly to place cards.

Player benefit: one fewer tab and one less navigation layer.

Player loss: no compact completion overview, no best postcard covers, no flag tiles for unvisited countries, no complete-country treatment, no Most earned or Closest to complete country ranking, and no dedicated detail header. Scanning 202 section heads is slower than scanning country cards. This does not honestly replace the current Countries job.

### End state C: merge and remove the tab

Make country grouping the only entry to countries, but let each country head expose both an inline place list and a route to the existing country detail page.

Player benefit: retains detail data while removing a top-level tab.

Player cost: the overview card layer still disappears unless country grouping uses country cards instead of place cards. Keeping both inline expansion and a detail affordance gives a small phone target two competing actions and makes the accordion harder to explain. Reusing country cards inside Places would cease to be a normal grouping and would add visual weight Sean has repeatedly cut.

Recommendation: **End state A**. Keep the Countries tab through the first Group by release. Revisit removal only after instrumented or observed evidence shows the tab is unused. If the tab is ever removed, retain the country detail page and its visited, earned, total, flag, progress, and place-card data. Do not discard that data merely to reduce the tab count.

## 5. Landmarks parity

Landmarks gets the same Group by choices and panel structure. Its entries already have continent, country, and difficulty band fields, so a different model would create needless inconsistency.

Its panel keeps Status, Group by, Sort, and the result line. It loses rarity and the conditional continent filter just like Places. State remains memory-only. Country counts and bars refer only to the Landmark shelf and must never leak into Places or Countries totals. Difficulty grouping uses the present bands, but the known landmark difficulty-scale quality issue should be resolved before treating cross-tab difficulty progress as comparable. This UI groups the available values; it does not claim the two data sets were calibrated together.

## 6. Pill and panel specification

### Closed pill

Use a two-line pill as today:

- Top line: `Browse` with an active-filter dot count. “Filters” is too narrow once grouping is a primary control.
- Summary, default: `Grouped by continent - All places`.
- Country: `Grouped by country - All places`.
- Difficulty with a filter: `Grouped by difficulty - Unvisited`.
- None: `No grouping - All places`.
- Multiple statuses: `Grouped by country - Earned, Seen`.
- Nondefault sort appends ` · Most recent`, for example `Grouped by country - Unvisited · Most recent`.
- Landmarks substitutes `landmarks` for `places`.

The badge counts only active status filters, not Group by or Sort. Group and sort are always populated modes, not constraints. If multiple statuses are selected, retain today's count-by-selected-status behavior.

### Open panel order

1. Label `Show` above the existing All, Earned, Seen, Unvisited segmented control.
2. Label `Group by` above a full-width select: Continent, Country, Difficulty, None.
3. Label `Sort within groups` above a full-width select: Country then name, Most recent, Closest guess, Name A-Z. When Group by None is selected, change the label to `Sort`.
4. Result line, such as `126 of 805 shown` or `805 places`.

Do not add Apply, Reset, helper copy, icons in selects, or a second sheet. Changes remain immediate.

### Existing saved state

Leave `where-on-earth-passport-status` untouched. It contains only the status array, so no migration or field removal is needed. Continue accepting the existing legacy single-string read path. A build must not rewrite the value until the player changes status, matching current behavior.

Group selection, sort selection, and all Landmark controls remain memory-only for the initial release. Persisting any of them requires Sean to approve a new key and shape. Do not overload the status key.

## 7. Accordion behavior and storage

Accordion identity must become `(tab, grouping, group key)` in memory. Plain labels are unsafe because `Europe` means a continent while `Rare` or a country name belongs to another grouping.

On a grouping change:

- Save the current open or closed state in session memory for that tab and grouping.
- Restore that grouping's session state if the player used it earlier in the same Passport session.
- On first use, open the first group with an earned postcard, otherwise the first group.
- Group by None has no accordion state.
- Respect the toggle-close fix: tapping the open section may leave zero sections open.
- Filters hide empty-result sections but do not alter their open state. Clearing a filter restores the same section state.

Keep `where-on-earth-collapsed-continents` continent-only and preserve its current string-array shape. Read it only for Continent grouping and continue writing it only when a continent accordion changes. Country and Difficulty state should not be written there. This avoids a migration and prevents country or band labels from contaminating a key whose name and existing users are continent-specific.

Recommendation: do not persist Country or Difficulty collapse state. If Sean wants it across launches, that needs an explicit decision on a new versioned key, suggested shape `{ places: { country: [...] }, landmarks: { country: [...], difficulty: [...] } }`, plus size limits for up to 202 country names.

## 8. 390px render specification

Render at a 390 by 844 viewport with the existing Passport background, 14px screen gutter, 390px maximum card width, three-column 8px card gaps, and the real sticky toolbar behavior. Use seeded progress with a mix of earned, seen, and unvisited cards. Keep the existing header and three tabs so vertical pressure is honest.

### Shared dimensions

- Browse pill: available content width, 44px minimum height, 12px radius, 12px horizontal padding. `Browse` is 13px semibold. Summary is 11px and truncates on one line.
- Open panel: same available width, 12px top and side padding, 14px bottom padding, 10px vertical gaps. Labels are 10px uppercase or the existing quiet-label style. Controls are at least 40px high.
- Status row: four equal buttons in one row, at least 40px high. Use current pressed treatment.
- Selects: full width, 40px high, existing quiet outline and right chevron.
- Section head: sticky behavior unchanged; 48px minimum height, label and count on the left, 18px chevron on the right. The mini bar spans the text column under the count. A country flag uses a fixed 22px leading column.
- Cards remain the current three-column slot design. Do not invent denser cards for this proposal.

### Render A: default Continent

Closed panel. Pill summary: `Grouped by continent - All places`. Show Europe open with head `Europe`, `34 of 181 collected`, the current two-layer mini bar, and downward chevron. Show the prior and next continent heads collapsed enough to judge rhythm. Cards are ordered by country then name.

### Render B: Country with panel open

Show the complete panel: All selected; Group by set to Country; Sort within groups set to Country then name; `805 places` result line. Below it, show `🇯🇵 Japan`, `8 of 17 collected` open with three place cards, and `🇯🇴 Jordan`, `2 of 4 collected` collapsed. This render tests whether the flag, name, counts, and chevron fit without feeling like a country card.

### Render C: Difficulty plus Unvisited

Closed panel. Pill summary: `Grouped by difficulty - Unvisited`. Show Common and Uncommon collapsed, Rare open, and Legendary collapsed. Rare's head reads `Rare · 7-8` and `19 of 126 collected`; its bar remains based on all 126 Rare entries while only unvisited mystery cards appear. The result line above sections reads `n of 805 shown`. This render must make the full-denominator semantics understandable without added prose.

Optional comparison render: Group by None with Most recent, proving that flat browsing remains available after Atlas is split apart.

## 9. Build phasing and verification

### Slice 1: model and rendering, dark

Add explicit group and sort state, pure grouping metadata, section ordering, and within-section comparators. Keep the current controls and route the new renderer behind a local or audit-only flag.

Verify with unit-level fixtures for all four groupings, unknown continent/band fallback, section order, unvisited ordering, and filtered section visibility. Assert Places totals remain 805, Countries 202, and the normal Landmark shelf 332 against the checked-in data used by the harness.

### Slice 2: controls and state, dark

Replace the panel markup in the dark path, wire pill summaries and immediate updates, remove rarity and conditional continent filtering, and implement namespaced in-memory accordion state. Preserve status storage and continent collapse storage byte-for-byte.

Verify keyboard and touch behavior, accessible labels and expanded state, outside-tap and scroll closing, sticky toolbar transitions, zero results, multi-status combinations, toggle-close with zero open, switching groupings repeatedly, and switching tabs. Seed old single-string and JSON-array status values and confirm both still load.

### Slice 3: Country and Landmark integration, dark

Add country flags and country section counts using `countryIndex`. Enable the same model for the Landmark shelf without changing its totals or persistence. Leave the Countries tab and country detail page untouched.

Verify countries with no visited cards, missing images, territory flags, the five distinct England, Scotland, Wales, Northern Ireland, and United Kingdom keys, landmark-only counts, and no landmark contribution to Places or Countries.

### Slice 4: visual review and live switch

Render the three specified 390px states with `shots/passport/pp-shot.mjs` or its current successor. Review at 390 by 844 and at the existing narrow breakpoint. Once Sean approves one rendering, remove the dark path and old rarity/continent control code in the same release. Do not carry two permanent renderers.

Run the pp harness through:

- all three tabs and country detail back navigation;
- every Group by and Sort combination on Places and Landmarks;
- each status alone and in combinations;
- empty results and clearing filters;
- accordion open, close, restored continent state, and group switching;
- open postcard, previous and next navigation, close back to the correct card after regrouping;
- persisted Places status across reload and memory-only Landmark state;
- mystery cards last for recency and distance;
- 390px screenshots with no horizontal overflow, clipped labels, obscured cards, or sticky-panel overlap.

Also run the normal repository validation suite. No data, score, postcard, share-card, collection, or game-mode behavior should change.

## 10. Decisions for Sean

1. **Keep the Countries tab?** Recommendation: yes. Country grouping is a place browser, not a substitute for the completion overview and country detail route.
2. **Ship Group by choices Continent, Country, Difficulty, and None?** Recommendation: yes. Reject Status and earned-tier grouping for now.
3. **Default grouping?** Recommendation: Continent, preserving today's Atlas experience.
4. **Keep sort inside groups?** Recommendation: yes. Rename visible Atlas to Country then name and keep the other three sorts.
5. **Remove the continent filter with rarity?** Recommendation: yes for calm. If the specific `one continent + recency/distance` job matters, explicitly retain it as an additional panel control.
6. **Accept the loss of true difficulty isolation?** Recommendation: yes. Difficulty grouping improves comparison but is slightly worse for single-band hunting.
7. **Landmarks parity?** Recommendation: yes, using Landmark-only totals and memory-only state.
8. **Persistence for Group by and non-continent accordion state?** Recommendation: no in the first release. Any persistence needs Sean's approval for a new storage key and shape.
9. **Section progress while filtered?** Recommendation: keep full-group earned, visited, and total values; use the separate shown count to explain the filter.
10. **Country-group accordion at up to 202 sections?** Recommendation: render it for review before build approval. If it feels too long, drop Country grouping rather than weakening the Countries tab or adding nested navigation.

