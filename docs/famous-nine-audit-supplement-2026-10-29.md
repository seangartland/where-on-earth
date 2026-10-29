# Famous nine: orchestrator (Wonder) audit supplement, 2026-10-29

The sourcing lane's sandbox had no network. The three checks it could
not run were run by the orchestrator from a network-enabled shell on
2026-10-29. Results:

## 1. Pageview spike check (12 months, 2025-10 to 2026-09, Wikimedia API, measured)

| Entry | Lane's cached mean/day | Fresh mean/day | Fresh median/day | Mean/median |
|---|---:|---:|---:|---:|
| mount-everest-summit | 5,919.8 | 5,919.8 | 5,705.6 | 1.04 |
| grand-canyon | 365.0 | 1,408.7 | 1,401.7 | 1.01 |
| niagara-falls | 1,717.9 | 1,717.9 | 1,805.6 | 0.95 |
| victoria-falls | 855.8 | 855.8 | 884.0 | 0.97 |
| iguazu-falls | 864.0 | 864.0 | 861.3 | 1.00 |
| great-barrier-reef | 1,174.6 | 1,174.6 | 1,128.7 | 1.04 |
| angel-falls | 716.2 | 716.2 | 693.8 | 1.03 |
| k2 (lane measured) | 2,990.5 | n/a | 2,819.8 | 1.06 |
| mount-etna | 1,401.7 | 1,401.7 | 1,338.2 | 1.05 |

No spike contamination anywhere: every ratio is within 0.95 to 1.06, so
no median rescore is needed. ONE discrepancy: grand-canyon's cached mean
(365.0) was stale; the true current-window mean is 1,408.7/day. Its
stored difficulty 6 was computed from the stale mean and would rate
easier on fresh fame. Open item for the banking step: rescore
grand-canyon through the same adapted v2 path the lane used, or accept
and note (difficulty is currently retained-but-unused per Sean's
2026-10-29 ruling). All other entries' means match the cache exactly.

## 2. Image HEAD validation (all nine, measured)

Seven of nine stored URLs returned 200 image/jpeg as stored. Two were
404 as stored (wrong Commons hash directories) and were FIXED by the
orchestrator to the canonical URLs from the Commons API:
- grand-canyon: commons/8/84/Grand_canyon.jpg (was 6/6d), now 200.
- iguazu-falls: commons/d/d7/Iguaz%C3%BA_falls.jpg (was 2/28), now 200.
Viewed directly and confirmed: Everest (summit from Gokyo Ri), Grand
Canyon (public-domain NPS photo, aged color, unmistakably the canyon),
Great Barrier Reef (Heart Reef aerial, heart shape visible). Licenses
and authors are in the lane's batch report.

## 3. Coordinate audit (scripts/pin-audit.py, network run)

Stored vs Wikidata: 5 of 9 within 0.5 km, 3 in the 2 to 5 km band, 1 at
523 km. Flagged at 3 km or more, all deliberate formation anchors per
the brief: great-barrier-reef (Heart Reef representative pin vs the
reef centroid), grand-canyon (Mather Point vs the generic canyon
point, 4.18 km), niagara-falls (Horseshoe Falls main drop, 4.44 km).
Reverse geocodes land correctly for all nine (K2 resolves to the
Xinjiang side administration; the summit pin sits on the border, and
K2 Base Camp at 6.6 km is the documented covering-entry overlap).
Full table: .build-tmp/pin-audit-nine.txt.
