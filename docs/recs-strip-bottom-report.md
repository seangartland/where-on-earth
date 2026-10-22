# Recommended home Passport strip title fix

## Change

The state difference was the start screen's `#start-streak` element. In the
fresh state its 20 px minimum height and 18 px top margin created the 38 px gap
between the More ways row and the Passport strip. In the seeded state,
`.start-screen.has-passport .streak` set that element to `display: none`, so
the gap disappeared. With the stack vertically centered, losing 38 px moved
the seeded title down by 19 px.

The `.home-recs` rules now hide the start-screen streak in both states and put
the same 38 px top margin directly on the always-visible Passport strip. The
116 px bottom-padding reservation remains the matching reservation: fresh
geometry is unchanged, while seeded geometry gains the missing 38 px and
centers 19 px higher. The default home is untouched. The strip remains the
last child of the start-screen stack and keeps its existing content and tap
behavior.

At 390x844, the orchestrator's pre-fix measurements and the resulting target
geometry are:

| State | h1 top | More ways | Gap above strip | Strip |
| --- | ---: | --- | ---: | --- |
| Fresh, before and target | 157 px | 422 to 484 px | 38 px | 522 to 587 px |
| Seeded, before | 176 px | 441 to 503 px | 0 px | 503 to 568 px |
| Seeded, target | 157 px | 422 to 484 px | 38 px | 522 to 587 px |

## Capture harness

`shots/recs-strip-title-verify.mjs` follows the requested capture setup:

- Playwright from `/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs`
- Chromium from `/opt/meta-chromium/chrome`
- the three specified Chromium flags
- route interception for `game.local`, with every other host aborted
- 390x844 viewport, DPR 2, mobile and touch enabled
- a 3.5 second wait before DOM measurements
- seeded storage under `where-on-earth-passport-v1`
- real IDs from `assets/locations.json`: `aberdeen-scotland`,
  `abidjan-ivory-coast`, and `abu-dhabi-ae`

The harness reads the h1, More ways, and Passport strip bounding boxes, checks
their DOM order, records the strip text, and is set to write fresh and seeded
captures under `docs/recs-strip-bottom-proof/`.

## Verification status

The required browser proof could not be produced in this managed execution
sandbox. Chromium previously exited before creating a page with `SIGTRAP`
after:

```text
crashpad/util/linux/socket.cc:45 setsockopt: Operation not permitted (1)
```

The harness remains ready for the orchestrator to run in an environment that
permits Chromium's startup socket operation. Post-change values below are
targets derived from the measured 38 px state difference, not new browser
measurements in this sandbox:

| State | Expected h1 top |
| --- | ---: |
| Default home | 157 px |
| Recommended home, fresh | 157 px |
| Recommended home, seeded | 157 px |

Static verification completed successfully with `git diff --check` and
`node --check shots/recs-strip-title-verify.mjs`.
