# Country outlines: reveal outline + "tap the country" Survival

This is a plan only. Nothing is implemented and no game files were touched. Opus 5.5 did the analysis directly, with no delegation.

**Hard rule (Sean, 2026-10-12): only the correct answer's country border is ever displayed. Never two countries' borders on screen at once**, in any mode, including miss feedback. Where the tap landed is communicated by the pin, the route line, and the pill text, never by drawing the tapped country's border.

**How it was done.** I read `src/main.js` (render, reveal, Survival, loader), `src/style.css`, `index.html`, `deploy.sh`, `src/daily.js` and the difficulty pipeline README. Every size and match count below was **measured** with throwaway scripts in `.build-tmp/country-outlines/` (`measure.py`, `pip.py`, `pip50.py`, `build-sizes.py`, `build-sizes50.py`). The scripts ran against `assets/locations.json` (754 locations, 202 country keys) and Natural Earth (NE) files. The 10m NE files were already on disk in `scripts/difficulty/ne/`, which is gitignored. The 50m files were downloaded into `.build-tmp/` for comparison only. Simplification sizes come from topology-preserving Douglas-Peucker on TopoJSON arcs, using the same lat-squashed DP that `main.js` uses. Values I did **not** measure are marked "unmeasured".

---

## 0. Facts from the code that shape the design

1. **Satellite is the default map, and it hides every vector outline.** `updateSatellite()` (`main.js:1324`) sets `m.visible = s < 1` on everything in `outlineMaterials`. The satellite path also never loads the 10m coast, lakes or rivers (`startDetail` only runs when satellite is off, `main.js:1699`). So the country outline **cannot** be another `buildOutline()` layer registered in `outlineMaterials`, or it would vanish for almost every player. It needs its own material that stays visible over imagery.
2. **The only vector styling a satellite player sees today** is the reveal set:
   - answer route `LineMaterial` `#b9f7ff`, `linewidth: 2.4` css px, `opacity: 0.94`, `depthTest: false`, `renderOrder 6` (`main.js:2420`)
   - answer pin `ANSWER_COLOR #67e8ff` (core `#d9fbff`), guess pin `PIN_COLOR #ffb54a` (core `#ffc568`), bullseye `GOLD_COLOR #ffd45e`
   - reveal pill: safe `#8ef0b8` on `rgba(120,230,170,.4)`, miss `#ff9db4` on `rgba(255,120,150,.4)` (`style.css:152-153`)
   - classic-only lines for reference: coast `#7fd2f4` 0.78 px op 0.92; lakes `#5f9fd0` 0.8 px op 0.45/0.28; rivers `#4a86b8` 0.6 px op 0.3. The coast glow is baked into the texture's G channel (`rgb(0,92,0)` blur 10, `rgb(0,68,0)` blur 3.5) and tinted `vec3(0.22,0.70,1.00)*0.70` in the globe shader. It is **classic only**: satellite replaces glow and graticule wholesale via `uSatMix`.
   - The shared outline conventions are radius `1.002` with the per-frame `outlineLift` rescale (`main.js:2141`) through `outlineMeshes`, segments subdivided every `1.2°` (`buildOutline`), and a `1.1 s` cubic fade-in clock (`main.js:2160`).
