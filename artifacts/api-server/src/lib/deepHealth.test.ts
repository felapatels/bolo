/**
 * Runs on the Mac, like the other pure suites. The handler needs a database and
 * cannot be tested here, which is why the two decisions that matter, what
 * status to return and who may ask, live in a pure module.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { summarise, statusFor, deepHealthAuthorised } from "./deepHealth";

const AT = new Date("2026-08-28T12:00:00.000Z");

describe("summarise", () => {
  test("all passing is ok, with nothing in failing", () => {
    const h = summarise([{ name: "db", ok: true }, { name: "users", ok: true }], AT);
    assert.equal(h.ok, true);
    assert.deepEqual(h.failing, []);
    assert.equal(h.checkedAt, AT.toISOString());
  });

  test("one failure names it and only it", () => {
    const h = summarise(
      [{ name: "db", ok: true }, { name: "user_blocks", ok: false }, { name: "users", ok: true }],
      AT,
    );
    assert.equal(h.ok, false);
    assert.deepEqual(h.failing, ["user_blocks"]);
  });

  test("every check still appears, so a monitor can show the whole picture", () => {
    const h = summarise([{ name: "db", ok: false }, { name: "users", ok: false }], AT);
    assert.equal(h.checks.length, 2);
    assert.deepEqual(h.failing, ["db", "users"]);
  });
});

describe("statusFor", () => {
  test("healthy is 200", () => {
    assert.equal(statusFor(summarise([{ name: "db", ok: true }], AT)), 200);
  });

  // 503 and never 500. A 500 reads as "this endpoint is broken"; a 503 reads as
  // "the service is unavailable", which is what an uptime monitor escalates.
  test("any failure is 503, not 500", () => {
    assert.equal(statusFor(summarise([{ name: "db", ok: false }], AT)), 503);
  });
});

describe("deepHealthAuthorised", () => {
  function withEnv(cron: string | undefined, session: string | undefined, fn: () => void) {
    const c = process.env.CRON_SECRET;
    const s = process.env.SESSION_SECRET;
    try {
      if (cron === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = cron;
      if (session === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = session;
      fn();
    } finally {
      if (c === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = c;
      if (s === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = s;
    }
  }

  // FAILS CLOSED. A missing secret must hide the endpoint, never open it.
  test("no secret set means nobody is authorised, not everybody", () => {
    withEnv(undefined, undefined, () => {
      assert.equal(deepHealthAuthorised("anything"), false);
      assert.equal(deepHealthAuthorised(undefined), false);
      assert.equal(deepHealthAuthorised(""), false);
    });
  });

  test("CRON_SECRET matches, and a wrong one does not", () => {
    withEnv("the-cron-secret", "the-session-secret", () => {
      assert.equal(deepHealthAuthorised("the-cron-secret"), true);
      assert.equal(deepHealthAuthorised("the-session-secret"), false, "cron wins when both are set");
      assert.equal(deepHealthAuthorised("wrong"), false);
    });
  });

  test("SESSION_SECRET is the fallback when CRON_SECRET is unset", () => {
    withEnv(undefined, "the-session-secret", () => {
      assert.equal(deepHealthAuthorised("the-session-secret"), true);
      assert.equal(deepHealthAuthorised("wrong"), false);
    });
  });

  test("a non-string header is refused rather than coerced", () => {
    withEnv("the-cron-secret", undefined, () => {
      assert.equal(deepHealthAuthorised(["the-cron-secret"]), false);
      assert.equal(deepHealthAuthorised(null), false);
      assert.equal(deepHealthAuthorised(42), false);
    });
  });
});
