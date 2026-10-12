// Runs the daily selection code of a specific DEPLOYED build, so the schedule
// can record what that build actually served. Not a selection implementation:
// it executes the deploy's own source text (pre-cutover main.js, or the
// src/daily.js a post-cutover main.js imports) in a child node under a given TZ.
// Used by scripts/pin-daily.mjs to read what live production serves.
import { spawnSync } from 'node:child_process';

const DECLS = ['LANDMARK_TERMS', 'isPlayableLocation', 'isLaunchExcluded', 'isLandmark', 'hashSeed', 'randomFrom', 'dailyIds'];

// Top-level `function NAME(...) {...}` or `const NAME = [...];` from a source.
function extractDecl(src, name) {
  const fn = new RegExp(`^function ${name}\\(`, 'm').exec(src);
  if (fn) {
    let i = src.indexOf('{', fn.index);
    let depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) return src.slice(fn.index, i + 1);
    }
    throw new Error(`unbalanced braces in ${name}`);
  }
  const arr = new RegExp(`^const ${name} = \\[`, 'm').exec(src);
  if (arr) return src.slice(arr.index, src.indexOf('];', arr.index) + 2);
  return null;
}

// Selection source for a deployed build. Post-cutover builds import
// ./daily.js, whose source must then be passed in as dailyJs.
export function selectionSource(mainJs, dailyJs) {
  if (/from '\.\/daily\.js/.test(mainJs)) {
    if (!dailyJs) throw new Error('main.js imports ./daily.js but no daily.js source was given');
    return dailyJs.replace(/^export /gm, '');
  }
  const parts = DECLS.map((name) => extractDecl(mainJs, name)).filter(Boolean);
  if (!parts.some((p) => p.startsWith('function dailyIds('))) throw new Error('no dailyIds in main.js');
  return parts.join('\n\n');
}

// { date: ids } for each date, computed by `source` with process TZ = tz,
// exactly as a fresh client in that zone would on that local date.
export function runSelection(source, pool, dates, tz) {
  const input = `${source}
const pool = ${JSON.stringify(pool)};
const out = {};
for (const d of ${JSON.stringify(dates)}) out[d] = dailyIds(d, pool);
process.stdout.write(JSON.stringify(out));
`;
  const res = spawnSync(process.execPath, ['--input-type=module', '-'], {
    input,
    env: { ...process.env, TZ: tz },
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf8',
  });
  if (res.status !== 0) throw new Error(`deployed dailyIds failed (TZ=${tz}): ${res.stderr}`);
  return JSON.parse(res.stdout);
}
