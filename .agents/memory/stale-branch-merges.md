---
name: Stale task-branch merges
description: Task-agent merges can replay a pre-freeze branch wholesale, silently reverting later mainline fixes; revert the whole merge commit rather than hand-repairing files.
---

# Stale task-branch merges

**Rule:** When a task-agent merge breaks files it had no business touching, first check whether the merged content is byte-identical to an old mainline commit (`git diff --quiet <ref> HEAD -- <file>` across candidate ancestors). If the branch forked before later fixes, it can silently revert them wholesale — corrupted runtime files, deleted migration snapshots, regressed lockfile specifiers, all in one merge. The right fix is `git revert` of the whole merge commit (it lands as a LINEAR commit here, single parent — plain `git revert`, no `-m`), not hand-repair of individual files.

**Why:** The #922 merge replayed a branch forked pre-freeze-exit: it reverted the reconstructed openai.ts to its broken ancestor byte-for-byte, deleted the 0033 migration snapshot, and regressed an aws-sdk lockfile specifier. Hand-repairing openai.ts in place looked reasonable until provenance checking showed the entire branch was stale — everything it "changed" outside its scope was a time-travel revert.

**How to apply:**
- Post-merge, diff the merge against pre-merge main for files OUTSIDE the task's stated scope. Any out-of-scope delta is suspect; check byte-identity against the fork-point era.
- Prefer whole-commit revert over in-place repair when the branch is stale; discard any working-tree hand-fixes first so the revert applies cleanly (they become redundant).
- Platform bookkeeping commits (release-notes attachments, `.replit` updates) often sit between the last good commit and the merge — revert preserves them, reset would drop them.
- After revert: frozen-lockfile install, typecheck, boot smoke, canonical suite.

**Env-coupled test trap found in the same incident:** `openai.pronunciation.pilot-capture.test.ts` asserts the allowlist Set is empty "when env var absent" — but `PILOT_CAPTURE_USER_IDS` is now set workspace-wide (pilot capture active), so the canonical suite shows this as a failure (676/4 instead of the documented 675/6). Verify env-state assumptions before treating a suite delta as a code regression: re-run the file with `env -u <VAR>`.
