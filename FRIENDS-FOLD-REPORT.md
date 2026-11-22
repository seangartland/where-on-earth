# Friends-fold report

Branch: `friends-into-profile`. Implements `BRIEF-friends-fold.md` (Sean's
2026-11-22 approval): the separate Friends page is gone; its list and
invite flow are now a section on the traveler's own profile.

## What moved

Into `openTravelerProfile()`'s "mine" render, in place of the old
`.account-open-friends` door row, a new `friendsSectionHtml()` (`src/account/sheet.js`)
returns a `.traveler-friends` section with, in order:

1. A section head reusing the existing `.traveler-section-head` pattern
   (same as the Achievements head): "Friends" + count.
2. The friends list, same markup/classes as before so seals, banner
   cards, and levels render identically: `.friends-page-list` >
   `.account-friend.friend-page-item` > `.account-friend-profile.friend-page-row.traveler-card`.
   Empty state is the same `.account-friends-empty` copy.
3. The "Add friends" block (`.friends-add`): the display-name form
   (`#account-friend-name` / `.account-name-form`) and the Invite a
   friend button with its link copy/share block and small print —
   carried over unchanged, not redesigned.

**Assumption on the name form** (brief item 3 is ambiguous): the brief
says the "Your name for friends" form "does NOT move" and "stays where
it already lives." The only place it lived was inside the now-deleted
`renderFriendsPage()`, and `createInvite()`/`saveName()` read
`#account-friend-name` directly, so the form has to exist somewhere for
invite machinery to keep working exactly as today. I read "does not
move" as "carried over unchanged, not redesigned or relocated to a
different spot," and kept it attached to the Invite button inside the
inline section, same as before. Flagging this interpretation in case
Sean meant something else.

Order differs slightly from the old page: the old friends page had
Add-friends-form-then-list; the new inline section has list-then-form,
matching the brief's item-1 ordering (head, list, empty state, invite
button).

## What was deleted

- `renderFriendsPage()` (the whole view function).
- The `.account-open-friends` door-row button and its click handler.
- The `.account-friends-back` button and its (now-dead) binding in
  `bind()`.
- CSS used only by the deleted view/door row:
  `.account-open-friends`, `.account-open-friends span:last-child`,
  `.account-panel[data-view="friends"]`, `.friends-page`,
  `.friends-page-head` (+ its 3 child-selector rules), and
  `.account-panel[data-view="friends"] .account-friends-empty`.
- Added back only the minimal new CSS needed: `.traveler-friends { margin: 0 0 22px; }`
  and `margin-top: 16px` on `.friends-add` (it used to be first in the
  page and needed no top margin; now it follows the list). Everything
  else — `.friends-page-list`, `.friend-page-item`, `.friend-page-row`,
  `.account-friend`, `.friends-add` internals, `.account-invite*`,
  `.account-friends-empty` — is reused as-is, no forked copy.

## Caller rewiring

| Caller | Before | After |
|---|---|---|
| `.account-open-friends` click (profile door row) | `renderFriendsPage()` | button deleted |
| Friend row tap in the friends list | `openTravelerProfile(friendId)` | unchanged |
| Friend profile back button | `render('signed-in', ...)` | unchanged (was never routed to the friends page) |
| `confirmRemove()` cancel | `renderFriendsPage` | `() => openTravelerProfile()` |
| `confirmRemove()` confirm | `renderFriendsPage()` | `await openTravelerProfile()` |
| Friend-profile "Remove friend" confirm | `renderFriendsPage()` | `await openTravelerProfile()` |
| Friend-profile "Remove friend" cancel | `openTravelerProfile(friendId)` | unchanged (stays on the friend's profile, not named in the brief's rewiring list) |
| `mountFriendSeals()` | called at the end of `renderFriendsPage()` | called from `openTravelerProfile()` when `mine`, after the inline rows render |
| `bind()` | called at the end of `renderFriendsPage()` and from `render()` | now also called from `openTravelerProfile()` when `mine`, so `.account-invite`, `.account-name-form`, `.account-invite-copy/share`, and `.account-friend-profile` handlers attach to the inline section |

Sign-in / pending-invite paths: checked `showPendingInvite()` and
`loadFriends()` — neither ever called `renderFriendsPage()` (they both
render the `signed-in` top-level account view, not the friends page),
so there was no sign-in/pending-invite path to rewire here.

`confirmRemove()` / `.account-remove`: this function and its CSS
(`.account-remove-copy`, `.account-remove-actions`, `.account-remove-confirm`,
`.friend-page-item > .account-remove`) were already dead before this
change — no markup anywhere creates an element with class
`.account-remove`, so `confirmRemove` was unreachable. I left the
function and its CSS in place (not asked to remove pre-existing dead
code) but fixed its two `renderFriendsPage` references since that
identifier no longer exists.

## Test results

`node --test "test/*.mjs"` from the game root: **172/172 pass, 0 fail.**

Updated test: `test/profile-flow.test.mjs`, the case previously named
"the own profile routes its friend count to the dark Friends page"
asserted the old structure (`account-open-friends`, `function
renderFriendsPage()`). Renamed to "the own profile folds the friends
list and invite flow inline instead of a separate page" and rewritten
to assert: no `account-open-friends`, no `renderFriendsPage`,
`friendsSectionHtml()` contains `traveler-friends` / `friends-page-list`
/ `friends-add` / `account-invite`, `mountFriendSeals()` + `bind()` run
together, and the existing `openTravelerProfile`/`friendsState` fetch
assertion (unchanged, still holds).

## Grep proof

```
$ grep -rn "renderFriendsPage" src/
no matches
$ grep -rn "account-open-friends" src/
no matches
```

## Capture

Booted via the local Playwright harness (pattern copied from
`shots/friends-page/capture.mjs`, mocked `/v1/friends` and
`/v1/progression`, real `src/styles/game.css`) at 390×844. Opened the
own profile directly (no separate page to navigate to) and captured it
with two friend rows and the Invite button visible inline.

- Script: `shots/friends-fold/capture.mjs`
- Capture: `shots/friends-fold/own-profile-inline-friends-390x844.png`
- Evidence JSON: `shots/friends-fold/capture-result.json`

Output was written under `shots/` rather than `docs/` per the brief's
"do not touch docs/ except the report file."

In-script assertions that passed before writing the capture: exactly 2
`.friend-page-row` elements, `.account-invite` present, no
`.account-open-friends` or `.friends-page` anywhere in the DOM, no
horizontal overflow at 390px.

## Not done

No deploy, per the brief. Nothing outside the account sheet and its
styles was touched (customizer, cabinet, friend profile content, worker
APIs, invite link semantics all untouched).
