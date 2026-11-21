# Friends page lane report

## What changed

- `GET /v1/friends` now includes each friend's computed traveler `level` and
  normalized `loadout`. The list query joins loadouts, total XP, and earned
  achievements for the complete list, so it does not make per-friend reads.
- The own traveler profile now has a Friends row with its count. It opens a
  dark in-sheet Friends page containing the moved invite controls, referral
  copy, sharing behavior, empty state, and the existing remove confirmation.
- Friend rows reuse the traveler card/banner treatment, shared seal renderer,
  and the customizer's title table. Row taps open the existing friend-profile
  path.

## `/v1/friends` payload

Existing top-level fields remain `me`, `friends`, and `openInvites`. A friend
entry is now shaped as:

```json
{
  "friendId": "u_ana",
  "displayName": "Ana",
  "since": 1793530000000,
  "level": 5,
  "loadout": {
    "titleId": "day-tripper",
    "cardId": "return-ticket",
    "avatar": { "v": 2, "initials": "AN", "disc": "burgundy", "motif": "globe" }
  }
}
```

Missing loadouts use the profile defaults: `traveler`, `blue-horizon`, and
the normalized default seal. The worker test seeds XP, a level-two title, an
unlocked motif, and a customized seal to cover this shape.

## Verification

- Game suite: `node --test "test/*.mjs"` — **30 passing**.
- Worker focused suite: `node test/friends.test.mjs` — **13 passing, 1 known
  unrelated failure**: the existing invite OG-image assertion expects
  `og-v3.png`, while the source already emits `og-v4.jpg`. It was left
  unchanged as directed.
- Worker broad command also has its existing environment-only `live-email.mjs`
  failure when `ACCOUNT_URL` is unset.
- `git diff --check` passes.

## Visual harness

`shots/friends-page/capture.mjs` mocks the new `/v1/friends` payload and
captures the required 390×844 seeded and empty states to:

- `docs/friends-page-evidence/friends-seeded-390x844.png`
- `docs/friends-page-evidence/friends-empty-390x844.png`

This lane's sandbox denied Chromium's crashpad socket during launch, so those
two PNGs and `capture-result.json` could not be generated here. The harness
is included and is the only deviation from the requested evidence deliverable.

## Interaction decision and deviations

Row-tap-to-profile is wired because `sheet.js` already had an allowed
friend-profile path. No deployment was performed. Apart from the blocked
local screenshot execution above, there are no deviations from the brief.

## Orchestrator verification addendum (2026-11-21)

- Independent reruns: game suite 133/133; worker friends suite 13 pass plus
  the same known stale og-v3 assertion (code emits og-v4.jpg).
- Capture harness fixed by the orchestrator: it stubbed only the
  workers.dev API host while the client calls api.where-on.earth; with both
  hosts stubbed, both captures generated and sighted by the orchestrator.
- Bug found in review and fixed before banking: mountFriendSeals read
  data-friend-id from the row button, but the id lives on the list item, so
  every row rendered the default navy seal. The lookup now reads the id from
  the closest list item; the recapture shows each friend's own disc color,
  initials, motif, and level ring metal. The empty-state copy also lost an
  em dash ("No friends yet. Invite someone...").
