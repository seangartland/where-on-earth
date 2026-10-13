# Daily share revert report

## Scope

Restored `shareText()` in `src/main.js` byte-for-byte from `c293d7b^`. No survival sharing helpers or sharing plumbing were changed.

## Verification

- `node --check --input-type=module < src/main.js` passed.
- Extracting and executing both the restored `shareText()` and the `c293d7b^` original in Node reported:

  ```text
  function source byte-identical: true
  worked output identical: true
  ```

- The shared five-round fixture produced this identical result from both functions:

  ```text
  Where on Earth?
  October 12, 2026

  Final Score: 2250

  1000 🎯
  800 🏆
  500 🙂
  400 🙂
  100 😅

  Can you beat me?
  https://where-on.earth
  ```

- `rg -n -A24 '^function survivalShareText\\(\\)' src/main.js` confirmed that both branches of `survivalShareText()` still return `formatGameShare(...)` and its `shareResult(...)` caller is unchanged.
- `git diff --check` passed.

No deployment was performed.
