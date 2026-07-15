---
name: Plus auto-replenishment
description: Background phrase top-up for Plus learners — trigger, dedup, and cap rules.
---

Plus learners get phrases auto-appended when they've engaged ≥80% of a topic's phrase list.

**Rules:**
- Trigger is decided per-fetch by a pure helper (plan + engagement threshold) and fired AFTER the response is sent — never blocks the request.
- Dedup is two-layer: an in-process in-flight map (same server) plus a Postgres session advisory lock on `phrase-replenish:<lang>:<cat>` (cross-process/device). Losing the lock means skip, not wait.
- Replenishment only tops up an existing lesson; it never creates one, and it records into lesson_generations for tracking but must never consult the Free daily cap (only Plus reaches it).
- A duplicates-only generation inserting 0 phrases is a success, not an error — it preserves the "you've mastered everything" UX.
- A DB-backed cooldown (any lesson_generations row for the lang+topic in the last 10 min) gates every run — without it, client 30s polling on an exhausted topic re-pays the AI every cycle (code review rejected the first version for exactly this).

**Why:** overlapping fetches (topic opened twice / two devices) would otherwise double-pay the AI and duplicate content.

**How to apply:** any new background-generation path should reuse this pattern (fire-after-response, advisory-lock dedup, injectable generator for tests). Clients pick up new content via a 30s refetchInterval + focus refetch on the category screens.
