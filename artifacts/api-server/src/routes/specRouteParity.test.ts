// EVERY OPERATION THE SPEC DECLARES MUST HAVE A ROUTE BEHIND IT.
//
// WHY THIS EXISTS, and it is the MIRROR of tokens.gift.contract.test.ts rather
// than a duplicate of it. That guard catches a field the server SENDS that the
// spec does not declare, so no client can see it. This one catches the opposite
// and more embarrassing direction: a path the spec DECLARES that no router
// serves. Orval generates a client method from the spec, so the method exists,
// typechecks, ships, and 404s at runtime. The learner gets a broken button and
// nothing between the two ends says a word.
//
// RAISED BY EUROPE, 2026-09-09, while doing the contract half of the daily-gift
// reason split. It noticed it was about to add a path with no route and that
// NOTHING IN THIS REPO WOULD HAVE CAUGHT IT. It was right, and as the parent
// this is India's to write.
//
// ONE DIRECTION ONLY, AND THAT IS DELIBERATE. There are 132 route
// registrations against 104 spec operations, and the surplus is correct: the
// Nest's own routes and internal endpoints are deliberately undocumented, since
// the spec is the CLIENT contract and not an inventory of the server. Asserting
// the other direction would fail honestly-private routes. A route with no spec
// entry is invisible to clients, which is a choice; a spec entry with no route
// is a promise nobody keeps.
//
// IT IS PURE. Both sides are read as TEXT. No server, no database, no request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SPEC = path.resolve(HERE, "../../../../lib/api-spec/openapi.yaml");

type Op = { method: string; path: string };

/**
 * The operations the spec promises.
 *
 * Parsed by indentation rather than with a YAML library on purpose: this
 * package has no YAML dependency, adding one to run a guard is how a guard
 * becomes something people delete, and the shape being read is two levels of
 * fixed indentation that the file's own formatting already enforces.
 */
function declaredOps(): Op[] {
  const out: Op[] = [];
  let current: string | null = null;
  for (const line of readFileSync(SPEC, "utf8").split("\n")) {
    const p = /^ {2}(\/[A-Za-z0-9{}/_.-]*):\s*$/.exec(line);
    if (p) {
      current = p[1]!;
      continue;
    }
    if (!current) continue;
    const m = /^ {4}(get|post|put|patch|delete):\s*$/.exec(line);
    if (m) out.push({ method: m[1]!.toUpperCase(), path: current });
    // Any other key back at two spaces ends this path's block.
    else if (/^ {2}\S/.test(line)) current = null;
  }
  return out;
}

/** The routes the server actually registers. */
function registeredRoutes(): Set<string> {
  const dir = HERE;
  const out = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts") || file.includes(".test.")) continue;
    const src = readFileSync(path.join(dir, file), "utf8");
    for (const m of src.matchAll(
      /router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g,
    )) {
      out.add(`${m[1]!.toUpperCase()} ${m[2]!}`);
    }
  }
  return out;
}

/** `/lesson-groups/{id}/test-out` is registered as `/lesson-groups/:id/test-out`. */
function toExpress(p: string): string {
  return p.replace(/\{(\w+)\}/g, ":$1");
}

test("every operation the spec declares is served by a route", () => {
  const ops = declaredOps();
  const routes = registeredRoutes();

  // BOTH SIDES NON-TRIVIAL FIRST. A subset check passes on an empty set, which
  // is exactly how a broken parser reports success, and this file has two
  // hand-rolled parsers in it. If either side reads empty this test has stopped
  // measuring anything and must say so rather than going green.
  assert.ok(ops.length > 50, `parsed only ${ops.length} spec operations; the YAML reader broke`);
  assert.ok(routes.size > 50, `found only ${routes.size} routes; the route scanner broke`);

  const missing = ops
    .filter((o) => !routes.has(`${o.method} ${toExpress(o.path)}`))
    .map((o) => `${o.method} ${o.path}`)
    .sort();

  assert.deepEqual(
    missing,
    [],
    `the spec promises operations no router serves, so orval will generate a client ` +
      `method that 404s: ${missing.join(", ")}`,
  );
});

test("and the readers can still tell a served path from an unserved one", () => {
  // THE NEGATIVE CONTROL, because the test above passes on a clean tree and a
  // guard that has only ever agreed has been OBSERVED agreeing, not tested.
  // This asserts the matcher would actually notice: a path nobody registers
  // must not be found among the routes. Without it, a route scanner that
  // returned "everything matches" would keep the test above green forever.
  const routes = registeredRoutes();
  assert.ok(
    !routes.has("GET /this-operation-is-not-served-anywhere"),
    "the route scanner claims to serve a path that does not exist; it is not discriminating",
  );
  // And a path that IS served must be found, or the matcher is failing open in
  // the other direction and every real gap would read as covered.
  assert.ok(
    routes.has("GET /tokens/gift"),
    "the route scanner cannot find a route that is definitely registered",
  );
});
