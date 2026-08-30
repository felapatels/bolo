#!/usr/bin/env python3
"""
Chacha-ji's stall as one small picture for the journey map (build 22, the
owner: "Chachaji's stall should be more detailed like this").

    python3 artifacts/bolo-mobile/scripts/make-stall-card.py

Cuts the counter, kettle, kulhads and canopy out of the delivered
assets/images/stall/stall.png, stands the delivered chachaji.png BEHIND the
counter (the counter front and everything on it are pasted back over his
legs), and writes assets/images/stall/stall-card.png at 320 by 352. No new
character art: both halves are the pictures the home vignette already
composites. Run from the repo root, on the Mac (python3 with Pillow).
"""
import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
STALL = os.path.join(ROOT, 'assets', 'images', 'stall')

scene = Image.open(os.path.join(STALL, 'stall.png')).convert('RGBA')
# The stall's own corner of the scene: canopy, kettle, cups, counter.
crop = scene.crop((0, 20, 500, 572))
# Chacha-ji, behind the counter: the counter top is about y 305 in the crop.
chacha = Image.open(os.path.join(STALL, 'chachaji.png')).convert('RGBA')
w = 190
h = round(w * chacha.height / chacha.width)
chacha = chacha.resize((w, h), Image.LANCZOS)
out = crop.copy()
out.alpha_composite(chacha, (30, 305 - h + 70))
# The counter front and what stands on it, back over his legs.
front = crop.crop((0, 300, 500, 552))
out.alpha_composite(front, (0, 300))
out = out.resize((320, 352), Image.LANCZOS)
out.save(os.path.join(STALL, 'stall-card.png'), optimize=True)
print('wrote assets/images/stall/stall-card.png', out.size)
