import { bandFromScore, type PronunciationBand } from "./scoreBands";

/**
 * COMBINING THE TWO SCORERS, WHICH FAIL IN OPPOSITE DIRECTIONS.
 *
 * Bolo now has two ways to judge an attempt and they see different things:
 *
 *   TRANSCRIPT RUBRIC (routes/openai.ts). Speech to text, then an LLM compares
 *   the transcript to the target. It answers "did they say the right WORD".
 *   Needs working recognition, so it is silent for Bodo and Manipuri. It is
 *   blind to aspiration by its own instruction, and blind to vowel length and
 *   retroflex-versus-dental in practice, because the transcript is spelling.
 *
 *   REFERENCE COMPARISON (pronunciationCompare.ts). Aligns the audio against a
 *   native clip of the same phrase. It answers "did it SOUND right". Works in
 *   any language including the ones recognition cannot hear, and knows nothing
 *   about meaning.
 *
 * THEIR ERRORS POINT OPPOSITE WAYS AND THAT IS THE WHOLE VALUE.
 *
 *   The transcript rubric is GENEROUS. Recognition snaps a near miss to the
 *   nearest real word, so the error is gone before the rubric ever sees it.
 *   That is precisely why a dental substituted for a retroflex scores full
 *   marks today.
 *
 *   The reference comparison is HARSH. Every acoustic difference counts,
 *   including the ones that are not mistakes: a different microphone, a cold, a
 *   room. Vocal tract normalisation removes the biggest of those and not all.
 *
 * SO DO NOT AVERAGE THEM. An average of a generous number and a harsh one is a
 * number that means nothing. The order matters instead: the transcript decides
 * WHETHER THE RIGHT WORD WAS SAID, and only once that is settled does the
 * acoustic comparison have anything to say. Comparing the sound of a completely
 * different word against the reference measures nothing.
 *
 * AND WHERE THEY DISAGREE IS THE MOST INFORMATIVE CASE OF ALL. A high
 * transcript score beside a poor acoustic match is the signature of recognition
 * having snapped: a real word came out, but not this one. That combination is
 * the only handle this system currently has on sub-phonemic error, so it is
 * reported rather than smoothed away.
 */

/** Which scorers had anything to say, and whether they agreed. */
export type FusionAgreement =
  | "transcript_only"
  | "acoustic_only"
  | "agree"
  | "transcript_generous"
  | "acoustic_generous";

export interface FusedScore {
  score: number;
  band: PronunciationBand;
  agreement: FusionAgreement;
  transcriptScore: number | null;
  acousticScore: number | null;
}

/**
 * A transcript at or above this with an acoustic score well below it is the
 * snapped-to-the-nearest-word signature. Set at the frozen full-credit edge
 * because that is where the app already says "they nailed it".
 */
const TRANSCRIPT_CONFIDENT = 80;
/** How far below the transcript the acoustic score must sit to count as disagreement. */
const DISAGREEMENT_GAP = 25;
/**
 * How much of the gap is taken off when the two disagree.
 *
 * UNCALIBRATED, AND SET LOW ON PURPOSE. Half would let an acoustic mismatch
 * caused by a head cold cost a learner two whole bands. The right value comes
 * from real attempts rated by a speaker, and until that exists this errs toward
 * the generous scorer, because the cost of under-scoring a shy child is higher
 * than the cost of missing a retroflex.
 */
const DISAGREEMENT_WEIGHT = 0.4;

/**
 * Fuses whichever scores are available.
 *
 * Pass null for a scorer that could not run: no recognition for this language,
 * or no reference clip for this phrase. **Null is not zero.** A missing scorer
 * must never drag a score down, which is why each branch is explicit rather
 * than arithmetic over defaults.
 */
export function fuseScores(
  transcriptScore: number | null,
  acousticScore: number | null,
): FusedScore {
  const t = transcriptScore;
  const a = acousticScore;

  if (t == null && a == null) {
    // Nothing measured anything. The caller owns this: it is a nocatch, not a
    // zero, and this function refuses to invent a number for it.
    return {
      score: 0,
      band: "nocatch",
      agreement: "transcript_only",
      transcriptScore: null,
      acousticScore: null,
    };
  }

  if (a == null) {
    return {
      score: t!,
      band: bandFromScore(t!),
      agreement: "transcript_only",
      transcriptScore: t,
      acousticScore: null,
    };
  }

  if (t == null) {
    // Bodo and Manipuri live here: no recognition, so the reference comparison
    // is the only witness there is.
    return {
      score: a,
      band: bandFromScore(a),
      agreement: "acoustic_only",
      transcriptScore: null,
      acousticScore: a,
    };
  }

  // THE TRANSCRIPT IS THE GATE. Below full credit the word itself was not
  // right, and how closely a wrong word matches the reference is not a question
  // worth asking. Take the transcript and say the two never really compared.
  if (t < TRANSCRIPT_CONFIDENT) {
    return {
      score: t,
      band: bandFromScore(t),
      agreement: a >= t + DISAGREEMENT_GAP ? "acoustic_generous" : "agree",
      transcriptScore: t,
      acousticScore: a,
    };
  }

  // The word was right. Now the sound gets a say.
  if (t - a >= DISAGREEMENT_GAP) {
    const score = Math.round(t - DISAGREEMENT_WEIGHT * (t - a));
    return {
      score,
      band: bandFromScore(score),
      agreement: "transcript_generous",
      transcriptScore: t,
      acousticScore: a,
    };
  }

  return {
    score: t,
    band: bandFromScore(t),
    agreement: "agree",
    transcriptScore: t,
    acousticScore: a,
  };
}
