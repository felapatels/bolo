#!/usr/bin/env python3
"""
Drop the owner's generated pictures over the games hub's placeholders.

    python3 artifacts/bolo-mobile/scripts/import-game-art.py [~/Downloads/bolo-games]

Reads the folder the brief names (games/<id>.png for the fourteen cards,
games/hero.png for the hero band, home/parchment.png for the home pass's
sheet), centre-crops each to its aspect, resamples it to the size the app
draws at, and writes it into both apps under the same name:

    cards      4:3   800 x 600   artifacts/bolo-mobile/assets/games/<id>.png
                                 artifacts/gujarati-coach/public/games/<id>.png
    hero      16:9  1200 x 675   assets/games/hero.png, public/games/hero.png
    parchment  4:3  1200 x 900   assets/journey/parchment.png, public/journey/parchment.png
                                 (transparency kept)

Files that are not there yet are skipped and named, so the script can run
after every batch. Nothing in the bundle changes shape: the names are the
ones lib/gameArt.ts already requires. Run from the repo root, on the Mac
(python3 with Pillow).
"""
import os
import sys
from collections import deque
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SRC = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/Downloads/bolo-games')
MOBILE = os.path.join(ROOT, 'artifacts', 'bolo-mobile', 'assets')
WEB = os.path.join(ROOT, 'artifacts', 'gujarati-coach', 'public')

CARDS = [
    'luggage-match', 'chacha-call', 'word-match', 'signal-lights', 'phrase-builder',
    'speed-round', 'script-trace', 'bolo-quiz', 'ticket-check', 'storybook',
    'emergency', 'listen-and-pick', 'wrong-platform', 'wrong-platform-2',
]
# The brief names two cards by the game's title rather than its id.
ALIASES = {'chacha-ji-calls': 'chacha-call', 'beat-the-train': 'emergency'}


def find(rel_candidates):
    for rel in rel_candidates:
        for ext in ('.png', '.jpg', '.jpeg', '.webp'):
            p = os.path.join(SRC, rel + ext)
            if os.path.exists(p):
                return p
    return None


def key_checkerboard(im):
    """THE GENERATOR PAINTS ITS CHECKERBOARD (build 22). Asked for a sheet on
    a transparent background it delivered a JPEG with grey-and-white squares
    drawn in, which would have shipped as a chessboard under the home pass.
    The squares are neutral and the paper is warm, so: flood-fill the
    outside from the four corners over low-chroma pixels (a pale spot INSIDE
    the sheet is never reached, so it stays solid), erode a pixel to cut the
    JPEG fringe, soften the edge, and write that as the alpha."""
    im = im.convert('RGB')
    w, h = im.size
    px = im.load()
    low = 14
    outside = bytearray(w * h)
    q = deque()
    for sx, sy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        outside[sy * w + sx] = 1
        q.append((sx, sy))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not outside[i]:
                    r, g, b = px[nx, ny]
                    if max(r, g, b) - min(r, g, b) < low:
                        outside[i] = 1
                        q.append((nx, ny))
    mask = Image.frombytes('L', (w, h), bytes(255 - 255 * v for v in outside))
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = im.copy()
    out.putalpha(mask)
    return out


def fit(im, w, h, keep_alpha=False):
    im = im.convert('RGBA' if keep_alpha else 'RGB')
    sw, sh = im.size
    target = w / h
    if sw / sh > target:
        nw = int(sh * target)
        im = im.crop(((sw - nw) // 2, 0, (sw - nw) // 2 + nw, sh))
    else:
        nh = int(sw / target)
        im = im.crop((0, (sh - nh) // 2, sw, (sh - nh) // 2 + nh))
    return im.resize((w, h), Image.LANCZOS)


def write(im, *paths):
    for p in paths:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        im.save(p, optimize=True)
        print('  wrote', os.path.relpath(p, ROOT), im.size)


done, missing = [], []

for gid in CARDS:
    names = ['games/' + gid] + ['games/' + a for a, g in ALIASES.items() if g == gid]
    src = find(names)
    if not src:
        missing.append('games/' + gid + '.png')
        continue
    im = fit(Image.open(src), 800, 600)
    write(im, os.path.join(MOBILE, 'games', gid + '.png'), os.path.join(WEB, 'games', gid + '.png'))
    done.append(gid)

src = find(['games/hero'])
if src:
    im = fit(Image.open(src), 1200, 675)
    write(im, os.path.join(MOBILE, 'games', 'hero.png'), os.path.join(WEB, 'games', 'hero.png'))
    done.append('hero')
else:
    missing.append('games/hero.png')

src = find(['home/parchment'])
if src:
    im = Image.open(src)
    if 'A' not in im.getbands():
        print('  parchment has no alpha: keying the painted checkerboard')
        im = key_checkerboard(im)
    im = im.convert('RGBA')
    # THE SHEET FILLS ITS FRAME (build 22). ParchmentPass stretches this over
    # the pass's whole box and hangs the nameplate on its top edge, so any
    # transparent margin the generator left would open a gap under the plate
    # and push the tear inside the words' padding. Crop to the alpha's box
    # first; fit() then trims the sides to 4:3.
    bbox = im.getchannel('A').point(lambda v: 255 if v > 128 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    im = fit(im, 1200, 900, keep_alpha=True)
    write(im, os.path.join(MOBILE, 'journey', 'parchment.png'), os.path.join(WEB, 'journey', 'parchment.png'))
    done.append('parchment')
else:
    missing.append('home/parchment.png')

print('\nimported:', ', '.join(done) if done else 'nothing')
print('still placeholders:', ', '.join(missing) if missing else 'none')
