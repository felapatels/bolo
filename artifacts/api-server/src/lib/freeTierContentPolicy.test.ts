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

  // Ruling 1: every Hindi Greetings AND Family row serves free — phrase AND
  // sentence stage, both fare zones. The paywall lands at Zone 3.
  //
  // WIDENED FROM GREETINGS ALONE on 2026-08-24. Hindi is the flagship and the
  // language a visitor is most likely to try, so it carries a deeper free run
  // than the rest; every other language gets its first stop (ruling 2) plus the
  // tracing and story tastes at stops 2 and 3.
  const hi = await pool.query(`
    SELECT count(*)::int AS n
    FROM phrases p
    JOIN lesson_groups lg ON lg.id = p.lesson_group_id
    JOIN categories c ON c.id = lg.category_id
    WHERE p.language_code = 'hi' AND c.slug IN ('greetings', 'family') AND p.premium
  `);
  assert.equal(hi.rows[0].n, 0, "no premium rows may remain in Hindi Zones 1 and 2");

  // AND ZONE 3 IS STILL PAID, which is the half that stops this widening from
  // quietly becoming "Hindi is free". Asserted as a NEGATIVE rather than
  // trusted: a policy that flips too much looks identical to one that flips
  // correctly, until somebody checks the other side of the line.
  const hiZone3 = await pool.query(`
    SELECT count(*)::int AS n
    FROM phrases p
    JOIN lesson_groups lg ON lg.id = p.lesson_group_id
    JOIN categories c ON c.id = lg.category_id
    WHERE p.language_code = 'hi' AND c.slug = 'numbers' AND p.premium
  `);
  assert.ok(
    hiZone3.rows[0].n > 0,
    "Hindi Zone 3 must still hold premium rows, or the paywall has moved",
  );

  // Ruling 2: zero premium phrase rows in any real language's first stop
  // (its lowest-position Greetings group), so every journey starts playable.
  const firstStops = await pool.query(`
    WITH first_stop AS (
      SELECT DISTINCT ON (lg.language_code) lg.id
      FROM lesson_groups lg
      JOIN categories c ON c.id = lg.category_id
      WHERE c.slug = 'greetings' AND lg.language_code NOT LIKE '\\_\\_%'
      ORDER BY lg.language_code, lg.position ASC
    )
    SELECT count(*)::int AS n
    FROM phrases p
    JOIN first_stop fs ON fs.id = p.lesson_group_id
    WHERE p.premium AND p.stage = 'phrase'
  `);
  assert.equal(
    firstStops.rows[0].n,
    0,
    "no premium phrase rows may remain in any first stop",
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
      AND NOT (c.slug = 'greetings' AND lg.position = (
        SELECT MIN(lg2.position) FROM lesson_groups lg2
        JOIN categories c2 ON c2.id = lg2.category_id
        WHERE c2.slug = 'greetings' AND lg2.language_code = lg.language_code))
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
      AND lg.id IN (
        SELECT DISTINCT ON (lg2.language_code) lg2.id
        FROM lesson_groups lg2
        JOIN categories c2 ON c2.id = lg2.category_id
        WHERE c2.slug = 'greetings'
        ORDER BY lg2.language_code, lg2.position ASC
      )
  `);
  assert.equal(again.rows[0].n, 0);
});
