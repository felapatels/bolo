---
name: Suite-wide localStorage defaults in web tests
description: gujarati-coach vitest setup.ts pins per-device prefs for legacy tests; localStorage.clear() in a file's beforeEach wipes the pin.
---

The gujarati-coach web suite sets suite-wide localStorage defaults in `src/test/setup.ts` `beforeEach` (currently `bolo.meaningAudio = "off"`, because legacy practice tests drive a phrase-only coach chain and the real product default is ON).

**Rule:** any test file whose own `beforeEach` calls `localStorage.clear()` erases those setup defaults (setup hooks run first), so it must re-pin them right after the clear, or the wiped default resurfaces as a flaky or hung practice test (state stuck in playing_coach waiting on an audio segment the harness never ends).

**Why:** hit on the Task 1003 meaning-segment work: only one of nine clearing files failed outright, the rest passed by timing luck, so a green run does not prove the pin is unnecessary.

**How to apply:** when adding a new suite-wide default to setup.ts, grep `localStorage.clear()` across `src/test/` and re-pin in every file found; when writing a new test file, prefer removing specific keys over `clear()`.
