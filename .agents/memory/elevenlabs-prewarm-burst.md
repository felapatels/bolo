---
name: ElevenLabs prewarm burst flag
description: Free-tier ElevenLabs flags concurrent synthesis bursts as unusual activity; safe prewarm parameters and circuit-breaker pattern.
---

# ElevenLabs prewarm burst — safe parameters

## The rule
Run prewarm with **concurrency ≤ 2** and **≥ 500 ms pacing between calls per worker**. Abort the whole run after **5 consecutive failures** (circuit breaker). This avoids triggering ElevenLabs' free-tier "unusual activity" abuse flag.

**Why:** A concurrency-5 burst during initial migration triggered a temporary account disable (401 "detected_unusual_activity: upgrade to a paid subscription"). A single sequential call immediately after still succeeded — the block is burst-triggered/intermittent. Subsequent restarts with concurrency 2 + pacing ran cleanly.

**How to apply:**
- `CONCURRENCY = 2`, `PACING_MS = 500`, `MAX_CONSECUTIVE_FAILURES = 5` constants in `artifacts/api-server/src/lib/ttsPrewarm.ts`.
- If the circuit breaker trips at server start, the lazy `/openai/tts` synthesis path + legacy-cache fallback keeps learners from ever hearing silence — no manual intervention required.
- If you raise concurrency for a bulk re-seed on a paid plan, test carefully before increasing above 5.
