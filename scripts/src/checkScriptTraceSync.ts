// Verify that the two copies of script-trace-chapters.ts are in sync.
//
// The mobile copy carries one extra header comment; everything else must be
// byte-identical to the web copy.  Run this after regenerating guides to
// catch hand-edits that cause the two files to drift.
//
// Run: pnpm --filter @workspace/scripts exec tsx src/checkScriptTraceSync.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

const WEB_PATH = resolve(
  ROOT,
  "artifacts/gujarati-coach/src/data/script-trace-chapters.ts",
);
const MOBILE_PATH = resolve(
  ROOT,
  "artifacts/bolo-mobile/lib/game-data/script-trace-chapters.ts",
);

// Strip the mobile-only sync comment so the normalised content of both files
// must match exactly.
const MOBILE_SYNC_COMMENT =
  "// Mobile copy — kept in sync with artifacts/gujarati-coach/src/data/script-trace-chapters.ts.\n";

function normalise(raw: string): string {
  return raw.replace(MOBILE_SYNC_COMMENT, "");
}

const web = readFileSync(WEB_PATH, "utf8");
const mobile = readFileSync(MOBILE_PATH, "utf8");

const normWeb = normalise(web);
const normMobile = normalise(mobile);

if (normWeb === normMobile) {
  console.log("✓ script-trace-chapters.ts files are in sync.");
  process.exit(0);
}

// Find first diverging line for a helpful error message.
const webLines = normWeb.split("\n");
const mobileLines = normMobile.split("\n");
const maxLines = Math.max(webLines.length, mobileLines.length);
let firstDiff = -1;
for (let i = 0; i < maxLines; i++) {
  if (webLines[i] !== mobileLines[i]) {
    firstDiff = i + 1; // 1-based
    break;
  }
}

console.error("✗ script-trace-chapters.ts files have drifted apart!");
console.error(`  web:    ${WEB_PATH}`);
console.error(`  mobile: ${MOBILE_PATH}`);
if (firstDiff !== -1) {
  console.error(`  First difference at line ${firstDiff}:`);
  console.error(`    web:    ${JSON.stringify(webLines[firstDiff - 1])}`);
  console.error(`    mobile: ${JSON.stringify(mobileLines[firstDiff - 1])}`);
}
console.error(
  "\nRe-run the generator to fix:\n  pnpm --filter @workspace/scripts exec tsx src/extractScriptTraceGuides.ts",
);
process.exit(1);
