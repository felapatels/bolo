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
  // 3) EVERYTHING ELSE IN JOURNEY 1 IS PAID, and this is the half the policy
  //    described but never enforced.
  //
  //    Reported on a free account 2026-08-25: "after zone 2 for hindi, i
  //    shouldn't be able to click on a stop and test out. I should just hit
  //    the paywall for any stop in zone 3, 4, 5 or 6." Production showed why
  //    they could:
  //
  //      hi numbers  position 1   10 free of 10
  //      hi food     position 1    8 free of 10
  //      hi everyday position 1    8 free of 10
  //      every other position      0 free
  //
  //    The SEEDER leaves a free starter tranche in the first group of EVERY
  //    category, so the first stop of every zone was partly free. Nothing had
  //    ever marked it paid, so a free learner walked into zone 3, opened stop
  //    1, and was offered a stop test-out into content they had not bought.
  //    The client was right the whole way down: it locks on the server's
  //    premium flag, and the flag said free.
  //
  //    THIS IS THE FIRST STATEMENT HERE THAT FLIPS premium ON. The two above
  //    only ever widen access; this one closes it, so it is scoped narrowly
  //    and stated loudly. It touches JOURNEY 1 categories only, leaves the
  //    free run above untouched by construction (the WHERE excludes exactly
  //    what rules 1 and 2 free), and skips test-scoped languages like the rest.
  const paidRemainder = await db.execute(sql`
    UPDATE phrases SET premium = true
    WHERE NOT premium AND lesson_group_id IN (
      SELECT lg.id
      FROM lesson_groups lg
      JOIN categories c ON c.id = lg.category_id
      WHERE c.slug IN ('greetings','family','numbers','food','everyday','feelings')
        AND lg.language_code NOT LIKE '\\_\\_%'
        -- Hindi keeps the whole of zones 1 and 2.
        AND NOT (lg.language_code = 'hi' AND c.slug IN ('greetings','family'))
        -- Every language keeps its first stop, which is position-1 greetings.
        AND NOT (
          c.slug = 'greetings'
          AND lg.position = (
            SELECT MIN(lg2.position) FROM lesson_groups lg2
            JOIN categories c2 ON c2.id = lg2.category_id
            WHERE c2.slug = 'greetings' AND lg2.language_code = lg.language_code
          )
        )
    )
  `);

  const hindiCount = hindiFreeZones.rowCount ?? 0;
  const firstStopCount = firstStops.rowCount ?? 0;
  const paidCount = paidRemainder.rowCount ?? 0;
  if (hindiCount + firstStopCount + paidCount > 0) {
    logger.info(
      { hindiZones1and2: hindiCount, firstStops: firstStopCount, closedToPaid: paidCount },
      "Free-tier content policy: reconciled premium rows.",
    );
  } else {
    logger.info("Free-tier content policy: already satisfied (no-op).");
  }
}
