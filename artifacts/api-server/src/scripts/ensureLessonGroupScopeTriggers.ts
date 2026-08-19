// Startup guard: guaranteed delivery of the lesson-group scope triggers
// (the fallback for the dropped phrases_lesson_group_scope_fk, see
// docs/trigger-fallback-lesson-group-scope.md and migration 0030).
//
// Rationale: the publish schema sync diffs tables/constraints and it is
// UNPROVEN that it carries trigger DDL from custom migrations to prod. The
// app's own connection is read-write, so executing the same idempotent DDL at
// startup is the one guaranteed delivery path. No-op once objects exist.
//
// ORDERING CONTRACT: this MUST run before runBackfillLessonGroups() (and any
// other lesson-group assignment writes) in the boot sequence, so the very
// first prod boot after publish has enforcement in place before any
// assignment write happens.
//
// Logs distinctly on both paths, "created" vs "already present (no-op)", so the first prod boot's logs prove delivery either way.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const TRIGGERS = [
  { trigger: "phrases_lesson_group_scope_trg", table: "phrases" },
  { trigger: "lesson_groups_referenced_guard_trg", table: "lesson_groups" },
] as const;

// The DDL is read from the committed migration file so the guard can never
// drift from migration 0030, single source of truth. esbuild bundles the
// api-server, so the SQL is inlined at build time via a static require of the
// text; we read it relative to the repo layout in dev and embed a fallback
// copy resolution for the bundle.
function loadDdl(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // dev (tsx, src/scripts/) and bundle (dist/) both sit under artifacts/api-server
    path.resolve(here, "../../../../lib/db/drizzle/0030_trigger_lesson_group_scope.sql"),
    path.resolve(here, "../../../lib/db/drizzle/0030_trigger_lesson_group_scope.sql"),
    path.resolve(process.cwd(), "lib/db/drizzle/0030_trigger_lesson_group_scope.sql"),
    path.resolve(process.cwd(), "../../lib/db/drizzle/0030_trigger_lesson_group_scope.sql"),
  ];
  for (const p of candidates) {
    try {
      return readFileSync(p, "utf8");
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "ensureLessonGroupScopeTriggers: cannot locate 0030_trigger_lesson_group_scope.sql",
  );
}

async function triggersPresent(): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal
        AND (c.relname, t.tgname) IN (($1::text,$2::text),($3::text,$4::text))`,
    [
      TRIGGERS[0].table,
      TRIGGERS[0].trigger,
      TRIGGERS[1].table,
      TRIGGERS[1].trigger,
    ],
  );
  return rows[0]?.n === TRIGGERS.length;
}

export async function ensureLessonGroupScopeTriggers(): Promise<void> {
  if (await triggersPresent()) {
    logger.info(
      { triggers: TRIGGERS.map((t) => t.trigger) },
      "Lesson-group scope triggers already present (no-op)",
    );
    return;
  }
  const ddl = loadDdl();
  const statements = ddl
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
  // Verify via catalog, not by trusting execution (ghost-apply history).
  if (!(await triggersPresent())) {
    throw new Error(
      "ensureLessonGroupScopeTriggers: DDL executed but triggers not visible in pg_trigger",
    );
  }
  logger.info(
    { triggers: TRIGGERS.map((t) => t.trigger), statements: statements.length },
    "Lesson-group scope triggers created by startup guard",
  );
}
