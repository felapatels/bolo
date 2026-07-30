// Boarding-pass fixes verification (Expo WEB build, 412×824 @2x):
//   1. pass-home-hi.png      — home hero pass, Hindi: Devanagari "बोलो रेल" in
//                              the eyebrow, stamp centered in the stub, clear
//                              of perforation + vertical line name
//   2. pass-journey-hi.png   — journey header ticket, same checks
//   3. pass-home-gu.png      — home pass on Gujarati (locked showroom):
//                              Gujarati "બોલો રેલ" + long "GUJARAT EXPRESS"
//                              vertical name not colliding
//
// Usage: CHROME_BIN=$(which chromium) node qa/pass-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const OUT = "qa/shots/pre28";
const EMAIL = "d1bm+clerk_test@example.com";
mkdirSync(OUT, { recursive: true });

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

// ── Sign in (email-code path; +clerk_test verifies with 424242) ────────────
await Promise.race([
  page.getByText("Welcome back").first().waitFor({ timeout: 120000 }),
  page.getByLabel("Change language").first().waitFor({ timeout: 120000 }),
]).catch(() => {});
if (await page.getByText("Welcome back").count()) {
  await page.getByPlaceholder("you@example.com").fill(EMAIL);
  await page.getByText("Email me a sign-in code instead").click();
  await page.getByPlaceholder("123456").waitFor({ timeout: 30000 });
  await page.getByPlaceholder("123456").fill("424242");
  await page.getByText("Verify & sign in").click();
  await page.waitForTimeout(6000);
}
const skipTour = page.getByLabel("Skip tour");
if (await skipTour.count()) {
  await skipTour.first().click();
  await page.waitForTimeout(1000);
}

const langTab = page.getByLabel("Change language");
await langTab.first().waitFor({ timeout: 90000 }).catch(async () => {
  await dumpText("no-lang-tab");
  throw new Error("language tab not found");
});

// Reset to Hindi if a prior run left the account elsewhere.
await langTab.first().click();
await page.waitForTimeout(2000);
const hindiTile = page.getByLabel("Hindi", { exact: true });
if (await hindiTile.count()) {
  await hindiTile.first().click();
  await page.waitForTimeout(4000);
}

// ── 1. Home hero pass, Hindi ────────────────────────────────────────────────
await page.getByText("BOARDING PASS").first().waitFor({ timeout: 60000 })
  .catch(async () => { await dumpText("home-hi"); });
await page.waitForTimeout(1500);
// Bring the pass fully into view.
await page.getByText("BOARDING PASS").first().scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(500);
await shot("pass-home-hi");
console.log("shot 1: pass-home-hi");

// ── 2. Journey header ticket, Hindi (tap the pass) ─────────────────────────
await page.getByText("Ride the Ganga Line").first().click();
await page.waitForTimeout(4000);
await page.getByText("BOARDING PASS").first().waitFor({ timeout: 30000 })
  .catch(async () => { await dumpText("journey-hi"); });
await page.waitForTimeout(1000);
await shot("pass-journey-hi");
console.log("shot 2: pass-journey-hi");

// ── 3. Home pass on Gujarati (locked showroom; long line name) ─────────────
// Journey screen has no tab bar — go home directly, then switch language.
await page.goto(ORIGIN, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(4000);
await langTab.first().click();
await page.waitForTimeout(2000);
await page.getByLabel("Gujarati — locked, preview its journey").first().click();
await page.waitForTimeout(4000); // lands on the journey showroom
await page.goto(ORIGIN, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(4000);
await page.getByText("BOARDING PASS").first().waitFor({ timeout: 30000 })
  .catch(async () => { await dumpText("home-gu"); });
await page.getByText("BOARDING PASS").first().scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(500);
await shot("pass-home-gu");
console.log("shot 3: pass-home-gu");

// Reset the account back to Hindi for future runs.
await langTab.first().click();
await page.waitForTimeout(2000);
await page.getByLabel("Hindi", { exact: true }).first().click();
await page.waitForTimeout(2000);

await browser.close();
console.log("done");
