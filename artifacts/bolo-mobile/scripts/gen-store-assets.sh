#!/usr/bin/env bash
#
# Regenerates the Google Play Store listing graphics from the brand source
# (assets/branding/*.svg). Run from the artifact root:
#
#   bash scripts/gen-store-assets.sh
#
# Requires ImageMagick (`magick`), which is available in the Replit runtime.
# ImageMagick renders SVG via its bundled librsvg delegate (Pango/HarfBuzz),
# so complex Indic scripts (conjuncts, vowel reordering, nastaliq) shape
# correctly. Native-script text uses the Noto Sans + Bricolage fonts vendored
# under assets/store/fonts/ (committed to the repo), made visible to fontconfig
# through a generated temp config below. Because the fonts are committed rather
# than pulled from node_modules, the output is fully reproducible from a clean
# checkout, no `pnpm install` or system font install required.
#
# Outputs land in assets/store/android/. Screenshots are captured separately
# from the running app (see PLAY_STORE.md).
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="assets/store/android"
FONTS="assets/store/fonts"

# Bricolage wordmark font, used directly (freetype) for the Latin captions on
# the framed screenshots below. Vendored under $FONTS so it survives a clean
# checkout without node_modules.
FONT_BOLD="$FONTS/BricolageGrotesque_800ExtraBold.ttf"

mkdir -p "$OUT/screenshots"

# --- fontconfig: expose the vendored Noto + Bricolage fonts to librsvg ------
# librsvg resolves font-family names through fontconfig, so point a throwaway
# config at ONLY the committed fonts dir. Restricting it to that dir keeps the
# render deterministic (no weight/scan-order ambiguity from other installed
# fonts) and independent of node_modules, so a clean checkout reproduces the
# exact same PNG.
FC_DIR="$(mktemp -d)"
trap 'rm -rf "$FC_DIR"' EXIT
cat > "$FC_DIR/fonts.conf" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>$(pwd)/$FONTS</dir>
  <cachedir>$FC_DIR/cache</cachedir>
</fontconfig>
EOF
export FONTCONFIG_FILE="$FC_DIR/fonts.conf"
fc-cache -f "$FC_DIR" >/dev/null 2>&1 || true

# Fail loudly if a required font family is missing / falls back to another
# face, a silent fallback is exactly what makes the output non-reproducible.
require_font() {
  local family="$1" expect="$2" got
  got="$(fc-match -f '%{file}' "$family")"
  if [[ "$(basename "$got")" != "$expect" ]]; then
    echo "ERROR: font '$family' resolved to '$(basename "$got")', expected '$expect'." >&2
    echo "       Ensure $FONTS/$expect is present (vendored from @expo-google-fonts)." >&2
    exit 1
  fi
}
require_font "Bricolage Grotesque:weight=extrabold" "BricolageGrotesque_800ExtraBold.ttf"
require_font "Noto Sans Devanagari" "NotoSansDevanagari_400Regular.ttf"
require_font "Noto Nastaliq Urdu"   "NotoNastaliqUrdu_400Regular.ttf"
require_font "Noto Naskh Arabic"    "NotoNaskhArabic_400Regular.ttf"
require_font "Noto Sans Meetei Mayek" "NotoSansMeeteiMayek_400Regular.ttf"
require_font "Noto Sans Ol Chiki"   "NotoSansOlChiki_400Regular.ttf"

# --- High-res 512x512 Play Store icon (32-bit PNG, opaque background) ---
magick -density 384 -background none assets/branding/icon.svg \
  -resize 512x512 -background "#fffdf0" -flatten \
  "$OUT/play-store-icon.png"

# --- Feature graphic (1024x500, required by Play) --------------------------
# Headline lockup (mark + wordmark + "22 languages" tagline) over a cloud of
# the 22 official Indian languages written in their own native scripts, so a
# shopper sees Bolo!'s headline differentiator, the full breadth of Indian
# languages, before scrolling to the screenshots.

