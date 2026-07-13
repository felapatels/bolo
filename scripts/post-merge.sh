#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Apply the committed drizzle migrations, then seed reference data. `migrate`
# is non-interactive and TTY-free (unlike `push`, which prompts on ambiguous
# diffs and silently aborts when stdin is closed during a merge), so a fresh or
# lagging environment reproduces the exact schema the merged code expects.
# Both steps are idempotent: applied migrations are tracked in the migrations
# journal, and the seed upserts reference data.
pnpm --filter @workspace/db run setup
