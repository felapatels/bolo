/**
 * PRE-FLIGHT CHECK FOR A BUILD, BEFORE YOU WASTE AN INSTALL ON IT.
 *
 * Downloads a finished EAS build's .ipa, reads the Hermes bytecode header out
 * of Payload/*.app/main.jsbundle, and reports the function count.
 *
 * WHY THIS EXISTS. On 2026-08-21 seven store builds were measured against the
 * animation bug and the function count split them perfectly:
 *
 *   build  verdict    bytes      functions
 *   160    ANIMATES   8,886,780     44,080
 *   150    frozen     9,525,032     52,918
 *   170    frozen     9,526,224     52,920
 *   180    frozen     9,525,032     52,918
 *   190    frozen     9,523,200     52,899
 *   201    frozen     9,521,108     52,878
 *   220    frozen     9,520,604     52,872
 *
 * Six frozen builds cluster at ~52,900. The one animating build has 44,080.
 * Nothing lands in between. String and identifier counts are near-identical
 * across all seven, so it is the SAME SOURCE compiled two different ways --
 * builds 160 and 220 are byte-identical in every file that reaches the bundle
 * and still came out 8,792 functions apart.
 *
 * WHAT IT IS NOT. Neither React Compiler nor the Hermes -O flag explains it;
 * both were tested locally and moved the count by single digits. A local
 * `expo export:embed` on this same source produces ~43,000, i.e. the healthy
 * shape, so the divergence happens on the EAS builder and not in this repo.
 *
 * THRESHOLD is deliberately blunt. There is no observed middle ground, so
 * anything at or above 50,000 is treated as poisoned.
 *
 * Usage:
 *   npx tsx scripts/checkBundleHealth.ts <ipa-url-or-path>
 */
import { readFileSync, createWriteStream, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Anything at or above this is the poisoned shape. Healthy sits near 44,000. */
const POISON_THRESHOLD = 50_000;

const HERMES_MAGIC = "c61fbc03c103191f";

type Header = {
  version: number;
  fileLength: number;
  functionCount: number;
  identifierCount: number;
  stringCount: number;
};

/**
 * The Hermes bytecode file header, in declaration order. Only the first six
 * fields are read; everything after `stringCount` is left alone deliberately,
 * because the tail of this struct has changed between bytecode versions and
 * nothing here needs it.
 */
function readHermesHeader(bytes: Buffer): Header | null {
  if (bytes.subarray(0, 8).toString("hex") !== HERMES_MAGIC) return null;
  let off = 8;
  const version = bytes.readUInt32LE(off);
  off += 4 + 20; // version, then the 20-byte sourceHash
  const fileLength = bytes.readUInt32LE(off);
  off += 4;
  off += 4; // globalCodeIndex
  const functionCount = bytes.readUInt32LE(off);
  off += 4;
  off += 4; // stringKindCount
  const identifierCount = bytes.readUInt32LE(off);
  off += 4;
  const stringCount = bytes.readUInt32LE(off);
  return { version, fileLength, functionCount, identifierCount, stringCount };
}

function main(): void {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: checkBundleHealth.ts <ipa-url-or-path>");
    process.exit(2);
  }

  const work = mkdtempSync(join(tmpdir(), "bolo-bundle-"));
  let ipa = target;

  if (/^https?:\/\//.test(target)) {
    ipa = join(work, "build.ipa");
    console.log("  downloading...");
    execFileSync("curl", ["-sSL", "-o", ipa, target]);
  }

  // -j flattens the path so the Payload/<name>.app/ prefix does not matter.
  execFileSync("unzip", ["-qo", "-j", ipa, "Payload/*.app/main.jsbundle", "-d", work]);
  const header = readHermesHeader(readFileSync(join(work, "main.jsbundle")));

  if (!header) {
    console.log("  main.jsbundle is not Hermes bytecode; nothing to check.");
    return;
  }

  const poisoned = header.functionCount >= POISON_THRESHOLD;
  console.log(`  hermes bytecode v${header.version}`);
  console.log(`  bytes:       ${header.fileLength.toLocaleString()}`);
  console.log(`  strings:     ${header.stringCount.toLocaleString()}`);
  console.log(`  identifiers: ${header.identifierCount.toLocaleString()}`);
  console.log(`  functions:   ${header.functionCount.toLocaleString()}`);
  console.log("");
  console.log(
    poisoned
      ? `  POISONED. ${header.functionCount.toLocaleString()} functions is the shape that does not animate. Do not spend an install on it; rebuild instead.`
      : `  HEALTHY. ${header.functionCount.toLocaleString()} functions matches build 160, the only build observed animating.`,
  );
  process.exit(poisoned ? 1 : 0);
}

main();
