# BOLO shared roadmap

## Phone-call “Show meaning” helper — requested 2026-09-11

Status: planned; documentation only, not implemented. Scope: all six BOLO apps (India, SEA, East Asia, Africa, Europe, LATAM), for every phone-call game and supported language. Include mobile iPhone/iPad and any web call surface where available.

Owner request: let learners tap a button to see the meaning of what the caller just said, as an optional helper. Reference: Europe’s Polish Babcia call greeting was visible without a meaning helper.

Proposed acceptance criteria for Claude:
- Add a compact, clearly labelled “Show meaning” button beside/below the caller’s current caption; reveal its English meaning inline and offer “Hide meaning”. Keep the original-language caption visible.
- Hide the meaning initially and reset the reveal when a new caller utterance arrives. Associate each meaning with the correct utterance; never show an old translation for a new line.
- Keep the call running normally: no interruption to voice playback, recording, turn timing, hang-up, rewards, or hold-to-talk. Keep both primary call controls visible and usable on iPhone and iPad.
- Inspect existing call response/translation data first and reuse it if available. If a new API contract is necessary, propose the names for approval under CLAUDE.md before editing the contract. Handle unavailable meaning gracefully.
- Preserve each region’s own caller, language, voice and artwork. Check all six implementations and any web equivalents. Verify long captions, repeated reveal/hide, and changing turns.

This is a roadmap item for later implementation, not a prerequisite added to the current release.
