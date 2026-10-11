# Zoom smoothness: analysis and proposal

Opus 5.5, 2026-10-10. Based on reading `demo/src/main.js` plus a small numeric
model of the camera geometry (node, the formulas below). I have **not** tested
any of this on a device. The ranking of causes comes from the math, not from
watching the app.

## How zoom works today

| Piece | Location | What it does |
|---|---|---|
| `MIN_DIST = 1.24`, `maxDist = fitDist * 1.55` | `main.js:60`, `main.js:2157` | Distance limits. On a 390-px portrait phone `fitDist` ≈ 5.5, so altitude runs from 0.24 to ~7.6 (about 32×). |
| `zoomTo(from, factor)` | `main.js:2177` | Scales **altitude** (`dist - 1`) by `factor`, then clamps. |
| Pinch | `main.js:2241`, `main.js:2287-2289` | `targetDist = zoomTo(pinch.dist, span0 / span)`, with the base fixed when the pinch starts. |
| Wheel | `main.js:2331-2340` | `targetDist = zoomTo(targetDist, exp(deltaY * unit))`. |
| Damper | `main.js:7337` | `dist = damp(dist, targetDist, 9, dt)`: exponential, **linear in dist**. |
| Anchor | `main.js:7348` → `applyDrag` | While fingers are down, the grab solve runs every frame and keeps the surface point under the centroid. The camera always looks at the globe centre. |

What is already right: the zoom *target* works in log-altitude, so one pinch
ratio or wheel notch gives the same scale change at any depth. The tile/inset
code (`main.js:1234-1256`) only reads `dist` and never writes it, so there is no
tile-level snapping. The cause is the four issues below.

## Why the rate feels inconsistent

### 1. The damper eases in linear distance, but zoom is perceived in log-altitude (main cause for jumps)

Map scale goes with `1/altitude`, so the zoom speed you see is
`d ln(dist-1)/dt`. The damper closes a fixed fraction of the *linear* gap per
second. That makes the speed you see depend on where you start and which way
you're going. Initial perceived speed (λ = 9) after a step change of target:

| Altitude from → to | Linear damper (today) | Log-space damper |
|---|---|---|
| 0.24 → 2 (zoom out from deep) | **66 /s** | 19 /s |
| 2 → 0.24 (zoom in to deep) | **7.9 /s** | 19 /s |
| 0.24 → 7.6 (deep → full globe) | **~280 /s** | 31 /s |
| 7.6 → 0.24 | **~8.6 /s** | 31 /s |

Zooming out from close in is a violent jolt that slows sharply. Zooming in
starts gently and drags on at the end. The same input feels different
depending on depth and direction. This shows most on wheel bursts and when the
game retargets `targetDist` in big steps (e.g. `main.js:5130`, the post-reveal
`fitDist * 1.05`, and `main.js:4728`).

For a steady pinch the linear damper behaves fine: the lag ratio settles to a
constant `1 + k/λ`. Pinch suffers mostly from #2 and #3.

### 2. Pinch is lagged ~110 ms, and the lag finishes about the wrong point

While fingers are down, `targetDist` follows the fingers and `dist` trails it
(time constant 1/9 s). The per-frame grab solve hides this by re-pinning the
point under the centroid. When the fingers lift, `pointers.size === 0`, so the
anchor goes away (`main.js:7348`), but the damper still has some zoom to finish.
That leftover zoom happens about the **screen centre**, not where the fingers
were. The map slides outward or inward from the pinch spot, and zoom keeps
moving after the hand has stopped. How much it moves depends on how fast the
pinch was. The result is a little extra drift with a different size on every
gesture.

### 3. Pinching past a limit creates a dead zone

`pinch.dist` is set once in `resetAnchor` and every move computes
`zoomTo(pinch.dist, span0/span)` from it. If you pinch past `MIN_DIST` or
`maxDist`, the clamp holds `targetDist` at the wall, but the ratio keeps
growing. When you reverse, nothing happens until the fingers undo all the
overshoot, and then zoom suddenly starts again. Near the deepest zoom (where
players inspect islands) and at full-globe view, this reads as "zoom stops
responding, then jumps."

### 4. Off-centre pinches scale faster than the fingers when zoomed out (minor)

