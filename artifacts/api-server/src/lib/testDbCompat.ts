// Test-only compatibility shim for the shared dev database.
//
// The users table is created by the app's own migrations, but a lagging dev DB
// can predate columns the current drizzle schema declares. A drizzle insert
// sends every schema column (as DEFAULT), so any missing one fails the insert.
// Every test suite that creates/updates users rows should call this in its
// before() hook so setup is genuinely self-contained (mirrors
// lib/db/src/schema/users.ts; see api-server-tests + dev-db-migration-drift
// memory notes).
import { pool } from "@workspace/db";

const USERS_COLUMNS = [
  `avatar_url text`,
  `tier text NOT NULL DEFAULT 'free'`,
  `chosen_language text`,
  `subscription_status text`,
  `trial_ends_at timestamptz`,
  `current_period_end timestamptz`,
  `subscription_provider text`,
  `subscription_provider_id text`,
  `pause_until timestamptz`,
  `retention_offer_accepted_at timestamptz`,
  `daily_reminder_enabled boolean NOT NULL DEFAULT false`,
  `daily_reminder_time text`,
  `active_language text`,
  `daily_goal integer NOT NULL DEFAULT 10`,
  `theme text NOT NULL DEFAULT 'system'`,
  `timezone text`,
  `tts_voice text`,
  `has_completed_tour boolean NOT NULL DEFAULT false`,
  `has_chosen_language boolean NOT NULL DEFAULT false`,
];

export async function ensureUsersColumns(): Promise<void> {
  for (const col of USERS_COLUMNS) {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col};`);
  }
}
