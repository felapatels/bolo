/**
 * What Bolo is allowed to say about a learner's progress and their chai.
 *
 * The shopping nudge is the part worth pinning hard. It was asked for as a
 * growth lever ("he can drive people toward shopping"), and the failure mode
 * of a growth lever in a children's app is a bird that pesters. So these hold
 * the three states apart: enough chai gets ONE mentionable nudge, some chai
 * but not enough gets an explicit instruction NOT to raise the shop, and a
 * learner with nothing gets no block at all.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createDbMockExports } from "../test/dbMock";

mock.module("@workspace/db", { namedExports: createDbMockExports() });

const { buildLearnerContextBlock } = await import("./learnerContext");

const EMPTY = {
  masteredTotal: 0,
  mastered: [],
  chaiBalance: 0,
  affordable: [],
};

test("a brand-new learner changes the prompt not at all", () => {
  // Same prompt-cache guard the memory block carries: an empty snapshot must
  // render to nothing, or every new learner's prefix shifts on every turn.
  assert.equal(buildLearnerContextBlock(EMPTY), "");
});

test("mastered phrases are offered for practice, not as a quiz", () => {
  const block = buildLearnerContextBlock({
    ...EMPTY,
    masteredTotal: 37,
    mastered: [
      { native: "નમસ્તે", romanized: "namaste", english: "hello" },
      { native: "આભાર", romanized: "aabhaar", english: "thank you" },
    ],
  });
  assert.match(block, /37 phrase/);
  assert.match(block, /namaste/);
  // "Practice what I've learned" has to become a conversation. A learner who
  // wanted a drill would have opened one of the games.
  assert.match(block, /rather than as a list or a quiz/i);
});

test("the balance is not in the prompt at all, however rich the learner", () => {
  // THE RULE BECAME A DELETION, 2026-09-18. Three rounds of forbidding Bolo to
  // pitch the shop in words ended with the owner saying the suggestions were
  // still annoying. A number the model never receives cannot be turned into an
  // offer, so the sentence is gone rather than guarded.
  const rich = buildLearnerContextBlock({
    ...EMPTY,
    chaiBalance: 500,
    affordable: [{ name: "Navratri kediyu", cost: 100 }],
  });
  assert.doesNotMatch(rich, /500/);
  // Every currency word the fleet uses, so a fork that renames its token
  // cannot quietly start mentioning it again.
  for (const word of [/chai/i, /kopi/i, /caj/i, /cowrie/i, /cacao/i]) {
    assert.doesNotMatch(rich, word);
  }
  assert.doesNotMatch(rich, /Navratri kediyu/);
  assert.doesNotMatch(rich, /Bazaar/i);
});

test("a learner with a balance and nothing else gets an empty block", () => {
  // The block used to render for a balance alone. With the sentence gone there
  // is nothing left to say about a learner who has only earned currency, and an
  // empty string is the honest answer rather than a heading with no content.
  const onlyBalance = buildLearnerContextBlock({
    ...EMPTY,
    chaiBalance: 200,
    affordable: [{ name: "Diwali kurta", cost: 100 }],
  });
  assert.equal(onlyBalance, "");
});
