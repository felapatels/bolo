import { test, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import { reconcileFreeTierContentPolicy } from "./freeTierContentPolicy";

// Free-tier content policy data invariants, pinned against the live dev
// database this suite shares (see .agents/memory/api-server-tests.md). The
// reconciliation runs at every api-server boot and must be idempotent, so
// the database has to satisfy both owner rulings already — and running it
// again must leave them intact. Test-scoped languages (double-underscore
// prefix) are excluded on both sides: other suites deliberately provision
// premium rows in position-1 Greetings groups, and neither the reconciler
// nor these invariants may touch or count them.

after(async () => {
  await pool.end();
});

test("reconciliation is idempotent and both policy invariants hold", async () => {
  await reconcileFreeTierContentPolicy();

  // ~~Ruling 1: Hindi zones 1 and 2.~~ DELETED 2026-09-08 with the rule itself:
  // "i don't want 2 zones for any languages free". What stood here asserted
  // that no premium row remained in Hindi Greetings OR Family, and that Hindi
  // Zone 3 still held premium rows so the widening had not quietly become
  // "Hindi is free". Both are covered by what follows: zone one is checked for
  // EVERY language including Hindi, and the paid-remainder scan below now
  // includes Hindi's family, which is the assertion that actually proves zone 2
  // closed.
  //
  // THE OLD ZONE-3 CHECK IS NOT REPLACED AND THAT IS DELIBERATE. It could only
  // run where Hindi lesson groups exist, which is not true of a database built
  // from migrations plus the seed, so it failed for the environment rather than
  // for the policy. The paid-remainder scan below covers the same ground
  // without needing one language's content to be present.

  // Ruling 2, WIDENED 2026-09-07 BY THE OWNER: zero premium phrase rows
  // anywhere in ANY real language's ZONE ONE, not just its first stop.
  //
  // The old query walked the lowest-position Greetings group per language and
  // asserted only that. Widening the policy without widening this assertion
  // would have left the new part of the ruling completely unguarded, which is
  // the failure mode this file was written to prevent on the other side of the
  // line.
  const zoneOne = await pool.query(`
    SELECT count(*)::int AS n
    FROM phrases p
    JOIN lesson_groups lg ON lg.id = p.lesson_group_id
    JOIN categories c ON c.id = lg.category_id
    WHERE c.slug = 'greetings'
      AND lg.language_code NOT LIKE '\\_\\_%'
      AND p.premium AND p.stage = 'phrase'
  `);
  assert.equal(
    zoneOne.rows[0].n,
    0,
    "no premium phrase rows may remain anywhere in zone one, in any language",
  );
  // VACUITY CHECK, and without it the assertion above passes on an empty set.
  // "Zero premium rows in zone one" is equally true of a zone one that has no
  // stops past the first, which is exactly what this policy used to leave
  // behind. Assert the widening had something to widen INTO.
  const zoneOneDepth = await pool.query(`
    SELECT
      count(*) FILTER (WHERE lg.position > 1)::int AS deep,
      count(*)::int AS total
    FROM lesson_groups lg
    JOIN categories c ON c.id = lg.category_id
    WHERE c.slug = 'greetings' AND lg.language_code NOT LIKE '\\_\\_%'
  `);
  // TWO DIFFERENT FAILURES, AND THEY MUST NOT SHARE A MESSAGE. An empty result
  // means this database has no journey content at all, which makes the whole
  // file untestable and is an ENVIRONMENT fault; a non-empty result with no
  // depth means zone one is one stop deep, which is a POLICY fault and the
  // thing the scan above would otherwise pass on vacuously. Reporting them the
  // same way is how a green suite gets believed about content it never saw.
  assert.ok(
    zoneOneDepth.rows[0].total > 0,
    "NO LESSON GROUPS IN THIS DATABASE: the free-tier policy cannot be tested " +
      "here at all. A migrated-and-seeded database has languages, categories " +
      "and phrases but no journey content, so this file needs the Repl's dev " +
      "database or a content import, and everything it asserts about zone one " +
      "is vacuous until then.",
  );
  assert.ok(
    zoneOneDepth.rows[0].deep > 0,
    "zone one has no stops past position 1, so the scan above proves nothing",
  );

  // Ruling 3, added 2026-08-25: NOTHING outside the free run is free.
  //
  // Asserted as a negative for the same reason as the Zone 3 check above. The
  // seeder leaves a free starter tranche in the FIRST group of every category,
  // so before this rule existed a free learner could open stop 1 of zones 2
  // through 6 and was even offered a stop test-out into content they had not
  // bought. Reported from a free account; 925 rows across 22 languages were
  // sitting open.
  const openRemainder = await pool.query(`
    SELECT count(*)::int AS n
    FROM phrases p
    JOIN lesson_groups lg ON lg.id = p.lesson_group_id
    JOIN categories c ON c.id = lg.category_id
    WHERE NOT p.premium
      AND c.slug IN ('greetings','family','numbers','food','everyday','feelings')
      AND lg.language_code NOT LIKE '\\_\\_%'
      AND NOT (lg.language_code = 'hi' AND c.slug IN ('greetings','family'))
      -- Zone one is free in every language now, so the whole of Greetings is
      -- excluded from the "must be paid" remainder rather than just its first
      -- group. Kept as an exclusion rather than deleted: the assertion below
      -- still has to fail if zones 2 through 6 spring a leak.
      AND c.slug <> 'greetings'
  `);
  assert.equal(
    openRemainder.rows[0].n,
    0,
    "journey 1 outside the free run must be paid, or the paywall has holes",
  );

  // Idempotency: a second pass is a clean no-op (nothing left to flip).
  await reconcileFreeTierContentPolicy();
  const again = await pool.query(`
    SELECT count(*)::int AS n
    FROM phrases p
    JOIN lesson_groups lg ON lg.id = p.lesson_group_id
    JOIN categories c ON c.id = lg.category_id
    WHERE c.slug = 'greetings' AND p.premium
      AND (p.language_code = 'hi' OR lg.language_code NOT LIKE '\\_\\_%')
      -- The whole zone, not the first stop of it. Same widening as above.
  `);
  assert.equal(again.rows[0].n, 0);
});
