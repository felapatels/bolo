#!/usr/bin/env bash
#
# Regenerates the Google Play Store listing graphics from the brand source
# (assets/branding/*.svg). Run from the artifact root:
#
#   bash scripts/gen-store-assets.sh
#
# Requires ImageMagick (`magick`), which is available in the Replit runtime.
# Outputs land in assets/store/android/. Screenshots are captured separately
# from the running app (see PLAY_STORE.md).
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="assets/store/android"
BR="node_modules/@expo-google-fonts/bricolage-grotesque"
FONT_BOLD="$BR/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf"
FONT_MED="$BR/500Medium/BricolageGrotesque_500Medium.ttf"

mkdir -p "$OUT/screenshots"

# --- High-res 512x512 Play Store icon (32-bit PNG, opaque background) ---
magick -density 384 -background none assets/branding/icon.svg \
  -resize 512x512 -background "#fffdf0" -flatten \
  "$OUT/play-store-icon.png"

# --- Feature graphic (1024x500, required by Play) ---
# Transparent speech-bubble mark rendered large, then composed over a
# brand-palette gradient beside the wordmark + tagline.
magick -density 300 -background none assets/branding/adaptive-icon.svg \
  -resize 460x460 /tmp/bolo-mark.png

magick -size 1024x500 \
  radial-gradient:"#fff4e2"-"#fef4d8" \
  \( -size 1024x500 gradient:"#ffffff00"-"#0fa6a022" \) -compose over -composite \
  -font "$FONT_BOLD" -pointsize 132 -fill "#0f1729" -gravity West \
    -annotate +470-60 "Bolo!" \
  -font "$FONT_MED" -pointsize 40 -fill "#0FA6A0" -gravity West \
    -annotate +474+40 "Speak Indian languages" \
  -font "$FONT_MED" -pointsize 40 -fill "#0f1729" -gravity West \
    -annotate +474+95 "with confidence" \
  /tmp/bolo-mark.png -gravity West -geometry +40+0 -compose over -composite \
  "$OUT/feature-graphic.png"

echo "Wrote:"
identify -format "  %f  %wx%h\n" "$OUT/play-store-icon.png" "$OUT/feature-graphic.png"
