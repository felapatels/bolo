/**
 * scenarios.test.ts
 * Tests that buildUserPrompt correctly injects scenario framing when a
 * scenario is passed, and produces byte-identical output to the baseline
 * when no scenario is passed.
 *
 * This test pins the behaviour of the exported buildUserPrompt function in
 * parrotChat.ts so that future edits to that function cannot silently break
 * the scenario prompt injection.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { buildUserPrompt } from "../lib/parrotChat.js";
import type { ResolvedScenario } from "../lib/scenarios.js";

// A RESOLVED scene, which is what a prompt is ever built from: phrases already
// drawn for one language and steering with {{language}} already substituted.
const ZONE_1_SCENARIO: ResolvedScenario = {
  id: "greetings-manners",
  zoneIndex: 0,
  categorySlug: "greetings",
  title: "At the platform chai stall",
  framingCopy: "You are at the platform chai stall in Gujarat. The attendant greets every traveller with a warm 'kem cho?'.",
  targetPhrases: [
    { romanized: "namaste", native: "નમસ્તે" },
    { romanized: "kem cho?", native: "કેમ છો?" },
    { romanized: "majaa-maan", native: "મઝામાં" },
    { romanized: "aabhaar", native: "આભાર" },
    { romanized: "jay shri krishna", native: "જય શ્રી કૃષ્ણ" },
    { romanized: "tamaro divas kevo rahyo?", native: "તમારો દિવસ કેવો રહ્યો?" },
  ],
  steerInstructions:
    "Play the chai-stall attendant. Steer toward target phrases naturally.",
};

describe("buildUserPrompt", () => {
  it("without scenario: produces a string containing Language and History blocks", () => {
    const result = buildUserPrompt("Gujarati", [], "hello");
    assert.ok(result.includes("Language: Gujarati"), "Should contain Language line");
    assert.ok(result.includes("History:"), "Should contain History block");
  });

  it("without scenario: is byte-identical across two identical calls (deterministic)", () => {
    const a = buildUserPrompt("Gujarati", [], "kem cho");
    const b = buildUserPrompt("Gujarati", [], "kem cho");
    assert.strictEqual(a, b, "Same inputs should produce identical output");
  });

  it("with scenario: injects Scenario block before History", () => {
    const result = buildUserPrompt("Gujarati", [], "hello", ZONE_1_SCENARIO);
    assert.ok(result.includes("Scenario:"), "Should contain Scenario block");
    assert.ok(result.includes("At the platform chai stall"), "Should contain scenario title");
    assert.ok(result.includes(ZONE_1_SCENARIO.framingCopy), "Should contain framing copy");
    assert.ok(result.includes(ZONE_1_SCENARIO.steerInstructions), "Should contain steer instructions");
    // The Scenario block must appear before the History block.
    const scenarioIdx = result.indexOf("Scenario:");
    const historyIdx = result.indexOf("History:");
    assert.ok(scenarioIdx < historyIdx, "Scenario block must precede History block");
  });

  it("with scenario: still contains Language block (cache-safe static prompt unchanged)", () => {
    const result = buildUserPrompt("Gujarati", [], "namaste", ZONE_1_SCENARIO);
    assert.ok(result.includes("Language: Gujarati"), "Language block must still be present");
  });

  it("without scenario: output does NOT contain Scenario block", () => {
    const result = buildUserPrompt("Gujarati", [], "namaste");
    assert.ok(!result.includes("Scenario:"), "Baseline output must not contain Scenario block");
  });
});
