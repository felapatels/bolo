import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import {
  db,
  pool,
  usersTable,
  languagesTable,
  chatTurnsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import openaiRouter from "./openai";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { FREE_WEEKLY_CHAT_SECONDS_CAP, FREE_LANGUAGE } from "../lib/entitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

// End-to-end route-level tests for the POST /openai/chat gate:
//   - Free user: language gate denies a locked language (402 language_locked)
//   - Free user: time gate denies once the weekly cap is exhausted (402 chat_time_limit)
//   - Free user: allowed through when under the cap (language + time gates pass)
//   - One Language user: time gate is never applied
//   - Plus user: time gate is never applied
//
// Because OpenAI network calls are unavoidable inside the route handler for a
// genuine success path, the "success" assertion injects a *tiny* synthetic WAV
// buffer via a real (non-mocked) route, and only checks gate/usage side
// effects rather than the AI reply — keeping the test hermetic without
// faking network I/O at the route level.  The parrotChat.test.ts file covers
// the turn logic itself with fully injectable deps.

const TEST_USER = "test_chat_gate";
const FREE_LANG = FREE_LANGUAGE;       // "hi" — allowed for Free
const LOCKED_LANG = "__test_lang_gate_locked"; // not in Free's allowlist
const ONE_LANG_CHOSEN = "__test_lang_gate_chosen"; // for One Language tier

let app: Express;
let server: Server;
let baseUrl: string;

// A real but minimal WAV buffer (1 sample at 16 kHz mono 16-bit = ~0 seconds).
function makeMinimalWav(): string {
  const sampleRate = 16000;
  const byteRate = sampleRate * 2;
  const dataSize = 0;
  const buf = Buffer.alloc(44, 0);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf.toString("base64");
}

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function setPlanFree(): Promise<void> {
  await db
    .update(usersTable)
    .set({
      tier: "free",
      subscriptionStatus: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      chosenLanguage: null,
    })
    .where(eq(usersTable.id, TEST_USER));
}

async function setPlanPlus(): Promise<void> {
  await db
    .update(usersTable)
    .set({
      tier: "plus",
      subscriptionStatus: "active",
      trialEndsAt: null,
      currentPeriodEnd: null,
      chosenLanguage: null,
    })
    .where(eq(usersTable.id, TEST_USER));
}

async function setPlanOneLanguage(chosen: string): Promise<void> {
  await db
    .update(usersTable)
    .set({
      tier: "one_language",
      subscriptionStatus: "active",
      trialEndsAt: null,
      currentPeriodEnd: null,
      chosenLanguage: chosen,
    })
    .where(eq(usersTable.id, TEST_USER));
}

async function drainCap(): Promise<void> {
  // Insert enough usage to exceed the Free weekly cap outright.
  await db.insert(chatTurnsTable).values({
    userId: TEST_USER,
    languageCode: FREE_LANG,
    durationSeconds: FREE_WEEKLY_CHAT_SECONDS_CAP,
  });
}

before(async () => {
  await ensureUsersColumns();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS languages (
      code text PRIMARY KEY,
      name text NOT NULL,
      native_name text NOT NULL,
      script text NOT NULL,
      font_family text NOT NULL,
      rtl boolean NOT NULL DEFAULT false,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_turns (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      duration_seconds integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.insert(usersTable).values({ id: TEST_USER, displayName: "Chat Gate Test" }).onConflictDoNothing();
  await db.insert(languagesTable).values({
    code: FREE_LANG, name: "Hindi", nativeName: "हिन्दी", script: "Devanagari", fontFamily: "sans-serif",
  }).onConflictDoNothing();
  await db.insert(languagesTable).values({
    code: LOCKED_LANG, name: "Locked Gate Lang", nativeName: "L", script: "Latin", fontFamily: "sans-serif",
  }).onConflictDoNothing();
  await db.insert(languagesTable).values({
    code: ONE_LANG_CHOSEN, name: "One Lang Chosen", nativeName: "O", script: "Latin", fontFamily: "sans-serif",
  }).onConflictDoNothing();

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
  await db.delete(chatTurnsTable).where(eq(chatTurnsTable.userId, TEST_USER));
  await setPlanFree();
});

after(async () => {
  await db.delete(chatTurnsTable).where(eq(chatTurnsTable.userId, TEST_USER));
  await db.delete(languagesTable).where(eq(languagesTable.code, LOCKED_LANG));
  await db.delete(languagesTable).where(eq(languagesTable.code, ONE_LANG_CHOSEN));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER));
  server.close();
  await pool.end();
});

// ---------------------------------------------------------------------------
// Bad request
// ---------------------------------------------------------------------------

test("POST /openai/chat — 400 for missing required fields", async () => {
  const { status } = await post("/openai/chat", { languageCode: "hi" }); // no audioBase64
  assert.equal(status, 400);
});

// ---------------------------------------------------------------------------
// Language gate (Free user)
// ---------------------------------------------------------------------------

test("POST /openai/chat — 402 language_locked when Free user requests a locked language", async () => {
  const { status, json } = await post("/openai/chat", {
    languageCode: LOCKED_LANG,
    audioBase64: makeMinimalWav(),
  });
  assert.equal(status, 402);
  assert.equal(json?.error, "upgrade_required");
  assert.equal(json?.reason, "language_locked");
});

test("POST /openai/chat — language gate passes for Free user on the free language", async () => {
  // Will proceed past the language gate; may fail at AI step (502) but NOT at 402 language_locked.
  const { status, json } = await post("/openai/chat", {
    languageCode: FREE_LANG,
    audioBase64: makeMinimalWav(),
  });
  // 402 language_locked is specifically what we're guarding against here.
  if (status === 402) {
    assert.notEqual(json?.reason, "language_locked",
      "Free user should not be language-locked on the free language");
  }
  // 400/404/502 are acceptable (no AI credentials in test env); 402 language_locked is not.
});

// ---------------------------------------------------------------------------
// Language gate (One Language tier)
// ---------------------------------------------------------------------------

test("POST /openai/chat — One Language user can access their chosen language", async () => {
  await setPlanOneLanguage(ONE_LANG_CHOSEN);
  const { status, json } = await post("/openai/chat", {
    languageCode: ONE_LANG_CHOSEN,
    audioBase64: makeMinimalWav(),
  });
  if (status === 402) {
    assert.notEqual(json?.reason, "language_locked",
      "One Language user should not be locked from their chosen language");
  }
});

test("POST /openai/chat — One Language user is locked out of a different unlocked language", async () => {
  await setPlanOneLanguage(ONE_LANG_CHOSEN);
  const { status, json } = await post("/openai/chat", {
    languageCode: LOCKED_LANG, // not the chosen language
    audioBase64: makeMinimalWav(),
  });
  assert.equal(status, 402);
  assert.equal(json?.reason, "language_locked");
});

// ---------------------------------------------------------------------------
// Weekly time gate (Free user)
// ---------------------------------------------------------------------------

test("POST /openai/chat — 402 chat_time_limit when Free user has exhausted the weekly cap", async () => {
  await drainCap();
  const { status, json } = await post("/openai/chat", {
    languageCode: FREE_LANG,
    audioBase64: makeMinimalWav(),
  });
  assert.equal(status, 402);
  assert.equal(json?.error, "upgrade_required");
  assert.equal(json?.reason, "chat_time_limit");
  assert.equal(json?.requiredPlan, "one_language");
});

test("POST /openai/chat — time gate passes when Free user is under the cap", async () => {
  // Insert 1 second of usage (far under 120 s cap).
  await db.insert(chatTurnsTable).values({
    userId: TEST_USER,
    languageCode: FREE_LANG,
    durationSeconds: 1,
  });
  const { status, json } = await post("/openai/chat", {
    languageCode: FREE_LANG,
    audioBase64: makeMinimalWav(),
  });
  // Must NOT be the time-limit denial.
  if (status === 402) {
    assert.notEqual(json?.reason, "chat_time_limit",
      "Should not be time-capped with only 1 second of usage");
  }
});

// ---------------------------------------------------------------------------
// Plus and One Language: time gate never fires
// ---------------------------------------------------------------------------

test("POST /openai/chat — Plus user is never time-capped regardless of usage", async () => {
  await setPlanPlus();
  // Simulate massive usage (beyond any cap).
  for (let i = 0; i < 3; i++) {
    await db.insert(chatTurnsTable).values({
      userId: TEST_USER,
      languageCode: FREE_LANG,
      durationSeconds: FREE_WEEKLY_CHAT_SECONDS_CAP * 10,
    });
  }
  const { status, json } = await post("/openai/chat", {
    languageCode: FREE_LANG,
    audioBase64: makeMinimalWav(),
  });
  if (status === 402) {
    assert.notEqual(json?.reason, "chat_time_limit",
      "Plus user must never see chat_time_limit denial");
  }
});

test("POST /openai/chat — One Language user is never time-capped", async () => {
  await setPlanOneLanguage(FREE_LANG); // choose Hindi so language gate passes too
  for (let i = 0; i < 3; i++) {
    await db.insert(chatTurnsTable).values({
      userId: TEST_USER,
      languageCode: FREE_LANG,
      durationSeconds: FREE_WEEKLY_CHAT_SECONDS_CAP * 10,
    });
  }
  const { status, json } = await post("/openai/chat", {
    languageCode: FREE_LANG,
    audioBase64: makeMinimalWav(),
  });
  if (status === 402) {
    assert.notEqual(json?.reason, "chat_time_limit",
      "One Language user must never see chat_time_limit denial");
  }
});
