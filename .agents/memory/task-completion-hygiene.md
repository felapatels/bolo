---
name: Task completion hygiene
description: markTaskComplete commits the entire working tree; leftover unrelated files fail code review, and baseline test failures need an audited skip reason.
---

# Task completion hygiene

**Rule 1:** `markTaskComplete` commits the ENTIRE working tree (even when validation fails, the commit lands). Any unrelated dirty/untracked files left over from earlier sessions ride into the task's commit and the completion code review judges them as part of the task — it will reject the merge for regressions you didn't make.

**Why:** A visual-only task was rejected because leftover seed-data changes from a prior session's content rollout were sitting uncommitted in the tree; they also added 2 extra API test failures on top of the documented baseline.

**How to apply:** Before the first `markTaskComplete`, run `git status --porcelain`. If anything outside the task's scope is dirty or untracked, revert/remove it first (it stays recoverable via the failed-attempt commit or a stash). After a failed completion attempt, remember the tree is already committed — fix forward with a new commit, not `git checkout`-of-worktree-only.

**Rule 2:** The completion validation runs every configured test workflow, and this project's suites fail at documented pre-existing baselines (api-server: enumerated in CODEBASE-FACTS §8; web: ZERO since July 30, 2026 — the web suite must be fully green, any web failure is new breakage). Validation may therefore FAIL even for clean work on the api-server side only.

**How to apply:** Diagnose first — confirm the failure count matches the enumerated baseline exactly (extra failures mean your diff or leftovers broke something). Then re-call `markTaskComplete` with `skip_validation_reason` citing the CODEBASE-FACTS baseline rows and the checks that do pass. Never inflate the baseline rows to absorb new failures.

**Rule 3 (standing, all sessions):** Never create task cards — not via `proposeFollowUpTasks`, not via any task-creation callback, not for follow-ups, housekeeping, or suggestions. Bank any suggestions as one line inside the final report instead.

**Why:** The owner's plan already tracks next work; unsolicited cards clutter the panel and violate the session rule stated at task open.
