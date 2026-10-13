# Postcard share text update

Removed the “Can you beat me?” sentence from `postcardShareText(entry)` in `src/main.js`.

## Verification

- `node --check --input-type=module < src/main.js`: passed
- `grep -c 'Can you beat me' src/main.js`: `0`
- The `src/main.js` diff is limited to the requested template-string line.
- No deployment was performed.
