#!/usr/bin/env node
// Recut three garment pieces so they actually cover Bolo's shoulders.
//
// WHY THIS EXISTS (owner ruling, Aug 12 2026). Measurement of the -b alternates
// showed every side leak was a HOLE IN THE CLOTH, not a placement error: zero
// leaking pixels fell outside the cloth's horizontal cut at any row, in any of
// the three garments. The art tapers in at the neck, at a tenth of the way
// down it is only half its own width, so at the top band there is simply no
// cloth where her shoulders are, and no knob can fill a hole. The recut has
// exactly two jobs, A and B below.
//
// WHY THIS IS PIXEL SURGERY AND NOT A NEW RENDER. The brief is "the same
// outfits, cut correctly", style, palette and silhouette must not drift. A
// regenerated garment cannot promise that; extending a garment's own edge
// pixels can. Every colour written here is sampled from the piece itself, a few
// pixels inside its edge so an outline stroke is never the thing that gets
// smeared. Nothing is invented.
//
// A. FILL THE COLLAR TAPER. For each row in the top band, the row's opaque span
//    is extended sideways to the full width of the piece. Interior transparency
//    is left alone, so a neck opening stays an opening, the fill goes beside
//    the neck, never over it. This costs nothing visually below the shoulders:
//    above the hem line the compositor clips cloth to her silhouette, so the
//    extra width only ever shows where she is.
//
// B. CLOSE THE LEG WEDGE (kurta only). Its churidar is drawn as two separated
//    legs, which left a 7,093px teal wedge between them that every knob made
//    worse. Interior gaps below the waist are filled from whichever side is
//    nearer, which continues the fold shading inward and makes the churidar one
//    panel.
//
// Output is written beside the input as `-c.png`. The `-b` alternates are left
// intact: they are the record of what the closed-front cut looked like before
// this pass, and overwriting them would make that unrecoverable.
//
// Usage:  node scripts/recut-garment-yoke.mjs [--id kurta] [--yoke 0.24]

import { execFileSync } from "node:child_process";

const ART = "scripts/mascot-garment-art";

/**
 * `yoke` is how far down the piece the widening runs, as a fraction of its own
 * height. It has to reach past the row where the garment first becomes wider
 * than she is (measured: image row ~570, which is a fifth of the way down a
 * squashed cut) or the fill just moves the leak down a few rows. `legs` turns
 * on job B.
 */
const ITEMS = [
  { id: "kurta", yoke: 0.24, legs: true },
  { id: "sherwani", yoke: 0.24, legs: false },
  { id: "saree", yoke: 0.24, legs: false },
  // anarkali never went through the closed-front "-b" re-cut the other three
  // did (it was excluded from every earlier pass), so there is no gar-anarkali-b.png
  // to read from. srcSuffix lets this one item source straight from the
  // original art instead of the default "-b".
  { id: "anarkali", yoke: 0.24, legs: true, srcSuffix: "" },
];

/**
 * EVIDENCE ONLY, off by default (`--hem <frac>`, plus `--out` to keep the result
 * out of the art dir). Job A applied to the LOWER band instead of the yoke: the
 * kurta's churidar tapers toward the ankles and so leaves her hips bare below
 * the waist, which neither job A nor any knob touches. Widening there is only
 * safe alongside a raised freefrac, below the hem line cloth is unclipped, so
 * a widened lower band would otherwise hang past her legs as a slab.
 */

const ALPHA_ON = 16; // "there is cloth here"
const ALPHA_SOLID = 200; // "...and it is not a feathered edge, so its colour is trustworthy"
// Every one of these pieces is drawn with a 2-3px near-black contour stroke, so
// the first solid pixel inward from an edge is the OUTLINE, not the fabric, // sampling it paints black wings onto her shoulders. Step past the stroke, then
// take a median over a short window so a single stray pixel cannot set the tone.
const OUTLINE_SKIP = 4;
const SAMPLE_WIN = 8;
const MIN_GAP = 6; // narrower interior gaps are drawing detail, not a wedge
const LEG_START = 0.6; // job B only looks below this: above it, a gap is the neck

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

