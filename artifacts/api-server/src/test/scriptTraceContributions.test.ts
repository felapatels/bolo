/**
 * scriptTraceContributions.test.ts
 *
 * The public submission endpoint behind the tracing page at /aksharmala.html.
 *
 * WHAT MATTERS HERE, and why these particular assertions. This is an OPEN write
 * endpoint on the production API, mounted before requireAuth on purpose: the
 * contributors are relatives who write the script and have never signed in.
 * Everything that keeps that boring is a property worth pinning, because a
 * regression in any of it is a regression in the attack surface rather than in
 * a feature:
 *
 *   - it accepts a real payload without a session
 *   - it REFUSES anything parseTracePayload cannot read, before the database
 *   - practice runs are stored and flagged, never silently mixed in
 *   - the caps are enforced
 *
 * Runs with the suite's live database, same as every other route test.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import { db, pool, scriptTraceContributionsTable } from "@workspace/db";
import { like } from "drizzle-orm";
import scriptTraceRouter from "../routes/scriptTrace";

// Every row this file writes is named so cleanup can find it and nothing else.
const MARK = "tst_";
const glyphs = "gu_a:20,30;20,70~60,20;60,80|gu_aa:12,22;88,22";
let seq = 0;
/** A fresh sitting id per case, so upsert behaviour is testable in isolation. */
const nextSession = () => `tstsession${Date.now().toString(36)}${seq++}`;

let app: Express;
let server: Server;
let base: string;

async function post(payload: unknown, path = "/api/script-trace/contributions") {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // A non-JSON body is itself a finding; the assertion reports it.
  }
  return { status: res.status, json: json as Record<string, unknown> | null, text };
}

async function cleanup() {
  await db
    .delete(scriptTraceContributionsTable)
    .where(like(scriptTraceContributionsTable.contributor, `${MARK}%`));
}

before(async () => {
  app = express();
  app.use(express.json({ limit: "25mb" }));
  // Mounted with NO auth in front of it, which is exactly how routes/index.ts
  // mounts it. If that ever changes, this test should be the thing that argues.
  app.use("/api", scriptTraceRouter);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await cleanup();
});

after(async () => {
  await cleanup();
  await new Promise((r) => server.close(r));
  await pool.end();
});

beforeEach(cleanup);

