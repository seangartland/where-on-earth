# City image restoration report

Date: 2026-10-22

These five images were selected by vision QA on 2026-10-22. Of 46 Wikimedia Commons candidates, 23 passed, with the verdicts recorded in `~/workspace/map-game/openverse-pilot/qa5-verdicts.json`.

## Image swaps

### Halifax (`halifax-canada`)

- Old: `https://thumb.wikimedia.org/wikipedia/commons/thumb/5/52/Halifax_skyline.jpg/500px-Halifax_skyline.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`
- New: `https://thumb.wikimedia.org/wikipedia/commons/thumb/7/74/Halifax_Harbour_Sunset_Skyline%2C_Nova_Scotia_%2824237034620%29.jpg/500px-Halifax_Harbour_Sunset_Skyline%2C_Nova_Scotia_%2824237034620%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`
- License: CC BY-SA 2.0
- Author: Tony Webster

### Banff (`banff`)

- Old: `https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Banff_Town.jpg/500px-Banff_Town.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`
- New: `https://thumb.wikimedia.org/wikipedia/commons/thumb/5/56/Banff_from_Sulphur_Mtn_2005.jpg/500px-Banff_from_Sulphur_Mtn_2005.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`
- License: Public domain
- Author: Borbrav, no credit required

### San Antonio (`san-antonio-usa`)

- Old: `https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/Gfp-texas-san-antonio-skyscrapers-of-san-antonio.jpg/500px-Gfp-texas-san-antonio-skyscrapers-of-san-antonio.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`
- New: `https://thumb.wikimedia.org/wikipedia/commons/thumb/5/53/Downtown_San_Antonio%2C_Texas_%2812212839743%29.jpg/500px-Downtown_San_Antonio%2C_Texas_%2812212839743%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`
- License: CC BY 2.0
- Author: Jonathan Cutrer

### San Jose (`san-jose`)

- Old: `https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a3/San_Jose_California_%28128805221%29.jpeg/500px-San_Jose_California_%28128805221%29.jpeg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`
- New: `https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9a/San_Jose_California_%28128805221_cropped%29.jpeg/500px-San_Jose_California_%28128805221_cropped%29.jpeg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`
- License: CC BY 3.0
- Author: Terry Lucas

## Tucson no-change verification

The `tucson-usa` entry already uses the vision-QA winner, `Tucson_asr.JPG`, at the following URL. No field in this entry was changed.

`https://thumb.wikimedia.org/wikipedia/commons/thumb/6/68/Tucson_asr.JPG/500px-Tucson_asr.JPG?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`

- License: CC BY 3.0
- Author: Zereshk

## Validation results

- URL preflight: Before this edit, the orchestrator checked all four replacement URLs from the host shell on 2026-10-22. Each returned HTTP 200 with `content-type: image/jpeg`. The sandbox network check was intentionally skipped as instructed.
- JSON parse: Passed. `assets/locations.json` parsed successfully after the edit.
- Entry count: Passed. The parsed dataset contained 804 entries before and after the edit.
- Replacement URL uniqueness: Passed. The four replacement URLs are distinct from one another, and each occurs exactly once across the full dataset.
- Parsed before and after diff: Passed. The only changed fields were `image` for `banff`, `halifax-canada`, `san-antonio-usa`, and `san-jose`. No other entry or field changed. The parsed `tucson-usa` entry was identical before and after the edit.
- Repository checks: `npm test` ran and exited 1 because the repository's configured test script is the default placeholder, `Error: no test specified`. There is no implemented root npm test suite. The dedicated JSON parse, count, uniqueness, Tucson, and parsed-diff validations above all passed.