3. **There is a known beading artifact.** `buildOutline` uses independent segments, so overlaps double up when `opacity < 1` (comment at `main.js:702`). That matters for any low-opacity glow line.
4. **The two-beat reveal.** The flight lands and `answerLanded()` fires, starting the postcard pop. Then comes `arriveDuration` (0.5 s, or 1.5 s for blowouts). Then `startPullback()` → `startRevealBeat()` → `REVEAL_BEAT_MS = 1500` → the sheet peeks (`SHEET_PEEK_H 80`, slide 380 ms). For bullseye/pinpoint there is no flight: snap-zoom, then slow motion, then the same `startPullback()`. A non-animated or restored reveal goes through `placeRevealVisual()` → `startRevealBeat()` or `showRevealSheet(false)`. Everything is torn down in `clearReveal()`.
5. **Survival** (`main.js:4886-4970`) climbs `survivalBand() = ((round-1) % 10) + 1`. Each pick is an independent uniform draw from that band, deliberately with no bag or repeat prevention. One miss over `SURVIVAL_LIMIT_KM = 150` ends the run. The best score is stored in `where-on-earth-survival-best-v1`. Survival reuses the normal guess flow (tap → pin → Lock in → reveal), with `body.survival` restyling.
6. **The country concept** is `countryKey(item) = item.country` (`main.js:6194`). England, Scotland, Wales and Northern Ireland stay separate keys (Sean, 2026-10-11). Territories carry their sovereign: Nuuk, Ilulissat, Qaqortoq and Nanortalik → `Denmark`; Hong Kong, Macau → `China`; San Juan → `United States`; Nouméa, Papeete → `France`; Longyearbyen → `Norway`. Clue text is inconsistent ("Nuuk, Greenland 🇬🇱" but "Qaqortoq, Denmark 🇩🇰").
7. **Natural Earth is already this project's country source.** The difficulty pipeline measured country spans from NE 10m admin-0 "(map units for the UK nations)" (`scripts/difficulty/README.md`, decision 4). `assets/difficulty/country-span.json` holds that per-country span tier `A` for 180 of the 202 current keys. `scripts/difficulty/country-familiarity.json` holds the `K` list. The vendored `topojson-client` already exports `feature`, `mesh` and `merge` (`vendor/topojson-client/src/index.js`).
8. **`assets/countries-110m.json` (107,761 B) exists but nothing in `src/main.js` references it.** It is dead and still shipped. It is too coarse for this job anyway (no microstates, no UK nations). The new file gets a distinct name so the two are never confused.

---

## 1. Data

### 1.1 Source: Admin 0 countries, with UK nations from Admin 0 map units

- **Admin 1 is wrong for this.** It is provinces and states: about 4,600 features and a much larger file. The game needs nothing below country level except the four UK nations.
- **NE Admin 0 *countries*** (`ne_10m_admin_0_countries`, 258 features) is already dissolved to one feature per country. Its `ADMIN` names match the dataset's names for almost every key. Its one gap is the UK: `United Kingdom` (GBR) is a single MultiPolygon.
- **NE Admin 0 *map units*** (298 features) splits the UK into `England` (ENG), `Scotland` (SCT), `Wales` (WLS) and `Northern Ireland` (NIR). It also splits things the game does not want split: Belgium into 3, Bosnia into 3, plus pieces of Georgia, Iraq, Somalia, Serbia, PNG, Portugal and Norway (Svalbard, Jan Mayen, Bouvet).
- **Recommendation: use Admin 0 countries, drop GBR, and add the four UK map units in its place.** This is exactly what the difficulty pipeline did. It gives **261 features** (measured).

**Territories and Greenland.** NE gives many territories their own `ADMIN` with a `SOVEREIGNT` parent: Greenland and Faroe (Denmark), Hong Kong and Macao (China), Puerto Rico (USA), New Caledonia and French Polynesia (France). Others are already inside the parent polygon: Alaska, Hawaii, Svalbard, French Guiana, Réunion, Cabinda.

