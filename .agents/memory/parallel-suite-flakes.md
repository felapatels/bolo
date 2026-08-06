---
name: Parallel suite runs flake timing tests
description: Running the api and web suites concurrently makes timing-sensitive api tests fail spuriously; run suites solo.
---

**Rule.** Do not run the api-server suite and the gujarati-coach web suite in parallel ShellExec calls. Run them sequentially (or the api suite solo).

**Why:** The api suite contains timing-sensitive tests — notably feedbackTts "joins an in-flight prewarm" (a pending-join race with a slow mock). Under CPU contention from a concurrently running vitest web suite, it failed spuriously ("route must serve the prewarmed audio"); the identical code passed on a solo re-run. That cost a suite run out of the 3-per-task budget.

**How to apply:** When gating a task that needs both suites, run web first (fast, hermetic jsdom), then api solo. If a timing-ish api test fails only in a contended run, suspect load before code.

**Mobile has one too (Aug 6, 2026):** bolo-mobile's `quick-game-shell.test.tsx` "topic picker" test hits jest's 5s per-test timeout in a full-suite run and passes 67/67 in a targeted single-file run. Same protocol: targeted file run settles flake-vs-regression for free.

**Update (Aug 3, 2026):** the feedbackTts pending-join timing test also flakes in a SOLO full api-suite run under ordinary workspace load (dev workflows running); parallel suites are sufficient but not necessary. Settle flake-vs-regression with a free targeted run of `src/lib/feedbackTts.test.ts` (note: co-located under src/lib/, NOT src/test/) before spending a suite re-run.
