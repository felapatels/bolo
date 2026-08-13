/**
 * A bad token is 401; a broken auth service is still 500 (Task #1089).
 *
 * Probing PRODUCTION during the App Review build 34 rejection turned up a real
 * defect: `GET /api/account` with a syntactically-shaped but corrupt JWT
 * returned 500, because Clerk's `decodeJwt` throws on a signature segment that
 * is not valid base64url and the rejection fell through to the global error
 * handler. A client cannot tell that apart from the server being down, and it
 * is exactly the kind of failure this task exists to make legible.
 *
 * The pins below cut BOTH ways. The three channels a throw can arrive through
 * (synchronous, `next(err)`, rejected promise) must all become 401 when the
 * error is about the presented token — and an unhealthy verifier (missing
 * JWKS, bad secret key, network fault) must still reach express's error
 * handler as a 500, so an outage is never laundered into "your sign-in
 * failed".
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { AUTH_ERROR_HEADER, guardUnreadableToken } from "./unreadableTokenGuard";

// How the stand-in "Clerk middleware" fails, and through which channel.
type Channel = "ok" | "throw" | "next-error" | "reject";
let channel: Channel = "ok";
let failure: Error = new SyntaxError("Unexpected end of data");
let warnings: string[] = [];

/** Clerk's TokenVerificationError, duck-typed the way the guard reads it. */
function verificationError(reason: string): Error {
  const err = new Error(`Clerk: ${reason}`);
  err.name = "TokenVerificationError";
  (err as Error & { reason: string }).reason = reason;
  return err;
}

const fakeClerk: RequestHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  switch (channel) {
    case "throw":
      throw failure;
    case "next-error":
      next(failure);
      return;
    case "reject":
      return Promise.reject(failure) as unknown as void;
    case "ok":
      next();
  }
};

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { log: unknown }).log = {
      warn: (_obj: unknown, msg: string) => warnings.push(msg),
      error: () => {},
      info: () => {},
    };
    next();
  });
  app.use(guardUnreadableToken(fakeClerk));
  app.get("/api/account", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  // The global handler the app really has: anything that escapes is a 500.
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: "Internal server error" });
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server?.close());

/** A request shaped like the mobile app's: a Bearer token is presented. */
async function getWithToken(headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}/api/account`, {
    headers: { authorization: "Bearer aaa.bbb.ccc", ...headers },
  });
  return {
    status: res.status,
    reason: res.headers.get(AUTH_ERROR_HEADER),
    body: (await res.json().catch(() => null)) as { error?: string } | null,
  };
}

// ── A throw about the presented token: 401, through every channel ───────────

test("a synchronous decode failure yields 401 naming the reason", async () => {
  channel = "throw";
  failure = new SyntaxError("Unexpected end of data");
  warnings = [];

  const res = await getWithToken();
  assert.equal(res.status, 401);
  assert.equal(res.reason, "token-unreadable");
  assert.deepEqual(res.body, { error: "Unauthorized" });
  // The cause is logged rather than discarded.
  assert.equal(warnings.length, 1);
});

test("a decode failure delivered via next(err) yields 401", async () => {
  channel = "next-error";
  failure = new SyntaxError("Unexpected end of data");
  const res = await getWithToken();
  assert.equal(res.status, 401);
  assert.equal(res.reason, "token-unreadable");
});

test("a decode failure delivered as a rejected promise yields 401", async () => {
  // The guard is now what express sees, so it — not express — has to catch the
  // rejection. Without the .catch this request 500s (or worse, hangs).
  channel = "reject";
  failure = new SyntaxError("Unexpected end of data");
  const res = await getWithToken();
  assert.equal(res.status, 401);
  assert.equal(res.reason, "token-unreadable");
});

test("Clerk's own token-shaped reasons pass through as the reported reason", async () => {
  channel = "throw";
  for (const reason of [
    "token-invalid",
    "token-expired",
    "token-invalid-signature",
  ]) {
    failure = verificationError(reason);
    const res = await getWithToken();
    assert.equal(res.status, 401, reason);
    assert.equal(res.reason, reason);
  }
});

// ── A throw about the SERVICE: still a 500 ──────────────────────────────────

test("an unhealthy verifier is NOT laundered into a 401", async () => {
  channel = "throw";
  // These say our configuration or Clerk's key endpoint is broken — telling a
  // learner to sign in again would be a lie, and would hide the incident.
  for (const reason of [
    "jwk-remote-failed-to-load",
    "jwk-kid-mismatch",
    "secret-key-invalid",
    "token-verification-failed",
  ]) {
    failure = verificationError(reason);
    const res = await getWithToken();
    assert.equal(res.status, 500, reason);
    assert.equal(res.reason, null, reason);
  }
});

test("an unexpected internal error stays a 500", async () => {
  channel = "reject";
  failure = new TypeError("fetch failed");
  const res = await getWithToken();
  assert.equal(res.status, 500);
  assert.equal(res.reason, null);
});

test("a decode failure with NO token presented stays a 500", async () => {
  // Nothing thrown on a token-less request can be about a token, so this is a
  // fault in our own middleware stack and must not be reported as auth.
  channel = "throw";
  failure = new SyntaxError("Unexpected end of data");
  const res = await fetch(`${baseUrl}/api/account`);
  assert.equal(res.status, 500);
  assert.equal(res.headers.get(AUTH_ERROR_HEADER), null);
});

test("a web request carrying Clerk's session cookie counts as presenting a token", async () => {
  channel = "throw";
  failure = new SyntaxError("Unexpected end of data");
  const res = await fetch(`${baseUrl}/api/account`, {
    headers: { cookie: "foo=1; __session=aaa.bbb.ccc" },
  });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get(AUTH_ERROR_HEADER), "token-unreadable");
});

// ── The happy path is untouched ─────────────────────────────────────────────

test("a clean verification passes straight through", async () => {
  channel = "ok";
  const res = await getWithToken();
  assert.equal(res.status, 200);
  assert.equal(res.reason, null);
  assert.deepEqual(res.body, { ok: true });
});
