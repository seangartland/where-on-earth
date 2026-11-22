# Brief: Fold the friends page into the profile page

Where on Earth account sheet (src/account/sheet.js). Sean approved this
consolidation on 2026-11-22: the separate Friends page goes away; its
list and invite flow become a section on the traveler's own profile.

## Current state (verify against the code before editing)

- `openTravelerProfile()` renders the own profile: traveler card,
  a Friends door row (`.account-open-friends`, shows count, click calls
  `renderFriendsPage()`), XP strip, stats grid, achievements preview.
- `renderFriendsPage()` renders a separate panel view: back button,
  "Add friends" section with a display-name form (`#account-friend-name`,
  edits the same displayName editable elsewhere), Invite a friend button
  (`.account-invite`) with the invite link copy/share block, small print,
  and the friends list (`.friends-page-list`, rows built with
  `traveler-card` classes, seal mount via `mountFriendSeals()`), then
  calls `bind(...)`.
- Friend detail: tapping a friend row opens
  `openTravelerProfile(friendId)`; its back button currently returns to
  the signed-in render; the remove-friend confirm flow returns to
  `renderFriendsPage()`; `confirmRemove`'s cancel also calls
  `renderFriendsPage()`.
- Invite machinery (createInvite, showInviteLink, copyInviteLinkNow,
  inviteMessage, markInviteCopied, clearInviteGlow, loadFriends,
  showPendingInvite) must keep working exactly as today, including the
  pending-invite accept flow after sign-in.

## The change

1. Own profile gains an inline Friends section where the door row is:
   a section head ("Friends" + count), the friends list with the same
   row markup and classes as today (so seals, banner cards, and levels
   render identically), the empty state copy when there are no friends,
   and the Invite a friend button with its link copy/share block and
   small print, wired through the same handlers `bind()` uses today.
2. Delete the door row (`.account-open-friends`) and delete
   `renderFriendsPage()` as a view. Rewire every caller:
   - friend row tap still opens `openTravelerProfile(friendId)`;
   - friend profile back returns to the own profile
     (`openTravelerProfile()`);
   - remove-friend confirm and cancel return to the own profile;
   - any sign-in / pending-invite path that landed on the friends page
     now lands on the own profile.
3. The duplicate "Your name for friends" form does NOT move. Display
   name editing stays where it already lives on the account view.
4. Keep `friendsState` loading as is (own profile already fetches
   /v1/friends when needed). `mountFriendSeals()` must run for the
   inline rows after render.
5. CSS: style the section inside `.traveler-profile` reusing the
   existing friends list/row styles; do not fork a second copy of row
   styling that can drift. Account surfaces stay dark; the friend rows
   keep their banner-card look. Remove CSS that only the deleted page
   used, only where you can prove no other view uses it.
6. Do not change: the customizer, cabinet, friend profile content,
   worker APIs, invite link semantics (one-time, 7 days, 25 XP copy),
   or any game code outside the account sheet and its styles.

## Verification

- Full suite: `node --test "test/*.mjs"` from the game root must pass.
  If a test asserts the old friends page structure, update it to the
  new structure and list each such test in the report.
- Grep proof in the report: no remaining references to
  `renderFriendsPage` or `account-open-friends` in src/.
- Boot the game in the local harness (or a static render of the sheet
  with the real CSS if the harness is impractical) and capture the own
  profile at 390x844 showing the inline Friends section with two friend
  rows and the Invite button; include the capture path in the report.

## Deliverable

Phase commits on branch `friends-into-profile` plus
`FRIENDS-FOLD-REPORT.md` in this directory: what moved, what was
deleted, caller rewiring list, test results, grep proof, capture path.
No deploy. Do not touch docs/ except the report file.
