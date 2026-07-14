---
name: Web silence auto-stop pitfalls
description: Why the web recorder's silence detection can silently never fire, and how to E2E-test mic flows in headless chromium here.
---

# Silence auto-stop (web voice recorder)

- An `AudioContext` created after an `await` (e.g. post-getUserMedia) is outside the
  click gesture's task and may start **suspended** — the analyser then reads permanent
  silence, `hasSpoken` never arms, and auto-stop never fires while the UI says
  "stops on its own". Always `await ctx.resume()` and verify `state === "running"`
  before analysing; fall back to manual stop otherwise.
- Drive the RMS poll with `setInterval`, not `requestAnimationFrame` — rAF stops in
  backgrounded/throttled tabs, freezing detection mid-recording.
- The practice page persists a stop-mode choice in `localStorage` (`bolo.stopMode`,
  "auto" | "manual"); manual mode must never register an onSilence callback, and a
  mid-recording flip to manual is disarmed via a ref check inside the callback.
- Evaluation failures must surface a visible error state (mic / network / server
  categorized) — never a silent reset to idle. A scored result is shown before the
  attempt save runs, so a failed save keeps the score with a note.

# Headless-browser mic E2E (this repl)

- Chromium's `--use-fake-device-for-media-capture` / `--use-file-for-fake-audio-capture`
  flags do NOT work with the Nix chromium here (getUserMedia → NotFoundError).
- What works: `context.addInitScript` that replaces `navigator.mediaDevices.getUserMedia`
  with a WebAudio graph — decode a committed/base64 wav into an `AudioBufferSourceNode`
  feeding `createMediaStreamDestination()`, and **resume that context** too (it's also
  gesture-less). Pad the wav with ~1s leading and ~4s trailing silence so recording
  start doesn't clip and silence auto-stop can fire.
- Sign-in and chromium-launch gotchas are in stripe-checkout-browser-e2e.md (Clerk
  `__clerk_ticket`, Nix chromium + `--no-sandbox`, delete the untracked replit.nix after).
