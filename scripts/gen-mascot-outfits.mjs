#!/usr/bin/env node
// Dress Bolo in a garment WITHOUT redrawing her.
//
// CANONICAL MASCOT RULE (owner ruling): no new Bolo artwork, by any means. So a
// garment is never a repainted bird. It is one flat piece of cloth composited
// over the only part of her that is safe to cover — the teal belly — with every
// non-belly canonical pixel restacked on top afterwards. That last step is what
// keeps her wings in front of the cloth on the poses where a wing folds across
// her chest (all five, in fact), and her feet in front of the hem.
//
// Why colour-keying teal is safe here when colour-keying indigo was not: her
// crest and her wings are the SAME indigo, so indigo cannot separate head from
// wing. Teal is the body field, and the chin line below is measured per pose,
// so the mask cannot climb onto her (also teal) head.
//
// THE SLEEVE RULE (owner ruling, Aug 8 2026). Because her wings redraw in
// FRONT of the cloth, a sleeve can never wrap a wing — it can only appear
// beside one, which reads as a sleeve dangling off an empty arm. So above the
// hem line the cloth is clipped to her silhouette: at shoulder height the
// garment may only exist where Bolo is. Below that line it hangs free, which
// is what lets a skirt flare past her body. The practical consequence for
// stocking: drapes, tunics, wraps and vests work; sleeved outerwear (jackets,
// hoodies) does not, and no amount of tuning fixes it — the sleeve has nothing
// to wrap.
//
// Every number in the tables below was measured off the canonical PNGs once.
// Re-deriving them per run would be slower and less stable, and one of them
// (thumbsup's width) is a deliberate correction that measurement cannot make.
//
// Usage:
//   node scripts/gen-mascot-outfits.mjs --art attached_assets/generated_images/gar-kediyu-wide.png --id kediyu
//   ... --install     also write the five poses into the web and mobile asset dirs
//   ... --wfrac 0.99 --dy -12    tuning knobs (defaults are the approved ones)
//
// Review output (montage + per-pose PNGs) always lands in a temp dir, which is
// printed at the end. /tmp does not survive a session here, so anything worth
// keeping must be --install'ed or copied into attached_assets/.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, copyFileSync } from "node:fs";
import { basename } from "node:path";

const POSES = ["wave", "cheer", "thumbsup", "thinking", "tryagain"];

/** Bottom of Bolo's beak per pose: the mask must start below this or it eats
 *  her (teal) head. Measured, not guessed — wave sits 5px lower than the rest.
 *
 *  MEASURED ON THE 1024 SQUARE, which is no longer the canvas. Build 26 grew
 *  the frame to 1024x1200 by adding 176px of SKY ABOVE HER, so she moved down
 *  by 176 and these numbers did not follow: the belly mask started across her
 *  eyes and every garment shipped painted over her face. Build 27 found it by
 *  opening the placement tool and looking at a bird.
 *
 *  So they are OFFSET AT USE, by however much taller the canonical art is than
 *  the square it was measured on (chinOf below). That is deliberately derived
 *  from the art rather than written as 676: the next canvas change corrects
 *  itself, and this is the third thing that same 176 has broken. */
const CHIN_ON_SQUARE = { wave: 500, cheer: 495, thumbsup: 495, thinking: 495, tryagain: 495 };
const MEASURED_ON_H = 1024;
const chinOf = (pose, canvasH) => CHIN_ON_SQUARE[pose] + (canvasH - MEASURED_ON_H);

/** How wide to cut the cloth per pose. These track the measured teal belly
 *  EXCEPT thumbsup: there a wing folds across her chest and splits the visible
 *  teal down to 500px, so measurement would tailor one pose two sizes too
 *  small. The cloth is cut to the body that is there, not the body that shows —
 *  the wing redraws in front of it regardless. */
const WIDTH = { wave: 714, cheer: 722, thumbsup: 688, thinking: 646, tryagain: 731 };

/** Where the cloth hangs from, horizontally. These are the anchors of the
 *  APPROVED kediyu pass and they are pinned deliberately: the live centroid is
 *  a good estimator but it moves whenever the mask recipe changes by a hair,
 *  and re-deriving it would silently re-place art the owner has already signed
 *  off. `--live-centre` recomputes instead, for measuring a new pose set. */
