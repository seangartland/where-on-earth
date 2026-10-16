# Trivia fact pass report

Scope: every playable Trivia entry (`photo === 'verified'` in assets/trivia-bank.json,
432 entries at the repair-pass head commit ef89290). For each one the FACT and the
CLUE were checked against the place's English Wikipedia article. Plus the named
items from docs/trivia-bank-repair-report.md. No game code changed and nothing was
deployed.

## Method and sources

- Who did the work: Claude Opus 5.5, directly in one orchestrated session with no
  delegation. Slice 1 was banked by an earlier run of this same pass. This run
  audited it (git log, the verdict file and four spot checks: Malbork, Anne Frank
  House, Everest, Leshan), found it sound, and carried on from entry 109.
- Source text: `scripts/trivia-fact-pass/fetch-wiki.mjs` resolved each entry to an
  English Wikipedia article through the MediaWiki API: the exact title from `short`,
  falling back to the top search hit. It cached the article's full plain-text
  extract (fetched 2026-10-16) and the article-to-pin distance, so a wrong article
  would show up. One resolution was a disambiguation page (Hoi An) and was refetched
  as Hội An Old Town. Where an entry is an event or a feature whose details live in
  another article, that article was appended. Examples: Jaws (film), 1980 eruption
  of Mount St. Helens, Woodstock, Bob Beamon and the 1968 men's long jump, Kalyan
  Minaret, Cité de Carcassonne, Circuit de la Sarthe, Lumbini pillar inscription,
  New Caledonia, Dunkirk evacuation, Christ Church (Windhoek), Arachnocampa
  luminosa, Quilmes people, Center Parc Stadium. `sources.json` lists the
  article(s) used for every entry.
- Checking: `worklist.mjs` printed each entry's clue and fact next to the article
  sentences sharing the most key terms. Then every specific claim (numbers, dates,
  names, superlatives, stories) was searched in the cached text with `grep.mjs`.
  A claim stayed only when the article supports it.
- Named items used Wikidata (P625 coordinates for Q151545 Wartburg and Q2264090
  Gurudongmar Lake) and the Wikipedia articles Gurudongmar Lake, Sinking of the
  Titanic and Wreck of the Titanic.
- Verdict files: `scripts/trivia-fact-pass/slice1.json` to `slice4.json` (about 108
  entries each, in bank order of the playable list) and `named.json`. Each records
  KEEP or FIX with a note naming what was wrong and what the source says.
  `apply.mjs` applies them as textual edits inside each entry's block, so every
  untouched byte of the bank stays identical (204 changed lines, see validation).
- Rewrite rules: a supported fact stays byte-identical. A wrong or dubious fact is
  rewritten in the same voice and at roughly the same length, using only claims the
  source supports. A clue is corrected only where the clue itself states something
  false. Zero em dashes in any written text (checked by apply.mjs and validate.mjs).

| Slice | Entries (playable list) | Facts corrected | Clues corrected | Commit |
|---|---|---|---|---|
| 1 | 1-108 | 85 | 22 | 8041074 |
| 2 | 109-216 | 54 | 12 | dc28e63 |
| 3 | 217-324 | 12 | 2 | 0396c23 |
| 4 | 325-432 | 10 | 4 | 540331e |
| Named items | wartburg-castle pin, titanic-sinking fact | 1 (not playable) | 0 | bd3f77b |

(The slice 4 commit message says "11 facts". The applied and validated count is 10.)

The correction rate falls sharply by slice. That follows the bank's history rather
than a change in strictness. Slices 1 and 2 are the older hand-written landmark
entries, where many facts carried invented stories and numbers. Slices 3 and 4 are
mostly event entries and short d1-d2 facts lifted from Wikipedia leads, which were
largely accurate. The overall rate (161 of 432, 37 percent) is higher than the
repair report's 17 to 22 percent sample estimate. That sample counted clearly false
facts only. This pass also corrected specifics the source does not support (a wrong
number, an unsupported superlative), as the brief asked for dubious facts.

## Counts

- Playable entries checked: 432 of 432 (every one has a verdict).
- Facts corrected on playable entries: 161. Facts kept byte-identical: 271.
- Clues corrected: 40 (36 for false statements, plus the 4 named relative-compass
  clues: three-sisters-blue-mountains in slice 2; napa-valley-ava,
  palace-of-fontainebleau and daintree-rainforest in slice 4).
- Entries unflagged (removed from the playable pool): 0. No entry's premise was
  unsalvageable. Every pin and text described the same real place, and a true fact
  could be written for each. The closest case, yolyn-am-mongolia, whose clue and
  fact described the Flaming Cliffs, was rewritten from the Yolyn Am article.

