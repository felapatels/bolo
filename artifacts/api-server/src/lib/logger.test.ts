import { describe, test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// The reason this exists.
//
// Two money bugs hid for weeks in 2026 because the only evidence was a line in
// stdout on a Replit deployment, which is a place nobody opens:
//
//   - Chai pack purchases were charged and never credited (webhook answered
//     200, dropped the event, said nothing).
//   - RevenueCat reconcile-on-read 401'd on every entitlements call for a
//     MONTH, having been diagnosed in CODEBASE-FACTS on 2026-07-29.
//
// The second one logged at WARN, which is why warn is forwarded too. A test
// that only pinned `error` would have let the more expensive bug stay invisible.
// ---------------------------------------------------------------------------

const captured: { kind: string; arg: unknown; level?: string; ctx?: unknown }[] = [];

mock.module("./sentry.js", {
  namedExports: {
    sentryEnabled: true,
    Sentry: {
      withScope: (fn: (s: unknown) => void) => {
        const scope = {
          setLevel: (l: string) => captured.push({ kind: "level", arg: l, level: l }),
          setContext: (_n: string, c: unknown) => captured.push({ kind: "context", arg: c, ctx: c }),
        };
        fn(scope);
      },
      captureException: (e: unknown) => captured.push({ kind: "exception", arg: e }),
      captureMessage: (m: unknown, l?: string) => captured.push({ kind: "message", arg: m, level: l }),
    },
  },
});

const { logger } = await import("./logger.js");

beforeEach(() => {
  captured.length = 0;
});

const kinds = () => captured.map((c) => c.kind);
const levels = () => captured.filter((c) => c.kind === "level").map((c) => c.level);

describe("WARN AND ABOVE REACH SENTRY", () => {
  test("warn is forwarded, which is the whole point", () => {
    // The RevenueCat 401 logged at warn for a month. If this ever stops being
    // true, that class of failure goes silent again.
    logger.warn({ status: 401 }, "RevenueCat subscriber fetch non-OK");
    assert.ok(kinds().includes("message"));
    assert.deepEqual(levels(), ["warning"]);
  });

  test("error is forwarded", () => {
    logger.error({ productId: "x" }, "Consumable purchase could not be credited");
    assert.ok(kinds().includes("message"));
    assert.deepEqual(levels(), ["error"]);
  });

  test("fatal is forwarded", () => {
    logger.fatal("the pipeline died");
    assert.deepEqual(levels(), ["fatal"]);
  });

  test("INFO IS NOT, or Sentry becomes the request log", () => {
    logger.info({ req: {} }, "request completed");
    assert.deepEqual(captured, []);
  });

  test("debug and trace are not either", () => {
    logger.debug("noise");
    logger.trace("more noise");
    assert.deepEqual(captured, []);
  });
});

describe("what it sends", () => {
  test("an Error on the log becomes an exception, so Sentry groups by stack", () => {
    const err = new Error("ECONNRESET");
    logger.error({ err }, "RevenueCat subscriber fetch failed");
    assert.ok(kinds().includes("exception"));
    assert.ok(!kinds().includes("message"));
    assert.equal(captured.find((c) => c.kind === "exception")?.arg, err);
  });

  test("everything else becomes a message keyed on the LOG LINE", () => {
    // Grouping on the message rather than on whichever field varies is what
    // keeps one recurring failure as one issue instead of hundreds.
    logger.warn({ status: 503, userId: "a" }, "RevenueCat subscriber fetch non-OK");
    logger.warn({ status: 429, userId: "b" }, "RevenueCat subscriber fetch non-OK");
    const msgs = captured.filter((c) => c.kind === "message").map((c) => c.arg);
    assert.deepEqual(msgs, [
      "RevenueCat subscriber fetch non-OK",
      "RevenueCat subscriber fetch non-OK",
    ]);
  });

  test("the log object rides along as context", () => {
    logger.error({ productId: "bolo_chai_kulhad", eventType: "RENEWAL" }, "dropped");
    const ctx = captured.find((c) => c.kind === "context")?.ctx as Record<string, unknown>;
    assert.equal(ctx.productId, "bolo_chai_kulhad");
    assert.equal(ctx.eventType, "RENEWAL");
  });

  test("a bare string message still reports", () => {
    logger.error("something went wrong");
    assert.equal(captured.find((c) => c.kind === "message")?.arg, "something went wrong");
  });
});
