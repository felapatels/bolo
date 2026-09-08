// EVERY TEST FILE IN THIS PACKAGE MUST BE CLASSIFIED, and a file in neither
// list fails here with its own name in the message.
//
// WHY THIS EXISTS. `test:pure` runs `node --test $(cat pure-tests.txt)`, a
// HAND-MAINTAINED manifest. A new pure test that nobody adds to it never runs.
// Not skipped, not failed, ABSENT: the runner is handed a list and the file is
// not on it, so there is no error for anyone to see and the guard inside it
// reads as covered.
//
// India met this the day it wrote a contract guard and shipped it into a file
// CI does not execute. THE ONLY TELL WAS THE COUNT: 741 tests before six new
// ones and 741 after. East Asia then audited its own manifest and found SEVEN
// files missing, worth thirty-seven tests, including the free-taste policy's own
// test, absent through an economy rebuild that rewrote that policy, and the
// guard on a TTS prompt it had fixed that morning. Its words: "I shipped its
// protection into a file CI does not execute."
//
// THE STRUCTURAL FIX EVERYONE REACHED FOR FIRST WAS TO INVERT THE MANIFEST:
// glob the tests, name the database-backed ones, so an unclassified file fails
// loudly rather than vanishing. That is the safe direction and it CHANGES WHAT
// CI RUNS, so two forks deferred it rather than land it tired at the end of a
// long session. SEA found the better move, which is this: keep both lists and
// add a DETECTOR that they cover everything. The safety without the change.
//
// THE CLASSIFICATION IS NOT DERIVED, AND THAT IS THE DESIGN CHOICE. A heuristic
// ("does it import @workspace/db") would absorb a new file automatically, which
// is precisely the failure this exists to stop. SEA's phrasing: ADDING A LINE IS
// A DECISION SOMEBODY MADE; A HEURISTIC IS A DECISION NOBODY MADE. A detector
// that can be satisfied automatically is not a detector.
//
// AND THE LISTS CANNOT DOCUMENT THEMSELVES: `$(cat pure-tests.txt)` would hand a
// `#` comment line to node as a filename, so the explanation has to live here.
// That is a small fact which explains a large silence: nobody knew because
// there was nowhere to say it.
//
// HOW TO CLASSIFY A NEW FILE, and do NOT do it by reading its imports. East Asia
// listed eighteen candidates that way and only ELEVEN were real: the other six
// pull the database transitively through a local module. Run it with
// DATABASE_URL unset and see whether it survives:
//
//   env -u DATABASE_URL SESSION_SECRET=x OPENAI_API_KEY=sk-test \
//     node --import tsx --test --experimental-test-module-mocks <file>
//
// Survives, add it to pure-tests.txt. Throws for want of a database, add it to
// db-tests.txt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PKG = path.resolve(SRC, "..");

function everyTestFile(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      everyTestFile(full, out);
    } else if (entry.endsWith(".test.ts")) {
      out.push(path.relative(PKG, full));
    }
  }
  return out;
}

function listed(file: string): string[] {
  return readFileSync(path.join(PKG, file), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

test("every test file is either pure or database-backed, and none is neither", () => {
  const found = everyTestFile(SRC).sort();
  const pure = listed("pure-tests.txt");
  const db = listed("db-tests.txt");
  const classified = new Set([...pure, ...db]);

  // NON-TRIVIAL FIRST, which is East Asia's guard on a guard: a subset check
  // passes on an EMPTY set, and that is exactly how a broken reader reports
  // success. If either side is empty this test has stopped measuring anything.
  assert.ok(found.length > 0, "found no test files; the walk broke");
  assert.ok(classified.size > 0, "both manifests read empty; the reader broke");

  const unclassified = found.filter((f) => !classified.has(f));
  assert.deepEqual(
    unclassified,
    [],
    `in neither pure-tests.txt nor db-tests.txt, so nothing runs them: ${unclassified.join(", ")}`,
  );
});

test("and neither list names a file that no longer exists", () => {
  // The other direction is quieter but it breaks the pure job outright:
  // `node --test` on a missing path fails the whole run, so a rename that
  // updates the file and not the list turns green into a confusing red.
  const found = new Set(everyTestFile(SRC));
  const entries = [...listed("pure-tests.txt"), ...listed("db-tests.txt")];
  assert.ok(found.size > 0, "found no test files; the walk broke");
  assert.ok(entries.length > 0, "both manifests read empty; the reader broke");
  const stale = entries.filter((f) => !found.has(f)).sort();
  assert.deepEqual(stale, [], `listed but gone: ${stale.join(", ")}`);
});

test("no file is claimed by both lists", () => {
  // A file in both would run twice in one job and, worse, would read as
  // classified while nobody could say which way. That matters more than it
  // looks: THE COUNT IS THE DETECTOR for everything else, and a file counted
  // twice makes the count irreconcilable.
  const pure = new Set(listed("pure-tests.txt"));
  const db = listed("db-tests.txt");

  // THE VACUITY GUARD, AND THIS TEST HAD THE HOLE IT CLOSES. East Asia pointed
  // out that every assertion in a detector like this is a SET DIFFERENCE, and a
  // set difference against an empty set is empty. The first test here was
  // guarded and this one was not: an unreadable manifest would have made `db`
  // empty, `both` empty, and this would have reported success about nothing at
  // all. The other two directions happen to fail loudly on an empty read; this
  // one passed.
  assert.ok(pure.size > 0, "pure manifest read empty; the reader broke");
  assert.ok(db.length > 0, "db manifest read empty; the reader broke");

  const both = db.filter((f) => pure.has(f)).sort();
  assert.deepEqual(both, [], `claimed by both manifests: ${both.join(", ")}`);
});
