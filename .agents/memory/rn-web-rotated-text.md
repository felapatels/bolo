---
name: RN-web rotated/vertical text layout
description: Why rotated Text collides with siblings and why explicit widths get clamped on react-native-web; the slot pattern that fixes both.
---

# Rotated vertical text on React Native / react-native-web

Two traps hit together when building web-style `writing-mode: vertical-rl` text (e.g. a rotated label in a narrow column) in RN:

1. **Transforms don't reserve layout.** A `Text` with `transform: [{ rotate: '90deg' }]` still lays out as its unrotated box (~10px tall for one line). Its visual vertical extent (± half its width) overlaps siblings — flex `space-between` can't protect against it.
2. **react-native-web `Text` base style includes `maxWidth: '100%'`** (see `react-native-web/dist/exports/Text/index.js`). Inside a narrow slot, an explicit `width: 60` computes to the parent's width (e.g. 14px) and `numberOfLines={1}` truncates to one glyph. This clamp applies whether the Text is a flex child or absolutely positioned.

**Why:** cost several probe/screenshot rounds on the Bolo mobile boarding-pass stub — the stamp/line-name collision and a "G…" one-glyph vertical label were both these traps, invisible to code reading.

**How to apply:** give the rotated text a slot `View` (width = line height of the text, `flexGrow` for the run), measure the slot height via `onLayout`, then render the Text `position:'absolute'` with `width: h`, **`maxWidth: h`**, `lineHeight: slotW`, `left: (slotW - h)/2`, `top: (h - slotW)/2` — center-rotation then fills the slot's vertical strip exactly, on native and web alike. Measure suspected layout bugs with a DOM-rect probe (getBoundingClientRect + computed style) on the Expo web build instead of reasoning from styles.
