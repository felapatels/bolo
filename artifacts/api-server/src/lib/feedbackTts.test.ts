import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import { db, pool, ttsCacheTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import openaiRouter from "../routes/openai";
import {
  feedbackSpokenText,
  prewarmFeedbackTts,
  getPendingFeedbackSynthesis,
  registerPendingFeedbackSynthesis,
} from "./feedbackTts";
import { phraseTtsCacheKey } from "./ttsCache";
import { phraseAudioIdentity } from "./ttsConfig";

// Task 903 — eval-time fire-and-forget feedback TTS prewarm.
//
// 1. UNIT: feedbackSpokenText matches the exact string both clients build
//    ([feedback, tip].filter(Boolean).join(" ")) — if it drifts, the prewarm
//    lands in a cache key the client never requests and is pure waste.
// 2. UNIT: prewarmFeedbackTts registers an in-flight pending entry, writes
//    the ttsCache row before resolving, dedupes concurrent calls, and clears
//    the pending map after settling (success and failure alike).
// 3. INTEGRATION: /openai/tts joins the pending synthesis instead of
//    starting a duplicate — the client gets the prewarmed audio bytes.
//
// See .agents/memory/api-server-tests.md for shared dev DB conventions.

const RUN = `_${process.pid}`;
const identity = phraseAudioIdentity(undefined);

function keyFor(text: string): string {
  // Feedback text is synthesized with no language hint (clients send only
  // { text }), so the language slot is the empty string.
  return phraseTtsCacheKey(text, identity.provider, identity.model, identity.voice, "");
}

const quietLog = { info: () => {}, warn: () => {} };

let app: Express;
let server: Server;
let baseUrl: string;

const cleanupKeys: string[] = [];

before(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tts_cache (
      cache_key text PRIMARY KEY,
      audio_base64 text NOT NULL,
      format text NOT NULL DEFAULT 'mp3',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).log = { warn: () => {}, error: () => {}, info: () => {} };
    next();
  });
  app.use(openaiRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  for (const key of cleanupKeys) {
    await db.delete(ttsCacheTable).where(eq(ttsCacheTable.cacheKey, key));
  }
  await new Promise<void>((resolve, reject) => {
    server.close((err?: Error) => (err ? reject(err) : resolve()));
  });
});

// ─── Unit: spoken-text contract with the clients ─────────────────────────────

test("feedbackSpokenText: joins feedback and tip with a single space", () => {
  assert.equal(
    feedbackSpokenText("Nice work!", "Soften the t."),
    "Nice work! Soften the t.",
  );
});

test("feedbackSpokenText: drops missing parts instead of leaving stray spaces", () => {
  assert.equal(feedbackSpokenText("Nice work!", null), "Nice work!");
  assert.equal(feedbackSpokenText("Nice work!", undefined), "Nice work!");
  assert.equal(feedbackSpokenText(null, "Just a tip."), "Just a tip.");
  assert.equal(feedbackSpokenText("", ""), "");
  assert.equal(feedbackSpokenText(null, undefined), "");
});

// ─── Unit: prewarm lifecycle ─────────────────────────────────────────────────

test("prewarmFeedbackTts: registers pending work, caches the audio, then clears", async () => {
  const feedback = `__feedback_prewarm_test${RUN}`;
  const tip = "One more time.";
  const text = feedbackSpokenText(feedback, tip);
  const cacheKey = keyFor(text);
  cleanupKeys.push(cacheKey);

  prewarmFeedbackTts(feedback, tip, quietLog, {
    synthesize: async () => Buffer.from("PREWARMED_AUDIO_BYTES"),
  });

  const pending = getPendingFeedbackSynthesis(cacheKey);
  assert.ok(pending, "prewarm must register an in-flight pending entry synchronously");

  const result = await pending;
  assert.equal(result.audioBase64, Buffer.from("PREWARMED_AUDIO_BYTES").toString("base64"));
  assert.equal(result.format, "mp3");

  // Cache row is written before the promise resolves, so a request that
  // misses the (already cleared) pending map still hits the cache.
  const row = await db.query.ttsCacheTable.findFirst({
    where: eq(ttsCacheTable.cacheKey, cacheKey),
  });
  assert.ok(row, "ttsCache row must exist by the time the pending promise resolves");
  assert.equal(row.audioBase64, result.audioBase64);

  // The pending entry is removed once settled (clearing is scheduled on the
  // same promise — give the microtask queue one turn).
  await new Promise((r) => setImmediate(r));
  assert.equal(
    getPendingFeedbackSynthesis(cacheKey),
    undefined,
    "pending entry must be cleared after the synthesis settles",
  );
});

