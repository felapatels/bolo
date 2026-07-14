---
name: Video export audio (recording harness)
description: Why an exported video-js clip can ship silent, and how to verify audio actually plays on the export path.
---

# Video export audio depends on the harness allowing autoplay-with-sound

The export/record path renders the video component with no props, so the
`<audio>` element is unmuted and relies on `audio.play()` firing with no user
gesture. Whether the exported file carries sound is therefore a property of the
**recording harness's browser**, not the app code:

- Autoplay-with-sound **allowed** (e.g. Chrome launched with
  `--autoplay-policy=no-user-gesture-required`, which any tab-audio recorder must
  use since there is no user gesture) → the unmuted track plays and the export
  has sound.
- Strict/default autoplay policy → `audio.play()` is rejected (swallowed by the
  `.catch(() => {})`), the element stays `paused`, and the export is **silent**.

There is **no client-side workaround** for strict autoplay: you cannot fake a
user gesture, and programmatically unmuting an autoplaying element is blocked the
same way. Starting muted then unmuting does not recover real sound either.

**Why:** several tasks worried the exported launch video might be silent. The
composite mix file and the unmuted/seek wiring were correct; the genuinely
unverified piece was runtime playback under a headless load.

**How to apply / verify:** don't just read the code — probe real playback in a
headless browser. Launch the nix chromium
(`/nix/store/*ungoogled-chromium-*/bin/chromium`), drive it over CDP (Node's
global `WebSocket` + `Target.createTarget`/`attachToTarget`/`Runtime.evaluate`,
no library needed), navigate to the artifact URL (localhost:<artifact port>, not
`$REPLIT_DEV_DOMAIN` which needs the `https://` scheme), wait ~9s, and read the
`<audio>` element's `paused`/`currentTime`/`muted`. `paused:false` with an
advancing `currentTime` under a permissive policy confirms the app side is
correct. Also validate the composite file with ffprobe/volumedetect (duration ==
timeline total, per-scene VO region louder than the music-only gap).

## Scene-aligned audio seek: use an epsilon

The scene-change effect must NOT hard-set `audio.currentTime` on every scene.
Guard it with `Math.abs(audio.currentTime - offsetSec) > ~0.18s`, so a normal
linear pass (including the recorded export) free-runs gaplessly while scene
jumps and scene-lock `_r1`/`_r2` replays (which drift past the offset) still
re-anchor. Hard-seeking every boundary causes an audible micro-gap in the
recorded output. This matches `.local/skills/video-js/references/audio.md`.
