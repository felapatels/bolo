---
name: RN absolute insets resolve against the padding box
description: Why top/right:0 on an absolutely positioned RN child sits flush against the parent's border rather than inside its padding, and how to size a badge against a narrow card before pinning it.
---

# Absolute insets ignore the parent's padding

In React Native 0.74+ (Yoga 3) absolute positioning is CSS-spec compliant: the
containing block for an absolutely positioned child is the parent's **padding
box**. `top: 0 / right: 0` therefore lands the child flush against the inside of
the parent's *border* — the parent's `padding` does **not** inset it.

**Why:** this reliably surprises people, because the sibling in-flow children
*are* inset by that padding, so the absolute child looks mis-aligned by exactly
the padding amount. A comment claiming "top:0 lands it inside the card padding"
is wrong and will survive review unchallenged.

**How to apply:** if you want an absolutely positioned corner element to line up
with the content box, you must add the parent's padding to the inset yourself
(`top: <padding>`), or take the element out of absolute positioning entirely.

# Pinning to a corner is not free — measure the element first

Corner-pinning is often used to dodge a flex-layout squeeze, but it only hides
the overflow; the element still occupies the same space and will silently
overlap whatever in-flow sibling shares that band. `overflow: 'hidden'` on the
parent makes the collision look like clipping rather than overlap, which sends
you after the wrong cause.

**Why:** an oversized label pinned to a corner can look fine on the one large
device you tested and overlap badly on smaller ones, because the slack scales
with screen width while the label's width is fixed.

**How to apply:** before pinning anything into a narrow card, measure the real
rendered width instead of estimating it, then compare against the card's
content box across the device widths you support. If the element cannot clear
its in-flow neighbours at *any* inset, the fix is structural (give it its own
row), not a nudge to the inset.

## Measuring custom-font text width offline

`opentype.js` is the cheap way to measure text in a bundled font without a
device, but it **throws on Inter's GSUB table** (`substitutionType : 62
lookupType: 6 - substFormat: 2 is not yet supported`) if you use the shaping
APIs (`getAdvanceWidth`, `forEachGlyph`, `stringToGlyphs`).

Bypass shaping and sum raw metrics instead:

- `font.charToGlyph(ch).advanceWidth` per character, divided by
  `font.unitsPerEm`, times the font size
- add `font.getKerningValue(a, b)` between pairs
- add `letterSpacing * text.length` for RN tracking
- add the element's own chrome: `borderWidth * 2 + paddingHorizontal * 2`, plus
  any icon and gap (RN includes border and padding inside an auto width)

Load it by path from the pnpm virtual store and parse a Buffer with
`ot.parse(buf.buffer.slice(...))`; `loadSync` returned undefined here.
