// One-off setup script: creates (idempotently) the Bolo! entitlements, their
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
//
// Two tiers are provisioned:
//   • all-access "Bolo! Plus"  — $9.99/mo, unlocks every language.
//   • "Bolo! One Language"     — $6.99/mo, unlocks a single chosen language.
// Each is a distinct RevenueCat entitlement with its own monthly + annual
// products, all attached to the same "default" offering.

import { ReplitConnectors } from "@replit/connectors-sdk";

// ---------------------------------------------------------------------------
// Configuration — the entitlement ids must match what the API server reads
// (REVENUECAT_ENTITLEMENT_ID → all-access, defaults to "plus";
// REVENUECAT_ONE_LANGUAGE_ENTITLEMENT_ID → middle tier, defaults to
// "one_language"). Store identifiers must match what you create in App Store
// Connect / Google Play. Confirm the store bundle/package ids and the prices
// before a production run.
// ---------------------------------------------------------------------------
const PLUS_ENTITLEMENT_ID =
  process.env.REVENUECAT_ENTITLEMENT_ID?.trim() || "plus";
const PLUS_ENTITLEMENT_DISPLAY_NAME = "Bolo! Plus";

const ONE_LANGUAGE_ENTITLEMENT_ID =
  process.env.REVENUECAT_ONE_LANGUAGE_ENTITLEMENT_ID?.trim() || "one_language";
const ONE_LANGUAGE_ENTITLEMENT_DISPLAY_NAME = "Bolo! One Language";

const APP_STORE_BUNDLE_ID = "com.bolo.mobile";
const PLAY_STORE_PACKAGE_NAME = "com.bolo.mobile";

// Product store identifiers. Play Store subscriptions use {subscriptionId}:{basePlanId}.
// All-access ("Plus") products.
const PLUS_MONTHLY_ID = "bolo_plus_monthly";
const PLUS_ANNUAL_ID = "bolo_plus_annual";
const PLUS_PLAY_MONTHLY_ID = "bolo_plus_monthly:monthly";
const PLUS_PLAY_ANNUAL_ID = "bolo_plus_annual:annual";

// One-Language products.
const ONE_LANGUAGE_MONTHLY_ID = "bolo_one_language_monthly";
const ONE_LANGUAGE_ANNUAL_ID = "bolo_one_language_annual";
const ONE_LANGUAGE_PLAY_MONTHLY_ID = "bolo_one_language_monthly:monthly";
const ONE_LANGUAGE_PLAY_ANNUAL_ID = "bolo_one_language_annual:annual";

const OFFERING_ID = "default";
const OFFERING_DISPLAY_NAME = "Bolo!";

// Test-store prices (micros = dollars * 1_000_000). Production prices are set in
// App Store Connect / Google Play, not here.
//
// Monthly prices below are the intended launch prices. The ANNUAL prices are
// PLACEHOLDERS — confirm the real annual pricing before a production run (and
// set it in App Store Connect / Google Play; the Test Store price is only for
// local testing). See the placeholder warning in the wiring log at the end.
const PLUS_MONTHLY_PRICE_MICROS = 9_990_000; // $9.99 / month
const PLUS_ANNUAL_PRICE_MICROS_PLACEHOLDER = 59_990_000; // $59.99 / year (PLACEHOLDER)
const ONE_LANGUAGE_MONTHLY_PRICE_MICROS = 6_990_000; // $6.99 / month
const ONE_LANGUAGE_ANNUAL_PRICE_MICROS_PLACEHOLDER = 49_990_000; // $49.99 / year (PLACEHOLDER)

interface EntitlementSpec {
  tier: "plus" | "one_language";
  lookupKey: string;
  displayName: string;
}

const ENTITLEMENTS: EntitlementSpec[] = [
  {
    tier: "plus",
    lookupKey: PLUS_ENTITLEMENT_ID,
    displayName: PLUS_ENTITLEMENT_DISPLAY_NAME,
  },
  {
    tier: "one_language",
    lookupKey: ONE_LANGUAGE_ENTITLEMENT_ID,
    displayName: ONE_LANGUAGE_ENTITLEMENT_DISPLAY_NAME,
  },
];

interface ProductSpec {
  tier: "plus" | "one_language";
  key: "monthly" | "annual";
  displayName: string;
  userFacingTitle: string;
  duration: "P1M" | "P1Y";
  priceMicros: number;
  // Set for annual products whose test-store price is a placeholder that the
  // owner must confirm before a production run.
  priceIsPlaceholder: boolean;
  testId: string;
  appStoreId: string;
  playStoreId: string;
  // Package lookup key within the offering. RevenueCat's predefined keys
  // ($rc_monthly / $rc_annual) are used for the all-access tier; the middle
  // tier uses custom keys so both tiers can coexist in one offering.
  packageId: string;
  packageDisplayName: string;
}

