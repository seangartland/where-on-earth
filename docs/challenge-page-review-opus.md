# Challenge page review (PvP home sheet)

Review only. No code, data or copy was changed. Reviewer: Claude Opus 5.5, 2026-10-16.

Sean's note: "Challenge page is still way too busy, users will bounce."

## How this was measured

- Read `src/pvp/home.js` (the whole sheet is built in `renderPvpHome` and `renderPvpList`), `src/styles/pvp.css`, the join landings in `src/pvp/h2h.js` and `src/pvp/group.js`, and the UI sections of `docs/pvp-mode-plan-sol.md` and `docs/pvp-group-spec-sol.md`.
- Looked at the existing harness shots (`p1-01-home`, `p1-03-home-identity`, `p1-05-list`, `p4-05-cap`, `p5-01-offline-home`, and the 2026-10-14 `after-fresh/sean/crowded` fit shots).
- Captured the current code in four mocked states with a new script, `shots/pvp/review-measure.mjs` (mocks every Worker call, nothing created on the live service). Shots: `shots/pvp/review-{gate,empty,returning,cap}-{844,664}.png`, numbers in `shots/pvp/review-results.json`. 390x844 is a full iPhone screen; 390x664 is the same phone in Safari with its toolbars showing, which is how most people arrive from a shared link.

Counts below are what sits inside the visible panel without scrolling.

| State | Primary buttons | Text inputs | Headings and eyebrows | Empty-state lines | List rows visible at 664 |
|---|---|---|---|---|---|
| First open, no name yet | 1 (Continue) | 1 | 2 | 0 | n/a |
| Named, nothing played | 3 (Create a challenge, Create an Open Challenge, Join) | 1 | 7 | 3 | 0 |
| Returning, 3 matches + 2 groups | 3 | 1 | 5 at 664, 6 at 844 | 0 | 2 of 6 (4 below, in an inner scroll) |
| At the 3-open cap, after tapping Create | 3, all still enabled | 1 | 5 at 664, 7 at 844 | 0 at 664 | 1 of 3 (the error says "listed below") |

The first-open state is clean. Every other state shows three same-weight white primary buttons and seven section labels on one sheet.

## 1. Inventory, grouped by job

| Job | Element today | First-time user | Returning user |
|---|---|---|---|
| Header | Title "Challenge a friend", rules line "Five places, 20 seconds each. Highest total out of 5,000 wins.", close X | Earns its place. The rules line is the only explanation of the mode. | Fine, it is one line. |
| Identity | First run: a full name gate (eyebrow, input, Continue, device-only note) that replaces the whole sheet. After: "Playing as Sean / Change name" row at the top. | The gate makes a name the first thing asked, before the player has seen what they would be signing up for. The "Playing as" row is noise on the visit right after. | Rename must stay reachable, but it is a once-a-year action sitting in the top row. |
| Create direct | Card: h3 "Direct challenge", subline "Five places against one friend.", full-width primary "Create a challenge" | This is the action the screen exists for. Earns its place, but not as one of two equal cards. | Same. |
| Create open | Card: h3 "Open Challenge", subline "One link, one map set, up to 50 players.", full-width primary "Create an Open Challenge" | A second format the player has to understand before choosing. Same size and colour as the main action, so it competes rather than supports. | Useful for group chats. Does not need equal billing. |
| Join by code | Eyebrow "Have a code?", code input, primary "Join" | Low value. A friend's invite arrives as a link, and the link opens its own join landing with its own name step. Code is the fallback for typing on another device. Today it is the third primary button and the only text input on screen. | Same. Rare. |
| List 1 | "Your challenges": direct matches, or "No challenges yet. Create one and send the link to a friend." | Empty. Three lines of nothing. | The most useful thing on the sheet, and it starts below 9 other elements. |
| List 2 | "Your open challenges": groups you created, or "No Open Challenges created yet." | Empty. | Often empty even for active players. |
| List 3 | "Challenges you joined": groups you joined, or "No joined Open Challenges yet." | Empty. | Often empty. |
| Status line | Errors and progress text, between join and the lists | Hidden when empty. | At the cap it becomes a 3-line pink paragraph wedged between Join and the list. |

