import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { db, pool, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import openaiRouter from "./openai";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

// ---------------------------------------------------------------------------
// Route-level tests for the two capstone scenario endpoints.
//
// lib/scenarios.ts is unit-tested separately (scenarioLanguage.test.ts); this
// file covers the WIRING, which nothing else did: the required lang parameter,
// the fail-closed 404s, the ordering the journey map depends on, and the one
// thing that would actually be a leak -- steering instructions escaping to the
// client. They are the model's stage directions, and a learner who can read
// them can read the whole scene ahead.
//
// Reads only: every assertion runs against the seeded content for real
// languages, and nothing here writes to shared tables beyond its own user row.
// ---------------------------------------------------------------------------

const TEST_USER = "test_scenarios_route";

let app: Express;
let server: Server;
let baseUrl: string;

async function get(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

before(async () => {
  await ensureUsersColumns();
  await db
    .insert(usersTable)
    .values({ id: TEST_USER, displayName: "Scenario Route Test" })
    .onConflictDoNothing();

  app = express();
  app.use(express.json());
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

after(async () => {
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER));
  server.close();
  await pool.end();
});

// ── GET /scenarios ─────────────────────────────────────────────────────────

test("GET /scenarios requires a language", async () => {
  const { status } = await get("/scenarios");
  assert.equal(status, 400);
});

test("GET /scenarios 404s an unknown language", async () => {
  const { status } = await get("/scenarios?lang=__nope__");
  assert.equal(status, 404);
});

test("GET /scenarios lists journey 1's six zones in zone order", async () => {
  const { status, json } = await get("/scenarios?lang=gu");
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
  assert.equal(json.length, 6, "journey 1 has six capstones");

  // The journey map builds a zone-index lookup from this, so the ordering and
  // the shape are both load-bearing.
  const zones = json.map((s: any) => s.zoneIndex);
  assert.deepEqual(zones, [0, 1, 2, 3, 4, 5]);
  for (const s of json) {
    assert.equal(typeof s.id, "string");
    assert.equal(typeof s.title, "string");
    assert.ok(s.id.length > 0 && s.title.length > 0);
  }
});

test("GET /scenarios never leaks steering or phrases in the summary", async () => {
  const { json } = await get("/scenarios?lang=gu");
  for (const s of json) {
    assert.equal(
      (s as any).steerInstructions,
      undefined,
      "summary must not carry steering",
    );
    assert.equal(
      (s as any).targetPhrases,
      undefined,
      "summary is a list, not the scene itself",
    );
  }
});

test("GET /scenarios lists the same zones for another language", async () => {
  // All six categories are seeded for every language, so a second language must
  // get the same six zones. If content is ever removed, this is where a zone
  // silently disappearing from the map shows up.
  const { json } = await get("/scenarios?lang=ta");
  assert.equal(json.length, 6);
});

// ── GET /scenarios/:id ─────────────────────────────────────────────────────

test("GET /scenarios/:id requires a language", async () => {
  const { status } = await get("/scenarios/greetings-manners");
  assert.equal(status, 400);
});

test("GET /scenarios/:id 404s an unknown scenario", async () => {
  const { status } = await get("/scenarios/__not_a_scene__?lang=gu");
  assert.equal(status, 404);
});

test("GET /scenarios/:id 404s a language with no content for the scene", async () => {
  // Fails CLOSED. An unfinishable capstone must never be served.
  const { status } = await get("/scenarios/greetings-manners?lang=__nope__");
  assert.equal(status, 404);
});

test("GET /scenarios/:id returns the scene with real chips", async () => {
  const { status, json } = await get("/scenarios/greetings-manners?lang=gu");
  assert.equal(status, 200);
  assert.equal(json.id, "greetings-manners");
  assert.equal(json.zoneIndex, 0);
  assert.ok(json.title.length > 0);
  assert.ok(json.framingCopy.length > 0);
  assert.ok(Array.isArray(json.targetPhrases));
  assert.ok(json.targetPhrases.length >= 5);
  for (const tp of json.targetPhrases) {
    assert.equal(typeof tp.romanized, "string");
    assert.equal(typeof tp.native, "string");
  }
});

test("GET /scenarios/:id NEVER returns steering instructions", async () => {
  // The one genuine leak on this route: steering is the model's stage
  // directions, and a learner who can read them can read the scene ahead.
  const { json } = await get("/scenarios/greetings-manners?lang=gu");
  assert.equal((json as any).steerInstructions, undefined);
  assert.equal((json as any).categorySlug, undefined);
  assert.equal((json as any).targetPhraseCount, undefined);
  // Belt and braces: the placeholder only ever appears inside steering, so its
  // presence anywhere in the payload means steering leaked in some form.
  assert.ok(!JSON.stringify(json).includes("{{language}}"));
});

test("GET /scenarios/:id gives two languages two different chip sets", async () => {
  // The bug the whole rewrite existed to kill: every learner used to get the
  // Gujarati phrases regardless of what they were studying.
  const gu = await get("/scenarios/greetings-manners?lang=gu");
  const hi = await get("/scenarios/greetings-manners?lang=hi");
  assert.equal(gu.status, 200);
  assert.equal(hi.status, 200);

  const guChips = gu.json.targetPhrases.map((p: any) => p.romanized).join("|");
  const hiChips = hi.json.targetPhrases.map((p: any) => p.romanized).join("|");
  assert.notEqual(guChips, hiChips);
});
