# .build-tmp/ review (2026-10-07)

**Method:** I ran a direct filesystem inventory (`find`/`du`), checked byte-for-byte duplicates with `cmp` against `assets/`, cross-checked against `git log` and git status, read `difficulty-measured/README.md` and `difficulty/SPEC.md`, and grepped for path references. No agents were used and nothing was deleted or moved.

**State:** 941 MB, ~8,970 files. 94% of the size is three regenerable dirs: `image-audit/cache/` (597 MB), `sets/.venv/` (251 MB), and `difficulty/ne/` (33 MB). `.build-tmp/` is **not in `.gitignore`**. Its files show up as untracked in `git status`, so one careless `git add .` would commit 941 MB.

**Short answer to Sean:** Don't bundle. Git history already holds every result that shipped, so a tarball would only preserve scratch. The one thing worth saving is the **measured-difficulty pipeline**. It produced the committed scores (`6f90b93`), and `.build-tmp/` holds the only copy of its code. Move it out, keep the image-audit cache until that audit is closed, and purge the rest (~340 MB now, ~940 MB once the image audit closes).

---

## 1. MOVE to a permanent location (now the source of truth)

### Measured-difficulty pipeline → `scripts/difficulty/`
The scores in `assets/locations.json` came from these scripts: 1,920 of 2,000 rows match `difficulty-full.json` exactly. These scripts are the only copy. The framework doc (`difficulty-framework.md`) is already gone from the whole workspace, so `README.md` and `SPEC.md` are now the only written record of the framework's rules and decisions.

Move from `.build-tmp/difficulty-measured/`:
- Code: `country_span.py`, `warm.py`, `extent.py`, `score.py`, `oversize.py`, `pins.py`, `wiki.py`
- Docs: `README.md`. Also move `.build-tmp/difficulty/SPEC.md` and rename it `SPEC-v1.md`. It paraphrases framework §2/§3, which is now lost.
- Inputs: `geo-anchors.json`, `primate-cities.json`, `country-familiarity.json`
- Outputs not yet in assets: `extent.json`, `oversize-features.json`, `pin-suspects.json`
- Network caches (make reruns free and resumable): `pageviews-cache.json` (1 MB), `extent-cache.json` (3 MB). Gitignore these.
- Natural Earth inputs: move `.build-tmp/difficulty/ne/` (33 MB) to `scripts/difficulty/ne/` and gitignore it.

Paths keep working after the move. The scripts locate the demo root with `HERE/../..`, and `scripts/difficulty/` sits at the same depth. They also read `HERE/../difficulty/ne/`, which resolves to `scripts/difficulty/ne/`. The one exception is `score.py`: it writes `../difficulty-full.json`, so point it at `assets/difficulty/` before any rerun. `scripts/` isn't deployed, because `deploy.sh` only copies index/src/vendor/assets.

**Open question for Sean:** `pin-suspects.json` (6.5 KB) is a list of suspect pins from `pins.py`. I can't tell whether anyone acted on it. If not, it's an open to-do, not scratch.

## 2. KEEP for now (active work)

| Path | Size | Why |
|---|---|---|
| `image-audit/cache/` | 597 MB | Only copy of the Wikidata/Commons response cache. `assets/image-audit/EXECUTION_PLAN.md` line 13 points at it explicitly, and `triage.py` reads `HERE/cache`. The `assets/` copy of `triage.py` has no cache next to it, so it would refetch everything. Image-audit files were still changing today (`image-fixes-final.json` 20:25, `unresolved.json` 20:38). |

**Do not move this cache into `assets/`.** See the deploy warning below. When the image audit is declared closed, delete it. If it must outlive `.build-tmp/` before then, move it to `~/workspace/map-game/.cache/image-audit/`, which is outside `demo/` and never deployed, and update the path in EXECUTION_PLAN.md.

## 3. DELETE (safe)

**Exact duplicates of `assets/` (verified with `cmp`):**
- `difficulty-full.json` = `assets/difficulty/difficulty-full.json`
- `difficulty-measured/country-span.json` = `assets/difficulty/country-span.json`
- `image-audit/triage.json` (5.9 MB) and `image-audit/triage.py` = the `assets/image-audit/` copies

