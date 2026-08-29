#!/usr/bin/env bash
# Import approved one-pager map posters into the web app's public folder.
#
# THE POSTERS ARE MADE BY HAND (ChatGPT, one per language, approved one at a
# time by the owner) and saved by language NAME into a folder outside the
# repo, ~/Downloads/bolo-maps by default: "assamese.png", "hindiJ1.png",
# "gujarati j1.png", even "bengali" with no extension. This script maps a
# language CODE to whichever file in that folder starts with the language's
# name, converts it to a 1080-wide JPEG (about 300 KB against 3 MB for the
# PNG) and writes public/journey/maps/<code>.jpg, which both apps load by
# URL (lib/journey-map.ts on web, lib/journeyMap.ts on mobile). Runs on a
# Mac (sips); the posters only ever exist on one.
#
# Usage, from the repo root or this package:
#   scripts/import-journey-maps.sh as or pa          # named codes
#   MAPS_DIR=~/Desktop/posters scripts/import-journey-maps.sh hi
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/public/journey/maps"
SRC="${MAPS_DIR:-$HOME/Downloads/bolo-maps}"
WIDTH="${MAP_WIDTH:-1080}"
QUALITY="${MAP_QUALITY:-75}"

name_for() {
  case "$1" in
    as) echo assamese ;;  bn) echo bengali ;;   brx) echo bodo ;;      doi) echo dogri ;;
    gu) echo gujarati ;;  hi) echo hindi ;;     kn) echo kannada ;;    ks) echo kashmiri ;;
    kok) echo konkani ;;  mai) echo maithili ;; ml) echo malayalam ;;  mni) echo manipuri ;;
    mr) echo marathi ;;   ne) echo nepali ;;    or) echo odia ;;       pa) echo punjabi ;;
    sa) echo sanskrit ;;  sat) echo santali ;;  sd) echo sindhi ;;     ta) echo tamil ;;
    te) echo telugu ;;    ur) echo urdu ;;
    *) echo "unknown language code: $1" >&2; exit 2 ;;
  esac
}

[ "$#" -gt 0 ] || { echo "usage: $0 <code> [code ...]" >&2; exit 2; }
mkdir -p "$OUT"
for code in "$@"; do
  name="$(name_for "$code")"
  src="$(find "$SRC" -maxdepth 1 -type f -iname "${name}*" | head -1)"
  # "telegu" is a spelling the owner has used for Telugu; accept it too.
  if [ -z "$src" ] && [ "$code" = te ]; then
    src="$(find "$SRC" -maxdepth 1 -type f -iname "telegu*" | head -1)"
  fi
  if [ -z "$src" ]; then
    echo "$code: no file starting with '$name' in $SRC" >&2
    exit 1
  fi
  sips -s format jpeg -s formatOptions "$QUALITY" --resampleWidth "$WIDTH" "$src" --out "$OUT/$code.jpg" >/dev/null
  dims="$(sips -g pixelWidth -g pixelHeight "$OUT/$code.jpg" | awk '/pixel/{printf "%sx", $2}' | sed 's/x$//')"
  printf '%-4s %-12s %s  %s  %s KB\n' "$code" "$name" "$(basename "$src")" "$dims" "$(( $(stat -f %z "$OUT/$code.jpg") / 1024 ))"
done
