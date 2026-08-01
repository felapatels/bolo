// Deterministic guardrails around the LLM pronunciation score.
//
// The LLM judges "by sound" from a rough transcript, which makes it accurate on
// average but jittery on individual attempts — especially for 1-2 syllable
// words where a transcription quirk can swing pass/fail. These helpers add
// cheap, deterministic cross-checks:
//
//  - a transcript that phonetically matches the target can never fail;
//  - a transcript that clearly matches a *different* known phrase (and not the
//    target) can never pass;
//  - a transcript wildly divergent from the target can never pass outright.
//
// All checks are script-aware: a Latin transcript is compared against the
// romanized target, a native-script transcript against the native target. When
// the scripts don't line up (e.g. the transcriber wrote Gujarati speech in
// Devanagari), no deterministic verdict is possible and the LLM score stands.

/**
 * Linearly maps a similarity value in [lo, 1.0] to an integer score in [80, 100].
 * sim=lo → 80, sim=1.0 → 100. Values below lo are clamped to 80; values above
 * 1.0 are clamped to 100. This ensures scores are a continuous, earned function
 * of phonetic similarity rather than snapped to arbitrary round numbers.
 */
export function simToScore(sim: number, lo: number): number {
  const clamped = Math.max(lo, Math.min(1.0, sim));
  const raw = 80 + ((clamped - lo) / (1.0 - lo)) * 20;
  return Math.round(Math.max(80, Math.min(100, raw)));
}

/** Folds common Indic-romanization spelling variants so that e.g. "kem chho",
 * "kem cho" and "kaem choo" normalize to the same phonetic key. */
export function normalizeLatin(text: string): string {
  let s = text
    .toLowerCase()
    // Strip diacritics (ā → a, ñ → n …)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Letters only
    .replace(/[^a-z]/g, "");
  // Spelling-variant folds only — strictly equivalent romanisation variants.
  // Aspiration folds (th→t, sh→s, kh→k, gh→g, dh→d, bh→b) have been removed:
  // they collapse phonetically distinct sounds and produce false high similarity
  // on short 2–3 syllable phrases, pushing wrong attempts past the pass threshold.
  const folds: Array<[RegExp, string]> = [
    [/chh/g, "ch"],
    [/w/g, "v"],
    [/ee/g, "i"],
    [/oo/g, "u"],
  ];
  for (const [re, to] of folds) s = s.replace(re, to);
  // Collapse repeated letters (aa → a, nn → n).
  s = s.replace(/(.)\1+/g, "$1");
  return s;
}

/**
 * Keeps only letters (any script) for native-script comparison, after
 * applying Indic-specific normalizations:
 *
 *  1. ZWJ (U+200D) and ZWNJ (U+200C) stripped — these invisible joiners
 *     affect rendering but never pronunciation; their presence or absence in a
 *     transcript depends on the STT engine, not the learner's pronunciation.
 *
 *  2. Nukta canonicalization via NFC — e.g. ड + ़ (nukta) → ड़ as a single
 *     precomposed codepoint, so both forms compare as identical.
 *
 *  3. Anusvara/chandrabindu equivalence (Devanagari): anusvara ं (U+0902) and
 *     chandrabindu ँ (U+0901) mark nasalization already carried by the
 *     following consonant. Both are dropped. Note: U+0902/U+0901 are category
 *     Mn (nonspacing marks) and would be removed by the non-letter strip in
 *     step 5 regardless; the explicit drop here documents the intent.
 *
 *  4. Conjunct-nasal equivalence (Devanagari only): Hindi may write a nasal
 *     phoneme as either an anusvara (हिंदी) or an explicit nasal consonant +
 *     virama conjunct (हिन्दी, where न + ् = न्). After step 3 the anusvara
 *     form already loses the anusvara; this step removes the nasal consonant
 *     letter (ङ U+0919, ञ U+091E, ण U+0923, न U+0928, म U+092E) when it is
 *     immediately followed by virama (् U+094D), so both spellings reduce to
 *     the same string (हिंदी → हद, हिन्दी → हद). The same pattern exists in
 *     other Indic script families; those are handled separately.
 *
 *  5. Non-letter strip: matras, virama, and all other Unicode marks (category
 *     M) are not letters, so they are removed here. Only base letter codepoints
 *     (category L) survive.
 */
