import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import openaiRouter from "./openai";
import {
  createChatAudioStream,
  getChatAudioStream,
  appendChatAudioChunk,
  completeChatAudioStream,
  failChatAudioStream,
} from "../lib/chatAudioStreams";

// Route-level tests for GET /openai/chat/audio/:streamId, the progressive
// per-turn voice stream that lets mobile players start Bolo's reply before
// synthesis finishes. The stream registry is fed directly (no AI calls).

const TEST_USER = "test_chat_audio_stream";
const OTHER_USER = "test_chat_audio_stream_other";

let app: Express;
let server: Server;
let baseUrl: string;
let currentUser = TEST_USER;

before(async () => {
  app = express();
  app.use(express.json());
  // Minimal auth shim mirroring requireAuth's contract.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId: string }).userId = currentUser;
    next();
  });
  app.use(openaiRouter);
  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  server.close();
});

test("unknown streamId returns 404", async () => {
  const res = await fetch(`${baseUrl}/openai/chat/audio/deadbeef`);
  assert.equal(res.status, 404);
});

test("another user's stream is not served", async () => {
  const stream = createChatAudioStream(OTHER_USER);
  appendChatAudioChunk(stream, Buffer.from("aa"));
  completeChatAudioStream(stream);
  const res = await fetch(`${baseUrl}/openai/chat/audio/${stream.id}`);
  assert.equal(res.status, 404);
});

test("completed stream serves the exact concatenated bytes and ends cleanly", async () => {
  const stream = createChatAudioStream(TEST_USER);
  const parts = [Buffer.from("chunk-one-"), Buffer.from("chunk-two-"), Buffer.from("end")];
  for (const p of parts) appendChatAudioChunk(stream, p);
  completeChatAudioStream(stream);

  const res = await fetch(`${baseUrl}/openai/chat/audio/${stream.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "audio/mpeg");
  const body = Buffer.from(await res.arrayBuffer());
  assert.equal(body.toString(), Buffer.concat(parts).toString());

  // Re-servable: a completed stream survives the first read so a native
  // player's second request for the same URL (AVPlayer does this) still
  // gets the full clip instead of a 404.
  assert.notEqual(getChatAudioStream(stream.id), undefined);
  const again = await fetch(`${baseUrl}/openai/chat/audio/${stream.id}`);
  assert.equal(again.status, 200);
  assert.equal(
    Buffer.from(await again.arrayBuffer()).toString(),
    Buffer.concat(parts).toString(),
  );
});

test("bytes appended AFTER the reader connects are delivered progressively", async () => {
  const stream = createChatAudioStream(TEST_USER);
  appendChatAudioChunk(stream, Buffer.from("early-"));

  const resPromise = fetch(`${baseUrl}/openai/chat/audio/${stream.id}`);
  // Give the reader a moment to connect and drain the first chunk.
  await new Promise((r) => setTimeout(r, 50));
  appendChatAudioChunk(stream, Buffer.from("late-"));
  completeChatAudioStream(stream);

  const res = await resPromise;
  const body = Buffer.from(await res.arrayBuffer());
  assert.equal(body.toString(), "early-late-");
});

test("failed stream aborts the connection instead of ending cleanly", async () => {
  const stream = createChatAudioStream(TEST_USER);
  appendChatAudioChunk(stream, Buffer.from("partial"));

  const resPromise = fetch(`${baseUrl}/openai/chat/audio/${stream.id}`);
  await new Promise((r) => setTimeout(r, 50));
  failChatAudioStream(stream);

  // The socket is destroyed mid-body, so reading the body must reject, a native player sees an error, never a "finished" truncated clip.
  await assert.rejects(async () => {
    const res = await resPromise;
    await res.arrayBuffer();
  });
});

test("failStream after completeStream is a no-op (audioDone wins)", async () => {
  const stream = createChatAudioStream(TEST_USER);
  appendChatAudioChunk(stream, Buffer.from("done"));
  completeChatAudioStream(stream);
  failChatAudioStream(stream); // route calls this unconditionally post-turn

  const res = await fetch(`${baseUrl}/openai/chat/audio/${stream.id}`);
  assert.equal(res.status, 200);
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(), "done");
});
