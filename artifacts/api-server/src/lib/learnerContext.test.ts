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

test("Bolo never pitches the shop, even to a learner who can afford something", () => {
  const rich = buildLearnerContextBlock({
    ...EMPTY,
    chaiBalance: 500,
    affordable: [{ name: "Navratri kediyu", cost: 100 }],
  });
  assert.match(rich, /500 chai/);
  // Owner, 2026-09-17: the chat still opened with "your chai are enough for the
  // marigold pagdi" after his 2026-08-28 ruling removed Bolo's suggestions.
  assert.doesNotMatch(rich, /Navratri kediyu/);
  assert.doesNotMatch(rich, /Bazaar is on/i);
  assert.match(rich, /Never suggest spending it/);
  assert.match(rich, /Only mention their chai if they ask/);
});

test("a learner who cannot afford anything is not sent to the shop either", () => {
  const poor = buildLearnerContextBlock({
    ...EMPTY,
    chaiBalance: 3,
    affordable: [],
  });
  assert.match(poor, /never bring up the Bazaar/i);
});

test("chai and phrases are independent, so either alone still renders", () => {
  const onlyChai = buildLearnerContextBlock({
    ...EMPTY,
    chaiBalance: 200,
    affordable: [{ name: "Diwali kurta", cost: 100 }],
  });
  assert.doesNotMatch(onlyChai, /phrase\(s\) on their journey/);
  assert.match(onlyChai, /200 chai/);
});