# Native name of each of the 22 scheduled languages of India + the Noto font
# that carries its script. Laid out in balanced rows (6 / 6 / 5 / 5).
WORDS=(
  # row 0 (6)
  "हिन्दी|Noto Sans Devanagari"
  "বাংলা|Noto Sans Bengali"
  "తెలుగు|Noto Sans Telugu"
  "मराठी|Noto Sans Devanagari"
  "தமிழ்|Noto Sans Tamil"
  "ગુજરાતી|Noto Sans Gujarati"
  # row 1 (6)
  "اردو|Noto Nastaliq Urdu"
  "ಕನ್ನಡ|Noto Sans Kannada"
  "ଓଡ଼ିଆ|Noto Sans Oriya"
  "മലയാളം|Noto Sans Malayalam"
  "ਪੰਜਾਬੀ|Noto Sans Gurmukhi"
  "অসমীয়া|Noto Sans Bengali"
  # row 2 (5)
  "मैथिली|Noto Sans Devanagari"
  "संस्कृतम्|Noto Sans Devanagari"
  "नेपाली|Noto Sans Devanagari"
  "कोंकणी|Noto Sans Devanagari"
  "سنڌي|Noto Naskh Arabic"
  # row 3 (5)
  "डोगरी|Noto Sans Devanagari"
  "बड़ो|Noto Sans Devanagari"
  "كٲشُر|Noto Nastaliq Urdu"
  "ᱥᱟᱱᱛᱟᱲᱤ|Noto Sans Ol Chiki"
  "ꯃꯤꯇꯩ|Noto Sans Meetei Mayek"
)
ROW_COUNTS=(6 6 5 5)
ROW_Y=(276 338 400 462)   # baseline y per row
GAP=150                   # horizontal spacing between pill centers
PILL_W=140
PILL_H=46

# Emit the language pills as SVG, centering each row around x=512.
chips=""
idx=0
for r in "${!ROW_COUNTS[@]}"; do
  n=${ROW_COUNTS[$r]}
  y=${ROW_Y[$r]}
  first=$(( 512 - (n - 1) * GAP / 2 ))
  for (( j=0; j<n; j++ )); do
    entry="${WORDS[$idx]}"
    text="${entry%%|*}"
    font="${entry##*|}"
    cx=$(( first + j * GAP ))
    px=$(( cx - PILL_W / 2 ))
    py=$(( y - PILL_H / 2 ))
    ty=$(( y + 10 ))
    chips+="<rect x=\"$px\" y=\"$py\" width=\"$PILL_W\" height=\"$PILL_H\" rx=\"14\" ry=\"14\" fill=\"#ffffff\" fill-opacity=\"0.72\" stroke=\"#0FA6A0\" stroke-opacity=\"0.45\" stroke-width=\"1.5\"/>"
    chips+="<text x=\"$cx\" y=\"$ty\" text-anchor=\"middle\" font-family=\"$font\" font-size=\"29\" fill=\"#0f1729\">$text</text>"
    idx=$(( idx + 1 ))
  done
done

cat > "$FC_DIR/feature.svg" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <radialGradient id="bg" cx="28%" cy="22%" r="110%">
      <stop offset="0%" stop-color="#fff6e6"/>
      <stop offset="55%" stop-color="#fef4d8"/>
      <stop offset="100%" stop-color="#fdeccb"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>
  <rect width="1024" height="500" fill="#0fa6a0" fill-opacity="0.05"/>

  <!-- (speech-bubble mark is composited on afterward, see below) -->

  <!-- wordmark + tagline -->
  <text x="208" y="112" font-family="Bricolage Grotesque" font-weight="800" font-size="96" fill="#0f1729">Bolo!</text>
  <text x="212" y="164" font-family="Bricolage Grotesque" font-weight="600" font-size="34" fill="#0FA6A0">Speak all <tspan fill="#F5871F">22</tspan> official Indian languages</text>

  <!-- native-script language cloud -->
  $chips
</svg>
EOF

# Rasterize the flat SVG (background + wordmark + script cloud), then
# composite the speech-bubble mark on top. The mark is composited rather than
# <image>-referenced because librsvg blocks external file:// resources.
magick -background none "$FC_DIR/feature.svg" \
  -background "#fef4d8" -flatten \
  "$FC_DIR/feature-flat.png"

magick -density 300 -background none assets/branding/adaptive-icon.svg \
  -resize 150x150 "$FC_DIR/mark.png"

magick "$FC_DIR/feature-flat.png" \
  "$FC_DIR/mark.png" -gravity NorthWest -geometry +44+30 -compose over -composite \
  "$OUT/feature-graphic.png"

# --- Branded, captioned phone screenshots -----------------------------------
# Wraps each raw capture (assets/store/android/screenshots/*.jpg, 824x1648, captured at 2x DPR for a pixel-crisp phone plate) in an
# on-brand background frame with a short benefit headline. Top-performing Play
# listings pair every screenshot with a caption instead of a bare screen dump;
# this is a well-known install-conversion lever.
#
# Output canvas is 1080x1920 (9:16 = 1.78:1), comfortably inside Play's phone
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

