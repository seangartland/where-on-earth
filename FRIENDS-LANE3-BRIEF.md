# Brief: Friends on the Daily, lane 3 of 4: account sheet Friends section and invite flow

Work in this worktree: /home/hatch/workspace/map-game/woe-friends-lane3. The full design is FRIENDS-DESIGN.md in this directory (approved by Sean). Lane 1 (worker schema and endpoints) is DONE and banked on main at 9abe08a; its report is FRIENDS-LANE1-REPORT.md in this directory. Build ONLY lane 3: the account sheet Friends section and the invite acceptance flow (design section 5, account sheet and opening an invite link). Do not touch src/game/round.js, src/modes/, or the worker. Lane 2 (client data layer, src/account/friends.js) is running in parallel in a different worktree: build against the lane 1 HTTP contract via accountApi directly where needed, do NOT create src/account/friends.js yourself, and note in your report any place you called the API directly that lane 2's management wrappers should later own.

## Sean's five rulings (2026-11-01, all as the design suggested)
1. Friend cap: 50 per account, enforced server-side on accept (FRIEND_LIMIT); surface that error plainly if accept returns it.
2. Sharing opt-out is symmetric: the "Share my Daily pins with friends" toggle, off, also stops the player receiving friends' pins. Say so in the toggle's small print.
3. Display names: email-only accounts are asked for a name before their first invite or accept. Google-backed accounts default to the first word of the Google profile name (server provides the default in the profile). NAME_REQUIRED from the server is the backstop, not the primary flow.
4. Retention: stored guesses are KEPT; nothing in the sheet suggests deleting guess history.
5. Pin popover (lane 4) shows name, distance, and score recomputed client-side; not part of this lane.

## Banking note from lane 1
Lane 1's migration was banked as account-worker/migrations/0003_friends.sql (0002 is the Google auth exchange migration). Worker routes on main: GET /v1/friends returns exactly { me: { displayName, sharePins }, friends: [{ friendId, displayName, since }], openInvites }; POST /v1/friends/profile { displayName?, sharePins? }; POST /v1/friends/invites returns { token, expiresAt } (409 NAME_REQUIRED, 429 INVITE_LIMIT); POST /v1/friends/invites/preview { token } returns { inviterName } (404 INVITE_INVALID for unknown, used or expired); POST /v1/friends/invites/accept { token } (404 INVITE_INVALID, 400 SELF_INVITE, 409 FRIEND_LIMIT, 409 NAME_REQUIRED); POST /v1/friends/remove { friendId } returns 204 either way. Display names: trimmed, 1 to 20 Unicode characters, no control characters; escape on render with the existing escapeHtml pattern.

## Current code ground (read in this worktree before writing)
- src/account/sheet.js: render states email, code, signed-in; the signed-in state is a "Progress saved" card. Note this worktree's sheet.js already carries the current Google sign-in flow from main; preserve all of it exactly outside the Friends additions.
- The Google redirect path: design section 5 notes the redirect callbackURL must carry ?accounts=1&friend=<token> when a pending invite exists, and preserve accounts=1 generally in the dark build. Check how the current main code builds its return URL and preserve the pending friend token through it if the hook is in sheet.js; if the return URL is built elsewhere, note it in your report instead of editing outside your files.
- Close buttons and controls reuse the existing shared classes (icon-close, primary, text-button, settings segmented and toggle styles); no new one-off button styles. Shared UI stays shared.

## Build (design section 5, copy exactly as written there)
The signed-in state grows a Friends section beneath the existing "Progress saved" copy:
- "Your name for friends" inline edit; required before the first invite or accept (ask in place when displayName is unset and the player taps Invite or Add).
- "Invite a friend" button: creates an invite via the API and opens the share sheet (navigator.share with the URL https://where-on.earth/?accounts=1&friend=<token>, built client-side from the returned token); copy-link fallback with a "Link copied" status line. Small print: "Links work once and expire in 7 days."
- Friends list: name and a remove control per row, confirm in place: "Remove Ana? You'll stop seeing each other's pins." (with the actual friend's name). Empty state: "No friends yet. Invite someone to see their pins on the Daily reveal."
- Toggle: "Share my Daily pins with friends", on by default, wired to sharePins via the profile route.
- Invite acceptance flow: when a pending friend token exists (lane 2 reads ?friend= at boot in src/main.js and holds it in memory; that file is lane 2's, so read the pending token through a defensive optional hook: if a global or module accessor lane 2 provides is absent, also check a window-level value and degrade gracefully), the sheet opens on an "Add <inviterName> as a friend?" card from preview, with Add and Not now. Signed out: the sheet opens on the sign-in step with the line "Sign in to accept a friend invite" (preview needs a session, so the inviter's name shows only after sign-in), and the accept card follows completeSignIn. Handle INVITE_INVALID with one plain line that does not distinguish unknown, used, or expired.
- Styles: the matching account sheet CSS only, reusing existing classes and tokens; the sheet must fit a 390px phone width.

## Verification
- Run: node --check src/main.js AND node --check --input-type=module < src/main.js; node --test test/*.test.mjs (all passing).
- Capture the signed-in sheet with the Friends section at 390px using the existing shots harness pattern if it can be driven without a live worker (stub accountApi responses); if it cannot, say exactly why in the report and what remains unverified. Name the harness's blind spots.
- Write FRIENDS-LANE3-REPORT.md: what was built, where the pending-token hook expects lane 2 to land, test and capture results, and anything lane 4 or the banking step needs to know.
- Zero em dashes in all written output. Do not deploy anything. Do not commit (your sandbox .git is read-only; the orchestrator banks the worktree).