Two smaller defects found along the way, both copy or labeling, not layout:

- A direct challenge nobody has accepted yet is titled "Open challenge" in the list (`home.js:167`). That is also the name of the group format, so the list shows "Open challenge" rows under "Your challenges" while the "Your open challenges" section below says none exist. Visible in `after-sean-844.png` and `review-cap-844.png`.
- The number on the left of each row means three different things: rounds played for direct matches ("2/5"), rank for finished groups ("#2"), and running score for unfinished groups ("2101"). A player reading down the list cannot compare rows.

## 2. The core problem

A new player taps Challenge on the home screen and is first asked for a name, with a warning about device storage, before seeing anything the mode offers. Once past that, the eye lands on two identical cards with two identical white buttons, then a third white button with a text field, then three section labels each followed by "No ... yet." The page asks the player to pick between two formats and a code they do not have, before they have any reason to care about the difference. There is no single place the eye is told to go. The likely result is that they read the two card headings, do not know which one they want, and close the sheet, because closing is the only choice that needs no decision. Returning players have the opposite problem: the thing they came back for (whose turn it is) sits at the bottom of the panel, below the same create and join controls they used last time, and on a 664-high screen only two rows of it show.

## 3. Decluttered design

Principles, each tied to a measured problem above:

- One primary button per state. Everything else is a list row or a text button (the shared `text-button` style already used for "Change name" and "Close entries").
- One list, "Your games", only when it has something in it. No empty-state sections.
- The name is asked when it is needed (on first create), not on entry. This is how the invite landings already work: `h2h.js:290` and `group.js:170` show `pvpNameBlock` inline on the join screen. Home would reuse the same block.
- Rename and the code field move behind text buttons at the bottom.

### Position on each question asked

- **One create entry vs two cards.** Drop the cards. One primary button for a direct challenge, and Open Challenge as a text button under it. See section 4 for why this over a two-row picker.
- **Merge the three lists.** Yes. One "Your games" list, ordered: your turn first, then waiting on others, then finished, newest first within each group. Type is carried by the row title, not by a new badge: direct rows read "vs Ana", group rows read "Open Challenge · 5 players". Turn state stays in the small line where it is today ("Your turn", "Their turn", "Finished · #2"). The right-hand `.badge` chevron stays as is. No new visual pattern.
- **Demote code join.** Yes. A "Have a code?" text button at the bottom that reveals the existing code field and Join button in place. Joining by link is the primary path and does not touch this sheet.
- **Empty states.** Remove all three. When the list is empty, nothing is rendered in its place. The rules line already tells a new player what to do.
- **Identity on this sheet.** Not on entry. Ask on first create with the existing name block. After that, one quiet footer line "Playing as Sean · Change name". It cannot leave the sheet entirely, because rename is a shipped feature and this is its only home outside a join landing.

### State A: brand-new player (no name, nothing played)

```
[X]
Challenge a friend
Five places, 20 seconds each. Highest total out of 5,000 wins.

[ Challenge a friend ]            <- primary, full width

Start an Open Challenge for a group      (text button)
Have a code?                             (text button)
```

Primary action: Challenge a friend. Tapping it with no identity swaps the button area for the existing name block (eyebrow "Your name", input, button labeled "Create", device-only note), then creates the match and routes to the share screen exactly as today. Tapping "Start an Open Challenge" with no identity does the same with the group create. Tapping "Have a code?" reveals the code field; the join landing it opens already handles a missing name.

Count: 1 primary button, 2 text buttons, 0 inputs, 0 section labels below the title, 0 empty-state lines. Down from 3 / 1 input / 7 labels / 3 empty lines.

### State B: returning player with active games

```
[X]
Challenge a friend
Five places, 20 seconds each. Highest total out of 5,000 wins.

YOUR GAMES
 2/5  vs Christopher            Your turn            >
      Open Challenge · 4 players  Your turn          >
 5/5  vs Ana                    Their turn           >
 5/5  Waiting for a friend      Code CMUEH0          >
      vs Maximiliano            Won by 1,234         >
      Open Challenge · 5 players  Finished · #2      >

[ Challenge a friend ]            <- primary

Start an Open Challenge for a group      (text button)
Have a code?  ·  Playing as Sean, change name   (footer)
```

