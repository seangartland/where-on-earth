# Daily share text condensation

Updated `shareText()` so the daily share begins with `https://where-on.earth` and ends with the five per-round score lines.

The date, blank-line spacing, unformatted final score total, and per-round `<base> <scoreEmoji>` output remain unchanged. Survival and other sharing functions were not modified.

## Verification

- `node --check --input-type=module < src/main.js`
- Executed `shareText()` with the approved five-round fixture and compared its output line for line with the target block.
- Inspected the Git diff to confirm the source change is limited to `shareText()`.