test("prewarmFeedbackTts: concurrent calls for the same text synthesize once", async () => {
  const feedback = `__feedback_dedupe_test${RUN}`;
  const text = feedbackSpokenText(feedback, null);
  const cacheKey = keyFor(text);
  cleanupKeys.push(cacheKey);

  let synthCalls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const synthesize = async () => {
    synthCalls += 1;
    await gate;
    return Buffer.from("DEDUPED_AUDIO");
  };

  prewarmFeedbackTts(feedback, null, quietLog, { synthesize });
  prewarmFeedbackTts(feedback, null, quietLog, { synthesize });

  const pending = getPendingFeedbackSynthesis(cacheKey);
  assert.ok(pending);
  release();
  await pending;
  assert.equal(synthCalls, 1, "second prewarm for the same text must join, not re-synthesize");
});

test("prewarmFeedbackTts: failure never caches, never throws, and clears pending", async () => {
  const feedback = `__feedback_failure_test${RUN}`;
  const text = feedbackSpokenText(feedback, null);
  const cacheKey = keyFor(text);

  let warned = false;
  // Must not throw even though synthesis rejects.
  prewarmFeedbackTts(feedback, null, { info: () => {}, warn: () => { warned = true; } }, {
    synthesize: async () => {
      throw new Error("synthesis exploded");
    },
  });

  const pending = getPendingFeedbackSynthesis(cacheKey);
  assert.ok(pending, "failing prewarm still registers (the route falls through on rejection)");
  await pending.catch(() => {});
  await new Promise((r) => setImmediate(r));

  assert.equal(warned, true, "failure must be logged, not swallowed silently");
  assert.equal(getPendingFeedbackSynthesis(cacheKey), undefined, "pending cleared after failure");
  const row = await db.query.ttsCacheTable.findFirst({
    where: eq(ttsCacheTable.cacheKey, cacheKey),
  });
  assert.equal(row, undefined, "failed synthesis must never write a cache row");
});

// ─── Integration: /openai/tts joins the in-flight prewarm ───────────────────

test("/openai/tts joins an in-flight prewarm instead of synthesizing a duplicate", async () => {
  const text = `__feedback_route_join_test${RUN} Great effort.`;
  const cacheKey = keyFor(text);
  cleanupKeys.push(cacheKey);

  // Simulate an eval-time prewarm still in flight when the client's request
  // arrives: a deferred promise registered under the exact key the route
  // computes for this request (no voice/language in the body → default
  // phrase-audio identity, empty language slot).
  let release!: () => void;
  const joined = new Promise<{ audioBase64: string; format: string }>((resolve) => {
    release = () => resolve({ audioBase64: "b64_FROM_PREWARM==", format: "mp3" });
  });
  registerPendingFeedbackSynthesis(cacheKey, joined);

  const resPromise = fetch(`${baseUrl}/openai/tts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  // Let the request reach the route and block on the pending entry, then
  // finish the "synthesis".
  await new Promise((r) => setTimeout(r, 50));
  release();

  const res = await resPromise;
  const json: any = await res.json();
  assert.equal(res.status, 200);
  assert.equal(
    json.audioBase64,
    "b64_FROM_PREWARM==",
    "the route must serve the prewarmed audio — a fresh synthesis would return different bytes (or 502 in tests)",
  );
});