Primary action: the top "Your turn" row, which is first in the list and sits directly under the title. When at least one row is "Your turn", that row is the obvious tap and the create button below it is the secondary path. When nothing is your turn, the create button is the only primary on screen.

The list keeps the existing inner scroll (`.pvp-lists` with `overflow-y: auto`), but because it now starts right under the rules line instead of below two cards and a code row, a 664 screen should show about four rows instead of the measured two. That is an estimate from the measured row pitch (about 72px per row including the 8px gap), not a capture of the new layout. The create button sits under the list and stays reachable because the list scrolls inside the panel, the same mechanism the 2026-10-14 fit pass already uses.

Left column: rounds played ("2/5") for direct rows; blank for group rows. Rank and score for groups move into the small line ("Finished · #2", "In progress · 2,101"). One meaning per column.

### State C: at the 3-open cap

```
[X]
Challenge a friend
Five places, 20 seconds each. Highest total out of 5,000 wins.

YOUR GAMES
 5/5  Waiting for a friend      Code CMUEH0          >
 5/5  Waiting for a friend      Code CMUEH4          >
      Open Challenge · 6 players  In progress        >

You have 3 challenges open. A slot frees up when one is
finished, expires, or you close entries on an Open Challenge.

Have a code?  ·  Playing as Sean, change name
```

Primary action: none to create, on purpose. Each open row is tappable to share its link again, which is what actually frees a slot. The create button and the Open Challenge text button are replaced by one plain line in the existing `.pvp-note` style, placed where the button was. Today the player only learns about the cap after tapping Create, gets a 3-line error pinned above the list, and the buttons stay enabled for another try.

The client already reads every remembered match and the group list on open, so it can count slot holders before the tap: direct matches you created that are not COMPLETED, EXPIRED or ABANDONED, plus Open Challenges you created with entries still open. The group detail read exposes `entries.open`; I did not confirm whether the list endpoint's items carry the same flag or only `status`, so the builder should check that first. If they do not, leave groups out of the pre-check rather than guess: a wrong count that hides the create button blocks a player the server would allow, which is worse than the server answering on tap. The server's `429 OPEN_CHALLENGE_CAP` stays the authority. If the client count is under 3 but the server says no, show today's message in the note slot instead of in the status line. No Worker change needed.

## 4. The one real fork: how to offer Open Challenge

**Option 1 (recommended): one primary, Open Challenge as a text button.** "Challenge a friend" is the button; "Start an Open Challenge for a group" is a text button under it.
- For: one obvious action, matching the mode's title and the home tile ("Challenge / Play a friend"). Direct is the format the mode launched on and the one a first visitor is most likely to want. Zero new components.
- Against: Open Challenge loses visibility. It is the better fit for group chats, which is where a link spreads fastest. If Sean sees Open Challenge as the growth format, this buries it.

**Option 2: two picker rows, no primary button.** Under the title, two `expedition-choice` rows (the shared picker row from Expeditions and Blackout): "One friend · Head to head" and "A group · Up to 50 players". One tap creates either.
- For: both formats equal, still one tap, uses a pattern players already know from Expeditions. Removes the two cards and both white buttons.
- Against: two equal choices is still a decision on first visit, which is the bounce cause named in section 2. In state B the create rows and the game rows are the same shape, so they blur together unless separated.

I recommend Option 1. Sean's stated taste is one obvious action, and the first-visit problem is a choice problem. If Open Challenge usage turns out to matter more than direct, swapping which one is the button is a one-line change.

Rejected: a single "Create" button that opens a second step asking Direct or Open. It adds a tap and a screen to the main path to save one text button.

## 5. What must not change

Mechanics, all untouched by every recommendation above:
- Five places, 20-second rounds, highest total out of 5,000 wins.
- Join by link first, six-character code as the fallback. The code field stays; it only moves behind a text button.
- The shared three-open cap across direct and Open Challenges, and its release rules (finish, expire, close entries). The cap note in state C reads the same rules; it does not change them.
- Rename, and identity living on this device only. The device-only note stays with the name block.
- Up to 50 players per Open Challenge, one attempt each.

