import { createHmac, timingSafeEqual } from "node:crypto";
import type { PronunciationBand } from "./fsrsScheduler";
import { normalizeBand } from "./scoreBands";

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
}

interface SignedPayload extends EvaluationClaims {
  // Expiry as epoch milliseconds.
  exp: number;
}

// How long a freshly-issued evaluation token stays valid. Comfortably longer
// than the practice round-trip (evaluate -> show result -> save attempt) while
// still bounding replay.
const TOKEN_TTL_MS = 15 * 60 * 1000;

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

  return { ...claims, band: safeband, xpAwarded: safeXp };
}
