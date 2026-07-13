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

# --- Branded, captioned phone screenshots -----------------------------------
# Wraps each raw capture (assets/store/android/screenshots/*.jpg, 412x824) in an
# on-brand background frame with a short benefit headline. Top-performing Play
# listings pair every screenshot with a caption instead of a bare screen dump;
# this is a well-known install-conversion lever.
#
# Output canvas is 1080x1920 (9:16 = 1.78:1) — comfortably inside Play's phone
# spec (each side 320-3840px, ratio <=2:1). Framed versions land in
# assets/store/android/screenshots-framed/ so the raw captures stay untouched.
RAW="$OUT/screenshots"
FRAMED="$OUT/screenshots-framed"
mkdir -p "$FRAMED"

# Brand palette
INK="#0f1729"
TEAL="#0FA6A0"
CREAM_TOP="#fff4e2"
MINT_BOT="#e8f7f4"

# Canvas + phone geometry
CW=1080; CH=1920
PW=740;  PH=1480          # phone plate (keeps the 412x824 -> 2:1 ratio)
PX=$(( (CW - PW) / 2 ))   # centered horizontally = 170
PY=400                    # top of the phone plate

# Rounded-corner mask + soft drop shadow (identical for every phone plate)
magick -size ${PW}x${PH} xc:black -fill white \
  -draw "roundrectangle 0,0 $((PW-1)),$((PH-1)) 54,54" /tmp/bolo-phone-mask.png
magick -size ${PW}x${PH} xc:none -fill "#0f172966" \
  -draw "roundrectangle 0,0 $((PW-1)),$((PH-1)) 54,54" -blur 0x26 /tmp/bolo-shadow.png

# Brand strip (speech-bubble mark + "Bolo!" wordmark), reused on every frame
magick -density 300 -background none assets/branding/adaptive-icon.svg \
  -resize 96x96 /tmp/bolo-mark96.png
magick -background none -fill "$INK" -font "$FONT_BOLD" -pointsize 60 \
  label:"Bolo!" /tmp/bolo-wordmark.png
magick -background none -gravity Center /tmp/bolo-mark96.png /tmp/bolo-wordmark.png \
  +append /tmp/bolo-brand.png

# Small teal accent bar that sits above each headline
magick -size 88x10 xc:none -fill "$TEAL" \
  -draw "roundrectangle 0,0 87,9 5,5" /tmp/bolo-accent.png

# filename -> headline caption
names=(
  "01-sign-in"                "Your language journey starts here"
  "02-sign-up"                "Create your free account in seconds"
  "03-home-topics"            "Speak 22 Indian languages"
  "04-practice"               "Get instant pronunciation feedback"
  "05-progress"               "Track every streak and milestone"
  "06-badges"                 "Earn badges as you master phrases"
  "07-home-topics-gujarati"   "Learn in Gujarati, Hindi & more"
  "08-practice-tamil"         "Practice real Tamil conversations"
  "09-topic-phrases-bengali"  "Master everyday Bengali phrases"
)

for (( i=0; i<${#names[@]}; i+=2 )); do
  base="${names[i]}"
  caption="${names[i+1]}"
  src="$RAW/$base.jpg"
  [ -f "$src" ] || { echo "  skip (missing) $base"; continue; }

  # Phone plate: fit raw capture to the plate, then round its corners
  magick "$src" -resize ${PW}x${PH}^ -gravity center -extent ${PW}x${PH} \
    /tmp/bolo-phone-mask.png -alpha off -compose CopyOpacity -composite \
    /tmp/bolo-phone.png

  # Headline (auto-wrapped to the caption width)
  magick -background none -fill "$INK" -font "$FONT_BOLD" -pointsize 66 \
    -size 940x -gravity center caption:"$caption" /tmp/bolo-caption.png

  # Compose: gradient bg -> shadow -> phone -> accent bar -> headline -> brand
  magick -size ${CW}x${CH} gradient:"$CREAM_TOP"-"$MINT_BOT" \
    /tmp/bolo-shadow.png  -gravity NorthWest -geometry +${PX}+$((PY+18)) -composite \
    /tmp/bolo-phone.png   -gravity NorthWest -geometry +${PX}+${PY}      -composite \
    /tmp/bolo-accent.png  -gravity North     -geometry +0+150           -composite \
    /tmp/bolo-caption.png -gravity North     -geometry +0+184           -composite \
    /tmp/bolo-brand.png   -gravity North     -geometry +0+58            -composite \
    -quality 92 "$FRAMED/$base.jpg"
done

echo "Wrote:"
identify -format "  %f  %wx%h\n" "$OUT/play-store-icon.png" "$OUT/feature-graphic.png"
identify -format "  screenshots-framed/%f  %wx%h\n" "$FRAMED"/*.jpg
