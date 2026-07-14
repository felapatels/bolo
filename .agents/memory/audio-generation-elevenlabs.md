---
name: Audio generation via ElevenLabs external API
description: How to generate TTS/music in this repl when the media-generation audio callbacks are absent
---

The media-generation skill's audio callbacks (`generateMusic`, `generateSoundEffect`, `searchVoices`, `textToSpeech`) are NOT registered in this repl's CodeExecution runtime, and the design subagent does not have them either. Only `generateImage`/`generateVideo` are present. Do not try to delegate audio generation to a design subagent — it will report itself blocked.

**Use `externalApi__elevenlabs`** (external-apis skill) instead:
- TTS: `POST /v1/text-to-speech/:voice_id/with-timestamps` with body `{ text, model_id: 'eleven_multilingual_v2', voice_settings }` → returns JSON with `audio_base64`.
- Music: `POST /v1/music` with body `{ prompt, music_length_ms }` → returns binary (base64 in `result.body`, `encoding==='base64'`).

**Gotchas (all cost >1 attempt to discover):**
- External-API responses are capped at ~1MB. A 52s stereo mp3 at 128kbps exceeds it. Pass query `output_format: 'mp3_44100_64'` (or lower) to stay under the cap; the final mix is re-encoded by ffmpeg anyway.
- `GET /v1/voices` returns >1MB and fails. Use `GET /v2/voices?search=<term>&page_size=N` instead. Search by known premade name (e.g. "George", "Matilda") to confirm a voice_id is enabled in the workspace.
- File writes must be inside a `"use impure"` function, and that function must return a JSON-serializable value (return the path list, not `undefined`).
- ffmpeg is available for composing: `adelay=<ms>:all=1` per clip + a low-volume `[bed]` + `amix=inputs=N:normalize=0` + `alimiter` to prevent clipping.
