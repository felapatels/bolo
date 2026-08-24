// The streak push: when it fires, when it must not, and what it says.
//
// Every assertion here is about a message reaching a real person's lock screen,
// which is the one kind of bug in this codebase that cannot be taken back. A
// notification at 3am, a duplicate, or one sent to somebody who practised an
// hour ago all cost the same thing: push turned off for good.
//
// Pure functions only. The send itself needs the database and lives with the
// api suite; these are the decisions the send is made of.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inSendWindow,
  localHour,
  streakIsAboutToLapse,
  streakPushCopy,
  STREAK_PUSH_WINDOW_START,
  STREAK_PUSH_WINDOW_END,
} from "./streakPushLogic";

test("the window is after school and before bedtime", () => {
  assert.equal(STREAK_PUSH_WINDOW_START, 17);
  assert.equal(STREAK_PUSH_WINDOW_END, 20);
  for (const h of [17, 18, 19]) {
    assert.ok(inSendWindow(h), `${h}:00 must be inside the window`);
  }
  // 20 is EXCLUSIVE: "before 8pm" means the 8pm hour is already too late.
  for (const h of [0, 3, 8, 12, 16, 20, 21, 23]) {
    assert.ok(!inSendWindow(h), `${h}:00 must be outside the window`);
  }
});

test("no timezone means no send, never a UTC guess", () => {
  // The bug this exists to stop: a UTC fallback puts a 5pm window at 22:30 in
  // India. A notification at half past ten at night is worse than none.
  const now = new Date("2026-08-24T12:00:00Z");
  assert.equal(localHour(now, null), null);
  assert.equal(localHour(now, "Not/AZone"), null);
  assert.equal(localHour(now, ""), null);
});

test("a real timezone resolves to that learner's own hour", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  assert.equal(localHour(now, "UTC"), 12);
  assert.equal(localHour(now, "Asia/Kolkata"), 17);
  assert.equal(localHour(now, "America/Los_Angeles"), 5);
});

test("only the day between yesterday and gone counts as at risk", () => {
  const today = "2026-08-24";
  // Practised yesterday and not today: the one day this message is welcome.
  assert.equal(streakIsAboutToLapse("2026-08-23", today), true);
  // Practised today: nothing to warn about.
  assert.equal(streakIsAboutToLapse(today, today), false);
  // Streak already gone: a reminder is a nag about a loss already taken.
  assert.equal(streakIsAboutToLapse("2026-08-22", today), false);
  assert.equal(streakIsAboutToLapse("2026-07-01", today), false);
  // Never practised.
  assert.equal(streakIsAboutToLapse(null, today), false);
});

test("it crosses a month boundary correctly", () => {
  // Day-string arithmetic is where this kind of check usually breaks.
  assert.equal(streakIsAboutToLapse("2026-07-31", "2026-08-01"), true);
  assert.equal(streakIsAboutToLapse("2026-02-28", "2026-03-01"), true);
});

test("every line leads with the parrot and never scolds", () => {
  const days = [
    new Date("2026-08-24T17:00:00Z"),
    new Date("2026-08-25T17:00:00Z"),
    new Date("2026-08-26T17:00:00Z"),
    new Date("2026-08-27T17:00:00Z"),
    new Date("2026-08-28T17:00:00Z"),
  ];
  for (const streak of [1, 5]) {
    for (const d of days) {
      const copy = streakPushCopy(streak, d);
      // The emoji LEADS, because truncation eats the end of a title on both
      // platforms and it is the only part that reads as Bolo at a glance.
      assert.ok(
        copy.title.startsWith("\u{1F99C}"),
        `title must start with the parrot: ${copy.title}`,
      );
      assert.ok(copy.body.length > 0);
      // No em dashes anywhere in app copy.
      assert.ok(!/—/.test(copy.title + copy.body));
      // Warm and a bit pathetic, never told off.
      assert.ok(
        !/should|must|failed|lazy|forgot/i.test(copy.title + copy.body),
        `copy must never scold: ${copy.title} / ${copy.body}`,
      );
    }
  }
});

test("the copy rotates by day, and is stable within one day", () => {
  const a = streakPushCopy(5, new Date("2026-08-24T17:00:00Z"));
  const b = streakPushCopy(5, new Date("2026-08-24T19:30:00Z"));
  const c = streakPushCopy(5, new Date("2026-08-25T17:00:00Z"));
  // Stable within a day, so a retry inside one run cannot produce two
  // different messages.
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("day one is invited, not threatened", () => {
  // There is no streak to lose yet, so loss framing would be a lie.
  const copy = streakPushCopy(1, new Date("2026-08-24T17:00:00Z"));
  assert.ok(!/ends at midnight|runs out/i.test(copy.body), copy.body);
});
