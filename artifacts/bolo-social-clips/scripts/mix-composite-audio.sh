#!/bin/bash
# Rebuilds public/audio/composite_audio.mp3 from the committed stems.
#
# Canonical timeline (SCENE_DURATIONS in VideoTemplate.tsx):
#   roots      0s-20s
#   howItWorks 20s-46s
#   languages  46s-64s
#
# Stem placement (ms offsets used below) was originally reverse-engineered by
# cross-correlating each stem against the mixed track; keep this script as the
# source of truth for offsets/volumes so future remixes don't have to repeat
# that. VO lines are spoken by ElevenLabs "Jessica" (voice_id
# cgSgspJ2msm6clMCkdW9, eleven_multilingual_v2), the same bubbly female voice
# as the launch video narration. If you re-record a VO clip, re-run this script
# and nudge the vo adelay so the line still ends before its scene boundary.
set -euo pipefail
cd "$(dirname "$0")/../public/audio"

ffmpeg -y -v error \
  -i music_roots.mp3 -i music_howitworks.mp3 -i music_languages.mp3 \
  -i vo_roots.mp3 -i vo_howitworks.mp3 -i vo_languages.mp3 \
  -i sfx_logo.mp3 -i sfx_almost.mp3 -i sfx_listen.mp3 -i sfx_success.mp3 \
  -i sfx_xp.mp3 -i sfx_shimmer.mp3 -i sfx_riser.mp3 -i sfx_cta.mp3 \
  -filter_complex "\
[0:a]volume=0.30,afade=t=in:d=0.5,afade=t=out:st=19.2:d=0.8,adelay=0:all=1[m0];\
[1:a]volume=0.30,afade=t=in:d=0.4,afade=t=out:st=25.2:d=0.8,adelay=20000:all=1[m1];\
[2:a]volume=0.30,afade=t=in:d=0.4,afade=t=out:st=17.2:d=0.8,adelay=46000:all=1[m2];\
[3:a]volume=1.8,adelay=8300:all=1[v0];\
[4:a]volume=1.8,adelay=21000:all=1[v1];\
[5:a]volume=1.6,adelay=54800:all=1[v2];\
[6:a]volume=0.7,adelay=14510:all=1[s0];\
[7:a]volume=0.7,adelay=30500:all=1[s1];\
[8:a]volume=0.7,adelay=34010:all=1[s2];\
[9:a]volume=0.75,adelay=41010:all=1[s3];\
[10:a]volume=0.7,adelay=43510:all=1[s4];\
[11:a]volume=0.65,adelay=46660:all=1[s5];\
[12:a]volume=0.7,adelay=59510:all=1[s6];\
[13:a]volume=0.75,adelay=61010:all=1[s7];\
[m0][m1][m2][v0][v1][v2][s0][s1][s2][s3][s4][s5][s6][s7]amix=inputs=14:normalize=0,alimiter=limit=0.95[out]" \
  -map "[out]" -t 64 -ac 2 -b:a 192k composite_audio.mp3

echo "Rebuilt composite_audio.mp3 ($(ffprobe -v error -show_entries format=duration -of csv=p=0 composite_audio.mp3)s)"
