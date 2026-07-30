---
name: Canonical mascot rule
description: Owner rule — only the five canonical Bolo PNGs may render, whole-image animation only; the SVG rig is retired.
---

**Rule (owner decision, July 29–30, 2026):** No new Bolo artwork may be created by any means (drawing, SVG, AI generation, tracing). The only permitted mascot pixels are the five canonical PNGs (`public/mascot/` on web, mirrored in the mobile app), animated as WHOLE images: idle bounce/breathe scale, tilt on interaction, crossfade between poses. No part-level rigging, no eye tracking, no blinking.

**Why:** A task agent hand-drew an SVG rig approximation of Bolo (and earlier a non-canonical green parrot appeared in icon sources). The owner rejected all non-canonical renditions twice — hand-drawn/AI-generated approximations never match the brand art, and the rig's ~29 continuous spring drivers per instance also caused real CPU sluggishness on phones.

**How to apply:**
- `gujarati-coach/src/components/bolo-rig.tsx` is retired: kept on disk, must stay unreferenced, never render it. `mascot.tsx` is the only mascot renderer (crossfading PNGs).
- Any task touching the mascot (web, mobile, video, email, icons) must composite/animate the existing PNG pixels only.
- Perf guards live in `mascot.tsx`: never mount CSS-hidden duplicate mascots (they still animate); ambient animation pauses off-screen/tab-hidden and disables under reduced motion.
