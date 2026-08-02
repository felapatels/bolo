---
name: WebKit element blessing for programmatic audio
description: Why iOS Safari/WKWebView rejects programmatic HTMLAudio play() despite a gesture unlock, and the singleton-element blessing pattern that fixes it
---

**Rule:** WebKit gates audible playback PER MECHANISM and PER ELEMENT. A user gesture that unlocks a WebAudio context blesses ONLY WebAudio; an HTMLAudioElement is only blessed by having ITS OWN play() called inside a user gesture. For programmatic (non-gesture) playback later, route every voice surface through persistent module-scope singleton elements (src swapped per clip) and, in EVERY session entry gesture, play a ~1ms silent WAV through each singleton ("blessing"). Never create per-play `new Audio(...)` for programmatic playback; never guard blessing with a once-flag.

**Why:** On-device trace (iPhone Safari, Aug 2026, Bolo web) proved the classic silent-WebAudio-buffer primer is a no-op for element playback: the unlock context reached "running" while the coach element's play() rejected NotAllowedError 132ms after the gesture, with navigator.userActivation already consumed. Headless Chromium never reproduces this; only on-device (or an on-screen trace panel the user reads back) settles it.

**How to apply:**
- Singletons + accessors live with the web app's iOS audio helpers; blessing clears stale `onended`/`onerror` before the silent play, skips an element that is mid-play, and swallows rejections. The silent WAV ends on its own (no pause(), which could abort the pending blessing play).
- Exemptions: preload-only elements that never call play(), and elements played directly inside their own gesture.
- Test trap: module-scope singletons leak instances across a file's Audio mocks; reset them in the suite-wide setup beforeEach or instance-count assertions break.
- Debugging pattern that found this: a sessionStorage-armed on-screen trace panel (gesture timestamp, gesture-to-play gap, userActivation at both ends, exact rejection name) that the user reads back from the device.