describe("POST /script-trace/contributions", () => {
  it("accepts a traced alphabet from a caller with no session", async () => {
    const res = await post({ sessionId: nextSession(), payload: `bolo1|Gujarati|${MARK}Ba|${glyphs}` });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json?.stored, 2);
    assert.equal(res.json?.script, "Gujarati");

    const rows = await db
      .select()
      .from(scriptTraceContributionsTable)
      .where(like(scriptTraceContributionsTable.contributor, `${MARK}%`));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].script, "Gujarati");
    assert.equal(rows[0].glyphCount, 2);
    assert.equal(rows[0].isPractice, false);
    // The payload is stored verbatim, so parseTracePayload stays the one parser.
    assert.match(rows[0].payload, /^bolo1\|Gujarati\|/);
  });

  it("stores a practice run FLAGGED rather than mixed in with the real ones", async () => {
    // The first person to open the page is whoever built it, and they may not
    // write the script at all. That has to be visible in the data.
    const res = await post({ sessionId: nextSession(), payload: `bolo1|Gujarati|!${MARK}Aakesh|${glyphs}` });
    assert.equal(res.status, 200, res.text);

    const rows = await db
      .select()
      .from(scriptTraceContributionsTable)
      .where(like(scriptTraceContributionsTable.contributor, `${MARK}%`));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].isPractice, true);
    // The "!" is a marker, not part of the name.
    assert.equal(rows[0].contributor, `${MARK}Aakesh`);
  });

  it("refuses junk before it reaches the database", async () => {
    for (const payload of [
      "hello can you help me learn gujarati",
      "bolo1|Gujarati",
      "bolo1|Gujarati|Ba|noColonHere",
      "bolo1|Gujarati|Ba|gu_a:5,5",
      "bolo1|Gujarati|Ba|gu_a:5,5;900,4",
      "",
    ]) {
      const res = await post({ sessionId: nextSession(), payload });
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(payload)}`);
    }
    const rows = await db
      .select()
      .from(scriptTraceContributionsTable)
      .where(like(scriptTraceContributionsTable.contributor, `${MARK}%`));
    assert.equal(rows.length, 0, "nothing malformed may be stored");
  });

  it("refuses a body that is not the expected shape", async () => {
    assert.equal((await post({})).status, 400);
    assert.equal((await post({ sessionId: nextSession(), payload: 12 })).status, 400);
    assert.equal((await post({ sessionId: nextSession(), notPayload: "x" })).status, 400);
    // A payload with no sitting id has nowhere to upsert to.
    assert.equal((await post({ payload: `bolo1|Gujarati|${MARK}Ba|${glyphs}` })).status, 400);
    assert.equal((await post({ sessionId: "!!", payload: `bolo1|Gujarati|${MARK}Ba|${glyphs}` })).status, 400);
  });

  it("refuses a payload past the size cap", async () => {
    const huge = `bolo1|Gujarati|${MARK}Big|` + "gu_a:20,30;20,70|".repeat(40000);
    const res = await post({ sessionId: nextSession(), payload: huge });
    assert.equal(res.status, 400);
  });

  it("does not leak internals in an error body", async () => {
    const res = await post({ sessionId: nextSession(), payload: "bolo1|Gujarati|Ba|gu_a:5,5;x,4" });
    assert.equal(res.status, 400);
    const message = String(res.json?.error ?? "");
    assert.ok(message.length > 0, "an error must say something");
    assert.doesNotMatch(message, /at .*\.ts:|node_modules|TracePayloadError/);
  });
});

describe("autosave", () => {
  it("replaces the sitting rather than piling up rows", async () => {
    // The page saves after EVERY letter, each time sending the full set so far.
    // If that appended instead of upserting, one contributor tracing 47 letters
    // would leave 47 rows and the last one would be the only complete record.
    const session = nextSession();
    const one = await post({ sessionId: session, payload: `bolo1|Gujarati|${MARK}Ba|gu_a:20,30;20,70` });
    assert.equal(one.status, 200, one.text);
    const two = await post({ sessionId: session, payload: `bolo1|Gujarati|${MARK}Ba|${glyphs}` });
    assert.equal(two.status, 200, two.text);

    const rows = await db
      .select()
      .from(scriptTraceContributionsTable)
      .where(like(scriptTraceContributionsTable.contributor, `${MARK}%`));
    assert.equal(rows.length, 1, "one sitting is one row");
    assert.equal(rows[0].glyphCount, 2, "the row holds the fuller set");
  });

  it("keeps what somebody did before they stopped", async () => {
    // The entire point of saving per letter. A contributor who traces one
    // letter and closes the tab has that letter stored.
    const session = nextSession();
    await post({ sessionId: session, payload: `bolo1|Gujarati|${MARK}Stopped|gu_a:20,30;20,70` });
    const rows = await db
      .select()
      .from(scriptTraceContributionsTable)
      .where(like(scriptTraceContributionsTable.contributor, `${MARK}Stopped`));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].glyphCount, 1);
  });

  it("keeps two different people apart", async () => {
    await post({ sessionId: nextSession(), payload: `bolo1|Gujarati|${MARK}Ba|${glyphs}` });
    await post({ sessionId: nextSession(), payload: `bolo1|Gujarati|${MARK}Kaka|${glyphs}` });
    const rows = await db
      .select()
      .from(scriptTraceContributionsTable)
      .where(like(scriptTraceContributionsTable.contributor, `${MARK}%`));
    assert.equal(rows.length, 2);
  });
});
