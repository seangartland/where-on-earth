#!/bin/bash
# Regression command (docs/refactor-plan-wonder.md, Phase 0). Runs the existing
# headless checks end to end against the working tree of demo/ and prints a
# per-suite PASS or FAIL; exits nonzero if any suite fails.
#
# The harnesses under ~/workspace/map-game/shots serve demo/ from disk at
# https://game.local inside Playwright (request routing), so no separate HTTP
# server is needed. PvP suites and g-verify talk to the LIVE woe-pvp worker and
# create real test players and matches there.
#
#   scripts/regression.sh            all suites
#   scripts/regression.sh sh pvp     only the named suites
#                                    (pp sh pvp group layout baseline)
#
# Logs: shots/regression-logs/<suite>.log. Baseline screenshots are written to
# shots/baseline/ and copied into demo/shots/baseline/ (committed) on success.
set -u

SHOTS="${SHOTS_DIR:-$HOME/workspace/map-game/shots}"
LOGS="$SHOTS/regression-logs"
REPO_BASE="$(cd "$(dirname "$0")/.." && pwd)/shots/baseline"
mkdir -p "$LOGS" "$SHOTS/baseline" "$REPO_BASE"
SUITES=("$@")
[ ${#SUITES[@]} -eq 0 ] && SUITES=(pp sh pvp group layout baseline)
FAILED=0
RESULTS=()

# Pass/fail for one step: $1 label, $2 log file, $3 exit code, $4 JS predicate
# over `out` (full log text) and `json` (first top-level JSON object in it).
verdict() {
  local label=$1 log=$2 code=$3 pred=$4 ok
  ok=$(LOG="$log" CODE="$code" PRED="$pred" node -e '
    const out = require("fs").readFileSync(process.env.LOG, "utf8");
    let json = null;
    const m = out.match(/^\{[\s\S]*?^\}$/m) || out.match(/^\{.*\}$/m);
    try { json = m ? JSON.parse(m[0]) : null; } catch {}
    let ok = false;
    try { ok = process.env.CODE === "0" && Boolean(eval(process.env.PRED)); } catch (e) { console.error(e.message); }
    console.log(ok ? "PASS" : "FAIL");' 2>>"$log")
  [ "$ok" = PASS ] || FAILED=1
  RESULTS+=("$ok  $label  ($log)")
  echo "$ok  $label"
}

step() { # $1 label, $2 log name, $3 dir, $4 predicate, rest: command
  local label=$1 name=$2 dir=$3 pred=$4; shift 4
  local log="$LOGS/$name.log"
  echo "... $label"
  (cd "$dir" && "$@") >"$log" 2>&1
  verdict "$label" "$log" $? "$pred"
}

NETERR='(e) => !/version\.txt|tiles\.where-on\.earth|invitations\/inspect/.test(e)'

for s in "${SUITES[@]}"; do case $s in
pp)
  step "Passport/Daily (passport/pp-shot.mjs)" pp-shot "$SHOTS" \
    'json.stats === true && json.info.cards > 0 && json.info.scrollW <= 390 && /game-start/.test(json.back) && json.easy >= 0' \
    node passport/pp-shot.mjs ;;
sh)
  step "Survival hub tap-through (passport/sh-verify.mjs)" sh-verify "$SHOTS" \
    'json.hubOpen.hub && json.afterHubX.start && json.afterBackdrop.start && json.classic.round && json.classicModal && json.classicBack.start && json.borders.round && json.bordersModal && json.bordersBack.start && json.blackoutPicker.bpicker && json.blackoutScopes.length === 7 && json.blackout.round && json.blackoutModal && json.blackoutBack.start && [...json.homeFit, ...json.hubFit].every((f) => f.fits) && json.errs.length === 0' \
    node passport/sh-verify.mjs ;;
pvp)
  P="$SHOTS/pvp"
  step "PvP H2H 1: create (pvp/p1-home.mjs)" pvp-p1 "$P" \
    "json.hasToken && /^[A-Z0-9]{6}\$/.test(json.match.code) && json.match.overflow <= 390 && json.rows.length === 1 && json.emptyMsg && json.errs.filter($NETERR).length === 0" \
    node p1-home.mjs
  step "PvP H2H 2: join by link and code (pvp/p2-join.mjs)" pvp-p2 "$P" \
    "json.inviteeRole === 'INVITEE' && /challenged you/.test(json.inviteHeading) && /Hatch Friend/.test(json.challengerRows[0]) && /no longer available/.test(json.badCode) && json.thirdJoined && [...json.errs1, ...json.errs2, ...json.errs3].filter($NETERR).length === 0" \
    node p2-join.mjs
  export MATCH_ID
  MATCH_ID=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).matches[0].matchId)' "$P/identity2.json" 2>/dev/null)
  step "PvP H2H 3a: invitee plays 5 rounds (pvp/p3-play.mjs invitee)" pvp-p3-invitee "$P" \
    "json.dailyUnchanged && json.visited.length === 5 && /Their turn/.test(json.end) && json.errs.filter($NETERR).length === 0" \
    node p3-play.mjs invitee
  step "PvP H2H 3b: challenger plays, refresh + resume (pvp/p3-play.mjs challenger)" pvp-p3-challenger "$P" \
    "json.dailyUnchanged && json.log.some((l) => l.resumeLabel) && /Rematch/.test(json.end) && json.errs.filter($NETERR).length === 0" \
    node p3-play.mjs challenger
  step "PvP H2H 4: result, share, rematch, open cap (pvp/p4-complete.mjs)" pvp-p4 "$P" \
    "/Rematch/.test(json.complete) && /copied/.test(json.shareStatus) && json.rematch.h2 === 'Your turn' && /joined/.test(json.inviteeRematch.status) && /3 open challenges/.test(json.capTries.at(-1)) && [...json.errs1, ...json.errs2, ...json.errs3].filter((e) => !/429 .*\/v1\/matches\$/.test(e)).length === 0" \
    node p4-complete.mjs
  step "PvP H2H 5: worker offline (pvp/p5-offline.mjs)" pvp-p5 "$P" \
    "json.daily.round === 1 && !json.daily.vsVisible && /Could not reach/.test(json.create) && json.errOverlay === false && json.pageErrors.length === 0" \
    node p5-offline.mjs
  step "PvP H2H 7: rename (pvp/p7-rename.mjs)" pvp-p7 "$P" \
    "json.storedName === 'Hatch Pal' && /Hatch Pal/.test(json.who) && /-> 201/.test(json.created) && json.errs.length === 0" \
    node p7-rename.mjs ;;
