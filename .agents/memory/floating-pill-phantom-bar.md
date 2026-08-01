---
name: Floating pill phantom-bar reports
description: Why "a bar is peeking under the tab bar" reports on mobile home are the screen's own scroll content, and the fade-mask fix.
---

The mobile tab bar is a floating opaque pill (absolute, 14px side margins, bottom inset gap). Scroll content stays visible in the side margins and in the gap BELOW the pill mid-scroll. Home's Recent-plays rows literally contain the band label "Didn't catch that" and a "Retake" label, so a row surfacing there reads as a leftover practice feedback bar.

**Why:** practice's feedback bar is in-screen (no portal/modal) and practice unmounts on pop, so an overlay surviving navigation is implausible; diagnose such reports as scroll-behind before hunting for ghost overlays.

**How to apply:** the fix is a `pointerEvents="none"` LinearGradient fade (transparent -> background, ~110px, taller than pill-top = max(inset,14) + 74) rendered as a sibling AFTER the screen's ScrollView - inside the screen so the navigator-rendered tab bar stays above it. Apply the same mask to any other tab screen that draws feedback-vocabulary rows. jest-setup's LinearGradient mock passes testID/pointerEvents through for pinning.
