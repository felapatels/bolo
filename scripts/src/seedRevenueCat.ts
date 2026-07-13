// One-off setup script: creates (idempotently) the Bolo! Plus entitlement, its
// monthly + annual products across the Test / App / Play stores, and a "default"
// offering wiring them together in RevenueCat. Run it AFTER connecting the
// RevenueCat integration, then copy the logged public API keys + ids into
// secrets/env (see the "Wiring" log at the end).
//
//   pnpm --filter @workspace/scripts exec tsx src/seedRevenueCat.ts
//
// It talks to the RevenueCat REST v2 API through the Replit connector proxy, so
// auth is injected automatically — no RevenueCat API key is handled here. A
// 7-day free trial is configured per-store in App Store Connect / Google Play
// (the Test Store can't model trials); the client reads the trial from the
// product metadata automatically once it's set there.

import { ReplitConnectors } from "@replit/connectors-sdk";

// ---------------------------------------------------------------------------
// Configuration — the entitlement id must match REVENUECAT_ENTITLEMENT_ID on the
// server (defaults to "plus"). Store identifiers must match what you create in
// App Store Connect / Google Play. Confirm the store bundle/package ids and the
// prices before a production run.
// ---------------------------------------------------------------------------
const ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID?.trim() || "plus";
const ENTITLEMENT_DISPLAY_NAME = "Bolo! Plus";

const APP_STORE_BUNDLE_ID = "com.bolo.mobile";
const PLAY_STORE_PACKAGE_NAME = "com.bolo.mobile";

// Product store identifiers. Play Store subscriptions use {subscriptionId}:{basePlanId}.
const MONTHLY_ID = "bolo_plus_monthly";
const ANNUAL_ID = "bolo_plus_annual";
const PLAY_MONTHLY_ID = "bolo_plus_monthly:monthly";
const PLAY_ANNUAL_ID = "bolo_plus_annual:annual";

const OFFERING_ID = "default";
const OFFERING_DISPLAY_NAME = "Bolo! Plus";

// Test-store prices (micros = dollars * 1_000_000). Production prices are set in
// App Store Connect / Google Play, not here.
const MONTHLY_PRICE_MICROS = 9_990_000; // $9.99 / month
const ANNUAL_PRICE_MICROS = 59_990_000; // $59.99 / year

interface ProductSpec {
  key: "monthly" | "annual";
  displayName: string;
  userFacingTitle: string;
  duration: "P1M" | "P1Y";
  priceMicros: number;
  testId: string;
  appStoreId: string;
  playStoreId: string;
  packageId: "$rc_monthly" | "$rc_annual";
  packageDisplayName: string;
}

const PRODUCTS: ProductSpec[] = [
  {
    key: "monthly",
    displayName: "Bolo! Plus (Monthly)",
    userFacingTitle: "Bolo! Plus — Monthly",
    duration: "P1M",
    priceMicros: MONTHLY_PRICE_MICROS,
    testId: MONTHLY_ID,
    appStoreId: MONTHLY_ID,
    playStoreId: PLAY_MONTHLY_ID,
    packageId: "$rc_monthly",
    packageDisplayName: "Monthly",
  },
  {
    key: "annual",
    displayName: "Bolo! Plus (Annual)",
    userFacingTitle: "Bolo! Plus — Annual",
    duration: "P1Y",
    priceMicros: ANNUAL_PRICE_MICROS,
    testId: ANNUAL_ID,
    appStoreId: ANNUAL_ID,
    playStoreId: PLAY_ANNUAL_ID,
    packageId: "$rc_annual",
    packageDisplayName: "Annual",
  },
];

const connectors = new ReplitConnectors();

