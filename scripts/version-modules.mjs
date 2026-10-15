#!/usr/bin/env node
// Deploy-time module versioning (docs/refactor-plan-wonder.md, Phase 0).
// deploy.sh runs it on the deploy copy of src/. Every relative import of a .js
// module under src/ ('./x.js', '../core/y.js', static or dynamic) gets
// ?v=<content hash> so iOS Safari can never pair a fresh entry file with a
// stale submodule. A module's hash covers its own rewritten imports, so a
// change deep in the graph re-versions every importer up to the entry.
// Repeats until nothing changes; an import cycle never settles and fails.
//
//   node scripts/version-modules.mjs <src-dir>
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

const srcDir = resolve(process.argv[2] || '');
if (!process.argv[2] || !statSync(srcDir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('usage: version-modules.mjs <src-dir>');
  process.exit(1);
}

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});
const files = walk(srcDir);
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12);
const IMPORT = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"?]+\.js)(\?v=[^'"]*)?\2/g;

for (let pass = 1; pass <= files.length + 1; pass++) {
  let changed = 0;
  for (const file of files) {
    const before = readFileSync(file, 'utf8');
    const after = before.replace(IMPORT, (m, head, q, spec) => {
      const target = resolve(dirname(file), spec);
      if (!files.includes(target)) {
        console.error(`❌ version-modules: ${file} imports missing module ${spec}`);
        process.exit(1);
      }
      return `${head}${q}${spec}?v=${hash(target)}${q}`;
    });
    if (after !== before) { writeFileSync(file, after); changed++; }
  }
  if (!changed) {
    console.log(`Module versions: ${files.length} module(s) under src/, settled in ${pass} pass(es)`);
    process.exit(0);
  }
}
console.error('❌ version-modules: import versions did not settle (import cycle?)');
process.exit(1);