The game's key decides what a "country" is, so the build carries a small **MEMBERS table** of game key → NE units. By default a key maps to the one NE unit of the same name, through a name alias table. Measured aliases needed: `United States`→`United States of America`, `DR Congo`→`Democratic Republic of the Congo`, `Congo`→`Republic of the Congo`, `Czech Republic`→`Czechia`, `Eswatini`→`eSwatini`, `Micronesia`→`Federated States of Micronesia`, `Tanzania`→`United Republic of Tanzania`, `Bahamas`→`The Bahamas`, `Vatican City`→`Vatican`, `Serbia`→`Republic of Serbia`, `Sao Tome and Principe`→`São Tomé and Principe`, `Côte d'Ivoire`→`Ivory Coast`. With those, **all 202 keys resolve to an NE unit** (measured).

Explicit multi-unit members, needed because a dataset location sits in them (see §4):

| key | members |
|---|---|
| Denmark | Denmark + Greenland + Faroe Islands |
| China | China + Hong Kong S.A.R. + Macao S.A.R. (not Taiwan, which is its own key) |
| United States | USA + Puerto Rico |
| France | France + New Caledonia + French Polynesia |
| Somalia | Somalia + Somaliland (decision D1) |
| Cyprus | Cyprus + Northern Cyprus + Cyprus No Mans Area (decision D1) |

The build merges members with `topojson.merge`, so shared borders between members (Somalia/Somaliland, Cyprus/N. Cyprus) disappear from the outline.

### 1.2 Resolution and size

All sizes are for the full 261-feature world, as compact JSON. "gz" is gzip -9, which approximates what Vercel sends.

| source | DP tolerance | quantize grid | points | raw | gz |
|---|---|---|---|---|---|
| NE 10m GeoJSON (source) | none | none | 548,471 | 13,287 KB file | n/a |
| 10m TopoJSON | 0 | 1e-4 | 480,663 | 4,791 KB | 1,672 KB |
| 10m | 0.005° | 1e-4 | 228,196 | 2,475 KB | 914 KB |
| 10m | 0.01° | 1e-4 | 151,282 | 1,720 KB | 650 KB |
| **10m** | **0.02°** | **1e-4** | **93,387** | **1,131 KB** | **436 KB** |
| 10m | 0.02° | 1e-3 | 93,387 | 951 KB | 326 KB |
| 10m | 0.05° | 1e-4 | 47,333 | 642 KB | 252 KB |
| 50m TopoJSON | 0 | 1e-4 | 80,759 | 935 KB | 357 KB |
| 50m | 0.01° | 1e-4 | 56,667 | 687 KB | 267 KB |
| 50m | 0.02° | 1e-4 | 40,889 | 521 KB | 204 KB |

How the pin data compares at each resolution (measured point-in-polygon over all 754 locations):

- **10m**: 37 pins fall outside every polygon. All are coastal or small islands, and the nearest unit is always the right country. The largest gaps are Koh Phi Phi 26.5 km, Skellig Michael 13.3 km, Capri 8.3 km and Tarawa 4.0 km. The other 33 are under 2 km.
- **50m**: 63 pins fall outside every polygon. 5 are over 5 km away: Koh Phi Phi 29.3, Skellig 14.0, Heimaey 13.0, Capri 9.8, Belém 6.3. At 50m, Monaco's pin also falls outside the Monaco polygon.

**Recommendation: NE 10m at DP 0.02° (about 2.2 km), on the shared 1e-4 grid. That is 1,131 KB raw and 436 KB gzipped.**

- 0.02° is in the same family as the coast's `SIMPLIFY_TOL = 0.015` in `main.js`, so outline detail matches the rest of the globe.
- It keeps 10m's better pin agreement and its exact microstate shapes.
- It uses the same grid convention as every other `*.topo.json` (`GRID` in `build/make-topojson.mjs`).
- 50m raw is 80 KB smaller gzipped but has nearly twice the off-polygon pins, so it does not earn the switch.
- 0.01° costs about 214 KB more gzipped. It is the fallback if the 0.02° coast visibly drifts from satellite imagery at deep zoom (verify in Phase 2, see Risk R4).

Rings below `MIN_ISLAND` stay in the file because hit-testing island nations needs them. They are only skipped when **drawing** (§2.3).

### 1.3 Build pipeline: `build/make-country-outlines.mjs`

This follows the pattern of `build/make-topojson.mjs` and `build/make-islands.mjs`: Node, global `topojson-server` and `topojson-client`.

1. Read `scripts/difficulty/ne/ne_10m_admin_0_countries.geojson` and `..._map_units.geojson`. These are on disk but **gitignored** (`.gitignore`: `scripts/difficulty/ne/`), so the script's header must give the NE download URLs and the NE version. They are never shipped, because they are outside `assets/`.
2. Build the 261 features. Tag each with `id` (`ADM0_A3`, or `GU_A3` for the UK nations) and `name` (NE `NAME`, used for "you tapped Bolivia").
3. Run `geo2topo` to get a shared-arc topology.
4. **Drop antimeridian cut edges.** NE splits Russia (29 vertices on ±180°), Fiji (19) and Antarctica (27) at the dateline. Stroked as-is, each would draw a fake vertical line down 180°. Arcs, or arc runs, whose consecutive vertices both lie on |lng| = 180 are kept for fill and hit-testing but flagged so the line builder skips those segments. Simplest form: emit a `cut` arc-index list in the file.
5. DP-simplify every arc at 0.02°. Use the same lat-squashed DP as `main.js`'s `simplify`, and split closed single-arc rings into halves, as `cleanCoast` does. Arc endpoints are untouched, so neighbouring countries keep identical shared borders. There are no slivers or gaps, which is why the simplification runs on arcs and not per feature.
6. Quantize onto `{scale:[1e-4,1e-4], translate:[-180,-90]}`, object name `data`, so `topoFeatures()` in `main.js` decodes it unchanged.
7. Embed the MEMBERS and alias table as `topo.keys = { "<game key>": ["<id>", ...] }`, about 6 KB unmeasured. Runtime then has a single source of truth.
8. Write `assets/country-outlines.topo.json` and a report at `.build-tmp/country-outlines/report.md`. The report lists sizes, any unresolved keys, and the per-location point-in-polygon result from §4.1. The build **fails** if any key in `locations.json` is unresolved, or if any location's key cannot be resolved within 50 km.

The scratch measurement scripts in `.build-tmp/country-outlines/` can be deleted. The build script supersedes them.

### 1.4 Loading and deploy

- **Lazy, not critical.** Add a `LOAD` entry `countries: { url: 'assets/country-outlines.topo.json', size: <bytes> }`, written in exactly the `url: '...', size: N` form so deploy.sh's loop restamps the hash and size. Keep it out of both `LOAD_PHASES`, so the boot screen and detail pill never wait on it.
- Fetch it with `{ priority: 'low' }` once `criticalBytesP` settles, which is the same gate the detail layers use. Decode it on idle, not inside a frame.
- The first reveal comes after at least one guess, so in practice the bytes arrive well before they are needed. If the file has not decoded when a reveal starts, the reveal plays without an outline. If it lands during beat one, the outline fades in then. The tap mode's Play button waits on it, the same way the play buttons wait on `locationsP`.
- **Versioning needs no deploy.sh change.** deploy.sh hashes every `assets/*.json` and rewrites any `assets/<name>.json` literal in `main.js` to `?v=<sha12>`, which vercel.json serves as immutable. An unchanged outline file stays cached across deploys.
- deploy.sh copies all of `assets/` except a skip list, so no source GeoJSON may be written into `assets/`.
- **Budget:** about 436 KB gzipped, fetched once per outline-file version. For scale, the critical path today is `world.topo.json` at 970,247 B raw plus `locations.json`, and classic detail is a further 4.2 MB raw.

---

## 2. Reveal use

### 2.1 Which outline

The outline shown is the answer location's **game key outline**: all members merged (§1.1), so Nuuk shows Denmark's set and Hong Kong shows China's. The camera frames only the pins, so in practice the player sees the part near the answer. Mainland Denmark is not on screen during a Nuuk reveal.

### 2.2 When

- **Animated reveal (flight and bullseye):** start the outline's fade in `startPullback()`, the moment beat one begins. Use the existing 1.1 s cubic outline clock, so it is fully drawn about 0.4 s before the sheet peeks at `REVEAL_BEAT_MS = 1500`. It does **not** appear at touchdown: `answerLanded()` is when the postcard pops (`postcardLanded`), and two things arriving on the same frame compete. The pullback is when the map "plays alone", which is what the outline belongs to.
- **Static reveal and restore** (`placeRevealVisual` path, `window.__travelAnim === false`): show it at full opacity immediately, alongside the route.
- **How long it stays:** until `clearReveal()`, the next round or going home, where the mesh is removed and its geometry and material disposed. It survives sheet expand and collapse and player panning.
- **Post-game review** (ten pins, `enterReview`) gets no outlines in v1.

### 2.3 How it is drawn

It uses a new `buildCountryOutline(lines)` that reuses `buildOutline`'s subdivision code and radius `1.002`. It is pushed to `outlineMeshes`, so it gets the same zoom-dependent lift. It is **not** pushed to `outlineMaterials`, so satellite does not hide it and the boot fade clock does not drive it. It has its own `userData.reveal` clock.

Two stacked line meshes give the soft-then-crisp look of the classic coast glow under its vector line, but stay visible on imagery:

| layer | colour | width (css px) | opacity | from |
|---|---|---|---|---|
| glow | `#67e8ff` (`ANSWER_COLOR`) | 5.0 | 0.22 | the answer pin's colour, the halo idea of `addCoastGlow` |
| core | `#b9f7ff` (answer route) | 1.6 | 0.94 → opaque after fade | the route's colour, thinner so the route stays the hero |

- `depthTest: true`, unlike the route's `false`. Russia, Canada or USA can wrap past the limb, and with `depthTest: false` their far-side border would draw through the globe.
- `renderOrder 5`, under the route (6) and travel head (7). The pins' `renderOrder` 3-5 are additive, and the outline sits beneath their glow.
- **No fill** in v1 (decision D8). A fill needs triangulation plus spherical subdivision for big countries, and over satellite a tint mostly muddies the imagery.
- Rings under `MIN_ISLAND = 0.12°` across are skipped when drawing, the same rule as the coast. The exceptions are the ring containing the answer, and countries whose rings are *all* under the threshold (Tuvalu, Nauru, Maldives), which are drawn in full.
- Segments flagged as antimeridian cuts (§1.3 step 4) are skipped.
- The width values are proposals. They need the Phase 2 390 px capture on satellite before they are locked.

### 2.4 Camera

The camera is unchanged: `frameRevealPoints` and `homeRevealView` still frame the two pins. The outline is context, not a new framing target. Pulling back to fit Russia on a 30 km miss would wreck the near-miss beat.

### 2.5 Multi-polygon countries and exclaves

Every member polygon is drawn, subject to the island rule: Indonesia's 264 polygons, the USA's 344 including Alaska and Hawaii, Angola's 3 including Cabinda, France's 21 including Guiana and Réunion. Off-screen parts cost almost nothing. Simplified, Russia, Canada and Indonesia are a few thousand vertices each (exact counts unmeasured). They are built once per reveal and disposed on clear.

### 2.6 Tiny countries

Measured bbox sizes:

| country | bbox (km) | polygons |
|---|---|---|
| Vatican | 0.1 × 0.1 | 1 |
| Monaco | 5.8 × 5.0 | 1 |
| Nauru | 5.7 × 6.8 | 1 |
| San Marino | 8.6 × 10.0 | 1 |
| Liechtenstein | 10.6 × 23.3 | 1 |
| Singapore | 40.4 × 20.4 | 1 |
| Andorra | 29.4 × 24.4 | 1 |
| Malta | 34.6 × 30.3 | 2 |

At the flight's arrive altitude (`arriveDist 1.52`, about 3,300 km up), the screen scale works out to roughly 2.5 km per css px on a 390×844 phone. That is a calculation from FOV 36°, not a capture. So Monaco is about 2 px, Singapore about 16 px, and the Vatican is invisible.

**Rule:** each frame, if the outline's projected bbox is under **12 css px**, hide it. The pin's contact point and pulse rings (`CAP_RADIUS 0.075`) already cover that area, and a 2 px squiggle under a pin reads as a rendering glitch. The country is still named in the sheet. No substitute ring marker is added, because the pin *is* the marker.

---

## 3. Tap-the-country Survival

### 3.1 Round

- **Prompt:** "Tap **Peru** 🇵🇪" in the clue slot (`gameEls.clue`). The header line reads `Round N  Difficulty b/10`, the same string format as Survival. The streak line reads `One miss ends the run` on round 1, then `🔥 N survived`. The flag comes from `flagForLocation()` on any location of that key, so England, Scotland and Wales get their subdivision flags from `COUNTRY_FLAGS`. The flag adds identity, not location, so it is not a hint (decision D5).
- **Input:** the existing tap → pin → **Lock in** flow (`placeGuessPin`, `LOCK_ARM_MS`). A stray tap mid-spin must not end a run, and the flow is already learned.
- **The globe** is the normal satellite globe with **no borders drawn**. Finding Paraguay among unlabeled imagery is the game.

### 3.2 What counts as a hit

The tap point `p` (from `vec3ToLatLng(globeNormalAt(...))`) is tested against the target key's merged member polygons, using planar point-in-polygon in lng/lat. That is safe because NE rings never cross ±180, and the only pole-enclosing ring is Antarctica, which is excluded. The rules, in order:

1. `p` is inside a target polygon → **hit**.
2. The target is **small** (bbox diagonal under 30 km: Vatican, Monaco, San Marino, Nauru, Liechtenstein about 25 km), and `p` is within the tolerance *T* of the target's edge → **hit**, even if `p` lies inside a neighbour (Italy, France, Switzerland). Without this, the Vatican cannot be tapped.
3. `p` is inside another unit → **miss**: "That's Bolivia".
4. `p` is in no unit (ocean, or a coastal sliver lost to simplification) and within *T* of the target's edge → **hit**. This covers island nations, atolls and coastal taps. Otherwise → **miss**: "Ocean · 312 km from Peru".

**T = min(20 css px converted to km at the current zoom, 50 km).** The 20 px matches `REVIEW_LINE_HIT = 20`. At max zoom (`MIN_DIST 1.24`, about 1.2 km per px, calculated) that is about 24 km. The 50 km cap stops a player zooming out until 20 px covers 1,000 km. Distance is great-circle from `p` to the nearest ring segment. Run that check only over rings whose bbox, padded by T, contains `p`, so a test is well under 1 ms (unmeasured, but bounded by the vertex count).

### 3.3 Elimination

One miss ends the run, the same rule as Survival, minus the 150 km clause (decision D4). The miss reveal shows how far off the player was: distance from the tap to the nearest target border point.

### 3.4 Reveal

- **Hit:** target outline in the §2.3 cyan style, pill `✓ Peru` (`.reveal-pill.safe`).
- **Miss:** target outline in cyan, and only the target outline (Sean's one-border rule above). The tapped country's border is never drawn. The answer route `#b9f7ff` runs from the tap to the nearest target border point. Pill `✗ That's Bolivia` or `✗ Ocean` (`.reveal-pill.miss`), with the distance label riding the route as today.
- **No flyover.** A static `placeRevealVisual`-style reveal keeps rounds fast. Framing calls `frameRevealPoints(tap, anchor)`, where the anchor is the nearest border point on a miss or the target's bbox centre on a hit. On a hit the outline fades in on the existing 1.1 s clock, then the sheet peeks after `REVEAL_BEAT_MS`.
- **Sheet:** country name, result, Next ("Keep going" or "See run"). No photo or fact, because countries have no fact field. A photo from that country's locations would leak unvisited places, the rule the passport already enforces.

### 3.5 Difficulty progression

The band climb 1-10 repeats, as in Survival. Each key gets a **country band**, computed at build time from inputs the difficulty framework already measured:

- **Span `A`** (`country-span.json`). Bigger is easier. Current keys: A0 = 73, A1 = 59, A2 = 37, A3 = 11. 22 keys are missing (Andorra, Bahrain, Cyprus, South Sudan, Trinidad and Tobago, and others) and must be measured with the same `country_span.py` method, not guessed.
- **Familiarity `K`** (`country-familiarity.json`: +2 Pacific microstates, +1 named low-profile states).
- **Fame:** the framework's measured pageview term for the key's best-known location.

The median location difficulty per key was measured, but it is not a good proxy on its own: China's cities run medium-hard while China itself is trivial to find. The formula has to be designed, piloted, and the full 202-row band table reviewed by Opus before it ships (review-before-scale, AGENTS.md). I am not proposing weights here because that would be guessing.

**No repeats within a run** (a bag per band). This departs from Survival's deliberate independent draws (decision D7). With about 20 keys per band, independent draws would ask "Peru" twice in a long run.

### 3.6 Scoring and storage

- The score is the survived count, the same as Survival.
- The best is stored in `where-on-earth-countries-best-v1` via `safeSetItem`, mirroring `SURVIVAL_BEST_KEY`. That key is not in `VERSIONED_KEYS` either.
- The game-over screen reuses `survival-results-screen` with its own title: "`N` countries found".
- **No passport or postcard effects** (decision D9): there is no location to earn.

### 3.7 How it differs from Survival

| | Survival | Tap the country |
|---|---|---|
| prompt | a place clue | a country name and flag |
| target | a point | a polygon set |
| pass rule | within 150 km of the point | inside the country, with tolerance |
| difficulty source | location `difficulty` | new per-country band (§3.5) |
| reveal | flyover, postcard | static, outlines |
| repeats | independent draws | bag |
| passport | earns postcards | none |

---

## 4. Edge cases

### 4.1 Dataset country vs NE geometry (measured over all 754 locations)

- **37 coastal pins are off-polygon** (§1.2). The nearest unit is always the right one, with a maximum of 26.5 km. Resolution: nearest-member fallback within 50 km. The build fails beyond 50 km.
- **9 pins land inside a different NE unit:**
  - `hong-kong` and `macau` → HK/Macao S.A.R.; `ilulissat-greenland` → Greenland; `noumea-new-caledonia`, `papeete-tahiti` → NC, PF; `san-juan` → Puerto Rico. All are fixed by the MEMBERS table (§1.1).
  - `hargeysa` (key Somalia) → Somaliland, and `nicosia-cyprus` → Northern Cyprus. Fixed by MEMBERS, pending decision D1.
  - **`vatican-city` → Italy.** The NE Vatican polygon is 0.1 km across and the pin sits just outside it. The reveal resolves the key name, not the point-in-polygon result, so the outline is the Vatican's, and §2.6 hides it as sub-pixel anyway. In tap mode the "small target" rule 2 makes it tappable.
- The other three Greenland pins (Nuuk 0.58 km, Qaqortoq 0.40 km, Nanortalik 0.15 km off-polygon) resolve to Greenland via the nearest-member fallback, which works because Greenland is a Denmark member.

### 4.2 Disputed borders

NE's default here is de facto, and the file carries `FCLASS_UA`, `FCLASS_IN`, `FCLASS_CN` and other worldview fields. Measured point lookups:

- **Simferopol and Sevastopol → Russia** (Crimea).
- **Laayoune → Morocco.** Western Sahara exists as its own unit, but this point resolves to Morocco.
- Srinagar → India, Pristina → Kosovo, Jerusalem old city → Israel.
- Kosovo, Palestine, Taiwan, Somaliland, N. Cyprus, W. Sahara and Siachen Glacier are their own units.

No current location sits in Crimea or Western Sahara, so **the reveal is unaffected today**. **Tap mode is affected:** asked "Ukraine", a tap in Crimea would score "That's Russia". That needs a decision (D1). I have not checked whether NE's separate per-worldview geometry files are what fixes this, rather than the `FCLASS_*` fields alone. Check before building.

### 4.3 Countries with no NE polygon

There are none among the current 202 keys (measured). Future keys must pass the build's resolve check. The build fails loudly; nothing is silently skipped. Note that "United Kingdom" is mentioned in the `countryKey` comment but is not a current key. If it returns, it maps to the four UK nations merged.

### 4.4 Ocean taps

These are handled by rule 4 in §3.2. The ocean is never a "country", and the miss pill says "Ocean". In the reveal there is nothing to handle: answers are always on land, within 26.5 km.

### 4.5 Poles

Antarctica is already excluded from play (`isPlayableLocation`: lat < −60). It is also excluded from tap targets. A tap on it counts as "That's Antarctica", a miss, and its pole-enclosing ring is never stroked. That means no pole-closing edges like the `buildLandTexture` special case. The north has no pole-enclosing ring (Greenland and Svalbard are ordinary rings). `PITCH_LIMIT 75°` lets players reach Svalbard and Greenland's north coast. Planar point-in-polygon is exact there because the rings are ordinary lng/lat rings.

### 4.6 The antimeridian

There are seams in Russia (Chukotka) and Fiji. They are skipped when stroking (§1.3 step 4). Hit-testing is unaffected, because each half is a valid ring on its own side.

---

## 5. Implementation phases

Each phase needs a routing line before it starts (AGENTS.md).

| # | step | size | verify |
|---|---|---|---|
| P1 | `build/make-country-outlines.mjs`: merge, MEMBERS and aliases, cut-edge flags, arc DP 0.02°, quantize, report | about 180 lines | Output about 1,131 KB raw / 436 KB gz. 202/202 keys resolve. Report shows 754/754 locations resolving to their own key (37 via fallback, all ≤ 26.5 km). Shared borders have identical vertices (arc reuse). |
| P2 | Runtime: `LOAD.countries` lazy fetch + decode; `countryGeom(key)`; `buildCountryOutline` (glow + core, depthTest on, cut-skip, island rule, sub-12 px hide); hooks in `startPullback`, `placeRevealVisual`, `clearReveal` | about 120 lines | Headless 390 px captures **on satellite** and on `?map=classic` for: Paris (France), Nuuk (Denmark/Greenland), Miami (USA, Alaska off-screen), Jakarta (Indonesia), Tiksi (Russia: no 180° seam), Vatican (outline hidden), a bullseye, a blowout, a restored round. Boot and detail bars unchanged. `node --check --input-type=module < src/main.js` (AGENTS.md map-game rule). |
| P3 | Country band table: measure the 22 missing spans, then the band formula | script about 80 lines, plus data | **Opus reviews the formula and the full 202-row table before P4.** Band histogram reported (no empty band). |
| P4 | Tap mode: entry button, state object (like `survival`), prompt, hit rules §3.2, miss/hit reveal §3.4, results reuse, best key | about 250 lines | Unit test of the hit rules over fixtures: Vatican tap inside Italy within T; Lesotho centre; ocean 30 km off Tuvalu; Crimea (per D1); land border 5 px inside the neighbour = miss. Headless full run of rounds 1-12. 390 px captures of prompt, hit and miss. |
| P5 | Perf and polish | small | `build/fps.js` before and after on a reveal of Russia and Indonesia. No frame over 50 ms at outline build (unmeasured today). |

**Risks and mitigations**

- **R1 bundle size.** +436 KB gzipped. Mitigation: lazy, low priority, after critical, immutable-cached; it never touches boot. The fallback is 0.05° (252 KB) if the budget is cut.
- **R2 decode stall.** Decoding about 1.1 MB on the main thread is unmeasured; comparable to `world.topo.json`, which already decodes at boot. Mitigation: decode on `requestIdleCallback` (or `nextPaint`) after the critical phase, and measure in P2.
- **R3 projection.** Chords cut under the surface on long edges, and far-side borders show through. Mitigation: `buildOutline`'s 1.2° subdivision at radius 1.002 with the existing `outlineLift`, and `depthTest: true`.
- **R4 satellite mismatch.** The 2.2 km tolerance may drift visibly from imagery coastlines at z6-z8 insets. Mitigation: check in the P2 captures at max zoom. If it is visible, rebuild at 0.01° (650 KB gz). It is a one-constant change.
- **R5 beading.** The glow layer at opacity 0.22 overlaps at segment joins (`main.js:702`). Mitigation: build each ring as one continuous `LineGeometry` polyline, the way `answerLine` is built, not independent segments. Confirm on the 390 px capture.
- **R6 politics.** Disputed geometry in tap mode (D1). Mitigation: decide before P1, since it changes the build.

---

## 6. Decisions (ALL RESOLVED by Sean, 2026-10-12)

- **D1. Disputed areas: follow the game's own names.** Crimea → Ukraine, Somaliland → Somalia, N. Cyprus → Cyprus, Western Sahara its own unit. Geometry agrees with the game's labels. APPROVED as recommended.
- **D2. Territories are members of the sovereign key.** Tapping Greenland counts as Denmark, Hong Kong as China, and likewise for the other territory members. This governs geometry membership and tap scoring. Player-facing clue text is unchanged (Nuuk's clue still reads "Nuuk, Greenland 🇬🇱"). APPROVED.
- **D3. Resolution.** 10m at 0.02° (436 KB gz), with 0.01° as the R4 fallback. Settled by measurement.
- **D4. Lives.** One miss ends the run. APPROVED as recommended.
- **D5. Prompt.** Country name plus flag. Settled by consistency with clue format.
- **D6. Entry point.** A separate home button for the tap mode, AND the home mode buttons move to ONE ROW OF THREE (Sean's amendment), replacing the 2-column grid with its empty cell. APPROVED with amendment.
- **D7. Repeats.** A bag per band, no repeats within a run. Settled by pool size (about 20 per band).
- **D8. Fill tint.** Stroke plus glow only, no fill in v1. Settled on perf and satellite legibility.
- **D9. Passport.** Tap mode earns nothing in v1. APPROVED as recommended.
- **D10. Reveal outline in all modes** (Daily, Survival, Endless, Expeditions). APPROVED as recommended.