Unflagged entries list (read by validate.mjs):
<!-- unflagged:start -->
(none)
<!-- unflagged:end -->

## Before and after examples

| Entry | Field | Before | After |
|---|---|---|---|
| malbork-castle | fact | Malbork Castle, built by the Teutonic Knights, was dismantled and ferried across Poland to become a royal castle after the Treaty of Thorn in 1466. | Malbork Castle, built by the Teutonic Knights, was sold to King Casimir IV of Poland in 1457 and then served as a Polish royal residence until 1772. |
| malbork-castle | clue | Where was the largest castle in the world taken apart brick by brick and rebuilt 250 kilometres away? | Where did the Teutonic Knights build the largest castle in the world by land area? |
| anne-frank-house | fact | Anne Frank's diary survived because Fritz Frank and Gies Huber abandoned papers before they were deported in 1942, and it was not published until 1947. | Miep Gies and Bep Voskuijl saved Anne Frank's diary after the family's arrest in 1944, and it was published in 1947. |
| mount-everest-summit | fact | At 8,849 m Everest is the Nepal-China border peak, and because of the border dispute Nepal's own maps show it as 8,586 m, which makes the country's highest peak the world's 14th. | Its height of 8,848.86 m comes from a joint Nepalese and Chinese survey in 2020, after years of argument over whether to count the snow cap. |
| leshan-giant-buddha | fact | Cut between 1001 and 1153, the figure is so large that a Song emperor once considered damming the river to drown it, and it still holds its own stone umbrella against the weather. | Carved during the Tang dynasty and finished in 803, the figure has drainage channels hidden in its hair and body to carry rainwater away. |
| alcazar-of-segovia | clue | Where is the castle whose turrets are modelled on an inverted ship's hull? | Where is the castle whose Hall of the Galley is named for a ceiling shaped like an inverted ship's hull? |
| cape-point | fact | Its cliffs mark the boundary between the Atlantic and Indian oceans, though the actual meeting point lies further east at Cape Agulhas. | It is often wrongly called the meeting point of the Atlantic and Indian oceans; Cape Agulhas, about 150 km away, is Africa's southernmost point. |
| cape-point | clue | Where is the rocky promontory at the southwestern tip of the Cape Peninsula? | Where is the rocky promontory at the southeast corner of the Cape Peninsula? |
| tikal | fact | Its Temple IV is 65 m tall, the tallest Maya structure ever built, and its lost twin pyramid was found by archaeologists in 2015 using ground-penetrating radar. | Its Temple IV rises 70 m to the top of its roof comb, and its carved wooden lintels record a date corresponding to 741 CE. |
| kennedy-space-center | fact | Launch pad 39A has sent every crewed moon mission to space, and its 120 m Saturn V still stands as a monument. | From 1969 to 1972 its Launch Complex 39 sent all six Apollo Moon landing missions aloft on the 111 m Saturn V. |
| woodstock-max-yasgur-farm | fact | About 400,000 people gathered on Max Yasgur's dairy farm near Bethel, roughly 40 miles from Woodstock itself. (...) | More than 460,000 people gathered on Max Yasgur's dairy farm near Bethel, about 60 miles from Woodstock itself. (...) |
| noumea-new-caledonia | fact | It sits on Grande Terre in New Caledonia, whose islands hold roughly a tenth of the world's known nickel reserves. | It sits on Grande Terre in New Caledonia, whose soils hold about a quarter of the world's nickel resources. |

(The bank keeps its exact accents and apostrophes. Two Woodstock sentences are
shortened here with "(...)" where they did not change.)

## Named items

**Relative-compass clues (4 playable), rewritten under the clue-pass rules:**
anchored giveaway cut, identifying facts kept, one place only, no em dashes.

| Entry | Before | After |
|---|---|---|
| three-sisters-blue-mountains | Where are the three sandstone peaks above the Blue Mountains west of Sydney? | Where are the three sandstone pinnacles on the escarpment above the Jamison Valley? |
| napa-valley-ava | Which California valley north of San Francisco is the country's most famous wine region? | Which California valley, an American Viticultural Area with seventeen sub-AVAs, is the country's most famous wine region? |
| palace-of-fontainebleau | Which royal palace in a forest southeast of Paris is where Napoleon abdicated in 1814? | Which royal palace set in a great forest is where Napoleon abdicated in 1814? |
| daintree-rainforest | Which ancient rainforest north of Cairns meets the Great Barrier Reef at Cape Tribulation? | Which ancient rainforest meets the Great Barrier Reef at Cape Tribulation? |

The other 29 relative-compass clues are not playable and were left alone.
three-sisters-blue-mountains also had its fact corrected: fault erosion and
ancient Aboriginal paintings are not in the article.

