import { test, before, mock } from "node:test";
import assert from "node:assert/strict";

// Unit tests for sendContactNotification.
//
// Verified contracts:
//   1. reply_to equals the submitter's email address
//   2. to uses process.env.SUPPORT_INBOX_EMAIL when set
//   3. to falls back to "LARKsupport@gmail.com" when SUPPORT_INBOX_EMAIL is unset
//
// The Resend SDK is replaced by a module mock so no network calls are made.
// The singleton inside resendClient.ts is created on the first send call and
// reused for the file — the shared capturedCalls array records every send call.

// ─── Shared mock state ────────────────────────────────────────────────────────

const capturedCalls: Record<string, unknown>[] = [];

// mock.module must be awaited BEFORE importing the module under test so that
// the ESM loader picks up the mock when resendClient.ts is first evaluated.
await mock.module("resend", {
  namedExports: {
    Resend: class MockResend {
      emails = {
        send: async (args: Record<string, unknown>) => {
          capturedCalls.push(args);
          return { data: { id: "mock-id" }, error: null };
        },
      };
    },
  },
});

// Dynamic import AFTER mock registration so the mocked Resend class is used
// when resendClient.ts is first evaluated and the lazy singleton is created.
const { sendContactNotification } = await import("./resendClient");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeParams(email = "user@example.com") {
  return {
    name: "Test User",
    email,
    category: "bug",
    message: "Something is broken",
    userId: "user_123",
    createdAt: new Date("2026-07-31T12:00:00.000Z"),
  };
}

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

before(() => {
  // Ensure the env vars needed for the happy path are present for every test.
  // Individual tests override them inside withEnv() as needed.
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM = "hello@bolo-india.app";
});

test("sendContactNotification: reply_to equals the submitter email", async () => {
  const startIdx = capturedCalls.length;

  await withEnv({ SUPPORT_INBOX_EMAIL: "team@example.com" }, async () => {
    const ok = await sendContactNotification(makeParams("alice@example.com"));
    assert.equal(ok, true, "expected sendContactNotification to return true");
  });

  const call = capturedCalls[startIdx];
  assert.ok(call, "expected Resend emails.send to have been called");
  assert.equal(call.reply_to, "alice@example.com");
});

test("sendContactNotification: to uses SUPPORT_INBOX_EMAIL when set", async () => {
  const startIdx = capturedCalls.length;

  await withEnv({ SUPPORT_INBOX_EMAIL: "support@myteam.com" }, async () => {
    const ok = await sendContactNotification(makeParams());
    assert.equal(ok, true, "expected sendContactNotification to return true");
  });

  const call = capturedCalls[startIdx];
  assert.ok(call, "expected Resend emails.send to have been called");
  assert.equal(call.to, "support@myteam.com");
});

test("sendContactNotification: to falls back to LARKsupport@gmail.com when SUPPORT_INBOX_EMAIL is unset", async () => {
  const startIdx = capturedCalls.length;

  await withEnv({ SUPPORT_INBOX_EMAIL: undefined }, async () => {
    const ok = await sendContactNotification(makeParams());
    assert.equal(ok, true, "expected sendContactNotification to return true");
  });

  const call = capturedCalls[startIdx];
  assert.ok(call, "expected Resend emails.send to have been called");
  assert.equal(call.to, "LARKsupport@gmail.com");
});
