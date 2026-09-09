// THE SHIM'S REMOVAL MANIFEST MUST BE TRUE, AND MUST EXPIRE.
//
// WHY THIS EXISTS. `GIFT_ATTEMPTS_SHIM` replaces a prose comment that said the
// daily-gift shim came out with "the two client call sites". THERE ARE THREE.
// The web practice screen was never counted, and nothing could have told anyone,
// because a comment cannot be wrong out loud.
//
// EAST ASIA WROTE THIS PATTERN FIRST and its reason is the one to keep: the
// comment it replaced promised a guard "WHEN THE BOX SHIPS", the box shipped,
// and nothing noticed for a day, "BECAUSE NO COMMENT CAN SEE ITS OWN CONDITION
// BEING MET". A manifest a test reads can see it.
//
// THREE THINGS ARE CHECKED AND THEY FAIL IN THREE DIFFERENT DIRECTIONS:
//
//   1. every listed site EXISTS and still mentions the field. Catches a rename
//      or a deletion that orphans the manifest and leaves it quietly lying.
//   2. no site mentions the field that the manifest does NOT list. Catches a
//      FOURTH call site being added, which is how a shim becomes architecture.
//   3. the review date has not passed. Catches nobody having decided.
//
// (1) and (2) are opposite directions on purpose. A manifest that only checked
// its own entries would pass forever while the shim spread, and this repo has
// been bitten twice this week by a check that only looked one way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GIFT_ATTEMPTS_SHIM, TOKEN_REASON_LABELS } from "./tokenEconomy";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Source trees a call site could hide in. Generated output is excluded: it is
 *  regenerated from the spec, so it follows rather than needing to be listed. */
const SEARCH = [
  "artifacts/api-server/src",
  "artifacts/bolo-mobile/app",
  "artifacts/bolo-mobile/components",
  "artifacts/gujarati-coach/src",
  "lib/api-spec",
];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "generated") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|yaml)$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

/**
 * The file that DEFINES the manifest names the field in its own prose, and that
 * is not a call site. Excluded explicitly rather than by a pattern, so the
 * exclusion is one named file and cannot quietly grow.
 *
 * THIS WAS NOT FORESEEN, IT WAS THE GUARD'S FIRST FINDING. The scan's first run
 * reported tokenEconomy.ts as an unlisted site, which is the same shape as East
 * Asia's region check being satisfied by a comment about itself: a scanner that
 * reads prose cannot tell a rule from a use of the thing the rule is about.
 */
const DEFINES_THE_MANIFEST = "artifacts/api-server/src/lib/tokenEconomy.ts";

/** Every non-generated file that mentions the shim's wire field. */
function sitesOnDisk(): string[] {
  const found: string[] = [];
  for (const root of SEARCH) {
    for (const file of walk(path.join(REPO, root))) {
      const rel = path.relative(REPO, file);
      if (rel === DEFINES_THE_MANIFEST) continue;
      if (readFileSync(file, "utf8").includes(GIFT_ATTEMPTS_SHIM.field)) {
        found.push(rel);
      }
    }
  }
  return found.sort();
}

test("every site the manifest lists exists and still carries the field", () => {
  // NON-TRIVIAL FIRST. An empty manifest would satisfy every loop below.
  assert.ok(
    GIFT_ATTEMPTS_SHIM.sites.length >= 4,
    "the manifest lists almost nothing; it has been emptied rather than maintained",
  );
  for (const site of GIFT_ATTEMPTS_SHIM.sites) {
    const full = path.join(REPO, site);
    assert.ok(existsSync(full), `manifest lists a file that no longer exists: ${site}`);
    assert.ok(
      readFileSync(full, "utf8").includes(GIFT_ATTEMPTS_SHIM.field),
      `manifest lists ${site} but it no longer mentions ${GIFT_ATTEMPTS_SHIM.field}; ` +
        `either the shim came out of that file and the manifest was not updated, ` +
        `or it was renamed`,
    );
  }
});

test("and no FOURTH site has appeared that the manifest does not know about", () => {
  // THE DIRECTION THAT CATCHES THE SHIM SPREADING. A flag nobody removes is how
  // a compatibility shim becomes the architecture, and it spreads one honest
  // call site at a time.
  const disk = sitesOnDisk();
  assert.ok(disk.length > 0, "found no sites at all; the scanner broke");

  const listed = new Set<string>(GIFT_ATTEMPTS_SHIM.sites);
  const unlisted = disk.filter((f) => !listed.has(f));
  assert.deepEqual(
    unlisted,
    [],
    `these mention ${GIFT_ATTEMPTS_SHIM.field} and are not in GIFT_ATTEMPTS_SHIM.sites, ` +
      `so they would be missed when the shim is removed: ${unlisted.join(", ")}`,
  );
});

test("and somebody re-decides whether the shim can go, on a date", () => {
  // THE ONLY HONEST EXPIRY AVAILABLE. Nothing here can see which builds are
  // still in the field, so this does not claim to know when the shim is safe to
  // delete. It fails on a date so that a PERSON looks. `firstBoxBuilds` is the
  // fact they will need when they do.
  const reviewBy = new Date(`${GIFT_ATTEMPTS_SHIM.REVIEW_BY}T00:00:00Z`);
  assert.ok(!Number.isNaN(reviewBy.getTime()), "REVIEW_BY is not a date");
  assert.ok(
    Date.now() < reviewBy.getTime(),
    `the daily-gift attempts shim passed its review date (${GIFT_ATTEMPTS_SHIM.REVIEW_BY}). ` +
      `Check whether builds below iOS ${GIFT_ATTEMPTS_SHIM.firstBoxBuilds.ios} / Android ` +
      `${GIFT_ATTEMPTS_SHIM.firstBoxBuilds.android} are still in the field. If they are gone, ` +
      `remove every site in GIFT_ATTEMPTS_SHIM.sites together. If they are not, move the date ` +
      `and say why. DO NOT delete this test to make the red go away.`,
  );
});

/**
 * THE WORD A LEARNER READS IN THEIR WALLET HISTORY.
 *
 * `GET /tokens/history` serves `tokenReasonLabel(row.reason)` and NEVER the
 * reason itself, so this string is the only part of the daily gift's ledger
 * identity that a learner ever sees. It said "Streak day" while every row it
 * names was the daily gift, because the wheel replaced the flat ladder and the
 * label did not follow.
 *
 * PINNED SEPARATELY FROM THE KEY. The reason rename to `earn_daily_gift` is a
 * migration with a deploy-day double payment behind it and is the owner's call.
 * The label is not, and keeping the two apart is what let one of them ship
 * today. If the key rename ever lands, this test should move to the new reason
 * rather than be deleted.
 */
test("the daily gift is called the daily gift where a learner can read it", () => {
  assert.equal(
    TOKEN_REASON_LABELS.earn_streak_day,
    "Daily gift",
    "the wallet history is naming the gift after a mechanism that no longer exists",
  );
  // AND THE REASON CODE HAS NOT MOVED WITHOUT ITS MIGRATION. If somebody renames
  // the key to earn_daily_gift, this fails and sends them to the four raw SQL
  // literals in nest.ts and the dual-read window, rather than letting a rename
  // look like a label change.
  assert.ok(
    "earn_streak_day" in TOKEN_REASON_LABELS,
    "the reason key moved; the rename needs its migration, see DAILY-GIFT-STRUCTURE.md",
  );
});
