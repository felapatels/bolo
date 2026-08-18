import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SCENARIOS,
  getScenarioByZoneIndex,
  resolveScenario,
  targetPhrasesForScenario,
} from "../lib/scenarios.js";

// ---------------------------------------------------------------------------
// Capstone scenes resolve against the LEARNER'S language.
//
// The first version of scenarios.ts carried Gujarati target phrases inline, so
// every learner reaching a capstone got Gujarati chips and a prompt telling the
// model to speak Gujarati, whatever they were actually studying. These tests
// exist so that cannot come back: they run against the live seeded content and
// assert that two languages produce two different sets of chips.
//
// They read seeded content and never write, so they are safe to run against the
// shared development database.
// ---------------------------------------------------------------------------

describe("capstone scenes are language-specific", () => {
  test("two languages get different chips for the same scene", async () => {
    const scene = getScenarioByZoneIndex(0);
    assert.ok(scene, "zone 0 must have a scene");

    const gu = await targetPhrasesForScenario(scene, "gu");
    const hi = await targetPhrasesForScenario(scene, "hi");

    assert.ok(gu.length > 0, "Gujarati must have greetings content");
    assert.ok(hi.length > 0, "Hindi must have greetings content");

    // The bug this pins: identical chip sets across languages meant the phrases
    // were hardcoded rather than drawn from the learner's own content.
    const guRoman = gu.map((p) => p.romanized).join("|");
    const hiRoman = hi.map((p) => p.romanized).join("|");
    assert.notStrictEqual(
      guRoman,
      hiRoman,
      "Gujarati and Hindi must not share a chip set",
    );
  });

  test("every scene resolves for every seeded language of journey 1", async () => {
    // Six scenes across 22 languages is the whole point of drawing phrases from
    // content: if any pair fails to resolve, that capstone is unfinishable for
    // that learner and must not have been offered.
    const langs = ["gu", "hi", "ta", "bn", "mr", "te", "pa", "ml"];
    for (const scene of Object.values(SCENARIOS)) {
      for (const lang of langs) {
        const phrases = await targetPhrasesForScenario(scene, lang);
        assert.ok(
          phrases.length >= 5,
          `${scene.id} in ${lang} resolved only ${phrases.length} phrases`,
        );
      }
    }
  });

  test("resolution never exceeds the scene's declared count", async () => {
    for (const scene of Object.values(SCENARIOS)) {
      const phrases = await targetPhrasesForScenario(scene, "gu");
      assert.ok(
        phrases.length <= scene.targetPhraseCount,
        `${scene.id} returned more chips than it asked for`,
      );
    }
  });

  test("resolution is deterministic across calls", async () => {
    // A learner returning to a capstone must see the same chips, and the
    // majority threshold must not move under them mid-conversation.
    const scene = getScenarioByZoneIndex(3);
    assert.ok(scene);
    const a = await targetPhrasesForScenario(scene, "ta");
    const b = await targetPhrasesForScenario(scene, "ta");
    assert.deepStrictEqual(a, b);
  });
});

describe("resolved steering names the learner's language", () => {
  test("the placeholder is substituted, and none survives", async () => {
    const scene = getScenarioByZoneIndex(0);
    assert.ok(scene);
    const resolved = await resolveScenario(scene, "ta", "Tamil");
    assert.ok(resolved, "Tamil zone 0 must resolve");
    assert.ok(
      resolved.steerInstructions.includes("Tamil"),
      "steering must name the learner's language",
    );
    // A surviving placeholder would reach the model verbatim.
    assert.ok(
      !resolved.steerInstructions.includes("{{language}}"),
      "no placeholder may survive resolution",
    );
    // And the old hardcoded language must not reappear from anywhere.
    assert.ok(
      !resolved.steerInstructions.includes("Gujarati"),
      "steering must not mention a language the learner is not studying",
    );
  });

  test("a language with no content for the scene resolves to null", async () => {
    const scene = getScenarioByZoneIndex(0);
    assert.ok(scene);
    // Fails CLOSED: a capstone with nothing to aim at cannot be completed, so
    // the caller must get null rather than an empty, unwinnable scene.
    const resolved = await resolveScenario(
      scene,
      "__no_such_language",
      "Nowhere",
    );
    assert.strictEqual(resolved, null);
  });
});
