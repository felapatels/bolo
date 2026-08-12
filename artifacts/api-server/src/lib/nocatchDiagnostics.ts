/**
 * Chunk 2 Stage A, part A2: nocatch cause diagnostics.
 *
 * When an allowlisted account's attempt finalizes as a nocatch, a JSON
 * diagnostic sidecar is written to R2 under nocatch-diagnostics/ (same
 * destination pattern as the pilot-capture infrastructure, distinct prefix)
 * capturing everything the code can say about WHY nothing usable matched.
 *
 * Contract (task rules):
 *  - Allowlist gate: reuses the PILOT_CAPTURE_USER_IDS mechanism via
 *    isPilotCaptureUser. CALLERS must short-circuit on the allowlist BEFORE
 *    assembling the payload; the re-check here is defense in depth only.
 *  - Fail open: a write failure is logged and swallowed. This function never
 *    throws and must only be invoked fire-and-forget AFTER res.json().
 *  - similarityValues is named exactly that (NOT "confidence"): this pipeline
 *    has no STT confidence values; similarity ratios are what exists.
 *  - No analysis code here. Sidecars are write-only; analysis happens later
 *    as a separate read-only task.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client } from "./r2Client";
import { isPilotCaptureUser } from "./pilotCapture";
import crypto from "node:crypto";

/** What the code could determine about why the attempt was a nocatch. */
export type NocatchCause =
  | "empty_audio_or_silence"
  | "undecodable_audio"
  | "dual_pass_uncorroborated"
  | "script_mismatch"
  | "latin_low_sim"
  | "unsupported_language"
  | "no_match_after_bridge";

export interface NocatchDiagnostic {
  userId: string;
  languageCode: string;
  /** Human-readable language name when resolved. */
  language: string | null;
  phraseId: number | null;
  /** The expected phrase, all three stored forms. */
  targetNative: string;
  targetRomanized: string;
  targetEnglish: string | null;
  /** Both raw STT pass transcripts; null when STT never ran. */
  sttTranscriptMini: string | null;
  sttTranscriptHq: string | null;
  /** The transcript the dual-pass choice settled on; null when STT never ran. */
  chosenTranscript: string | null;
  /** Normalized forms exactly as the raw matcher saw them; null when STT never ran. */
  normalizedTranscript: string | null;
  normalizedTarget: string | null;
  /**
   * Similarity ratios in scope at the nocatch decision. Named similarityValues
   * so nobody later mistakes these for STT confidence (which does not exist in
   * this pipeline).
   */
  similarityValues: Record<string, number | null>;
  cause: NocatchCause;
  sttDisagreement: boolean | null;
  /** True when the cross-script bridge achieved a shared comparable space. */
  bridged: boolean;
  /** The bridged comparable strings when a bridge was attempted, else null. */
  transcriptComparable: string | null;
  targetComparable: string | null;
}

/**
 * Fire-and-forget: uploads one JSON sidecar to
 * nocatch-diagnostics/{languageCode}/{diagnosticId}.json. Never throws;
 * returns without R2 calls when the user is not allowlisted or R2 credentials
 * are absent.
 */
export async function writeNocatchDiagnostic(
  diag: NocatchDiagnostic,
): Promise<void> {
  // Defense in depth. The route-side gate is the real short-circuit (it runs
  // before the payload is assembled); this keeps a future mis-wired call site
  // from leaking non-allowlisted data.
  if (!isPilotCaptureUser(diag.userId)) return;

  // Everything after the allowlist check sits inside the fail-open boundary:
  // client acquisition and key construction can throw too, and a rejection
  // from this fire-and-forget promise must never surface.
  let key = "(key not built)";
  try {
    const r2 = getR2Client();
    if (!r2) return;

    const diagnosticId = crypto.randomUUID();
    key = `nocatch-diagnostics/${diag.languageCode || "unknown"}/${diagnosticId}.json`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
        Body: Buffer.from(
          JSON.stringify({
            diagnosticId,
            timestamp: new Date().toISOString(),
            ...diag,
          }),
          "utf-8",
        ),
        ContentType: "application/json",
      }),
    );
    console.log(`[nocatch-diag] wrote ${key} cause=${diag.cause}`);
  } catch (err) {
    // Fail open: never affect the user-facing scoring result.
    console.warn(`[nocatch-diag] FAILED to write ${key}:`, err);
  }
}
