#!/usr/bin/env bash
#
# Schema-vs-migration drift check for @workspace/db.
#
# Fails when lib/db/src/schema/* has changed without a committed migration in
# lib/db/drizzle/. Runs fully non-interactively (no TTY required), so it is safe
# in CI / validation automation.
#
# Two guards:
#   1. `drizzle-kit check` — verifies the committed migrations + meta snapshots
#      are internally consistent (no collisions / corrupt journal).
#   2. `drizzle-kit generate` produces no new migration — if generating against
#      the current schema would emit a migration, the schema has drifted from
#      the committed migrations. Any files generate emits are reverted so the
#      check leaves the working tree untouched.
#
set -euo pipefail

# Resolve lib/db regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$DB_DIR"

DRIZZLE_DIR="$DB_DIR/drizzle"
CONFIG="./drizzle.config.ts"

echo "==> Checking migration consistency (drizzle-kit check)"
pnpm exec drizzle-kit check --config "$CONFIG"

echo "==> Checking for uncommitted schema drift (drizzle-kit generate)"

# Back up the migrations dir so we can restore it no matter what generate does.
BACKUP_DIR="$(mktemp -d)"
cp -a "$DRIZZLE_DIR/." "$BACKUP_DIR/"

restore_migrations() {
  rm -rf "$DRIZZLE_DIR"
  mkdir -p "$DRIZZLE_DIR"
  cp -a "$BACKUP_DIR/." "$DRIZZLE_DIR/"
  rm -rf "$BACKUP_DIR"
}
trap restore_migrations EXIT

before="$(find "$DRIZZLE_DIR" -maxdepth 1 -name '*.sql' | sort)"
pnpm exec drizzle-kit generate --config "$CONFIG"
after="$(find "$DRIZZLE_DIR" -maxdepth 1 -name '*.sql' | sort)"

new_migrations="$(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$after"))"

if [ -n "$new_migrations" ]; then
  echo ""
  echo "ERROR: schema-vs-migration drift detected." >&2
  echo "The schema in lib/db/src/schema/* changed without a committed migration." >&2
  echo "drizzle-kit generate produced a new migration:" >&2
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    echo "  - $(basename "$f")" >&2
  done <<< "$new_migrations"
  echo "" >&2
  echo "Fix: run 'pnpm --filter @workspace/db run generate' and commit the new" >&2
  echo "migration under lib/db/drizzle/." >&2
  exit 1
fi

echo ""
echo "OK: schema and committed migrations are in sync."
