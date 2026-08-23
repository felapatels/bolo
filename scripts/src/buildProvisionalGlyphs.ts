// Derive best-guess stroke data from the font outlines, for every script that
// nobody has traced yet.
//
// WHY THIS EXISTS, and what it costs. Requested 2026-08-23: keep tracing ON in
// all 22 languages rather than gating 21 of them off while contributions
// trickle in, and replace the guesses with real handwriting as it arrives.
//
// WHAT A FONT CAN AND CANNOT TELL YOU. The guide paths in chapters.ts are real
// shaped letterforms, and extractScriptTraceGuides.ts already emits their
// subpaths in logical cluster order, so the ORDER OF STROKES reads sensibly.
// What the font has no opinion about is where inside a stroke a hand starts and
// which way it travels: that comes from the contour winding. Devanagari's
// shirorekha is the plain case. A hand puts it on LAST; the font just has it as
// one more contour.
//
// So these glyphs are a plausible guess that is sometimes confidently wrong.
// Every one is marked `provisional: true`, scripts.ts layers real contributions
// OVER them, and buildAuthoredGlyphs.ts is what replaces them. Nothing here
// should ever outlive the arrival of a speaker's data for that script.
//
// Usage, from the repo root. Needs no database:
//
//   pnpm --filter @workspace/scripts exec tsx src/buildProvisionalGlyphs.ts --write

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONTRIBUTED_GLYPHS,
  PLAYABLE_GLYPH_FLOOR,
  SCRIPT_NAMES,
  alphabetForScript,
  cleanStroke,
  serializeAuthoredGlyph,
  type AuthoredGlyph,
  type AuthoredStroke,
  type ScriptId,
} from "@workspace/script-trace";

const OUT = resolve(
  import.meta.dirname,
  "../../lib/script-trace/src/provisional-strokes.ts",
);
const WRITE = process.argv.includes("--write");

/** Points sampled along each curve segment. Enough to keep a 0-100 box smooth
 *  without inflating a file that ships to a phone. */
const CURVE_SAMPLES = 8;

/**
 * Simplification tolerance for a GUESS, deliberately coarser than the 1.5 that
 * real handwriting gets.
 *
 * These strokes ship to a phone for eleven scripts at once even though a
 * learner only ever uses one, so the point count is a real cost. At 1.5 the
 * generated file is 602 KB; at 2.5 it is 493 KB and nothing about the pen demo
 * looks different, because the extra points were describing a font curve to a
 * precision no finger can be scored against. Real contributions keep the finer
 * tolerance: they are the data worth the bytes.
 */
const PROVISIONAL_EPSILON = 2.5;

const HEADER = `
/**
 * Best-guess stroke data derived from the FONT, GENERATED. Do not hand-edit.
 *
 * Regenerate with, from the repo root:
 *
 *   pnpm --filter @workspace/scripts exec tsx src/buildProvisionalGlyphs.ts --write
 *
 * NONE OF THIS WAS WRITTEN BY A PERSON. Every glyph here carries
 * \`provisional: true\`. The stroke ORDER is the font's cluster order, which
 * reads sensibly; the start point and direction WITHIN each stroke come from
 * the contour winding and are a guess. Devanagari's shirorekha is the plain
 * case: a hand puts it on last, and the font has no opinion.
 *
 * It exists so tracing can be offered in all 22 languages while contributions
 * are still coming in, rather than gating 21 of them off. scripts.ts layers
 * real contributed strokes OVER this, so a script the moment somebody traces
 * it stops using anything in this file.
 */
import type { AuthoredGlyph } from "./stroke-scoring";
import type { ScriptId } from "./scripts";

`;

