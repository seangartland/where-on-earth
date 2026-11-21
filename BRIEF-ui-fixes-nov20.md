# Brief: four UI fixes (2026-11-20 evening batch)

Repo: your clone (game root). Branch: ui-fixes-nov20. Run the full suite
(`node --test "test/*.mjs"`) before and after. Commit per item on the branch.
Do NOT deploy, do NOT push. No em dashes anywhere, including comments.
Captures: phone viewport 390x844 @2x, real build served locally, into
~/workspace/map-game/woe-ui-fixes-shots/<item>-before.png and -after.png.
Write UI-FIXES-REPORT.md at the clone root: per item, what changed (files),
the capture paths, and the suite result. The orchestrator verifies and banks.

## Item A: postcard back (src/meta/passport.js)
The Passport dex postcard detail (.ppd), back face. Back markup is a template
string around line 1488-1535; history rows and the stats strip are built in
fillPostcard around line 1020. EARN_NAMES = ['seen','near','bullseye',
'pinpoint'] in src/core/config.js.
1. The address block (.pc-addr) contains TWO `<div class="pc-addr-rule"></div>`
   lines in a row. Remove one, leaving exactly one.
2. History labels: 'First visited' becomes 'Saw'. Tier rows currently read
   `${tierTitle} earned`: 'Near earned' becomes 'Earned', 'Bullseye earned'
   becomes 'Bullseye', 'Pinpoint earned' becomes 'Pinpoint'. (So the near
   tier's row label is just 'Earned'; the higher tiers drop the word.)
3. Stats strip (.ppd-stats): for an entry that is seen but NOT earned, if a
   finite closest-guess distance exists (entry.km), show 'Closest guess' with
   the km value (same markup pattern as the earned headline) instead of
   'Not yet collected'. Keep 'Not yet collected' only when there is no
   recorded guess distance.
4. Move the stamp: on the back, the photo stamp (.pc-stamp, with its postmark)
   moves into the blank space directly above the location name (.pc-addr-name)
   in the right column. Capture the back BEFORE changing anything and sight
   it; place the stamp in that blank area above the name, keeping the
   postmark overlapping the stamp as it does today. Keep the fact column and
   the stats strip unchanged.
Capture path: ~/workspace/map-game/woe-postcard-shots/capture.mjs already
exists (env WOE_ROOT=<your clone>, WOE_TAG=before|after). It seeds a pinpoint
Paris and opens the dex. Known harness facts: the dex is an accordion
(.pp-pack-head buttons; the Capitals grid starts hidden); slots are
li.pp-slot; the home .passport card is hidden until the summary renders, so
the script clicks it programmatically. Fix the card-opening step as needed
(expand the Capitals section, click the collected Paris slot) and keep the
script working for the after run. Also capture one seen-only card WITH a
recorded closest guess if the seed can be extended cheaply (a second entry
with visits and a distance but no earn tier), to prove change 3; if that is
not cheap, prove change 3 with a DOM-level check and say so in the report.

## Item B: pack results km pill (src/modes/pack.js results)
On the pack-open results screen, each card's distance badge is a circle with
the number stacked over 'km' on two lines (e.g. '234' over 'km'), which reads
badly. Find the badge markup/class and restyle it as a single-line pill:
number and 'km' on one line (e.g. '234 km'), pill-shaped, same position
(top-right of the card), same color logic as today (dark badge on seen
cards, gold on the newly earned one). It must fit a 4-digit grouped value
('1,234 km') without wrapping or overflowing the card. Capture before/after
of the results screen (reuse an existing pack harness if one exists under
shots-ux/; otherwise build a minimal one that seeds an openable pack).

## Item C: Customize sheet, Seal tab scroll bug (src/account/sheet.js, src/styles/game.css)
In the account sheet's Customize view, Seal tab: .customize-preview is
`position: sticky; top: 0` INSIDE the scrolling .seal-builder, so when the
builder scrolls, the striped preview band and the seal paint over the Disc
swatches and Motif grid (Sean's screenshot shows the seal overlapping the
disc row and stripes covering the whole sheet).
Fix: take the preview out of the scroller. In the Seal markup, render
.customize-preview as a sibling ABOVE .seal-builder (inside .customizer,
below the kind tabs), and remove the sticky positioning from its CSS. The
builder then contains only the initials field and the Disc/Motif sections
and scrolls beneath the preview without overlap. Keep the striped band
background and the preview's visual size. Make sure the initials input
handler still finds .customize-preview (it queries the panel, so it should),
and that Titles and Banners tabs are unchanged (their scroller is
.identity-parts, no preview). Captures: Seal tab at rest, and Seal tab with
the builder scrolled to the bottom showing the last Motif row and no
overlap; the Save button must be visible without scrolling (it is outside
the builder; verify it stays so).

## Item D: Passport dex, Other Postcards head (src/meta/passport.js + CSS)
The dex accordion has three pack heads: World Capitals, World Cities, and
Other Postcards (class pp-pack-head-mail). Two changes:
1. Remove the envelope glyph (✉) that precedes 'Other Postcards' in that
   head. Remove the markup/text only; keep any mail-related logic elsewhere
   untouched.
2. Make the Other Postcards head the SAME height as the other two heads
   (measure all three rendered heights in the capture and equalize via CSS;
   the main heads carry a progress track element, match the resulting box
   height exactly).
Capture: the dex with all three heads visible, before and after, and report
the three measured heights after (they must be equal).

## Done means
Suite green (state the count), four items committed on ui-fixes-nov20,
captures for every item in ~/workspace/map-game/woe-ui-fixes-shots/,
UI-FIXES-REPORT.md written. If an item cannot be completed, the report says
exactly where it stopped and why.
