# Brief 2 (follow-on, same branch): home level progression and seal

Runs AFTER the four-item batch in BRIEF-ui-fixes-nov20.md lands on branch
ui-fixes-nov20 in this same clone. Same rules: full suite before and after,
commit on the branch, no deploy, no push, no em dashes, captures into
~/workspace/map-game/woe-ui-fixes-shots/ (home-level-before.png,
home-level-after.png, profile-seal-after.png), and append an Item E section
to UI-FIXES-REPORT.md.

## Item E: home Passport card, level progression + seal
Sean's words: make the level progression on the home page taller, make the
seal larger, and match the customized selection of the user on the profile
page.

The home Passport card (rendered from src/meta/passport.js; the summary row
with the level, XP progress and the seal medallion) currently shows the seal
small and, per Sean, not reflecting what the user picked in the Customize
sheet. The profile page and customizer render the seal from the saved
loadout (src/account/sheet.js uses sealConfig(profile.loadout.avatar, ...)
and renderAvatar from the progression view module).

1. Make the level progression row on the home card taller: more vertical
   room for the level line, XP bar and next-level text (increase the row's
   padding/min-height in step with the larger seal; keep the card's other
   rows and the one-chevron cue unchanged).
2. Make the seal on the home card larger (it renders around 40px today;
   take it up substantially, roughly 56-64px, sized to the taller row).
3. The home seal must be the user's saved customization: same disc, motif
   and initials the profile page shows for the signed-in user. Find where
   the home card gets its seal config today, and wire it to the same source
   of truth as the profile (the account profile loadout). When the user
   saves a new seal in the customizer and returns home, the home seal must
   already match (no stale default). For a signed-out or no-profile state,
   keep today's fallback behavior.
Proof: in one harness session with a mocked signed-in profile whose loadout
is a NON-default seal (for example forest disc, star motif, initials 'SG'),
capture the profile page seal and the home card; the home seal must show
the same disc color, motif and initials, at the larger size, in the taller
row. Report the before/after row height and seal size in px.

## Item F: one XP explainer line on the traveler profile (Sean approved 2026-11-20)
Nothing in the game says where XP comes from. Add exactly one line of copy
under the XP bar on the traveler profile (the profile view in
src/account/sheet.js, next to renderXpBar's non-compact rendering):
""Earn XP in the Daily. The closer your guesses, the more you earn."
(Sean corrected the first draft's wording 2026-11-20: do NOT name tiers in
this line. In the XP code a 'bullseye' bonus means a perfect 1,000-point
round, and pinpoint is not a separate XP category, so tier names here only
confuse.)"
One line, styled as quiet secondary text consistent with the profile's
existing small print. Nowhere else: not on the home card, no popup, no new
page. Capture the profile before/after with the line visible.
