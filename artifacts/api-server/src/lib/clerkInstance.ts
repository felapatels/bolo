/**
 * WHICH CLERK INSTANCE A REQUEST BELONGS TO, DECIDED IN ONE PLACE.
 *
 * One deployment answers on two hostnames that are two different Clerk
 * instances: the custom domain (production, CLERK_SECRET_KEY_PROD) and the
 * .replit.app / .replit.dev URL (development, CLERK_SECRET_KEY). The session
 * check in app.ts and the Frontend API proxy each chose the secret per host, as
 * two separate copies of one rule.
 *
 * EVERY BACKEND API CALL IGNORED IT, and that is ledger X100 (2026-09-14). The
 * identity capture, the account routes and the Nest's live reading all used
 * @clerk/express's default `clerkClient`, which reads bare CLERK_SECRET_KEY and
 * nothing else. On a fork with both slots filled, every production learner was
 * looked up in the DEVELOPMENT instance and not found:
 *   - userIdentity swallowed the miss, so new learners never got a name or
 *     email (seen in the Nest on bolo-sea.app);
 *   - accountIdentity.deleteUser read the 404 as "already gone" and reported
 *     success, leaving the real Clerk account alive after a deletion;
 *   - profile, email and password changes threw.
 *
 * So the rule lives here, and the middleware, the proxy and every API call
 * resolve their secret through it. `@clerk/backend` is a direct dependency
 * only for `createClerkClient`: @clerk/express 2.1.40 does not re-export it.
 */
import type { IncomingHttpHeaders } from "node:http";
import { createClerkClient, type ClerkClient } from "@clerk/backend";
import { clerkClient as envClerkClient } from "@clerk/express";
import { APP_DOMAIN } from "./appDomain";

/**
 * Returns the first effective public hostname for the given request,
 * preferring x-forwarded-host over the Host header so callers behind a
 * proxy see the original client-facing host.
 *
 * x-forwarded-host can take three shapes:
 *   - undefined (no proxy involved)
 *   - a single string (one proxy hop)
 *   - a comma-delimited string when an upstream appended rather than
 *     replaced the header (Node folds duplicate headers this way), or a
 *     string[] in some Express typings
 * In the multi-value case, the leftmost value is the original client-
 * facing host. Take that one in all forms. Moved here from
 * clerkProxyMiddleware.ts (which re-exports it) so this module needs nothing
 * from a middleware.
 */
export function getClerkProxyHost(req: {
  headers: IncomingHttpHeaders;
}): string | undefined {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstHop = raw?.split(",")[0]?.trim();
  return firstHop || req.headers.host?.trim() || undefined;
}

/**
 * The secret for a hostname. CLERK_SECRET_KEY_PROD is OPTIONAL: set, the
 * custom domain uses it while every other host keeps CLERK_SECRET_KEY; unset,
 * every host uses CLERK_SECRET_KEY, which is the state before a fork's flip.
 * The `??` is load-bearing: an unset PROD slot must fall back, never yield
 * undefined on the custom domain.
 */
export function clerkSecretKeyForHost(
  host: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const h = host.toLowerCase();
  const isCustomDomain = h === APP_DOMAIN || h === `www.${APP_DOMAIN}`;
  return (isCustomDomain ? env.CLERK_SECRET_KEY_PROD : undefined) ?? env.CLERK_SECRET_KEY;
}

export function clerkSecretKeyForRequest(req: {
  headers: IncomingHttpHeaders;
}): string | undefined {
  return clerkSecretKeyForHost(getClerkProxyHost(req) ?? "");
}

// One client per secret, built on first use. There are at most two.
const clients = new Map<string, ClerkClient>();

/**
 * The backend API client for the instance that issued this request's session.
 * With no secret at all (tests, a bare local boot) it returns the library's
 * default client, which is exactly what every call site used before.
 */
export function clerkClientForRequest(req: {
  headers: IncomingHttpHeaders;
}): ClerkClient {
  const secretKey = clerkSecretKeyForRequest(req);
  if (!secretKey) return envClerkClient;
  let client = clients.get(secretKey);
  if (!client) {
    client = createClerkClient({ secretKey });
    clients.set(secretKey, client);
  }
  return client;
}
