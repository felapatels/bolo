#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Use push-force so schema sync runs non-interactively. Plain `push` prompts
# on ambiguous diffs (e.g. column renames) and there is no TTY during a merge,
# which silently aborts the sync and leaves the DB behind the merged code.
pnpm --filter db run push-force
