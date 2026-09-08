// EVERY ROUTE'S RESPONSE AND ITS SCHEMA MUST AGREE, and nothing else in this
// repo can tell you when they do not.
//
// WHY THIS EXISTS. `stopCost` and `chaiToNextStop` were served by
// GET /tokens/gift from the day the wheel's server half landed and were in NO
// schema, so the generated types never carried them and no client could read
// them. The distance meter, which the owner called the more important half of
// the whole feature, was therefore never built: the data was on the wire and
// the app reading that wire was blind to it. It survived every typecheck, every
// test and every request.
//
// A ROUTE AND A SPEC DRIFT SILENTLY IN ONE DIRECTION ONLY, and SEA named the
// mechanism, which is the part worth understanding rather than just fixing:
//
//   declaring a field the route does not send   breaks nothing
//   SENDING a field the spec does not declare   breaks nothing either
//
// Not at compile time, not in a test, not at runtime. The field simply never
// arrives. AN UNDECLARED FIELD IS INVISIBLE FROM BOTH ENDS (East Asia's
// phrasing): the server serves it correctly, the spec is internally consistent,
// every suite is green, and the only symptom is a feature nobody builds.
//
// A CHECK NOBODY REPEATS IS A FIX RATHER THAN A GUARD. India's first response
// was to declare the two fields, which closed the instance and left the
// mechanism. SEA wrote the guard; this is India's copy of it.
//
// AND IT COVERS THE CLASS, NOT THE INSTANCE, which is East Asia's correction
// and it earned itself immediately: having fixed the route that failed, it
// widened the same test to every route of the same shape and found
// `allAccessGiftMultiplier` undeclared on GET /tokens in its own tree, so ITS
// PAYWALL COULD NOT HAVE READ THE MULTIPLIER IT EXISTS TO PRINT. India's
// /tokens happens to agree, which is luck rather than care, and is exactly why
// the guard is table-driven.
//
// IT IS PURE. Routes are read as TEXT and a spread is resolved by calling the
// real function, so there is no server, no database and no request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GetDailyGiftResponse,
  GetTokensResponse,
  GetGamePlaysResponse,
} from "@workspace/api-zod";
import { dailyGiftFor } from "@workspace/daily-gift";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The gift's `...gift` spread, resolved by CALLING the real thing. */
function giftSpreadKeys(): string[] {
  return Object.keys(
    dailyGiftFor({
      streakDays: 3,
      claimedDayKey: null,
      todayKey: "2026-09-08",
      userId: "contract-guard",
    }),
  );
}

interface RouteUnderGuard {
  /** For the failure message. */
  name: string;
  file: string;
  /** The exact text that opens the handler, so the search is SCOPED. */
  opensWith: string;
  /**
   * The generated schema's shape. Typed structurally rather than as zod's own
   * `ZodRawShape`: the generated client and this file resolve zod through
   * different paths in the workspace, so the nominal type does not match and
   * the import buys nothing this guard needs. All it reads is the key set and
   * whether each entry accepts undefined.
   */
  shape: Record<string, { safeParse: (v: unknown) => { success: boolean } }>;
  /** Keys the handler spreads in rather than naming. */
  spread?: () => string[];
}

const ROUTES: RouteUnderGuard[] = [
  {
    name: "GET /tokens/gift",
    file: "tokens.ts",
    opensWith: 'router.get("/tokens/gift"',
    shape: GetDailyGiftResponse.shape as RouteUnderGuard["shape"],
    spread: giftSpreadKeys,
  },
  {
    name: "GET /tokens",
    file: "tokens.ts",
    opensWith: 'router.get("/tokens"',
    shape: GetTokensResponse.shape as RouteUnderGuard["shape"],
  },
  {
    name: "GET /games/plays",
    file: "games.ts",
    opensWith: '"/games/plays"',
    shape: GetGamePlaysResponse.shape as RouteUnderGuard["shape"],
  },
];

/**
 * The keys a handler actually puts on the wire.
 *
 * SCOPE THE SEARCH TO THE THING BEFORE SEARCHING FOR THE FIELD. SEA made the
 * opposite mistake while fixing this very bug: a global search for a common
 * property name landed inside a different schema entirely. It is the same shape
 * as a bite test reverting the first match of a shared phrase, and it is the
 * positive form of that rule. Find the handler, THEN the literal inside it.
 */
function servedKeys(route: RouteUnderGuard): Set<string> {
  const src = readFileSync(path.join(HERE, route.file), "utf8");
  const handlerAt = src.indexOf(route.opensWith);
  assert.ok(handlerAt > -1, `${route.name}: the handler moved; this guard must follow it`);
  const bodyAt = src.indexOf("res.json({", handlerAt);
  assert.ok(bodyAt > -1, `${route.name}: no response literal found`);
  const end = src.indexOf("});", bodyAt);
  assert.ok(end > bodyAt, `${route.name}: could not find the end of the response literal`);
  const literal = src.slice(bodyAt, end);

  const keys = new Set<string>();
  // `key: value` and bare shorthand. Anchored to a line start with its own
  // indent so a nested object's keys are never mistaken for wire fields.
  for (const m of literal.matchAll(/^\s+([a-zA-Z][a-zA-Z0-9]*)\s*[,:]/gm)) {
    keys.add(m[1]!);
  }
  for (const k of route.spread?.() ?? []) keys.add(k);
  return keys;
}

for (const route of ROUTES) {
  test(`${route.name}: every field it sends is declared, so a client can see it`, () => {
    const served = servedKeys(route);
    const declared = new Set(Object.keys(route.shape));

    // BOTH ENDS NON-TRIVIAL FIRST, which is East Asia's note and it is a guard
    // on the guard: a subset check passes on an EMPTY set, which is exactly how
    // a broken parser reports success. If either side is empty this test has
    // stopped measuring anything.
    assert.ok(served.size > 0, `${route.name}: scraped no keys; the parser broke`);
    assert.ok(declared.size > 0, `${route.name}: schema has no keys; the import broke`);

    const undeclared = [...served].filter((k) => !declared.has(k)).sort();
    assert.deepEqual(
      undeclared,
      [],
      `${route.name} serves fields no client can see: ${undeclared.join(", ")}`,
    );
  });

  test(`${route.name}: every REQUIRED field the schema promises is actually sent`, () => {
    // ONE-DIRECTIONAL ON PURPOSE for the optional half, which is East Asia's
    // other note: a declared key the handler does not send is a different bug,
    // and asserting it over OPTIONAL fields would fail honestly-shaped schemas.
    // Required fields are a different matter: a client renders those, and one
    // that never arrives is a blank where a number belongs.
    const served = servedKeys(route);
    const required = Object.entries(route.shape)
      .filter(([, v]) => !v.safeParse(undefined).success)
      .map(([k]) => k);
    assert.ok(required.length > 0, `${route.name}: no required fields found; the shape read broke`);
    const missing = required.filter((k) => !served.has(k)).sort();
    assert.deepEqual(
      missing,
      [],
      `${route.name} promises fields it never sends: ${missing.join(", ")}`,
    );
  });
}
