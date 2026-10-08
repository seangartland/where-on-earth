# Where on Earth — Image Audit Execution Plan

Scope: fix images for all 1,935 locations in `assets/locations.json`. Current state verified directly against the repo on 2026-10-07 (not taken on faith from the task brief):

| Bucket | Count |
|---|---|
| PASS-auto (no action) | 620 |
| FAIL-auto | 661 |
| UNSURE | 514 |
| SOFT-FAIL | 140 |
| **Total needing action** | **1,315** (125 already proposed in batch1, 1,190 remaining) |

`triage.json` (both the `assets/` copy and the `.build-tmp/image-audit/` working copy) and its Wikidata/Commons response cache under `.build-tmp/image-audit/cache/` are identical and already populated for all 2,000 raw rows (1,935 current + 65 stale IDs). **No new API calls are needed to resolve most of the remaining work** — the data to do it mechanically already exists on disk.

---

## 1. Batch1 review (125 replacements)

**Verdict: good methodology, one critical bug that breaks every single URL. Do not merge as-is.**

What's right:
- All 125 use `source: "p18"` — Wikidata's main image claim for a QID that was matched to the location by country + coordinates (≤15 km, `wd_country_match: true`). That's a sound, auditable selection rule, not a guess.
- 100% on `upload.wikimedia.org` (real Commons domain, no third-party mirrors).
- 122 `.jpg` + 3 `.jpeg`; zero filenames matching `flag|coat|seal|emblem|logo|crest|svg|map_of|locator` — no logos/maps/flags got through.
- 125/125 `new` URLs are unique (no two locations assigned the same photo); 0 cases where `old == new`.
- Manual spot check of 15 random entries (city halls, rail stations, aerial shots, panoramas) matched the named place and looked like genuine city-identity photos, not random landmark substitutions. The two non-city entries in the batch (`brasilia-national-congress`, `banff-national-park`) correctly show the landmark itself — that's right because those *are* the landmark, not a city standing in for one.

**The bug:** every `new` URL is built as `.../thumb/<file>/640px-<file>`. I live-tested this against Wikimedia directly:

```
500px -> 200 OK   (works, on every file tested)
640px -> 400 "Use thumbnail sizes listed on https://w.wiki/GHai"
120px -> 200 OK
250px -> 200 OK
300/400/600/800/1000px -> 400
```
Wikimedia's thumbnail renderer only serves a fixed whitelist of widths (120, 250, 500, … — not 640). **All 125 batch1 URLs currently 400 and would render as broken images in production.** This is silent at review time (the JSON looks fine) and would only surface as broken `<img>` tags after deploy — exactly the kind of thing to catch before the patch, not after.

**Fix for batch1 (mechanical, no new research needed):** rewrite every `new` URL's width segment from `640px` to `500px`, matching the width already used throughout the existing `locations.json` (`.../thumb/<file>/500px-<file>`). Then re-validate all 125 with a live `HTTP 200` + `content-type: image/*` check before merging into the final patch (see §4). Don't touch `old`/`source`/`evidence` — only the width in `new`.

No other defects found. Batch1's selection *logic* (QID matched by country+coords, pull P18) is the same logic Tier A below reuses at scale.

---

## 2. Remaining 1,190 — data landscape

Excluding the 125 in batch1, broken out by what evidence already exists per location in `triage.json`:

| Tier | Size | Criterion | Resolution path |
|---|---|---|---|
| **A** | 849 | `wd_p18` present, `wd_km < 15`, `wd_country_match: true` | Mechanical — same rule as batch1 |
| **B1** | 26 | `wd_p18` present but geo/country mismatch ("weak" match) | Likely bad Wikidata linkage — re-derive via Commons category, don't trust the stale P18 |
| **B2** | 199 | `wd_qid` present, no P18 claim at all (41 of these have a usable `p373_category`) | Commons category search scoped to the QID's category, best-candidate pick |
| **C** | 116 | No `wd_qid` match at all, no category | Hardest bucket — search pass 2, then manual/vision research |

