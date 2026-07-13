---
name: Review spaced-repetition scheduling
description: How /review/phrases orders weak phrases — Leitner spacing, not plain weakest-first.
---

# Review session ordering

The `/review/phrases` endpoint no longer returns weak phrases in pure
weakest-first order. It uses a Leitner-style spaced-repetition schedule
(`buildReviewSchedule` in `progressMetrics.ts`).

**The rules:**
- A phrase is still eligible only while practiced-but-not-mastered (best score
  below `MASTERY_THRESHOLD` = 80). Mastery still removes it from review entirely.
- Each phrase sits in a Leitner "box" (level). A passing attempt (score >=
  `REVIEW_PASS_THRESHOLD` = 60, deliberately below mastery) promotes it one rung
  and widens the gap; any sub-threshold attempt resets it to box 0 (due now).
- `dueAt = lastAttemptAt + REVIEW_INTERVALS_DAYS[level]`. Ordering is by `dueAt`
  ascending (so overdue/due phrases lead, most-overdue first), then weakest best
  score as the tie-break. Because past due dates sort before future ones, this
  single ascending sort naturally puts due phrases before not-yet-due ones.
- Not-yet-due weak phrases are still included to fill the session (cap
  `REVIEW_SESSION_SIZE`); they just sort after the due ones.

**Why:** durable retention wants a phrase resurfaced right before it's forgotten,
not just because it happens to be the current lowest score. `REVIEW_PASS_THRESHOLD`
is intentionally lower than mastery so a learner doing okay earns a longer gap
before full mastery.

**How to apply:** scoring/mastery math (`buildPhraseStats`) is untouched — only
which phrases surface and when. If you change `REVIEW_INTERVALS_DAYS` or the
thresholds, update the unit tests in `progressMetrics.test.ts` (they assert
against the ladder, not hard-coded day counts) in lockstep. The API response
shape is unchanged (still `Phrase[]`), so clients need no regen.
