# Image URL upgrade lane report

Bank filename used: `assets/locations-bank.json`

## How this completed

The dispatched lane (codex-run, gpt-5.6-terra) live-checked all 934 of its candidate URLs from inside its sandbox, where egress was broken; every check failed on connectivity, so it correctly rewrote nothing and flagged everything as generation-failed. The orchestrator completed the pass directly from the VM. Two findings changed the brief's target along the way:

1. **1024px is not a servable Wikimedia width.** Direct hotlink requests at non-standard widths now return HTTP 400 ("Use thumbnail sizes listed on https://w.wiki/GHai"). The standard sizes are 20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840. Verified live: 1024, 800, 640, 1000, 2000 all return 400; 250, 500, 1280 return 200.
2. The target therefore became **1280px** (the standard size at or above the 1024 goal; phone cards display at roughly 1,050 device px, so 1280 serves them without upscaling). Entries whose originals are 960 to 1279px wide target 960px, the best standard size their original supports.

## Counts (orchestrator pass, files as banked)

| Measure | Count |
| --- | ---: |
| Examined | 1,282 |
| Rewritten | 940 (903 to 1280px, 37 to 960px) |
| Already large (served 1280+) | 277 |
| Already at best standard size | 8 |
| Flagged no larger version | 50 |
| Flagged original width unknown | 3 |
| Non-Wikimedia (untouched) | 3 |
| Quarantined skipped | 1 |

## Verification

- Every one of the 940 rewritten URLs was live-checked from the VM before applying: HTTP 200 with an image content type, descriptive user agent, concurrency 4, retries with backoff. 940 of 940 passed; zero generation failures, so no rewrite had to be reverted.
- Diff purity, parsed comparison: assets/locations.json changed only the `image` field on 527 entries; assets/locations-bank.json only the `image` field on 413 entries (the bank file's clue differences against the older branch baseline are the separately banked clue country-drop, not this pass). Entry counts unchanged: 803 cities, 479 bank.
- `re-source-flag.json` holds the 53 flags (50 no larger version, 3 original width unknown) for the later re-sourcing pass.

Test expectations changed: none.

Suite result: `node --test "test/*.mjs"` in the build clone, 154/154 pass (the lane's earlier 34-test figure was a subset count from its sandbox).
