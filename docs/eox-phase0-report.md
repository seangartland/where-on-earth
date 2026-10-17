# EOX Phase 0 report

## Result

`src/globe/surface.js` now selects a satellite provider record with `id`,
`tiles`, `base`, `credit`, and `maxZ`. The default is `eox2025`. Tile LRU and
missing-tile keys now begin with the provider id, so provider caches cannot
collide. The base texture is selected from the same record. `?sat=eox2025`
selects that record, and an unknown `?sat` value silently selects the default.
`?map=classic` remains independent of that choice.

The brief amendment required the existing EOX URLs to remain byte-identical.
The current record therefore retains the deployed tile template and base URL:

| Request | Provider | Base URL | Tile URLs at z4, z6, z8 |
| --- | --- | --- | --- |
| no parameters | `eox2025` | `./assets/eox-z4-base-2k.jpg` | `https://tiles.where-on.earth/tiles/4/8/5.jpg?v=3`, `https://tiles.where-on.earth/tiles/6/33/22.jpg?v=3`, `https://tiles.where-on.earth/tiles/8/134/89.jpg?v=3` |
| `?sat=eox2025` | `eox2025` | `./assets/eox-z4-base-2k.jpg` | identical to no parameters |
| `?sat=bogus` | `eox2025` | `./assets/eox-z4-base-2k.jpg` | identical to no parameters |

The audit evaluated the source-selection and template code with those three
fixed views. All three passed. The current record's credit string is unchanged.

## Credits and manifest

`deploy.sh` now copies `credits.html`; Settings links to it. The page keeps the
current attribution and has a source-section marker for a later provider.

`scripts/sat/generate-manifest.mjs` regenerates the committed
`scripts/sat/eox2025-manifest.json` from the only runtime-playable location
set, `assets/locations.json`. It generated 7,992 unique tiles for 805
locations in 3 by 3 windows: z4 149, z5 410, z6 1,007, z7 2,249, z8 4,177.
`scripts/sat/README.md` documents the amended Process API pipeline: credentials
only from the environment, low layers first, z9 last, and NASA Blue Marble gap
fill. It deliberately contains no render or upload implementation.

## R2 serving finding

`docs/r2-setup.md` identifies `tiles.where-on.earth` as an R2 custom domain
directly serving bucket objects. There is no tile-serving Worker in this
repository; the Worker sources are for account and PvP APIs. A future
`s2gm2025/` path needs objects uploaded under that prefix only. No serving-code
change is required, provided the existing custom-domain CORS policy continues
to allow the game origin. This phase did not move or copy any R2 objects.

## Verification

- Passed: module syntax checks for `src/globe/surface.js` and `src/main.js`,
  `node --check scripts/sat/generate-manifest.mjs`, `bash -n deploy.sh`, and
  `git diff --check`.
- Attempted: `scripts/regression.sh baseline`. Its first attempt could not
  write logs to the read-only shared shots directory. A second attempt used a
  writable temporary copy of the harness, but Chromium exited before loading
  the page with `setsockopt: Operation not permitted` from Crashpad. The visual
  baseline is unverified in this sandbox.
- Unverified: live deployment and `credits.html` returning 200, because this
  task does not deploy.
- Commit attempt: not possible here. `git add` and `git commit` both failed
  because `.git/index.lock` cannot be created on the read-only git mount.

## Manifest completeness addendum

The regenerated committed `scripts/sat/eox2025-manifest.json` now unions every
playable coordinate bank and resolves every classic and weekly expedition stop
through those banks before deduplicating by coordinate. It contains 1,943
unique coordinates and 10,665 unique 3 by 3 window tiles from z4 through z8:
z4 218, z5 573, z6 1,302, z7 2,871, and z8 5,701.

| Set, in union order | Unique-tile contribution |
| --- | ---: |
| `assets/locations.json` | 7,992 |
| `assets/locations-landmarks-sol.json` | 1,785 |
| `assets/trivia-bank.json` | 888 |
| `assets/expeditions.json` stops | 0 |
| `assets/weekly-expeditions.json` stops | 0 |

The expedition stops add no tiles because each resolves to a coordinate already
present in the city, landmark, or trivia bank. The total is 282 tiles, or 2.6
percent, below the production set's 10,947. That is a material but expected
gap: this manifest reflects the current playable banks, while the earlier
production manifest was known to retain tiles for locations no longer in
`assets/locations.json`; the exact provenance of every remaining production
tile is unverified. No tiles were invented to force a match. This sandbox
cannot commit, so the completed changes remain in the working tree.
