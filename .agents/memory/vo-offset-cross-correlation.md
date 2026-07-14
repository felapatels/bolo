---
name: Measuring VO offsets in a composite mix
description: How to recover exact voiceover start times inside a pre-mixed composite audio track when they aren't documented.
---

When VO timing inside a composite audio mix isn't written down anywhere, don't guess from scene phase timers — measure it: decode both the composite and the individual VO file to mono f32 PCM with ffmpeg (`-ac 1 -ar 8000 -f f32le -`), then cross-correlate the VO against the clip's segment of the composite (coarse stride search + local refine in plain Node; numpy isn't installed here). Gives offsets accurate to ~10ms.

**Why:** burned-in captions had to sync to a pre-mixed track with no timing manifest; measured offsets matched rough notes exactly, so the technique is trustworthy.

**How to apply:** any time captions, subtitles, or visual beats must sync to a pre-mixed audio track. Also note headless chromium timed screenshots (single shell command — background chromium dies across commands; use CDP over Node's global WebSocket) verify time-dependent visuals the Screenshot tool can't catch.
