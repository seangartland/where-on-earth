# Thanksgiving and Christmas 2026 seasonal sets

## Delivered

- Thanksgiving: the full-size `leaf-cluster` seal topper, `Harvest` banner, and `Grateful Traveler` title.
- Christmas: `Winter Post` banner and `Sleigh Captain` title, alongside the existing Santa Hat and Antlers toppers from the seal-rings lane.
- Harvest is a warm amber postcard treatment and Winter Post is a snowy night postcard treatment. Both use the shared traveler-card and banner-swatch CSS, so they render in profiles and compact friend rows. Toppers remain full-mode only.
- New cards and titles are normal earned identity rewards: the customizer shows them locked until earned and the worker's existing loadout ownership check accepts them only after their reward has been earned.

## Seasonal achievements

The mechanism supports one `type:id` reward per achievement, so each new item has its own achievement and the cabinet groups them by a holiday/year-prefixed name.

- `THANKSGIVING_2026_WINDOW`: November 25–29 of the UTC current year. A canonical Daily in that window earns `thanksgiving-2026-leaf-cluster`, `thanksgiving-2026-harvest`, and `thanksgiving-2026-grateful-traveler`.
- `CHRISTMAS_2026_WINDOW`: December 20–26 of the UTC current year. A canonical Daily in that window earns `christmas-2026-winter-post` and `christmas-2026-sleigh-captain`, as well as the existing `holiday-santa` and `holiday-antlers` topper rewards.

The seasonal check remains in `processCompletion`, where the canonical Daily date is available.

## Verification

- `node --test "test/*.mjs"`: 33 passed, 0 failed.
- `cd account-worker && node --test test/progression.test.mjs`: passed, including both seasonal-window boundaries, leaf-topper ownership, and seasonal card/title ownership.
- `cd account-worker && npm test`: 3 test files passed and `friends.test.mjs` failed before reporting assertions. This is the existing unrelated worker-suite runner failure documented by the seal-rings lane.

## Capture harness

`shots/seasonal-sets/capture.mjs` stubs both `api.where-on.earth` and `woe-account.gartland-79.workers.dev`, seeds all seasonal rewards, and is set to write these 390x844 captures to `docs/seasonal-sets-evidence/`:

- `own-harvest-leaf-cluster-390x844.png`
- `customizer-banners-390x844.png`
- `customizer-titles-390x844.png`
- `friends-harvest-compact-390x844.png`

No PNGs were generated here: `/opt/meta-chromium/chrome` exits with `SIGTRAP` before Playwright can create a page because its crashpad socket `setsockopt` is denied by this sandbox. No deploy was attempted.

## Deviations

Christmas retains its two already-built topper choices rather than replacing either one; the requested new Christmas content is the Winter Post banner and Sleigh Captain title. I could not create commits because this environment exposes `.git` read-only (`.git/index.lock` cannot be created); all work remains in the working tree on `seasonal-sets` for the orchestrator to commit.
