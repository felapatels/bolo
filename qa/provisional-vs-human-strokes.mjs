// HOW WRONG IS THE FONT'S GUESS AT STROKE ORDER?
//
// WHY THIS EXISTS (build 29). The owner wants strict, order-aware scoring on
// Script Trace in every script: "there has to be more gates to ensure they are
// actually writing it in the order of the example." Stroke data exists for all
// 22, but 389 of those 482 glyphs are DERIVED FROM THE FONT and the generator's
// own header says the start point and direction within each stroke are a guess.
//
// Scoring strictly against a wrong reference is worse than scoring loosely: a
// learner who writes the letter correctly gets marked down, and the app teaches
// the error. So the question is not an opinion, it is a measurement.
//
// THE NATURAL EXPERIMENT. Devanagari and Gujarati have BOTH: font-guessed
// strokes AND strokes authored by real people, for the same glyphs. Comparing
// the two says exactly how often the font agrees with a hand, and that number
// is what the other 20 scripts are riding on.
//
//   pnpm --filter @workspace/script-trace exec tsx ../../qa/provisional-vs-human-strokes.mjs
//   (or) npx tsx qa/provisional-vs-human-strokes.mjs
import { PROVISIONAL_GLYPHS, CONTRIBUTED_GLYPHS, compareStroke } from "../lib/script-trace/src/index.ts";

// Same threshold the scorer uses to call two strokes "the same shape".
const SHAPE_TOLERANCE = 12;

function report(scriptId) {
  const prov = PROVISIONAL_GLYPHS[scriptId] ?? [];
  const human = CONTRIBUTED_GLYPHS[scriptId] ?? [];
  const byChar = new Map(prov.map((g) => [g.char, g]));

  let compared = 0;
  let countMismatch = 0;
  let orderWrong = 0;
  let directionWrong = 0;
  let shapeUnmatched = 0;
  const examples = [];

  for (const h of human) {
    const p = byChar.get(h.char);
    if (!p) continue;
    compared++;

    if (p.strokes.length !== h.strokes.length) {
      countMismatch++;
      examples.push(`${h.char} ${h.label}: font says ${p.strokes.length} strokes, a hand drew ${h.strokes.length}`);
      continue;
    }

    let thisOrder = false, thisDir = false, thisShape = false;
    for (let i = 0; i < h.strokes.length; i++) {
      // Does the font's i-th stroke match the hand's i-th stroke?
      const atPosition = compareStroke(h.strokes[i], p.strokes[i]);
      if (atPosition.distance <= SHAPE_TOLERANCE) {
        if (atPosition.reversed) thisDir = true;
        continue;
      }
      // Not in that slot. Is it anywhere else in the font's set?
      const found = p.strokes.some((ps) => compareStroke(h.strokes[i], ps).distance <= SHAPE_TOLERANCE);
      if (found) thisOrder = true;
      else thisShape = true;
    }
    if (thisOrder) { orderWrong++; examples.push(`${h.char} ${h.label}: right strokes, WRONG ORDER`); }
    if (thisDir) { directionWrong++; if (!thisOrder) examples.push(`${h.char} ${h.label}: a stroke runs BACKWARDS`); }
    if (thisShape) { shapeUnmatched++; if (!thisOrder) examples.push(`${h.char} ${h.label}: a stroke has no counterpart at all`); }
  }

  const bad = countMismatch + orderWrong + directionWrong + shapeUnmatched;
  console.log(`\n=== ${scriptId} ===`);
  console.log(`glyphs with both a human and a font version: ${compared}`);
  console.log(`  stroke COUNT disagrees:      ${countMismatch}`);
  console.log(`  right strokes, WRONG ORDER:  ${orderWrong}`);
  console.log(`  a stroke runs BACKWARDS:     ${directionWrong}`);
  console.log(`  a stroke has no counterpart: ${shapeUnmatched}`);
  const pct = compared ? Math.round((100 * (compared - bad)) / compared) : 0;
  console.log(`  --> the font would grade ${compared - bad} of ${compared} the same as a hand (${pct}%)`);
  if (examples.length) {
    console.log("  examples:");
    for (const e of examples.slice(0, 10)) console.log(`    ${e}`);
  }
  return { compared, bad };
}

let total = 0, totalBad = 0;
for (const s of ["devanagari", "gujarati"]) {
  const r = report(s);
  total += r.compared; totalBad += r.bad;
}
console.log(`\n=================================================`);
console.log(`OVERALL: the font's guess disagrees with a human hand on ${totalBad} of ${total} glyphs.`);
console.log(`That is the error rate the other 20 scripts would be graded against.`);
