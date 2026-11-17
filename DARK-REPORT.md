# Dark account theme report

## Theme work

The shared `--mail-*` tokens remain unchanged. The account, profile, cabinet,
and customize panels now redefine them locally as follows:

- `--mail-paper`: `linear-gradient(165deg, #101a30, #0a0f1e)`
- `--mail-ink`: `#f5fbff`
- `--mail-ink-2`: `rgba(207,230,255,.78)`
- `--mail-gold`: `#ffc76a`
- `--mail-stamp`: `#16233f`
- `--mail-ring`: `2px solid rgba(157,211,255,.35)`

Literal-color fixes are all scoped to those panels. The account title, friends
rows, share row, inputs, and actions now use the dark ink, line-blue, and deep
navy treatments for contrast. Profile and cabinet stat, manifest, and locked
seal rules use low-alpha line-blue with ink numerals and muted labels. The XP
fill remains gold, while its card track remains unchanged. The customizer's
preview stripes are line-blue at low alpha; initials and selection controls use
the dark field treatment and gold focus or selected states. The existing navy
calling card and seal artwork were not changed.

## Capture harness

`shots-ux/capture.mjs` accepts `DARK_SHOTS=1` and writes its six existing
390x844 surfaces to `shots-dark/`. Running `DARK_SHOTS=1 node
shots-ux/capture.mjs after` could not launch Chromium in this sandbox.
Chromium exited with `SIGTRAP` after crashpad reported `setsockopt: Operation
not permitted`, so no captures or result JSON were created.

## Verification

- `node --check shots-ux/capture.mjs`: passed.
- `node --test test/*.test.mjs`: 17 passed and 1 failed, across 18 test files.
  The failing file was `test/friends-data.test.mjs`; no test files were changed.
- `git diff --check`: passed.

## Git state

The sandbox makes `.git/refs` read-only. `git switch -c dark-theme-build`
failed because Git could not create `refs/heads/dark-theme-build.lock`.
Accordingly, no branch or commits could be created. The working tree contains
the complete source and report changes.
