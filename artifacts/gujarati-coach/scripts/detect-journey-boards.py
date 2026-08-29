"""Find the blank boards on a text-free journey poster (build 20).

THE POSTERS CARRY NO TEXT; THE APP WRITES THE WORDS. Every text-bearing
poster ChatGPT made came back with a wrong city, a borrowed row or a
misspelt sign, so the owner ruled on 2026-08-29: the art has empty boards
and the app fills them in. This script finds those boards once per poster
and writes them as fractions of the image (so any size works) to
public/journey/maps/<code>.json beside the jpg. Both apps fetch that JSON
and lay the words over the boards; a poster with no JSON renders as-is.

What it looks for, and how: cream boards (title, greeting, six zone panels,
the bottom strip) and the dark station signs are flat colour blocks. It
thresholds them on a 320-wide copy, labels connected regions (the dark mask
is eroded first so a sign does not merge with its post and the night
ground), keeps the rectangular ones, and tells a panel from its medallion
by size and shape. The six small dark discs at the panels' corners are the
zone-number spots. REVIEW THE OVERLAY PNG EVERY TIME: the boxes are only as
good as the painting, and a hand-fixed JSON is fine.

Usage: python3 scripts/detect-journey-boards.py <poster> <out.json> <overlay.png>
Needs python3 with Pillow (present on the owner's Mac; not a repo dependency).
"""
import os, sys, json
from collections import deque
from PIL import Image, ImageDraw

src, out_json, out_png = sys.argv[1:4]
im = Image.open(src).convert("RGB")
W0, H0 = im.size
DW = 320
scale = DW / W0
small = im.resize((DW, int(H0 * scale)))
w, h = small.size
px = small.load()

def is_cream(r, g, b):
    return r > 215 and g > 195 and b > 150 and (r - b) > 25 and abs(r - g) < 45
def is_navy(r, g, b):
    # The signs come out as a dark, near-neutral board (charcoal, navy or
    # plum depending on the light); what they never are is bright or
    # strongly coloured.
    # The violet rail glow tints the lower signs, so the spread allowance is
    # generous; erosion and the rectangle test keep the night scenery out.
    return (r + g + b) < 215 and (max(r, g, b) - min(r, g, b)) < 60
def is_indigo(r, g, b):
    return 50 < r < 130 and 40 < g < 120 and b > 170

