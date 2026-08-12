import { createHmac, timingSafeEqual } from "node:crypto";
import type { PronunciationBand } from "./fsrsScheduler";
import type { NocatchCause } from "./nocatchDiagnostics";
import { bandFromScore, normalizeBand } from "./scoreBands";

// The authoritative evaluation the server computed for a single spoken attempt.
// It is signed by the server at pronunciation time and later replayed, verbatim,
// when the client records the attempt — so the stored score/feedback can never
// be forged or inflated by the client.
export interface EvaluationClaims {
  userId: string;
  phraseId: number | null;
  languageCode: string;
  nativeScript: string;
  romanized: string;
  english: string;
  transcript: string;
  score: number;
  passed: boolean;
  feedback: string;
  // ── Scoring Core v2 additions (optional so tokens issued before this upgrade
  //    remain valid; verifyEvaluation fills safe defaults for missing fields) ──
  // Qualitative five-band ladder value for this attempt:
  // 'perfect' | 'great' | 'good' | 'almost' | 'retry' | 'nocatch'.
  band?: PronunciationBand;
  // XP to credit when this attempt is recorded.  0 for retry/nocatch bands.
  xpAwarded?: number;
  // Time in ms between phrase audio ending and the learner tapping Record.
  // Null means the client did not report it (older app version).
  latencyMs?: number | null;
  // ── S1 scoring honesty additions (optional so pre-dual-pass tokens stay valid) ──
  // Transcript from the fast STT pass (gpt-4o-mini-transcribe).
  sttTranscriptMini?: string;
  // Transcript from the high-quality STT pass, run on every scored attempt.
  sttTranscriptHq?: string;
  // True when the passes disagreed after normalization; the band was computed
  // from the transcript farther from the target (the conservative reading).
  sttDisagreement?: boolean;
  // True when the recognizer-glitch rescue fired (owner ruling, Aug 12, 2026):
  // exactly one pass came back in a script the target cannot be compared
  // against, so that broken pass was excluded and the comparable pass was
  // scored normally. Absent on tokens issued before the rescue existed.
  sttGlitchRescue?: boolean;
  // ── Noise production baseline (optional so tokens issued before this change
  //    stay valid; both fields are simply absent on those, never invalid) ──
  // Derived signal-to-noise estimate for the recording, in dB. Null/absent
  // when the clip could not be measured. A DERIVED NUMBER only: no audio and
  // no extra transcript content travels with it.
  snrDb?: number | null;
  // Why the attempt failed to score, when the band is 'nocatch'. The cause
  // LABEL alone — the transcript-bearing nocatch diagnostic sidecars stay on
  // their pilot allowlist.
  nocatchCause?: NocatchCause;
  // ── Scoring v2 groundwork ──
  // True ONLY when an audio-aware judge actually listened to the clip and
  // certified the score (the scoring v2 promotion gate, test-out included).
  // Exempt from the verify-time honesty clamp below: the cap exists because a
  // transcript-only pipeline cannot hear accent; an audio judge can.
  audioJudged?: boolean;
}

interface SignedPayload extends EvaluationClaims {
  // Expiry as epoch milliseconds.
  exp: number;
}

// How long a freshly-issued evaluation token stays valid. Comfortably longer
// than the practice round-trip (evaluate -> show result -> save attempt) while
// still bounding replay.
const TOKEN_TTL_MS = 15 * 60 * 1000;

// S1 global honesty cap: until audio-aware scoring v2 exists, no
// transcript-scored attempt may exceed this score (or band 'perfect').
// Exported so the scoring paths in openai.ts cap against the SAME constant
// this module clamps against — they can never drift apart.
export const HONESTY_SCORE_CAP = 92;

function getSigningKey(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set; cannot sign pronunciation evaluations.",
    );
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function sign(body: string): string {
  return base64url(createHmac("sha256", getSigningKey()).update(body).digest());
}

/**
 * Signs the server-computed evaluation into an opaque, tamper-evident token.
 * The token is issued by `/openai/pronunciation` and required by `/attempts`.
 */
export function signEvaluation(claims: EvaluationClaims): string {
  const payload: SignedPayload = { ...claims, exp: Date.now() + TOKEN_TTL_MS };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/**
 * Verifies a token's signature and expiry and returns the original claims,
 * or `null` when the token is missing, malformed, tampered with, or expired.
 */
export function verifyEvaluation(token: string): EvaluationClaims | null {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = sign(body);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    return null;
  }

  let payload: SignedPayload;
  try {
    payload = JSON.parse(fromBase64url(body).toString("utf8")) as SignedPayload;
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
    return null;
  }

  const { exp: _exp, ...claims } = payload;

  // Back-compat: tokens issued before the v2 upgrade won't have band/xpAwarded,
  // and tokens signed just before the five-band deploy carry legacy three-band
  // names (they stay valid for TOKEN_TTL_MS across the deploy). normalizeBand
  // maps legacy/missing values via score-only derivation (Spec 0 rule 40 —
  // never derive band from `passed`) and passes nocatch through untouched.
  const safeband: PronunciationBand = normalizeBand(
    claims.band as string | undefined,
    claims.score,
  );
  const safeXp: number = typeof claims.xpAwarded === "number" ? claims.xpAwarded : 0;

  // Honesty cap enforced at VERIFY time, not only at signing: tokens outlive
  // deploys by TOKEN_TTL_MS, so a token signed by a pre-cap binary can be
  // replayed against a capped one and its claims written verbatim (proven
  // live 2026-08-01: attempt 14097 wrote score=100/band=perfect nineteen
  // minutes after the cap shipped). This is the single choke point covering
  // every consumer of evaluation tokens (/attempts and test-out).
  //  - nocatch passes through untouched: a system miss carries no credit and
  //    its score is not a pronunciation claim.
  //  - audioJudged tokens are EXEMPT: scoring v2's promotion gate certifies
  //    scores above the cap only after an audio judge has heard the clip.
  let safeScore = claims.score;
  let clampedBand = safeband;
  if (
    !claims.audioJudged &&
    safeband !== "nocatch" &&
    safeScore > HONESTY_SCORE_CAP
  ) {
    safeScore = HONESTY_SCORE_CAP;
    // Band re-derives from the capped score through the single derivation
    // path (owner ruling, Aug 2, 2026): a clamped replayed 92 and a fresh 92
    // must always show the same band.
    clampedBand = bandFromScore(safeScore);
  }

  return { ...claims, score: safeScore, band: clampedBand, xpAwarded: safeXp };
}
