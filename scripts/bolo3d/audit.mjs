#!/usr/bin/env node
// Check a delivered character file against the commission brief.
//
//   node scripts/bolo3d/audit.mjs path/to/bolo.glb
//
// Runs the half of the brief's sign-off a script can run: core glTF only,
// triangle and byte budgets, one material, every joint carrying a transform,
// the ten bone names, the eleven shape keys, the four sockets, all fifty clip
// names, and no root motion. Exit code 1 if any check fails.
//
// The other half is a person putting her beside mascot-wave.png. This does not
// replace that; it decides whether the file is worth that look.
//
// Imports the contract straight from its TypeScript source: that file has no
// imports of its own, so Node's built-in type stripping can load it and the
// brief lives in exactly one place.

import { auditGltf, CLIPS } from '../../lib/bolo-character/src/contract.ts';
import { readGlb } from './glb.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/bolo3d/audit.mjs <file.glb>');
  process.exit(2);
}

const { json, bytes } = readGlb(file);
const report = auditGltf(json, bytes);

const mark = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };
console.log(`\n${file}\n`);
for (const check of report.checks) {
  console.log(`  ${mark[check.status]}  ${check.label}\n        ${check.detail}`);
}

const missing = (list) => list.filter((x) => !x.found).map((x) => x.name);
const missingClips = missing(report.clips);
if (missingClips.length && missingClips.length < CLIPS.length) {
  console.log(`\n  Missing clips: ${missingClips.join(', ')}`);
}
console.log(`\n  ${report.ok ? 'Every machine-checkable item passes.' : 'Not ready: fix the FAIL lines above.'} Now put her beside mascot-wave.png.\n`);
process.exit(report.ok ? 0 : 1);