**Superseded by a newer copy in `assets/`:**
- `image-audit/image-fixes-batch1.json` is the Oct 6 version with 640px thumb URLs. `assets/` has the Oct 7 version with 500px URLs.

**Regenerable build junk:**
- All `__pycache__/` (root, `image-audit/`, `sets/`, `difficulty-measured/`)
- `sets/.venv/` (251 MB virtualenv)
- `pylib/` (22 MB vendored pycountry, used only by `categorize_clues.py`)
- `difficulty-measured/main-territory.npz`, `main-territory-1000km.npz` (9.5 MB, `country_span.py` rebuilds them in ~8 s)

**Logs, pilots, and rerun leftovers from finished difficulty work:**
- `difficulty-measured/*.log`, `*.pre-rerun`, `loc-before.md5`, `pilot-ids.json`, `pilot-measure.json`, `country-span-1000km.json` (the 1000 km variant was rejected in favor of 500 km)
- `difficulty-pilot.json`, `difficulty/build.log` (empty). After the moves above, the rest of `difficulty/` goes too.
- `image-audit/run.out`, `run.err`, `triage-pilot.json`

**One-off scripts for features that have shipped (all Oct 3–5, results committed):**
- Trivia backfill (`c7ac8fd`): `c2.py`, `c3.py`, `c4.py`, `cands.py`, `check.py`, `backfill.py`, `stage1.json`, `pool46.py`, `pool46b.py`, `pool46b.txt`, `build46.py`, `backfill46-draft.json`
- Trivia clue conversion (`3654067`): `categorize_clues.py`, `categorize_overrides.json`, `categorize_review.json`, `which-list.txt`
- Sets (`locations.json` now has a `sets` field on every row): all of `sets/`, including `locations.orig.json`, a pre-sets backup that git history already covers. Also `sets-map.json`, `sets-prompt.md`, `sets-run.log`, `loc-index.tsv`
- Rarity (several rarity commits through `1aa1dcf`): `rarity.py`, `rarity.patch`, `rarity-base/`, `lockfix/` (old `main.js`/`style.css` snapshots), `ring-check.png`
- Early difficulty and image filters, superseded by the measured pipeline and the triage: `difficulty_fixes_89.py`, `image-audit-filters.py`, `flagged-candidates.json`
- Flyover and postcard probes: `flyover-shots/`, `postcard-shots/`, `flyover-test.js`, `flyover-test.log`, `postcard-test.js`, `postcard-frames.js`, `postcard-slow.log`, `boot-probe.js`, `update-travel.js`, `challenge-test.mjs`
- `cities/`: an 11 MB GeoNames zip and a build script from Oct 3. Nothing in `assets/` uses its output.
- `prompts/`: old dispatch prompts
- `vision-qa-fs-11/`: an empty dir created today at 18:55, a stray from a vision-QA lane. The real one is in `assets/image-audit/`.

## 4. Related fixes (outside .build-tmp, flagging for Sean)

1. **Add `.build-tmp/` to `demo/.gitignore`.** Only `.fanout-tmp/` is listed now.
2. **`deploy.sh` publishes `assets/image-audit/` (41 MB) to production.** The loop `cp -r`'s every entry in `assets/` and only skips `.bak`, `og-v3.png`, and two geo files. That puts QA image folders, a 5.9 MB `triage.json`, and `EXECUTION_PLAN.md` on the public site, and `assets/difficulty/` (2.3 MB) ships too. Add `image-audit|difficulty` to the skip `case` unless the game loads them. A grep of `src/` found no reference to `assets/difficulty`.

## Suggested order
1. Gitignore `.build-tmp/`.
2. Move the difficulty pipeline to `scripts/difficulty/` (section 1) and commit it, with caches and `ne/` gitignored.
3. Delete everything in section 3.
4. When the image audit closes, delete `image-audit/cache/`, and then `.build-tmp/` itself.
