/**
 * Presence, tested here because it is the first part of /nest/live that CAN be
 * tested on a laptop. The endpoint needs the dev database, which is unreachable
 * from a Mac, and its first two versions needed Clerk. This module is pure, so
 * the behaviour that actually decides the number is covered.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  touchPresence,
  presenceSince,
  presenceNewest,
  presenceTracked,
  resetPresence,
} from "./presence";

describe("presence", () => {
  beforeEach(() => resetPresence());

  test("nobody seen yet is a real zero, not an error", () => {
    assert.equal(presenceSince(0).length, 0);
    assert.equal(presenceNewest(), null);
    assert.equal(presenceTracked(), 0);
  });

  test("a request inside the window counts, one outside does not", () => {
    const now = 1_000_000;
    touchPresence("user_here", now - 60_000);
    touchPresence("user_gone", now - 3_600_000);

    const within15 = presenceSince(now - 15 * 60_000);
    assert.deepEqual(
      within15.map((p) => p.userId),
      ["user_here"],
    );
    // The wider window catches both, newest first.
    assert.deepEqual(
      presenceSince(now - 2 * 3_600_000).map((p) => p.userId),
      ["user_here", "user_gone"],
    );
  });

  test("the same user twice is one person, at the later time", () => {
    touchPresence("user_a", 1000);
    touchPresence("user_a", 5000);
    assert.equal(presenceTracked(), 1);
    assert.equal(presenceNewest(), 5000);
    assert.deepEqual(presenceSince(0), [{ userId: "user_a", at: 5000 }]);
  });

  // The map is keyed on a value from the outside world, so it has a ceiling.
  // Without one this is a leak with extra steps.
  test("it evicts the oldest rather than growing without limit", () => {
    for (let i = 0; i < 5600; i++) touchPresence(`user_${i}`, 1000 + i);
    assert.ok(presenceTracked() <= 5000, `tracked ${presenceTracked()}`);
    // The newest survive; the very first are the ones dropped.
    assert.equal(presenceSince(0).some((p) => p.userId === "user_5599"), true);
    assert.equal(presenceSince(0).some((p) => p.userId === "user_0"), false);
  });

  test("an empty user id is ignored rather than tracked as a person", () => {
    touchPresence("", 1000);
    assert.equal(presenceTracked(), 0);
  });
});
