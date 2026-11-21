# Seal rings and holiday toppers

## Delivered

- Seal configs now carry `ring` (`level`, `bronze`, `silver`, `gold`) and `topper` (`null`, `santa-hat`, `antlers`), defaulting safely for old saved seals.
- Full seals shrink their disc within the existing footprint for a topper; compact seals deliberately omit it. Traveler profiles and the customizer are full; the 54px friends list uses `{ compact: true }`. Globe pins remain unchanged.
- The Seal customizer has level-gated ring choices and achievement-gated topper choices. Silver and gold appear in the existing level unlocks at levels 5 and 10.
- Worker write validation gates silver/gold at levels 5/10 and topper ownership on the corresponding achievement. Read normalization receives the owner level when it is available (profile and friends list); where no owner level is available, it retains a valid stored ring rather than stripping it. Pin payloads expose only disc/initials as before.

## Seasonal mechanism

`HOLIDAY_TOPPER_WINDOW` is `{ startMonth: 12, startDay: 20, endDay: 26 }`. On a canonical Daily completion, `processCompletion` tests the known Daily date against December 20–26 of the UTC current year and grants both `holiday-santa` (`topper:santa-hat`) and `holiday-antlers` (`topper:antlers`). The achievements are intentionally awarded at completion time because the aggregate stats snapshot has no completion-date field.

## Verification

- `node --test "test/*.mjs"`: 33 passed, 0 failed.
- `account-worker/test/progression.test.mjs`: passed, including finish/topper validation, normalized preservation, and the seasonal window.
- The full account-worker suite has one pre-existing unrelated assertion mismatch: its invite-page test expects `assets/og-v3.png`, while the checked-in worker emits `assets/og-v4.jpg`. The seal-related friend assertions pass.

## Capture harness

`shots/seal-rings/capture.mjs` stubs both `api.where-on.earth` and `woe-account.gartland-79.workers.dev`, seeds a Santa-hat owner and antler-topped friend, and writes the three requested 390x844 PNGs under `docs/seal-rings-evidence/` when run.

No captures were generated in this lane: the supplied `/opt/meta-chromium/chrome` exits with `SIGTRAP` before Playwright can create a page because its crashpad socket `setsockopt` is denied by this sandbox. No deploy was attempted.
