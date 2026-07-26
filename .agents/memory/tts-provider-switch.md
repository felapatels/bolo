---
name: TTS provider switch (ElevenLabs ↔ gpt-audio)
description: How the app's voice provider is controlled and why it was switched to gpt-audio
---

## The flag

`artifacts/api-server/src/lib/ttsConfig.ts` exports `USE_ELEVENLABS_TTS` (boolean).
Set to `true` → ElevenLabs (Laura, eleven_multilingual_v2) for phrases, parrot chat, and greetings.
Set to `false` (current) → gpt-audio (OpenAI shimmer voice) for everything.
Restart the server after changing it — no other code changes needed.

## Why gpt-audio is currently active

ElevenLabs multilingual_v2 + Laura had audible quality issues: too fast, no natural pauses, and sounded different from what the user expected. The user preferred the gpt-audio default voice overall. All ElevenLabs code is fully preserved.

## What ElevenLabs brings back when re-enabled

- Correct phoneme rendering for Gujarati and other Indic scripts (eleven_flash_v2_5 was the original bug — it doesn't support Gujarati, produces garbled audio; multilingual_v2 is the right model)
- Laura voice (FGY2WhTYpPnrIDTdsKH5) for phrases and parrot
- Streaming audio for parrot chat (gpt-audio has no streaming path)
- Per-language voice catalog and Plus user voice selection

## Key notes for re-enabling

- **Model must be eleven_multilingual_v2**, not eleven_flash_v2_5 — flash doesn't support Gujarati
- Voice settings for multilingual_v2 need different tuning than flash: stability ≤ 0.5 to get natural pauses; speed = 0.9 to prevent rushed cadence
- Greeting cache version is currently v5 — bump again if re-enabling to evict gpt-audio cached greetings
- ElevenLabs API key lacks `voices_read` permission (can't list/look up voices), but TTS itself works fine

**Why:**
User found the ElevenLabs voice quality (fast cadence, no natural pauses) worse than gpt-audio default in practice, despite multilingual_v2 being the technically correct model for Gujarati. Preserving all integration work as a flag for future re-evaluation.
