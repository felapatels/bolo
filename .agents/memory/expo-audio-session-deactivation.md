---
name: expo-audio auto session deactivation vs buffering players
description: expo-audio deactivates the iOS audio session shortly after any player finishes unless another player is strictly .playing; buffering AVPlayers do not count
---

Facts (expo-audio 1.x iOS source):
- `AudioPlayer.isPlaying` is `timeControlStatus == .playing`. A remote clip that is still buffering (`.waitingToPlayAtSpecifiedRate`) is NOT playing.
- Players default to `keepAudioSessionActive: false`; on finish or pause they call `deactivateSession()`, which waits ~0.1 s and then calls `AVAudioSession.setActive(false, .notifyOthersOnDeactivation)` if NO registered player isPlaying.
- That deactivation tears down whatever session configuration the JS `setAudioModeAsync` queue had just applied; AVPlayer then reactivates the session implicitly, outside the JS session model.

Symptom this produced (build 29 chat): first greeting loud and clear, every later reply quieter and lower quality. The greeting is the only clip never preceded by another player's completion; every later reply follows the squawk chirp or a previous clip finishing while the streamed reply is still buffering. TTS content was ruled out empirically (buffered vs streamed synthesis of identical text: same 24 kHz/128k mono mp3; streamed measured ~3 dB louder).

**How to apply:** every player participating in a session-managed turn (chat squawk + both playback paths in bolo-mobile lib/audio.ts) must pass `{ keepAudioSessionActive: true }` to `createAudioPlayer`, so session lifecycle belongs solely to the serialized mode-flip queue. Exact audible consequences of session deactivation are device-verify-only; jest can only pin that the option is passed.
