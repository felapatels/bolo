/**
 * Render the writing demo's pen path to a sheet you can look at.
 *
 * WHY THIS EXISTS. Two store builds shipped with the demo visibly wrong: first
 * it played four to nine disconnected fragments per letter, then it replayed
 * the raw recording with every captured corner in it. Both were obvious in a
 * picture and invisible in a green test suite, and both cost a build and a
 * TestFlight round trip to find out. This is the picture, in ten seconds, with
 * no build.
 *
 * Run it before any change to pen-strokes.ts, contributed-strokes.ts, or the
 * skeleton extractor:
 *
 *   pnpm --filter @workspace/scripts exec tsx src/previewWritingDemo.ts
 *   pnpm --filter @workspace/scripts exec tsx src/previewWritingDemo.ts hi 12
 *
 * It writes an HTML file and prints the path. Open it. Every letter should be
 * one flowing line per stroke, sitting on the grey glyph, starting at the dot.
 *
 * WHAT IT CANNOT TELL YOU: whether the animation RUNS on a device. Timing, the
 * frame loop and anything native are outside this, and CLAUDE.md's measurement
 * rules still apply there (a dev build can never clear an animation bug). This
 * checks the geometry, which is what has actually been wrong both times.
 *
 * IT ALSO COVERS HAND-TRACED SCRIPTS ONLY, and not because that is the right
 * boundary. The skeleton extractor that draws every other script lives inside
 * the web PAGE (and a second copy inside the phone's), so this workspace cannot
 * import it. Moving it into lib/script-trace would let this cover all twelve and
 * would kill a duplication CLAUDE.md already complains about. Worth doing.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SCRIPT_TRACE_CHAPTERS,
  LANG_CHAPTER_IDS,
  handPenStrokes,
  hasHandPenStrokes,
  type StrokePoint,
} from "@workspace/script-trace";

const lang = process.argv[2] ?? "gu";
const limit = Number(process.argv[3] ?? 12);
const OUT = resolve(process.cwd(), `writing-demo-${lang}.html`);

const STROKE_COLORS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#008080"];

function polyline(s: readonly StrokePoint[]): string {
  return s.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

function svg(strokes: StrokePoint[][], guide: string): string {
  const paths = strokes
    .map((s, i) => {
      const color = STROKE_COLORS[i % STROKE_COLORS.length];
      return (
        `<polyline points="${polyline(s)}" fill="none" stroke="${color}" ` +
        `stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
        // The start dot, which is what the game draws to say "begin here".
        `<circle cx="${s[0]!.x.toFixed(1)}" cy="${s[0]!.y.toFixed(1)}" r="2.4" fill="${color}"/>` +
        `<text x="${s[0]!.x.toFixed(1)}" y="${(s[0]!.y - 4).toFixed(1)}" font-size="7" ` +
        `font-weight="bold" fill="${color}" text-anchor="middle">${i + 1}</text>`
      );
    })
    .join("");
  return `<svg viewBox="0 0 100 100" width="190" height="190"><path d="${guide}" fill="#e3e7ec"/>${paths}</svg>`;
}

function main(): void {
  if (!hasHandPenStrokes(lang)) {
    console.log(
      `${lang} has no hand-traced strokes, so the demo is correctly HIDDEN for it.\n` +
        `Nothing to preview. Try a language whose script somebody has traced.`,
    );
    return;
  }

  const ids = new Set(LANG_CHAPTER_IDS[lang] ?? []);
  const chars = SCRIPT_TRACE_CHAPTERS.filter(
    (c) => ids.has(c.id) && c.stage === "alphabet",
  )
    .flatMap((c) => c.characters)
    .filter((c) => c.guide)
    .slice(0, limit);

  let missing = 0;
  const cells = chars
    .map((c) => {
      const strokes = handPenStrokes(lang, c.id);
      if (!strokes) {
        missing++;
        return (
          `<div class="cell miss"><div class="hd">${c.char}<span>${c.id}</span></div>` +
          `<p>no hand data, the demo is hidden for this character</p></div>`
        );
      }
      const points = strokes.reduce((n, s) => n + s.length, 0);
      return (
        `<div class="cell"><div class="hd">${c.char}` +
        `<span>${c.id} &middot; ${strokes.length} stroke(s) &middot; ${points} pts drawn</span></div>` +
        svg(strokes, c.guide) +
        `</div>`
      );
    })
    .join("");

  writeFileSync(
    OUT,
    `<html><body style="background:#fff;font-family:system-ui;margin:16px">
<h2 style="margin:0 0 4px">Writing demo &mdash; ${lang}</h2>
<p style="margin:0 0 14px;color:#556;font-size:13px">
One flowing line per stroke, sitting on the grey glyph, numbered in the order the pen moves.
Corners, stray flicks or a line off the shape mean the pen path is wrong.</p>
<div style="display:flex;flex-wrap:wrap;gap:12px">${cells}</div>
<style>.cell{border:1px solid #ccd;border-radius:8px;padding:8px}
.cell.miss{color:#a33;font-size:12px;max-width:190px}
.hd{font-size:22px}.hd span{display:block;font-size:10px;color:#889}</style>
</body></html>`,
  );

  console.log(`${chars.length} character(s) from ${lang}, ${missing} without hand data.`);
  console.log(`Wrote ${OUT}`);
  console.log(`Open it before you spend a build.`);
}

main();
