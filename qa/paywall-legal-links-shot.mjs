// Photographs the subscription disclosure links (Terms of Use + Privacy
// Policy) required by App Review Guideline 3.1.2(c), on BOTH paywalls:
//   - the mobile paywall through the Expo web build
//   - the web paywall at /upgrade
// It also fetches each linked URL and reports the HTTP status, because a 404
// behind a present link is the same rejection.
//
// QA-only, dev-only. Signs in with a Clerk dev test-mode account via the
// email-code flow (code 424242), which needs no real password.
//
// Run (from the qa directory, so playwright-core resolves):
//   CHROME_BIN=$(which chromium) node paywall-legal-links-shot.mjs
import { chromium } from "playwright-core";

const EMAIL = process.env.E2E_EMAIL || "bolo-stall-probe+clerk_test@example.com";
const EXPO = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const WEB = process.env.WEB_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
const LEGAL_ORIGIN = process.env.LEGAL_ORIGIN || "https://bolo-india.app";
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
if (!CLERK_SECRET) throw new Error("CLERK_SECRET_KEY is required");

const PASSWORD = `Qa-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
async function clerk(path, init) {
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CLERK_SECRET}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`clerk ${path} failed: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}
const found = await clerk(`/users?email_address=${encodeURIComponent(EMAIL)}`, { method: "GET" });
const existing = Array.isArray(found) ? found[0] : found.data?.[0];
if (existing) {
  await clerk(`/users/${existing.id}`, {
    method: "PATCH",
    body: JSON.stringify({ password: PASSWORD }),
  });
  console.log("reusing probe user", existing.id);
} else {
  const made = await clerk("/users", {
    method: "POST",
    body: JSON.stringify({ email_address: [EMAIL], password: PASSWORD, skip_password_checks: true }),
  });
  console.log("created probe user", made.id);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 412, height: 1000 } });
const dump = async (tag) =>
  console.log(tag, (await page.locator("body").innerText()).slice(0, 200).replace(/\n/g, " | "));

// --- mobile paywall (Expo web build) ---------------------------------------
await page.goto(`${EXPO}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(15000);
const inputs = await page.locator("input").all();
if (inputs.length >= 2) {
  await inputs[0].fill(EMAIL);
  await inputs[1].fill(PASSWORD);
  await page.getByText("Sign in", { exact: true }).first().click();
  await page.waitForTimeout(12000);
}
if (await page.getByText("Enter your code").isVisible().catch(() => false)) {
  const box = (await page.locator("input").all())[0];
  await box.fill(process.env.E2E_CODE || "424242");
  await page.getByText("Verify & sign in").first().click();
  await page.waitForTimeout(20000);
}
await dump("after auth:");

await page.goto(`${EXPO}/paywall`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(15000);
await dump("mobile paywall:");
for (const name of ["Terms of Use", "Privacy Policy"]) {
  const n = await page.getByText(name, { exact: true }).count();
  console.log(`  mobile "${name}" visible: ${n > 0}`);
}
await page.screenshot({ path: "shots/paywall-mobile-legal-links.png", fullPage: true });

// --- web paywall ------------------------------------------------------------
await page.setViewportSize({ width: 412, height: 1000 });
await page.goto(`${WEB}/upgrade`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(8000);
await dump("web paywall:");
for (const name of ["Terms of Use", "Privacy Policy"]) {
  const link = page.getByRole("link", { name });
  const href = (await link.count()) ? await link.first().getAttribute("href") : null;
  console.log(`  web "${name}" href: ${href}`);
}
await page.screenshot({ path: "shots/paywall-web-legal-links.png", fullPage: true });

// --- the URLs themselves ----------------------------------------------------
for (const path of ["/terms", "/privacy"]) {
  const res = await fetch(`${LEGAL_ORIGIN}${path}`, { redirect: "follow" });
  console.log(`  ${LEGAL_ORIGIN}${path} -> ${res.status} (final ${res.url})`);
}

await browser.close();