const PRODUCTS: ProductSpec[] = [
  {
    tier: "plus",
    key: "monthly",
    displayName: "Bolo! Plus (Monthly)",
    userFacingTitle: "Bolo! Plus — Monthly",
    duration: "P1M",
    priceMicros: PLUS_MONTHLY_PRICE_MICROS,
    priceIsPlaceholder: false,
    testId: PLUS_MONTHLY_ID,
    appStoreId: PLUS_MONTHLY_ID,
    playStoreId: PLUS_PLAY_MONTHLY_ID,
    packageId: "$rc_monthly",
    packageDisplayName: "Plus Monthly",
  },
  {
    tier: "plus",
    key: "annual",
    displayName: "Bolo! Plus (Annual)",
    userFacingTitle: "Bolo! Plus — Annual",
    duration: "P1Y",
    priceMicros: PLUS_ANNUAL_PRICE_MICROS_PLACEHOLDER,
    priceIsPlaceholder: true,
    testId: PLUS_ANNUAL_ID,
    appStoreId: PLUS_ANNUAL_ID,
    playStoreId: PLUS_PLAY_ANNUAL_ID,
    packageId: "$rc_annual",
    packageDisplayName: "Plus Annual",
  },
  {
    tier: "one_language",
    key: "monthly",
    displayName: "Bolo! One Language (Monthly)",
    userFacingTitle: "Bolo! One Language — Monthly",
    duration: "P1M",
    priceMicros: ONE_LANGUAGE_MONTHLY_PRICE_MICROS,
    priceIsPlaceholder: false,
    testId: ONE_LANGUAGE_MONTHLY_ID,
    appStoreId: ONE_LANGUAGE_MONTHLY_ID,
    playStoreId: ONE_LANGUAGE_PLAY_MONTHLY_ID,
    packageId: "one_language_monthly",
    packageDisplayName: "One Language Monthly",
  },
  {
    tier: "one_language",
    key: "annual",
    displayName: "Bolo! One Language (Annual)",
    userFacingTitle: "Bolo! One Language — Annual",
    duration: "P1Y",
    priceMicros: ONE_LANGUAGE_ANNUAL_PRICE_MICROS_PLACEHOLDER,
    priceIsPlaceholder: true,
    testId: ONE_LANGUAGE_ANNUAL_ID,
    appStoreId: ONE_LANGUAGE_ANNUAL_ID,
    playStoreId: ONE_LANGUAGE_PLAY_ANNUAL_ID,
    packageId: "one_language_annual",
    packageDisplayName: "One Language Annual",
  },
];

// Stable key for indexing a product spec's per-store ids.
const specKey = (s: Pick<ProductSpec, "tier" | "key">) => `${s.tier}:${s.key}`;

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
  // Per-product-spec map from spec key -> its per-store product ids.
  const spec_toProductIds = new Map<
    string,
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

  // Products grouped by entitlement tier, so each entitlement only unlocks its
  // own products.
  const productIdsByTier = new Map<"plus" | "one_language", string[]>([
    ["plus", []],
    ["one_language", []],
  ]);
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

    spec_toProductIds.set(specKey(spec), {
      test: testProduct.id,
      app: appProduct.id,
      play: playProduct.id,
    });
    productIdsByTier
      .get(spec.tier)!
      .push(testProduct.id, appProduct.id, playProduct.id);
  }

  // 4) Entitlements — each tier's access level, unlocking only its products.
  const entitlements = await listAll(`/v2/projects/${projectId}/entitlements`);
  for (const entSpec of ENTITLEMENTS) {
    let entitlement = entitlements.find(
      (e) => e.lookup_key === entSpec.lookupKey,
    );
    if (!entitlement) {
      entitlement = await rc(
        "POST",
        `/v2/projects/${projectId}/entitlements`,
        {
          lookup_key: entSpec.lookupKey,
          display_name: entSpec.displayName,
        },
      );
      console.log(`Created entitlement: ${entSpec.lookupKey}`);
    }
    await rc(
      "POST",
      `/v2/projects/${projectId}/entitlements/${entitlement.id}/actions/attach_products`,
      { product_ids: productIdsByTier.get(entSpec.tier)! },
    );
  }

  // 5) Offering + packages — what the client shows on the paywall. Both tiers
  //    share the one "default" offering; each product spec has its own package.
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
    const ids = spec_toProductIds.get(specKey(spec))!;
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
  console.log(`  REVENUECAT_ENTITLEMENT_ID = ${PLUS_ENTITLEMENT_ID}`);
  console.log(
    `  REVENUECAT_ONE_LANGUAGE_ENTITLEMENT_ID = ${ONE_LANGUAGE_ENTITLEMENT_ID}`,
  );
  console.log(`  EXPO_PUBLIC_REVENUECAT_TEST_API_KEY = ${await keysFor(testApp.id)}`);
  console.log(`  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = ${await keysFor(appStoreApp.id)}`);
  console.log(`  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY = ${await keysFor(playStoreApp.id)}`);
  console.log("Also set REVENUECAT_WEBHOOK_AUTH (server) to the exact value you");
  console.log("configure as the webhook Authorization header in the RevenueCat");
  console.log("dashboard, pointing the webhook at POST /api/revenuecat/webhook.");
  console.log("--------------------");
  console.log("Product store identifiers created (set the real prices in the");
  console.log("stores; the amounts below are Test Store only):");
  for (const spec of PRODUCTS) {
    const price = (spec.priceMicros / 1_000_000).toFixed(2);
    const flag = spec.priceIsPlaceholder ? "  ⚠ PLACEHOLDER PRICE" : "";
    console.log(
      `  [${spec.tier}] ${spec.key}: test=${spec.testId} app=${spec.appStoreId} play=${spec.playStoreId} — $${price}/${spec.duration === "P1M" ? "mo" : "yr"}${flag}`,
    );
  }
  console.log("--------------------");
  console.log("⚠ ANNUAL PRICES ARE PLACEHOLDERS. Confirm the real annual price");
  console.log("  for BOTH tiers with the owner before a production run, and set");
  console.log("  it in App Store Connect / Google Play (the amounts here only");
  console.log("  affect the Test Store used for local testing).");
  console.log("====================\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
