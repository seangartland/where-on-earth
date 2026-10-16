# Trivia bank repair report (2026-10-16)

Scope: assets/trivia-bank.json, per Sean's 2026-10-16 ruling VERIFY AND RESTRICT.
Done directly by Claude Opus 5.5 in one session (no delegation). A previous run
had banked 376 photo verdicts in an uncommitted working file before it died;
this run audited them, kept them (with the corrections listed below), and
continued from photo #377. Nothing was deployed.

Baseline for every before/after comparison: commit 0ea2ca0 (the bank as it was
before this pass).

## Headline numbers

| | |
|---|---|
| Entries before / after | 1,303 / 1,303 (0 dropped) |
| Entries with an image | 1,282 |
| Distinct photos judged | 713 of 713 |
| Photos that show at least one of their entries' places | 432 |
| Entries flagged `"photo": "verified"` | **432** |
| Entries with a wrong photo (image kept, no flag) | 850 |
| Trivia playable pool (was 1,282) | **432** |
| Clues rewritten | 85 |
| Entries dropped | 0 |

## Phase 1: photo verdicts

### Method

One verdict per distinct image URL, recorded in docs/trivia-photo-verdicts.json
(fields: n, file, url, entries using it, verified entry or null, method, note).
Working files and scripts are in scripts/trivia-repair/:

- photo-list.mjs groups bank entries by image URL (713 groups).
- fetch-meta.mjs pulls each file's Wikimedia Commons (or en.wikipedia) metadata:
  description, object name, non-hidden categories, and GPS where present.
- worklist.mjs prints each photo with that metadata and, when the photo has GPS,
  the distance from the photo to each entry pin.
- verdicts.txt is the hand-written verdict per photo; verdicts-to-json.mjs turns
  it into the JSON record and, with --apply, adds the flag to the bank by a
  textual line insert (so number formats such as `125.0` and every other byte of
  the file stay untouched).

Each photo was judged in this order:

1. **Filename (F): 632 verdicts.** The filename named the subject outright
   (e.g. `Schloss_Neuschwanstein_2013.jpg`, `Hoover_Dam` on the Dhaka entry).
   Where the filename was clear, the Commons description and GPS were read as a
   cross-check only.
2. **Commons metadata (M): 73 verdicts.** The filename was opaque or ambiguous
   (ISS frame ids, Hangul/Japanese/Bengali names, `Rome_Stele.jpg`,
   `Efmo_View_from_Fire_Point.jpg`), so the verdict came from the Commons
   description and categories. This sits between the brief's two methods: it
   is not the filename, and it is not a visual judgment. It is reported
   separately so it is not mistaken for either.
3. **Visual (V): 8 verdicts.** Downloaded and looked at by me: #110 Funchal
   (marina from Quinta Vigia, old town not identifiable: wrong), #122 Cesky
   Krumlov (castle tower prominent: verified), #125 Cape Point lighthouse
   (verified), #187 Marsh supermarket logo (wrong), #210 a country road in Tolima
   (generic: wrong), #254 Gjirokaster town from the fortress wall (verified),
   #687 two-panel Hiroshima/Nagasaki clouds (no ground visible: wrong), #694 Old
   Trafford football ground (verified). I also looked at #686 (Dunkirk beach,
   1940) and #299 (the 23-entry Shanghai photo, which shows the Lujiazui
   skyline and so verifies Pudong only) to confirm filename verdicts. Those two
   are counted under F.

Rules applied: a photo verifies at most one entry, and only when it shows that
entry's place. Every other entry using it is wrong. Paintings, portraits, maps,
logos, adverts, museum pieces and generic scenes verify nobody (28 photos).
Large features (rivers, ranges, parks, deltas) verify when the photo shows the
feature, even if far from the pin (e.g. the Missouri photo is 1,895 km from the
pin, and the Rockies photo shows Mount Elbert).

### Results

- 713 photos judged: F 632, M 73, V 8.
- 432 photos verify exactly one entry; 281 verify nobody.
- Shared photos: 204 photos used by 773 entries. 117 of them verify one entry
  and the other 656 entries are wrong. The 23-entry Shanghai photo (#299,
  Lujiazui skyline) verifies `pudong-cn` only.
- Single-use photos: 509, of which 315 verify. The other 194 are mostly a long
  run of photos attached to unrelated cities (#548 to #685: Zurich on Lahore,
  Hoover Dam on Dhaka, the Eiffel Tower on Ichikawa, and so on).
