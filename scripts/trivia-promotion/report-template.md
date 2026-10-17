# Trivia promotion pilot (slice 0): report

Date: 2026-10-16. Done by Claude Opus 5.5, working directly in one session with no delegation. Plan: docs/trivia-promotion-recommendation-opus.md (approved by Sean 2026-10-16). This is slice 0 only. Nothing was deployed.

## Summary

- 30 held entries went through the gate chain: 10 from each thin band (9-10, 7-8, 3-4), taken in bank order from assets/trivia-bank.json at base commit 47cbe5e among entries without `photo === 'verified'`. None were skipped or swapped.
- **25 promoted, 5 held.** By band: 9-10 promoted 7 of 10, 7-8 promoted 8 of 10, 3-4 promoted 10 of 10.
- The losses fall into two kinds. **Wrong pins** (3 entries, gate 1): gurudongmar-lake, chiefs-island-moremi and anakena-beach have pins that do not mark the place, and this pass may not move pins. **No photograph of the place exists** (2 entries, gate 3): point-nemo (open ocean) and first-barcode-scan-troy-ohio (no photo of the Troy store). No entry failed at gate 2.
- The text gates changed 20 fields across 15 entries, all of them promoted entries. Gate 2 flagged 3 clues with named competitors, and all 3 were rewritten.
- Playable pool: 432 before, 457 after. By band (1-2, 3-4, 5-6, 7-8, 9-10): 159 / 73 / 116 / 70 / 39.
- Validation script: PASS. Trivia harness: 28 of 28.

## Method

- **Selection.** `scripts/trivia-promotion/pilot-list.mjs` derives the 30 ids from the bank at 47cbe5e. An earlier run of this dispatch had left `pilot.mjs` and `pilot.json` uncommitted in the same folder. I committed them with group 1 before I noticed they were from that run. Their 30 ids are identical to pilot-list.mjs's, so they agree with the selection; that run left no other work behind.
- **Gate 1, fact and clue**, under the fact pass's rules (docs/trivia-fact-pass-report.md). `fetch-wiki.mjs` is the fact pass's fetcher pointed at the pilot ids. It cached each entry's English Wikipedia article in `scripts/trivia-promotion/wiki-cache.json`, fetched 2026-10-16. Twelve automatic resolutions were wrong (for example Pantheon resolved to the Panthéon in Paris, the Sarajevo assassination to Mysia, the Webb swim to Normandy landings, the Manchester atom entry to Adam Rutherford) and were refetched by title. Event entries got their event article appended (for example First observation of gravitational waves, Universal Product Code, Latin Bridge). Every specific claim was searched in the cached text with `grep.mjs`. A claim stayed only if the article supports it; a fact was rewritten when it did not; a clue was rewritten only when it states something false. The article's coordinates were compared with the pin. An entry whose pin marks a different place fails, because the pilot may change only fact, clue, image and photo.
- **Gate 2, uniqueness**, under docs/trivia-uniqueness-report.md's rules: name a real place that fits every fact the clue states, or PASS. As in that pass, **the competitors are my own judgments from knowledge, not lookups.** Every discriminating fact used in a rewrite comes from the cached article. Rewrites keep the question word and roughly the length, never name the answer, and use zero em dashes.
- **Gate 3, photo.** `commons.mjs` searches Wikimedia Commons and downloads the 500px thumb. **I viewed every candidate image before giving a verdict** (method V for all 25 passes). Source order: public domain or CC0 when one is usable at the game's standard, otherwise CC BY, then CC BY-SA. Where a public-domain or CC0 candidate was passed over, the verdict says why (for example hazy, a distorted panorama, a plaque close-up, a slide border). `photo-meta.mjs` copied each chosen file's license, author and 500px thumb URL from the Commons API into the verdict record, so none of those were typed by hand. All 25 URLs returned an image (HTTP 200, image content type), and none is shared with any other bank entry. URL format: `https://thumb.wikimedia.org/wikipedia/commons/thumb/<a>/<ab>/<file>/500px-<file>`, the same as the 94 bank entries with untagged thumbs.
- **Recording.** Verdicts are in a sibling file, **docs/trivia-promotion-pilot-verdicts.json** (docs/trivia-photo-verdicts.json is unchanged). There is one record per entry: per gate PASS, FAIL or NOT RUN with the reason, the competitors at gate 2, the photo file, license, author, Commons page and searches at gate 3, and every text change with before, after and why. The records are built by `record.py` from hand-written `spec-group1.json` to `spec-group3.json`. record.py copies each `before` from the base bank, so a record cannot misquote the text it changes.
- **Applying.** `apply.mjs` edits only promoted entries, as text inside each entry's block: final fact and clue, new image, then `"photo": "verified"` after the image line. Held entries stay byte-identical. It can be rerun.
- **Banking.** One commit and push per band group, before the next group started.
- **Cost.** I did not time individual entries, so this pilot gives no measured per-entry cost. The commit clock on this VM does not give usable timings either. What it does show is where effort went. Photo search was the long step for moment sites (the Troy barcode needed 7 searches to rule out). City and landmark entries usually needed one search plus one view.

