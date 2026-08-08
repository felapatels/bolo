#!/usr/bin/env node
// Put an accessory on Bolo — as a LAYER, not a baked-in bird.
//
// CANONICAL MASCOT RULE (owner ruling): no new Bolo artwork, by any means. An
// accessory is an isolated transparent object composited over the untouched
// canonical PNGs. Nothing of hers is ever redrawn.
//
// WHY THIS IS SEPARATE FROM gen-mascot-outfits.mjs: a garment covers her
// belly, an accessory sits on her head, and the owner wants both worn at once.
// That only works if the accessory ships as a TRANSPARENT OVERLAY the client
// stacks over whatever base is showing (canonical Bolo, or a dressed one).
// Baking the hat into a whole-bird PNG — the old shape — makes hat and garment
// mutually exclusive, because each file is a complete picture of her.
//
// Two files per pose:
//   overlay-<pose>.png   the accessory alone in the 1024 frame, aligned so it
//                        drops onto any base with no maths at the call site.
//   mascot-<pose>.png    canonical Bolo wearing it — still shipped for the
//                        shop thumbnail and any single-layer surface.
//
// EYE CLEARANCE (owner ruling, Aug 8 2026): a hat may not clip the top of her
// eye. Seating is therefore SOLVED, not guessed: the hat starts at its
// approved position and is raised until it has no pixels in common with her
// eye whites. Judging a hat on `wave` alone is how four poses shipped with a
// clipped eye in the first place.
//
// Inputs per accessory <id>:
//   <ART>/<id>.png          the isolated object, upright, full size
//   <ART>/<id>/<pose>.png   the APPROVED placement, one per pose, used only as
//                           a reference for size/position/rotation
//
// The reference layers exist because the per-pose anchors were worked out over
// a long owner review loop in a scratch script that did not survive the
// session. Rather than re-deriving placement from scratch (and silently moving
// art that was signed off), each pose is re-seated exactly where its reference
// sits, and only then lifted the minimum distance that clears her eye.
//
// Usage:
//   node scripts/gen-mascot-accessories.mjs --id pagdi              review only
//   node scripts/gen-mascot-accessories.mjs --id pagdi --install
//   ... --extract    (bootstrap) re-cut reference layers from shipped art
//   ... --fudge 1.04 --margin 10     size and clearance knobs

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";

const POSES = ["wave", "cheer", "thumbsup", "thinking", "tryagain"];

/**
 * Owner-approved horizontal corrections, in canonical-frame pixels.
 *
 * Seating is derived (reference box, then lifted clear of her eye), but on a
 * strongly rolled head the derived centre can read as "sliding off" even
 * though the maths is right: the cap is a rigid disc and her head is not.
 * `thinking` and `tryagain` are rolled ~19deg and were both signed off at
 * +20px right. Kept here rather than baked into the reference layers so the
 * correction stays visible and revisable.
 */
const NUDGE_X = {
  "station-cap": { thinking: 20, tryagain: 20 },
};

const CANON_DIR = "artifacts/gujarati-coach/public/mascot";
const WEB_OUT = "artifacts/gujarati-coach/public/mascot/outfits";
const MOBILE_OUT = "artifacts/bolo-mobile/assets/images/mascot/outfits";
const ART = "scripts/mascot-accessory-art";
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const has = (name) => process.argv.includes(`--${name}`);

function magick(args) {
  return execFileSync("magick", args, { encoding: "utf8", maxBuffer: 1 << 28 });
}

/** Alpha bounding box of a layer. */
function layerBox(path, pose) {
  const box = magick([path, "-alpha", "extract", "-threshold", "50%", "-format", "%@", "info:"]);
  const m = box.match(/(\d+)x(\d+)\+(\d+)\+(\d+)/);
  if (!m) throw new Error(`empty layer on ${pose}: ${path}`);
  const [, w, h, x, y] = m.map(Number);
  return { w, h, left: x, top: y, right: x + w - 1, bottom: y + h - 1 };
}

/**
 * Her eyes, measured off the canonical art. Nothing else on the mascot is that
 * bright, so the two largest near-white blobs are the eye whites — a threshold
 * plus connected components finds them without knowing anything about a pose.
 * The angle between their centroids is her head roll, which differs enormously
 * between poses: a flat hat on a tilted head is instantly obvious.
 */
