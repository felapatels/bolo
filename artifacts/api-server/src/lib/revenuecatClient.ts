// Thin wrapper around the Replit RevenueCat connector. The connector injects and
// refreshes OAuth credentials automatically; we only ever proxy REST calls
// through it. Never cache the client, tokens expire, so a fresh instance is
// created per call.
//
// Every call here is best-effort: if the connector isn't set up yet, or the
// RevenueCat API is unreachable, we return null rather than throwing so the
// reconcile-on-read path degrades to the last known stored state instead of
// failing the request.

import { ReplitConnectors } from "@replit/connectors-sdk";
import type { RevenueCatSubscriber } from "./revenuecatSync";
import { logger } from "./logger";

const CONNECTOR_NAME = "revenuecat";
const V1_BASE = "https://api.revenuecat.com/v1";

/**
 * THE CONNECTOR CANNOT DO THIS CALL, AND HAS NEVER BEEN ABLE TO.
 *
 * Replit's RevenueCat connector issues a v2-scoped token, so every /v1/ request
 * through it returns 401 "Invalid API Key" (code 7225). Recorded in
 * docs/CODEBASE-FACTS.md on 2026-07-29 and unfixed since: reconcile-on-read has
 * silently no-opped in production for a month, logging "subscriber fetch
 * non-OK" on every entitlements check while quietly falling back to stored
 * state. Nobody saw it because the API logger has no Sentry transport.
 *
 * A v1 secret key already exists in the environment. Using it directly is both
 * the fix and one less thread tying this codebase to Replit, which matters
 * while we are moving off it.
 *
 * The connector stays as a fallback so nothing regresses in an environment
 * where the key is absent. It will keep 401ing there; that is not a new
 * failure, it is the existing one.
 */
async function fetchViaSecretKey(
  appUserId: string,
  key: string,
  fetchImpl: typeof fetch,
): Promise<RevenueCatSubscriber | null> {
  const res = await fetchImpl(
    `${V1_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    },
  );

  // v1 GET /subscribers auto-creates and answers 201 for an id it has never
  // seen, which is a definitive "no subscription" rather than an error.
  if (res.status === 404) return {};

  if (!res.ok) {
    logger.warn(
      { status: res.status, via: "secret-key" },
      "RevenueCat subscriber fetch non-OK",
    );
    return null;
  }

  const body = (await res.json()) as { subscriber?: RevenueCatSubscriber };
  return body.subscriber ?? {};
}

// Fetches the live subscriber snapshot for a RevenueCat app-user id (which we
// key to the Clerk user id). Returns:
//   - the subscriber object on success,
//   - a synthetic empty subscriber ({}) when RevenueCat has no record (404),
//   - null when the connector is unavailable or the call failed (caller should
//     leave stored state untouched).
export async function fetchSubscriber(
  appUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RevenueCatSubscriber | null> {
  // Reconcile-on-read is only meaningful once RevenueCat is actually set up.
  // REVENUECAT_PROJECT_ID is written when the seed script runs, so we treat it
  // as the "RevenueCat is live" switch, until then, skip the live pull entirely
  // (no network call) and rely on webhook-driven state.
  if (!process.env.REVENUECAT_PROJECT_ID?.trim()) return null;

  // Preferred path. Only falls through to the connector when no key is set.
  const key = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  if (key) {
    try {
      return await fetchViaSecretKey(appUserId, key, fetchImpl);
    } catch (err) {
      logger.warn({ err }, "RevenueCat subscriber fetch failed");
      return null;
    }
  }

  let connectors: ReplitConnectors;
  try {
    connectors = new ReplitConnectors();
  } catch (err) {
    logger.warn({ err }, "RevenueCat connector unavailable");
    return null;
  }

  try {
    const res = await connectors.proxy(
      CONNECTOR_NAME,
      `/v1/subscribers/${encodeURIComponent(appUserId)}`,
      { method: "GET" },
    );

    // RevenueCat returns 404 for an app-user id it has never seen. That is a
    // definitive "no subscription", not an error, represent it as an empty
    // subscriber so the caller resolves the user to Free.
    if (res.status === 404) return {};

    if (!res.ok) {
      logger.warn(
        { status: res.status },
        "RevenueCat subscriber fetch non-OK",
      );
      return null;
    }

    const body = (await res.json()) as { subscriber?: RevenueCatSubscriber };
    return body.subscriber ?? {};
  } catch (err) {
    logger.warn({ err }, "RevenueCat subscriber fetch failed");
    return null;
  }
}
