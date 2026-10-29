# Famous nine landforms sourcing report (2026-10-29)

## Result

Two chunks were banked in order: Mount Everest through Iguazú Falls (5), then Great Barrier Reef through Mount Etna (4). The landmarks bank now contains 410 entries. `scripts/pack-landforms/derive.py` generates 130 Landforms, and the exclusive Landmarks pack remains 280.

The passport aggregate reports 280 Landmarks, confirming that Mutianyu's quarantine effect is already present in the live bank. Its assertion was updated alongside the Landforms total of 130.

## Per-entry audit

Difficulty is framework v2. Eight means below come from the repository's 12-month measured pageview cache; K2 has the newer 2025-10 through 2026-09 monthly profile. The sandbox blocked Wikimedia API access, so a current-window median could not be fetched for the other eight. They were scored on the cached mean and are explicitly listed under “not sourced to standard” below; no unsupported median values were invented.

| ID | Pin and coordinate reference | Difficulty basis | Image, license, author | Proximity |
|---|---|---|---|---|
| `mount-everest-summit` | 27.9881, 86.9250; summit, [Mount Everest article](https://en.wikipedia.org/wiki/Mount_Everest), Q513 | 1; cached mean 5,919.8/day; median unavailable | [file](https://commons.wikimedia.org/wiki/File:Mt._Everest_from_Gokyo_Ri_November_5,_2012.jpg), CC BY-SA 3.0, Rdevany | Sagarmatha National Park 25.4 km (expected covering-entry overlap, just outside the 25 km gate) |
| `grand-canyon` | 36.0613, -112.1078; Mather Point on the South Rim, [NPS](https://www.nps.gov/places/000/mather-point.htm) | 6; cached mean 365.0/day; Arizona display-unit fallback; median unavailable | [file](https://commons.wikimedia.org/wiki/File:Grand_canyon.jpg), public domain (NPS), credited on Commons to Ellywa | none within 25 km |
| `niagara-falls` | 43.0773, -79.0757; Horseshoe Falls/main drop, [Niagara Falls article](https://en.wikipedia.org/wiki/Niagara_Falls), Q34221 | 5; cached mean 1,717.9/day; median unavailable | [file](https://commons.wikimedia.org/wiki/File:3Falls_Niagara.jpg), CC BY-SA 3.0, Saffron Blaze | Niagara-on-the-Lake 19.8 km; separate town, retained |
| `victoria-falls` | -17.92444, 25.85667; main curtain, [Victoria Falls article](https://en.wikipedia.org/wiki/Victoria_Falls), Q43278 | 7; cached mean 855.8/day; median unavailable | [file](https://commons.wikimedia.org/wiki/File:Cataratas_Victoria,_Zambia-Zimbabue,_2018-07-27,_DD_04.jpg), CC BY-SA 4.0, Diego Delso | none within 25 km |
| `iguazu-falls` | -25.6953, -54.4367; Devil's Throat, repository reference cache / Q36332 | 7; cached mean 864.0/day; median unavailable | [file](https://commons.wikimedia.org/wiki/File:Iguaz%C3%BA_falls.jpg), CC BY-SA 4.0, Enrique von Specht | none within 25 km |
| `great-barrier-reef` | -19.7754, 149.2478; Heart Reef, GPS on [the selected file](https://commons.wikimedia.org/wiki/File:Heart_Reef_and_Lagoon_Great_Barrier_Reef.jpg) | 7; cached mean 1,174.6/day; median unavailable | same file, CC BY-SA 4.0, Alphasauce | none within 25 km; Heart Reef is the representative iconic sector |
| `angel-falls` | 5.9675, -62.5356; main drop, repository Wikidata cache / Q80299 | 7; cached mean 716.2/day; median unavailable | [file](https://commons.wikimedia.org/wiki/File:Angel_falls-distant_view.jpg), public domain, (WT-en) Kebes | none within 25 km |
| `k2` | 35.8808, 76.5158; summit, repository reference cache / Q43512 | 2; mean 2,990.5/day, median 2,819.8/day; mean basis, no spike (1.06×) | [file](https://commons.wikimedia.org/wiki/File:K2_Peak.jpg), Public Domain Mark, Sonic Velvet | K2 Base Camp 6.6 km (expected covering-entry overlap); retained as the summit formation |
| `mount-etna` | 37.7510, 14.9934; summit crater, repository reference cache / Q16990 | 5; cached mean 1,401.7/day; median unavailable | [file](https://commons.wikimedia.org/wiki/File:Etna_in_winter.jpg), public domain, Jeanne Boleyn | none within 25 km |

## Quality and validation

- Dedupe by ID and accent-stripped short name passed against both banks.
- All nine clues and facts were read. The banned-phrase scan passed, and no repeated fact template was found.
- Every new image URL is unique against both datasets. Filename denylist checks passed. Commons file pages confirm real JPEG photographs, subject, author, and license; the web connector could read those pages.
- The workspace cannot make network connections, so direct URL HEAD checks and cache-miss lookups in `scripts/pin-audit.py` could not run. The attempted offline audit stopped at the first uncached article. Stored Wikidata/article references agree with the selected pins for the point features; Mather Point and Heart Reef intentionally use the brief's representative-anchor rule.
- `test/pack-pools.test.mjs` passes with 130 Landforms and 280 exclusive Landmarks. The passport test passes with totals 206 / 280 / 130.

## Not sourced to the full skill standard

The eight entries other than K2 lack the required current-window 12-month median/spike check because the sandbox denied the Wikimedia API request and the repository cache retains only their older 12-month mean. Direct image HEAD validation and the network-backed 3 km audit were also unavailable for all nine. No target was substituted. These limitations require orchestrator review or a network-enabled rerun before shipping.
