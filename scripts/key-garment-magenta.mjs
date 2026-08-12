#!/usr/bin/env node
// Key a flat #FF00FF background out of generated garment art, WITHOUT leaving a
// magenta fringe.
//
// WHY THIS EXISTS. `magick -fuzz N% -transparent magenta` is the obvious route
// and it is wrong in a way that only shows up after compositing. The art tool
// anti-aliases the cloth against the magenta backdrop, so the outermost 1-3px
// of every edge is a BLEND of cloth and #FF00FF. A fuzzy transparent pass makes
// the pure-magenta pixels vanish and leaves those blended ones opaque-ish and
// pink. The generator then trims, resizes and composites the piece onto Bolo,
// where that pink ring reads as a coloured halo tracing her shoulders and hem.
// Raising the fuzz does not fix it, because it eats real cloth before it eats the ramp.
//
// So this does three things instead:
//   1. ALPHA RAMP. Distance to the backdrop colour drives alpha continuously,
//      so the anti-aliased ramp becomes an alpha ramp rather than a colour one.
//   2. UNMIX. A partial pixel is P = a*F + (1-a)*B. Solve for F and store that,
//      so what is left under the partial alpha is the CLOTH colour, not the
//      blend. This is the step that removes the fringe rather than hiding it.
//   3. DESPECKLE. Backdrop noise a few units outside the key threshold survives
//      as isolated specks, and a speck is not a cosmetic problem here: the
//      generator's very first step is `-trim +repage`, so ONE stray pixel in a
//      corner drags the trim box out to meet it. The cut then carries a slab of
//      empty margin, and since the piece is placed by that box the garment ends
//      up off-centre and undersized on Bolo. Measured on the sherwani flat:
//      three stray pixels in the bottom-right corner padded the box by 178px of
//      empty column, visibly shifting the coat left. Components below a
//      minimum area are dropped.
//   4. BLEED. Fully transparent pixels keep a nearby cloth colour in RGB
//      instead of black or magenta, so no resampler anywhere downstream can
//      pull the backdrop back in at a reduced size.
//
// Usage:
//   node scripts/key-garment-magenta.mjs --in <src.png> --out <dst.png>
//                                        [--bg "#FF00FF"] [--t0 70] [--t1 150]
//                                        [--minblob 200]

import { execFileSync } from "node:child_process";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const inPath = arg("in");
const outPath = arg("out");
if (!inPath || !outPath) {
  console.error("usage: --in <src.png> --out <dst.png> [--bg '#FF00FF'] [--t0 70] [--t1 150]");
  process.exit(1);
}

const bgHex = arg("bg", "#FF00FF").replace("#", "");
const B = [0, 2, 4].map((i) => parseInt(bgHex.slice(i, i + 2), 16));
// Below t0 from the backdrop the pixel IS backdrop; above t1 it is pure cloth;
// between, it is the anti-aliased ramp and gets unmixed.
const T0 = Number(arg("t0", "70"));
const T1 = Number(arg("t1", "150"));
const FRINGE_DIST = 110;
// Smallest opaque blob that is allowed to be real cloth. Anything under this is
// backdrop noise, and noise that survives the key wrecks the generator's trim.
const MIN_BLOB = Number(arg("minblob", "200"));

const [W, H] = execFileSync("magick", [inPath, "-format", "%w %h", "info:"], { encoding: "utf8" })
  .split(" ")
  .map(Number);
const buf = execFileSync("magick", [inPath, "-depth", "8", "RGBA:-"], { maxBuffer: 1 << 28 });

const at = (x, y) => (y * W + x) * 4;
const distToBg = (i) => Math.hypot(buf[i] - B[0], buf[i + 1] - B[1], buf[i + 2] - B[2]);

// ---- audit the INPUT, so the before/after is honest -----------------------
let bgPixels = 0;
let rampPixels = 0;
for (let i = 0; i < buf.length; i += 4) {
  const d = distToBg(i);
  if (d < T0) bgPixels++;
  else if (d < T1) rampPixels++;
}

// ---- 1+2: alpha ramp and unmix -------------------------------------------
const out = Buffer.alloc(buf.length);
for (let i = 0; i < buf.length; i += 4) {
  const d = distToBg(i);
  if (d <= T0) {
    out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
    continue;
  }
  if (d >= T1) {
    out[i] = buf[i];
    out[i + 1] = buf[i + 1];
    out[i + 2] = buf[i + 2];
    out[i + 3] = buf[i + 3];
    continue;
  }
  const a = (d - T0) / (T1 - T0);
  for (let c = 0; c < 3; c++) {
    // F = (P - (1-a)*B) / a, clamped. At small `a` this amplifies noise, which
    // is exactly why the result is clamped rather than trusted blindly; the
    // de-fringe pass below is the backstop.
    out[i + c] = Math.max(0, Math.min(255, Math.round((buf[i + c] - (1 - a) * B[c]) / a)));
  }
  out[i + 3] = Math.round(a * 255);
}

// ---- measure the fringe that survived the unmix ---------------------------
/** Pixels that are still backdrop-coloured, carry alpha, and sit next to solid
 *  cloth, i.e. exactly the ring that would composite as a halo. */
function countFringe(b) {
  let n = 0;
  const bad = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = at(x, y);
      if (b[i + 3] === 0) continue;
      if (Math.hypot(b[i] - B[0], b[i + 1] - B[1], b[i + 2] - B[2]) > FRINGE_DIST) continue;
      let touchesCloth = false;
      for (let dy = -1; dy <= 1 && !touchesCloth; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (b[at(nx, ny) + 3] >= 250) {
            touchesCloth = true;
            break;
          }
        }
      }
      if (touchesCloth) {
        n++;
        if (bad.length < 2048) bad.push([x, y]);
      }
    }
  }
  return { n, bad };
}

