---
name: OpenAI TTS voice loudness variance
description: OpenAI TTS voices differ hugely in source loudness; sage is 15-17 dB quieter than nova. All Bolo audio must use one voice; a guard test pins chat voice to the phrase default.
---

# OpenAI TTS voice loudness variance

Rule: all product audio (greetings, phrase audio, chat replies) uses ONE OpenAI voice, currently "nova". The chat reply mini-TTS voice constant is pinned equal to the phrase/greeting default voice by a divergence-guard test in the parrotChat test file, so they cannot silently drift apart again.

**Why:** OpenAI TTS voices are not loudness-normalized at source. gpt-4o-mini-tts voice "sage" measured 15 to 17 dB quieter than "nova" (ffmpeg volumedetect on synthesized clips). On device this presented as "greeting loud, replies quiet", which looks like an audio-session or playback bug and burned a device-debugging cycle before the voice mismatch was found. Note a separate real audio-session bug (expo-audio session auto-deactivation) coexisted with this and was fixed independently; both were needed.

**How to apply:** When adding any new TTS call site, use the exported voice constants rather than a literal voice string, and suspect voice-level loudness mismatch whenever one clip type is consistently quieter than another despite identical playback code. Measure with ffmpeg volumedetect on the raw synthesized bytes before touching playback code. The gpt-audio fallback voice ("shimmer") is a separate constant by design: gpt-audio and gpt-4o-mini-tts have different voice sets and must not share one constant.
