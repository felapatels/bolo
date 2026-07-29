// One-off operational script (Task 818): grants the "plus" promotional
// entitlement to a single RevenueCat customer (keyed by Clerk user id) for
// 1 year, then reads the state back for verification.
//
//   pnpm --filter @workspace/scripts exec tsx src/grantPromotionalPlus.ts <clerk_user_id>
//
// v1 calls authenticate with the owner-provided REVENUECAT_SECRET_API_KEY (a
// V1 secret key) — the Replit connector's token is v2-only and 401s on every
// v1 endpoint, and promotional grants exist only on v1. The v2 read-back still
// goes through the connector proxy (its v2 reads work).
//
//   1. POST /v1/subscribers/{id}/entitlements/plus/promotional  (auto-creates
//      the customer if RevenueCat has never seen the id)
//   2. GET  /v1/subscribers/{id}                                 (the exact
//      shape the server's reconcile-on-read consumes)
//   3. GET  /v2/projects/{project}/customers/{id}/active_entitlements
//
// Read-only apart from the single promotional grant; touches ONLY the user id
// passed on the command line.

import { ReplitConnectors } from "@replit/connectors-sdk";

const V1_KEY = process.env.REVENUECAT_SECRET_API_KEY?.trim();

const ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID?.trim() || "plus";
const PROJECT_ID = process.env.REVENUECAT_PROJECT_ID?.trim();

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const userId = process.argv[2];
if (!userId || !userId.startsWith("user_")) {
  console.error(
    "Usage: tsx src/grantPromotionalPlus.ts <clerk_user_id>  (must start with user_)",
  );
  process.exit(1);
}
if (!PROJECT_ID) {
  console.error("REVENUECAT_PROJECT_ID is not set.");
  process.exit(1);
}
if (!V1_KEY) {
  console.error("REVENUECAT_SECRET_API_KEY is not set (V1 secret key).");
  process.exit(1);
}

const connectors = new ReplitConnectors();

// v1 endpoints: direct API with the owner's V1 secret key.
async function rcV1(method: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.revenuecat.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${V1_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, json };
}

// v2 endpoints: the Replit connector proxy (its token handles v2 reads).
async function rcV2(method: string, path: string, body?: unknown) {
  const res = await connectors.proxy("revenuecat", path, {
    method,
    ...(body !== undefined ? { body } : {}),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, json };
}

async function main(): Promise<void> {
  const encoded = encodeURIComponent(userId);
  const endTimeMs = Date.now() + ONE_YEAR_MS;

  console.log(`Granting 1-year promotional "${ENTITLEMENT_ID}" to ${userId}`);
  console.log(`  end_time_ms = ${endTimeMs} (${new Date(endTimeMs).toISOString()})`);

  // 1) The promotional grant (v1). Auto-creates the customer if needed.
  const grant = await rcV1(
    "POST",
    `/v1/subscribers/${encoded}/entitlements/${encodeURIComponent(ENTITLEMENT_ID)}/promotional`,
    { end_time_ms: endTimeMs },
  );
  if (!grant.ok) {
    console.error(
      `GRANT FAILED (HTTP ${grant.status}): ${JSON.stringify(grant.json)}`,
    );
    console.error("STOP — do the grant manually in the RevenueCat dashboard.");
    process.exit(2);
  }
  console.log(`Grant accepted (HTTP ${grant.status}).`);

  // 2) Read back the v1 subscriber — the exact shape reconcile-on-read uses.
  const sub = await rcV1("GET", `/v1/subscribers/${encoded}`);
  const ent = sub.json?.subscriber?.entitlements?.[ENTITLEMENT_ID];
  const promoSubs = Object.entries(
    (sub.json?.subscriber?.subscriptions ?? {}) as Record<string, any>,
  ).filter(([, s]) => s?.store === "promotional");
  console.log("\n--- v1 subscriber read-back ---");
  console.log(`entitlements.${ENTITLEMENT_ID}:`, JSON.stringify(ent));
  console.log("promotional subscriptions:", JSON.stringify(promoSubs));

  // 3) Read back the v2 active entitlements.
  const active = await rcV2(
    "GET",
    `/v2/projects/${PROJECT_ID}/customers/${encoded}/active_entitlements`,
  );
  console.log("\n--- v2 active_entitlements ---");
  console.log(`HTTP ${active.status}:`, JSON.stringify(active.json?.items ?? active.json));

  const expires = ent?.expires_date ? new Date(ent.expires_date) : null;
  const activeNow = expires != null && expires.getTime() > Date.now();
  console.log(
    `\nRESULT: ${activeNow ? "ACTIVE" : "NOT ACTIVE"} — expires ${expires?.toISOString() ?? "n/a"}`,
  );
  process.exit(activeNow ? 0 : 3);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
