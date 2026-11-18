#!/usr/bin/env bash
# Measure fresh CDN-key z9 windows with the game's centered Mercator math.
# Usage: scripts/sat/yardstick-deep-zoom.sh [cold-tag]
set -euo pipefail

tag="${1:-zoom3-$(date +%s)}"
work="$(mktemp -d "${TMPDIR:-/tmp}/zoom3-yardstick.XXXXXX")"
trap 'rm -rf "$work"' EXIT

# id, latitude, longitude. Each window is the 6x4 visible region plus its
# one-tile margin, matching a centered max-width game window: 8x6 total.
sites=(
  'us,37.7749,-122.4194'
  'europe,48.8566,2.3522'
  'remote,-27.1127,-109.3497'
)

make_jobs() {
  local site="$1" lat="$2" lng="$3" margin="$4" out="$5"
  node - "$site" "$lat" "$lng" "$margin" "$tag" "$out" <<'NODE'
const [site, latText, lngText, marginText, tag, out] = process.argv.slice(2);
const lat = Number(latText), lng = Number(lngText), margin = Number(marginText), z = 9, n = 1 << z;
const fy = 0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
const cx = Math.floor(((lng + 180) / 360) * n), cy = Math.floor(fy * n);
const visibleCols = 6, visibleRows = 4;
const vx0 = cx - Math.floor(visibleCols / 2), vy0 = Math.max(0, cy - Math.floor(visibleRows / 2));
const jobs = [];
for (let y = vy0 - margin; y < vy0 + visibleRows + margin; y++) for (let x = vx0 - margin; x < vx0 + visibleCols + margin; x++) {
  const wrappedX = (x % n + n) % n;
  if (y < 0 || y >= n) continue;
  const visible = x >= vx0 && x < vx0 + visibleCols && y >= vy0 && y < vy0 + visibleRows;
  jobs.push([site, visible ? 'visible' : 'margin', `https://tiles.where-on.earth/s2gm2025/${z}/${wrappedX}/${y}.jpg?v=2&yardstick=${encodeURIComponent(tag)}`].join('\t'));
}
require('node:fs').writeFileSync(out, jobs.join('\n') + '\n');
NODE
}

fetch_jobs() {
  local jobs="$1" out="$2"
  export out
  xargs -r -P 18 -n 3 bash -c '
    site="$1"; kind="$2"; url="$3"; file="${out}/$(date +%s%N)-${RANDOM}"
    curl --silent --show-error --location --output /dev/null --dump-header "${file}.headers" \
      --write-out "%{time_starttransfer}\t%{http_code}" "$url" > "${file}.body" || true
    cache=$(awk "BEGIN{IGNORECASE=1} /^cf-cache-status:/ {print \$2}" "${file}.headers" 2>/dev/null | tr -d "\\r" | tail -1)
    printf "%s\\t%s\\t%s\\t%s\\n" "$site" "$kind" "${cache:-UNKNOWN}" "$(cat "${file}.body")" >> "${out}/results"
  ' _ < "$jobs"
}

run_window() {
  local site="$1" lat="$2" lng="$3" margin="$4" label="$5"
  local jobs="$work/$site-$label.jobs" result="$work/$site-$label"
  mkdir -p "$result"
  make_jobs "$site" "$lat" "$lng" "$margin" "$jobs"
  local start end
  start=$(date +%s%N)
  fetch_jobs "$jobs" "$result"
  end=$(date +%s%N)
  node - "$result/results" "$site" "$label" "$(( (end - start) / 1000000 ))" <<'NODE'
const fs = require('node:fs');
const [file, site, label, totalMs] = process.argv.slice(2);
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((row) => row.split('\t'));
const successful = rows.filter((row) => Number(row[4]) >= 200 && Number(row[4]) < 400);
if (!successful.length) {
  console.log(`${label}\t${site}\ttiles=${rows.length}\tNETWORK_UNAVAILABLE`);
  process.exit(0);
}
const ttfb = successful.map((row) => Number(row[3]) * 1000).filter(Number.isFinite).sort((a, b) => a - b);
const percentile = (p) => ttfb.length ? ttfb[Math.min(ttfb.length - 1, Math.ceil(ttfb.length * p) - 1)] : NaN;
const miss = successful.filter((row) => row[2] === 'MISS').length;
console.log(`${label}\t${site}\ttiles=${successful.length}/${rows.length}\ttotal_ms=${totalMs}\tttfb_median_ms=${percentile(.5).toFixed(0)}\tttfb_p90_ms=${percentile(.9).toFixed(0)}\tmiss_share=${miss}/${successful.length}`);
NODE
}

echo 'window\tsite\ttiles\ttotal_ms\tttfb_median_ms\tttfb_p90_ms\tmiss_share'
for entry in "${sites[@]}"; do
  IFS=, read -r site lat lng <<< "$entry"
  run_window "$site" "$lat" "$lng" 1 "margin-1"
done
# A no-margin control quantifies the maxZ margin decision on the US window.
run_window us 37.7749 -122.4194 0 margin-0
