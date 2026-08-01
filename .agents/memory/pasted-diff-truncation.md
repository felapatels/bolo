---
name: Pasted-diff truncation
description: Chat-pasted unified diffs can silently lose hunk lines; git apply accepts them and drops trailing edits.
---

# Pasted-diff truncation

**Rule:** Never trust `git apply` success as proof a chat-pasted diff landed completely. A mangled hunk header (counts smaller than the pasted body) makes git consume only the counted lines and silently skip the rest as inter-hunk garbage — `--check` passes, the commit looks fine, and the dropped edits only surface when a test pins them.

**Why:** During the Aug 2026 main-branch repair, a pasted Task diff's journey.tsx hunk had header counts covering only the first sub-change; the `r={3}→RAIL_PULSE.dotRadius` and `color` edits after it were silently skipped (a context line was also lost entirely). Only the re-landed test caught it.

**How to apply:**
- After applying any pasted diff, verify with an independent reference: `git worktree add` at the base, `git apply --recount` there, `git write-tree`, and `git diff <ref-tree> HEAD` must be empty. `--recount` rebuilds counts from the body, so it catches header truncation (it fails loudly on lost context lines instead of skipping).
- Pastes also routinely lose the trailing newline (`corrupt patch at line N` at EOF) — fix by appending `\n`, not by editing hunks.
- If the reference apply fails on one file, hand-apply that file's edits from the visible intent and verify the rest via the worktree diff.