function eyes(pose, tmp) {
  const canon = `${CANON_DIR}/mascot-${pose}.png`;
  const out = magick([canon, "-background", "black", "-alpha", "remove",
    "-colorspace", "Gray", "-threshold", "86%",
    "-define", "connected-components:verbose=true",
    "-define", "connected-components:area-threshold=300",
    "-connected-components", "8", "null:"]);

  const blobs = [];
  for (const line of out.split("\n")) {
    const g = line.trim().match(
      /^\d+:\s+(\d+)x(\d+)\+(-?\d+)\+(-?\d+)\s+([\d.]+),([\d.]+)\s+(\d+)\s+(\S+)/,
    );
    if (!g) continue;
    // White blobs only — the background is one enormous black component.
    if (!/255,255,255|gray\(255\)|white/.test(g[8])) continue;
    blobs.push({ y: +g[4], h: +g[2], cx: +g[5], cy: +g[6], area: +g[7] });
  }
  blobs.sort((a, b) => b.area - a.area);
  const pair = blobs.slice(0, 2).sort((a, b) => a.cx - b.cx);
  if (pair.length < 2) throw new Error(`could not find both eyes on ${pose}`);
  const [l, r] = pair;
  return {
    top: Math.min(l.y, r.y),
    roll: (Math.atan2(r.cy - l.cy, r.cx - l.cx) * 180) / Math.PI,
  };
}

/**
 * The eye whites as a mask, grown upwards by the clearance margin.
 *
 * It has to be the blobs themselves — not the box around them, and not the
 * column range they span. The pagdi's side flaps hang more than 100px below
 * eye level BESIDE her head, so any region-based measure reports a hat that
 * covers her whole face and shrinks it into a toy.
 */
function eyeMask(pose, tmp, margin) {
  const out = `${tmp}/${pose}-eyemask.png`;
  magick([`${CANON_DIR}/mascot-${pose}.png`, "-background", "black", "-alpha", "remove",
    "-colorspace", "Gray", "-threshold", "86%",
    "-define", "connected-components:area-threshold=300",
    "-define", "connected-components:mean-color=true",
    "-connected-components", "8", "-threshold", "50%",
    "-morphology", "Dilate", `Rectangle:1x${2 * margin + 1}`,
    "-alpha", "off", out]);
  return out;
}

/** How many pixels of eye the accessory is sitting on. Zero is the goal. */
function eyeOverlap(overlay, mask) {
  return Number(magick([mask,
    "(", overlay, "-alpha", "extract", "-threshold", "50%", ")",
    "-compose", "multiply", "-composite",
    "-format", "%[fx:int(mean*w*h+0.5)]", "info:"]).trim());
}

/**
 * Cut an accessory back out of a shipped whole-bird composite (bootstrap).
 *
 * Differencing is done over two backgrounds and unioned: over one background a
 * pixel of the accessory that happens to match it reads as "no difference" and
 * punches a hole in the cut-out. Nothing can match both black and white.
 */
function extractPlaced(id, pose, tmp) {
  const canon = `${CANON_DIR}/mascot-${pose}.png`;
  const worn = `${WEB_OUT}/${id}/mascot-${pose}.png`;
  const p = (s) => `${tmp}/${pose}-${s}.png`;

  for (const bg of ["black", "white"]) {
    magick([
      "(", worn, "-background", bg, "-alpha", "remove", "-alpha", "off", ")",
      "(", canon, "-background", bg, "-alpha", "remove", "-alpha", "off", ")",
      "-compose", "difference", "-composite",
      "-colorspace", "Gray", "-threshold", "4%", "-alpha", "off", p(`diff-${bg}`),
    ]);
  }
  magick([p("diff-black"), p("diff-white"), "-compose", "lighten", "-composite",
    "-alpha", "off", p("diffmask")]);
  magick([p("diffmask"), "-morphology", "Close", "Disk:2", "-alpha", "off", p("mask")]);
  magick([worn, "(", worn, "-alpha", "extract", p("mask"), "-compose", "multiply",
    "-composite", ")", "-compose", "copy_opacity", "-composite", p("placed")]);
  return p("placed");
}