const before = countFringe(out);

// ---- 3a: de-fringe. Any survivor takes the colour of the nearest solid,
// non-backdrop-coloured pixel. Colour only; its alpha is left alone, so the
// edge softness is preserved and only the hue is corrected.
const isCloth = (b, i) =>
  b[i + 3] >= 250 && Math.hypot(b[i] - B[0], b[i + 1] - B[1], b[i + 2] - B[2]) > FRINGE_DIST;
let repaired = 0;
for (const [x, y] of before.bad) {
  let found = null;
  for (let r = 1; r <= 6 && !found; r++) {
    for (let dy = -r; dy <= r && !found; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = at(nx, ny);
        if (isCloth(out, j)) {
          found = [out[j], out[j + 1], out[j + 2]];
          break;
        }
      }
    }
  }
  if (!found) continue;
  const i = at(x, y);
  out[i] = found[0];
  out[i + 1] = found[1];
  out[i + 2] = found[2];
  repaired++;
}

const after = countFringe(out);

// ---- 3: despeckle. Drop opaque blobs too small to be cloth ----------------
// This is the step that protects the generator's `-trim`: a single surviving
// speck in a corner stretches the trim box to reach it, and the piece is then
// placed and scaled by that inflated box.
const seen = new Uint8Array(W * H);
const blobs = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const s = y * W + x;
    // Any alpha at all, not just a visible amount: `-trim` reacts to a pixel
    // that is one unit off transparent exactly as it does to solid cloth.
    if (seen[s] || out[s * 4 + 3] === 0) continue;
    // Iterative flood fill; a recursive one blows the stack on the main piece.
    const stack = [s];
    const cells = [];
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop();
      cells.push(c);
      const cx = c % W;
      const cy = (c - cx) / W;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (seen[n] || out[n * 4 + 3] <= 16) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    blobs.push(cells);
  }
}
let specks = 0;
let speckPx = 0;
for (const cells of blobs) {
  if (cells.length >= MIN_BLOB) continue;
  specks++;
  speckPx += cells.length;
  for (const c of cells) {
    const i = c * 4;
    out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
  }
}
const kept = blobs.filter((c) => c.length >= MIN_BLOB).length;

// ---- 4: bleed cloth colour outward into the transparent margin ------------
// A fully transparent pixel still has RGB, and any downstream resample that is
// not alpha-aware will mix it in. Left as the raw backdrop it would reintroduce
// the halo at a smaller size; left as black it would draw a dark outline.
const BLEED = 6;
let bled = 0;
for (let pass = 0; pass < BLEED; pass++) {
  const snapshot = Buffer.from(out);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = at(x, y);
      if (snapshot[i + 3] !== 0) continue;
      let r = 0;
      let g = 0;
      let b2 = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = at(nx, ny);
          // Only borrow from a pixel that already has a real colour: either
          // cloth, or a transparent pixel an earlier pass already filled.
          if (snapshot[j + 3] === 0 && !(snapshot[j] || snapshot[j + 1] || snapshot[j + 2])) continue;
          r += snapshot[j];
          g += snapshot[j + 1];
          b2 += snapshot[j + 2];
          n++;
        }
      }
      if (!n) continue;
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b2 / n);
      out[i + 3] = 0;
      bled++;
    }
  }
}

// ---- 5: emit tight-cropped to the cloth -----------------------------------
// The generator's first act is `-trim +repage`, so the margin is thrown away
// regardless, but only if `-trim` agrees with us about where the cloth ends.
// It does not: it reacts to a single unit of alpha and to the bled RGB under
// transparent pixels, so it can hand back a box far wider than the garment and
// then place the piece by that box. Cropping here makes the trim a no-op and
// the placement exact.
let x0 = W;
let y0 = H;
let x1 = -1;
let y1 = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (out[at(x, y) + 3] === 0) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
}
// Keep the bleed ring, symmetrically, so the crop cannot shave a soft edge.
x0 = Math.max(0, x0 - BLEED);
y0 = Math.max(0, y0 - BLEED);
x1 = Math.min(W - 1, x1 + BLEED);
y1 = Math.min(H - 1, y1 + BLEED);
const CW = x1 - x0 + 1;
const CH = y1 - y0 + 1;
const cropped = Buffer.alloc(CW * CH * 4);
for (let y = 0; y < CH; y++) {
  out.copy(cropped, y * CW * 4, at(x0, y0 + y), at(x0, y0 + y) + CW * 4);
}

execFileSync("magick", ["-size", `${CW}x${CH}`, "-depth", "8", "RGBA:-", "PNG32:" + outPath], {
  input: cropped,
  maxBuffer: 1 << 28,
});

const opaque = (() => {
  let n = 0;
  for (let i = 3; i < out.length; i += 4) if (out[i] >= 250) n++;
  return n;
})();

console.log(`in    ${inPath} ${W}x${H}`);
console.log(`bg    ${arg("bg", "#FF00FF")}  keyed ${bgPixels}px fully out, ${rampPixels}px anti-aliased ramp unmixed`);
console.log(`fringe surviving magenta-ish px: ${after.n}${repaired ? ` (${repaired} repaired)` : ""}`);
console.log(`speck  dropped ${specks} blob(s) under ${MIN_BLOB}px totalling ${speckPx}px; kept ${kept} cloth blob(s)`);
console.log(`bleed  ${bled}px of transparent margin given a cloth colour (${BLEED} passes)`);
console.log(`crop   cloth bbox +${x0}+${y0} → ${CW}x${CH} (was ${W}x${H})`);
console.log(`opaque ${opaque}px  → ${outPath}`);
