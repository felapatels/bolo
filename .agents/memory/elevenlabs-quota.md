---
name: ElevenLabs quota visibility & TTS fallback
description: How remaining ElevenLabs credits are (and aren't) observable, and the gpt-audio fallback contract for phrase TTS.
---

- The current ELEVENLABS_API_KEY **lacks the `user_read` permission**, so `GET /v1/user/subscription` 401s (missing_permissions). Remaining monthly credits cannot be read until the key is regenerated with `user_read` at elevenlabs.io.
- TTS responses only expose per-request `character-cost` header — no limit/remaining. The audio client accumulates these into in-process usage counters (`getElevenLabsUsageStats`).
- `elevenLabsQuotaMonitor` (api-server) piggybacks on TTS traffic, throttled to one subscription check per 10 min; on the missing-permission 401 it warns once with an actionable message and permanently switches to logging usage counters. Warn threshold: <20% remaining.
- **Fallback contract:** `/openai/tts` falls back to gpt-audio `textToSpeech` when ElevenLabs fails (quota, outage, missing key). Fallback audio is deliberately **not cached** so the next request retries ElevenLabs first (avoids permanently pinning lower-quality audio).
- **Why:** free-plan credits can exhaust mid-month; before this, uncached phrases 502'd ("Could not generate speech") with zero visibility.
- Chat (`parrotChat`) uses the same pattern via `makeSynthesizeWithFallback(elevenlabs, gpt-audio)`; chat audio is never cached so no cache-poisoning concern.
- The startup pre-warm detects quota exhaustion (`isQuotaExhaustedError`: `quota_exceeded` in detail or status 429) and skips all remaining phrases instead of failing each one; missing-key and 5xx errors do NOT trip the early stop.

Update (July 2026): key regenerated WITH user_read — /v1/user/subscription returns 200 (incl. next_character_count_reset_unix). Quota monitor now emails a low-credit alert (Resend) once per billing cycle, keyed on resetUnix; re-arms on new cycle or when back above threshold. Sender must be onboarding@resend.dev — boloapp.in is NOT verified with Resend (403).