**wartburg-castle pin: moved.** The repair report was right. Wikidata Q151545
(Wartburg) P625 is 50.96611, 10.30639.

| | lat | lng |
|---|---|---|
| Before | 50.716 | 10.352 |
| After | 50.9661 | 10.3064 |

The move is 28.0 km, almost due north. Its fact had already been corrected in
slice 1: Luther hid there for ten weeks, not "about a fortnight".

**gurudongmar-lake: left exactly as is. Data-repair follow-up.** Confirmed: the
entry names the Sikkim lake, but its pin (32.2417, 78.8067) and its fact ("Ladakh's
upper Bhagirathi valley ... around 5,050 m") describe somewhere else, and its clue
(Nanda Devi appearing in the lake) belongs to a different legend too. The verified
data for a repair: Wikidata Q2264090 P625 is 28.02, 88.71. The Wikipedia article
gives an elevation of 5,430 m (Government of Sikkim) and Mangan district. The lake
is named after Padmasambhava, who visited it in the 8th century, and it is sacred
to Buddhists. A correct repair would also need a new clue, which is outside this
pass's allowed changes for this entry. So pin, fact and clue all stay as they are
for one coherent fix later. Its photo stays unflagged.

**titanic-sinking fact: corrected (not playable).** The source check confirms the
report. Sinking of the Titanic: she struck the iceberg at 23:40 ship's time on 14
April and sank at 02:20 on 15 April. Wreck of the Titanic: about 3,800 m deep and
about 600 km south-southeast of Newfoundland.

- Before: The liner struck an iceberg at 2:40 a.m. and came to rest about 3,800 m down, roughly 600 km southeast of Newfoundland.
- After: The liner struck an iceberg at about 11:40 p.m., sank at about 2:20 a.m., and came to rest about 3,800 m down, roughly 600 km south-southeast of Newfoundland.

## Playable pool after the pass

432 entries, unchanged (no flags removed).

| Band | 1-2 | 3-4 | 5-6 | 7-8 | 9-10 |
|---|---|---|---|---|---|
| Playable entries | 159 | 63 | 116 | 62 | 32 |

## Validation

`node scripts/trivia-fact-pass/validate.mjs` diffs the bank against ef89290 (the
repair-pass head) and exits nonzero on any violation. It checks that only
fact/clue/lat/lng/photo changed. Fact and clue changes must be on entries playable
before the pass (plus the titanic-sinking fact). Coordinates may change only on
wartburg-castle. Only flag removals listed above are allowed. Every change must
match a verdict and every verdict must be applied. It also checks that there are
no em dashes, that gurudongmar-lake stays unflagged, that the counts reconcile,
and that the file's text diff is exactly the changed lines.

A mutation test was run before this report: a difficulty change, a coordinate
change on another entry, a clue change with an em dash on a non-playable entry,
and an unlisted flag removal. Each was caught. The bank was restored afterwards.

Output on the final bank:

```
base ef89290 vs working tree: 1303 entries before, 1303 after
playable entries with a verdict: 432 of 432
entries changed: 167; facts changed 162, clues changed 40, coordinate values changed 2, flags removed 0
unflagged: none (report list: none)
playable before 432 = playable after 432 + unflagged 0: OK
text diff of assets/trivia-bank.json vs ef89290: +204 -204 lines (every other byte unchanged)
playable per band after: {"1-2":159,"3-4":63,"5-6":116,"7-8":62,"9-10":32}
PASS: all checks
```

## Follow-ups (not changed in this pass)

1. gurudongmar-lake: repair pin, fact and clue together using the data above, then
   re-run its photo check.
2. Clues that are true but do not single out one place (repair report item 4):
   piton-de-la-fournaise ("the active volcano on an island in the Indian Ocean")
   was checked and is true, so it was left alone.
3. trakai-island-castle's clue says "west of a Baltic capital". That is the
   relative-compass style, but it names no city and was not on the named list, so
   it was left alone.
4. lake-manyara's clue (famous for tree-climbing lions) is the park's well-known
   claim, but the Lake Manyara article itself only lists lions among its predators.
   It was kept.
5. In slices 3 and 4, KEEP verdict notes record the source article used, not a
   per-claim summary. Slices 1 and 2 note the key supported claims.

## Commits

- 8041074 Trivia fact pass (slice 1 of 4): entries 1-108
- dc28e63 Trivia fact pass (slice 2 of 4): entries 109-216
- 0396c23 Trivia fact pass (slice 3 of 4): entries 217-324
- 540331e Trivia fact pass (slice 4 of 4): entries 325-432
- bd3f77b Trivia fact pass: named items (Wartburg pin, Titanic times)
- The commit adding this report and scripts/trivia-fact-pass/validate.mjs is the
  last one. Its hash is in git log on origin/main.
