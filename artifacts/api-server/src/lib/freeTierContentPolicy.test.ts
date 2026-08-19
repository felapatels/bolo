import { test, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import { reconcileFreeTierContentPolicy } from "./freeTierContentPolicy";

// Free-tier content policy data invariants, pinned against the live dev
// database this suite shares (see .agents/memory/api-server-tests.md). The
// reconciliation runs at every api-server boot and must be idempotent, so
// the database has to satisfy both owner rulings already, and running it
// again must leave them intact. Test-scoped languages (double-underscore
// prefix) are excluded on both sides: other suites deliberately provision
// premium rows in position-1 Greetings groups, and neither the reconciler
// nor these invariants may touch or count them.

after(async () => {
  await pool.end();
});

test("reconciliation is idempotent and both policy invariants hold", async () => {
  await reconcileFreeTierContentPolicy();

  // Ruling 1: every Hindi Greetings (Fare Zone 1) row serves free, phrase
  // AND sentence stage. The paywall lands at Zone 2.
  const hi = await pool.query(`
    SELECT count(*)::int AS n
    FROM phrases p
    JOIN lesson_groups lg ON lg.id = p.lesson_group_id
    JOIN categories c ON c.id = lg.category_id
    WHERE p.language_code = 'hi' AND c.slug = 'greetings' AND p.premium
  `);
  assert.equal(hi.rows[0].n, 0, "no premium rows may remain in Hindi Zone 1");

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
