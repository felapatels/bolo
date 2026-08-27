#!/usr/bin/env python3
"""
FLATTEN SCREENSHOTS FOR APP STORE CONNECT.

App Store Connect REFUSES any screenshot carrying an alpha channel, and every
screenshot taken on an iPhone or in the simulator has one. Its error names the
alpha channel but not the fix, and nothing in Photos or Preview obviously
removes it. Hit 2026-08-26 uploading the 1.0.3 journey screenshots.

    python3 scripts/flatten-store-screenshots.py ~/Downloads/shots

Writes RGB copies with no alpha into `<folder>/appstore-ready` and leaves the
originals alone.

SIPS CANNOT DO THIS, which is worth recording because it is the obvious first
try and it silently does not work: `sips -p <h> <w> --padColor FFFFFF` pads
onto an opaque canvas and the output STILL reports hasAlpha: yes. Written with
sips first, tested, and rewritten. Pillow is the dependency instead.

COMPOSITES ONTO WHITE rather than discarding the channel. A fully opaque
screenshot is identical either way, but where a pixel really is transparent,
dropping the channel keeps whatever colour sits underneath, which shows up as
dark fringing around rounded corners.

SIZES ARE NOT TOUCHED. Apple wants exact per-device dimensions (6.9" is
1320x2868) and a device screenshot is already right for its own class, so
resizing here would do harm. Each file's dimensions are printed so a
wrong-sized one is visible before upload.
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required:  pip3 install --user pillow")

folder = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
out_dir = os.path.join(folder, "appstore-ready")

names = sorted(f for f in os.listdir(folder) if f.lower().endswith(".png"))
if not names:
    sys.exit(f"No PNGs in {folder}")

os.makedirs(out_dir, exist_ok=True)

flattened = 0
for name in names:
    im = Image.open(os.path.join(folder, name))
    had_alpha = im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info
    if had_alpha:
        rgba = im.convert("RGBA")
        flat = Image.new("RGB", rgba.size, (255, 255, 255))
        flat.paste(rgba, mask=rgba.split()[-1])
        flattened += 1
    else:
        flat = im.convert("RGB")
    dest = os.path.join(out_dir, name)
    flat.save(dest, "PNG")

    check = Image.open(dest)
    still = check.mode in ("RGBA", "LA", "PA") or "transparency" in check.info
    print(
        f"{'STILL HAS ALPHA' if still else 'ok'}  "
        f"{check.size[0]}x{check.size[1]}  {name}"
    )

print(f"\n{len(names)} file(s), {flattened} flattened, written to {out_dir}")
print('Apple wants exact sizes: 6.9" is 1320x2868. Anything else above is '
      "wrong for that slot.")