group)
  step "Open Challenge vs live worker (pvp/g-verify.mjs)" g-verify "$SHOTS/pvp" \
    '/ALL CHECKS PASSED/.test(out) && !/^FAIL /m.test(out)' \
    node g-verify.mjs
  cp "$SHOTS/pvp/g-02-lobby.png" "$SHOTS/baseline/group-lobby.png" 2>/dev/null
  cp "$SHOTS/baseline/group-lobby.png" "$REPO_BASE/" 2>/dev/null ;;
layout)
  step "PvP layout measurements (pvp/layout-dump.mjs)" layout-dump "$SHOTS/pvp" \
    '/^DIV\.pvp-body /m.test(out) && (out.match(/^DIV\.pvp-format-card /gm) || []).length === 2 && /pvp-lists/.test(out)' \
    node layout-dump.mjs ;;
baseline)
  step "Baseline screenshots (baseline/baseline-shot.mjs)" baseline "$SHOTS/baseline" \
    "json.seen.home && json.seen.daily && json.seen.pvp && json.seen.passport && json.seen.stats && json.pageErrors.length === 0 && ['home', 'daily-round', 'pvp-home', 'group-lobby', 'passport', 'stats'].every((n) => require('fs').statSync('$SHOTS/baseline/' + n + '.png').size > 10000)" \
    node baseline-shot.mjs
  for n in home daily-round pvp-home passport stats; do cp "$SHOTS/baseline/$n.png" "$REPO_BASE/" 2>/dev/null; done ;;
*) echo "unknown suite: $s"; FAILED=1 ;;
esac; done

echo
echo "=== Regression summary"
printf '%s\n' "${RESULTS[@]}"
[ $FAILED -eq 0 ] && echo "ALL SUITES PASSED" || echo "SOME SUITES FAILED"
exit $FAILED
