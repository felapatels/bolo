---
name: Lesson-group scope trigger fallback
description: Why the composite scope FK became triggers, the dual-home DDL pattern, boot ordering, and how to restore the FK.
---

- The publish diff engine emits composite FKs before the unique constraints they reference and fails; fallback = drop the FK from the declarative schema and enforce the identical invariant with BEFORE triggers raising SQLSTATE 23503 (so FK-shaped error handling and tests keep matching).
- **Why triggers on BOTH sides:** the child-side trigger alone doesn't replicate parent-side FK protection; a guard on the parent table must reject deletes/rekeys while referenced. Known gap: no FK cross-row locks, so a concurrent insert/delete race can slip through under READ COMMITTED — any future group-delete path needs explicit locking.
- **Dual-home DDL pattern:** trigger DDL lives in a custom migration AND an idempotent api-server startup guard that reads the migration file (single source of truth) — because it is unproven that publish schema sync carries trigger DDL to prod. Guard logs "created" vs "already present (no-op)" distinctly; the first prod boot log line is the delivery proof.
- **Boot ordering contract:** the guard must run before any lesson-group assignment writes (the backfill), so first prod boot has enforcement before assignments.
- **How to verify both guard paths cheaply:** drop the triggers on dev, restart api-server, expect the "created" log; restart again for the "no-op" log.
- Restore-the-FK procedure: docs/trigger-fallback-lesson-group-scope.md §7 (re-add FK + drop triggers in ONE migration, remove guard).
- After any dev-DB migrate touching constraints or triggers, verify via catalog (pg_constraint/pg_trigger), never the hash table — the ghost-apply pattern recurs on this dev DB.
