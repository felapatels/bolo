import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { db, pool, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import openaiRouter from "./openai";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

// Route-level gate tests for POST /openai/tts with previewVoiceId:
//   - Free user → 402 (voice selection is Plus-only)
//   - One-Language user → 402
//   - Plus user → not 402 (request proceeds past the gate)
//
// The Plus success path reaches ElevenLabs / OpenAI, which we cannot call in
// CI; we only assert it gets past the gate (response is not 402).  A test
// double for the TTS synthesis layer is left as a future hardening step.

const TEST_USER = "test_tts_preview_gate";

// A catalog voice ID known to be valid (George).
const VALID_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const SAMPLE_TEXT = "Namaste, I am learning your language.";

let app: Express;
let server: Server;
let baseUrl: string;

async function setPlanFree(): Promise<void> {
  await db
    .update(usersTable)
    .set({ tier: "free", subscriptionStatus: null, trialEndsAt: null, currentPeriodEnd: null })
    .where(eq(usersTable.id, TEST_USER));
}

async function setPlanOneLanguage(): Promise<void> {
  await db
    .update(usersTable)
    .set({ tier: "one_language", subscriptionStatus: "active", trialEndsAt: null, currentPeriodEnd: null })
    .where(eq(usersTable.id, TEST_USER));
}

async function setPlanPlus(): Promise<void> {
  await db
    .update(usersTable)
    .set({ tier: "plus", subscriptionStatus: "active", trialEndsAt: null, currentPeriodEnd: null })
    .where(eq(usersTable.id, TEST_USER));
}

async function postTts(body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/openai/tts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

before(async () => {
  await ensureUsersColumns();

  await db
    .insert(usersTable)
    .values({ id: TEST_USER, displayName: "TTS Preview Gate Test" })
    .onConflictDoNothing();

  // Stub requireAuth: inject TEST_USER as the authenticated caller.
  app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).userId = TEST_USER;
    next();
  });
  app.use(loadEntitlements);
  app.use(openaiRouter);

  server = app.listen(0);
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

beforeEach(async () => {
  await setPlanFree();
});

after(async () => {
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test("Free user with previewVoiceId gets 402 upgrade_required", async () => {
  await setPlanFree();
  const { status, json } = await postTts({
    text: SAMPLE_TEXT,
    previewVoiceId: VALID_VOICE_ID,
  });
  assert.equal(status, 402, `expected 402 but got ${status}: ${JSON.stringify(json)}`);
  assert.equal(json?.error, "upgrade_required");
  assert.equal(json?.reason, "feature_locked");
});

test("One-Language user with previewVoiceId gets 402 upgrade_required", async () => {
  await setPlanOneLanguage();
  const { status, json } = await postTts({
    text: SAMPLE_TEXT,
    previewVoiceId: VALID_VOICE_ID,
  });
  assert.equal(status, 402, `expected 402 but got ${status}: ${JSON.stringify(json)}`);
  assert.equal(json?.error, "upgrade_required");
});

test("Free user without previewVoiceId is not blocked by the preview gate", async () => {
  await setPlanFree();
  // Without previewVoiceId the request goes to normal TTS synthesis — it may
  // fail for other reasons (ElevenLabs key, etc.) but must not 402 at the gate.
  const { status } = await postTts({ text: SAMPLE_TEXT, languageCode: "hi" });
  assert.notEqual(status, 402, "previewVoiceId gate must not fire when previewVoiceId is absent");
});

test("Plus user with previewVoiceId passes the gate (not 402)", async () => {
  await setPlanPlus();
  // The request will proceed past the gate to TTS synthesis. Since we are not
  // mocking the ElevenLabs/gpt-audio layer, it may succeed or fail at the
  // network level — but it must not be gated out with 402.
  const { status } = await postTts({
    text: SAMPLE_TEXT,
    previewVoiceId: VALID_VOICE_ID,
  });
  assert.notEqual(status, 402, `Plus user must not be blocked by the gate; got ${status}`);
});

test("Invalid previewVoiceId (not in catalog) is treated as absent — no gate fires", async () => {
  await setPlanFree();
  // An unrecognized ID is silently ignored (falls through to normal TTS path).
  // Should not return 402 from the preview gate.
  const { status } = await postTts({
    text: SAMPLE_TEXT,
    previewVoiceId: "not-a-real-voice-id",
    languageCode: "hi",
  });
  assert.notEqual(status, 402, "invalid previewVoiceId must not trigger the Plus gate");
});
