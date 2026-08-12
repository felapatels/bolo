-- One topic never holds the same phrase twice.
--
-- Two halves, and the ORDER IS LOAD-BEARING: Postgres refuses to build a
-- unique index over data that already violates it, so any duplicates an
-- environment is carrying must go first, in the same transaction.
--
-- Part 1 — clean what is already there.
--
-- Duplicates in this codebase have two origins. The append path used to read
-- its de-duplication snapshot outside the topic lock, so concurrent taps each
-- passed their own check and each inserted. Separately, the curated seed
-- library de-duplicates on (native script + English gloss), so CORRECTING a
-- gloss made the top-up insert a second row for a phrase the topic already
-- held. Both produce the same shape, and both are resolved the same way.
--
-- Survivor rule, in order:
--   1. the copy carrying the most learner history (attempts, scheduler state,
--      reports), so the least is disturbed, then
--   2. the highest id — the most recently written copy. For the gloss class
--      that is the copy matching the CURRENT curated library, which is the one
--      the seeder would otherwise re-insert on the next boot (and then fail
--      against the very index below). For a true append race the copies are
--      the same text, so either is correct.
--
-- Learner history on a losing copy is repointed to the survivor, never
-- dropped: `attempts` has no foreign key to `phrases`, so a bare delete would
-- silently orphan a learner's practice history rather than fail loudly.
--
-- A clean environment (production is clean as of this migration; a fresh
-- database seeds from a collision-free library) executes this as a no-op.
DO $$
DECLARE
  v_losers int;
  v_attempts int;
  v_memory int;
  v_reports int;
  v_regrouped int;
BEGIN
  CREATE TEMP TABLE _phrase_text_dupes ON COMMIT DROP AS
  WITH scored AS (
    SELECT
      p.id,
      p.language_code,
      p.category_id,
      p.stage,
      p.lesson_group_id,
      lower(regexp_replace(btrim(p.native_script), '\s+', ' ', 'g')) AS norm,
      (SELECT count(*) FROM attempts a WHERE a.phrase_id = p.id)
        + (SELECT count(*) FROM user_item_memory m WHERE m.phrase_id = p.id)
        + (SELECT count(*) FROM phrase_reports r WHERE r.phrase_id = p.id)
        AS history
    FROM phrases p
  ),
  ranked AS (
    SELECT
      s.*,
      row_number() OVER (
        PARTITION BY s.language_code, s.category_id, s.stage, s.norm
        ORDER BY s.history DESC, s.id DESC
      ) AS rn,
      count(*) OVER (
        PARTITION BY s.language_code, s.category_id, s.stage, s.norm
      ) AS copies
    FROM scored s
  )
  SELECT
    loser.id AS loser_id,
    keeper.id AS keeper_id,
    loser.lesson_group_id AS lesson_group_id
  FROM ranked loser
  JOIN ranked keeper
    ON keeper.language_code = loser.language_code
   AND keeper.category_id = loser.category_id
   AND keeper.stage = loser.stage
   AND keeper.norm = loser.norm
   AND keeper.rn = 1
  WHERE loser.copies > 1 AND loser.rn > 1;

  SELECT count(*) INTO v_losers FROM _phrase_text_dupes;
  IF v_losers = 0 THEN
    RAISE NOTICE 'phrase dedup: no duplicate phrase text found; nothing to clean.';
    RETURN;
  END IF;

  -- Practice history follows the surviving phrase.
  UPDATE attempts a
     SET phrase_id = d.keeper_id
    FROM _phrase_text_dupes d
   WHERE a.phrase_id = d.loser_id;
  GET DIAGNOSTICS v_attempts = ROW_COUNT;

  -- Learner reports likewise (append-only, no uniqueness to respect).
  UPDATE phrase_reports r
     SET phrase_id = d.keeper_id
    FROM _phrase_text_dupes d
   WHERE r.phrase_id = d.loser_id;
  GET DIAGNOSTICS v_reports = ROW_COUNT;

  -- FSRS scheduler state is one row per (learner, phrase). Move it across
  -- where the learner has no state on the survivor yet; where they have state
  -- on both copies the survivor's row is the one that stays.
  UPDATE user_item_memory m
     SET phrase_id = d.keeper_id
    FROM _phrase_text_dupes d
   WHERE m.phrase_id = d.loser_id
     AND NOT EXISTS (
       SELECT 1 FROM user_item_memory k
        WHERE k.user_id = m.user_id AND k.phrase_id = d.keeper_id
     );
  GET DIAGNOSTICS v_memory = ROW_COUNT;

  DELETE FROM user_item_memory m
   USING _phrase_text_dupes d
   WHERE m.phrase_id = d.loser_id;

  DELETE FROM phrases p
   USING _phrase_text_dupes d
   WHERE p.id = d.loser_id;

  -- Close the gap each delete leaves in its lesson group's position sequence.
  -- Ordered playback reads positions in ascending order, so renumbering the
  -- survivors 1..n in their existing order preserves it exactly. Two phases
  -- (negative, then flipped back) because (lesson_group_id,
  -- lesson_group_position) is unique and checked per row.
  WITH affected AS (
    SELECT DISTINCT lesson_group_id AS gid
      FROM _phrase_text_dupes
     WHERE lesson_group_id IS NOT NULL
  ),
  renumbered AS (
    SELECT
      p.id,
      row_number() OVER (
        PARTITION BY p.lesson_group_id
        ORDER BY p.lesson_group_position, p.id
      ) AS pos
    FROM phrases p
    JOIN affected a ON a.gid = p.lesson_group_id
   WHERE p.lesson_group_position IS NOT NULL
  )
  UPDATE phrases p
     SET lesson_group_position = -r.pos
    FROM renumbered r
   WHERE p.id = r.id;
  GET DIAGNOSTICS v_regrouped = ROW_COUNT;

  UPDATE phrases
     SET lesson_group_position = -lesson_group_position
   WHERE lesson_group_position < 0;

  RAISE NOTICE 'phrase dedup: removed % duplicate row(s); repointed % attempt(s), % scheduler row(s), % report(s); renumbered % position(s).',
    v_losers, v_attempts, v_memory, v_reports, v_regrouped;
END $$;
--> statement-breakpoint
-- Part 2 — make the class impossible from any writer, including one that
-- skips the application's own guard. The expression is the SQL twin of
-- normalizePhraseText() in lib/db/src/phraseText.ts: trim, lower-case,
-- collapse internal whitespace. Change one and you must change the other.
CREATE UNIQUE INDEX "phrases_topic_stage_text_unique" ON "phrases" USING btree ("language_code","category_id","stage",lower(regexp_replace(btrim("native_script"), '\s+', ' ', 'g')));
