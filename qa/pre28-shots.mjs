// Pre-build-28 mobile polish screenshots, captured from the Expo WEB build
// (react-native-web renders the same tree; no device here). Viewport 412×824 @2x.
//
//   1. nav-home.png    , home with the new floating pill tab bar + language tab
//   2. picker.png      , redesigned 2-col language picker (crown = locked)
//   3. locked-home.png , locked-language home showroom banner (Gujarati)
//
// Usage: CHROME_BIN=$(which chromium) node qa/pre28-shots.mjs
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
// First hydration can lag the bundle; wait for either auth or app chrome.
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
if (await page.getByText("Choose your language").count()) {
  await page.getByTestId("choose-lang-hi").click();
  await page.waitForTimeout(5000);
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

// Reset to Hindi if a prior run left the account on a locked language
// (adoptions persist by design). The home banner or journey may be showing.
await langTab.first().click();
await page.waitForTimeout(2000);
const hindiTile = page.getByLabel("Hindi", { exact: true });
if (await hindiTile.count()) {
  await hindiTile.first().click();
  await page.waitForTimeout(4000);
}

// ── 1. Home with the new floating pill nav ─────────────────────────────────
await page.getByText("Day Streak").first().waitFor({ timeout: 60000 })
  .catch(async () => { await dumpText("home"); });
await page.waitForTimeout(1500);
await shot("nav-home");
console.log("shot 1: nav-home");

// ── 2. Redesigned picker ────────────────────────────────────────────────────
await langTab.first().click();
await page.getByText("Choose a language").waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
await shot("picker");
console.log("shot 2: picker");

// ── 3. Locked-language home showroom (Gujarati is locked for this account) ──
await page.getByLabel("Gujarati, locked, preview its journey").first().click();
await page.waitForTimeout(4000); // lands on the journey showroom
await dumpText("after-gujarati-tap");
// The journey screen lives outside the tab navigator, go home directly.
await page.goto(ORIGIN, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(4000);
await page.getByText("waiting to be unlocked").first().waitFor({ timeout: 30000 })
  .catch(async () => { await dumpText("locked-home"); });
await shot("locked-home");
console.log("shot 3: locked-home");

// Reset the account back to Hindi for future runs.
await langTab.first().click();
await page.waitForTimeout(2000);
await page.getByLabel("Hindi", { exact: true }).first().click();
await page.waitForTimeout(2000);

await browser.close();
console.log("done");