def regions(pred, min_frac, max_frac, min_fill, erode=0):
    # mask[y][x]: the pixel passes, and (with erode) so does everything
    # within `erode` pixels of it, which drops thin posts, shadows and links
    # between a board and the dark scenery around it.
    raw = [[pred(*px[x, y]) for x in range(w)] for y in range(h)]
    if erode:
        mask = [[False] * w for _ in range(h)]
        for y in range(erode, h - erode):
            for x in range(erode, w - erode):
                if raw[y][x] and all(raw[y + dy][x + dx] for dy in range(-erode, erode + 1) for dx in range(-erode, erode + 1)):
                    mask[y][x] = True
    else:
        mask = raw
    pred = lambda *_: True  # noqa: E731 (mask decides from here)
    seen = [[False] * w for _ in range(h)]
    out = []
    for y in range(h):
        for x in range(w):
            if seen[y][x] or not mask[y][x]:
                continue
            q = deque([(x, y)]); seen[y][x] = True
            n = 0; x0 = x1 = x; y0 = y1 = y
            while q:
                cx, cy = q.popleft(); n += 1
                x0 = min(x0, cx); x1 = max(x1, cx); y0 = min(y0, cy); y1 = max(y1, cy)
                for nx, ny in ((cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and mask[ny][nx]:
                        seen[ny][nx] = True; q.append((nx, ny))
            area = (x1 - x0 + 1) * (y1 - y0 + 1)
            frac = area / (w * h)
            fill = n / area
            if min_frac <= frac <= max_frac and fill >= min_fill:
                # Give back what erosion took off the edges.
                x0e, y0e, x1e, y1e = max(0, x0 - erode), max(0, y0 - erode), min(w - 1, x1 + erode), min(h - 1, y1 + erode)
                out.append(dict(x=x0e / w, y=y0e / h, w=(x1e - x0e + 1) / w, h=(y1e - y0e + 1) / h, fill=round(fill, 2),
                                pw=(x1e - x0e + 1), ph=(y1e - y0e + 1)))
    return out

cream = regions(is_cream, 0.012, 0.25, 0.55)

def find_signs():
    """The station signs by their SHAPE rather than as blobs: a sign is a run
    of dark pixels about a sixth of the poster wide, sitting near the centre,
    repeated over a few dozen rows. A wooden post is too thin to be a run,
    a dark river too wide, and a shadow does not hold its width row after
    row, so the signs come out even when they touch dark scenery (Gujarati
    lost three of six to that as blobs)."""
    lo, hi = int(w * 0.22), int(w * 0.78)
    min_run, max_run = w * 0.11, w * 0.34
    rows = []  # (y, x0, x1) of the centre-most qualifying run per row
    for y in range(h):
        runs = []
        x = lo
        while x < hi:
            if is_navy(*px[x, y]):
                x0 = x
                while x < hi and is_navy(*px[x, y]):
                    x += 1
                if min_run <= (x - x0) <= max_run:
                    runs.append((x0, x))
            else:
                x += 1
        if runs:
            x0, x1 = min(runs, key=lambda r: abs((r[0] + r[1]) / 2 - w / 2))
            rows.append((y, x0, x1))
    signs = []
    cur = []
    def close():
        if len(cur) >= h * 0.028:
            ys = [r[0] for r in cur]
            xs0 = sorted(r[1] for r in cur); xs1 = sorted(r[2] for r in cur)
            x0, x1 = xs0[len(xs0) // 2], xs1[len(xs1) // 2]  # medians: ignore ragged ends
            signs.append(dict(x=x0 / w, y=min(ys) / h, w=(x1 - x0) / w, h=(max(ys) - min(ys) + 1) / h,
                              fill=1.0, pw=(x1 - x0), ph=(max(ys) - min(ys) + 1)))
    for r in rows:
        # Same sign while the rows touch and the run's CENTRE holds; the
        # left edge wanders where a post or a shadow meets the board.
        if cur and (r[0] - cur[-1][0] > 2 or abs((r[1] + r[2]) - (cur[-1][1] + cur[-1][2])) > w * 0.16):
            close(); cur = []
        cur.append(r)
    close()
    # A sign is wider than tall and at most a tenth of the poster tall.
    return [b for b in signs if b["pw"] > 1.15 * b["ph"] and b["h"] < 0.1]

navy = find_signs()
# The badge is the indigo block in the top-left corner; the parrot's wings
# are indigo too, so the corner is what picks it.
indigo = [b for b in regions(is_indigo, 0.001, 0.06, 0.5) if b["y"] < 0.12 and b["x"] < 0.3]
# The zone-number spots: small dark discs on the panels' corners.
discs = [b for b in regions(is_navy, 0.0004, 0.004, 0.55) if 0.7 < b["pw"] / b["ph"] < 1.4]

def cx(b): return b["x"] + b["w"] / 2
def cy(b): return b["y"] + b["h"] / 2
cream.sort(key=cy)
title = min(cream, key=lambda b: (abs(cx(b) - 0.5) + b["y"]))  # top centre
rest = [b for b in cream if b is not title]
bottom = max(rest, key=lambda b: b["y"] + b["h"])
rest = [b for b in rest if b is not bottom]
# the greeting board: tall, left, upper third
greeting = min(rest, key=lambda b: (cx(b) + cy(b) - b["h"]))
rest = [b for b in rest if b is not greeting]
# Panels are wider than tall; a medallion is a cream disc and must not
# take a panel's slot.
# A medallion is a small, near-square cream disc; a panel is anything else
# (a panel whose medallion touches it gets a squarer box, so aspect alone
# cannot tell them apart).
def is_medallion(b):
    ratio = b["pw"] / b["ph"]
    return (b["w"] * b["h"]) < 0.02 and 0.8 < ratio < 1.25
panels = [b for b in rest if not is_medallion(b)]
zones = sorted(panels, key=cy)[:6]
signs = sorted(navy, key=cy)
if len(signs) > 6:
    # Too many candidates: keep the six tallest, which are the real boards.
    signs = sorted(sorted(signs, key=lambda b: -b["ph"])[:6], key=cy)
badge = sorted(indigo, key=lambda b: (b["y"], b["x"]))[:1]
# Each zone's number disc: the disc nearest that panel's top-left corner.
def nearest_disc(z):
    if not discs: return None
    return min(discs, key=lambda d: (cx(d) - z["x"]) ** 2 + (cy(d) - z["y"]) ** 2)
numbers = [nearest_disc(z) for z in zones]
# Each zone's medallion: the small near-square cream disc nearest the panel.
medallion_candidates = [b for b in cream if is_medallion(b)]
def nearest_medallion(z):
    if not medallion_candidates: return None
    m = min(medallion_candidates, key=lambda d: (cx(d) - cx(z)) ** 2 + (cy(d) - cy(z)) ** 2)
    return m if abs(cy(m) - cy(z)) < 0.12 else None
medallions = [nearest_medallion(z) for z in zones]
# Whether the medallions carry painted pictures (the app draws nothing in
# them) or are empty discs the app draws its own icon into. The import
# script sets ICONS=painted for the early posters.
icons_painted = os.environ.get("ICONS", "empty") == "painted"
strip = lambda b: (None if b is None else {k: round(b[k], 4) for k in ("x", "y", "w", "h")})
result = dict(size=[W0, H0], title=strip(title), greeting=strip(greeting), bottom=strip(bottom),
              badge=strip(badge[0]) if badge else None,
              zones=[strip(z) for z in zones], numbers=[strip(n) for n in numbers], signs=[strip(s) for s in signs],
              medallions=[strip(m) for m in medallions], iconsPainted=icons_painted)
counts = dict(cream=len(cream), navy=len(navy), indigo=len(indigo), discs=len(discs))
json.dump(result, open(out_json, "w"), indent=1)
result["badge"] = result["badge"] or None

d = ImageDraw.Draw(im)
def box(b, colour, label):
    if not b: return
    x0, y0 = b["x"] * W0, b["y"] * H0; x1, y1 = x0 + b["w"] * W0, y0 + b["h"] * H0
    d.rectangle([x0, y0, x1, y1], outline=colour, width=4); d.text((x0 + 6, y0 + 4), label, fill=colour)
box(title, "red", "title"); box(greeting, "red", "greeting"); box(bottom, "red", "bottom"); box(result["badge"], "lime", "badge")
for i, z in enumerate(zones): box(z, "red", f"zone {i+1}")
for i, s in enumerate(signs): box(s, "cyan", f"sign {i+1}")
for i, n in enumerate(numbers): box(n, "yellow", f"{i+1}")
for i, m in enumerate(medallions): box(m, "magenta", f"icon {i+1}")
im.save(out_png)
print(json.dumps(counts), "zones", len(zones), "signs", len(signs), "numbers", sum(1 for n in numbers if n), "badge", bool(badge))
if len(zones) != 6 or len(signs) != 6:
    print("WARNING: expected six zones and six signs; fix the JSON by hand or repaint", file=sys.stderr)
