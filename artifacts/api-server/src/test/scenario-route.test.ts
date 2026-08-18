/**
 * scenario-route.test.ts
 * Tests for the scenario (capstone chat) additions.
 *
 * What is tested here:
 *   - SCENARIOS config has zone-1 with expected shape and at least 5 target phrases.
 *   - getScenarioByZoneIndex(0) returns the correct scenario.
 *   - Zone conversation stamp idempotency: ON CONFLICT DO NOTHING logic via drizzle.
 *   - phrasesUsed detection helper (unit-level, extracted inline).
 *
 * NOTE: Full POST /openai/chat SSE integration tests require a live OpenAI
 * connection and audio input. Those are QA-pilot tests run manually.
 * Zone-2 entitlement gate is documented in routes/openai.ts and exercised
 * via the manual QA flow.
 *
 * Runs with: node --import tsx --test src/test/scenario-route.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { db, pool, usersTable } from "@workspace/db";
import { zoneConversationStampsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { SCENARIOS, getScenarioByZoneIndex } from "../lib/scenarios.js";

const TEST_USER_ID = "test-scenario-route-user";
const TEST_LANG = "gu";

describe("SCENARIOS config", () => {
  it("zone-1 scenario exists and has the expected id", () => {
    const scenario = getScenarioByZoneIndex(0);
    assert.ok(scenario, "Zone 0 scenario must be defined");
    assert.strictEqual(scenario!.id, "greetings-manners");
    assert.strictEqual(scenario!.zoneIndex, 0);
  });

  it("every scene asks for at least 5 target phrases", () => {
    // Phrases are no longer inline: a scene declares how many to draw and they
    // come from the learner's own language content. The floor still matters,
    // because "the majority" of four is two, which is not a conversation.
    for (const s of Object.values(SCENARIOS)) {
      assert.ok(
        s.targetPhraseCount >= 5,
        `${s.id} must ask for at least 5 target phrases`,
      );
    }
  });

  it("journey 1 has a scene for every one of its six zones", () => {
    for (let zone = 0; zone < 6; zone++) {
      const scene = getScenarioByZoneIndex(zone);
      assert.ok(scene, `zone ${zone} must have a capstone scene`);
    }
  });

  it("no scene carries language-specific steering", () => {
    // The whole point of the rewrite: a scene must name the learner's language
    // through the placeholder, never a hardcoded one, or a Tamil learner gets
    // told to speak Gujarati.
    for (const s of Object.values(SCENARIOS)) {
      assert.ok(
        s.steerInstructions.includes("{{language}}"),
        `${s.id} must steer in {{language}}`,
      );
    }
  });

  it("every scene tells the model to ASK, not to wait", () => {
    // Reported from the app: "Test your knowledge just takes you to bolo
    // chat". The steering only said to make using the phrases feel natural,
    // which left the learner to volunteer them unprompted, so a capstone
    // played exactly like ordinary free chat. A test asks questions.
    for (const s of Object.values(SCENARIOS)) {
      assert.ok(
        s.steerInstructions.includes("ASK QUESTIONS"),
        `${s.id} must instruct the model to ask`,
      );
      // And must not hand the answer over while asking.
      assert.ok(
        s.steerInstructions.includes("Never list the target phrases"),
        `${s.id} must not give its own answers away`,
      );
    }
  });

  it("every scene points at a real seeded category", () => {
    const SEEDED = new Set([
      "greetings",
      "family",
      "numbers",
      "food",
      "everyday",
      "feelings",
    ]);
    for (const s of Object.values(SCENARIOS)) {
      assert.ok(
        SEEDED.has(s.categorySlug),
        `${s.id} points at unknown category ${s.categorySlug}`,
      );
    }
  });

  it("SCENARIOS map contains the greetings-manners key", () => {
    assert.ok("greetings-manners" in SCENARIOS, "SCENARIOS must have greetings-manners key");
  });

  it("all scenarios have numeric zoneIndex (gate posture anchor)", () => {
    for (const [, scenario] of Object.entries(SCENARIOS)) {
      assert.ok(
        typeof scenario.zoneIndex === "number",
        `Scenario ${scenario.id} must have a numeric zoneIndex`,
      );
    }
  });
});

describe("Zone conversation stamp idempotency", () => {
  before(async () => {
    await db.insert(usersTable).values({ id: TEST_USER_ID, createdAt: new Date() })
      .onConflictDoNothing();
    // Clean up any leftover stamp rows from a previous failed run.
    await db.delete(zoneConversationStampsTable).where(
      eq(zoneConversationStampsTable.userId, TEST_USER_ID),
    );
  });

  after(async () => {
    await db.delete(zoneConversationStampsTable).where(
      eq(zoneConversationStampsTable.userId, TEST_USER_ID),
    );
    await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
    await pool.end();
  });

  it("first stamp insert succeeds and returns one row", async () => {
    const result = await db.insert(zoneConversationStampsTable).values({
      userId: TEST_USER_ID,
      languageCode: TEST_LANG,
      zoneIndex: 0,
    }).onConflictDoNothing().returning({ id: zoneConversationStampsTable.id });
    assert.strictEqual(result.length, 1, "First insert must return the new row");
  });

  it("second stamp insert (same user/lang/zone) is silently ignored (ON CONFLICT DO NOTHING)", async () => {
    const result = await db.insert(zoneConversationStampsTable).values({
      userId: TEST_USER_ID,
      languageCode: TEST_LANG,
      zoneIndex: 0,
    }).onConflictDoNothing().returning({ id: zoneConversationStampsTable.id });
    assert.strictEqual(result.length, 0, "Duplicate insert must return no rows (conflict ignored)");
  });

  it("stamp query returns exactly one row after two inserts", async () => {
    const rows = await db.select().from(zoneConversationStampsTable).where(
      and(
        eq(zoneConversationStampsTable.userId, TEST_USER_ID),
        eq(zoneConversationStampsTable.languageCode, TEST_LANG),
        eq(zoneConversationStampsTable.zoneIndex, 0),
      ),
    );
    assert.strictEqual(rows.length, 1, "Exactly one stamp row must exist");
  });
});

describe("phrase detection helper (unit)", () => {
  // The route-level phrasesUsed detection is a simple case-insensitive
  // substring match. Test the logic inline without standing up the HTTP server.
  function detectUsedPhrases(
    targetPhrases: Array<{ romanized: string }>,
    transcript: string,
  ): string[] {
    const lower = transcript.toLowerCase();
    return targetPhrases
      .filter(tp => lower.includes(tp.romanized.toLowerCase()))
      .map(tp => tp.romanized);
  }

  // A fixed fixture rather than a scene's phrases: these tests are about the
  // MATCHER, and pinning them to live content would make them fail whenever a
  // seed reorders a category.
  const scenario = {
    targetPhrases: [
      { romanized: "namaste", native: "નમસ્તે" },
      { romanized: "kem cho?", native: "કેમ છો?" },
      { romanized: "aabhaar", native: "આભાર" },
    ],
  };

  it("detects 'namaste' in a transcript that contains it", () => {
    const found = detectUsedPhrases(scenario.targetPhrases, "Namaste, how are you?");
    assert.ok(found.includes("namaste"), "Should detect namaste");
  });

  it("returns empty array when no target phrase is in the transcript", () => {
    const found = detectUsedPhrases(scenario.targetPhrases, "The quick brown fox");
    assert.strictEqual(found.length, 0, "No matches expected");
  });

  it("detection is case-insensitive", () => {
    const found = detectUsedPhrases(scenario.targetPhrases, "NAMASTE sir");
    assert.ok(found.includes("namaste"), "Case-insensitive match should work");
  });

  it("detects multiple phrases in one transcript", () => {
    const found = detectUsedPhrases(
      scenario.targetPhrases,
      "Namaste! Kem cho? I am doing great.",
    );
    assert.ok(found.includes("namaste"), "Should detect namaste");
    assert.ok(found.includes("kem cho?"), "Should detect kem cho?");
    assert.ok(found.length >= 2);
  });
});
