# Add friend becomes a modal on the profile

Branch: `friends-add-modal-2`. Implements `BRIEF-friends-add-modal.md` against
baseline `main` (ba55495, which already includes the earlier friends-fold
work from bc1c4bb).

## What moved

`src/account/sheet.js`, `friendsSectionHtml()`:

- The own profile's Friends section still renders the toggle context (via
  the surrounding `openTravelerProfile()` template) and the friends list
  unchanged.
- The inline `.friends-add` block (name form, Invite button, invite-link
  block, small print, status line) is gone from the profile. In its place,
  the list is followed by one primary button, `.account-add-friend`,
  labeled "Add friend".
- That same markup the inline block used to hold now lives inside a modal
  (`.account-add-friend-modal`), hidden by default, rendered as a sibling of
  the list inside the same `<section class="traveler-friends">`. All the
  functional hooks are unchanged: `.account-name-form`,
  `#account-friend-name`, `.account-invite`, `.account-invite-link`,
  `.account-invite-link-input`, `.account-invite-copy`,
  `.account-invite-share`, both `.account-small-print` lines, and
  `.account-status`. `saveName()`, `createInvite()`, `showInviteLink()`,
  `copyInviteLinkNow()`, and the share handler all query these through
  `sheet.querySelector(...)` exactly as before, so none of that logic
  changed.

## How the modal is wired

- `openAddFriendsModal()` / `closeAddFriendsModal()` (new, in `sheet.js`)
  toggle the `hidden` attribute on `.account-add-friend-modal` and focus the
  name input on open.
- `bind()` wires: `.account-add-friend` click → open; `.account-modal-close`
  (an `.icon-close ×`) click → close; a click on the modal's own backdrop
  (`event.target === the modal overlay element`) → close. This mirrors the
  existing `.account-sheet` backdrop-click pattern
  (`if (event.target === sheet) closeAccountSheet();`) and the
  `showConfirmModal`/`.confirm-modal` pattern in `src/core/dom.js`.
- Because the modal markup is part of `friendsSectionHtml()`'s returned
  string, it is rebuilt fresh every time `openTravelerProfile()` re-renders
  the panel (same as the rest of the profile template), so handlers are
  never double-bound across repeated profile loads — consistent with how
  this file already manages the whole panel's lifecycle.
- The modal never navigates away from the profile: it's an overlay on top
  of the same `.account-panel` content, so closing it (by either control)
  always leaves the own profile showing underneath, satisfying "return to
  own profile on close" without needing extra state.
- CSS (`src/styles/game.css`): replaced the old `.friends-add` container
  rules with `.account-add-friend` (full-width primary button) and
  `.account-modal` / `.account-modal-panel` (fixed-position overlay +
  centered card, same shape as `.confirm-modal` / `.confirm-modal__card`).
  The close `×` picks up `position: absolute; top: 6px; right: 6px` for
  free from the existing `.settings-card .icon-close` rule, since
  `.account-panel` carries the `.settings-card` class — verified via a
  `getBoundingClientRect()` check, not assumed.

## End-to-end flow verified

Save name → create invite → link appears → copy → status messages, all run
inside the modal against mocked API responses, plus both close paths
(close button, backdrop tap), confirmed by the capture harness below.

## Tests

- `node --test "test/*.mjs"`: **221 pass / 2 fail**, unchanged from the
  pre-existing baseline on this branch before any of this work. The 2
  failures (`test/image-mirror-transcode.test.mjs`,
  `test/image-mirror-verify-image.test.mjs`) are a missing `sharp` npm
  dependency for the unrelated R2 photo-mirror tooling landed in earlier
  commits on this branch (no `package.json`/`node_modules` for it exists in
  this checkout at all) — confirmed present on `main` before this change
  and outside this brief's scope. Everything else, including the updated
  friends-markup test, passes.
- Updated `test/profile-flow.test.mjs`: the markup-assertion test now checks
  for `account-add-friend` / `account-add-friend-modal` instead of the
  retired `friends-add` class, and asserts `openAddFriendsModal` /
  `closeAddFriendsModal` exist and toggle `hidden` as expected.

## Captures (390x844, `shots/friends-modal/`)

Harness (`capture.mjs`) follows the `shots/friends-fold/` pattern: mocks
both account API hosts (`woe-account.gartland-79.workers.dev` and
`api.where-on.earth`), seeds a signed-in session plus two friends, and
drives `openProfileSheet()`.

- `own-profile-with-add-button-390x844.png` — own profile, friends list (2
  rows), "Add friend" button, no inline form, no horizontal overflow.
- `add-friend-modal-open-390x844.png` — modal open showing the "Add
  friends" title, name form (prefilled "Maya"), Invite button, both
  small-print lines, no overflow.
- `capture-result.json` — full evidence dump: pre-open state, post-open
  state, the save-name/create-invite/link/status flow, and both close paths
  (button and backdrop), all asserted in-script (the script throws on any
  mismatch rather than just logging).

## Deviations

- None from the brief's structural requirements. The one judgment call: the
  remove-friend flow's `status(...)` calls (e.g. "Ana removed") write to
  the same `.account-status` element, which now lives inside the modal and
  is only visible while the modal is open. This is unchanged code (neither
  `confirmRemove` nor the friend-profile remove handler were touched) and
  matches the brief's explicit instruction that the status line is exactly
  what the modal holds; it does mean a removal confirmation on the main
  list is no longer visible on-screen the instant it happens, same as
  several other `status()` call sites in this file that already have no
  visible target in their current view.
