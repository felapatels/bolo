-- Trigger fallback for phrases_lesson_group_scope_fk (dropped in 0029).
-- See docs/trigger-fallback-lesson-group-scope.md. Idempotent: CREATE OR
-- REPLACE functions, DROP TRIGGER IF EXISTS before each CREATE TRIGGER.
-- The api-server startup guard executes this same DDL as the guaranteed
-- delivery path for prod (publish sync may not carry trigger DDL).

CREATE OR REPLACE FUNCTION enforce_phrase_lesson_group_scope() RETURNS trigger AS $$
BEGIN
  IF NEW.lesson_group_id IS NULL THEN
    RETURN NEW;  -- MATCH SIMPLE parity: unassigned phrases unconstrained
  END IF;
  PERFORM 1 FROM lesson_groups g
    WHERE g.id = NEW.lesson_group_id
      AND g.language_code = NEW.language_code
      AND g.category_id  = NEW.category_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'phrase % scope mismatch: lesson_group % does not exist with (language %, category %)',
      NEW.id, NEW.lesson_group_id, NEW.language_code, NEW.category_id
      USING ERRCODE = 'foreign_key_violation';  -- 23503, matches FK error handling
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS phrases_lesson_group_scope_trg ON phrases;
--> statement-breakpoint
CREATE TRIGGER phrases_lesson_group_scope_trg
  BEFORE INSERT OR UPDATE OF lesson_group_id, language_code, category_id ON phrases
  FOR EACH ROW EXECUTE FUNCTION enforce_phrase_lesson_group_scope();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_lesson_group_still_referenced() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.id = NEW.id
     AND OLD.language_code = NEW.language_code
     AND OLD.category_id = NEW.category_id THEN
    RETURN NEW;  -- key columns untouched
  END IF;
  IF EXISTS (SELECT 1 FROM phrases p WHERE p.lesson_group_id = OLD.id) THEN
    RAISE EXCEPTION 'lesson_group % is referenced by phrases; % rejected', OLD.id, TG_OP
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS lesson_groups_referenced_guard_trg ON lesson_groups;
--> statement-breakpoint
CREATE TRIGGER lesson_groups_referenced_guard_trg
  BEFORE DELETE OR UPDATE OF id, language_code, category_id ON lesson_groups
  FOR EACH ROW EXECUTE FUNCTION enforce_lesson_group_still_referenced();
