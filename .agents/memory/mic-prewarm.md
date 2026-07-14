---
name: Mic pre-warm pattern
description: How record-tap clipping was fixed on web and mobile practice; constraints to keep.
---

# Mic pre-warm (no clipped first syllable)

- Web: `useVoiceRecorder` exposes `prepare()` which acquires and caches a MediaStream; `startRecording` reuses it and resolves only on the MediaRecorder `start` event, so the UI's "recording" state is honest. `stopRecording` deliberately does NOT stop tracks of the pre-warmed stream (kept warm for the next phrase); release happens in `abortRecording`/unmount. Don't "fix" that by stopping tracks on stop — it reintroduces clipping.
- Mobile: practice screen requests permission + sets recording audio mode once, and runs `prepareToRecordAsync()` whenever phase returns to idle; the prepared state is consumed per recording. A shared in-flight prepare promise prevents a tap racing the warm-up from double-preparing.
- **Why:** async permission/session/prepare inside the tap handler swallowed learners' first syllables and unfairly hurt scores.
- **How to apply:** any new recording surface should prepare at mount/idle and only flip the recording indicator once capture actually started. Test mocks of `useVoiceRecorder` must include `prepare`.
- Watch-out: mobile now keeps `allowsRecording: true` audio mode for the whole session — verify iOS playback routing/volume on device.
