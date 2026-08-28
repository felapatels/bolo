-- How many Journey 1 phrases each language has, and its speech capability.
-- Run against PRODUCTION. Plain SQL, no psql meta-commands, so it pastes into
-- the Replit Database pane's query box as well as into psql.
SELECT
  l.code,
  l.name,
  l.speech_capability,
  count(p.id) AS journey1_phrases
FROM languages l
LEFT JOIN phrases p
  ON p.language_code = l.code
 AND p.premium = false
 AND p.stage = 'phrase'
 AND p.category_id IN (
       SELECT id FROM categories WHERE slug IN
       ('greetings','family','numbers','food','everyday','feelings',
        'travel','shopping','time','work','health','festivals'))
GROUP BY l.code, l.name, l.speech_capability
ORDER BY
  CASE l.speech_capability WHEN 'unsupported' THEN 0 WHEN 'degraded' THEN 1 ELSE 2 END,
  l.name;