Design language:
- Reuse only what exists: `primary` button, `text-button`, `expedition-choice` rows with the `.badge` chevron, `.eyebrow` labels, `.pvp-note`, `pvpNameBlock`, the existing panel and inner-scroll layout. No new cards, pills, tabs, colours or badge styles.
- Row titles stay text. The "type badge" asked about is carried by the title wording, not a new badge visual.

Out of scope, flagged rather than proposed:
- An authoritative "open slots used" count from the Worker. The client-side count in state C is enough; a server count would be a Worker API change.
- An "end challenge" action for an unaccepted direct challenge. It would give players at the cap a way out, but there is no client action for it today and it would be a new mechanic.

## 6. Build-ready summary

All in `src/pvp/home.js` and `src/styles/pvp.css` unless noted. Each line names the problem it fixes.

1. **Remove** the "Direct challenge" and "Open Challenge" `.pvp-format-card` blocks (`home.js:205-214`). Fixes: two equal cards and two equal primary buttons competing for the first tap.
2. **Add** one full-width `primary pvp-wide` button "Challenge a friend" calling `pvpCreate`. Fixes: no single obvious action.
3. **Add** a `text-button` "Start an Open Challenge for a group" under it, calling `pvpGroupCreate`. Fixes: keeps the format reachable without a second primary.
4. **Demote** the code join (`home.js:215-225`): render a `text-button` "Have a code?" that, when tapped, shows the existing code input and Join button in place. Remove the "Have a code?" eyebrow. Render it for players with no identity too, since the join landing handles the name. Fixes: third primary button and the only text input on a first visit.
5. **Remove** the entry name gate (`home.js:181-199` for the no-identity case). Instead, when Create or Start an Open Challenge is tapped with no identity, render `pvpNameBlock` in the button area with `submitLabel: 'Create'`, then run `pvpEnsureIdentity(name)` and continue into the create that was tapped. Keep the `editingName` path for rename. Fixes: name asked before the player sees the mode.
6. **Move** "Playing as Sean / Change name" (`home.js:201-204`) from the top to a footer line at the bottom of the sheet, beside "Have a code?". Fixes: a rare action in the top row.
7. **Merge** the three list sections in `renderPvpList` (`home.js:233-246`) into one list under a single eyebrow "Your games". Build one array from `pvpStore.matches` and `pvpUi.groupItems` (both roles), sort by your turn, then waiting, then finished, then newest. Fixes: three section labels and three separate lists for one job.
8. **Remove** all three `.pvp-empty` lines. When the merged list is empty, render no eyebrow and no list. Keep the list error line. Fixes: three empty-state lines on a first visit.
9. **Reorder** so the list renders above the create button, directly under the rules line. Fixes: returning players' turns sat below every create and join control.
10. **Rename** the unaccepted direct match title from "Open challenge" to "Waiting for a friend" (`home.js:167`). Fixes: name clash with the Open Challenge format.
11. **Rename** group row titles to "Open Challenge · N players" and move rank and score into the small line; leave the left `.pvp-progress` column blank for group rows (`home.js:248-255`). Fixes: one column meaning three things.
12. **Add** the cap check: after the list loads, count slot holders (direct matches you created and not COMPLETED, EXPIRED or ABANDONED; Open Challenges you created with entries open; see the state C note on which list field marks that). At 3, hide the create button and the Open Challenge text button and show one `.pvp-note` line: "You have 3 challenges open. A slot frees up when one is finished, expires, or you close entries on an Open Challenge." On a server `OPEN_CHALLENGE_CAP`, show the same line in that slot instead of the status paragraph. Fixes: cap discovered only after tapping, error wedged above a list it points to.
13. **Update** `shots/pvp/p1-home.mjs` and the cap and fit harnesses for the new labels and order, and re-run the PvP suites in `scripts/regression.sh`. Check `review-measure.mjs` targets afterwards: state A should show 1 primary button, 0 inputs, 0 empty lines; state B at 664 should show at least 4 list rows.
