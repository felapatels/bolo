---
name: Bolo video artifacts audio pattern
description: How music/SFX/VO is wired into the bolo-launch-video and bolo-social-clips video artifacts
---

Both `bolo-launch-video` and `bolo-social-clips` share the same audio architecture. Reuse it for any new bolo video artifact instead of per-scene <audio> elements.

**Pattern:**
- A single pre-mixed `public/audio/composite_audio.mp3` covers the full canonical timeline (all scenes back-to-back, in `SCENE_DURATIONS` order). Individual stems (music_*, sfx_*, vo_*) are committed alongside it for future re-mixing.
- `VideoTemplate.tsx` derives `SCENE_OFFSETS` (cumulative ms per scene) from `SCENE_DURATIONS`, holds one `<audio>` ref, and on every `currentSceneKey` change seeks `audio.currentTime = SCENE_OFFSETS[baseSceneKey]/1000` then `play()`. This keeps sound synced across normal looping, manual scene jumps, and the scene-lock replay (which appends `_r1/_r2` suffixes — strip with the same regex used for the component lookup).
- `VideoTemplate` takes a `muted` prop. `VideoWithControls` defaults preview to `muted=true` (workspace iframe blocks autoplay-with-sound) with a Volume2/VolumeX toggle; the non-iframed export path renders `<VideoTemplate />` with default `muted=false` so the recording captures the soundtrack.

**Why:** one composite track means the export harness records audio automatically (same lifecycle as video), and seeking-per-scene keeps beats aligned even when preview controls rotate/lock the scene order.

**Narration voice:** both videos' VO is ElevenLabs premade "Jessica" (`cgSgspJ2msm6clMCkdW9`, eleven_multilingual_v2) — the "bubbly female" voice. Both artifacts store spoken lines as source in `src/components/video/narration.ts` (shared with SceneCaptions — edit it and regenerate, never let audio and captions diverge). If a VO mp3 ever lacks a source line, recover it by transcribing via the OpenAI AI-integrations proxy `POST /audio/transcriptions` with model `gpt-4o-transcribe` (`whisper-1` is UNSUPPORTED there). Social clips keep mix offsets/volumes in `scripts/mix-composite-audio.sh`; if a stem's placement is ever unknown, recover it by normalized cross-correlation of the stem vs the composite (decode both to 8kHz mono PCM via ffmpeg, restrict search to the stem's scene window — unwindowed correlation gives garbage from music bleed).

**Generating the audio here:** the media-generation audio callbacks are absent — use `externalApi__elevenlabs` (see audio-generation-elevenlabs.md). Music via `POST /v1/music?output_format=mp3_44100_64` (stay under the ~1MB cap), SFX via `POST /v1/sound-generation` ({text, duration_seconds, prompt_influence}), VO via `POST /v1/text-to-speech/:voice_id/with-timestamps`. Mix stems with ffmpeg: per-stem `volume` + `adelay=<absMs>:all=1` (+ `afade` on music beds), then `amix=inputs=N:normalize=0` + `alimiter`, `-t <totalSec>`. Music ~0.30, SFX ~0.65-0.80, VO 1.0.
