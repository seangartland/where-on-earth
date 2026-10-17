# Coast preview report

- Ported the verified prototype coast cleanup to `src/globe/surface.js`.
- `?coast=1` enables the distance-based legibility fade. `?coast=2` and
  `?coast=3` additionally flatten open water at 0.55 and 0.85 respectively.
- No `coast` parameter preserves the shipped output: legibility uses a fade
  factor of 1.0 and water flattening uses a blend factor of 0.0.
- Verified with `node --check src/globe/surface.js` and `git diff --check`.

## Render attempt

The four-load, 390 px harness was adapted from
`shots/passport/coast-locked.mjs` and run against this clone. Chromium exited
before opening a page because this environment denies its Crashpad socket
operation (`setsockopt: Operation not permitted`, followed by `SIGTRAP`). No
renders were produced, so visual inspection remains required in an environment
where Chromium can launch. The harness writes its intended output to
`shots/coast-preview/`.
