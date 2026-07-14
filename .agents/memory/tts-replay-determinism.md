---
name: TTS replay determinism
description: gpt-audio TTS re-generates non-deterministically; replaying the same phrase must reuse cached audio.
---

Coach pronunciation audio is produced by a `gpt-audio` chat completion ("repeat this text verbatim"), not a deterministic TTS engine. Each call can read short non-Latin-script text differently — a learner replaying the SAME word sometimes heard a completely different phrase.

**Why:** chat-audio models hallucinate on re-generation, especially short native-script snippets with no language context.

**How to apply:**
- Never re-synthesize the same phrase for a replay: both practice screens (web + mobile) cache `{audioBase64, format}` per `phrase.id` in a component-local ref and replay the cached first take.
- The server TTS prompt is anchored with the language name (`languageName` flows client → /openai/tts → textToSpeech) plus a "read exactly as written" instruction; keep passing the language for any new TTS call site.
- Late-arriving TTS responses are discarded via a playback token (mobile) / cancelled flag (web) so stale audio can't play over a newer phrase.
