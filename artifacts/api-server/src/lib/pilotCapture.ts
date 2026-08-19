/**
 * pilotCapture.ts
 * Server-side tee: uploads raw pronunciation audio and a JSON sidecar to
 * Cloudflare R2 for users in the PILOT_CAPTURE_USER_IDS allowlist.
 *
 * This is a narrow, temporary precursor of the build-32 voice contribution
 * program (docs/specs/voice-data-program.md §3 and §5).  When
 * PILOT_CAPTURE_USER_IDS is absent or empty the feature is fully inert —
 * no R2 calls are made on any pronunciation attempt.
 *
 * R2 path scheme (pilot-only; build-32 will use voice-contributions/…):
 *   pilot-clips/{languageCode}/{clipId}.m4a    — raw audio bytes
 *   pilot-clips/{languageCode}/{clipId}.json   — JSON sidecar (no band values)
 *
 * Failure posture (§5): R2 errors are logged at WARN and swallowed.  The eval
 * response is returned to the client unaffected whether the upload succeeds or
 * fails.
 *
 * PILOT_CAPTURE_USER_IDS format:
 *   PILOT_CAPTURE_USER_IDS=user_abc123,user_def456
 *   (Clerk user ids, comma-separated; leading/trailing spaces are trimmed;
 *    an absent or empty value produces an empty set and disables the feature)
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client } from "./r2Client";
import crypto from "node:crypto";

// Parse once at module init and cache as a Set for O(1) lookups.
// An empty or absent env var produces an empty set.
const _pilotCaptureUserIds: Set<string> = new Set(
  (process.env.PILOT_CAPTURE_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/**
 * The allowlist set, exported so tests can inspect its initial state or
 * mutate it per test case without reloading the module.
 */
export const pilotCaptureUserIds: Set<string> = _pilotCaptureUserIds;

export interface TeeAudioOptions {
  userId: string;
  languageCode: string;
  phraseId: number | null;
  targetNative: string;
  targetRomanized: string;
  transcript: string;
  score: number;
  /**
   * TEMPORARY (capture mode, BRIEF 32.1 respin): when the attempt was made in
   * the web practice page's ?mode=capture flow, the explicit protocol label
   * and attempt position land in the sidecar so the harvest reads labels
   * directly (order-reconstruction becomes the fallback, not the mechanism).
   * Remove with capture mode once the calibration corpus is complete.
   */
  capture?: {
    label: "native" | "american_accent" | "subtle_error" | "wrong_attempt";
    attemptOfFour: number;
  };
}

/** True when the userId is in the PILOT_CAPTURE_USER_IDS allowlist. */
export function isPilotCaptureUser(userId: string): boolean {
  return _pilotCaptureUserIds.has(userId);
}

// TEMPORARY (capture mode): the most recent capture-mode sidecar per user,
// kept in memory so "redo this attempt" can mark it discarded. Single-process
// dev-only scaffolding — a restart forgets it (acceptable: redo is for
// immediate fumbles). Only capture-mode uploads are tracked.
const lastCaptureSidecarByUser = new Map<
  string,
  { sidecarKey: string; sidecar: Record<string, unknown> }
>();

/**
 * TEMPORARY (capture mode): rewrite the caller's most recent capture-mode
 * sidecar with discarded=true so the harvest skips that clip. Returns false
 * when there is nothing to discard or the rewrite fails (logged, never
 * thrown).
 */
export async function discardLastCapture(userId: string): Promise<boolean> {
  const entry = lastCaptureSidecarByUser.get(userId);
  if (!entry) return false;
  const r2 = getR2Client();
  if (!r2) return false;
  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: entry.sidecarKey,
        Body: Buffer.from(
          JSON.stringify({ ...entry.sidecar, discarded: true }),
          "utf-8",
        ),
        ContentType: "application/json",
      }),
    );
    lastCaptureSidecarByUser.delete(userId);
    console.log(`[pilot-capture] sidecar ${entry.sidecarKey} marked discarded`);
    return true;
  } catch (err) {
    console.error(
      `[pilot-capture] FAILED to mark sidecar ${entry.sidecarKey} discarded:`,
      err,
    );
    return false;
  }
}

/**
 * Upload raw audio bytes and a JSON sidecar to R2 for pilot capture.
 *
 * Safe to call unconditionally after every pronunciation attempt — the
 * function returns early (with no R2 calls) when:
 *   1. userId is not in the PILOT_CAPTURE_USER_IDS allowlist, OR
 *   2. Any R2 credential env var is absent.
 *
 * Must be called AFTER res.json() (fire-and-forget) so it never delays the
 * response.  Any R2 error is logged at WARN and swallowed; this function
 * never throws.
 */
export async function teeAudioToPilot(
  rawBuffer: Buffer | null,
  opts: TeeAudioOptions,
): Promise<void> {
  // Guard 1: userId must be in the allowlist.
  if (!_pilotCaptureUserIds.has(opts.userId)) return;

  // Guard 2: rawBuffer must be present (STT succeeded).
  if (!rawBuffer) return;

  // Guard 3: R2 credentials must all be set.
  const r2 = getR2Client();
  if (!r2) return;

  const bucket = process.env.R2_BUCKET_NAME!;
  const clipId = crypto.randomUUID();
  const { userId, languageCode, phraseId, targetNative, targetRomanized, transcript, score, capture } = opts;

  const clipKey = `pilot-clips/${languageCode}/${clipId}.m4a`;
  const sidecarKey = `pilot-clips/${languageCode}/${clipId}.json`;

  const sidecar: Record<string, unknown> = {
    clipId,
    userId,
    languageCode,
    phraseId,
    targetNative,
    targetRomanized,
    transcript,
    score,
    timestamp: new Date().toISOString(),
  };
  // No band values in the sidecar (band is a display layer with provisional
  // thresholds; it must not enter the pilot's data — see task spec).

  // TEMPORARY (capture mode): explicit protocol labels in the sidecar.
  if (capture) {
    sidecar.label = capture.label;
    sidecar.captureMode = true;
    sidecar.attemptOfFour = capture.attemptOfFour;
  }

  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: clipKey,
        Body: rawBuffer,
        ContentType: "audio/m4a",
      }),
    );
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: sidecarKey,
        Body: Buffer.from(JSON.stringify(sidecar), "utf-8"),
        ContentType: "application/json",
      }),
    );
    // TEMPORARY (capture mode): remember the sidecar so a redo can discard it.
    if (capture) {
      lastCaptureSidecarByUser.set(userId, { sidecarKey, sidecar });
    }
    // Success is logged with the clip key so a capture session can be
    // verified from server logs alone (and each clip located in R2).
    uploadSuccessCount++;
    console.log(
      `[pilot-capture] uploaded clip ${clipKey} (success #${uploadSuccessCount} this process)`,
    );
  } catch (err) {
    // Never rethrow — the eval response must be unaffected. But a failed
    // upload means a pilot clip is PERMANENTLY LOST, so it is logged at
    // ERROR with a running count: silent loss (e.g. malformed R2
    // credentials failing every upload) must be visible in the logs.
    uploadFailureCount++;
    console.error(
      `[pilot-capture] R2 upload FAILED — clip ${clipKey} LOST (failure #${uploadFailureCount} this process):`,
      err,
    );
  }
}

/** Running totals for this process, exported for tests and health checks. */
export function getPilotCaptureCounters(): { successes: number; failures: number } {
  return { successes: uploadSuccessCount, failures: uploadFailureCount };
}

let uploadSuccessCount = 0;
let uploadFailureCount = 0;