`span0/span` maps exactly to altitude, which is exact only at the **screen
centre**. At other spots on screen, the local scale also depends on the slant
range and how obliquely you see the surface. I modelled the change in local
scale at a fixed screen angle for one 0.8× pinch step, relative to the centre
(1.00 = matches the fingers):

| dist | 4° off-axis | 8° | 12° | 17° (vertical edge) |
|---|---|---|---|---|
| 5.5 (fit) | 1.02 | 1.12 | off disc | off disc |
| 3.0 | 1.00 | 1.01 | 1.03 | 1.13 |
| ≤ 2.0 | 1.00 | 1.00 | 1.00 | ≤ 1.01 |

This effect really is about *where on the globe* you pinch, but it only matters
zoomed out, near the limb. It is up to ~12% per step and zero at play
altitudes. It is real but secondary.

## Proposed changes (in priority order)

### A. Damp in log-altitude (fixes #1). One line at `main.js:7337`

```js
// Ease altitude in log space: map scale goes with altitude, so equal
// ratios take equal time whether zooming in or out, deep or wide.
dist = 1 + Math.exp(damp(Math.log(dist - 1), Math.log(targetDist - 1), 9, dt));
```

`dist - 1` is always > 0 (MIN_DIST 1.24, SCENE_MIN_DIST 1.32), so the log is
safe. Scripted cameras that write `targetDist` every frame
(`main.js:3876`, `3943`, `3986`, `4063`) still track it. Their easing curves
will feel a bit different, so check the bullseye snap (`main.js:3907`) and the
flight dive, which were tuned against the linear damper.

### B. Make pinch 1:1 while fingers are down (fixes #2)

The fingers already do the smoothing, so the camera should follow them
exactly. In `frame()`, just before the damper:

```js
if (pinch) dist = targetDist; // fingers drive zoom directly; no tail after release
else dist = /* log-space damp from A */;
```

Release then leaves no leftover zoom to happen about the screen centre, and
the grab solve stays exact the whole time. The wheel and scripted moves keep
the eased path. If raw touch jitter shows up on a device, use a high-λ damp
(~30) during pinch instead of a hard set.

### C. Rebase the pinch at the limits (fixes #3). In the pointermove handler, `main.js:2287-2289`

```js
if (pinch && pointers.size >= 2) {
  const span = Math.max(pinchSpan(), 1);
  const want = 1 + (pinch.dist - 1) * (pinch.span / span);
  targetDist = clamp(want, MIN_DIST, maxDist);
  // Past a limit, re-base so reversing the pinch responds immediately.
  if (targetDist !== want) pinch = { span, dist: targetDist };
}
```

(The inline expression is just `zoomTo` without the clamp. Alternatively, have
`zoomTo` return whether it clamped.) A soft rubber-band at the limits would be
nicer to the touch, but it adds a spring-back state. Start with the rebase.

### D. Optional, measure first: correct off-centre pinch gain (fixes #4)

Only worth doing if wide-view pinches still feel off after A–C. Scale the
pinch factor by the local-scale ratio at the centroid:
`factor *= S(dist, θc) / S(newDist, θc)`, where
`S(d, θ) = r / cos(incidence)` from the ray–sphere hit at the centroid's
off-axis angle θc. One fixed-point iteration is enough. A full two-finger
surface solve (keeping both grabbed points under both fingers) is the exact
version, but it's more code than a ≤12% edge case deserves.

### Not recommended

- Changing λ alone: it changes the overall speed but keeps the in/out
  asymmetry.
- Wheel zoom toward the cursor: it's a desktop nicety, not part of the reported
  problem.
- Touching MIN_DIST / maxDist: the limits themselves are uniform. Only the
  dead zone around them (C) is a problem.

## How to verify

1. Temporary debug overlay: log `ln(dist-1)` per frame and the finger
   `ln(span)` per move. After A+B, their slopes should match during a pinch,
   and the camera curve should stop within one frame of the fingers stopping.
2. Step test (wheel or `__game.zoom` then set `targetDist`): 0.24↔2 altitude in
   both directions should produce mirror-image curves in log space.
3. On the phone at 390 px: pinch hard into the floor, reverse. Zoom should
   respond on the first frame of reversal.
4. Replay the bullseye snap, flight and reveal to confirm A didn't change their
   feel in a bad way.
