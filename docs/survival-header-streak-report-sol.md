# Survival header streak report

## Scope

Changed only the in-play round header for the two Survival modes. The random difficulty-band draw, bags, scoring, no-repeat behavior, best-streak storage, results, sharing, Passport behavior, Daily, Classic, and other modes are unchanged.

## Exact header markup

### Survival: Tap the Country

Before:

```js
gameEls.number.textContent = `Round ${borders.round}  Difficulty ${borders.band}/10`;
```

After:

```js
gameEls.number.textContent = `Round ${borders.round}  Streak ${borders.found}`;
```

### Classic Survival

Before:

```js
gameEls.number.textContent = `Round ${survival.round}  Difficulty ${survival.band}/10`;
```

After:

```js
gameEls.number.textContent = `Round ${survival.round}  Streak ${survival.survived}`;
```

The same assignments also run after each guess is resolved so a successful round updates the visible streak immediately.

## State source

Classic Survival uses the existing `survival.survived` field. Borders uses the existing `borders.found` field. Both fields reset to `0` when their run starts and increment only in the existing successful-round branch. A miss ends the run and does not increment either field. The header therefore reads the canonical survived count directly; there is no parallel UI counter that could drift from it.

## Verification

Passed:

```text
node --check --input-type=module < src/main.js
```

Targeted grep confirms both round-start assignments and both live reveal updates use `Streak` with the existing survived fields, with no Survival header assignment displaying `Difficulty`.
