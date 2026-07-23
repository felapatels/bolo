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
  // Aspiration / spelling variants common across romanization schemes.
  const folds: Array<[RegExp, string]> = [
    [/chh/g, "ch"],
    [/ph/g, "f"],
    [/th/g, "t"],
    [/kh/g, "k"],
    [/gh/g, "g"],
    [/jh/g, "j"],
    [/dh/g, "d"],
    [/bh/g, "b"],
    [/sh/g, "s"],
    [/w/g, "v"],
    [/ee/g, "i"],
    [/oo/g, "u"],
  ];
  for (const [re, to] of folds) s = s.replace(re, to);
  // Collapse repeated letters (aa → a, nn → n).
  s = s.replace(/(.)\1+/g, "$1");
  return s;
}

/** Keeps only letters (any script) for native-script comparison. */
export function normalizeNative(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[^\p{L}]/gu, "")
    .toLowerCase();
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
  guard?: "near-match-floor" | "wrong-phrase-cap" | "partial-match-cap" | "cross-script-cap";
}

/**
 * Applies deterministic sanity checks to the LLM's score. The pass threshold
 * stays at 80 (unchanged mastery semantics); guards only clamp the score into
 * a band the transcript evidence supports.
 *
 * Guard ladder (highest priority first):
 *   1. cross-script-cap  — comparable=false: cap at 85, no unverifiable perfect scores.
 *   2. near-match-floor  — sim ≥ 0.85: floor at 85/90, near-exact match can never fail.
 *   3. wrong-phrase-cap  — transcript matches a *different* known phrase: cap at 40.
 *   4. partial-match-cap — sim < 0.70 & score ≥ 80: cap at 72. Closes the gap where
 *      the STT hint biases a wrong attempt's transcript toward the target, landing it
 *      in the 0.25–0.70 range, and the LLM then over-rewards it.
 */
export function applyScoreGuards(input: GuardInput): GuardResult {
  const { transcript, targetNative, targetRomanized, otherPhrases } = input;
  let score = Math.max(0, Math.min(100, Math.round(input.score)));

  const target = compareToTarget(transcript, targetNative, targetRomanized);
  if (!target.comparable) {
    // Cross-script transcript (e.g. Devanagari for a Gujarati phrase): the LLM
    // judged by sound, which is correct, but we can't verify similarity at all.
    // Cap at 85 so an unverifiable transcript can't award a perfect score.
    const capped = Math.min(score, 85);
    return {
      score: capped,
      passed: capped >= 80,
      ...(score > 85 ? { guard: "cross-script-cap" as const } : {}),
    };
  }

  // A near-exact phonetic match can never fail.
  if (target.sim >= 0.85) {
    const floor = target.sim >= 0.95 ? 90 : 85;
    if (score < floor) {
      return { score: floor, passed: true, guard: "near-match-floor" };
    }
    return { score, passed: true };
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

  // A transcript below 70% phonetic similarity to the target can't pass.
  // The LLM tends to over-reward partial or wrong attempts whose transcripts
  // have been nudged toward the target by the STT hint. Any attempt genuinely
  // close to the target normalises to sim ≥ 0.70 before this guard fires.
  if (target.sim < 0.70 && score >= 80) {
    return { score: Math.min(score, 72), passed: false, guard: "partial-match-cap" };
  }

  return { score, passed: score >= 80 };
}