type Pt = { x: number; y: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function quad(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const x = lerp(lerp(p0.x, p1.x, t), lerp(p1.x, p2.x, t), t);
  const y = lerp(lerp(p0.y, p1.y, t), lerp(p1.y, p2.y, t), t);
  return { x, y };
}

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const a = quad(p0, p1, p2, t);
  const b = quad(p1, p2, p3, t);
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/**
 * Split a guide path into one point list per SUBPATH.
 *
 * A subpath is a stroke: the generator starts each contour with M, so the M
 * boundaries are exactly the pen-lifts. This is why the app's own parseSvgPath
 * is not reused here, incidentally. That one flattens the WHOLE path into a
 * single 80-point list for scoring, which is right for scoring and destroys
 * the one thing this script needs.
 *
 * Only absolute M/L/Q/C appear, guaranteed by the generator's own contract.
 */
function subpaths(d: string): Pt[][] {
  const tokens = d.match(/[MLQC][^MLQCZ]*/gi) ?? [];
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  let at: Pt = { x: 0, y: 0 };

  for (const tok of tokens) {
    const cmd = tok[0].toUpperCase();
    const n = (tok.slice(1).match(/-?\d*\.?\d+/g) ?? []).map(Number);

    if (cmd === "M") {
      if (cur.length > 1) out.push(cur);
      at = { x: n[0], y: n[1] };
      cur = [at];
    } else if (cmd === "L") {
      for (let i = 0; i + 1 < n.length; i += 2) {
        at = { x: n[i], y: n[i + 1] };
        cur.push(at);
      }
    } else if (cmd === "Q") {
      for (let i = 0; i + 3 < n.length; i += 4) {
        const c = { x: n[i], y: n[i + 1] };
        const e = { x: n[i + 2], y: n[i + 3] };
        for (let s = 1; s <= CURVE_SAMPLES; s++) {
          cur.push(quad(at, c, e, s / CURVE_SAMPLES));
        }
        at = e;
      }
    } else if (cmd === "C") {
      for (let i = 0; i + 5 < n.length; i += 6) {
        const c1 = { x: n[i], y: n[i + 1] };
        const c2 = { x: n[i + 2], y: n[i + 3] };
        const e = { x: n[i + 4], y: n[i + 5] };
        for (let s = 1; s <= CURVE_SAMPLES; s++) {
          cur.push(cubic(at, c1, c2, e, s / CURVE_SAMPLES));
        }
        at = e;
      }
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

const scripts = Object.keys(SCRIPT_NAMES) as ScriptId[];
const out: Partial<Record<ScriptId, AuthoredGlyph[]>> = {};
let skipped = 0;

for (const script of scripts) {
  // A script somebody has actually traced to the floor needs no guesses at
  // all. Generating them anyway would put dead data in the bundle and invite
  // somebody to wire up the wrong layer later.
  const real = CONTRIBUTED_GLYPHS[script]?.length ?? 0;
  if (real >= PLAYABLE_GLYPH_FLOOR) {
    console.log(
      `${SCRIPT_NAMES[script].padEnd(13)} skipped, ${real} real glyph(s) already`,
    );
    skipped += 1;
    continue;
  }

  const glyphs: AuthoredGlyph[] = [];
  let noGuide = 0;
  for (const c of alphabetForScript(script)) {
    if (!c.guide) {
      noGuide += 1;
      continue;
    }
    const strokes: AuthoredStroke[] = [];
    for (const pts of subpaths(c.guide)) {
      const cleaned = cleanStroke(pts, PROVISIONAL_EPSILON);
      // Round to whole canvas units, which is what the wire format already
      // gives for real contributions ("gu_a:96,27;..."). Two reasons, and the
      // size one is the smaller: 0-100 integer precision is finer than any
      // finger, and matching the real data's precision means a provisional
      // glyph and a traced one are indistinguishable in shape to the scorer.
      // Left as floats this file was 602 KB of source shipped to a phone.
      if (cleaned) {
        strokes.push(cleaned.map((pt) => ({ x: Math.round(pt.x), y: Math.round(pt.y) })));
      }
    }
    if (!strokes.length) {
      noGuide += 1;
      continue;
    }
    glyphs.push({
      id: c.id,
      char: c.char,
      label: c.label,
      strokes,
      provisional: true,
    });
  }

  const ready = glyphs.length >= PLAYABLE_GLYPH_FLOOR;
  const avg = glyphs.length
    ? (glyphs.reduce((n, g) => n + g.strokes.length, 0) / glyphs.length).toFixed(1)
    : "0";
  console.log(
    `${SCRIPT_NAMES[script].padEnd(13)} ${String(glyphs.length).padStart(2)} glyph(s), ` +
      `${avg} strokes each  ${ready ? "PLAYABLE" : "BELOW FLOOR"}` +
      (noGuide ? `  (${noGuide} with no usable guide)` : ""),
  );
  if (glyphs.length) out[script] = glyphs;
}

const body = (Object.entries(out) as [ScriptId, AuthoredGlyph[]][])
  .map(
    ([script, glyphs]) =>
      `  // ${SCRIPT_NAMES[script]}: ${glyphs.length} letters, font-derived\n` +
      `  ${JSON.stringify(script)}: [\n` +
      glyphs.map((g) => serializeAuthoredGlyph(g, "    ")).join("\n") +
      `\n  ],`,
  )
  .join("\n");

const file = `${HEADER.trimStart()}export const PROVISIONAL_GLYPHS: Partial<Record<ScriptId, AuthoredGlyph[]>> = {
${body}
};
`;

const total = Object.values(out).reduce((n, g) => n + g.length, 0);
console.log(
  `\n${Object.keys(out).length} script(s), ${total} glyph(s), ` +
    `${(file.length / 1024).toFixed(0)} KB. ${skipped} script(s) skipped as already real.`,
);

if (!WRITE) {
  console.log("--write not given, so nothing was written.");
} else {
  writeFileSync(OUT, file);
  console.log(`Wrote ${OUT}`);
}
