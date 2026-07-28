---
name: Web mic permission flow
description: Chat/practice mic prewarm gating and the released-before-start guard for hold-to-speak controls
---

Rules for the gujarati-coach web recording surfaces (chat + practice):

- Mount-time mic prewarm must go through `prewarmMicIfGranted` (src/lib/micPermission.ts): prewarm only when the Permissions API reports "granted". First-time users must never see a permission prompt on page load; their prompt fires on the first record press.
- Hold-to-speak controls need a released-before-start guard: if pointer-up fires while `startRecording` is still awaiting the mic (permission prompt / device acquisition), the resolve must DISCARD (abortRecording, stay idle), never start recording. **Why:** the grant can land long after the finger lifted; without the guard, recording starts unheld, and chat's silence auto-stop never fires without speech (hasSpoken gate), so the page sticks in recording and the text input stays disabled.
- Practice's variant of the guard *finishes* (sends) on resolve instead of discarding — its release means "done speaking"; chat's release with no recording means "never mind". Keep the semantic per-surface.

**How to apply:** any new web surface with press-to-record must use both patterns; test via jsdom with a manually-resolved startRecording promise (see src/test/chat-mic-permission-guard.test.tsx).