function recut({ id, yoke, legs, hem, gaps, outDir, srcSuffix, srcPath }) {
  const legStart = gaps ?? LEG_START;
  const src = srcPath ?? `${ART}/gar-${id}${srcSuffix ?? "-b"}.png`;
  const out = `${outDir ?? ART}/gar-${id}-c.png`;

  // Trim first, for the same reason the generator does: the width we widen to
  // must be the width of the cloth, not of whatever canvas it was drawn on.
  const buf = execFileSync("magick", [src, "-trim", "+repage", "-depth", "8", "RGBA:-"], {
    maxBuffer: 1 << 28,
  });
  const [W, H] = execFileSync("magick", [src, "-trim", "+repage", "-format", "%w %h", "info:"], {
    encoding: "utf8",
  })
    .split(" ")
    .map(Number);

  const at = (x, y) => (y * W + x) * 4;
  const alpha = (x, y) => buf[at(x, y) + 3];
  const put = (x, y, rgba) => {
    const i = at(x, y);
    buf[i] = rgba[0];
    buf[i + 1] = rgba[1];
    buf[i + 2] = rgba[2];
    buf[i + 3] = 255;
  };
  /** Fabric colour just inside an edge, with the contour stroke stepped over. */
  const sample = (x0, y, dir, limit) => {
    const chans = [[], [], []];
    for (let d = OUTLINE_SKIP; d < OUTLINE_SKIP + SAMPLE_WIN; d++) {
      const x = x0 + dir * d;
      if (x < 0 || x >= W || (dir > 0 ? x > limit : x < limit)) break;
      if (alpha(x, y) < ALPHA_SOLID) continue;
      const i = at(x, y);
      chans[0].push(buf[i]);
      chans[1].push(buf[i + 1]);
      chans[2].push(buf[i + 2]);
    }
    if (chans[0].length) {
      return chans.map((c) => c.sort((a, b) => a - b)[c.length >> 1]);
    }
    // Nothing trustworthy within reach (a sliver of a row): keep the edge pixel.
    const i = at(Math.max(0, Math.min(W - 1, x0)), y);
    return [buf[i], buf[i + 1], buf[i + 2]];
  };

  const yokeRows = Math.round(yoke * H);
  let widened = 0;
  let filled = 0;

  // ---- job A: widen the top band out to the full width of the piece --------
  for (let y = 0; y < yokeRows; y++) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < W; x++) {
      if (alpha(x, y) > ALPHA_ON) {
        if (l < 0) l = x;
        r = x;
      }
    }
    if (l < 0) continue; // no cloth in this row at all; nothing to extend
    const cl = sample(l, y, +1, r);
    const cr = sample(r, y, -1, l);
    // Paint over the old contour stroke as well as the empty space beyond it:
    // left in place it becomes a dark seam running down the middle of the new
    // yoke, which reads as a rip rather than a shoulder.
    for (let x = 0; x < Math.min(l + OUTLINE_SKIP, r); x++, widened++) put(x, y, cl);
    for (let x = W - 1; x > Math.max(r - OUTLINE_SKIP, l); x--, widened++) put(x, y, cr);
  }

  // ---- evidence only: widen the lower band the same way as the yoke --------
  if (hem) {
    for (let y = Math.round(hem * H); y < H; y++) {
      let l = -1;
      let r = -1;
      for (let x = 0; x < W; x++) {
        if (alpha(x, y) > ALPHA_ON) {
          if (l < 0) l = x;
          r = x;
        }
      }
      if (l < 0) continue;
      const cl = sample(l, y, +1, r);
      const cr = sample(r, y, -1, l);
      for (let x = 0; x < Math.min(l + OUTLINE_SKIP, r); x++, widened++) put(x, y, cl);
      for (let x = W - 1; x > Math.max(r - OUTLINE_SKIP, l); x--, widened++) put(x, y, cr);
    }
  }

  // ---- job B: make the churidar one panel ----------------------------------
  if (legs) {
    for (let y = Math.round(legStart * H); y < H; y++) {
      let l = -1;
      let r = -1;
      for (let x = 0; x < W; x++) {
        if (alpha(x, y) > ALPHA_ON) {
          if (l < 0) l = x;
          r = x;
        }
      }
      if (l < 0) continue;
      let runStart = -1;
      for (let x = l; x <= r + 1; x++) {
        const solid = x > r ? true : alpha(x, y) > ALPHA_ON;
        if (!solid && runStart < 0) runStart = x;
        if (solid && runStart >= 0) {
          const runEnd = x - 1;
          if (runEnd - runStart + 1 > MIN_GAP) {
            const cl = sample(runStart - 1, y, -1, l);
            const cr = sample(runEnd + 1, y, +1, r);
            // Same as the yoke: swallow the two inner contour strokes, or the
            // filled panel keeps the drawn outline of the gap it replaced.
            const from = Math.max(l, runStart - OUTLINE_SKIP);
            const to = Math.min(r, runEnd + OUTLINE_SKIP);
            const mid = (from + to) / 2;
            for (let gx = from; gx <= to; gx++, filled++) put(gx, y, gx <= mid ? cl : cr);
          }
          runStart = -1;
        }
      }
    }
  }

  execFileSync("magick", ["-size", `${W}x${H}`, "-depth", "8", "RGBA:-", "PNG32:" + out], {
    input: buf,
    maxBuffer: 1 << 28,
  });
  console.log(
    `${id}: ${W}x${H}  yoke rows 0-${yokeRows - 1} widened ${widened}px` +
      (legs ? `, leg wedge filled ${filled}px` : "") +
      `  → ${out}`,
  );
}

const only = arg("id");
const yokeOverride = arg("yoke");
const hem = arg("hem");
const gaps = arg("gaps");
const outDir = arg("out");
const srcPath = arg("src");

// EVIDENCE ONLY, additive. `--src` recuts a piece that has no ITEMS row, which
// is what a review candidate is. It exists so a trial pass can never read or
// overwrite installed art, so it insists on both `--id` and `--out`. Job B is
// declared by `legs` on an ITEMS row and a candidate has no row, so here
// `--gaps` is what turns it on. With no `--src` nothing below changes.
if (srcPath) {
  if (!only || !outDir) {
    throw new Error("--src requires --id (names the output) and --out (keeps it out of the art dir)");
  }
  recut({
    id: only,
    srcPath,
    yoke: yokeOverride ? Number(yokeOverride) : 0.24,
    legs: gaps != null,
    hem: hem ? Number(hem) : null,
    gaps: gaps ? Number(gaps) : null,
    outDir,
  });
} else {
  for (const item of ITEMS) {
    if (only && item.id !== only) continue;
    recut({
      ...item,
      yoke: yokeOverride ? Number(yokeOverride) : item.yoke,
      hem: hem ? Number(hem) : null,
      gaps: gaps ? Number(gaps) : null,
      outDir,
    });
  }
}
