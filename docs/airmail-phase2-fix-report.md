# Airmail Phase 2 correction report

## Reverted shared postcard card changes

- Restored the full `.pp-post` to its dark face, visible 4:3 photo, and original compact card layout.
- Removed the Phase 2 fact, postcard-back stamp, and postmark elements from `buildPostcardCard`, along with the full-card postcard-back styling.
- Kept Phase 1's neutral `rgba(214,220,232,.16)` two-pixel frame in place of the former rarity-variable frame.
- Removed the Daily-only `stampText` input. The in-game popup and every other full postcard card again use the restored shared presentation.

## Daily summary panel

- Converted the existing Daily postcard-summary list into one cream paper panel with the shipped airmail stripe and ink-navy type.
- Existing tappable postcard entries remain bound to the same detail view. They are now ruled lines showing their existing place/flag, earned note, distance, and score.
- The existing new/upgraded counts are retained verbatim and positioned as the gold-ink stamped total at the panel's lower right.
- A client-clock short-month/day/year postmark is reserved in a padded lower-left footer. The footer is below all ruled entry lines; the count stamp is anchored at the opposite lower-right corner, so neither can overlap entries, scores, or each other.

## Approximation versus the mock

- The existing postcard summary deliberately contains only new and upgraded postcard outcomes, rather than every Daily round. This remains unchanged to preserve its current flow and its existing tappable postcard-detail behavior; no non-postcard rounds were added to the panel.
- The panel's stamp retains the screen's existing new/upgraded total wording rather than introducing the mock's separate numeric Daily score total.

## Verification

- Ran `node --check --input-type=module` for `src/meta/postcard-card.js` and `src/modes/daily-game.js`.
- Ran `git diff --check` successfully.
