---
name: RN Image absoluteFill needs explicit 100% size
description: On iOS an RN Image with only StyleSheet.absoluteFill takes its intrinsic size and gets corner-cropped; resizeMode never fires. Expo web hides it.
---

# `StyleSheet.absoluteFill` alone does not size an RN `<Image>` on iOS

An `<Image>` styled with **only** `StyleSheet.absoluteFill` (the four zero insets)
does not reliably get its size from those insets on native iOS. It takes its
**intrinsic** size instead — a `require()`d 1024x572 PNG becomes 1024x572
**points** — anchored top-left. A parent with `overflow: 'hidden'` then crops
away everything outside its own box, so you see the art's top-left corner blown
up, and `resizeMode="cover"` scales nothing because the frame already equals the
intrinsic size.

**The fix:** pair the insets with explicit dimensions.

```tsx
// WRONG on iOS — corner-cropped, resizeMode is inert
<Image source={art} resizeMode="cover" style={StyleSheet.absoluteFill} />

// RIGHT — matches web's `absolute inset-0 h-full w-full object-cover`
<Image source={art} resizeMode="cover"
       style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} />
```

**Why:** this is the same family as the other native-vs-web sizing traps in this
repo (see `rn-svg-percentage-height.md`). **RN-web maps the bare insets straight
to CSS, so Expo web renders it perfectly** — the bug exists only on device, which
is why it survives every local check and only surfaces in a device screenshot.

**How to apply:**
- Any full-bleed background `Image` in this codebase must carry explicit
  `width/height: '100%'`, not just `absoluteFill`.
- Strong smell: sibling layers in the same file already use a
  `{width:'100%',height:'100%'}` fill style and the background one doesn't. That
  asymmetry is the bug, not a style preference.
- Grep for `style={StyleSheet.absoluteFill}` on `<Image>` when auditing.

## Diagnosing a "cropped/zoomed on device" report cheaply

Do not reason about the layout tree. **Predict and match**: crop the source asset
to the region the hypothesis predicts and compare it to the screenshot.

Intrinsic-size-anchored-top-left predicts the visible region is the top-left
`boxW x boxH` **points at 1:1** (a phone is ~390pt wide, so ~350pt after padding;
for an unsuffixed asset 1 point = 1 source pixel). `convert art.png -crop
350x196+0+0` produced a pixel match with the owner's screenshot and settled the
diagnosis in one step.

Corollary on crop anchoring: `cover` **centers** its crop. A crop that is
anchored to a **corner** is therefore never `cover` doing its job — it is
`overflow:hidden` clipping an element that is larger than its box.

## Declared art constants drift from the real files

Aspect constants written by hand go stale and are invisible until something is
measured against them. Read the real dimensions from the PNG header instead of
trusting the source:

```bash
python3 -c "import struct;d=open('f.png','rb').read();print(struct.unpack('>II',d[16:24]))"
```

Two of three declared aspects in the chai-stall pair were wrong. It matters
asymmetrically by platform: on web an `<img>` given only a width takes its height
from the intrinsic aspect, so a wrong constant is harmless; RN has no intrinsic
fallback when you compute `height: width / ASPECT`, so the same wrong constant is
a visibly wrong shape. **A constant that is decorative on web can be load-bearing
on mobile.**
