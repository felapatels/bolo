---
name: Instant band audio + streamed feedback
description: How practice result audio achieves voice-at-render-time — bundled band clips + eval-time server TTS prewarm with a pending-join — and the live-probe traps that verification hit.
---

# Instant band audio + streamed feedback (practice, both platforms)

## The pattern
- **Band names get bundled static clips, not runtime TTS.** Six English clips (perfect/great/good/almost/retry/nocatch) per platform, generated once (gpt-4o-mini-tts, voice nova = the feedback voice), ffmpeg loudnorm I=-16. `playBandClip(band)` returns a `{finished, stop}` handle that NEVER throws — audio must never block or break the result card. nocatch is toned neutral (system-miss rule).
- **The full feedback sentence is server-prewarmed at eval time.** Every pronunciation response path fires a fire-and-forget synthesis of the exact string clients speak (`[feedback, tip].filter(Boolean).join(" ")` — the join is pinned by a shared helper + test; if clients change the join, the prewarm silently stops matching). A plain cache-warm RACES the client's fetch, so an in-flight pending map lets `/openai/tts` JOIN the pending synthesis on cache miss (`hit: "pending-prewarm"` in logs). Cache row is written before the pending resolves.
- Client sequencing: band clip at result render → feedback synthesis raced against an 8s timeout → feedback plays after `clip.finished`. Timeout/failure = clip only. Both clips gate on the spoken-feedback pref (NOT the sound-cue pref).
- **Why:** synthesis latency was the whole delay; band names are a tiny closed set in one voice/language so pre-rendering them is free, and the sentence's synthesis can start ~4s earlier server-side.
- **How to apply:** any future "speak X instantly on event" — check whether X is a closed set (bundle clips) before reaching for cache prewarm; if the server knows the text before the client asks, prewarm + pending-join, not just cache-warm.

## Live-probe traps (qa/task903-band-audio-probe.mjs)
- An in-page `HTMLMediaElement.play` logger must keep ≥200 chars of `src`: the dev-domain origin alone is ~86 chars, so an 80-char slice silently hides same-origin paths (looked like "clip never played").
- The FIRST `data:audio` play on practice is the coach phrase at mount — find feedback as the data-uri play AFTER the band clip, or the ordering check compares against the wrong element.
- Waiting for result-card buttons is flaky under the first-attempt badge overlay; wait on the audio-log signal (or DOM text) instead, and screenshot+dump page text on timeout.
