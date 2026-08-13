import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * A BAD TOKEN IS AN AUTH FAILURE; A BROKEN AUTH SERVICE IS NOT.
 *
 * Clerk's verifier answers most bad tokens with a signed-out state, but a few
 * shapes make it THROW — notably a Bearer whose signature segment is not valid
 * base64url, which surfaces as `SyntaxError: Unexpected end of data` from
 * `decodeJwt`. That rejection reached the global error handler, so a request
 * carrying a corrupt token was answered 500: indistinguishable, from the
 * client, from the server falling over, and useless in a crash report. Found
 * by probing production during the App Review build 34 rejection (Task #1089),
 * where the whole problem was that a failure did not say what it was.
 *
 * The translation is deliberately NARROW. Only a throw that is *about the
 * presented token* becomes a 401; anything that indicates the verification
 * service itself is unhealthy — a missing or unloadable JWKS, a bad secret
 * key, a network fault, an unexpected internal error — is re-thrown to
 * express so it stays a 500 and reaches Sentry. Mislabelling an outage as
 * "your sign-in failed" would send every learner to the sign-in screen and
 * hide the incident.
 */

/**
 * Clerk reasons that describe THE TOKEN THE CLIENT SENT. Everything else in
 * `TokenVerificationErrorReason` (`jwk-*`, `secret-key-invalid`,
 * `token-verification-failed`) describes our own configuration or the
 * availability of Clerk's keys, and must not be laundered into a 401.
 */
const TOKEN_SHAPED_REASONS = new Set([
  "token-expired",
  "token-invalid",
  "token-invalid-algorithm",
  "token-invalid-authorized-parties",
  "token-invalid-signature",
  "token-not-active-yet",
  "token-iat-in-the-future",
]);

/** Header value used when the token could not even be decoded. */
export const UNREADABLE_TOKEN_REASON = "token-unreadable";

/** Response header carrying the reason. Mobile reads this name verbatim. */
export const AUTH_ERROR_HEADER = "x-bolo-auth-error";

/** Did the caller actually present a session token? */
function tokenPresented(req: Request): boolean {
  const authorization = req.headers.authorization;
  if (
    typeof authorization === "string" &&
    /^bearer\s+\S/i.test(authorization)
  ) {
    return true;
  }
  // Web sends the session in Clerk's cookie rather than a header.
  const cookie = req.headers.cookie;
  return typeof cookie === "string" && /(^|;\s*)__session=\S/.test(cookie);
}

/**
 * The reason to report, or null when the error is NOT about the presented
 * token and must therefore stay a server error.
 */
function tokenFailureReason(req: Request, err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  // Without a token, nothing thrown here can be about one.
  if (!tokenPresented(req)) return null;

  // Clerk's own classification, duck-typed: TokenVerificationError carries a
  // `reason` id. (Duck-typed rather than `instanceof` because @clerk/backend
  // is a transitive dependency reached through @clerk/express.)
  const reason = (err as { reason?: unknown }).reason;
  if (typeof reason === "string") {
    return TOKEN_SHAPED_REASONS.has(reason) ? reason : null;
  }

  // The undecodable case: base64url/JSON parsing of the token itself blew up
  // inside decodeJwt before Clerk could classify anything.
  if (err.name === "SyntaxError") return UNREADABLE_TOKEN_REASON;

  return null;
}

export function guardUnreadableToken(clerk: RequestHandler): RequestHandler {
  return function unreadableTokenGuard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    // Verification can fail through three channels, and a throw AFTER a
    // next() is possible; the latch keeps the response single-valued.
    let settled = false;
    const done = (err?: unknown): void => {
      if (settled) return;
      settled = true;
      if (!err) {
        next();
        return;
      }
      const reason = tokenFailureReason(req, err);
      if (reason === null) {
        // Not about the token: a real fault. Let it be a 500 and be reported.
        next(err);
        return;
      }
      req.log?.warn(
        { err, reason },
        "Clerk threw on the presented token; answering 401 instead of 500",
      );
      if (res.headersSent) return;
      res.setHeader(AUTH_ERROR_HEADER, reason);
      res.status(401).json({ error: "Unauthorized" });
    };

    let result: unknown;
    try {
      result = clerk(req, res, done as NextFunction);
    } catch (err) {
      done(err);
      return;
    }
    // The middleware is async, and express only auto-forwards a rejection it
    // can see — this wrapper is what express sees now, so it has to catch.
    if (
      result &&
      typeof (result as Promise<void>).then === "function" &&
      typeof (result as Promise<void>).catch === "function"
    ) {
      void (result as Promise<void>).catch(done);
    }
  };
}
