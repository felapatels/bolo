/**
 * What a traced character scored, said in the words the rest of the app uses.
 *
 * WHY THIS EXISTS. Tracing showed a learner one line: "Great trace!, 62%".
 * The voice lessons, for the same act of being marked, show a five-band ladder
 * with the achieved rung highlighted and a sentence explaining what went wrong.
 * Reported 2026-08-23: tracing should be marked the same way. Two features that
 * both score an attempt should not have two vocabularies for how it went.
 *
 * WHY IT IS HERE AND NOT IN THE PAGE. The web game and the phone game are
 * hand-maintained twins that already carry two copies of the scorer
 * (CLAUDE.md, "Reuse before you write"). Copy number three is not being written:
 * everything below is pure arithmetic over the numbers the scorer already
 * computes, so the phone can call it the day its tracing screen lands.
 */

/**
 * The same five rungs the pronunciation ladder uses, deliberately.
 *
 * Shared WORDS, separate THRESHOLDS, and the separation is the point. The
 * pronunciation ladder passes at 55 and calls 91 perfect; tracing passes at 40,
 * because interior coverage of a handwritten glyph is a harsher measure than
 * pronunciation similarity and a genuinely good trace of a 39-stroke Devanagari
 * conjunct rarely clears 85. Running trace scores through bandFromScore would
 * have marked almost every honest trace "Try again".
 */
export type TraceBand = "perfect" | "great" | "good" | "almost" | "retry";

/** Score at or above this passes, matching the game's PASS_THRESHOLD. */
export const TRACE_PASS_SCORE = 40;

/**
 * Band thresholds, anchored on the pass mark.
 *
 * `almost` is the lowest PASSING band, exactly as it is for pronunciation
 * (isHalfCreditBand), so the pass mark and the bottom of `almost` are the same
 * number by construction rather than by coincidence.
 */
export function traceBandFromScore(score: number): TraceBand {
  if (score >= 85) return "perfect";
  if (score >= 70) return "great";
  if (score >= 55) return "good";
  if (score >= TRACE_PASS_SCORE) return "almost";
  return "retry";
}

/**
 * The three things the scorer measures, each 0 to 1.
 *
 * Already computed on every trace and, until now, multiplied together and
 * thrown away. Keeping them is what makes an explanation possible without
 * inventing one: the card can say which of the three cost the marks.
 */
export type TraceBreakdown = {
  /** How much of the letter was reached. Low means bits were left untraced. */
  coverage: number;
  /** How much of the drawn ink landed on the letter. Low means straying. */
  precision: number;
  /** How much of the letter's box the ink spans. Low means a tap or a scribble. */
  spread: number;
};

/**
 * One sentence naming what actually cost the marks.
 *
 * Names the WORST of the three, because that is the one thing worth changing on
 * the next attempt. Saying all three at once is how feedback becomes wallpaper.
 */
export function traceFeedback(score: number, parts: TraceBreakdown): string {
  const { coverage, precision, spread } = parts;

  // "Nothing landed" is decided on the FACTORS, never on the score. The score
  // is the three multiplied together, so a tap that lands squarely on the glyph
  // also comes out 0 once spread crushes it, and telling that learner nothing
  // landed when their pen was on the letter is simply false. Caught 2026-08-23
  // by the tap test, which is the case this branch exists to describe.
  if (coverage <= 0 && precision <= 0) {
    return "Nothing landed on the letter yet. Trace along the grey shape.";
  }

  const worst = Math.min(coverage, precision, spread);

  // A tap or a tiny scribble first: it is the most misleading failure, because
  // sitting still on a busy part of a glyph can otherwise score respectably.
  if (spread <= worst && spread < 0.8) {
    return "Too small. Draw the letter right across the box, the way the guide does.";
  }
  if (precision <= worst && precision < 0.8) {
    return "Some of your line went outside the letter. Keep the pen on the grey shape.";
  }
  if (coverage <= worst && coverage < 0.8) {
    return "Part of the letter was left untraced. Follow it all the way to the end.";
  }
  if (score >= 85) return "Clean lines, right across the letter.";
  return "Close. Follow the grey shape a little more tightly.";
}

/**
 * The headline over the ladder, in the app's own register.
 *
 * The same slang the practice screen uses for the same rungs, so a learner who
 * has seen "Goated" on a phrase reads it the same way on a letter. Kept
 * separate from the band LABEL for the reason practice.tsx documents: the
 * ladder keeps saying Perfect/Great/Good/Almost/Try again underneath.
 */
export function traceHeadline(band: TraceBand): string {
  switch (band) {
    case "perfect":
      return "Peak 🗿";
    case "great":
      return "Goated 🐐";
    case "good":
      return "Fire 🔥";
    case "almost":
      return "Valid 👍";
    case "retry":
      return "Mid 😐";
  }
}
