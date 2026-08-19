// Task 1044 — mobile practice header shots (settings gear + language chip).
//
// Captured from the Expo WEB build (react-native-web renders the same
// component tree; no device/emulator in this environment). Viewport 412×824
// @2x per the store screenshot convention. Signs in as a throwaway
// +clerk_test user via the email-code path (dev instances verify with 424242).
//
//   1. practice-header-closed.png — lesson header, menu closed
//   2. practice-header-menu.png   — the audio settings sheet open
//
// Usage:
//   CHROME_BIN=$(which chromium) node qa/task1044-header-shots.mjs
// Requires REPLIT_EXPO_DEV_DOMAIN in the environment.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const OUT = "qa/shots/task1044";
const EMAIL = "task1044+clerk_test@example.com";
const SK = process.env.CLERK_SECRET_KEY;
const PASSWORD = "Task1044!ShotsZz";
mkdirSync(OUT, { recursive: true });

// Provision the throwaway user up front: the email-code path only works for an
// account that already exists, and a fresh run must not depend on a leftover.
const bapi = async (method, path, body) => {
  const r = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
const existing = await bapi("GET", `/users?email_address=${encodeURIComponent(EMAIL)}`);
let userId = (Array.isArray(existing.j) ? existing.j : [])[0]?.id;
if (!userId) {
  const created = await bapi("POST", "/users", {
    email_address: [EMAIL],
    password: PASSWORD,
    skip_password_checks: true,
  });
  if (created.status !== 200) {
    console.error("user create failed", created.status, JSON.stringify(created.j));
    process.exit(1);
  }
  userId = created.j.id;
}
await bapi("PATCH", `/users/${userId}`, { bypass_client_trust: true, password: PASSWORD, skip_password_checks: true });
console.log("qa user:", userId);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 412, height: 824 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 200)));

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const dumpText = async (label) => {
  const t = await page.evaluate(() => document.body.innerText.slice(0, 800));
  console.log(`--- page text (${label}):\n${t}\n---`);
};

console.log("loading", ORIGIN);
await page.goto(ORIGIN, { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(3000);

if (await page.getByText("Welcome back").count()) {
  await page.getByPlaceholder("you@example.com").fill(EMAIL);
  await page.getByPlaceholder("Your password").fill(PASSWORD);
  await page.getByText("Sign in", { exact: true }).first().click();
  await page.waitForTimeout(8000);
  if (await page.getByText("Welcome back").count()) {
    await dumpText("sign-in");
    throw new Error("sign-in did not complete");
  }
}

if (await page.getByText("Choose your language").count()) {
  await page.getByTestId("choose-lang-hi").click();
  await page.waitForTimeout(5000);
}

const skipTour = page.getByLabel("Skip tour");
if (await skipTour.count()) {
  await skipTour.first().click();
  await page.waitForTimeout(1000);
}

// Straight into a lesson. Deep-linking beats clicking through the home hero,
// whose entrance animation never settles enough for a stable click.
await page.getByText("Practicing").first().waitFor({ timeout: 90000 })
  .catch(async () => { await dumpText("home"); throw new Error("home did not load"); });
await page.goto(`${ORIGIN}/practice/1`, { waitUntil: "networkidle", timeout: 120000 });

await page.getByTestId("practice-settings-trigger").waitFor({ timeout: 60000 })
  .catch(async () => { await dumpText("practice"); throw new Error("practice header not found"); });
await page.waitForTimeout(2500);
console.log("practice header visible");
await shot("practice-header-closed");

await page.getByTestId("practice-settings-trigger").click();
await page.getByTestId("setting-meaning-audio").waitFor({ timeout: 15000 })
  .catch(async () => { await dumpText("menu"); throw new Error("settings sheet did not open"); });
await page.waitForTimeout(1200);
console.log("settings sheet open");
await shot("practice-header-menu");

await browser.close();
const del = await bapi("DELETE", `/users/${userId}`);
console.log("clerk user cleanup:", del.status);
console.log("DONE — 2 shots in", OUT);
