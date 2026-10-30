# Rivers additions report, 2026-10-30

Chunk 4 of the pack additions program, executed per `.build-tmp/rivers-brief.md` in the
`woe-adds-rivers` worktree at f275c2b. Not committed, not pushed, not deployed.

## Outcome

- **19 rivers added** as whole-river extent cards (bank kind `extent`, extentType `line`,
  sets `["Great Rivers"]`), each with a main-stem line in `assets/extents.json`.
- **2 rivers held** (Paraná, Murray) at the Natural Earth coverage gate. No bank entry,
  no extents record, no Landforms id for either.
- Bank 436 → **455**. Pools measured with the game's own helpers
  (`packPool` / `landmarkPackPool` / `landformPackPool` from `src/meta/pack-store.js`):
  **Capitals 207, Landmarks 249 (unchanged), Landforms 187 → 206, combined 662.**
  (The brief's 208 target assumed all 21 rivers ship; two held, so 206.)
- Suite: **83/83** (`node --test test/*.test.mjs`). Two test files changed, both
  hardcoded pool counts only, flagged in the test-changes section below.
- The sidecar regenerates byte-for-byte: `assets/extents.json` is 424,206 bytes,
  sha256 `8be73c991b5987914871aa0e5e2f0187d9d6fd517bec0a9c7f012aac9e8428b4`, identical
  across two consecutive runs of the extended `build/make-extents.mjs`. The three
  pre-existing records (great-barrier-reef, grand-canyon, sahara) are byte-identical
  to the committed file, verified by JSON round-trip comparison per record.

## Geometry method

`build/make-extents.mjs` was extended with a whole-river block that runs before the
existing records are assembled. For each river it loads Natural Earth 1:10m river and
lake centerlines (`build/extent-sources/ne_10m_rivers_lake_centerlines.geojson`,
public domain, downloaded from the official NE vector mirror), collects the segments
carrying the river's name set, welds endpoints within 0.05 degrees into a graph, takes
the Dijkstra path between the graph nodes nearest the river's source and mouth seeds,
and stitches the segments in path order. The assembled line is simplified with the
file's existing simplifier at the same 0.015 degree tolerance as the Reef and Sahara,
quantized to 4 decimal places, and its deviation from the assembled line is measured
with the file's existing deviation function. A build-time gate throws if coverage
falls under 80 percent of the conventional length or deviation exceeds 2.5 km.

Assembly rules, applied uniformly:

- The shipped stem is the longest continuous course NE supports, following the
  headline length's own routing. Source branches the conventional figure measures
  through are included (Kagera for the Nile, Ucayali for the Amazon, Irtysh for
  Ob-Irtysh); tributaries it does not measure through stay out (Missouri, Darling,
  Paraguay; see the Paraná hold).
- Reaches of the same river that NE carries under local names are included:
  Lualaba (Congo), Lancang (Mekong), Jinsha / Chang Jiang / Tongtian (Yangtze),
  Donau (Danube), Heilong Jiang (Amur), Ertis / Ertix (Irtysh), the White Nile
  reach names Bahr el Jebel / Albert Nile / Victoria Nile plus Kagera (Nile).
- Gaps are never bridged. Two estuary disclosures result; see below.

One foundation repair was needed first: the chunk-3 Sahara extraction script and its
intermediate GeoJSON were lost with the removed chunk-3 worktree, so the committed
make-extents.mjs could no longer run at all. I recreated `build/extract-sahara-ecoregions.py`
(RESOLVE Ecoregions 2017, ECO_ID 822/842/845 in shapefile record order) and proved the
foundation before touching anything else: the unmodified script regenerated the
committed `assets/extents.json` byte-identical (Sahara record 20,754 bytes, 1,162
vertices, deviation 1.665 km).

### Disclosures

- **Yangtze estuary gap.** The named Yangtze line ends at Zhenjiang (119.61, 32.20).
  An unnamed 131 km estuary segment exists about 150 km downstream but is disconnected
  in NE; it was NOT bridged. Shanghai therefore scores about 230 km off the shipped
  line. Coverage is 80.3 percent without it, so the river ships with the gap disclosed.
- **Amazon estuary.** The NE centerline ends at Gurupá (-52.71, -1.58); the estuary
  channels around Marajó are not drawn as centerlines. The shipped line ends there.
- **Yukon unnamed segments.** Three unnamed segments sharing the Yukon's dissolve id
  (648), including a 156 km lake centerline above Whitehorse, are included to keep the
  stem continuous (156 km of the 2,727 km total). Without them coverage would be
  80.6 percent, still over the gate; including them gives 85.5 percent and the true
  continuous course. A judgment call, documented here.
- **Indus stitch jump.** The largest single stitch jump in any assembly is 6.73 km,
  in the Himalayan reach where NE's Indus segments nearly meet. It is a weld of two
  genuine Indus segments, not a bridge across a gap in the river's course.
- **Ob-Irtysh routing.** The system's stem follows the Irtysh from its Altai source
  to the Khanty-Mansiysk confluence, then the lower Ob to the Gulf of Ob. The Ob's
  own upper course (about 2,395 km of named NE segments through Novosibirsk and
  Barnaul) is correctly NOT on the line; the 5,410 km conventional figure measures
  the system up the Irtysh.

## Held rivers

- **parana-river: HELD, 3,238 km assembled = 66.4 percent of 4,880 km.** The stem
  assembles cleanly from the Paranaíba headstream (671 km) through the Itaipú reach
  (joined by a 167 km segment NE classes as a Paraná lake centerline, no gap) to the
  Río de la Plata. The shortfall is a data trap: NE carries a 2,187 km segment named
  'Paraná' running from (-55.08, -14.32) south to the Corrientes confluence
  (-58.60, -27.32). That course is geographically the **Paraguay River**, a tributary
  that merely shares the name in NE's data. Including it would have put Asunción on
  the "Paraná" line and drawn a tributary as the main stem. Excluded on principle;
  without it NE cannot support 80 percent of the Paraná's conventional length.
- **murray-river: HELD, 1,485 km assembled = 59.2 percent of 2,508 km.** All six NE
  'Murray' segments form a single component from (148.00, -36.97) to the mouth at
  (139.36, -35.38), but NE's 1:10m generalization collapses the Murray's meanders so
  heavily that the drawn course measures barely three-fifths of the real river. The
  Darling (2,150 km of NE segments) is a tributary and stays out by the same rule as
  the Missouri. NE cannot support this river at this scale.

## Per-river table

Difficulty is the adapted v2 score (distances measured to the shipped line, the
chunk-3 adaptation); pageviews are the river article's Wikimedia REST figures for
2025-10 to 2026-09, mean = total/365, median = median monthly daily rate. One spike
rescore: Danube (mean band 1, median band 2, median adopted). Scorer QA ran the
shipped `scoringDistanceKm` with the shipped sidecar: for every river a point on the
line scores 0, the anchor scores 0, and the named off-river city scores the distance
shown.

| id | length vs conventional | verts | dev (km) | anchor reach | difficulty (mean/med views per day) | QA city |
|---|---|---|---|---|---|---|
| nile-river | 6,066 / 6,650 (91.2%) | 430 | 1.643 | Aswan, First Cataract reach | 1 (2130.0 / 1971.2) | Port Sudan 345 km |
| amazon-river | 5,245 / 6,400 (82.0%) | 385 | 1.667 | Manaus, Meeting of Waters | 7 (1316.7 / 1313.9) | Boa Vista 663 km |
| yangtze-river | 5,060 / 6,300 (80.3%) | 423 | 1.668 | Qutang Gorge, Three Gorges | 4 (895.8 / 877.4) | Chengdu 215 km |
| mississippi-river | 3,311 / 3,730 (88.8%) | 274 | 1.655 | Memphis riverfront | 2 (1910.9 / 1924.2) | Chicago 208 km |
| congo-river | 3,818 / 4,700 (81.2%) | 227 | 1.673 | Malebo Pool, Kinshasa-Brazzaville | 6 (782.5 / 722.1) | Lubumbashi 134 km |
| ganges-river | 2,352 / 2,525 (93.1%) | 201 | 1.661 | Varanasi ghats | 5 (1362.3 / 1335.1) | Kathmandu 222 km |
| danube-river | 2,564 / 2,850 (90.0%) | 206 | 1.650 | Budapest reach | 2, spike rescore (2429.5 / 2158.3) | Prague 175 km |
| yenisei-river | 3,495 / 3,487 (100.2%) | 254 | 1.650 | Krasnoyarsk reach | 10 (164.8 / 157.5) | Novosibirsk 513 km |
| yellow-river | 4,807 / 5,464 (88.0%) | 406 | 1.664 | Hukou Waterfall | 5 (811.4 / 796.7) | Xi'an 125 km |
| amur-river | 2,605 / 2,824 (92.2%) | 215 | 1.663 | Khabarovsk reach | 10 (284.3 / 264.4) | Harbin 399 km |
| mekong-river | 4,002 / 4,350 (92.0%) | 301 | 1.658 | Luang Prabang reach | 4 (563.7 / 551.4) | Hanoi 358 km |
| mackenzie-river | 1,829 / 1,738 (105.2%) | 125 | 1.643 | Fort Simpson reach | 10 (312.9 / 297.0) | Yellowknife 120 km |
| lena-river | 3,946 / 4,294 (91.9%) | 234 | 1.649 | Lena Pillars reach | 10 (199.8 / 182.8) | Mirny 222 km |
| niger-river | 3,858 / 4,180 (92.3%) | 286 | 1.666 | Bamako reach | 4 (431.5 / 418.3) | Ouagadougou 367 km |
| volga-river | 3,312 / 3,530 (93.8%) | 223 | 1.645 | Kazan reach | 4 (883.3 / 859.7) | Moscow 114 km |
| yukon-river | 2,727 / 3,190 (85.5%) | 230 | 1.664 | Dawson City, Klondike confluence | 10 (242.2 / 249.8) | Fairbanks 134 km |
| indus-river | 2,704 / 3,180 (85.0%) | 214 | 1.662 | Sukkur, Lloyd Barrage reach | 3 (836.3 / 818.6) | Lahore 297 km |
| zambezi-river | 2,692 / 2,574 (104.6%) | 168 | 1.635 | Victoria Falls reach | 8 (406.8 / 401.9) | Lusaka 89 km |
| ob-irtysh-river | 4,599 / 5,410 (85.0%) | 435 | 1.669 | Khanty-Mansiysk, Irtysh-Ob confluence | 9 (103.1 / 101.0) | Tomsk 624 km |

Coverage above 100 percent (Yenisei, Mackenzie, Zambezi) is NE drawing delta
distributaries and meander detail the conventional single-thread figure smooths
away; the shipped line is the assembled main stem in each case (Mack
...[truncated 9976 chars]