(849 + 26 + 199 + 116 = 1,190.) Split of these across the original verdict buckets:

```
Tier A (849):  FAIL-auto 398, UNSURE 346, SOFT-FAIL 105
Non-A (341):   FAIL-auto 138, UNSURE 168, SOFT-FAIL 35
```

**Worked example of why Tier C needs a second pass before anyone looks at it by hand:** `barcelona` (our Venezuelan Barcelona, `country: Venezuela`) got matched by Wikidata's name search to `Q4859840` = Barcelona, **Spain**, which correctly failed `wd_country_match` and landed in the no-match bucket. The actual Barcelona-Venezuela QID was never in the top-8 candidates the search API returned for the bare query `"Barcelona"`. That's a search-query problem (ambiguous common name, no country qualifier in the query), not a case where Wikidata genuinely lacks the data. `matterhorn-summit` and `darvaza-gas-crater` — both have well-documented Wikidata entries — are in the same "no match found" bucket for the same reason. **A well-known place with "no Wikidata match" is itself a signal to re-run the search, not evidence the data doesn't exist.**

---

## 3. Processing pipeline & model routing

| Step | Work | Who/what does it | Why |
|---|---|---|---|
| 1. Batch1 width fix | Rewrite `640px`→`500px` in 125 URLs | Script (no model) | Pure string fix, mechanical |
| 2. Tier A generation | Pull `wd_p18` for 849 rows, build `old`/`new`/`source`/`evidence` exactly like batch1 | Script against cached `triage.json` — **no LLM, no new network calls** | Same deterministic rule already proven in batch1 |
| 3. Tier A structural filter | Reject: non-photo extensions (svg/gif/tif→flag for conversion or drop), filename matches `flag|coat|seal|emblem|logo|map_of|locator`, `new` URL collides with another location's `new`, subject title exact-matches another location's `short` field (landmark-is-its-own-location collision) | Script | Mechanical gate, same checks already run against batch1 above |
| 4. Tier A live validation | HTTP 200 at `500px`, `content-type: image/*`, byte size sanity (>5 KB, i.e. not a 1x1 placeholder) | Script | Catches the exact class of bug found in §1 |
| 5. Tier A vision QA | For everything that clears steps 3–4: a cheap vision-capable model looks at the final image + the location's `short`/`country`/`clue` and answers one question — "is this plausibly a real photo of this specific place, and if it's a city, does it read as the city rather than one isolated monument?" Flag anything it's unsure about. | Light/cheap vision model, run over all 849 (bounded, structured yes/no/flag output — not open-ended judgment) | Sean's rule: a wrong photo is worse than no photo. Mechanical filters catch structural problems (wrong file type, dup URLs) but not "is this actually misleading," which needs a look at the pixels. |
| 6. Tier B1/B2 candidate generation | For 225 rows: query Commons category members for the QID's sitelink category (or `p373_category` where present); shortlist 3–5 real-photo candidates per location | Script (Commons API, new calls — ~225 locations, cheap) | Mechanical fetch, no judgment yet |
| 7. Tier B pick-best | Vision model picks the best candidate per location from the shortlist (or "none are good") | Light vision model | Judgment-lite: choosing among a few, not open research |
| 8. Tier C search pass 2 | Re-run Wikidata search with country-qualified queries (`"<name>, <country>"`) and a coordinate-radius fallback (nearby Wikidata items with P625 near the location's lat/lng) for the 116 no-match rows | Script | Fixes the Barcelona/Matterhorn-class bug — expect this to recover a meaningful chunk of the 116 into Tier A/B mechanically |
| 9. Tier C residue | Whatever's left after step 8 — manual/vision web research per location | Frontier model (judgment: no structured signal left to lean on) — small, bounded batch | This is genuinely hard, ambiguous work; don't route it to a free/light model and don't let it balloon in scope |
| 10. Final assembly | Merge batch1(fixed) + Tier A + Tier B + Tier C into one `image-fixes-final.json`, diff against `locations.json`, apply in one commit | Script | Sean's requirement: one complete patch, not piecemeal |
| 11. 390px visual QA | Screenshot sample at 390px viewport | Playwright script (pattern already exists at `~/workspace/map-game/shots/passport/pp-shot.mjs`) | Required check before calling this done |

**Routing summary:** steps 1–4, 6, 8, 10 are pure data/script work — no model needed at all, let alone a frontier one. Steps 5 and 7 are bounded, structured vision checks (good fit for a cheap/light vision model, not Opus/Sol) run at scale but with a narrow yes/no/flag task. Step 9 is the only place genuine open-ended judgment is needed, and it should be a small bounded list by the time we get there (step 8 should shrink it well below 116).

**Review-before-scale gate (per existing convention in this workspace):** before running steps 2–5 across all 849 Tier A rows, run them on a **pilot of 40–50** spanning FAIL-auto/UNSURE/SOFT-FAIL and multiple regions, get it reviewed (including a manual look at the actual rendered images, not just the JSON), and only then scale to the full 849. Same pattern for Tier B before its 225.

---

## 4. Validation checklist (every candidate, every tier, before it enters the final patch)

1. Domain is `upload.wikimedia.org` or `commons.wikimedia.org` — no other host.
2. Thumbnail width is `500px` (proven to resolve; matches existing dataset convention) — never reuse batch1's broken `640px`.
3. Live `HTTP 200`, `content-type: image/jpeg|png|...`, body is not an HTML error page.
4. File extension in `{jpg, jpeg, png, tif, tiff, webp}` — never `svg`, `gif`.
5. Filename/categories don't match `flag|coat of arms|seal|emblem|logo|crest|map of|locator map`.
6. Geo check: `wd_km`/`geo_km` under the type-appropriate tolerance already defined in `triage.py` (`tolerance_for()`), country matches.
7. No two locations share the same final image URL (global uniqueness — Sean's "unique postcard" requirement, enforced for the whole dataset at merge time, not just within the batch being generated).
8. For `wd_type == "city"`/neighborhood: the photo's subject isn't itself a distinct entry elsewhere in `locations.json` (cross-check subject/filename tokens against all `short` fields) — avoids "double-counting" a landmark as both its own location and a city's generic photo.
9. Vision pass confirms "plausibly this place, not misleading" (step 5/7/9 above).

Any candidate that fails and has no fallback within its tier gets logged to an explicit **unresolved list** rather than forced through with a weak guess — consistent with "a wrong photo is worse than no photo."

---

## 5. Final patch shape

One file, `assets/image-audit/image-fixes-final.json`, same shape as batch1 (`{id: {old, new, source, evidence}}`), containing:
- batch1's 125 (with the width fix applied)
- Tier A's 849
- Tier B's resolved subset of 225
- Tier C's resolved subset

Plus `assets/image-audit/unresolved.json` listing anything that couldn't clear validation — for Sean to decide (see open questions).

One script applies `image-fixes-final.json` to `assets/locations.json` as a single commit (one JSON diff, one write) — not applied piecemeal across tiers as they're generated. 390px screenshot sampling runs against the post-patch build before it's called done.

---

## 6. Open questions for Sean (stopping to ask, not guessing)

1. **Tier C residue:** after search-pass-2 (step 8) and manual research (step 9), some locations will likely still have no safe photo. Options: leave the existing (flagged-bad) image, show no image/placeholder, or drop the location from rotation. Which do you want — this is a product call, not an engineering one.
2. **Width/domain standardization:** OK to standardize every replacement (including batch1) on `upload.wikimedia.org/.../500px-...`, matching the existing dataset convention, rather than introducing a new size or `thumb.wikimedia.org`'s utm-tagged URLs?
3. **Vision QA budget:** step 5 runs a cheap vision model over all 849 Tier A candidates (bounded/structured task) — confirm that's the right place to spend vision-model calls versus sampling a subset.

Nothing above has been applied — `locations.json`, `triage.json`, and `image-fixes-batch1.json` are all unmodified. This document is the plan only.
