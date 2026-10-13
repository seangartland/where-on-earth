# Hide Collections entry points for now

## Scope

Collections is temporarily unreachable from the player UI. The feature itself was not deleted or disabled: its screen, rendering, state, data, sorting, navigation functions, and event listeners remain in `src/main.js`.

No HTML or CSS change was needed. Both entry controls are created in `src/main.js`, and the existing `hidden` behavior suppresses them without altering layout or navigation logic.

## Visible entry points found and hidden

1. **Home/start screen — `🛡 Collections` button.** The dynamically created `collectionsEntry` remains appended to `.home-links`, but now has `collectionsEntry.hidden = true` at `src/main.js:6977`.
2. **Passport — Collections shield button.** The `[data-pp="collections"]` button remains in the Passport header and now carries the `hidden` attribute at `src/main.js:6992`.

The rest of the player-facing code was searched for `collection` / `collections` references. No Collections entry point exists on results, postcard summary/detail/share, stats, settings, or other game screens. The settings reset confirmation mentions that Collections progress will be erased, but it is informational copy and is not a navigation path, so it was intentionally left unchanged.

## Verification

### Module syntax

Command:

```sh
node --check --input-type=module < src/main.js
```

Result: passed (exit 0, no diagnostics).

### Hidden-entry evidence

Command:

```sh
rg -n -C 2 'collectionsEntry\.hidden = true|data-pp="collections".*hidden' src/main.js
```

Evidence:

```text
6977:collectionsEntry.hidden = true; // Temporarily hide Collections without removing its navigation wiring.
6992:        <button class="pp-share-icon" data-pp="collections" aria-label="View collections" hidden>🛡</button>
```

### Navigation trace

```text
Home/start screen
  -> .home-links
  -> Collections button exists but is [hidden]
  -> no visible Collections control can dispatch its click handler

Passport
  -> .pp-header-actions
  -> [data-pp="collections"] exists but is [hidden]
  -> no visible Collections control can dispatch its click handler

Other player screens
  -> source search found no control or call site that opens Collections
```

`openCollections()` has exactly two UI call sites, corresponding to the two hidden controls above:

```text
8292:collectionsEntry.addEventListener('click', () => openCollections('home'));
8293:ppEls.collections.addEventListener('click', () => openCollections('passport'));
```

### Underlying feature retained

Command:

```sh
rg -n 'openCollections\s*\(|renderCollectionsOverview|buildCollectionSets|collectionsEntry\.addEventListener|ppEls\.collections\.addEventListener' src/main.js
```

Evidence confirms the implementation and wiring remain present:

```text
8114:function buildCollectionSets() {
8158:function renderCollectionsOverview() {
8270:function openCollections(from = 'home') {
8271:  if (!collectionSets.length) buildCollectionSets();
8278:  renderCollectionsOverview();
8292:collectionsEntry.addEventListener('click', () => openCollections('home'));
8293:ppEls.collections.addEventListener('click', () => openCollections('passport'));
```

Reinstatement is a two-line revert: remove `collectionsEntry.hidden = true` and the Passport button's `hidden` attribute.
