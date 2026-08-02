---
name: gpt-audio grading call quirks
description: Real-API constraints for gpt-audio input_audio grading via the AI-integrations proxy (formats, rate limits, "can't hear audio" refusals).
---

**Formats:** `input_audio.format` accepts ONLY `wav` and `mp3` — `webm`/`m4a` 400 despite the v2 spec's passthrough signature. Convert with ffmpeg (16kHz mono mp3 works). **Why:** confirmed empirically 2026-08-02 with a 400 "Supported values are: 'wav' and 'mp3'".

**Rate limits:** the AI-integrations proxy 429s (RATELIMIT_EXCEEDED) under bursts — 12 concurrent calls collapsed a whole run. Use clip-concurrency 2 (≤6 in-flight), retry-on-429 with 3s/8s/15s backoff.

**"I need to hear the audio" refusals:** gpt-audio intermittently responds as if no audio was attached, ~5-8% of short clips per pass. Padding 0.4s silence on both ends rescues most; a residual ~2% of clips are PERMANENTLY refused across formats and many retries — treat as unscoreable, don't loop forever.

**How to apply:** any batch gpt-audio scoring harness must be resume-safe (append-only JSONL keyed by clip, last record wins, failed records retryable) and run in foreground timeout chunks (background jobs die).
