// Chunk 2 Stage A (A2): nocatch cause diagnostics sidecar tests.
//
// Mirrors the pilot-capture test harness (same S3 mock pattern; node:test
// gives this file its own process so mock.module registration is safe):
//
//  1. Unlisted userId → no R2 call at all (feature inert for everyone else).
//     NOTE: deliberately does NOT assert pilotCaptureUserIds.size === 0, in
//     this workspace PILOT_CAPTURE_USER_IDS is set via .replit (documented
//     known-environmental trap), so the set may be pre-populated. The
//     property under test is that an id NOT in the set writes nothing.
//  2. Allowlisted userId → exactly one PutObject under nocatch-diagnostics/
//     with the locked sidecar shape (cause, similarityValues, bridge fields).
//  3. R2 send throws → writeNocatchDiagnostic resolves without rethrowing,
//     so a sidecar failure can never alter the scoring response.

import { test, before, mock } from "node:test";
import assert from "node:assert/strict";

// ─── S3 mock state ────────────────────────────────────────────────────────────

let sendCallCount = 0;
const sendCalls: Array<{ Key: string; Body: unknown; Bucket: string }> = [];
let sendShouldThrow = false;

function resetSendState() {
  sendCallCount = 0;
  sendCalls.length = 0;
  sendShouldThrow = false;
}

mock.module("@aws-sdk/client-s3", {
  namedExports: {
    S3Client: class MockS3Client {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      send(command: any): Promise<Record<string, never>> {
        // Record the attempt BEFORE the throw branch so the fail-open test can
        // assert the rejecting send was actually reached.
        sendCallCount++;
        sendCalls.push({
          Key: command.input?.Key ?? "",
          Body: command.input?.Body,
          Bucket: command.input?.Bucket ?? "",
        });
        if (sendShouldThrow) return Promise.reject(new Error("R2 upload error"));
        return Promise.resolve({});
      }
    },
    PutObjectCommand: class PutObjectCommand {
      input: Record<string, unknown>;
      constructor(params: Record<string, unknown>) {
        this.input = params;
      }
    },
    ListObjectsV2Command: class ListObjectsV2Command {
      input: Record<string, unknown>;
      constructor(params: Record<string, unknown>) { this.input = params; }
    },
    GetObjectCommand: class GetObjectCommand {
      input: Record<string, unknown>;
      constructor(params: Record<string, unknown>) { this.input = params; }
    },
  },
});

before(() => {
  process.env.R2_ACCOUNT_ID = "test-account-id";
  process.env.R2_ACCESS_KEY_ID = "test-access-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.R2_BUCKET_NAME = "test-bucket";
});

function sampleDiagnostic(userId: string) {
  return {
    userId,
    languageCode: "gu",
    language: "Gujarati",
    phraseId: 42,
    targetNative: "કેમ છો",
    targetRomanized: "kem chho",
    targetEnglish: "How are you?",
    sttTranscriptMini: "कैम छो",
    sttTranscriptHq: "कैम छो",
    chosenTranscript: "कैम छो",
    normalizedTranscript: "कैमछ",
    normalizedTarget: "કેમછ",
    similarityValues: { rawSim: null, bridgedSim: 0.2, finalSim: null },
    cause: "no_match_after_bridge" as const,
    sttDisagreement: false,
    bridged: true,
    transcriptComparable: "kaima cho",
    targetComparable: "kema cho",
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("nocatch-diag: unlisted userId → no R2 write at all", async () => {
  const { writeNocatchDiagnostic } = await import("./nocatchDiagnostics");
  resetSendState();

  await writeNocatchDiagnostic(sampleDiagnostic("user_definitely_not_allowlisted_xyz"));

  assert.equal(sendCallCount, 0, "no PutObject for a non-allowlisted userId");
});

test("nocatch-diag: allowlisted userId → one sidecar under nocatch-diagnostics/ with locked shape", async () => {
  const { writeNocatchDiagnostic } = await import("./nocatchDiagnostics");
  const { pilotCaptureUserIds } = await import("./pilotCapture");
  const { _resetR2ClientForTest } = await import("./r2Client");
  _resetR2ClientForTest();

  const TEST_USER = "user_nocatch_diag_test";
  pilotCaptureUserIds.add(TEST_USER);
  try {
    resetSendState();

    await writeNocatchDiagnostic(sampleDiagnostic(TEST_USER));

    assert.equal(sendCallCount, 1, "exactly one PutObject (sidecar only, no clip)");
    const call = sendCalls[0]!;
    assert.ok(
      call.Key.startsWith("nocatch-diagnostics/gu/") && call.Key.endsWith(".json"),
      `key must match nocatch-diagnostics/gu/<uuid>.json, got: ${call.Key}`,
    );

    const json = JSON.parse((call.Body as Buffer).toString("utf-8"));
    // Ruling 5 locked shape.
    assert.equal(json.userId, TEST_USER);
    assert.equal(json.languageCode, "gu");
    assert.equal(json.cause, "no_match_after_bridge");
    assert.ok(typeof json.timestamp === "string" && json.timestamp.length > 0);
    assert.ok(typeof json.diagnosticId === "string" && json.diagnosticId.length > 0);
    assert.equal(json.targetNative, "કેમ છો");
    assert.equal(json.targetRomanized, "kem chho");
    assert.equal(json.targetEnglish, "How are you?");
    assert.equal(json.sttTranscriptMini, "कैम छो");
    assert.equal(json.sttTranscriptHq, "कैम छो");
    assert.equal(json.normalizedTranscript, "कैमछ");
    assert.equal(json.normalizedTarget, "કેમછ");
    // similarityValues is named exactly that, never "confidence".
    assert.deepEqual(json.similarityValues, { rawSim: null, bridgedSim: 0.2, finalSim: null });
    assert.ok(!("confidence" in json), "field must be similarityValues, not confidence");
    // Bridge visibility fields.
    assert.equal(json.bridged, true);
    assert.equal(json.transcriptComparable, "kaima cho");
    assert.equal(json.targetComparable, "kema cho");
  } finally {
    pilotCaptureUserIds.delete(TEST_USER);
  }
});

test("nocatch-diag: R2 send throws → resolves without rethrowing (scoring unaffected)", async () => {
  const { writeNocatchDiagnostic } = await import("./nocatchDiagnostics");
  const { pilotCaptureUserIds } = await import("./pilotCapture");
  const { _resetR2ClientForTest } = await import("./r2Client");
  _resetR2ClientForTest();

  const TEST_USER = "user_nocatch_diag_throw";
  pilotCaptureUserIds.add(TEST_USER);
  // Order matters: resetSendState() clears sendShouldThrow, so the throw flag
  // must be armed AFTER the reset or this test silently exercises the happy
  // path (a code-review round caught exactly that bug).
  resetSendState();
  sendShouldThrow = true;
  try {
    await assert.doesNotReject(
      () => writeNocatchDiagnostic(sampleDiagnostic(TEST_USER)),
      "writeNocatchDiagnostic must never throw, even when R2 send rejects",
    );
    assert.equal(
      sendCallCount,
      1,
      "the rejecting send must actually have been attempted",
    );
  } finally {
    pilotCaptureUserIds.delete(TEST_USER);
    sendShouldThrow = false;
  }
});
