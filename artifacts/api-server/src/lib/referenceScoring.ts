import { compareToReferences, scoreFromDistance } from "./pronunciationCompare";

/**
 * SCORED BY HEARING IT BACK, FOR THE LANGUAGES THE RECOGNISER CANNOT HEAR.
 *
 * Owner, 2026-09-14, on the eight languages marked speech 'unsupported': "I
 * don't buy the unscorable of the 8 languages. How come we can't score based
 * on hearing the word back?", then "enable BODO with the temporary method until
 * i can find the speakers", then "we need a temporary scoring mechanism for the
 * other 7 until i can find native speakers".
 *
 * THE METHOD. A take is compared, by pronunciationCompare.ts, with the
 * reference audio of EVERY phrase in its lesson, and the verdict is closed-set:
 * did the take land nearest the phrase it was meant to be, and clearly nearer
 * than the next one? That is the question Last Call ("board the passenger
 * whose line you said") and Answer Back ("which card did you say") actually
 * ask, and it is a far easier one than grading a single clip on an absolute
 * scale, which pronunciationCompare.ts says in so many words is not calibrated.
 *
 * THE REFERENCE IS TEMPORARY, AND THAT IS THE WHOLE CAVEAT. Until a native
 * speaker records the lessons it is the app's own phrase audio, a synthetic
 * voice that does not know these languages (Manipuri is voiced with Bengali
 * settings). So a pass means "you repeated the line you heard", never "a
 * grandmother would accept that". The clients show these languages the
 * one-time "feedback may be approximate" notice, which is the truth.
 *
 * WHAT IT CANNOT HEAR: TONE. MFCCs describe spectral shape, and the vocal tract
 * warp search deliberately normalises the speaker's pitch so a child matches an
 * adult. A wrong tone on the right syllables passes. Every one of the eight is
 * tonal. A pitch contour check (speechPitch.ts exists) is the later layer.
 *
 * NOT A GATE. These languages keep their stops open (speechCapability.ts
 * gatesOnScore): a learner who reached stop nine while nothing was scored must
 * not find it locked behind a measurement this approximate.
 *
 * EVERY NUMBER BELOW IS UNCALIBRATED, AND THE NATIVE NUMBERS DO NOT TRANSFER.
 * The 29-clip native Bodo measurement (same word 4 to 14 apart, a different
 * word never closer than 22.8) was one speaker against herself. Measured
 * 2026-09-14 across two SYNTHETIC voices reading one Bodo lesson of ten lines,
 * the right line sat 19.9 to 31.3 away and the wrong ones 27 to 54: every
 * distance is far larger, so an absolute cut at the native scale's zero (26)
 * failed five of ten correct takes. What held is the ORDER: the nearest line
 * was the right one in 9 of 10. That is why the verdict below leans on rank
 * and margin and uses absolute distance only to reject a take far from every
 * line. A human against a synthetic voice has not been measured at all.
 */

/** Languages scored this way. India: Bodo and Manipuri. East ports its six. */
export const REFERENCE_SCORED_LANGUAGES: ReadonlySet<string> = new Set(["brx", "mni"]);

export function isReferenceScored(languageCode: string | null | undefined): boolean {
  return !!languageCode && REFERENCE_SCORED_LANGUAGES.has(languageCode);
}

/**
 * The nearest reference must beat the runner-up by this factor to count as a
 * clear match. 1.15 means 15% nearer. Below it the take sat between two lines.
 */
export const CLEAR_MATCH_RATIO = 1.15;

/** A clear match is full credit however far the synthetic reference sits: the question was "which line", and it was answered. */
export const CLEAR_MATCH_FLOOR = 80;

/** A match that is not clear is half credit at most. */
export const UNCLEAR_MATCH_CEILING = 79;
export const UNCLEAR_MATCH_FLOOR = 55;

/** Nearer a different phrase: never above the retry band's ceiling. */
export const OTHER_PHRASE_CEILING = 54;

/**
 * A take this far from its own line is not that line, whatever the ranking
 * says. Set above the worst CORRECT cross-voice distance measured (31.3, see
 * the note above) with room for a human against a synthetic voice, and below
 * the far wrong-line distances (up to 54), where noise and unrelated speech sit.
 */
