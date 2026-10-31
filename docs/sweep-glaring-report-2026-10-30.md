# Sweep additions report, 2026-10-30

The GLARING tier of docs/scan1-completeness-report-2026-10-30.md, approved
whole by Sean 2026-10-30 and executed per
`.build-tmp/sweep-glaring-brief.md` in the `woe-sweep` worktree. Not
committed, not pushed, not deployed.

## Outcome

- **6 of the 7 added.** Four Landmarks points (Willis Tower, The Clock
  Towers, Merdeka 118, Lake Pontchartrain Causeway) and two Landforms
  points (Annapurna, Nanga Parbat).
- **1 held at the coverage gate: the Rio Grande** (see below). No bank
  entry, no extents record, no derive id, exactly the Thames/Parana/
  Murray treatment.
- Bank 426 → **432**. Pools measured with the game's own helpers
  (`src/meta/pack-store.js`, via the test suite): **Capitals 207
  (unchanged), Landmarks 214 → 218, Landforms 171 → 173, combined
  592 → 598.**
- Suite: **83/83** (`node --test test/*.test.mjs`).
- The extents sidecar is untouched by this chunk (the only
  make-extents.mjs change is a comment recording the Rio Grande hold),
  and the script's output was verified byte-identical (sha256
  da6d0ceb...) three times: after restoring the lost extent sources,
  before any edit, and after the comment edit. Foundation first, on the
  chunk-7 pattern: the NE centerlines file, the RESOLVE Ecoregions 2017
  extract (rebuilt from the official zip via
  build/extract-sahara-ecoregions.py), the GBRMPA boundary and the eight
  diffuse-conversion OSM polygons were restored from the sources named
  in the script header, and the unmodified script reproduced the
  committed sidecar byte-for-byte before anything else ran.

## Held: Rio Grande, 2,426 km assembled = 79.3 percent of 3,057 km