function buildPose(id, pose, tmp, { install, fudge, margin }) {
  const canon = `${CANON_DIR}/mascot-${pose}.png`;
  const source = `${ART}/${id}.png`;
  const reference = `${ART}/${id}/${pose}.png`;
  const p = (s) => `${tmp}/${pose}-${s}.png`;
  const [w, h] = magick([canon, "-format", "%w %h", "info:"]).split(" ").map(Number);

  const eye = eyes(pose, tmp);
  const mask = eyeMask(pose, tmp, margin);
  const ref = layerBox(reference, pose);

  // Rotate to her head roll first, then measure: the bounding box of a rotated
  // sprite is not the rotation of its bounding box.
  magick([source, "-background", "none", "-rotate", eye.roll.toFixed(2),
    "-trim", "+repage", p("rot")]);
  const rot = layerBox(p("rot"), pose);
  const scale = (ref.w * fudge) / rot.w;
  const sw = Math.round(rot.w * scale);
  const sh = Math.round(rot.h * scale);
  magick([p("rot"), "-resize", `${sw}x${sh}!`, p("scaled")]);

  // Seat it where the approved reference sits, then raise it until her eye is
  // clear. Raising is free here in a way it is not for a baked composite: the
  // plume runs off the top of the frame, and this source still has the whole
  // feather, so what leaves the frame reads as a feather continuing past the
  // edge rather than a sawn-off stump.
  const nudge = NUDGE_X[id]?.[pose] ?? 0;
  const x = Math.round(ref.left + ref.w / 2 - sw / 2) + nudge;
  const baseY = ref.bottom - sh + 1;
  let lift = 0;
  let overlay = null;
  let over = 0;
  for (; lift <= 260; lift += 2) {
    magick(["-size", `${w}x${h}`, "xc:none", p("scaled"),
      "-geometry", `+${x}+${baseY - lift}`, "-composite", p("overlay")]);
    over = eyeOverlap(p("overlay"), mask);
    if (over === 0) break;
  }
  overlay = p("overlay");
  magick([canon, overlay, "-composite", p("worn")]);

  const plume = Math.max(0, -(baseY - lift));
  console.log(
    `${pose.padEnd(9)} roll=${eye.roll.toFixed(1).padStart(5)}deg  ` +
      `size=${sw}x${sh}  lifted ${String(lift).padStart(3)}px  ` +
      `eye_overlap=${over}${over > 0 ? " *** STILL CLIPPING ***" : ""}  ` +
      `plume ${plume}px past frame`,
  );

  if (install) {
    for (const dir of [`${WEB_OUT}/${id}`, `${MOBILE_OUT}/${id}`]) {
      mkdirSync(dir, { recursive: true });
      // Quantised on the way out: flat cel-shaded art, so 255 colours is
      // visually identical at a fraction of the weight, and this ships twice.
      for (const [from, name] of [
        [p("worn"), `mascot-${pose}.png`],
        [overlay, `overlay-${pose}.png`],
      ]) {
        magick([from, "-strip", "-colors", "255",
          "-define", "png:compression-level=9", `${dir}/${name}`]);
      }
    }
  }
  return p("worn");
}

function main() {
  const id = arg("id");
  if (!id) {
    console.error("usage: --id <accessoryId> [--install] [--extract] [--fudge n] [--margin n]");
    process.exit(1);
  }
  const fudge = Number(arg("fudge", "1"));
  const margin = Number(arg("margin", "10"));
  const tmp = `/tmp/mascot-acc/${id}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  if (has("extract")) {
    mkdirSync(`${ART}/${id}`, { recursive: true });
    for (const pose of POSES) {
      const placed = extractPlaced(id, pose, tmp);
      magick([placed, "-strip", "-define", "png:compression-level=9", `${ART}/${id}/${pose}.png`]);
      console.log(`extracted reference → ${ART}/${id}/${pose}.png`);
    }
  }
  for (const path of [`${ART}/${id}.png`, `${ART}/${id}/wave.png`]) {
    if (!existsSync(path)) {
      console.error(`missing input: ${path}`);
      process.exit(1);
    }
  }

  console.log(`\n${id}: eye margin ${margin}px, size ×${fudge}`);
  const worn = POSES.map((pose) => buildPose(id, pose, tmp, { install: has("install"), fudge, margin }));

  const tiles = worn.map((f, i) => {
    const out = `${tmp}/tile-${POSES[i]}.png`;
    magick([f, "-crop", "660x560+200+40", "+repage", "-background", "white", "-flatten",
      "-bordercolor", "#cccccc", "-border", "2", "-gravity", "south",
      "-background", "white", "-splice", "0x54", "-font", FONT, "-pointsize", "38",
      "-fill", "#111111", "-annotate", "+0+8", POSES[i], out]);
    return out;
  });
  const sheet = `${tmp}/${id}-faces.png`;
  magick(["montage", "-font", FONT, "-label", "", ...tiles, "-tile", "3x2",
    "-geometry", "330x+4+4", "-background", "#eeeeee", sheet]);
  console.log(`  review sheet → ${sheet}`);
  if (has("install")) console.log(`  installed → ${WEB_OUT}/${id}/ and ${MOBILE_OUT}/${id}/`);
}

main();
