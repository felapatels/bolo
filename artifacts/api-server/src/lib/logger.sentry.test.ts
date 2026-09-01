import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

/**
 * THE API SERVER HAS NEVER SENT AN ERROR TO SENTRY, and this pins the reason.
 *
 * CLAUDE.md carried it as an open mystery from 2026-08-26: the node-express
 * project held zero issues while /friends/feed returned 500 to every learner,
 * and a total outage produced no alert and was found by using the app. The
 * wiring all looked right. SENTRY_DSN is set in [userenv.production], sentry.ts
 * calls Sentry.init, logger.ts forwards warn and above, and app.ts logs every
 * unhandled route error.
 *
 * TWO INDEPENDENT FAULTS, either of which alone would have been enough.
 *
 *   1. Sentry.setupExpressErrorHandler(app) cannot work here. build.mjs bundles
 *      express into dist/index.mjs, and Sentry patches express as a MODULE, so
 *      there is nothing to patch. The boot log has been saying so at every
 *      start: "[Sentry] express is not instrumented".
 *
 *   2. THE ONE THIS FILE GUARDS. pinoHttp is handed the forwarding proxy and
 *      calls .child() on it to build req.log. `child` was not intercepted, so
 *      it returned pino's raw method, which returns a plain unwrapped child.
 *      req.log.error() wrote a perfect log line and told Sentry nothing, and
 *      req.log is exactly what app.ts's error handler uses.
 *
 * A test on the base logger passes either way, which is why nothing caught
 * this. It has to assert through a CHILD, and through a grandchild, because
 * pino-http makes one per request and route-level code makes more.
 */
type Captured = { level: string; message: string };

let captured: Captured[];
let logger: { child: (b: object) => unknown; error: (...a: unknown[]) => void };

before(async () => {
  process.env.SENTRY_DSN = "https://public@127.0.0.1:1/1";
  captured = [];

  const { mock } = await import("node:test");
  mock.module("@sentry/node", {
    namedExports: {
      init() {},
      withScope(fn: (s: unknown) => void) {
        fn({ setLevel(l: string) { (globalThis as never as { __lvl: string }).__lvl = l; }, setContext() {} });
      },
      captureException(err: Error) {
        captured.push({ level: (globalThis as never as { __lvl: string }).__lvl, message: err.message });
      },
      captureMessage(msg: string, level: string) {
        captured.push({ level, message: msg });
      },
    },
  });

  ({ logger } = (await import("./logger.js")) as never);
});

describe("logger forwards to Sentry", () => {
  it("forwards from the base logger", () => {
    captured.length = 0;
    logger.error({ err: new Error("from base") }, "base said so");
    assert.equal(captured.length, 1);
    assert.equal(captured[0].message, "from base");
  });

  /**
   * THE REGRESSION GUARD. Every unhandled route error in this server goes
   * through req.log, which is a child. If this test ever fails, production is
   * silent again and nobody will notice until an outage is reported by a human.
   */
  it("forwards from a CHILD, which is what req.log is", () => {
    captured.length = 0;
    const child = logger.child({ reqId: 1 }) as typeof logger;
    child.error({ err: new Error("from req.log") }, "route blew up");
    assert.equal(
      captured.length,
      1,
      "a child logger must forward to Sentry; pino-http builds req.log with .child()",
    );
    assert.equal(captured[0].message, "from req.log");
  });

  it("keeps forwarding through a grandchild", () => {
    captured.length = 0;
    const grandchild = (logger.child({ a: 1 }) as typeof logger).child({ b: 2 }) as typeof logger;
    grandchild.error({ err: new Error("two deep") }, "still reported");
    assert.equal(captured.length, 1);
    assert.equal(captured[0].message, "two deep");
  });
});
