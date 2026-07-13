// Real-browser E2E for the gujarati-coach Plus checkout journey.
//
// QA-only: exercises the running dev app, changes no product code. See
// qa/plus-checkout-verification.md for prerequisites and expected results.
//
// Run (from repo root):
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<clerk_user_id> E2E_MODE=success \
//     node qa/plus-checkout-e2e.mjs
//
// Env:
//   E2E_USER_ID   (required) Clerk user id to sign in as (should be tier=free)
//   E2E_MODE      success | cancel                    (default: success)
//   CHROME_BIN    path to a working chromium binary   (Nix chromium on Replit)
//   APP_ORIGIN    app origin                          (default: $REPLIT_DEV_DOMAIN)
//   CLERK_SECRET_KEY, STRIPE test card is 4242 4242 4242 4242
//
// Requires the `playwright` package to be available (install in a scratch dir so
// the repo lockfile is untouched, e.g. `npm i -C /tmp/pw playwright`).

import { chromium } from "playwright";

const USER_ID = process.env.E2E_USER_ID;
const MODE = process.env.E2E_MODE || "success";
const ORIGIN =
  process.env.APP_ORIGIN ||
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;

if (!USER_ID) throw new Error("E2E_USER_ID is required");
if (!ORIGIN) throw new Error("APP_ORIGIN or REPLIT_DEV_DOMAIN is required");
if (!CLERK_SECRET) throw new Error("CLERK_SECRET_KEY is required");

const log = (...a) => console.log(new Date().toISOString(), ...a);

// Mint a single-use Clerk sign-in token so we can sign in without the UI.
async function mintTicket(userId) {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLERK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`clerk sign_in_tokens failed: ${JSON.stringify(body)}`);
  return body.token;
}

async function main() {
  const ticket = await mintTicket(USER_ID);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  const shot = (n) => page.screenshot({ path: `qa/shots/${n}.png`, fullPage: false }).catch(() => {});

  try {
    log("STEP sign-in via ticket");
    await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${ticket}`, { waitUntil: "networkidle" });
    await page.waitForURL(/\/app|\/upgrade|\/$/, { timeout: 30000 }).catch(() => {});
    log("after sign-in URL:", page.url());
    await shot("01-after-signin");

    log("STEP go to /upgrade");
    await page.goto(`${ORIGIN}/upgrade`, { waitUntil: "networkidle" });
    await shot("02-paywall");
    const trialBtn = page.getByRole("button", { name: /Start 7-day free trial/i });
    await trialBtn.waitFor({ timeout: 15000 });

    log("STEP click Start 7-day free trial");
    await trialBtn.click();

    log("STEP wait for Stripe checkout");
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
    log("on Stripe:", page.url());
    await shot("03-stripe");

    if (MODE === "cancel") {
      log("STEP cancel: click back arrow / go back");
      const back = page.locator('a[href*="checkout=cancel"], [data-testid="hosted-payment-back-button"]').first();
      if (await back.count()) await back.click();
      else await page.goBack();
      await page.waitForURL(/\/upgrade/, { timeout: 30000 });
      await shot("04-cancel-return");
      const cancelled = await page.getByText(/cancelled|haven't been charged|not been charged/i).count();
      log("shows cancelled notice:", cancelled > 0);
      log("console errors:", JSON.stringify(consoleErrors));
      return;
    }

    // success: fill the Stripe test card.
    log("STEP fill Stripe test card");
    await page.getByRole("radio", { name: "card" }).click({ force: true }).catch(() => {});
    await page.locator("#cardNumber").fill("4242424242424242");
    await page.locator("#cardExpiry").fill("12 / 34");
    await page.locator("#cardCvc").fill("123");
    await page.locator("#billingName").fill("QA Tester");
    await page.locator("#billingPostalCode").fill("94107").catch(() => {});
    // Opt out of Link "save my info" (otherwise phone becomes required).
    await page.locator("#enableStripePass").uncheck({ force: true }).catch(() => {});
    await shot("03b-stripe-filled");

    log("STEP submit checkout");
    await page.locator('button[type="submit"]').first().click();

    log("STEP wait for return to app");
    await page.waitForURL(/checkout=success/, { timeout: 60000 });
    await shot("05-return");
    // Plus should unlock without a manual refresh.
    await page.getByText(/Manage subscription/i).waitFor({ timeout: 15000 });
    log("Plus unlocked without manual refresh: true");

    log("STEP verify portal");
    const [portalPage] = await Promise.all([
      page.context().waitForEvent("page").catch(() => null),
      page.getByRole("button", { name: /Manage subscription/i }).click(),
    ]);
    const target = portalPage || page;
    await target.waitForURL(/billing\.stripe\.com/, { timeout: 30000 }).catch(() => {});
    log("portal URL:", target.url());
    await shot("08-portal");

    log("console errors:", JSON.stringify(consoleErrors));
  } catch (e) {
    await shot("99-error");
    throw e;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
