---
name: Mobile hold-to-talk guards
description: Press-race guards for expo-audio hold-to-record surfaces (chat), and the jest pattern for testing them.
---

Rule: any hold-to-talk surface must (1) re-verify the press is still live after EVERY startup await (permission grant, prepare, mode flip) and tear down to idle when it is not; (2) route early releases through an abort/discard path, never stop-and-submit; (3) enforce a minimum recording duration (300ms) so taps abort; (4) re-stop playback immediately right before record(); (5) gate idle pre-warms on an already-granted permission check that never prompts.

**Why:** iOS permission dialogs suspend the gesture and swallow the release; a grant with no finger down used to start a headless recording that silence auto-stop then SUBMITTED as a garbage chat turn. The pre-warm effect was also the thing showing the permission dialog on first tab mount, with no press at all.

**How to apply:** mobile chat mirrors web's positive hold-confirmation (activeHoldPointerRef pattern on web, isPressingRef on mobile). `hasRecordingPermission()` in the mobile audio lib is the prompt-free gate. TS trap: assigning `ref.current = null` early in the function makes later `ref.current?.stop()` narrow to `never` even across awaits; cast to the handle union.

Jest pattern: the old "quick tap submits" trick is dead. Tests that need a submitted turn must hold through startup (pressIn, flush act), advance a `jest.spyOn(Date, 'now')` clock past the minimum duration, then pressOut on the 'Release to send' button. Deferred promises on the audio-lib mocks let tests resolve the grant before/after release to hit each guard leg. Audio-lib mock factories must export every name the screen imports (a missing `hasRecordingPermission` throws in the pre-warm effect, not at link time).