const CX = { wave: 502, cheer: 476, thumbsup: 504, thinking: 508, tryagain: 506 };

// Her body colour, read off the canonical art's own histogram — NOT the brand
// teal, which is a different, darker hex and keys only a fifth of her.
const TEAL = "#0CA6A0";
const FUZZ = "22%";

const CANON_DIR = "artifacts/gujarati-coach/public/mascot";
const WEB_OUT = "artifacts/gujarati-coach/public/mascot/outfits";
const MOBILE_OUT = "artifacts/bolo-mobile/assets/images/mascot/outfits";
// Where the canonical poses live. The shared `front-<pose>.png` layer belongs
// here and not under an outfit, because it is hers and not any garment's.
const CANON_WEB_OUT = "artifacts/gujarati-coach/public/mascot";
const CANON_MOBILE_OUT = "artifacts/bolo-mobile/assets/images/mascot";
// The Repl's Linux font, with the Mac's Arial as the fallback so review
// sheets render on both machines (build 25).
import { existsSync as fontExists } from "node:fs";
const FONT = fontExists("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
  ? "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
  : "/System/Library/Fonts/Supplemental/Arial.ttf";

/**
 * The shipped set, and exactly how each piece was cut. This is the record of
 * which source art and which knobs produced the art now in the asset dirs —
 * without it, regenerating one garment means guessing the parameters back.
 *
 * `squash` forces the cloth's height to a multiple of the belly height. Most
 * generated garments come out portrait (a real garment is taller than wide);
 * Bolo is a squat round bird, so all but the kediyu — whose art was already
 * re-cut wide at source — get squashed to her proportions.
 */
// Source art lives in the repo (scripts/mascot-garment-art/), NOT in
// attached_assets/ — that whole directory is gitignored, so art left there is
// gone the moment anyone clones or the workspace is reset, and this table would
// point at nothing. Every id below regenerates byte-for-byte from a fresh
// checkout.
const ART = "scripts/mascot-garment-art";
// THE RECIPES LIVE IN THE MANIFEST NOW (build 25): scripts/wardrobe/
// manifest.json is the single source, read here so `--all` and the wardrobe
// command cannot disagree. The per-item commentary that used to sit in an
// ITEMS table here (the anarkali's interior gaps, the kurta's three tapers,
// the sherwani's low cuffs, the rejected closed-front alternates and the
// rejected Western set) moved to the manifest and git history; the knobs
// are each item's `recipe`.
import { readFileSync } from "node:fs";
const MANIFEST = JSON.parse(readFileSync("scripts/wardrobe/manifest.json", "utf8"));
const ITEMS = MANIFEST.items
  .filter((i) => i.kind === "garment" && i.art)
  .map((i) => ({ id: i.id, art: i.art, ...(i.recipe ?? {}) }));
function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const has = (name) => process.argv.includes(`--${name}`);

function magick(args) {
  return execFileSync("magick", args, { encoding: "utf8", maxBuffer: 1 << 28 });
}

/** Horizontal centre of the belly's MASS. The bounding box is the wrong centre
 *  when a wing occludes one side of her (thumbsup, tryagain): the box jumps
 *  sideways, the centroid barely moves. */
function centroidX(maskPath) {
  const row = magick([maskPath, "-resize", "1024x1!", "-depth", "8", "txt:-"]);
  let num = 0;
  let den = 0;
  for (const line of row.split("\n")) {
    const m = line.match(/^(\d+),0: \((\d+)/);
    if (!m) continue;
    num += Number(m[1]) * Number(m[2]);
    den += Number(m[2]);
  }
  return den > 0 ? Math.round(num / den) : 512;
}

function dressPose(pose, { art, tmp, wfrac, dy, squash, freefrac, place }) {
  const canon = `${CANON_DIR}/mascot-${pose}.png`;
  const p = (suffix) => `${tmp}/${pose}-${suffix}.png`;

  const [w, h] = magick([canon, "-format", "%w %h", "info:"]).split(" ").map(Number);

  // Her whole silhouette, as a mask.
  magick([canon, "-alpha", "extract", "-alpha", "off", p("alpha")]);

  // Teal pixels anywhere (head included at this point). Keyed POSITIVELY: the
  // obvious `-transparent TEAL -alpha extract -negate` route also whitens the
  // transparent background, and the negate then mangles it into a speckle that
  // captures a fifth of her — which silently lets her body redraw over the
  // cloth and turns a dress into a bib.
  magick([canon, "-alpha", "off", "-fuzz", FUZZ, "-fill", "white", "-opaque", TEAL,
    "-fill", "black", "+opaque", "white", "-alpha", "off", p("keyed")]);
  magick([p("keyed"), p("alpha"), "-compose", "multiply", "-composite", "-alpha", "off", p("teal")]);

  // ... clipped to below the chin, which leaves the belly and only the belly.
  magick(["-size", `${w}x${h}`, "xc:black", "-fill", "white",
    "-draw", `rectangle 0,${chinOf(pose, h)} ${w - 1},${h - 1}`, "-alpha", "off", p("band")]);
  magick([p("teal"), p("band"), "-compose", "multiply", "-composite", "-alpha", "off", p("belly")]);

  const box = magick([p("belly"), "-fuzz", "5%", "-format", "%@", "info:"]);
  const [, bw, bh, bx, by] = box.match(/(\d+)x(\d+)\+(\d+)\+(\d+)/).map(Number);
  const live = centroidX(p("belly"));
  const cx = has("live-centre") ? live : CX[pose];

  // Cut the cloth and hang it off the chin line, UNLESS the placement tool has
  // been used on this pose. A dragged pose wins outright, exactly as it does
  // for accessories: the chin line, the belly centroid and the whole-item
  // knobs are what a garment gets for free, and the moment somebody drags it
  // they have said something more specific than any of them.
  const gw = place ? Math.round(place.w * w) : Math.round(wfrac * WIDTH[pose]);
  // STRETCH, from the tool's aspect slider, and only meaningful on a dragged
  // pose. A multiplier on height alone, because place.w already says how wide
  // the cloth is. Absent is 1, so every garment placed before the slider
  // existed bakes byte for byte as it did. `squash` is the older whole-item
  // version of the same idea and still owns the undragged path.
  const ar = place && Number.isFinite(place.ar) ? place.ar : 1;

  // TILT. Cloth used to have no rotation at all, so the placement tool hid its
  // turn control; the owner asked for it back, and a garment cut out of a
  // dressed render usually needs a few degrees to sit with a pose. ROTATE THEN
  // TRIM, byte for byte the order gen-mascot-accessories.mjs uses, because the
  // tool previews the rotated-and-trimmed box and the two must measure the
  // same thing. Untilted cloth never touches this branch, so every garment
  // placed before it existed bakes exactly as it did.
  let src = art;
  if (place && place.rot) {
    magick([art, "-background", "none", "-rotate", Number(place.rot).toFixed(2),
      "-trim", "+repage", p("rot")]);
    src = p("rot");
  }

  const artW = Number(magick([src, "-format", "%w", "info:"]));
  const artH = Number(magick([src, "-format", "%h", "info:"]));
  const resize = squash && !place
    ? ["-resize", `${gw}x${Math.round(squash * bh)}!`]
    : place && ar !== 1
      ? ["-resize", `${gw}x${Math.round(artH * (gw / artW) * ar)}!`]
      : ["-resize", `${gw}x`];
  magick([src, ...resize, p("garment")]);
  const gh = Number(magick([p("garment"), "-format", "%h", "info:"]));
  const gx = place ? Math.round(place.x * w) : Math.round(cx - gw / 2);
  const gy = place ? Math.round(place.y * h) : chinOf(pose, h) + dy;

  // THE SLEEVE RULE. Above the hem line the cloth may only exist where SHE is;
  // below it, it hangs free. Without this, any garment whose art has sleeves
  // leaves them floating in the gap beside a wing — cloth on an arm that is
  // not there. The clip is a silhouette OR a below-the-line band, so a skirt
  // still flares past her body while a shoulder cannot.
  const hemY = gy + Math.round(freefrac * gh);
  magick(["-size", `${w}x${h}`, "xc:black", "-fill", "white",
    "-draw", `rectangle 0,${hemY} ${w - 1},${h - 1}`, "-alpha", "off", p("hemband")]);
  magick([p("alpha"), p("hemband"), "-compose", "lighten", "-composite", "-alpha", "off", p("clip")]);
  magick(["-size", `${w}x${h}`, "xc:none", p("garment"), "-geometry", `+${gx}+${gy}`,
    "-composite", p("cloth")]);
  magick([p("cloth"), "(", p("cloth"), "-alpha", "extract", p("clip"),
    "-compose", "multiply", "-composite", ")", "-compose", "copy_opacity", "-composite", p("clothclip")]);
  magick([canon, p("clothclip"), "-composite", p("dressed")]);

  // WHAT GOES BACK ON TOP OF THE CLOTH: her head, and her wings. Nothing else.
  //
  // It used to be "everything that is not belly", which sounds equivalent and
  // is not. The belly mask is a colour key, so every teal pixel it MISSED — the
  // shaded rim all round her body — counted as not-belly and was redrawn over
  // the garment, along with her feet. The result was a sherwani with a teal
  // fringe along its hem and toes on top of the skirt. The owner, build 27:
  // "its getting sent to the back, i shouldn't see the lower half of bolo. the
  // outfit covers it."
  //
  // So the rule is positive rather than subtractive:
  //   above the chin   all of her (head, crest, beak, eyes)
  //   below the chin   her WINGS only
  //
  // WINGS ARE FOUND BY CHANNEL, NOT BY COLOUR. Keying her indigo cannot work:
  // the darkest wing shade is about as far from mid-indigo as her teal is, so
  // any fuzz wide enough to hold the wing also swallows the body. But her wings
  // are blue-DOMINANT (B well above G) and every other part of her is not —
  // teal body has B≈G, beak and feet are warm — so B minus G separates them
  // cleanly at any shade.
  //
  // Her feet leaving the front layer is the point, not a side effect: a long
  // garment now covers them, and a short one still shows them, because where
  // there is no cloth she is drawn from the canonical art underneath anyway.
  magick([canon, "-alpha", "off", "-channel", "B", "-separate", p("blue")]);
  magick([canon, "-alpha", "off", "-channel", "G", "-separate", p("green")]);
  magick([p("blue"), p("green"), "-compose", "minus_src", "-composite",
    "-threshold", "12%", p("wings")]);
  // above the chin  =  the band negated
  magick(["(", p("band"), "-negate", ")", p("wings"), "-compose", "lighten",
    "-composite", "-alpha", "off", p("frontmask")]);
  magick([p("alpha"), p("frontmask"), "-compose", "multiply",
    "-composite", "-alpha", "off", p("frontalpha")]);
  magick([canon, p("frontalpha"), "-compose", "copy_opacity", "-composite", p("front")]);
  magick([p("dressed"), p("front"), "-composite", p("final")]);

  console.log(
    `${pose.padEnd(9)} belly ${bw}x${bh}+${bx}+${by}  cx_mass=${live}${has("live-centre") ? "" : ` (pinned ${cx})`}  cloth ${gw}w @ +${gx}+${gy}`,
  );
  // THE STACKABLE PAIR (build 27), so Bolo can wear a top and a bottom at once.
  //
  // `final` is the whole bird with this garment baked into it, which is why two
  // garments could never be worn together: drawing one over the other hides the
  // first completely. These two layers are the same render taken apart, and
  // both were already being computed here and thrown away.
  //
  //   cloth  this garment's cloth alone, clipped, transparent everywhere else
  //   front  HER non-belly pixels (wings, beak, eyes, feet, tail), transparent
  //
  // `front` depends only on the pose, never on the garment, so every garment
  // produces an identical one and it installs once beside the canonical art.
  // That is also what keeps the sleeve rule true: her wings are in `front`, so
  // they redraw over every cloth layer no matter how many are worn.
  //
  // Runtime order is canon, bottom, top, front, then the head overlay.
  return { final: p("final"), cloth: p("clothclip"), front: p("front") };
}

function buildItem({ id, art, squash = null, wfrac, dy, freefrac, install }) {
  const tmp = `/tmp/mascot-dress/${id}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  // The generated art arrives with a transparent margin of its own; trim it so
  // the width we compute is the width of the cloth, not of the canvas.
  const trimmed = `${tmp}/art-trim.png`;
  magick([art, "-trim", "+repage", trimmed]);
  const dims = magick([trimmed, "-format", "%wx%h (w/h %[fx:w/h])", "info:"]);
  console.log(`\n${id}: ${basename(art)} trimmed to ${dims}${squash ? ` squash ${squash}` : ""}`);

  // PER-POSE PLACEMENT FROM THE TOOL, read off the manifest the same way the
  // whole-item knobs are. Absent for every garment nobody has dragged, which
  // is all of them until somebody opens `wardrobe place`.
  let PLACE = {};
  try {
    const m = JSON.parse(readFileSync("scripts/wardrobe/manifest.json", "utf8"));
    PLACE = m.items.find((i) => i.id === id)?.recipe?.place ?? {};
  } catch { /* no manifest is not a reason to refuse to render */ }

  const layers = POSES.map((pose) =>
    dressPose(pose, { art: trimmed, tmp, wfrac, dy, squash, freefrac, place: PLACE[pose] }),
  );
  const finals = layers.map((l) => l.final);

  // Labelled contact sheet. Never judge a pose set on wave alone.
  const tiles = finals.map((f, i) => {
    const out = `${tmp}/tile-${POSES[i]}.png`;
    magick([f, "-background", "white", "-flatten", "-bordercolor", "#cccccc", "-border", "2",
      "-gravity", "south", "-background", "white", "-splice", "0x64",
      "-font", FONT, "-pointsize", "44", "-fill", "#111111", "-annotate", "+0+10", POSES[i], out]);
    return out;
  });
  const sheet = `${tmp}/${id}-all5.png`;
  magick(["montage", "-font", FONT, "-label", "", ...tiles, "-tile", "5x1",
    "-geometry", "200x200+4+4", "-background", "#eeeeee", sheet]);

  if (install) {
    for (const dir of [`${WEB_OUT}/${id}`, `${MOBILE_OUT}/${id}`]) {
      mkdirSync(dir, { recursive: true });
      POSES.forEach((pose, i) => {
        // Quantise on the way out. These are flat cel-shaded images, so a
        // 256-colour palette is visually identical and roughly a tenth of the
        // weight — and this set is 45 files shipped twice, once to the web
        // public dir and once into the mobile bundle.
        magick([finals[i], "-strip", "-colors", "255", "-define", "png:compression-level=9",
          `${dir}/mascot-${pose}.png`]);
        // The stackable cloth layer, for wearing a top and a bottom together.
        // Shipped alongside the baked `mascot-` file rather than instead of it:
        // a whole-body piece still renders from one image, and a client that
        // has not been taught about layers keeps working.
        magick([layers[i].cloth, "-strip", "-colors", "255",
          "-define", "png:compression-level=9", `${dir}/cloth-${pose}.png`]);
      });
    }
    // Her wings, beak, eyes, feet and tail, which must redraw in FRONT of every
    // cloth layer. Identical for every garment because it is derived from the
    // canonical pose alone, so it lives with the canonical art and is written
    // once rather than copied into all eight item folders.
    for (const dir of [CANON_WEB_OUT, CANON_MOBILE_OUT]) {
      mkdirSync(dir, { recursive: true });
      POSES.forEach((pose, i) => {
        magick([layers[i].front, "-strip", "-colors", "255",
          "-define", "png:compression-level=9", `${dir}/front-${pose}.png`]);
      });
    }
    console.log(`  installed → ${WEB_OUT}/${id}/ and ${MOBILE_OUT}/${id}/ (+ cloth layers, + shared front)`);
  }
  console.log(`  review sheet → ${sheet}`);
  return sheet;
}

function main() {
  const wfrac = Number(arg("wfrac", "0.99"));
  const dy = Number(arg("dy", "-12"));
  // Where the cloth stops being clipped to her silhouette and starts hanging
  // free, as a fraction of the garment's own height. Raise it if a hem is
  // being eaten, lower it if a shoulder is floating.
  const freefrac = Number(arg("freefrac", "0.5"));
  const install = has("install");

  if (has("all")) {
    for (const item of ITEMS) {
      buildItem({ ...item, wfrac, dy, freefrac: item.freefrac ?? freefrac, install });
    }
    return;
  }

  const art = arg("art");
  const id = arg("id");
  if (!art || !id) {
    console.error("usage: --all | --art <garment.png> --id <outfitId>   [--install] [--wfrac 0.99] [--dy -12] [--squash n]");
    process.exit(1);
  }
  const squashArg = arg("squash");
  buildItem({
    id,
    art,
    squash: squashArg ? Number(squashArg) : null,
    wfrac,
    dy,
    freefrac,
    install,
  });
}

main();
