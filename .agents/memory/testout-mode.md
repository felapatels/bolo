---
name: Express test-out client mode
description: How the journey test-out flow reuses the practice screens on web and mobile, and the traps hit while wiring it
---

# Express test-out client mode (web + mobile)

The journey progression-lock dialog's "Test out of this stop" launches the EXISTING practice screen with `mode=testout` (web: `/practice/:zoneId?group=<id>&mode=testout`; mobile: route params `{ group, mode: 'testout' }`). No parallel recorder exists.

**The rule:** test-out is a display/persistence mode, not a new flow. It swaps the phrase source (GET `/lesson-groups/:id/test-out`, an envelope `{ phrases, sampleSize, requiredCorrect }`, NOT a bare array), suppresses per-phrase persistence (no createAttempt, no XP arc, tokens collected in a ref keyed by phrase id), hides every retry control (one take per phrase, including the retry-band primary flip), and replaces the session summary with a verdict screen driven directly off the submit mutation state (pending/pass/fail/error-with-resubmit; resubmit reuses the collected tokens, no re-recording).

**Why:** the recording/evaluation pipeline is the most fragile code on both platforms (mic prewarm, barge-in, audio sessions); duplicating it for a 5-phrase quiz would fork every future fix. Verified: the testout branch does not touch the hold-to-talk/recording path at all, so it cannot interact with barge-in changes.

**How to apply / traps:**
- Fail path returns to the journey (router.back / link), never resets the session in place — remount/state-reset bugs otherwise.
- The testout query must feed the same error seam as the group query so 402/locked handling (UpgradeScreen etc.) applies unchanged.
- Server test-out routes are deliberately EXEMPT from sequential unlock (any locked stop can be tested out of); entitlement gates still run first.
- A pass must invalidate the category lesson-group listing AND the group phrases so the map shows unlocked + Express stamp on return.
