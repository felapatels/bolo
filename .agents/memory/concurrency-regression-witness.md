---
name: Concurrency regression tests need an inline witness
description: How to write a discriminating test for a retired race-prone algorithm without racing — and the ordering mistake that makes such a test silently useless.
---

When replacing a race-prone algorithm (read-then-act, balance compares, check-then-write), a regression test that only asserts *the new code is correct* proves nothing: the old code usually passes it too.

**The rule.** Carry the retired algorithm into the test as an inline witness function, drive the interfering operation into the exact window the old algorithm was vulnerable in, then assert **both** directions: the witness DOES exhibit the defect, and the shipped code does not.

**Why:** the interference must land *between* the old algorithm's two reads. Landing it before the call (the intuitive, easier-to-write version) leaves the old algorithm reading a already-settled balance and passing cleanly — the test goes green against both implementations and silently protects nothing. This exact mistake shipped in a first draft of the Chai `chaiGranted` receipt fix and was caught only by code review, not by the test passing.

**How to apply:** whenever a fix's rationale is "X could not distinguish A from B under concurrency," the test must construct the A/B ambiguity deterministically rather than by racing (racing is flaky and usually unreproducible in CI). A callback parameter — `interleave: () => Promise<unknown>` — invoked at the vulnerable point inside the witness is enough. Assert the witness's wrong answer explicitly, so if someone later "fixes" the witness the test fails loudly instead of degrading to a tautology.

**Related trap:** suite totals quoted in a task spec go stale fast. Reconcile a mismatch by counting the test declarations your own diff adds (`git diff -U0 | grep -c '^+.*it('`) and subtracting, rather than re-running a suite at an older commit to compare.
