# Country outlines and Borders build report

## Completion audit

The inherited working tree was close to complete and was retained rather than rebuilt.

- **P2 — complete before this session.** `src/main.js` already lazy-loaded and idle-decoded the committed 10 m TopoJSON, resolved game keys to member geometry, skipped antimeridian cut arcs and internal member borders, drew only the answer key with a glow/core stroke, hid projected outlines below 12 CSS px, and cleaned the mesh up with the reveal. The hooks cover animated, static/restored, Daily, Survival, Endless, and Expedition reveals. The outline material is independent of the classic-map layers, so it remains visible on satellite.
- **P3 — complete before this session.** `assets/country-bands.json` contains exactly the 202 country keys present in `assets/locations.json`; all ten bands are populated.
- **P4 — nearly complete before this session.** The inherited code had the one-row three-button home layout; country-and-flag prompt; polygon/tolerance hit rules; target-only outline on hit and miss; land/ocean miss copy; static reveal; one-miss elimination; shared results screen and separate best key; and no Passport award path. The inherited bag refilled after it was emptied, which allowed repeats in an exceptionally long run. I changed it to initialize each band once and end the run on exhaustion, making the no-repeat rule absolute for a run.
- **P5 — implemented, with the frame-budget check limited by the capture environment.** Country data is outside the critical load phases, fetched at low priority after critical bytes, decoded during an idle callback, and per-reveal geometry is disposed. Measured outline construction was 5.8–6.5 ms for Indonesia and 9.4–21.3 ms for Russia. SwiftShader itself ran at 305–646 ms median frames (329.9 ms baseline), so it cannot establish the plan's hardware-oriented “no frame over 50 ms” criterion.

No changes were made to `assets/country-outlines.topo.json`. Its territory and disputed-area membership therefore remains exactly the committed Phase 1 data.

## §3.5 country-band formula and table summary

The build used the already measured country geometry span, the difficulty framework's locatability adjustment `K`, and the best-known location's measured fame `p_best`.

```text
size  = clamp(log(3000 / span_km) / log(3000 / 20), 0, 1)
score = 0.5 * size + 0.3 * K / 2 + 0.2 * (1 - p_best)
```

Lower scores are easier. Keys are ranked by score, with ties broken by larger span and then name, and divided into ten equal-count bands using `band = 1 + floor(rank * 10 / 202)`.

The committed table has 202/202 location keys, no missing or extra keys, and this band histogram:

| band | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| countries | 21 | 20 | 20 | 20 | 20 | 21 | 20 | 20 | 20 | 20 |

The full key-to-band table is `assets/country-bands.json`.

## Verification

### Static and data checks run in this session

- `node --check --input-type=module < src/main.js` — passed.
- `git diff --check -- src/main.js index.html assets/country-bands.json` — passed.
- Parsed `assets/locations.json`, `assets/country-outlines.topo.json`, and `assets/country-bands.json` — 202 location keys, 202 topology keys, and 202 band keys; none missing; all ten bands non-empty. The topology remained 1,211,450 bytes with 261 geometries and 12 cut arcs.
- Inspected the existing P4 fixture log: Vatican tolerance inside Italy hit; Vatican 44 km away missed as Italy; Lesotho centre hit; Lesotho while targeting South Africa missed; Tuvalu ocean at 27.6 km hit with a 50 km tolerance and missed with 24 km; Crimea hit Ukraine and missed Russia; a tap 0.6 km inside Switzerland missed France; Greenland hit Denmark; Somaliland hit Somalia; open Pacific missed Peru as ocean.
- Inspected the existing 12-round Borders smoke log: 12 distinct targets, all hits, followed by a successful transition into ordinary Survival.

### 390 px captures from the interrupted build session

The inherited harness at `/home/hatch/workspace/map-game/shots/outlines/verify.mjs` had run `node verify.mjs sat`, `node verify.mjs borders`, and a partial `node verify.mjs classic` at a 390 × 844 viewport. I inspected its PNGs and logs:

- **Satellite Paris:** France alone was crisply outlined; Corsica was included; the route and pins remained above it.
- **Satellite Nuuk:** the visible Greenland member of Denmark alone was outlined; no mainland Denmark was pulled into the camera framing.
- **Satellite Jakarta:** Indonesia's nearby multi-polygon islands were outlined without a fill.
- **Satellite Tiksi:** Russia's coast rendered without a vertical 180° line. The data assertion counted 6,782 stroked segments and zero segments on the antimeridian.
- **Satellite Vatican:** the outline object had six segments but `visible: false`; the capture showed only the pin/route context, as required by the sub-12-pixel rule.
- **Borders hit:** state/copy showed `✓ Peru`, one found, and “Keep going”; only Peru's outline object existed. The saved capture was taken before the slow software-rendered camera fully settled, so it is weak visual evidence for framing.
- **Borders land miss:** showed `✗ That's Bolivia`, a route to Peru, and only Peru's outline.
- **Borders ocean tap:** showed `✗ Ocean`, 764 km, a route to Peru, only Peru's outline, and “See run.” Following it produced the Borders results screen, proving one miss ended the run.
- **Borders microstate:** the prompt was `Tap Vatican City 🇻🇦`; the tap hit, `✓ Vatican City` was recorded, and the six-segment outline object was hidden by the projected-size rule.
- **Home:** Daily, Survival, and Borders occupied one row of three at x=28, 142, and 256 with equal 106 px widths.

The satellite harness also captured a bullseye, a blowout, and a static reveal; all created only France's answer outline. Russia and Indonesia outline builds were measured by the same harness as reported under P5.

### Items not verified by a successful capture

- The classic-map run produced only Paris and Nuuk frames before the prior Chromium process died. Both were mid-animation and had not reached a reveal, so they do **not** verify classic outlines. Jakarta, Tiksi, Vatican, and the Borders cases were not captured on classic.
- I attempted to rerun a deterministic 390 px Playwright matrix with both `/opt/meta-chromium/chrome` and the alternate headless shell. In this session both binaries exited before opening a page because the managed container denied Chromium's socket shutdown syscall (`sandbox_host_linux.cc:41`, `Operation not permitted`). Consequently I could not complete or replace the classic captures, nor produce a trustworthy under-50-ms frame measurement in this environment.

No deployment was run.

## Commit and push

The requested commit could not be created in this session. `git add src/main.js index.html assets/country-bands.json docs/borders-build-report-sol.md` failed with:

```text
fatal: Unable to create '/home/hatch/workspace/map-game/demo/.git/index.lock': Read-only file system
```

The workspace allows edits to the working tree but mounts `.git` read-only, and this session has no approval mechanism for changing that permission. I did not attempt `git push origin main` because there was no feature commit to push. No unrelated working-tree changes were staged, discarded, or committed.