NE carries the Rio Grande as ten segments under its own name, and the
assembly uses every one of them, source to mouth, lake centerlines
through Elephant Butte/Caballo, Amistad and Falcon included: the
assembled stem is 2,426 km against the 3,057 km conventional length
(the completeness scan's list figure). The diagnostic is clean: the
total length of all NE segments named "Rio Grande" is exactly the
assembled 2,426 km, and no segment under any other name touches the
river's corridor, so no assembly choice recovers the missing 631 km.
It is the 1:10m generalization of one of the most meandering courses in
North America (the Big Bend and the lower valley), the same failure
mode as the Thames (77%), Parana (66%) and Murray (59%). It fails the
frozen 80 percent gate and is held. The simplified line itself was
fine (174 vertices, deviation 1.653 km). Its fame is measured and real
(pipeline mean 799.8, median 793.8 views/day; the scan published
974.9 on its own variant of the method); the geometry source is what
is missing. The hold is recorded in the make-extents.mjs assembly
comment alongside the Thames note.

## Why the Causeway is a point

The brief asked for a stated judgment, not a silent point. The frozen
extent pipeline builds lines from one source only, Natural Earth 1:10m
river and lake centerlines, and its gates (80 percent of a conventional
length, 2.5 km deviation) are defined against that source. NE's bridges
data is not in the pipeline and has no gate precedent; a two-span line
drawn from a new source would be a new geometry path invented for one
card. The honest in-system handling is the point: the entry's Wikidata
P625 (30.1997, -90.1228) sits on the bridge itself mid-lake, the pin
audit's reverse geocode of the stored pin literally returns "Crossover
#4, Saint Tammany Parish", and a tap anywhere on the 38.4 km crossing
lands within about 19 km of the pin. If a bridges extent path is ever
built, this is its first candidate; it is not built here.

## Points: measurement, coordinates, pin audit

Coordinates are the article QID's Wikidata P625, resolved
programmatically (enwiki pageprops `wikibase_item`, then wbgetentities),
rounded to 4 dp in bank style. Pageviews are the feature article's
Wikimedia REST figures for 2025-10 to 2026-09 (mean = total/365, median
= median monthly daily rate), the pipeline method used for scoring; the
scan's published medians are quoted for the ruling record. The two
series differ for this scan (its variant of the method was not
reproducible from its write-up; the audit-2 figures reproduced exactly
under the pipeline method in chunks 6-7, so the pipeline series governs
scoring and both are stated).

| id | article (QID) | scan median | pipeline mean / median | P625 pin |
|---|---|---|---|---|
| willis-tower | Willis Tower (Q29294) | 1,843.8 | 1,693.3 / 1,573.2 | 41.8786, -87.6358 |
| the-clock-towers | The Clock Towers (Q189476) | 1,684.8 | 990.0 / 1,044.4 | 21.4189, 39.8264 |
| merdeka-118 | Merdeka 118 (Q7969454) | 1,521.5 | 1,411.2 / 1,342.1 | 3.1417, 101.7007 |
| lake-pontchartrain-causeway | Lake Pontchartrain Causeway (Q1132510) | 1,181.3 | 964.3 / 1,042.1 | 30.1997, -90.1228 |
| annapurna | Annapurna (Q16466024) | 1,051.5 | 879.6 / 798.7 | 28.5958, 83.8200 |
| nanga-parbat | Nanga Parbat (Q130736) | 953.6 | 824.1 / 764.5 | 35.2392, 74.5900 |

Notes on three resolutions:
- **Clock Towers:** the enwiki article is now titled "The Clock Towers"
  ("Abraj Al Bait" redirects to it); the card takes the article's title
  as its short name, with Abraj Al Bait named in the fact. Pageviews
  were scored on the canonical title only; the redirect title draws its
  own traffic (merged median 1,176.8), noted but not summed, the
  pipeline's one-article-one-title rule.
- **Merdeka 118:** "Merdeka 118" now redirects to a 2026 rename
  ("Merdeka Maybank"), but the pageviews record for the window sits
  entirely under "Merdeka 118" (the new title returns no in-window
  data), so the measurement is the window's real series; the card keeps
  the name Sean approved.
- **Annapurna:** fame is measured on the canonical "Annapurna" article
  (the massif article; the scan's rename-split warning), and the pin is
  Annapurna I's summit. The article's own item Q16466024 is labeled
  "Annapurna I" on Wikidata and its P625 (28.5958, 83.8200) agrees to
  about 100 m with the range item Q159621's P625 and with the article's
  displayed coordinates; the Q16466024 value is stored verbatim.

Pin audit: `scripts/pin-audit.py --locations
assets/locations-landmarks-sol.json --ids <the 6 ids> --reverse`.
Final result: **GATE 0 flagged, all six risk class D.** Five pins passed
on the first run. Annapurna was flagged once, and the flag was the
audit's own resolver error: its name lookup resolved "Annapurna" to
Q4767995, a same-named village development committee in Bhojpur
District (P625 27.21, 86.96, 344.9 km away). The resolver cache
(`scripts/pin-audit-cache.json`, the audit's own correction path) was
set to the article's item Q16466024 and the re-run passes with the
stored pin exactly on the reference. Reverse geocodes land on the
subjects: Willis Tower at 233 South Wacker Drive; the Clock Towers in
Ajyad, Makkah; Merdeka 118 on Jalan Merdeka, Kuala Lumpur; the Causeway
at "Crossover #4, Saint Tammany Parish"; Annapurna in Annapurna,
Myagdi; Nanga Parbat in Astore District, Gilgit-Baltistan. Proximity
notes (report-only under the 25 km rule): the Clock Towers pin sits
0.4 km from the existing mecca-kaaba-saudi entry, intended (the complex
stands over the Grand Mosque; distinct subjects, the St Mark's
precedent); Merdeka 118 is 2.2 km from petronas-towers, intended
distinct towers; the quarantined Annapurna Base Camp entry (not in any
pool) sits 9.3 km from the new summit pin, a distinct subject.

## Difficulty (frozen adapted v2, spike check applied)

The same reimplementation of the frozen `score_v2.py` math used in
chunks 1-7 (GeoNames cities15000 population centres, frozen cuts).
Fidelity cross-check before scoring: the reimplementation reproduces
the stored fb/iso exactly for all eight reference pins tested (the six
chunk-6 landmarks: Statue of Liberty fb1676/iso18, American Museum of
Natural History fb1682/iso16, Lincoln Memorial fb1425/iso201, Eiffel
Tower fb179/iso266, Sydney Opera House fb568/iso715, Hagia Sophia
fb310/iso91; plus chunk 7's Mount Sinai fb303/iso314 and Kangchenjunga
fb338/iso244). K = 0 for all five countries here. **No entry's mean and
median bands disagreed, so no spike rescores.**

| id | difficulty | difficultyWhy |
|---|---|---|
| willis-tower | 5 | `p.90·fb606·K0·iso702 → 16.3 → 5` |
| the-clock-towers | 5 | `p.78·fb419·K0·iso67 → 23.5 → 5` |
| merdeka-118 | 3 | `p.86·fb185·K0·iso293 → 9.0 → 3` |
| lake-pontchartrain-causeway | 7 | `p.78·fb1005·K0·iso507 → 53.0 → 7` |
| annapurna | 4 | `p.76·fb136·K0·iso178 → 10.9 → 4` |
| nanga-parbat | 6 | `p.74·fb628·K0·iso130 → 39.4 → 6` |

## Dedupe

Zero hits on id and diacritics-stripped normalized short name for all
seven candidates (including the held Rio Grande, and including "Sears
Tower" for Willis) across cities (804), bank (426 before this chunk)
and quarantine (202). The one substring near-match, the quarantined
anapurna-base-camp-nepal, is a distinct subject and stays quarantined.

## Derive regeneration

`src/meta/pack-landforms.js` regenerated by derive.py, diff exactly
+2 / -0 (annapurna, nanga-parbat, both listed explicitly in
CURATED_ADDITION_IDS on the chunk precedent; regeneration is idempotent
on re-run). One pattern trap caught and excluded on the chunk-3/7
precedent: 'Lake Pontchartrain Causeway' trips the derive name pattern
on "lake" and was added to EXCLUSIONS in derive.py so it stays a
Landmark; the regenerated set confirms it is not a member.

## Photos

One real photograph per entry; finalists surveyed on Commons with
license and author from file-page extmetadata, viewed on labeled
contact sheets, and every pick re-viewed as a center square crop (the
game's crop). All six stored URLs re-verified HEAD 200 image/jpeg and
unique across both datasets by URL and by Commons file name; none is
its article's page image (the page images: Willis, a 2024 Flickr shot
of the tower from Wacker Drive; Clock Towers, "Abraj Al Bait Tower
2017.jpg"; Merdeka 118, the article carries no page image; Causeway,
the formulanone aerial, whose own alternative candidate was also
rejected for an airplane wing in frame; Annapurna, PrajwalMohan's
"South Face of Annapurna I (Main).jpg"; Nanga Parbat,
"Fairy_Meadows_and_the_view_of_Nanga_Parbat.jpg", and the PD NASA
orbital view was rejected as a top-down terrain image, not a
photograph of the mountain as a subject). Rejected on sight: the
Willis Tower atrium/entrance shot, night panoramas where the Clock
Towers shrinks to the frame edge, the Merdeka shot where a foreground
building hides all but the spire, and the 2019 Merdeka construction
photos. Stored URLs are the clean 500px `thumb.wikimedia.org` form.
Local copies in `.batch-sweep/<id>-final.jpg`.

| id | file | license | author |
|---|---|---|---|
| willis-tower | Willis Tower, Chicago September 2016-26.jpg | CC BY-SA 4.0 | Alvesgaspar |
| the-clock-towers | Makkah clock tower with Abraj Al Bait Towers.jpg | CC0 | jakman1 |
| merdeka-118 | Merdeka Tower 20241022 - full 2.jpg | CC0 | Ahmad Ali Karim |
| lake-pontchartrain-causeway | Lake Pontchartrain Causeway.jpg | CC BY 2.0 | Glenn from Houston, USA |
| annapurna | ABC - South face of Annapurna I from Annapurna Base Camp, Nepal, 2016.jpg | CC BY-SA 4.0 | Josep M. Gracia |
| nanga-parbat | Nanga Parbat The Killer Mountain.jpg | CC BY-SA 3.0 | Tahsin Anwar Ali |

Sets: towers and the bridge carry `[]`, the bank's practice for its
towers and bridges (Taipei 101, Burj Khalifa's set is regional, Golden
Gate and Brooklyn Bridge carry none). Annapurna and Nanga Parbat carry
`["Himalaya", "Mountains"]`, the Everest/K2/Kangchenjunga precedent.
Clues follow the landmarks convention ("Name, Country", no US state).

## Facts (verbatim, as stored)

### willis-tower

clue: Willis Tower, United States 🇺🇸

Renamed for the Willis Group in 2009, the tower went up as the Sears Tower and, from its completion in 1973 to 1998, was the tallest building in the world. Its black frame is nine square tubes of different heights bundled together, which is why its top steps down in tiers instead of ending in a single flat roof.

### the-clock-towers

clue: The Clock Towers, Saudi Arabia 🇸🇦

The Abraj Al Bait complex rises over the Grand Mosque of Mecca, its hotel clock tower crowned by a golden crescent. Its clock face is 43 metres across, more than six times the diameter of Big Ben's dial, and is lit by two million LEDs so it can be read from kilometres away.

### merdeka-118

clue: Merdeka 118, Malaysia 🇲🇾

Its diamond-faceted spire carries the building to 678.9 metres, second only to the Burj Khalifa among the world's buildings. The name means independence: beside it stands Stadium Merdeka, where Malaya's independence was proclaimed in 1957.

### lake-pontchartrain-causeway

clue: Lake Pontchartrain Causeway, United States 🇺🇸

Two parallel spans run 38.4 km across Lake Pontchartrain, and from the middle of the crossing no land is visible in any direction. The first span, opened in 1956, was the longest bridge in the world; a second, opened in 1969, runs beside it the whole way, with seven crossover bridges linking the two.

### annapurna

clue: Annapurna, Nepal 🇳🇵

In 1950 Maurice Herzog and Louis Lachenal reached its summit in the first ascent of any eight-thousander, three years before Everest, and lost toes to frostbite on the descent. The peak they climbed is the high point of a massif whose south face rises about 3,000 metres above the Annapurna Sanctuary.

### nanga-parbat

clue: Nanga Parbat, Pakistan 🇵🇰

Its Rupal Face climbs some 4,600 metres in a single sweep, the largest mountain face on Earth. The peak had already killed 31 climbers before Hermann Buhl's first ascent in 1953, made solo and without bottled oxygen above 7,000 metres, which is how it earned the name Killer Mountain.

## Test and manifest changes

1. `test/pack-pools.test.mjs`: PACK_LANDFORM_IDS size 171 → 173 (test
   title updated to match); landmark pool size 214 → 218.
2. `test/passport-packs.test.mjs`: section totals [207, 214, 171] →
   [207, 218, 173]; combined total 592 → 598.
3. No extent-manifest change: no new extent shipped, and the
   extent-aware scoring assertions pass with the sidecar untouched.

The validator (`scripts/validate-landmarks.mjs`) reports the same 21
pre-existing problems before and after this chunk; its problem list is
byte-identical to the pristine branch tree (only the header entry
counts move, 426 → 432). This chunk adds no new validator failures.

## Files changed

- `assets/locations-landmarks-sol.json`: +6 entries (432 total),
  insertions only.
- `scripts/pack-landforms/derive.py`: 'annapurna' and 'nanga-parbat' in
  CURATED_ADDITION_IDS (with the Rio Grande hold noted); 'Lake
  Pontchartrain Causeway' in EXCLUSIONS.
- `src/meta/pack-landforms.js`: regenerated by derive.py, +2 / -0.
- `build/make-extents.mjs`: comment only, the Rio Grande hold recorded
  beside the Thames note; output byte-identical.
- `scripts/pin-audit-cache.json`: the audit's own run cache, including
  the corrected qid:annapurna resolution.
- `test/pack-pools.test.mjs`, `test/passport-packs.test.mjs`: the count
  assertions above.
