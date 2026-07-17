---
name: Chat voice streaming
description: How Bolo's chat voice streams over SSE and plays before synthesis finishes
---

- Server: ElevenLabs `/v1/text-to-speech/{voice}/stream` returns raw MP3 bytes progressively; `textToSpeechElevenLabsStream` in the integrations audio lib forwards chunks and resolves the full buffer. Chunk boundaries are arbitrary — base64-encode each chunk independently; concatenated decodes are byte-identical to the full clip.
- Streaming is **opt-in via the `X-Audio-Stream: 1` header** on top of `Accept: text/event-stream`. Never stream chunks to every SSE client: mobile (no MediaSource in RN/Hermes) would download the audio twice (chunks + full clip in the final `reply` event).
- Protocol: `audioChunk` events during synthesis, `audioDone` only on a complete successful stream. Clients treat a missing `audioDone` as "discard partial stream, play the full clip from `reply`" — this makes the ElevenLabs→gpt-audio fallback safe even mid-stream.
- Web playback uses MediaSource + `addSourceBuffer("audio/mpeg")` (feature-detect with `MediaSource.isTypeSupported`; Safari lacks it → buffered path). Queue appends behind `sourceBuffer.updating`, `endOfStream()` only when done && queue drained.
- Squawk SFX ordering preserved by gating `audio.play()` behind the SFX `onended` while chunks keep buffering. Word-reveal is naturally skipped because the early `replyText` event sets earlyReplyShown.

**Why:** cuts the voice wait to first-chunk latency (~300 ms observed) instead of full-clip synthesis.
**How to apply:** any future streamed-audio feature (mobile, phrase audio) should reuse the opt-in header + audioDone-as-commit protocol.
