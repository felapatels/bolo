import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Free-tier content policy (owner ruling, Aug 2026), reconciled idempotently
// at startup right after the content seeder, under the same advisory lock.
// The committed data migration (lib/db/drizzle/0035_free_tier_content_policy)
// applies the same flips to migrated databases; production applies
// schema-only diffs at publish, so THIS reconciliation is the authoritative
// path there. It also re-heals any premium rows a future seeder top-up
// derives by index into a policy-covered group.
//
//   1) The whole of Hindi FARE ZONES 1 AND 2 (every Greetings and Family
//      lesson group, phrase AND sentence stage) serves free — the paywall
//      lands at Zone 3.
//
//      WIDENED FROM ZONE 1 ALONE on 2026-08-24 at the owner's direction:
//      "let zone [1] and zone 2 for hindi be included free. After zone 2 for
//      hindi, its all-access paid only." Hindi is the flagship and the one
//      language a visitor is most likely to try, so it carries a deeper free
//      run than the rest; every other language gets its first stop plus the
//      two tastes at stops 2 and 3, which is rule 2 below plus the tracing and
//      story stops.
//   2) Every language's FIRST stop (position-1 Greetings group) is fully
//      free, so every journey starts playable.
export async function reconcileFreeTierContentPolicy(): Promise<void> {
  // The slugs are journey 1's first two fare zones, in order. Listed rather
  // than derived because this file has no business importing the client's zone
  // ladder, and because widening it further should be a deliberate edit here
  // rather than a side effect of renaming a zone somewhere else.
  const hindiFreeZones = await db.execute(sql`
    UPDATE phrases SET premium = false
    WHERE premium AND lesson_group_id IN (
      SELECT lg.id
      FROM lesson_groups lg
      JOIN categories c ON c.id = lg.category_id
      WHERE c.slug IN ('greetings', 'family') AND lg.language_code = 'hi'
    )
  `);
  // Test-scoped languages (double-underscore prefix, self-provisioned by the
  // api-server route suites on the shared dev database) are excluded: some
  // fixtures deliberately seed premium rows in a position-1 Greetings group,
  // and a dev boot or the policy test running mid-suite must never flip them.
  // Real language codes are ISO-style and never start with "__"; production
  // has no such rows, so there this filter is a no-op.
  const firstStops = await db.execute(sql`
    UPDATE phrases SET premium = false
    WHERE premium AND lesson_group_id IN (
      SELECT DISTINCT ON (lg.language_code) lg.id
      FROM lesson_groups lg
      JOIN categories c ON c.id = lg.category_id
      WHERE c.slug = 'greetings' AND lg.language_code NOT LIKE '\\_\\_%'
      ORDER BY lg.language_code, lg.position ASC
    )
  `);
  const hindiCount = hindiFreeZones.rowCount ?? 0;
  const firstStopCount = firstStops.rowCount ?? 0;
  if (hindiCount + firstStopCount > 0) {
    logger.info(
      { hindiZones1and2: hindiCount, firstStops: firstStopCount },
      "Free-tier content policy: flipped premium rows to free.",
    );
  } else {
    logger.info("Free-tier content policy: already satisfied (no-op).");
  }
}
