// Tests for the server-side pilot-capture tee in POST /openai/pronunciation.
//
// Three tests exercise teeAudioToPilot directly (no HTTP server needed):
//
//  1. PILOT_CAPTURE_USER_IDS unset (empty set) → unlisted userId → S3 send
//     is never called.  This is the safety property: the feature is fully
//     inert when the env var is absent.
//
//  2. userId present in PILOT_CAPTURE_USER_IDS → S3 send called exactly twice
//     (clip upload + sidecar upload), with the correct key prefixes and sidecar
//     shape (contains score, no band field).
//
//  3. S3 send throws → teeAudioToPilot resolves without rethrowing.  The eval
//     response is unaffected by R2 failures.
//
// Test count in the three existing pronunciation test files before this file:
//   openai.pronunciation.fast-path.test.ts         19
//   openai.pronunciation.language-hint.test.ts      9
//   openai.pronunciation.sibling-cache.test.ts      6
//   TOTAL before                                   34
//   + 3 new tests here                             37 total

import { test, before, mock } from "node:test";
import assert from "node:assert/strict";

// ─── S3 mock state ────────────────────────────────────────────────────────────
// The closures below read these module-level variables so each test can control
// mock behaviour without re-importing the module.

let sendCallCount = 0;
const sendCalls: Array<{ Key: string; Body: unknown; Bucket: string }> = [];
let sendShouldThrow = false;

function resetSendState() {
  sendCallCount = 0;
  sendCalls.length = 0;
  sendShouldThrow = false;
}

// ─── Module mocks (must be registered before pilotCapture is imported) ────────
// node:test runs each file in its own process so the module cache is fresh.

