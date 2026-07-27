-- Scoring Core v2: new tables, additive columns on existing tables, indices.
-- All changes are purely additive (no renames, no drops, no type changes) so
-- this migration is safe to run against a database that was already patched
-- ad-hoc via psql during development.  Every statement uses IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS so re-running is idempotent.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_item_memory" (
  "id"             SERIAL PRIMARY KEY,
  "user_id"        TEXT NOT NULL REFERENCES "users"("id"),
  "phrase_id"      INTEGER NOT NULL REFERENCES "phrases"("id"),
  "stability"      REAL NOT NULL DEFAULT 0,
  "difficulty"     REAL NOT NULL DEFAULT 5,
  "state"          TEXT NOT NULL DEFAULT 'new',
  "reps"           INTEGER NOT NULL DEFAULT 0,
  "lapses"         INTEGER NOT NULL DEFAULT 0,
  "scheduled_days" INTEGER NOT NULL DEFAULT 0,
  "due_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "last_review_at" TIMESTAMPTZ,
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "uq_user_item_memory_user_phrase" UNIQUE ("user_id", "phrase_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_ability" (
  "user_id"       TEXT NOT NULL REFERENCES "users"("id"),
  "language_code" TEXT NOT NULL REFERENCES "languages"("code"),
  "theta"         REAL NOT NULL DEFAULT 0,
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("user_id", "language_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "xp_ledger" (
  "id"            SERIAL PRIMARY KEY,
  "user_id"       TEXT NOT NULL REFERENCES "users"("id"),
  "language_code" TEXT NOT NULL REFERENCES "languages"("code"),
  "source"        TEXT NOT NULL,
  "ref_id"        TEXT NOT NULL,
  "xp"            INTEGER NOT NULL,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "uq_xp_ledger_user_source_ref" UNIQUE ("user_id", "source", "ref_id")
);
--> statement-breakpoint
ALTER TABLE "attempts"
  ADD COLUMN IF NOT EXISTS "latency_ms"        INTEGER,
  ADD COLUMN IF NOT EXISTS "audio_duration_ms" INTEGER,
  ADD COLUMN IF NOT EXISTS "band"              TEXT,
  ADD COLUMN IF NOT EXISTS "fsrs_rating"       INTEGER,
  ADD COLUMN IF NOT EXISTS "theta_delta"       REAL,
  ADD COLUMN IF NOT EXISTS "beta_delta"        REAL,
  ADD COLUMN IF NOT EXISTS "xp_awarded"        INTEGER,
  ADD COLUMN IF NOT EXISTS "flags"             TEXT;
--> statement-breakpoint
ALTER TABLE "phrases"
  ADD COLUMN IF NOT EXISTS "accepted_answers"  JSONB,
  ADD COLUMN IF NOT EXISTS "elo_difficulty"    REAL,
  ADD COLUMN IF NOT EXISTS "elo_difficulty_rd" REAL,
  ADD COLUMN IF NOT EXISTS "exposure_count"    INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "tz_grace_used_on" DATE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_item_memory_user_due"
  ON "user_item_memory" ("user_id", "due_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_xp_ledger_user_lang"
  ON "xp_ledger" ("user_id", "language_code");
