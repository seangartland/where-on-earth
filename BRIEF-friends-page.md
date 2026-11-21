# Brief: Friends page inside the profile (Codex terra build lane)

Sean's request (2026-11-21): add a page to the profile that shows the
friends list, each row showing the friend's customized seal, banner, title,
and level; and make that page the place where you add friends.

## Part 1: worker payload (account-worker/src/friends.js)

Extend the GET /v1/friends response. Today listFriends returns per friend
only { friendId, displayName, since }. Each friend entry gains:

- `level`: the friend's traveler level, computed with the SAME level logic
  the progression profile uses (find and reuse the worker's existing
  profile/level helpers; do not duplicate the XP curve).
- `loadout`: { titleId, cardId, avatar } from profile_loadouts for that
  friend, with the same defaults the profile endpoint returns when no
  loadout row exists (default seal etc.). The friends Daily query in this
  file already joins avatar_json and runs normalizeSeal; follow that
  pattern for seal normalization and achievement-gated fields if the
  profile endpoint applies it.

Keep the existing fields and response shape otherwise. One query or a
bounded set of queries for the whole list; no per-friend round trips beyond
a single join. Update or add worker tests for the new payload (the worker
test suite lives under account-worker/; note there is one pre-existing
unrelated failing test about the share image, og-v3 vs og-v4: leave it
alone and say so in your report).

## Part 2: the Friends page (client, src/account/sheet.js + styles)

Entry and placement (Sean directed this placement):
- On the player's own traveler profile, replace the current invite block
  with a Friends entry: a row showing a friends icon/label and the friend
  count, tapping it opens the Friends page as a sheet page in the same
  dark account system (follow how the sheet already does sub-pages or
  panels; if it has none, implement the page as a full sheet view with a
  back control, matching existing sheet navigation patterns).
- The invite link UI moves to the Friends page (it stops living on the
  profile itself).

Friends page contents, top to bottom:
1. Header: "Friends" and the count (respect the existing 50 friend limit
   in copy only if the profile already states it somewhere; do not invent
   new limit copy).
2. Add friends section: the invite link with Copy and Share actions,
   using the existing invites endpoints and the same share/copy behavior
   the profile's invite block has today. Keep the existing referral line
   verbatim: "Earn 25 XP when a friend joins and finishes their first
   Daily, up to 5 friends."
3. The friends list, one row per friend:
   - their banner: render their cardId design the same way the traveler
     profile header renders a banner (find that renderer and reuse it;
     the row may use the banner as a band behind or above the row
     content, following the profile's visual language, dark theme).
   - their seal: render from their avatar config and display name with
     the SHARED seal renderer (progression-view.mjs / sheet.js seal
     code). No local reimplementation of seal, banner, or title logic.
   - display name, their title (resolve titleId, including the
     level-two title case, through the same title tables the customizer
     uses), and a level badge "Level N".
   - Rows are display-only UNLESS sheet.js already has a view-another-
     player profile path; if it does, tapping a row opens that friend's
     profile through it. If it does not, leave rows non-interactive and
     state that in your report.
4. Empty state when the player has no friends: a short line plus the add
   section above it carries the page. Keep it to one line of copy.

If remove-friend UI exists anywhere in the client today, keep it working;
if it lives on the profile, move it onto this page (a quiet per-row
action with a confirm). If none exists, do not build one.

## Constraints

- Reuse shared renderers and tables for seal, banner, and titles; the
  centralization rule: shared treatments live in the shared module.
- Dark account theme, consistent with the other profile pages. No paper
  styling (paper is only for postcards, packs, and the passport dex).
- One GET /v1/friends when the page opens renders everything; no
  per-friend fetches.
- Game suite `node --test "test/*.mjs"` must pass; add a client test if
  the row-rendering logic is extractable in the repo's test style.
- Visual proof: harness captures (shots-ux/capture.mjs pattern, mocked
  account APIs) of the Friends page at 390x844 with at least three seeded
  friends carrying distinct seals, banners, titles, and levels, plus the
  empty state. Save captures in the repo under docs/friends-page-evidence/
  and reference them in the report. The mocked /v1/friends response in
  your harness must use the NEW payload shape from Part 1.

## Report and banking

Write LANE-REPORT.md in the repo root: what changed per part, the exact
new /v1/friends payload shape with one example friend entry, suite
results (game + worker), capture file names, whether row-tap-to-profile
was wired or not and why, and every deviation from this brief. Commit in
logical commits on this branch (friends-page). Do not deploy anything
(neither the game nor the worker); the orchestrator banks and deploys.
