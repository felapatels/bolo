// Spec D1b-M device screenshots, journey map mobile port, captured from the
// Expo WEB build (react-native-web renders the same component tree; no
// device/emulator in this environment). Viewport 412×824 @2x per the store
// screenshot convention.
//
// Signs in as a throwaway +clerk_test user via the email-code path (dev
// instances verify with 424242). The account's free language is Hindi, so the
// owned-line shots ride the Ganga Line and the showroom shot opens the
// Plus-locked Gujarat Express through the picker (the real showroom entry).
//   1. home-hero.png         , boarding-pass hero on home
//   2. map-top.png           , journey map header pass + zone 1
//   3. locked-stop-dialog.png, progression-locked stop dialog
//   4. showroom.png          , locked-language showroom (Gujarati teaser)
//
// Usage:
//   CHROME_BIN=$(which chromium) node qa/d1bm-shots.mjs
// Requires REPLIT_EXPO_DEV_DOMAIN in the environment.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const OUT = "qa/shots/d1bm";
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

// Expo web bundles on first hit, be patient.
console.log("loading", ORIGIN);
await page.goto(ORIGIN, { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(3000);

// ── Sign in (email-code path; +clerk_test verifies with 424242) ────────────
if (await page.getByText("Welcome back").count()) {
  await page.getByPlaceholder("you@example.com").fill(EMAIL);
  await page.getByText("Email me a sign-in code instead").click();
  await page.getByPlaceholder("123456").waitFor({ timeout: 30000 });
  await page.getByPlaceholder("123456").fill("424242");
  await page.getByText("Verify & sign in").click();
  await page.waitForTimeout(6000);
}

// First-run language choice, if it appears.
if (await page.getByText("Choose your language").count()) {
  await page.getByTestId("choose-lang-hi").click();
  await page.waitForTimeout(5000);
}

// A fresh account may auto-launch the guided tour, dismiss it.
const skipTour = page.getByLabel("Skip tour");
if (await skipTour.count()) {
  await skipTour.first().click();
  await page.waitForTimeout(1000);
}

// Reset to the owned language (a prior run may have left the account parked
// on the locked showroom language, adoptions persist by design).
await page.getByText("Practicing").first().waitFor({ timeout: 90000 })
  .catch(async () => { await dumpText("home-pill"); throw new Error("home did not load"); });
if (!(await page.getByText("Ganga Line").count())) {
  await page.getByText("Practicing").first().click();
  await page.waitForTimeout(1500);
  await page.getByText("Hindi · Devanagari").first().click(); // unlocked → plain switch
  await page.waitForTimeout(4000);
}

// ── 1. Home boarding-pass hero (owned line: Ganga Line) ─────────────────────
await page.getByText("Ganga Line").first().waitFor({ timeout: 90000 })
  .catch(async () => { await dumpText("home"); throw new Error("home hero not found"); });
await page.waitForTimeout(2000); // let fonts/entrances settle
console.log("home hero visible");
await shot("home-hero");

// ── 2. Journey map top (pass + zone 1) ──────────────────────────────────────
await page.getByText(/your journey/i).first().click(); // hero CTA
await page.getByText(/stations/).first().waitFor({ timeout: 60000 })
  .catch(async () => { await dumpText("journey"); throw new Error("journey did not open"); });
await page.waitForTimeout(2500);
console.log("journey open");
await shot("map-top");

// ── 3. Locked-stop dialog (progression lock) ────────────────────────────────
const locked = page.getByLabel(/, Locked$/).first();
await locked.waitFor({ timeout: 30000 })
  .catch(async () => { await dumpText("journey-locked"); throw new Error("no locked stop"); });
await locked.scrollIntoViewIfNeeded();
await locked.click();
await page.getByText("This stop is still locked").waitFor({ timeout: 15000 })
  .catch(async () => { await dumpText("dialog"); throw new Error("locked dialog missing"); });
await page.waitForTimeout(600);
console.log("locked dialog open");
await shot("locked-stop-dialog");

// ── 4. Showroom mode (Plus-locked Gujarati via the picker) ──────────────────
await page.goto(ORIGIN, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(3000);
await page.getByText("Practicing").first().click(); // home language pill
await page.waitForTimeout(1500);
// Target the row subtitle, "ગુજરાતી" alone can also match the home language
// pill underneath the modal.
await page.getByText("Gujarati · Gujarati").first().click(); // locked row → showroom
await page.getByText("Gujarat Express").first().waitFor({ timeout: 60000 })
  .catch(async () => { await dumpText("showroom"); throw new Error("showroom did not open"); });
await page.waitForTimeout(2500);
console.log("showroom open");
await shot("showroom");

await browser.close();
console.log("DONE, 4 shots in", OUT);
