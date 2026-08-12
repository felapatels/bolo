// Photographs Chacha-ji's stall on the MOBILE journey map (Expo web build), so
// the web and mobile placement can be compared by eye. Signs in with a Clerk
// dev test-mode account via the email-code flow (code 424242), which needs no
// real password. QA-only, dev-only.
//
// Run (from the qa directory, so playwright-core resolves):
//   CHROME_BIN=$(which chromium) node chacha-stall-mobile-shot.mjs
import { chromium } from "playwright-core";

const EMAIL = process.env.E2E_EMAIL || "bolo-stall-probe+clerk_test@example.com";
const BASE = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
if (!CLERK_SECRET) throw new Error("CLERK_SECRET_KEY is required");

// A throwaway DEV Clerk account with a known password, because the Expo web
// build only offers password / email-code sign-in and no owner password is
// available here. Dev instance only; it owns nothing and buys nothing.
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
const page = await browser.newPage({ viewport: { width: 412, height: 1400 } });
const dump = async (tag) =>
  console.log(tag, (await page.locator("body").innerText()).slice(0, 260).replace(/\n/g, " | "));

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(15000);
await dump("landed:");

const inputs = await page.locator("input").all();
if (inputs.length >= 2) {
  await inputs[0].fill(EMAIL);
  await inputs[1].fill(PASSWORD);
  await page.getByText("Sign in", { exact: true }).first().click();
  await page.waitForTimeout(12000);
}
// Clerk Client Trust: a brand-new device is challenged for a 6-digit code.
// Dev test-mode addresses (+clerk_test) always accept 424242.
if (await page.getByText("Enter your code").isVisible().catch(() => false)) {
  const box = (await page.locator("input").all())[0];
  await box.fill(process.env.E2E_CODE || "424242");
  await page.getByText("Verify & sign in").first().click();
  await page.waitForTimeout(20000);
}
await dump("after auth:");

// Into the map, and give the zone queries time to settle.
await page.goto(`${BASE}/journey`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(20000);
await dump("journey:");
await page.screenshot({ path: "shots/chacha-stall-mobile-top.png" });

// Scroll down a screen so a mid-line encounter station is in frame too.
await page.mouse.move(206, 700);
await page.mouse.wheel(0, 700);
await page.waitForTimeout(1500);
await page.screenshot({ path: "shots/chacha-stall-mobile-scrolled.png" });
await browser.close();
