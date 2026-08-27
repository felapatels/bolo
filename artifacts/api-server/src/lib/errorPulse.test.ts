/**
 * Runs ON THE MAC, like presence.test.ts and for the same reason: the module is
 * pure. The endpoint that serves it needs the dev database and cannot be tested
 * here, so the logic that decides the numbers is covered separately.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { recordPulse, pulsesSince, resetPulses } from "./errorPulse";

describe("errorPulse", () => {
  beforeEach(() => resetPulses());

  test("nothing logged is a real zero, and newestAt is null not 0", () => {
    const s = pulsesSince(0);
    assert.equal(s.error, 0);
    assert.equal(s.warn, 0);
    assert.equal(s.newestAt, null);
    assert.equal(s.saturated, false);
  });

  test("levels are counted apart, because a warn is not an outage", () => {
    const now = 1_000_000;
    recordPulse("warn", "revenuecat 401", now);
    recordPulse("error", "friends feed blew up", now);
    recordPulse("error", "friends feed blew up again", now);
    recordPulse("fatal", "pool exhausted", now);

    const s = pulsesSince(now - 1000);
    assert.equal(s.warn, 1);
    assert.equal(s.error, 2);
    assert.equal(s.fatal, 1);
  });

  test("the window cuts, and newestAt still reports the last of all time", () => {
    const now = 1_000_000;
    recordPulse("error", "old", now - 7_200_000);
    recordPulse("error", "recent", now - 60_000);

    const lastHour = pulsesSince(now - 3_600_000);
    assert.equal(lastHour.error, 1);
    assert.deepEqual(lastHour.recent.map((p) => p.message), ["recent"]);
    // Outside the window but still the newest thing that happened.
    assert.equal(lastHour.newestAt, now - 60_000);
  });

  test("recent is newest first, so the page never has to reverse it", () => {
    recordPulse("error", "first", 1000);
    recordPulse("error", "second", 2000);
    recordPulse("error", "third", 3000);
    assert.deepEqual(
      pulsesSince(0).recent.map((p) => p.message),
      ["third", "second", "first"],
    );
  });

  // The ring exists so this can never be what runs the server out of memory.
  test("it rings rather than growing, and says when it has saturated", () => {
    for (let i = 0; i < 260; i++) recordPulse("error", `msg ${i}`, 1000 + i);
    const s = pulsesSince(0, 3);
    assert.equal(s.saturated, true);
    assert.ok(s.error <= 200, `kept ${s.error}`);
    // The newest survive; the oldest are the ones dropped.
    assert.deepEqual(s.recent.map((p) => p.message), ["msg 259", "msg 258", "msg 257"]);
  });

  test("a long message is truncated rather than stored whole", () => {
    recordPulse("error", "x".repeat(5000), 1000);
    const [p] = pulsesSince(0).recent;
    assert.ok(p.message.length <= 200, `length ${p.message.length}`);
  });

  test("a non-string message does not throw, because a logger must never throw", () => {
    recordPulse("error", undefined, 1000);
    recordPulse("warn", { shape: "object" } as unknown as string, 1000);
    assert.equal(pulsesSince(0).recent.length, 2);
  });
});