- Entries flagged verified: **432**. Wrong-photo entries: 850. They keep their
  image field for the re-source pass.

### Sanity gates: verified entries per difficulty band

| Band | 1-2 | 3-4 | 5-6 | 7-8 | 9-10 |
|---|---|---|---|---|---|
| Verified entries | 159 | 63 | 116 | 62 | 32 |

Every band is populated, so the one-draw-per-band game works. The thinnest band
is 9-10 at 32 entries: with a 5-round draw that is enough for play, but players
will see repeats in the hardest round sooner than in the others.

### Corrections to the banked verdicts and data problems found

- **Gurudongmar Lake: marked wrong, entry data is garbled.** The photo is the
  real lake in Sikkim (photo GPS 28.03, 88.71), but the entry pin is
  32.24, 78.81 (Ladakh/Himachal, 1,060 km away) and its fact text describes Nanda
  Devi and "Ladakh's upper Bhagirathi valley". The photo does not show the place
  the entry scores against. Follow-up: fix or remove the entry.
- **Wartburg Castle: verified, pin 28 km off.** The photo is right. The pin
  (50.716, 10.352) is about 28 km south of the castle (50.966, 10.306).
  Follow-up: move the pin.
- **Titanic fact is wrong.** Its fact says the liner "struck an iceberg at
  2:40 a.m." Impact was about 11:40 p.m. and the sinking about 2:20 a.m. That
  time was not reused in the new clue. The photo (the ship leaving Southampton)
  is marked wrong because the pin is the wreck site.
- Event entries illustrated by paintings (Battle of Waterloo), museum casts
  (Leonidas for Thermopylae) or the wrong city (Valdivia damage for the offshore
  epicenter pin) are marked wrong.

## Phase 2: Trivia restricted to verified photos

Change (src/modes/trivia.js, one rule): an entry is playable only with an
integer difficulty 1 to 10, an image, and `photo === 'verified'`. Nothing else
in the mode changed: no localStorage key, no share text, no draw logic.

Trivia harness (shots/trivia/trivia-shot.mjs): its restated playable rule now
includes the flag, and a new check `targetsVerified` requires every drawn target
to carry the flag. Run with Playwright linked in from
~/workspace/map-game/shots/hub-landmarks/node_modules (the harness folder has no
install of its own).

- After phase 2: **28 of 28 checks pass** (the original 27 plus
  targetsVerified), playable 432. The hub row reads "432 clues", and after a
  game "432 clues · Best 3,171". The count follows the pool automatically.
  Drawn targets: lake-titicaca (d1), tikal (d4), shuri-castle (d6),
  mount-kinabalu (d7), alert-nunavut (d9).
- After phase 3 (clue text changed): **28 of 28 pass** again, playable 432, hub after a game "432 clues · Best 2,985". Drawn targets: mount-nemrut (d1), mount-st-helens-1980 (d4), cologne-cathedral (d5), dallol-hydrothermal-field (d7), dholavira-india (d9). Each round's clue matches the bank (clueMatches), so the rewritten clues are what the game shows. shots/trivia/harness-result.json and the five screenshots are from this run.

