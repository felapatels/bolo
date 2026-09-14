// The Script Trace free taste: the first TRACE_TEASER_LIMIT characters of every
// language are writable by any plan. Since 365d47fe the rest of journey 1 zone
// 1's stop is free too (Zone 1 is free); past Zone 1 it is All-Access.
//
// WHY THIS FILE EXISTS. Script Trace shipped hard-gated: `scriptTrace` is false
// for Free AND One-Language, both progress endpoints answered 402, and the web
// page redirected every non-Plus learner to /upgrade. The journey map's tracing
// stop, meanwhile, is deliberately never progression-locked, so a Free learner
// tapped a card that showed no lock and landed on the paywall. The owner ruled
// 2026-08-23 that tracing gets the same taste the voice lessons already give
// (lib/teaser.ts serves the first 3 phrases of any locked language), and this is
// the server half of it.
//
// The endpoints had NO route-level test of any kind before this, which is how
// the gate could be widened without a single assertion changing.
//
// Rows are scoped to test-only user ids and cleaned up by user id, never by
// chapter or language, which would delete real progress in the shared dev
// Postgres. See .agents/memory/api-server-tests.md.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import { db, pool, usersTable, scriptTraceProgressTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  traceStopFor,
  traceTeaserCharacters,
  TRACE_TEASER_LIMIT,
} from "@workspace/script-trace";
import gamesRouter from "./games";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

const FREE_USER_ID = "test_trace_teaser_free";
const PLUS_USER_ID = "test_trace_teaser_plus";
const LANG = "gu";

let app: Express;
let server: Server;
let baseUrl: string;
let currentUserId = FREE_USER_ID;

async function postProgress(body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/games/script-trace/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** The taste, and a character on the paid side of the line. */
const tasted = () => traceTeaserCharacters(LANG);
/**
 * A character a Free caller does not own: the first of journey 1 zone 2.
 *
 * It used to be the fourth character of zone 1's stop. 365d47fe made all of
 * Zone 1 free, tracing stop included (canTraceOwnedCharacter, following the
 * zone-one-free ruling), so that character is writable by design and the old
 * 402 assertion described a world the product left. Zone 2 is the nearest
 * character that is still genuinely paid.
 */
const paid = () => traceStopFor(LANG, 1, 2)!.characters[0]!;

before(async () => {
  await ensureUsersColumns();
  await db
    .insert(usersTable)
    .values([
      { id: FREE_USER_ID, email: null, displayName: "Trace Teaser Free" },
      { id: PLUS_USER_ID, email: null, displayName: "Trace Teaser Plus" },
    ])
    .onConflictDoNothing();
  await db
    .update(usersTable)
    .set({ tier: "free", subscriptionStatus: null })
    .where(eq(usersTable.id, FREE_USER_ID));
  await db
    .update(usersTable)
    .set({ tier: "plus", subscriptionStatus: "active" })
    .where(eq(usersTable.id, PLUS_USER_ID));

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = currentUserId;
    next();
  });
  app.use(loadEntitlements);
  app.use(gamesRouter);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await db
    .delete(scriptTraceProgressTable)
    .where(eq(scriptTraceProgressTable.userId, FREE_USER_ID));
  await db
    .delete(scriptTraceProgressTable)
    .where(eq(scriptTraceProgressTable.userId, PLUS_USER_ID));
  server?.close();
  await pool.end();
});

test("the taste is three characters, and a Free caller may write them", async () => {
  currentUserId = FREE_USER_ID;
  const taste = tasted();
  assert.equal(taste.length, TRACE_TEASER_LIMIT);
  for (const c of taste) {
    const { status } = await postProgress({
      languageCode: LANG,
      chapter: c.chapterId,
      characterId: c.id,
      passed: true,
      score: 88,
    });
    // 201, NOT 200. The route has always answered 201 and openapi.yaml has
    // always documented it as "the updated character progress after the
    // attempt". This file asserted 200 because it was written and never run:
    // the api suite needs the dev database, so it is Repl Shell or nowhere, and
    // nobody ran it before the handoff. Caught by the first real run, chat 5.
    assert.equal(status, 201, `Free caller must be able to trace ${c.id}`);
  }
});

test("a character past the free Zone 1 is paid", async () => {
  currentUserId = FREE_USER_ID;
  const c = paid();
  const { status } = await postProgress({
    languageCode: LANG,
    chapter: c.chapterId,
    characterId: c.id,
    passed: true,
    score: 88,
  });
  // The free carve-out is Zone 1, not the whole alphabet. This is the
  // assertion that stops it quietly widening to a free feature.
  assert.equal(status, 402, "past the taste a Free caller must be refused");
});

test("a paying caller writes anything, taste or not", async () => {
  currentUserId = PLUS_USER_ID;
  const c = paid();
  const { status } = await postProgress({
    languageCode: LANG,
    chapter: c.chapterId,
    characterId: c.id,
    passed: true,
    score: 88,
  });
  // 201 for the same reason as above: the route's documented success status.
  assert.equal(status, 201);
});

test("a character id alone cannot buy in: the language is checked too", async () => {
  currentUserId = FREE_USER_ID;
  const guFirst = tasted()[0]!;
  // Gujarati's first letter is not Tamil's, and claiming otherwise must fail
  // on the chapter check rather than sliding through the teaser carve-out.
  const { status } = await postProgress({
    languageCode: "ta",
    chapter: guFirst.chapterId,
    characterId: guFirst.id,
    passed: true,
    score: 88,
  });
  assert.equal(status, 400);
});

test("a malformed body is a 400 for a Free caller, not a 402", async () => {
  currentUserId = FREE_USER_ID;
  // The body is parsed BEFORE the plan is checked now, and it has to be: the
  // taste is defined per character, so there is no way to know whether this
  // caller may write until we know what they are writing.
  const { status } = await postProgress({ chapter: "gujarati-vowels" });
  assert.equal(status, 400);
});

test("a Free caller can read back the progress they just made", async () => {
  currentUserId = FREE_USER_ID;
  const c = tasted()[0]!;
  const res = await fetch(
    `${baseUrl}/games/script-trace/progress?chapter=${encodeURIComponent(c.chapterId)}`,
  );
  assert.equal(res.status, 200, "the GET is open to every plan since the taste");
  const rows = (await res.json()) as { characterId: string; passed: boolean }[];
  // Keeping the 402 here would have left the journey map unable to show a Free
  // learner the three letters they had just traced.
  assert.ok(
    rows.some((r) => r.characterId === c.id && r.passed),
    "the traced character must come back",
  );
});