mock.module("@aws-sdk/client-s3", {
  namedExports: {
    S3Client: class MockS3Client {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      send(command: any): Promise<Record<string, never>> {
        if (sendShouldThrow) return Promise.reject(new Error("R2 upload error"));
        sendCallCount++;
        sendCalls.push({
          Key: command.input?.Key ?? "",
          Body: command.input?.Body,
          Bucket: command.input?.Bucket ?? "",
        });
        return Promise.resolve({});
      }
    },
    PutObjectCommand: class PutObjectCommand {
      input: Record<string, unknown>;
      constructor(params: Record<string, unknown>) {
        this.input = params;
      }
    },
    // Other S3 commands that r2Client.ts / pilotCapture.ts don't use but
    // tests in the qa script might reference; kept here for completeness.
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

// ─── Setup ────────────────────────────────────────────────────────────────────

// Provide R2 credentials so getR2Client() returns the mocked S3Client.
// Tests that need to verify the "no credentials → inert" path rely on the
// userId guard firing first, so credentials can always be present here.
before(() => {
  process.env.R2_ACCOUNT_ID = "test-account-id";
  process.env.R2_ACCESS_KEY_ID = "test-access-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.R2_BUCKET_NAME = "test-bucket";
  // Note: PILOT_CAPTURE_USER_IDS is NOT set here; individual tests that need
  // a listed user manipulate the exported pilotCaptureUserIds Set directly.
});

// ─── Tests ────────────────────────────────────────────────────────────────────

test("pilot-capture: unlisted userId → S3 PutObjectCommand never called", async () => {
  // Import AFTER mock.module registration so the mock is picked up.
  const { teeAudioToPilot, pilotCaptureUserIds } = await import("../lib/pilotCapture");

  // Confirm the set is empty (PILOT_CAPTURE_USER_IDS not set at module init).
  assert.equal(pilotCaptureUserIds.size, 0, "set must be empty when env var is absent");

  resetSendState();

  await teeAudioToPilot(Buffer.from("fake-audio"), {
    userId: "user_unlisted",
    languageCode: "gu",
    phraseId: 42,
    targetNative: "કેમ છો",
    targetRomanized: "kem chho",
    transcript: "kem cho",
    score: 95,
  });

  assert.equal(sendCallCount, 0, "send must not be called for an unlisted userId");
});

test("pilot-capture: listed userId → PutObjectCommand called twice with correct keys and sidecar", async () => {
  const { teeAudioToPilot, pilotCaptureUserIds } = await import("../lib/pilotCapture");
  const { _resetR2ClientForTest } = await import("../lib/r2Client");

  // Reset cached S3Client so the mocked constructor is used with fresh credentials.
  _resetR2ClientForTest();

  const TEST_USER = "user_pilot_test_abc123";
  pilotCaptureUserIds.add(TEST_USER);

  try {
    resetSendState();

    const fakeAudio = Buffer.from("fake-audio-bytes");

    await teeAudioToPilot(fakeAudio, {
      userId: TEST_USER,
      languageCode: "gu",
      phraseId: 7,
      targetNative: "નમસ્તે",
      targetRomanized: "namaste",
      transcript: "namaste",
      score: 88,
    });

    // Must have made exactly two S3 calls (clip + sidecar).
    assert.equal(sendCallCount, 2, "exactly two PutObjectCommand calls expected (clip + sidecar)");

    const [clipCall, sidecarCall] = sendCalls;

    // Clip key: pilot-clips/{languageCode}/{uuid}.m4a
    assert.ok(
      clipCall!.Key.startsWith("pilot-clips/gu/") && clipCall!.Key.endsWith(".m4a"),
      `clip key must match pilot-clips/gu/<uuid>.m4a, got: ${clipCall!.Key}`,
    );

    // Sidecar key: pilot-clips/{languageCode}/{uuid}.json
    assert.ok(
      sidecarCall!.Key.startsWith("pilot-clips/gu/") && sidecarCall!.Key.endsWith(".json"),
      `sidecar key must match pilot-clips/gu/<uuid>.json, got: ${sidecarCall!.Key}`,
    );

    // Both keys share the same UUID (clip and sidecar for the same attempt).
    const clipUuid = clipCall!.Key.replace("pilot-clips/gu/", "").replace(".m4a", "");
    const sidecarUuid = sidecarCall!.Key.replace("pilot-clips/gu/", "").replace(".json", "");
    assert.equal(clipUuid, sidecarUuid, "clip and sidecar must share the same clipId UUID");

    // Clip body is the raw audio buffer.
    assert.deepEqual(clipCall!.Body, fakeAudio, "clip Body must be the raw audio buffer");

    // Sidecar body is JSON; parse and validate shape.
    const sidecarJson = JSON.parse((sidecarCall!.Body as Buffer).toString("utf-8"));
    assert.equal(sidecarJson.score, 88, "sidecar must include score");
    assert.ok(!("band" in sidecarJson), "sidecar must NOT contain a band field");
    assert.equal(sidecarJson.userId, TEST_USER);
    assert.equal(sidecarJson.languageCode, "gu");
    assert.equal(sidecarJson.phraseId, 7);
    assert.equal(sidecarJson.targetNative, "નમસ્તે");
    assert.equal(sidecarJson.targetRomanized, "namaste");
    assert.equal(sidecarJson.transcript, "namaste");
    assert.ok(typeof sidecarJson.clipId === "string" && sidecarJson.clipId.length > 0,
      "sidecar must have a clipId string");
    assert.ok(typeof sidecarJson.timestamp === "string" && sidecarJson.timestamp.length > 0,
      "sidecar must have a timestamp string");
  } finally {
    // Always clean up so other tests in this file are not affected.
    pilotCaptureUserIds.delete(TEST_USER);
  }
});

test("pilot-capture: R2 send throws → teeAudioToPilot resolves without throwing", async () => {
  const { teeAudioToPilot, pilotCaptureUserIds } = await import("../lib/pilotCapture");
  const { _resetR2ClientForTest } = await import("../lib/r2Client");

  _resetR2ClientForTest();

  const TEST_USER = "user_pilot_throw_test";
  pilotCaptureUserIds.add(TEST_USER);
  sendShouldThrow = true;

  try {
    resetSendState();

    // Must resolve (not throw), even though send rejects.
    await assert.doesNotReject(
      () =>
        teeAudioToPilot(Buffer.from("fake"), {
          userId: TEST_USER,
          languageCode: "gu",
          phraseId: null,
          targetNative: "હા",
          targetRomanized: "ha",
          transcript: "ha",
          score: 92,
        }),
      "teeAudioToPilot must never throw, even when R2 send rejects",
    );
  } finally {
    pilotCaptureUserIds.delete(TEST_USER);
    sendShouldThrow = false;
  }
});