Full regression (scripts/regression.sh, all suites): **all 12 suites PASS on the first run, exit 0** (Passport/Daily, Survival hub tap-through, PvP H2H 1, 2, 3a, 3b, 4, 5 and 7, Open Challenge vs live worker, PvP layout measurements, Baseline screenshots). The known PvP flakes (3b, 4) did not fire, so nothing was rerun. The suite rewrote demo/shots/baseline/*.png, which were already modified in the working tree before this pass; they are not part of these commits.

## Phase 3: clue pass

### How clues were flagged

scripts/trivia-repair/clue-flags.mjs re-derives every class on the pre-repair
bank:

| Class | Orchestrator lead | Measured here |
|---|---|---|
| Compass + country/region ("southeastern Turkish city") | about 51 | 52, plus 11 in reversed order ("China's south coast", "New Zealand's far north") = **63** |
| Clue contains the answer's name | about 26 | 113 raw token hits, triaged to **28 real** (the rest are generic words such as "lake", "mosque", "cliffs") |
| Photo-deictic ("this stone bridge") | about 4 | **2** (Bastei Bridge, Kuelap) |
| Bare stubs under 45 chars | about 7 | **7** |
| Coordinate pairs shared by 2+ entries | 3 | 1 exact (Danakil/Dallol), 2 more within 0.01 degrees |
| Missing difficulty | 21 | **21** |

### Decisions and tallies

Every flagged clue has a decision with a reason in
docs/trivia-clue-decisions.json. scripts/trivia-repair/clue-decisions.mjs holds
the edits as substring replacements on the original clue, so untouched text
(including curly apostrophes) survives. scripts/trivia-repair/apply-clues.mjs
applies them and can be rerun (it detects edits already applied).

| Class | REWRITE | KEEP | DROP |
|---|---|---|---|
| Compass + country/region (63) | 57 | 6 | 0 |
| Names its own answer (113 hits + Anshan from the mode report) | 28 | 86 | 0 |
| Photo-deictic (2) | 2 | 0 | 0 |
| Stub under 45 chars (7) | 1 (Titanic) | 6 | 0 |
| Em dash (found in the sample review) | 1 | 0 | 0 |

85 distinct clues were rewritten. Some rewrites cover two classes (e.g. Kaduna
and Adana are compass and own-name; Kuelap is compass and deictic).

Rewrite rules followed: cut the giveaway; keep the identifying facts and the
question form; the clue must still point at one place; zero em dashes. New
wording draws on the entry's own clue and fact fields. Three rewrites add one
general-reference fact each, noted in the record: the Danube is Europe's
second-longest river; the A in Sao Paulo's ABC region is Santo Andre; the
Titanic was on its maiden voyage. Where the compass word was cut but the
remaining facts needed a country to stay unique, the country stayed (Harbin
"Chinese city", Lake Como "Italian lake").

KEEP reasons, compass class: Cali ("western Andes" is the Cordillera Occidental
range), Bamako ("western Sahel" is a multi-country region and the only fact
separating it from Niamey on the Niger), and four river-bank phrases (Ichikawa,
Donghe, Bhatpara, Kalaban-Koro: "the Edo River's east bank" is a bank, not a
region of a country). Own-name keeps (86): 59 generic-word hits, 21 with
individual reasons (e.g. Tiger's Nest names the Paro valley it overlooks; event
clues name the event's subject, Gandhi or the Hindenburg, not the place), and 6
generic hits on clues already rewritten for their compass phrase (e.g. "Gard"
inside "Gardon" for Pont du Gard). Stub keeps: the
six are short but complete questions with one answer ("Where was Custer's Last
Stand?"). Brevity is not a giveaway.

The four playable clues the mode report said contain their answer:
- **Anshan: KEEP.** A false positive. "anshan" matches inside "Qianshan" (a
  mountain); the clue never names the city.
- **Daqing, Titanic, Battle of Waterloo: REWRITE** (below).

### Before and after examples

| Entry | Before | After |
|---|---|---|
| gaziantep-tr | Which southeastern Turkish city is renowned for pistachios, copperware, baklava, and the Roman mosaics of Zeugma? | Which city is renowned for pistachios, copperware, baklava, and the Roman mosaics of Zeugma? |
| harbin-cn | Which northern Chinese city turns winter ice into illuminated palaces and retains onion-domed Russian architecture? | Which Chinese city turns winter ice into illuminated palaces and retains onion-domed Russian architecture? |
| macau | Which former Portuguese enclave on China's south coast now earns more from casinos than Las Vegas? | Which former Portuguese enclave now earns more from casinos than Las Vegas? |
| bay-of-islands | Which bay in New Zealand's far north, dotted with over 140 islands, is where the Treaty of Waitangi was signed? | Which bay, dotted with over 140 islands, is where the Treaty of Waitangi was signed? |
| black-forest | Which wooded mountain region in southwest Germany gave its name to cuckoo clocks and a cherry cake? | Which wooded mountain region gave its name to cuckoo clocks and a cherry cake? |
| daqing-cn | Which city amid Daqing's oil derricks became synonymous with China's largest petroleum field and the model worker Wang Jinxi? | Which city of oil derricks became synonymous with China's largest petroleum field and the model worker Wang Jinxi? |
| titanic-sinking | Where did the Titanic sink in 1912? | Where did a liner on its maiden voyage strike an iceberg and sink in 1912? |
| battle-of-waterloo | Where was the Battle of Waterloo fought in 1815? | Where did Napoleon fight his last battle, in 1815? |
| new-taipei-city-tw | Which municipality wraps around Taipei and includes Jiufen's hillside lanes, Tamsui's waterfront, and Yehliu's rock formations? | Which municipality includes Jiufen's hillside lanes, Tamsui's waterfront, and Yehliu's rock formations? |
| managua-ni | Which capital stretches between Lake Managua and the Tiscapa... (truncated in the bank) | Which capital on the shore of Lake Xolotlan was rebuilt after a devastating 1972 earthquake? |
| bastei-bridge-germany | Where does this stone bridge thread through the sandstone pinnacles of Saxon Switzerland above the Elbe River? | Where does a stone bridge thread through the sandstone pinnacles of Saxon Switzerland above the Elbe River? |
| kuelap-fortress-peru | Where is this mountaintop walled settlement built by the Chachapoya people in the northern Andes? | Where is the mountaintop walled settlement built by the Chachapoya people? |

(Accents and curly apostrophes are exact in the bank. This table writes a few
of them plainly.)

### Drop list

**None.** Every flagged clue could be fixed in place from facts already in the
entry, so no entry was dropped. scripts/trivia-repair/clue-decisions.mjs has an
empty `drops` array, and the validator proves no entry disappeared.

### Shared coordinates (duplicates check)

- danakil-depression and dallol-hydrothermal-field share 14.2417, 40.3 exactly.
  They are not duplicates (Dallol is a hydrothermal field inside the Danakil
  Depression), but the depression's pin sits on Dallol. Both are verified and
  both are in band 7-8, so one game cannot draw both. Follow-up: move the
  Danakil pin toward the depression's centre if the near-identical answers
  bother anyone.
- hagia-sophia / topkapi-palace (about 600 m apart, bands 1-2 and 5-6) and
  triangle-shirtwaist-fire / stonewall-uprising (about 700 m apart, bands 5-6
  and 3-4) are distinct places that can appear in the same game. Not
  duplicates; nothing changed.

### Missing difficulty (21 ids, not invented)

rila-monastery-bulgaria, dalian-cn, taiyuan-cn, zibo-cn, kanpur-in, nagoya-jp,
kaduna-ng, adana-tr, patna-in, changde-cn, agra-in, managua-ni, osasco-br,
santo-andre-br, soshanguve-za, calumbo-ao, tshikapa-cd, zapopan-mx,
bay-of-islands, panama-city, niagara-on-the-lake.

These are exactly the 21 entries with no image, so they were never playable.
Most of them carried the own-name clues fixed above.

## Sample review: new patterns

110 unflagged clues were read (scripts/trivia-repair/sample-unflagged.mjs, a
fixed seed: 60 from the playable pool, 50 from the rest). For the 60 playable
ones I also read the fact field, because it is shown at the reveal.

1. **False or fabricated fact text: the biggest finding, and it affects the
   playable pool.** 10 of the 60 sampled playable facts are clearly wrong, and
   3 more are dubious (about 17 to 22 percent). Examples:
   - Malbork: "was dismantled and ferried across Poland" (it never was). Its
     clue repeats this: "the largest castle in the world taken apart brick by
     brick and rebuilt 250 kilometres away".
   - Anne Frank House: "Fritz Frank and Gies Huber abandoned papers before they
     were deported in 1942" (wrong names; arrest in 1944).
   - Polonnaruwa: "its elephants still step out of their own shadows".
   - Kharkhorin: "abandoned after one summer of use"; Pingyao: the
     Rishengchang bank "operated there for over 400 years"; Tikal: Temple IV
     "the tallest Maya structure ever built"; Bagan: "10,000 donor inscriptions
     carved into sandalwood slabs"; Yosemite: "the first Yosemite National Park
     in the world"; Hohensalzburg: "finished in 1077" plus a garbled bell
     legend; Mohenjo-daro: "a thousand years of traffic found no need for
     repairs".
   - Dubious: Amber Fort's garden claim, Trolltunga's formation story, the
     Chernobyl shelter tonnage and timing.

   **Recommendation: fact-check the 432 playable entries' fact fields (and the
   Malbork and Kharkhorin clues) before Trivia ships.** At this rate roughly 70
   to 95 playable reveals show a false statement. This is outside this pass's
   clue-only scope, so nothing was changed.
2. **Relative-compass giveaways ("north of Dhaka", "west of Tehran"): 33 clues,
   4 playable** (three-sisters-blue-mountains, napa-valley-ava,
   palace-of-fontainebleau, daintree-rainforest). This is the same kind of
   location giveaway as the compass+country class, but anchored on a city.
   Examples: Gazipur "Which industrial city north of Dhaka...", Laval "Which
   island city north of Montreal...", Karaj "...just west of Tehran?".
   **Recommendation: fix with the same rules once Sean approves extending the
   rewrite to this class.** Full list in docs/trivia-clue-decisions.json under
   relativeCompassFollowUp.
3. **Bare compass words with no named region ("Which northern plateau city",
   "the country's southwest"):** 5 of 110 sampled (Gwangju, Fushun,
   Rostov-on-Don, Nampula, Tirunelveli), so roughly 50 to 60 bank-wide. A broad
   regex finds 116 candidates (17 playable), but it also hits proper names such
   as "North Atlantic" and "South Island". Weaker than a named region.
   Recommendation: low-priority follow-up.
4. **Clues that do not single out one place:** 4 of 110 sampled, all playable.
   Hagia Sophia: "a building that has served as both a cathedral and a mosque";
   Piton de la Fournaise: "the active volcano on an island in the Indian
   Ocean"; Quilmes and Larnach Castle, which are generic descriptions. Some
   location-only clues for obscure towns (Moreno, Nowrangapur, Duping) were
   never unique even before their compass phrase was cut. Recommendation:
   sharpen the playable ones from their fact fields, after the fact-check.
5. **Name hints the scanner misses:** 3 of 110 (Rostov-on-Don "Don Cossack
   lands", Ceska Trebova "the Trebovka River", Ojo de Agua "takes its name
   ('spring')"). Recommendation: low priority; none are playable.
6. **Not in question form:** 2 clues start with "Find the..." (Dalian,
   Taiyuan). Neither is playable (no difficulty, no image).
7. One em dash in the bank (Ojo de Agua). Fixed (punctuation only), and counted
   in the tallies above.

## Validation

scripts/validate-trivia-repair.mjs compares the bank with commit 0ea2ca0 and
with both decision records. It checks: only the drop list may disappear and no
id may appear; on kept entries only `clue` may change and only
`photo: "verified"` may be added; every clue change matches a REWRITE decision
exactly; the flags equal the phase 1 verdicts and each verdict's entry really
uses that photo; no em dash in the bank. A mutation test (moving Mount Fuji's
latitude by 0.0001) made it fail with "mount-fuji: lat changed", and restoring
the file made it pass again.

Output:

```
base 0ea2ca0: entries before 1303, after 1303, dropped 0 (none)
before = kept + dropped: 1303 = 1303 + 0
photos judged 713 (filename 632, Commons metadata 73, visual 8); photos that verify an entry 432
entries flagged photo=verified 432; per band {"1-2":159,"3-4":63,"5-6":116,"7-8":62,"9-10":32}; playable 432
clues changed 85 (REWRITE decisions 85); other field changes on kept entries: 0
PASS: all checks
```

## Follow-ups (not done here)

1. Fact-check the playable fact fields (finding 1). This should happen before
   Trivia ships.
2. Re-source photos for the 850 wrong-photo entries. Each keeps its image
   field, and docs/trivia-photo-verdicts.json names what each wrong photo
   actually shows.
3. Relative-compass clue class (33), pending Sean's go-ahead.
4. Gurudongmar entry (garbled pin and fact); Wartburg pin (28 km off); Titanic
   fact time.
5. Difficulty for the 21 entries that lack it (they also lack images).

## Commits

All on origin/main, oldest first:

- 91e4720 Trivia bank repair (phase 1, part 1): photo verdict worklist and first 369 verdicts
- f94b39f Trivia bank repair (phase 1, part 2): all 713 photo verdicts
- dd71a00 Trivia bank repair (phase 1, part 3): flag 432 entries photo=verified
- d56df91 Trivia bank repair (phase 2): Trivia plays only photo-verified entries
- e68a969 Trivia bank repair (phase 3): clue pass, 85 rewrites, 0 drops
- 975dbf5 Trivia bank repair: harness rerun on the phase 3 bank (28 of 28), em dash escapes in scripts
- (this report) Trivia bank repair: report