## The 30 entries

{{ENTRIES}}

## Pass rates

Each gate's rate counts only the entries that reached it.

{{RATES}}

Where the losses concentrate:
- **Pins, gate 1: 3 of 30 entries.** 1 of 10 in 9-10, 2 of 10 in 7-8, 0 in 3-4. They are unrelated data errors: a pin in the wrong hemisphere (Chief's Island, latitude sign), a pin on another region (Gurudongmar, known since the fact pass), and a pin on the wrong end of an island (Anakena, 14 km off). Each is a cheap fix (move the pin to the article's coordinates) in a pass that is allowed to change pins.
- **Photos, gate 3: 2 of 27 reaching it, both in 9-10, both obscure moment sites.** One has no visible place at all (Point Nemo). The other is a building that has no photograph on Commons (the Troy, Ohio Marsh store). The other six 9-10 moment sites passed, though three of their photos show the wider place rather than the exact spot: Lake Berryessa (the lake), Calais beach (the landing is only "near Calais"), and Nipomo (the researched field, documented but not recognisable by itself).
- **Text rewrites do not lose entries.** The pilot entries were in worse shape than the playable bank. Gate 1 rewrote 16 fields on 13 of the 27 entries that passed it (the fact pass corrected 37% of playable facts). Gate 2 flagged 3 of 27 (11%, against the uniqueness pass's 12%). All were salvageable.

## Before and after: every rewritten fact and clue

All 20 changes are on promoted entries, so all are applied to the bank. The validation script checks that the bank holds exactly the final `after` text.

{{TEXT}}

## Gate 2: competitors considered

{{COMPETITORS}}

## Photo sources and licenses

License mix of the 25 photos: public domain 6, CC0 4, CC BY 8 (2.0: 4, 2.5: 1, 4.0: 3), CC BY-SA 7 (2.0: 2, 4.0: 5). The 15 CC BY and CC BY-SA photos need attribution if the game ever credits images. The author and license are in each verdict record.

{{PHOTOS}}

Judgment calls for the reviewer:
- `first-photograph-le-gras` uses an archival public-domain photograph of the house (a scan with its mount border and a pencilled inventory number), chosen over clearer CC BY-SA modern views under the public-domain-first rule.
- `first-telephone-call-boston` and `first-film-screening-grand-cafe` show commemorative markers at the site (a monument, and a hotel entrance with the plaque), so the reveal shows text. It appears only after the guess.
- `migrant-mother-nipomo` shows a field documented as the photo site. It is real and correctly placed, but it does not say much on its own.
- `first-telephone-call-boston`: the source puts the 1876 call at 109 Court Street, and the entry follows it. Other accounts place it at Bell's rooms on Exeter Place. The monument marks the 109 Court Street site.

## Projection for slices 1 to 3

Built only from the pilot's measured promotion rates per band (n = 10 per band). The ranges are 95% Wilson intervals on those rates. Ten entries per band is a small sample, so the ranges are wide.

| Slice | Band | Pool now | Target | Measured rate | Entries to run | Expected yield | Candidates left |
|---|---|---|---|---|---|---|---|
| 1 | 9-10 | 39 | all held (no surplus) | 7 of 10 (40% to 89%) | 127 | about 89 (51 to 113) | 127 |
| 2 | 7-8 | 70 | 150 (80 more) | 8 of 10 (49% to 94%) | about 100 (85 to 163) | 80 | 173 |
| 3 | 3-4 | 73 | 150 (77 more) | 10 of 10 (72% to 100%) | about 77 (77 to 107) | 77 | 273 |

- Slices 1 to 3 together: about 304 entries run (289 to 397).
- Expected pool after slice 3: 1-2: 159; 3-4: 150; 5-6: 116; 7-8: 150; 9-10: about 128 (90 to 152). Total about 703.
- Where the losses will concentrate: in 9-10, obscure moment sites at gate 3 (2 of 9 that reached it) plus pins (1 of 10). In 7-8, pins (2 of 10). In 3-4, the pilot lost nothing. Even at the low end of each range, 7-8 and 3-4 reach 150 from the candidates left.
- A pin check ahead of slice 1 would turn most gate-1 losses into promotions. The check is mechanical: compare each held entry's pin with its Wikipedia or Wikidata coordinates. It would need Sean's approval, because those passes may not change pins. The pilot cannot measure how many held entries have wrong pins beyond these 3 of 30.

## Playable pool per band after the pilot

| Band | 1-2 | 3-4 | 5-6 | 7-8 | 9-10 | Total |
|---|---|---|---|---|---|---|
| Before (47cbe5e) | 159 | 63 | 116 | 62 | 32 | 432 |
| After the pilot | 159 | 73 | 116 | 70 | 39 | 457 |

## Validation

`node scripts/trivia-promotion/validate.mjs` (can be rerun; it diffs the bank against 47cbe5e). It checks:
- the same entries in the same order, with changes only on the 30 pilot entries;
- on those, only fact, clue, image and photo changed;
- every byte outside the pilot entries' blocks is identical to the base;
- the flags added exactly match the verdicts' promoted list, and no flag was removed;
- the bank text equals the verdicts' final text, and held pilot entries are unchanged;
- gate bookkeeping: a FAIL needs a reason, NOT RUN needs an earlier FAIL, a gate-2 rewrite needs named competitors, and a photo PASS needs a file, license, author and URL;
- new images are unshared 500px Commons thumbs;
- zero em dashes in the changed text, the verdicts file and this report;
- counts reconcile.

Output:

```
{{VALIDATE}}
```

## Trivia harness

`shots/trivia/trivia-shot.mjs`, run from shots/trivia with Playwright linked in from ~/workspace/map-game/shots/hub-landmarks/node_modules (the same method as the repair pass; I removed the link afterwards). The copy at ~/workspace/map-game/shots/passport/trivia-shot.mjs is stale: it has 27 checks and the pre-flag playable rule. I started it by mistake, then stopped it before it finished, and did not use its output.

Result: **28 of 28 checks pass**, bank 1,303 entries, playable 457. The hub shows the enlarged pool ("457 clues · Best 3,013"). The drawn targets were rottnest-island (d2), sensoji-temple (d4), hoi-an (d5), hunga-tonga-2022-eruption (d7) and isdal-woman-discovery (d10). The harness draws at random and none of these are pilot entries, so the harness proves that the enlarged pool plays and that every drawn target is flagged. It does not render a pilot entry's reveal. The validator covers the pilot entries' data. shots/trivia/harness-result.json and the five screenshots are from this run.

```
{{HARNESS}}
```

## Files

- assets/trivia-bank.json: 25 entries promoted (fact, clue, image, photo only).
- docs/trivia-promotion-pilot-verdicts.json: 30 verdict records.
- scripts/trivia-promotion/: pilot-list.mjs, fetch-wiki.mjs, grep.mjs, commons.mjs, photo-meta.mjs, record.py, spec-group1.json to spec-group3.json, apply.mjs, validate.mjs, report-tables.py, report-template.md, wiki-cache.json, plus the earlier run's pilot.mjs and pilot.json.
- shots/trivia/: harness-result.json and screenshots from the harness run.

## Commits

| Commit | Content |
|---|---|
| 770481b | Group 1, band 9-10: 7 promoted, 3 held |
| 8c16951 | Group 2, band 7-8: 8 promoted, 2 held |
| 12d7eba | Group 3, band 3-4: 10 promoted |
| (this commit) | Report, harness result and screenshots |
