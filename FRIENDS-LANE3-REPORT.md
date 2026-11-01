# Friends on the Daily: lane 3 report

Date: 2026-11-01

## Built

Expanded the signed-in account sheet in `src/account/sheet.js` with the approved Friends section:

- Inline editing for "Your name for friends", with server validation feedback.
- "Invite a friend" creation through the lane 1 API, followed by `navigator.share` when available and clipboard copy as the fallback. The client builds `https://where-on.earth/?accounts=1&friend=<token>` and shows "Link copied" after a successful copy.
- The required seven-day, single-use link small print.
- Friend rows with escaped display names and in-place remove confirmation using the actual name.
- The approved empty state.
- The reciprocal "Share my Daily pins with friends" toggle and explanatory small print.
- Plain handling for `NAME_REQUIRED`, `INVALID_NAME`, `INVITE_LIMIT`, `INVITE_INVALID`, `SELF_INVITE`, and `FRIEND_LIMIT`. The friend-cap error states the 50-friend limit.

Added the invite acceptance states:

- Signed-out invite copy says "Sign in to accept a friend invite".
- Signed-in preview asks "Add <name> as a friend?" with Add and Not now.
- An email-only account that receives `NAME_REQUIRED` gets the name field in place, then profile save and acceptance continue together.
- Invalid, expired, and used tokens share the same plain invalid-link line.
- Successful acceptance clears the sheet's token and calls optional lane 2 clear hooks when present.

The Google return URL now always preserves `accounts=1` and also carries `friend=<token>` when an invite is pending.

Added only matching account-sheet rules to `src/styles/game.css`. The implementation reuses `icon-close`, `primary`, `text-button`, and the existing settings-card visual language.

## Lane 2 integration boundary

The sheet checks the lane 2 module defensively for either `getPendingFriendToken()` or `getPendingFriendInvite()`, then checks `pendingFriendToken`. It also accepts the window hooks `getPendingFriendToken()`, `getPendingFriendInvite()`, `__woePendingFriendToken`, or `__WOE_PENDING_FRIEND_TOKEN__`.

After a successful accept it calls optional `clearPendingFriendToken()` or `clearPendingFriendInvite()` hooks on both the module and `window`. Lane 2 should expose one getter and its matching clearer. Without a hook, the ordinary account sheet still works and invite presentation degrades gracefully.

Because lane 2 was parallel and `src/account/friends.js` was not present in this worktree, this lane calls `accountApi` directly for all management routes. Lane 2's management wrappers should later own these calls:

- `GET /v1/friends`
- `POST /v1/friends/profile`
- `POST /v1/friends/invites`
- `POST /v1/friends/invites/preview`
- `POST /v1/friends/invites/accept`
- `POST /v1/friends/remove`

## Verification

- `node --check src/main.js`: pass
- `node --check --input-type=module < src/main.js`: pass
- `node --check src/account/sheet.js`: pass
- `node --test test/*.test.mjs`: pass, 14 of 14 tests
- `git diff --check`: pass

Added `shots/friends-lane3/capture.mjs`, a 390 by 844 fake-origin harness that seeds a signed-in session and stubs `GET /v1/friends` with Maya, Ana, and Jo. It checks friend names and horizontal overflow before writing `signed-in-friends-390.png`.

The capture could not run in this managed sandbox. Chromium passed the required Hatch WebGL policy check, then crashpad failed at `setsockopt` with `EPERM` and the browser exited with `SIGTRAP`. No screenshot or measured layout result is claimed. The harness remains ready for the banking environment.

Harness blind spots even when it runs:

- It mocks the account worker, so it does not prove authentication, CORS, persistence, or lane 1 response timing.
- It does not invoke a native mobile share sheet or prove iOS clipboard behavior.
- It does not perform the real Google redirect.
- It captures the populated signed-in section only. Invite preview, invalid-link, empty-list, and in-place removal states are not captured.

## Banking and lane 4 notes

- No worker, `src/game/round.js`, `src/modes/`, or lane 2 files were changed.
- No guess history is deleted or described as deleted.
- Lane 4 can open the account sheet normally for its "Compare pins with friends" action.
- The pending-token getter and clearer names should be reconciled with lane 2 before banking both lanes.
- No deployment and no commit were performed.
