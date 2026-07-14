---
name: iOS earpiece routing with warm mic
description: expo-audio playAndRecord routes playback to the earpiece on iOS; flip modes around playback, serialized with recorder prepares
---

The rule: on iOS, any time the expo-audio session has `allowsRecording: true`, the native category is `playAndRecord` **without** `defaultToSpeaker` (expo-audio sets no such option and exposes no iOS routing control), so playback comes out of the quiet earpiece. `prepareToRecordAsync` also natively re-asserts `playAndRecord`.

**Why:** the mic pre-warm pattern keeps recording mode active the whole practice session; coach playback then sounded like a phone call. Verified in expo-audio 1.1.1 native sources (AudioModule.swift / AudioRecorder.swift).

**How to apply:** flip to `{ allowsRecording: false }` right before playing, restore recording mode when playback ends/stops, and serialize ALL session ops (mode flips + recorder prepares) through one promise queue so a warm-up prepare can't land mid-playback and re-route it. Await a cheap `ensureRecordingMode()` before `recorder.record()` — a category switch is milliseconds, unlike the heavy permission/prepare path.
