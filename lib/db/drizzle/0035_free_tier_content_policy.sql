-- Free-tier content policy (owner ruling, Aug 2026). Data-only migration; no
-- schema change. The api-server startup seeder reconciles the exact same
-- policy idempotently at every boot
-- (artifacts/api-server/src/lib/freeTierContentPolicy.ts); that path is
-- authoritative for production, where publish syncs schema, not data. This
-- migration keeps migrated databases (dev, fresh environments) in step.
--
-- 1) The whole Hindi Fare Zone 1 (every Greetings lesson group, phrase AND
--    sentence stage) serves free: the paywall lands at Zone 2.
UPDATE phrases SET premium = false
WHERE premium AND lesson_group_id IN (
  SELECT lg.id
  FROM lesson_groups lg
  JOIN categories c ON c.id = lg.category_id
  WHERE c.slug = 'greetings' AND lg.language_code = 'hi'
);--> statement-breakpoint
-- 2) Every language's FIRST stop (its lowest-position Greetings group) is
--    fully free, so every journey starts playable.
UPDATE phrases SET premium = false
WHERE premium AND lesson_group_id IN (
  SELECT DISTINCT ON (lg.language_code) lg.id
  FROM lesson_groups lg
  JOIN categories c ON c.id = lg.category_id
  WHERE c.slug = 'greetings'
  ORDER BY lg.language_code, lg.position ASC
);
-- Reversal (drizzle has no down migrations; documented inverse): premium was
-- originally derived BY INDEX at seed time — within each (language, category)
-- curated list, rows past the language's starterPhraseCount boundary are
-- premium, and sentence-stage rows were premium across the board. To revert,
-- re-apply that derivation to the groups above from the committed curated
-- JSON ordering (see lib/db/src/seedContent.ts), then remove the startup
-- reconciliation so it does not re-flip them.
