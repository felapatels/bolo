// ONLY THE OWNER'S OWN ACCOUNTS MAY BE IN THE PILOT CAPTURE ALLOWLIST.
//
// WHY THIS IS A TEST AND NOT A COMMENT. `pilotCapture.ts` uploads the RAW
// PRONUNCIATION RECORDING, an .m4a plus a JSON sidecar, to CLOUDFLARE R2 for
// every id in `PILOT_CAPTURE_USER_IDS`. That variable lives in `.replit` under
// `[userenv.shared]`, so it is DEVELOPMENT AND PRODUCTION.
//
// THE SHIPPED APP DISCLOSES NOTHING ABOUT IT. Apple rejected BOLO SEA on
// 5.1.1(i) and 5.1.2(i) on 2026-09-10 for sending user data to a third party
// without saying so and without asking, and India is live with the same gap. The
// consent gate being built does NOT name R2 — correctly, because this list only
// ever holds the owner's own accounts. **Adding anybody else's makes the shipped
// disclosure false.**
//
// SO THE RULE IS: THIS LIST CANNOT BE EXTENDED WITHOUT REVISITING THE CONSENT
// COPY. That rule was Europe's, and the supervisor's note on it is why this file
// exists rather than another paragraph: *it needs to be enforceable rather than
// written down elsewhere.* A comment cannot fail. This can.
//
// HOW IT WAS FOUND, because the shape matters more than the instance. Two ids
// sat in this list for a fortnight looking exactly like live ones and resolving
// to nobody: they came from ANOTHER APP'S CLERK INSTANCE, were caught on
// 2026-08-24, and were never removed. **A dead id captures nothing. The risk was
// somebody helpfully repairing two broken-looking entries with real learner
// ids**, which would have turned a benign research capture into the exact
// rejection SEA received.
//
// AND NEITHER INVENTORY FOUND `pilotCapture.ts` ON THE FIRST PASS. It surfaced
// on a second read of a tree whose inventory was already written up. **A
// completed inventory is the easiest document to stop reading.**
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * The owner's Clerk ids, VERIFIED AGAINST PRODUCTION on 2026-08-24 and confirmed
 * again on 2026-09-10 by resolving them in Clerk while two impostors 404'd in the
 * same session.
 *
 * NOT A CONVENIENCE LIST. It is the definition of who may have a recording sent
 * to a third party undisclosed, so an addition here is the same decision as an
 * addition to `.replit` and carries the same obligation to revisit the copy.
 */
const OWNER_CLERK_IDS = new Set([
  "user_3H8vsSZW9Pcc2iZsjVzvOffeG0a",
  "user_3HBsmeNhc3jxT6rCH1WXI4R0Ykv",
  "user_3HrkEYs5PZFbfBDPMeTympT8yqC",
]);

function allowlistFromReplit(): string[] {
  const src = readFileSync(path.join(REPO, ".replit"), "utf8");
  // Anchored to a line start so the long explanatory comment above the value,
  // which names the two removed ids, can never be read as the value itself.
  const m = /^PILOT_CAPTURE_USER_IDS\s*=\s*"([^"]*)"/m.exec(src);
  assert.ok(m, "PILOT_CAPTURE_USER_IDS not found in .replit; this guard has lost its subject");
  return m[1]!
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

test("every id that can have its audio sent to R2 is the owner's own", () => {
  const ids = allowlistFromReplit();

  // NON-TRIVIAL FIRST. An empty allowlist satisfies the subset check below while
  // proving nothing, and it is also a legitimate state (the feature off). So the
  // emptiness is asserted separately rather than being allowed to pass silently
  // as compliance.
  assert.ok(
    ids.length > 0,
    "the allowlist is empty. That is a valid state and this guard cannot see it, " +
      "so if pilot capture has been retired, delete this test with the feature.",
  );

  const strangers = ids.filter((id) => !OWNER_CLERK_IDS.has(id)).sort();
  assert.deepEqual(
    strangers,
    [],
    "PILOT_CAPTURE_USER_IDS contains ids that are not the owner's. Raw learner " +
      "audio would be uploaded to Cloudflare R2 for them, and THE SHIPPED APP " +
      "DOES NOT DISCLOSE THAT. This is Apple 5.1.1(i) and 5.1.2(i), the guideline " +
      "BOLO SEA was rejected under. Either remove them, or update the consent " +
      "disclosure to name R2 and re-submit: " +
      strangers.join(", "),
  );
});

test("and the two ids from another app's Clerk instance have not come back", () => {
  // THE SPECIFIC REPAIR THIS GUARD EXISTS TO PREVENT. These two looked like live
  // entries for a fortnight. Somebody noticing they resolve to nobody is the
  // likeliest person to "fix" them, and a fix means real learner ids.
  const dead = ["user_3H9XG2UWijYqRUXv6Ls0geMmX4Z", "user_3HBsumTkU4xtAYmMlH62DKnC5j9"];
  const ids = new Set(allowlistFromReplit());
  const returned = dead.filter((id) => ids.has(id));
  assert.deepEqual(
    returned,
    [],
    "an id from ANOTHER APP'S Clerk instance is back in the allowlist. It matches " +
      "nobody here and captures nothing; it was removed so that nobody repairs it " +
      "with a real learner's id: " +
      returned.join(", "),
  );
});