export function normalizeNative(text: string): string {
  return (
    text
      // 1. Strip ZWJ / ZWNJ.
      .replace(/[\u200C\u200D]/g, "")
      // 2. NFC: nukta → precomposed.
      .normalize("NFC")
      // 3. Drop Devanagari anusvara (U+0902) and chandrabindu (U+0901).
      .replace(/[\u0901\u0902]/g, "")
      // 4. Drop Devanagari conjunct nasals: nasal letter + virama → nothing.
      //    Covers ङ् ञ् ण् न् म् so that "हिन्दी" and "हिंदी" collapse
      //    identically once marks are stripped in the next step.
      .replace(/[\u0919\u091E\u0923\u0928\u092E]\u094D/g, "")
      // 5. Strip everything that is not a Unicode letter (marks, digits, etc.).
      .replace(/[^\p{L}]/gu, "")
      .toLowerCase()
  );
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** 0..1 similarity ratio between two already-normalized strings. */
export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

function isLatin(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (!letters.length) return false;
  const latin = letters.filter((c) => /[a-z]/i.test(c) || /\p{Script=Latin}/u.test(c));
  return latin.length / letters.length >= 0.7;
}

function sameScriptAs(text: string, reference: string): boolean {
  // Coarse check: both dominated by the same non-Latin Unicode block family?
  const first = (s: string) => {
    const m = s.match(/\p{L}/u);
    return m ? m[0].codePointAt(0)! : -1;
  };
  const a = first(text);
  const b = first(reference);
  if (a < 0 || b < 0) return false;
  // Same 0x80-sized block is a good proxy for "same Indic script".
  return Math.floor(a / 128) === Math.floor(b / 128);
}

export interface PhoneticComparison {
  /** Best similarity of the transcript to the target (0..1). */
  sim: number;
  /** False when transcript & target scripts don't line up — guards must not fire. */
  comparable: boolean;
}

/** Compares a transcript to the target phrase in whichever script lines up. */
export function compareToTarget(
  transcript: string,
  targetNative: string,
  targetRomanized: string,
): PhoneticComparison {
  if (isLatin(transcript)) {
    const t = normalizeLatin(transcript);
    const r = normalizeLatin(targetRomanized);
    if (!t.length || !r.length) return { sim: 0, comparable: false };
    return { sim: similarity(t, r), comparable: true };
  }
  if (sameScriptAs(transcript, targetNative)) {
    const t = normalizeNative(transcript);
    const n = normalizeNative(targetNative);
    if (!t.length || !n.length) return { sim: 0, comparable: false };
    return { sim: similarity(t, n), comparable: true };
  }
  return { sim: 0, comparable: false };
}

/** True when the transcript carries no letters at all (silence/garble). */
export function isEffectivelyEmpty(transcript: string): boolean {
  return !/\p{L}/u.test(transcript);
}

export interface GuardInput {
  score: number;
  passed: boolean;
  transcript: string;
  targetNative: string;
  targetRomanized: string;
  /** Other known phrases in the same language, for wrong-word detection. */
  otherPhrases?: Array<{ nativeScript: string; romanized: string }>;
}

export interface GuardResult {
  score: number;
  passed: boolean;
  /** Which deterministic rule fired, for logging; undefined when LLM stands. */
  guard?: "near-match-floor" | "wrong-phrase-cap" | "partial-match-cap" | "script-mismatch-nocatch";
  /**
   * True when the transcript's script proves the RECOGNIZER failed, not the
   * learner. The route must resolve this to band 'nocatch' (no XP, but no
   * failure messaging, no streak break, no mastery penalty) — never 'retry'.
   */
  nocatch?: true;
}

/**
 * Applies deterministic sanity checks to the LLM's score. The pass threshold
 * stays at 80 (unchanged mastery semantics); guards only clamp the score into
 * a band the transcript evidence supports.
 *
 * Guard ladder (highest priority first):
 *   1. script-mismatch-nocatch — the transcript's Unicode script does not match
 *      the phrase's expected script and cannot be verified against the target:
 *      the RECOGNIZER failed, not the learner. Resolves to nocatch in every
 *      language, including fully supported ones. Two forms:
 *        a. non-Latin transcript in a different block than the target (e.g.
 *           Bengali script for a Manipuri phrase) — always nocatch;
 *        b. Latin transcript for a non-Latin-script phrase with sim < 0.45 —
 *           the recognizer wrote the wrong script AND the romanized transcript
 *           shares almost nothing with the target; indistinguishable from
 *           recognizer noise, so it resolves in the learner's favor as nocatch.
 *           Latin transcripts with sim ≥ 0.45 remain scoreable: partial
 *           phonetic overlap in romanization is evidence of a real attempt
 *           (the normal ladder still caps/fails weak ones).
 *      (wrong-phrase-cap still takes precedence over form b: a Latin transcript
 *      that clearly matches a DIFFERENT catalog phrase is affirmative evidence
 *      of a wrong attempt, not recognizer noise.)
 *   2. near-match-floor  — sim ≥ 0.90: floor at 85/90, near-exact match can never fail.
 *      Raised from 0.85 → 0.90 for consistency with the fast-path threshold: on a
 *      6-character normalized string, sim=0.85 still allows one substitution, which
 *      can rescue a clearly wrong single-syllable word the LLM correctly scored below 80.
 *   3. wrong-phrase-cap  — transcript matches a *different* known phrase: cap at 40.
 *   4. partial-match-cap — sim < 0.70 & score ≥ 80: cap at 72. Closes the gap where
 *      the STT hint biases a wrong attempt's transcript toward the target, landing it
 *      in the 0.25–0.70 range, and the LLM then over-rewards it. After guard 1b,
 *      this only fires for same-script (native) transcripts.
 */
export function applyScoreGuards(input: GuardInput): GuardResult {
  const { transcript, targetNative, targetRomanized, otherPhrases } = input;
  let score = Math.max(0, Math.min(100, Math.round(input.score)));

  const SCRIPT_MISMATCH: GuardResult = {
    score: 0,
    passed: false,
    guard: "script-mismatch-nocatch",
    nocatch: true,
  };

  const target = compareToTarget(transcript, targetNative, targetRomanized);
  if (!target.comparable) {
    // The transcript is in a script that lines up with neither the native
    // target nor romanization (e.g. Bengali script for a Manipuri phrase).
    // The recognizer failed; the learner must not wear it.
    return SCRIPT_MISMATCH;
  }

  // A near-exact phonetic match can never fail — but when the score is already
  // at or above the sim-derived floor, we preserve the LLM's own pass/fail
  // verdict (score >= 80) rather than unconditionally overriding it with true.
  // The floor-rescue branch (score < floor) still forces passed=true because
  // it is actively lifting an under-scored, phonetically correct attempt.
  if (target.sim >= 0.90) {
    const floor = simToScore(target.sim, 0.90);
    if (score < floor) {
      return { score: floor, passed: true, guard: "near-match-floor" };
    }
    return { score, passed: score >= 80 };
  }

  // A transcript that clearly matches a *different* known phrase can't pass.
  if (otherPhrases?.length && target.sim <= 0.5) {
    for (const other of otherPhrases) {
      const otherSim = compareToTarget(
        transcript,
        other.nativeScript,
        other.romanized,
      );
      if (otherSim.comparable && otherSim.sim >= 0.8) {
        return {
          score: Math.min(score, 40),
          passed: false,
          guard: "wrong-phrase-cap",
        };
      }
    }
  }

  // Guard 1b: a Latin transcript for a non-Latin-script phrase, with romanized
  // similarity too low to verify the attempt (sim < 0.70): the recognizer wrote
  // the wrong script and the evidence can't separate recognizer noise from a
  // wrong attempt — resolve in the learner's favor as nocatch. (A transcript
  // matching a different catalog phrase was already caught above.)
  // Threshold 0.45, deliberately below the 0.70 scoring bar: sim in
  // [0.45, 0.70) is partial evidence of a real attempt (e.g. "kem so" for
  // "kem chho" at 0.67) and must stay scoreable; below 0.45 the transcript
  // shares almost nothing with the romanized target.
  if (isLatin(transcript) && !isLatin(targetNative) && target.sim < 0.45) {
    return SCRIPT_MISMATCH;
  }

  // A transcript below 70% phonetic similarity to the target can't pass.
  // The LLM tends to over-reward partial or wrong attempts whose transcripts
  // have been nudged toward the target by the STT hint. Any attempt genuinely
  // close to the target normalises to sim ≥ 0.70 before this guard fires.
  if (target.sim < 0.70 && score >= 80) {
    return { score: Math.min(score, 72), passed: false, guard: "partial-match-cap" };
  }

  return { score, passed: score >= 80 };
}

// ─── S1 dual-pass STT conservative choice ────────────────────────────────────

export interface DualPassChoice {
  /** The transcript band computation must use. */
  transcript: string;
  /** True when the two passes disagreed after normalization. */
  disagreement: boolean;
  /** True when both passes were effectively empty (silence/garble). */
  bothEmpty: boolean;
  /**
   * True when the chosen (farther) transcript is effectively empty while the
   * other pass heard content: the passes could not corroborate each other, so
   * the route must resolve this as a system miss (nocatch), never a score.
   */
  chosenEmptyWithEvidence: boolean;
}

/** Normalizes a transcript for pass-vs-pass agreement checks: Latin transcripts
 * fold through normalizeLatin, everything else through normalizeNative. */
function normalizeForAgreement(text: string): string {
  return isLatin(text) ? normalizeLatin(text) : normalizeNative(text);
}

/**
 * S1 honesty rule: both STT passes run on every scored attempt. When they
 * disagree (normalized inequality), band computation must use the transcript
 * FARTHER from the target, never the pass that happens to match the target.
 * An STT pass that normalizes a wrong pronunciation into the target transcript
 * is exactly the failure mode this defends against.
 *
 * Distance ladder (lower sorts farther): comparable sim, then non-comparable
 * (-1: unverifiable script), then effectively-empty (-2: no content at all).
 * Ties keep the high-quality pass; a tie is equidistant, so preferring the
 * better recognizer carries no toward-target bias.
 */
export function chooseConservativeTranscript(input: {
  mini: string;
  hq: string;
  targetNative: string;
  targetRomanized: string;
}): DualPassChoice {
  const mini = input.mini.trim();
  const hq = input.hq.trim();
  const miniEmpty = isEffectivelyEmpty(mini);
  const hqEmpty = isEffectivelyEmpty(hq);
  if (miniEmpty && hqEmpty) {
    return {
      transcript: "",
      disagreement: false,
      bothEmpty: true,
      chosenEmptyWithEvidence: false,
    };
  }
  const agree =
    !miniEmpty &&
    !hqEmpty &&
    normalizeForAgreement(mini) === normalizeForAgreement(hq);
  if (agree) {
    // Same content after normalization; keep the high-quality rendering.
    return {
      transcript: hq,
      disagreement: false,
      bothEmpty: false,
      chosenEmptyWithEvidence: false,
    };
  }
  const effectiveSim = (t: string, empty: boolean): number => {
    if (empty) return -2;
    const cmp = compareToTarget(t, input.targetNative, input.targetRomanized);
    return cmp.comparable ? cmp.sim : -1;
  };
  const miniEff = effectiveSim(mini, miniEmpty);
  const hqEff = effectiveSim(hq, hqEmpty);
  const chooseMini = miniEff < hqEff;
  return {
    transcript: chooseMini ? mini : hq,
    disagreement: true,
    bothEmpty: false,
    chosenEmptyWithEvidence: chooseMini ? miniEmpty : hqEmpty,
  };
}