# --- iPhone-sized framed screenshots (App Store Connect) ---------------------
# Apple requires 6.9" (1320x2868, iPhone 16 Pro Max class) and 6.5"
# (1242x2688, iPhone 11 Pro Max class) screenshot sets. Reuse the exact same
# raw 824x1648 captures + captions as the Android set, re-framed at Apple's
# canvas sizes. Output: assets/store/ios/screenshots-6.9/ and screenshots-6.5/.
IOS_OUT="assets/store/ios"

frame_ios() {
  local label="$1" cw="$2" ch="$3" pw="$4" ph="$5" py="$6" \
        capw="$7" capsize="$8" acc_y="$9" cap_y="${10}" brand_y="${11}" outdir="${12}"
  local px=$(( (cw - pw) / 2 ))
  mkdir -p "$outdir"

  magick -size ${pw}x${ph} xc:black -fill white \
    -draw "roundrectangle 0,0 $((pw-1)),$((ph-1)) 64,64" /tmp/bolo-ios-mask.png
  magick -size ${pw}x${ph} xc:none -fill "#0f172966" \
    -draw "roundrectangle 0,0 $((pw-1)),$((ph-1)) 64,64" -blur 0x30 /tmp/bolo-ios-shadow.png

  # Brand strip scaled up for the larger canvas
  magick -density 300 -background none assets/branding/adaptive-icon.svg \
    -resize 116x116 /tmp/bolo-ios-mark.png
  magick -background none -fill "$INK" -font "$FONT_BOLD" -pointsize 74 \
    label:"Bolo!" /tmp/bolo-ios-wordmark.png
  magick -background none -gravity Center /tmp/bolo-ios-mark.png /tmp/bolo-ios-wordmark.png \
    +append /tmp/bolo-ios-brand.png
  magick -size 108x12 xc:none -fill "$TEAL" \
    -draw "roundrectangle 0,0 107,11 6,6" /tmp/bolo-ios-accent.png

  local i base caption src
  for (( i=0; i<${#names[@]}; i+=2 )); do
    base="${names[i]}"
    caption="${names[i+1]}"
    src="$RAW/$base.jpg"
    [ -f "$src" ] || { echo "  skip (missing) $base"; continue; }

    magick "$src" -resize ${pw}x${ph}^ -gravity center -extent ${pw}x${ph} \
      /tmp/bolo-ios-mask.png -alpha off -compose CopyOpacity -composite \
      /tmp/bolo-ios-phone.png

    magick -background none -fill "$INK" -font "$FONT_BOLD" -pointsize "$capsize" \
      -size ${capw}x -gravity center caption:"$caption" /tmp/bolo-ios-caption.png

    # Apple requires RGB screenshots without alpha; JPEG satisfies both.
    magick -size ${cw}x${ch} gradient:"$CREAM_TOP"-"$MINT_BOT" \
      /tmp/bolo-ios-shadow.png  -gravity NorthWest -geometry +${px}+$((py+22)) -composite \
      /tmp/bolo-ios-phone.png   -gravity NorthWest -geometry +${px}+${py}      -composite \
      /tmp/bolo-ios-accent.png  -gravity North     -geometry +0+${acc_y}       -composite \
      /tmp/bolo-ios-caption.png -gravity North     -geometry +0+${cap_y}       -composite \
      /tmp/bolo-ios-brand.png   -gravity North     -geometry +0+${brand_y}     -composite \
      -quality 92 "$outdir/$base.jpg"
  done
  echo "  [$label] $(ls "$outdir" | wc -l) screenshots at ${cw}x${ch}"
}

#          label  cw    ch    pw   ph    py   capw  capsz accY capY brandY outdir
frame_ios '6.9"' 1320 2868  900 1800  760  1180   92   356  400   72  "$IOS_OUT/screenshots-6.9"
frame_ios '6.5"' 1242 2688  860 1720  700  1100   86   330  372   64  "$IOS_OUT/screenshots-6.5"

echo "Wrote:"
identify -format "  %f  %wx%h\n" "$OUT/play-store-icon.png" "$OUT/feature-graphic.png"
identify -format "  screenshots-framed/%f  %wx%h\n" "$FRAMED"/*.jpg
identify -format "  ios/screenshots-6.9/%f  %wx%h\n" "$IOS_OUT/screenshots-6.9"/*.jpg
identify -format "  ios/screenshots-6.5/%f  %wx%h\n" "$IOS_OUT/screenshots-6.5"/*.jpg