export const FAR_FROM_EVERY_LINE = 36;

export interface ReferenceClip {
  phraseId: number;
  /** 16-bit PCM WAV. */
  wav: Buffer;
}

export type ReferenceOutcome =
  /** Nothing measurable: a silent take, or no usable reference for the target. */
  | "unmeasurable"
  /** Nearest the target, clearly. */
  | "matched"
  /** Nearest the target, but a neighbour was nearly as near. */
  | "unclear"
  /** Nearer another phrase in the lesson than the target. */
  | "other_phrase";

export interface ReferenceVerdict {
  outcome: ReferenceOutcome;
  /** 0 to 100, mapped onto the five bands by the caller's bandFromScore. */
  score: number;
  /** The phrase the take sat nearest, or null when unmeasurable. */
  nearestPhraseId: number | null;
  targetDistance: number | null;
  runnerUpDistance: number | null;
}

/**
 * The closed-set verdict. Pure: the caller decodes the take and loads the
 * references, which is what keeps this testable with synthetic audio.
 */
export function judgeTakeAgainstReferences(
  attemptWav: Buffer,
  targetPhraseId: number,
  references: readonly ReferenceClip[],
): ReferenceVerdict {
  const unmeasurable: ReferenceVerdict = {
    outcome: "unmeasurable",
    score: 0,
    nearestPhraseId: null,
    targetDistance: null,
    runnerUpDistance: null,
  };
  const results = compareToReferences(attemptWav, references.map((r) => r.wav));
  const measured = references
    .map((r, i) => ({ phraseId: r.phraseId, distance: results[i]?.distance }))
    .filter((m): m is { phraseId: number; distance: number } => typeof m.distance === "number" && Number.isFinite(m.distance))
    .sort((a, b) => a.distance - b.distance);

  const target = measured.find((m) => m.phraseId === targetPhraseId);
  if (!target) return unmeasurable;

  const nearest = measured[0]!;
  const others = measured.filter((m) => m.phraseId !== targetPhraseId);
  const closestOther = others[0] ?? null;
  const absolute = scoreFromDistance(target.distance);

  // Too far from its own line to be it, whatever the ranking says (see
  // FAR_FROM_EVERY_LINE for why this is not the native scale's zero).
  if (target.distance >= FAR_FROM_EVERY_LINE) {
    return {
      outcome: "other_phrase",
      score: Math.min(absolute, OTHER_PHRASE_CEILING),
      nearestPhraseId: nearest.phraseId,
      targetDistance: target.distance,
      runnerUpDistance: closestOther?.distance ?? null,
    };
  }

  if (nearest.phraseId !== targetPhraseId) {
    return {
      outcome: "other_phrase",
      score: Math.min(absolute, OTHER_PHRASE_CEILING),
      nearestPhraseId: nearest.phraseId,
      targetDistance: target.distance,
      runnerUpDistance: closestOther?.distance ?? null,
    };
  }

  // ONE PHRASE, NO NEIGHBOURS (a phrase outside any lesson group). There is no
  // closed set to decide, so the uncalibrated absolute scale is all there is.
  if (!closestOther) {
    return {
      outcome: absolute >= CLEAR_MATCH_FLOOR ? "matched" : "unclear",
      score: absolute,
      nearestPhraseId: targetPhraseId,
      targetDistance: target.distance,
      runnerUpDistance: null,
    };
  }

  const clear = closestOther.distance >= target.distance * CLEAR_MATCH_RATIO;
  return clear
    ? {
        outcome: "matched",
        score: Math.max(absolute, CLEAR_MATCH_FLOOR),
        nearestPhraseId: targetPhraseId,
        targetDistance: target.distance,
        runnerUpDistance: closestOther.distance,
      }
    : {
        outcome: "unclear",
        score: Math.min(Math.max(absolute, UNCLEAR_MATCH_FLOOR), UNCLEAR_MATCH_CEILING),
        nearestPhraseId: targetPhraseId,
        targetDistance: target.distance,
        runnerUpDistance: closestOther.distance,
      };
}
