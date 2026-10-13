# Stats and Passport emoji removal

Removed the leading emoji and following space from the two visible home-screen entry buttons:

- `statsEntry`: `📊 Stats` → `Stats`
- `passportEntry`: `🛂 Passport` → `Passport`

No separate visible Stats or Passport button instances were found on other screens. The hidden Collections button remains unchanged, as do button order, styling, and click behavior.

## Verification

- `node --check --input-type=module < src/main.js` passes.
- Searches confirm the active labels are exactly `Stats` and `Passport`, and that the old emoji-prefixed strings no longer occur in active source.
- The scoped diff contains only the two intended label changes plus this report.
