-- Journey 1 recording list for ONE language: English cue plus romanization.
--
-- Purpose: hand this to a native speaker so they can record each phrase for the
-- reference-comparison scorer (artifacts/api-server/src/lib/pronunciationCompare.ts).
-- The romanization is what tells them WHICH phrase, since they are unlikely to
-- read the English gloss as the target.
--
-- RUN THIS AGAINST PRODUCTION, NEVER THE REPL SHELL. The Shell's DATABASE_URL is
-- the DEVELOPMENT database and the two are divergent; a list built from dev can
-- name phrases no learner will ever see. See CLAUDE.md, "THERE ARE TWO DATABASES".
--
-- CHANGE THE LANGUAGE ON THE WHERE LINE BELOW. Codes: as bn brx doi gu hi kn ks
-- kok mai ml mni mr ne or pa sa sat sd ta te ur
--
-- Plain SQL on purpose: no \set, no \i, so it pastes into the Replit Database
-- pane's query box as readily as into psql.

SELECT
  c.sort_order                        AS zone,
  c.slug                              AS zone_slug,
  lg.position                         AS stop,
  p.sort_order                        AS n,
  p.english,
  p.romanized
FROM phrases p
JOIN categories c    ON c.id  = p.category_id
LEFT JOIN lesson_groups lg ON lg.id = p.lesson_group_id
WHERE p.language_code = 'sat'   -- <<< change this
  -- Journey 1 is the original twelve zones. Journey 2 added its own on top, so
  -- naming these explicitly is what keeps the list to the first run.
  AND c.slug IN ('greetings','family','numbers','food','everyday','feelings',
                 'travel','shopping','time','work','health','festivals')
  -- The extended library is a paid add-on, not the journey a learner walks.
  AND p.premium = false
  AND p.stage = 'phrase'
ORDER BY c.sort_order, lg.position NULLS LAST, p.sort_order, p.id;
