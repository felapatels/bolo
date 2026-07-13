#!/usr/bin/env bash
#
# Fresh-database migration check for @workspace/db.
#
# Proves the committed migrations in lib/db/drizzle/ actually apply cleanly to an
# empty database. `check-drift.sh` only proves the schema and migrations are in
# sync; it does NOT prove a hand-edited or corrupt migration still applies. This
# check creates a throwaway database, runs `drizzle-kit migrate` against it, and
# fails if any migration errors -- catching broken migrations before they ship
# (and before post-merge `setup` runs them against a real environment).
#
# Runs fully non-interactively (no TTY required), so it is safe in CI /
# validation automation. It NEVER touches the dev or production database: all
# DDL runs against a uniquely-named throwaway database that is dropped on exit.
#
set -euo pipefail

# Resolve lib/db regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$DB_DIR"

CONFIG="./drizzle.config.ts"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set; cannot reach the Postgres server." >&2
  exit 1
fi

# Unique throwaway database name (server-side identifier, not a real env db).
TEMP_DB="drizzle_migrate_check_$$_$(date +%s)"

# Derive the admin connection URL (points at the maintenance "postgres" db on
# the same server) and the throwaway-db connection URL from DATABASE_URL, so we
# reuse the exact host/credentials/params without ever hardcoding them.
ADMIN_URL="$(TEMP_DB="$TEMP_DB" node -e '
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = "/postgres";
  process.stdout.write(u.toString());
')"
TEMP_URL="$(TEMP_DB="$TEMP_DB" node -e '
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = "/" + process.env.TEMP_DB;
  process.stdout.write(u.toString());
')"

drop_temp_db() {
  # Terminate any lingering connections, then drop the throwaway database.
  ADMIN_URL="$ADMIN_URL" TEMP_DB="$TEMP_DB" node -e '
    const { Client } = require("pg");
    (async () => {
      const c = new Client({ connectionString: process.env.ADMIN_URL });
      try {
        await c.connect();
        await c.query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
          [process.env.TEMP_DB],
        );
        await c.query(`DROP DATABASE IF EXISTS "${process.env.TEMP_DB}"`);
      } catch (e) {
        console.error("WARN: failed to drop throwaway database " + process.env.TEMP_DB + ": " + e.message);
      } finally {
        await c.end();
      }
    })();
  ' || true
}
trap drop_temp_db EXIT

echo "==> Creating throwaway database $TEMP_DB"
ADMIN_URL="$ADMIN_URL" TEMP_DB="$TEMP_DB" node -e '
  const { Client } = require("pg");
  (async () => {
    const c = new Client({ connectionString: process.env.ADMIN_URL });
    await c.connect();
    try {
      await c.query(`CREATE DATABASE "${process.env.TEMP_DB}"`);
    } finally {
      await c.end();
    }
  })().catch((e) => {
    console.error("ERROR: could not create throwaway database: " + e.message);
    process.exit(1);
  });
'

echo "==> Applying committed migrations to the fresh database (drizzle-kit migrate)"
DATABASE_URL="$TEMP_URL" pnpm exec drizzle-kit migrate --config "$CONFIG"

echo ""
echo "OK: all committed migrations applied cleanly to an empty database."
