---
name: Store asset font reproducibility
description: Why bolo-mobile store graphics must use committed fonts, and how the completion review checks reproducibility.
---

# Store asset font reproducibility

The Play Store feature graphic renders the 22 Indian languages in native scripts.
ImageMagick shapes Indic/nastaliq via its librsvg (Pango/HarfBuzz) SVG delegate,
which resolves fonts through fontconfig by family name.

**Rule:** any font a store-asset generator depends on must be committed into the
repo (e.g. `assets/store/fonts/*.ttf`, vendored from `@expo-google-fonts`), and
the throwaway fontconfig `<dir>` must point at that committed dir only.

**Why:** the completion code review regenerates assets in a **clean checkout with
no `pnpm install`**, so `node_modules` fonts are absent there. A script that reads
fonts from `node_modules` reproduces fine locally but the reviewer gets tofu /
fallback → "materially different image" → REJECTED. Text-free assets (the icon)
still reproduce, which is the tell that fonts are the missing piece.

**How to apply:**
- Vendor the exact weight files used; restrict the fontconfig `<dir>` to that dir
  so there's no weight/scan-order ambiguity from other installed faces.
- Add a `require_font` guard (fc-match must resolve to the expected filename) so a
  missing/fallback font fails loudly instead of silently changing output.
- Verify by hiding node_modules and diffing: `mv node_modules /tmp/bak; bash
  scripts/gen-store-assets.sh; magick compare -metric AE ...` must be 0.
