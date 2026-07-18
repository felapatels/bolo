---
name: AVPlayer double-fetch of audio URLs
description: iOS AVPlayer requests the same progressive-audio URL more than once; one-shot server streams must stay re-servable.
---

Rule: any server endpoint that feeds iOS AVPlayer (expo-audio native player) progressive audio must serve the same URL repeatedly — AVPlayer commonly issues a probe request followed by the real fetch, or re-requests after a chunked response closes.

**Why:** the chat audio stream registry was single-consumer (released after the first GET). On iOS the second AVPlayer request 404'd and the player silently discarded the clip — chat voice appeared completely broken while web (single MSE fetch) worked fine. Prod logs showed 200 → 404 on the same streamId every turn.

**How to apply:** keep completed (and still-filling) streams registered until the TTL sweep; release only failed streams on reader detach (so a truncated clip can't be replayed). Each reader keeps its own byte cursor, so concurrent readers are safe.
