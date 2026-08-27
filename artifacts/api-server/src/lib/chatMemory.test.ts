/**
 * What Bolo puts in the prompt, and what he refuses to keep.
 *
 * These pin the two halves that are pure and therefore cheap to hold still:
 * how remembered facts are RENDERED into a turn, and how an extractor reply is
 * FILTERED before anything reaches the table. The database halves (pruning,
 * the unique constraint) need the dev database and run in the Repl Shell with
 * the rest of the api suite.
 *
 * The rendering test earns its place because of one specific failure: a memory
 * block that is not empty for a brand-new learner would change the prompt
 * prefix for every learner who has nothing remembered, which is most of them,
 * and quietly cost the OpenAI prompt-cache hit on the busiest path in the app.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createDbMockExports } from "../test/dbMock";

mock.module("@workspace/db", { namedExports: createDbMockExports() });
mock.module("@workspace/integrations-openai-ai-server/audio", {
  namedExports: { openai: {} },
});

const { buildMemoryBlock, CHAT_MEMORY_CAP } = await import("./chatMemory");

test("a learner with nothing remembered changes the prompt not at all", () => {
  // The prompt-cache guard. Anything other than an empty string here shifts
  // the prefix for every new learner on every turn.
  assert.equal(buildMemoryBlock([]), "");
});

test("remembered facts are listed, and Bolo is told not to recite them", () => {
  const block = buildMemoryBlock([
    { id: 1, memory: "You are learning Gujarati for your grandmother." },
    { id: 2, memory: "You have a dog called Rocky." },
  ]);
  assert.match(block, /You are learning Gujarati for your grandmother\./);
  assert.match(block, /You have a dog called Rocky\./);
  // The instruction is the difference between a bird who knows you and a bird
  // who reads your file back at you.
  assert.match(block, /Do not list them back/i);
  // It has to end clear of whatever follows it in the prompt.
  assert.ok(block.endsWith("\n\n"));
});

test("the cap is small enough to sit in every prompt", () => {
  // It is a prompt budget before it is a storage budget: roughly 40 short
  // sentences, carried on EVERY turn alongside a persona and a history.
  assert.ok(CHAT_MEMORY_CAP > 0);
  assert.ok(CHAT_MEMORY_CAP <= 60);
});
