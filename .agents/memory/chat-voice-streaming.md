---
name: Chat voice streaming
description: How Bolo's chat voice streams over SSE and plays before synthesis finishes
---

- Server: ElevenLabs `/v1/text-to-speech/{voice}/stream` returns raw MP3 bytes progressively; `textToSpeechElevenLabsStream` in the integrations audio lib forwards chunks and resolves the full buffer. Chunk boundaries are arbitrary — base64-encode each chunk independently; concatenated decodes are byte-identical to the full clip.
- Streaming is **opt-in via the `X-Audio-Stream: 1` header** on top of `Accept: text/event-stream`. Never stream chunks to every SSE client: mobile (no MediaSource in RN/Hermes) would download the audio twice (chunks + full clip in the final `reply` event).
- Protocol: `audioChunk` events during synthesis, `audioDone` only on a complete successful stream. Clients treat a missing `audioDone` as "discard partial stream, play the full clip from `reply`" — this makes the ElevenLabs→gpt-audio fallback safe even mid-stream.
- Web playback uses MediaSource + `addSourceBuffer("audio/mpeg")` (feature-detect with `MediaSource.isTypeSupported`; Safari lacks it → buffered path). Queue appends behind `sourceBuffer.updating`, `endOfStream()` only when done && queue drained.
- Squawk SFX ordering preserved by gating `audio.play()` behind the SFX `onended` while chunks keep buffering. Word-reveal is naturally skipped because the early `replyText` event sets earlyReplyShown.

- Mobile playback (no MediaSource in RN/Hermes): opt-in `X-Audio-Stream: url` instead of `1`. The server tees TTS chunks into a short-lived in-memory per-turn stream (`chatAudioStreams.ts`) and emits an `audioStream` SSE event with a streamId right after `replyText`; the native player (AVPlayer/ExoPlayer via expo-audio, `{ uri, headers }` source with the Bearer token) pulls `GET /openai/chat/audio/:streamId` as chunked `audio/mpeg` — progressive HTTP audio the OS players handle natively. `url` mode never sends `audioChunk` events, so there's no double download; the full clip still rides `reply` as the fallback.
- Mobile commit rule mirrors web: the client trusts the stream only if `audioDone` arrived; otherwise it stops the partial player and plays the buffered clip. Server-side, a turn that fell back mid-stream destroys the GET socket so the player errors instead of "finishing" a truncated clip. The stream registry is process-local (fine: the GET always hits the process that minted the id) with a 2-min TTL sweep and single-consumer release.

- iOS/WebKit (ALL iPhone browsers, incl. Chrome) blocks `.play()` on any element that didn't start playing inside a real user gesture — the reply plays seconds after the tap, so per-turn `new Audio(...)` is silently blocked (captions-but-no-voice). Web chat routes playback through two pooled elements (voice + SFX) blessed with a silent WAV inside the gesture handlers; never create a fresh Audio element for delayed playback on a surface reachable from iOS web.
- jsdom test trap: any code that constructs `Audio` synchronously in a gesture handler requires test stubs to be constructible classes — `vi.stubGlobal("Audio", vi.fn(() => ({...})))` throws "not a constructor" the moment the handler runs.

- Barge-in trap: with progressive streaming the SSE turn is STILL OPEN while phase is 'playing', so any interrupt path that starts a new recording must bump the active-turn counter for `wasPlaying` too (not just `wasProcessing`) or the interrupted turn's late `reply` payload flips the phase back and hijacks the recording.

**Why:** cuts the voice wait to first-chunk latency (~300 ms observed) instead of full-clip synthesis.
**How to apply:** any future streamed-audio feature (mobile, phrase audio) should reuse the opt-in header + audioDone-as-commit protocol.
