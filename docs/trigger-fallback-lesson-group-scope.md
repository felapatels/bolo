# Fallback spec: replace phrases_lesson_group_scope_fk with a trigger

Status: PREPARED, NOT EXECUTED. Trigger only if Replit support cannot fix the
publish diff engine's FK-before-unique ordering bug (decision point ~48h from
July 29, 2026). Publish remains frozen until then.

## 1. What the FK enforces today (invariant to replicate exactly)

`phrases_lesson_group_scope_fk` is a composite FK
`phrases(lesson_group_id, language_code, category_id)` referencing
`lesson_groups(id, language_code, category_id)` (backed by
`lesson_groups_id_language_category_unique`), `ON DELETE NO ACTION`,
`ON UPDATE NO ACTION`, MATCH SIMPLE. Semantics:

- A phrase with `lesson_group_id IS NULL` is unconstrained (MATCH SIMPLE with a
  null member passes). Unassigned phrases stay legal.
- A phrase with a group must point at a `lesson_groups` row whose
  `(language_code, category_id)` equal the phrase's own.
- The parent side is also guarded: deleting a referenced group, or changing its
  `id/language_code/category_id` while phrases reference it, is rejected.

## 2. Trigger function and timing (phrases side)

`BEFORE INSERT OR UPDATE OF lesson_group_id, language_code, category_id ON phrases`,
`FOR EACH ROW`. Column-targeted UPDATE firing keeps the hot paths (attempt
counters do not touch phrases; mastery lives elsewhere) free of trigger cost.

```sql
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
      USING ERRCODE = 'foreign_key_violation';  -- 23503, so existing error handling/tests keep matching
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER phrases_lesson_group_scope_trg
  BEFORE INSERT OR UPDATE OF lesson_group_id, language_code, category_id ON phrases
  FOR EACH ROW EXECUTE FUNCTION enforce_phrase_lesson_group_scope();
```

The lookup hits `lesson_groups_id_language_category_unique` (which stays in the
schema; only the FK goes), so it is a single index probe per row.

## 3. lesson_groups-side guarding: YES, required

A real FK rejects parent-side violations; the phrases trigger alone does not.
Without a parent guard, `DELETE FROM lesson_groups` or an UPDATE of a group's
`language_code/category_id` would silently orphan phrase references. Current
code never deletes or rekeys groups, but the FK protected against future code
and manual SQL, so the fallback must too:

```sql
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

CREATE TRIGGER lesson_groups_referenced_guard_trg
  BEFORE DELETE OR UPDATE OF id, language_code, category_id ON lesson_groups
  FOR EACH ROW EXECUTE FUNCTION enforce_lesson_group_still_referenced();
```

Note: `EXISTS` on `phrases.lesson_group_id` uses the existing index on that
column; group deletes/rekeys are rare-to-never, so cost is irrelevant.

Known gap vs a true FK (accepted): triggers do not take the FK's cross-row
locks, so a concurrent insert-phrase / delete-group race could theoretically
slip through under READ COMMITTED. Current code has no group-delete path at
all; if one is ever added it must take `SELECT ... FOR KEY SHARE`-equivalent
locking or an advisory lock. Record this in the facts doc when executing.

## 4. Migration sequence (journal-consistent)

Dev DB is currently AT 0027 (FK applied). Keep the chain append-only:

1. Remove the `foreignKey({ name: "phrases_lesson_group_scope_fk", ... })`
   block from `lib/db/src/schema/phrases.ts` (leave a comment pointing here).
   The unique constraint on lesson_groups stays.
2. `drizzle-kit generate` produces 0028 with `DROP CONSTRAINT
   phrases_lesson_group_scope_fk` (non-TTY note: if it asks rename-vs-drop it
   aborts; this is a pure drop so it should not, but verify).
3. `drizzle-kit generate --custom` produces an empty 0029; paste the two
   functions + two triggers above (idempotent forms: CREATE OR REPLACE, and
   DROP TRIGGER IF EXISTS before CREATE TRIGGER).
4. `pnpm --filter @workspace/db run migrate` on dev; then db-drift and
   db-migrations (fresh-DB chain) must both pass.
5. Belt-and-braces for prod: add an idempotent startup guard in api-server
   (same slot as the content seeder, behind the existing advisory lock) that
   executes the same DROP-IF-EXISTS/CREATE trigger DDL. Rationale: the publish
   schema sync diffs tables/constraints and it is UNPROVEN that it carries
   trigger DDL from custom migrations to prod; the app's own connection is
   read-write, so startup DDL is the one guaranteed delivery path. The guard is
   a no-op once objects exist.

## 5. Expected publish delta (pre-flight check in the generated-migrations panel)

Final committed schema then contains NO composite FK, so the panel must show:
- CREATE for `lesson_group_progress` and `lesson_group_testouts`
- ADD CONSTRAINT `lesson_groups_id_language_category_unique`
- NO `ADD CONSTRAINT phrases_lesson_group_scope_fk` line (0027's add and
  0028's drop net out of the final schema)
- Trigger/function statements may or may not appear (engine may not model
  them); absence is fine because of the startup guard in step 4.5.

If any FK ADD CONSTRAINT still appears, STOP: that would mean the engine
replays migrations rather than diffing net schema, and the fallback needs
rethinking before submitting.

## 6. Performance note (replenisher batch inserts)

The replenisher inserts groups and phrases in one transaction, groups first, so
the BEFORE trigger sees the just-inserted groups. Cost per phrase row is one
unique-index probe on lesson_groups, same order as the FK's own per-row RI
check; for replenisher batch sizes (tens of rows) this is microseconds and
strictly cheaper than the AI call that precedes it. Column-targeted UPDATE
firing means bulk updates that do not touch the three scope columns pay
nothing. No statement-level or deferred variant needed.

## 7. Restoring the declarative FK later (if Replit fixes the engine)

1. Re-add the `foreignKey` block to `phrases.ts` (git history has it verbatim).
2. `drizzle-kit generate` produces the ADD CONSTRAINT migration; in the SAME
   migration (edit the generated SQL) drop both triggers and both functions so
   no state carries double enforcement.
3. Apply to dev, run db-drift + db-migrations, remove the startup guard, then
   publish. ADD CONSTRAINT validates existing rows at apply time; prod data was
   verified clean (0 scope mismatches across 5,896 phrases, July 29, 2026), and
   the triggers kept it clean in the interim.
4. Pre-flight the panel again: delta should be exactly one ADD CONSTRAINT (plus
   trigger drops if the engine carries them; harmless either way given the
   guard is gone).
