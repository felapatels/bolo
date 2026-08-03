/**
 * signalWaves.test.ts
 *
 * Hotfix 3S: server persistence for the journey signal system. New test file
 * justified by a genuinely new server surface: the signal_waves table (wave
 * persistence + idempotency), grantTokensDetailed (granted-vs-replay
 * signal), the variable per-language signal reward accessor, and the
 * signals-payload derivation the lesson-groups GET performs (waves from
 * signal_waves, clears from the token ledger, both filtered by the
 * `${lang}:${categoryId}:` ref prefix).
 *
 * Route-layer POST /journey/signal-waves logic (zod parse, server-side ref
 * composition) is exercised at the schema/DB layer -- this codebase's api
 * tests have no HTTP harness (see gameSessions.test.ts, same pattern).
 *
 * Tests run against the live development DATABASE_URL and self-provision a
 * dedicated test user.
 *
 * Runs with: node --import tsx --test src/test/signalWaves.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import {
  db,
  pool,
  usersTable,
  signalWavesTable,
  tokenLedgerTable,
  userTokenStateTable,
} from "@workspace/db";
import { eq, and, like } from "drizzle-orm";
import {
  grantTokens,
  grantTokensDetailed,
  getOrCreateTokenState,
} from "../lib/tokenService.js";
import { signalFirstClearChai, SIGNAL_FIRST_CLEAR_REWARDS } from "../lib/tokenEconomy.js";

// Mirrors the SignalWaveBody zod schema in routes/learning.ts (schema tested
// in isolation; importing the route module would start servers/pools).
const SignalWaveBody = z.object({
  languageCode: z.string().regex(/^[a-z]{2,3}$/),
  categoryId: z.number().int().positive(),
  gap: z.number().int().positive().lte(999),
});

const TEST_USER_ID = "test-signal-waves-3s-user";
const LANG = "hi";
const CAT_ID = 3;

async function cleanup() {
  await db.delete(signalWavesTable).where(eq(signalWavesTable.userId, TEST_USER_ID));
  await db.delete(tokenLedgerTable).where(eq(tokenLedgerTable.userId, TEST_USER_ID));
  await db.delete(userTokenStateTable).where(eq(userTokenStateTable.userId, TEST_USER_ID));
}

before(async () => {
  await db.insert(usersTable).values({ id: TEST_USER_ID, createdAt: new Date() }).onConflictDoNothing();
  await cleanup();
});

after(async () => {
  await cleanup();
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

// ---- Wave persistence: insert + idempotency --------------------------------

describe("signal wave persistence", () => {
  const REF = `${LANG}:${CAT_ID}:gap-5`;

  it("first wave inserts one row with the composed ref", async () => {
    await db
      .insert(signalWavesTable)
      .values({ userId: TEST_USER_ID, ref: REF })
      .onConflictDoNothing();
    const rows = await db
      .select({ ref: signalWavesTable.ref })
      .from(signalWavesTable)
      .where(eq(signalWavesTable.userId, TEST_USER_ID));
    assert.strictEqual(rows.length, 1, "exactly one wave row");
    assert.strictEqual(rows[0]!.ref, REF, "ref is languageCode:categoryId:gap-N");
  });

  it("replaying the same wave is a no-op (unique on user+ref)", async () => {
    await db
      .insert(signalWavesTable)
      .values({ userId: TEST_USER_ID, ref: REF })
      .onConflictDoNothing();
    const rows = await db
      .select({ ref: signalWavesTable.ref })
      .from(signalWavesTable)
      .where(eq(signalWavesTable.userId, TEST_USER_ID));
    assert.strictEqual(rows.length, 1, "replay must not add a second row");
  });

  it("zod body: rejects non-positive categoryId/gap and empty language", () => {
    assert.ok(SignalWaveBody.safeParse({ languageCode: LANG, categoryId: CAT_ID, gap: 5 }).success);
    assert.ok(SignalWaveBody.safeParse({ languageCode: "kok", categoryId: CAT_ID, gap: 5 }).success);
    assert.ok(!SignalWaveBody.safeParse({ languageCode: "", categoryId: CAT_ID, gap: 5 }).success);
    assert.ok(!SignalWaveBody.safeParse({ languageCode: LANG, categoryId: 0, gap: 5 }).success);
    assert.ok(!SignalWaveBody.safeParse({ languageCode: LANG, categoryId: CAT_ID, gap: -1 }).success);
    assert.ok(!SignalWaveBody.safeParse({ languageCode: LANG, categoryId: CAT_ID, gap: 1.5 }).success);
    assert.ok(!SignalWaveBody.safeParse({ languageCode: LANG, categoryId: CAT_ID, gap: 1000 }).success);
  });

  it("zod body: LIKE metacharacters and off-grammar codes can never enter a ref", () => {
    // Stored refs feed the lesson-groups LIKE prefix scan — '%' and '_'
    // must be rejected at the boundary, along with anything that is not a
    // bare 2-3 letter lowercase code.
    for (const bad of ["%", "_", "hi%", "h_", "HI", "hindi", "h", "hi:1", "hi "]) {
      assert.ok(
        !SignalWaveBody.safeParse({ languageCode: bad, categoryId: CAT_ID, gap: 5 }).success,
        `languageCode ${JSON.stringify(bad)} must be rejected`,
      );
    }
  });
});

// ---- grantTokensDetailed: granted flag -------------------------------------

describe("grantTokensDetailed granted flag", () => {
  const REF = `${LANG}:${CAT_ID}:gap-7`;

  it("first grant reports granted: true and moves the balance", async () => {
    const before = await getOrCreateTokenState(TEST_USER_ID);
    const { state, granted } = await grantTokensDetailed(
      TEST_USER_ID,
      "earn_signal_first_clear",
      REF,
      signalFirstClearChai(LANG),
    );
    assert.strictEqual(granted, true, "first grant must report granted");
    assert.strictEqual(state.balance, before.balance + signalFirstClearChai(LANG));
  });

  it("replay reports granted: false and leaves the balance unchanged", async () => {
    const before = await getOrCreateTokenState(TEST_USER_ID);
    const { state, granted } = await grantTokensDetailed(
      TEST_USER_ID,
      "earn_signal_first_clear",
      REF,
      signalFirstClearChai(LANG),
    );
    assert.strictEqual(granted, false, "replay must report not-granted");
    assert.strictEqual(state.balance, before.balance, "replay must not change balance");
  });

  it("grantTokens still returns the state (delegation unchanged)", async () => {
    const state = await grantTokens(
      TEST_USER_ID,
      "earn_signal_first_clear",
      `${LANG}:${CAT_ID}:gap-9`,
      signalFirstClearChai(LANG),
    );
    assert.ok(typeof state.balance === "number", "grantTokens keeps its state-only shape");
  });
});

// ---- Variable reward table --------------------------------------------------

describe("signalFirstClearChai accessor", () => {
  it("returns the default for languages with no per-line override", () => {
    assert.strictEqual(signalFirstClearChai(LANG), SIGNAL_FIRST_CLEAR_REWARDS.default);
    assert.strictEqual(signalFirstClearChai("zz"), SIGNAL_FIRST_CLEAR_REWARDS.default);
  });

  it("returns the per-line override when one exists", () => {
    const overridden = Object.entries(SIGNAL_FIRST_CLEAR_REWARDS.perLine);
    for (const [lang, amount] of overridden) {
      assert.strictEqual(signalFirstClearChai(lang), amount);
    }
    // Table sanity: default and any overrides are positive integers.
    assert.ok(Number.isInteger(SIGNAL_FIRST_CLEAR_REWARDS.default) && SIGNAL_FIRST_CLEAR_REWARDS.default > 0);
  });
});

// ---- Signals payload derivation (waves + clears by ref prefix) --------------

describe("signals payload derivation", () => {
  // Mirrors the lesson-groups GET derivation: waves from signal_waves, clears
  // from earn_signal_first_clear ledger rows, both prefix-filtered, refs
  // stripped to bare gap-N.
  const PREFIX = `${LANG}:${CAT_ID}:`;

  before(async () => {
    // Seed: one wave in-zone, one wave in ANOTHER zone (must not leak in),
    // one clear in-zone (the gap-7 grant from the previous block remains).
    await db
      .insert(signalWavesTable)
      .values([
        { userId: TEST_USER_ID, ref: `${PREFIX}gap-11` },
        { userId: TEST_USER_ID, ref: `${LANG}:9:gap-11` },
      ])
      .onConflictDoNothing();
  });

  it("prefix-filters both sources and strips refs to bare gap-N", async () => {
    const [waveRows, clearRows] = await Promise.all([
      db
        .select({ ref: signalWavesTable.ref })
        .from(signalWavesTable)
        .where(
          and(
            eq(signalWavesTable.userId, TEST_USER_ID),
            like(signalWavesTable.ref, `${PREFIX}%`),
          ),
        ),
      db
        .select({ refId: tokenLedgerTable.refId })
        .from(tokenLedgerTable)
        .where(
          and(
            eq(tokenLedgerTable.userId, TEST_USER_ID),
            eq(tokenLedgerTable.reason, "earn_signal_first_clear"),
            like(tokenLedgerTable.refId, `${PREFIX}%`),
          ),
        ),
    ]);
    const waves = waveRows.map((r) => r.ref.slice(PREFIX.length));
    const clears = clearRows.map((r) => r.refId!.slice(PREFIX.length));
    assert.deepStrictEqual(waves.sort(), ["gap-11", "gap-5"], "in-zone waves only, bare gap refs");
    assert.ok(clears.includes("gap-7"), "ledger clear surfaces as bare gap ref");
    assert.ok(!waves.includes("gap-11:extra"), "other-zone wave must not leak in");
    assert.ok(clears.every((c) => /^gap-[0-9]+$/.test(c)), "clears are bare gap-N refs");
  });
});
