import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchSubscriber } from "./revenuecatClient";

// ---------------------------------------------------------------------------
// Reconcile-on-read has been dead in production for a month. Replit's connector
// issues a v2-scoped token, so the v1 subscriber call it made returned 401
// every time, logged a warning nobody reads, and fell back to stored state.
//
// These pin the secret-key path that replaces it, and in particular the two
// behaviours the caller depends on: a MISSING subscriber must resolve the user
// to Free, and a FAILED call must leave stored state alone. Confusing those two
// either downgrades a paying subscriber or promotes a free one.
// ---------------------------------------------------------------------------

const ENV = { ...process.env };
beforeEach(() => {
  process.env.REVENUECAT_PROJECT_ID = "proj_test";
  process.env.REVENUECAT_SECRET_API_KEY = "sk_test_key";
});
afterEach(() => {
  process.env = { ...ENV };
});

function respond(status: number, body: unknown = {}) {
  const calls: { url: string; auth: string | undefined }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({
      url: String(url),
      auth: (init.headers as Record<string, string>)?.Authorization,
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("the secret key path, which the connector could never do", () => {
  test("sends the v1 subscriber request with a bearer token", async () => {
    const { impl, calls } = respond(200, { subscriber: { entitlements: {} } });
    await fetchSubscriber("user_2abc", impl);

    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.url.startsWith("https://api.revenuecat.com/v1/subscribers/"));
    assert.equal(calls[0]!.auth, "Bearer sk_test_key");
  });

  test("the app user id is URL encoded, so a Clerk id can never break the path", async () => {
    const { impl, calls } = respond(200, { subscriber: {} });
    await fetchSubscriber("user/with spaces?and=junk", impl);
    assert.ok(calls[0]!.url.includes("user%2Fwith%20spaces%3Fand%3Djunk"));
  });

  test("returns the subscriber on success", async () => {
    const sub = { entitlements: { plus: { expires_date: null } } };
    const { impl } = respond(200, { subscriber: sub });
    assert.deepEqual(await fetchSubscriber("user_2abc", impl), sub);
  });

  test("201 is SUCCESS, not an error", async () => {
    // v1 GET /subscribers auto-creates an id it has never seen and answers 201.
    // Treating that as a failure would leave every brand new learner on stored
    // state instead of resolving them to Free.
    const { impl } = respond(201, { subscriber: { entitlements: {} } });
    assert.deepEqual(await fetchSubscriber("user_new", impl), { entitlements: {} });
  });

  test("A MISSING SUBSCRIBER RESOLVES TO FREE, an empty object not null", async () => {
    const { impl } = respond(404);
    assert.deepEqual(await fetchSubscriber("user_gone", impl), {});
  });

  test("A FAILED CALL RETURNS NULL, so stored state is left alone", async () => {
    // The distinction that matters. {} means "RevenueCat says no subscription"
    // and downgrades the learner. null means "we could not ask" and changes
    // nothing. Getting these the wrong way round bills or unbills real people.
    for (const status of [401, 403, 429, 500, 503]) {
      const { impl } = respond(status);
      assert.equal(await fetchSubscriber("user_2abc", impl), null, `status ${status}`);
    }
  });

  test("a network failure returns null rather than throwing", async () => {
    const impl = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    assert.equal(await fetchSubscriber("user_2abc", impl), null);
  });

  test("a success body with no subscriber key is an empty subscriber", async () => {
    const { impl } = respond(200, {});
    assert.deepEqual(await fetchSubscriber("user_2abc", impl), {});
  });
});

describe("the guards around it", () => {
  test("no PROJECT_ID means RevenueCat is not live: no call at all", async () => {
    delete process.env.REVENUECAT_PROJECT_ID;
    const { impl, calls } = respond(200, { subscriber: {} });
    assert.equal(await fetchSubscriber("user_2abc", impl), null);
    assert.equal(calls.length, 0);
  });

  test("no secret key falls through to the connector, never to the bare API", async () => {
    // Without a key it must NOT call api.revenuecat.com unauthenticated; it
    // hands off to the connector, which is the pre-existing (broken) path
    // rather than a new way to fail.
    delete process.env.REVENUECAT_SECRET_API_KEY;
    const { impl, calls } = respond(200, { subscriber: {} });
    await fetchSubscriber("user_2abc", impl);
    assert.equal(calls.length, 0);
  });
});
