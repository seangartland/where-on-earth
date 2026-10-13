# Postcard modal: first-earned date only

## Scope and result

This is a display-only change in `src/main.js`. Passport visit history and its stored fields are unchanged. The postcard detail modal still renders the same photo, location name and clue, fact, best-score and closest-distance stats, hint, and share control.

Earned postcards now show exactly one history row: `Postcard earned`, formatted with the existing `longDate()` format (`en-US`, abbreviated month, numeric day and year) and sourced from `meta.ea`, the timestamp that `recordVisit()` sets once at the first earn and preserves thereafter.

Seen-only postcards already showed one first-visit row rather than several. They continue to show exactly that row, `First visited`, sourced from `meta.f` and using the same existing date formatter.

## Investigation: previous modal date behavior

Before this change, `fillPostcard()` could render at most two date rows:

1. `First visited`, from the first-visit date key `meta.f` exposed as `entry.first`.
2. A current-tier row derived from `entry.tierDates[entry.earned]`: `Postcard earned` for Near, `Bullseye` for Bullseye, or `Pinpoint` for Pinpoint. Those tier dates came from `meta.eb1`, `meta.eb2`, and `meta.eb3`; the Near date could fall back to `meta.ea`.

Consequently, an earned-once card normally showed both its first visit and first earn, even when those were the same calendar date. An upgraded card showed first visit plus the date its current/highest tier was reached; it did not show lower/intermediate tier dates. A later non-upgrade revisit did not add a row or change either displayed date.

For a Bullseye whose first visit and Bullseye dates matched, the second row received same-day handling. At widths above 390 px its label remained `Bullseye`; at widths of 390 px or less it became `Bullseye · Same day`. The formatted date was still displayed.

The modal did not render the last-visit timestamp `meta.t`, any discrete repeat-visit dates, or a `first seen` value distinct from `meta.f`. Missing date values caused their corresponding rows to be omitted.

## Before/after fixture enumeration

The examples below use the modal's existing `MMM D, YYYY` output style.

| Fixture | Before | After |
| --- | --- | --- |
| Earned once (`f: 2026-01-02`, `ea`/`eb1`: Jan 2) | `First visited — Jan 2, 2026`; `Postcard earned — Jan 2, 2026` | `Postcard earned — Jan 2, 2026` |
| Earned, then upgraded and revisited later (`f`: Jan 2, `ea`/`eb1`: Jan 3, `eb2`: Jan 8, later `t`: Jan 12) | `First visited — Jan 2, 2026`; `Bullseye — Jan 8, 2026`. The Jan 12 revisit was not rendered. | `Postcard earned — Jan 3, 2026` |
| Seen only (`f: 2026-01-02`, no earn) | `First visited — Jan 2, 2026` | `First visited — Jan 2, 2026` |

The seen-only case therefore already met the single-date rule and was retained.

## Implementation evidence

- Both detail-entry construction paths now expose `meta.ea` as `earnedAt`.
- `fillPostcard()` chooses exactly one date: `earnedAt` for an earned card, otherwise `first` for a seen-only card, and invokes the row renderer once.
- The modal no longer reads `tierDates`, constructs tier-specific date labels, creates upgrade rows, or creates responsive `Same day` labels. The orphaned modal-only styles for those renderings were removed.
- The persistence path remains intact: `recordVisit()` still stores `f`, `t`, `ea`, `eb1`, `eb2`, and `eb3` as before.

## Verification

- `node --check --input-type=module < src/main.js` passes.
- `git diff --check` passes.
- Grep of the postcard-detail path confirms one `addHistoryRow(...)` call and no modal-path occurrences of `tierDates`, `upgrade`, `same-day`, or `Same day`.
- The three fixture outcomes are enumerated above from the before and after render branches.

No deployment was performed.