// Small typed wrapper over the connector proxy. Treats "resource already exists"
// as success so the whole script is idempotent.
async function rc<T = any>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await connectors.proxy("revenuecat", path, {
    method,
    ...(body !== undefined ? { body } : {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const type = json?.type ?? json?.code ?? "";
    if (
      res.status === 409 ||
      type === "resource_already_exists" ||
      type === "unprocessable_entity_error"
    ) {
      return json as T;
    }
    throw new Error(
      `RevenueCat ${method} ${path} failed (${res.status}): ${text}`,
    );
  }
  return json as T;
}

async function listAll(path: string): Promise<any[]> {
  const data = await rc<{ items?: any[] }>("GET", path);
  return data.items ?? [];
}

async function main(): Promise<void> {
  // Per-plan map from plan key -> its per-store product ids.
  const spec_toProductIds = new Map<
    "monthly" | "annual",
    { test: string; app: string; play: string }
  >();

  // 1) Project — created in the RevenueCat dashboard on connect. Use the
  //    configured id, else the first project.
  let projectId = process.env.REVENUECAT_PROJECT_ID?.trim();
  if (!projectId) {
    const projects = await listAll("/v2/projects");
    if (projects.length === 0) {
      throw new Error(
        "No RevenueCat project found. Create one in the dashboard, then set REVENUECAT_PROJECT_ID.",
      );
    }
    projectId = projects[0].id;
    console.log(`Using project: ${projects[0].name} (${projectId})`);
  }

  // 2) Apps — every project starts with a Test Store app; create the App Store
  //    and Play Store apps if missing.
  const apps = await listAll(`/v2/projects/${projectId}/apps`);
  const testApp = apps.find((a) => a.type === "test_store");
  if (!testApp) throw new Error("No Test Store app found in the project.");
  let appStoreApp = apps.find((a) => a.type === "app_store");
  let playStoreApp = apps.find((a) => a.type === "play_store");

  if (!appStoreApp) {
    appStoreApp = await rc("POST", `/v2/projects/${projectId}/apps`, {
      name: "Bolo! (iOS)",
      type: "app_store",
      app_store: { bundle_id: APP_STORE_BUNDLE_ID },
    });
    console.log(`Created App Store app: ${appStoreApp.id}`);
  }
  if (!playStoreApp) {
    playStoreApp = await rc("POST", `/v2/projects/${projectId}/apps`, {
      name: "Bolo! (Android)",
      type: "play_store",
      play_store: { package_name: PLAY_STORE_PACKAGE_NAME },
    });
    console.log(`Created Play Store app: ${playStoreApp.id}`);
  }

  // 3) Products — one per store per plan.
  const existingProducts = await listAll(`/v2/projects/${projectId}/products`);
  const findProduct = (storeId: string, appId: string) =>
    existingProducts.find(
      (p) => p.store_identifier === storeId && p.app_id === appId,
    );

  const productIds: string[] = [];
  for (const spec of PRODUCTS) {
    // Test Store product (carries a modeled duration + price for local testing).
    let testProduct = findProduct(spec.testId, testApp.id);
    if (!testProduct) {
      testProduct = await rc("POST", `/v2/projects/${projectId}/products`, {
        store_identifier: spec.testId,
        app_id: testApp.id,
        type: "subscription",
        display_name: spec.displayName,
        title: spec.userFacingTitle,
        subscription: { duration: spec.duration },
      });
      console.log(`Created Test Store product: ${spec.testId}`);
      // Test-store price (undocumented endpoint; ignore "already exists").
      await rc(
        "POST",
        `/v2/projects/${projectId}/products/${testProduct.id}/test_store_prices`,
        { prices: [{ amount_micros: spec.priceMicros, currency: "USD" }] },
      );
    }

    let appProduct = findProduct(spec.appStoreId, appStoreApp.id);
    if (!appProduct) {
      appProduct = await rc("POST", `/v2/projects/${projectId}/products`, {
        store_identifier: spec.appStoreId,
        app_id: appStoreApp.id,
        type: "subscription",
        display_name: spec.displayName,
      });
      console.log(`Created App Store product: ${spec.appStoreId}`);
    }

    let playProduct = findProduct(spec.playStoreId, playStoreApp.id);
    if (!playProduct) {
      playProduct = await rc("POST", `/v2/projects/${projectId}/products`, {
        store_identifier: spec.playStoreId,
        app_id: playStoreApp.id,
        type: "subscription",
        display_name: spec.displayName,
      });
      console.log(`Created Play Store product: ${spec.playStoreId}`);
    }

    spec_toProductIds.set(spec.key, {
      test: testProduct.id,
      app: appProduct.id,
      play: playProduct.id,
    });
    productIds.push(testProduct.id, appProduct.id, playProduct.id);
  }

  // 4) Entitlement — the single "Plus" access level all products unlock.
  const entitlements = await listAll(`/v2/projects/${projectId}/entitlements`);
  let entitlement = entitlements.find((e) => e.lookup_key === ENTITLEMENT_ID);
  if (!entitlement) {
    entitlement = await rc("POST", `/v2/projects/${projectId}/entitlements`, {
      lookup_key: ENTITLEMENT_ID,
      display_name: ENTITLEMENT_DISPLAY_NAME,
    });
    console.log(`Created entitlement: ${ENTITLEMENT_ID}`);
  }
  await rc(
    "POST",
    `/v2/projects/${projectId}/entitlements/${entitlement.id}/actions/attach_products`,
    { product_ids: productIds },
  );

  // 5) Offering + packages — what the client shows on the paywall.
  const offerings = await listAll(`/v2/projects/${projectId}/offerings`);
  let offering = offerings.find((o) => o.lookup_key === OFFERING_ID);
  if (!offering) {
    offering = await rc("POST", `/v2/projects/${projectId}/offerings`, {
      lookup_key: OFFERING_ID,
      display_name: OFFERING_DISPLAY_NAME,
      is_current: true,
    });
    console.log(`Created offering: ${OFFERING_ID}`);
  }

  const packages = await listAll(
    `/v2/projects/${projectId}/offerings/${offering.id}/packages`,
  );
  for (const spec of PRODUCTS) {
    let pkg = packages.find((p) => p.lookup_key === spec.packageId);
    if (!pkg) {
      pkg = await rc(
        "POST",
        `/v2/projects/${projectId}/offerings/${offering.id}/packages`,
        { lookup_key: spec.packageId, display_name: spec.packageDisplayName },
      );
      console.log(`Created package: ${spec.packageId}`);
    }
    const ids = spec_toProductIds.get(spec.key)!;
    await rc(
      "POST",
      `/v2/projects/${projectId}/packages/${pkg.id}/actions/attach_products`,
      {
        products: [
          { product_id: ids.test, eligibility_criteria: "all" },
          { product_id: ids.app, eligibility_criteria: "all" },
          { product_id: ids.play, eligibility_criteria: "all" },
        ],
      },
    );
  }

  // 6) Public API keys for the clients (safe to expose).
  const keysFor = async (appId: string): Promise<string> => {
    const keys = await listAll(
      `/v2/projects/${projectId}/apps/${appId}/public_api_keys`,
    );
    return keys.map((k: any) => k.key).join(", ") || "N/A";
  };

  console.log("\n====================");
  console.log("RevenueCat setup complete. Wire these up:");
  console.log(`  REVENUECAT_PROJECT_ID = ${projectId}`);
  console.log(`  REVENUECAT_ENTITLEMENT_ID = ${ENTITLEMENT_ID}`);
  console.log(`  EXPO_PUBLIC_REVENUECAT_TEST_API_KEY = ${await keysFor(testApp.id)}`);
  console.log(`  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = ${await keysFor(appStoreApp.id)}`);
  console.log(`  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY = ${await keysFor(playStoreApp.id)}`);
  console.log("Also set REVENUECAT_WEBHOOK_AUTH (server) to the exact value you");
  console.log("configure as the webhook Authorization header in the RevenueCat");
  console.log("dashboard, pointing the webhook at POST /api/revenuecat/webhook.");
  console.log("====================\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
