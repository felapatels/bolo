---
name: TTS provider switch
description: How to change the active TTS provider, current setting, and what each switch affects.
---

## Current state

`TTS_PROVIDER = "gpt-4o-mini-tts"` in `artifacts/api-server/src/lib/ttsConfig.ts`.

`USE_ELEVENLABS_TTS` is derived (`TTS_PROVIDER === "elevenlabs"`) and kept for backward compat with ttsPrewarm.ts and routes/openai.ts — do not remove.

## How to switch

Change `TTS_PROVIDER` on line 27 of `ttsConfig.ts` and restart the server. No other changes needed.

## What each value affects

- `"gpt-audio"` — all voice synthesis via chat completions (no `instructions` parameter, uses BOLO_GPT_AUDIO_VOICE = "shimmer")
- `"gpt-4o-mini-tts"` — dedicated speech endpoint with `instructions` parameter; chat uses BOLO_MINI_TTS_VOICE = "sage" + BOLO_CHAT_TTS_INSTRUCTIONS; phrase prewarm uses phraseAudioIdentity() which returns BOLO_PHRASE_TTS_INSTRUCTIONS
- `"elevenlabs"` — ElevenLabs eleven_multilingual_v2 (must use multilingual_v2, not flash); requires ELEVENLABS_API_KEY

## Instruction constants (gpt-4o-mini-tts only)

`BOLO_CHAT_TTS_INSTRUCTIONS` and `BOLO_PHRASE_TTS_INSTRUCTIONS` in `ttsConfig.ts` — two separate constants, currently identical. Their SHA-256 digests are exported as `BOLO_CHAT_TTS_INSTRUCTIONS_DIGEST` and `BOLO_PHRASE_TTS_INSTRUCTIONS_DIGEST` (first 8 hex chars each).

**Why:** Chat personality and phrase pronunciation guidance need to diverge — the cheerleader delivery is wrong for pronunciation reference audio. Keeping them separate avoids coupling that tuning to a cache key change on the chat side.

**How to apply:** Change `BOLO_PHRASE_TTS_INSTRUCTIONS`; the digest changes automatically, which bumps the phrase cache key scheme, orphaning stale entries. No manual migration needed.

## Phrase cache key scheme

`PHRASE_KEY_SCHEME = \`phrase:v2:${BOLO_PHRASE_TTS_INSTRUCTIONS_DIGEST}\`` in `ttsCache.ts`. Automatically rotates when instructions change. `ttsCache.ts` imports `BOLO_PHRASE_TTS_INSTRUCTIONS_DIGEST` from `ttsConfig.ts` — no circular dep (ttsConfig does not import ttsCache).

## Voice loudness disparity (gpt-4o-mini-tts)

Voices master at wildly different levels: "sage" synthesizes ~15-17 dB quieter than "nova" on identical text (measured via ffmpeg volumedetect; instructions have no effect on level). Chat replies use sage (BOLO_MINI_TTS_VOICE in parrotChat.ts) while greetings/phrases use nova (PHRASE_AUDIO_DEFAULT_VOICE in ttsConfig.ts), which made live replies sound "quiet" next to the cached greeting on device.

**Why:** a device loudness report was nearly misattributed to iOS session routing; the real cause was source mastering.
**How to apply:** before blaming session/routing for volume asymmetry, decode both clips and compare mean_volume with volumedetect. Keep chat and greeting voices identical unless levels are verified to match.

## Prewarm budget

`TTS_PREWARM_CHAR_BUDGET` env var controls how many chars are prewarmed at startup. Default 4000 was calibrated for ElevenLabs free tier. With `gpt-4o-mini-tts` there is no credit constraint — raising to 40000–80000 is safe and covers more of the 22-language catalog. Currently the env var appears to be 0 in the running environment (prewarm skips entirely).
