// Task #1049 verification shots, MOBILE home, captured from the Expo WEB
// build (react-native-web renders the same component tree; there is no device
// or emulator in this environment). Viewport 412×824 @2x, the store-screenshot
// convention used by qa/d1bm-shots.mjs.
//
// Proves the boarding pass renders ABOVE Chacha-ji's stall and that the
// compact referral card sits at the bottom of the content stack, above the
// Privacy Policy link.
//
//   CHROME_BIN=$(which chromium) node qa/task1049-mobile-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const OUT = "qa/shots/task1049-mobile";
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
  const t = await page.evaluate(() => document.body.innerText.slice(0, 900));
  console.log(`--- page text (${label}):\n${t}\n---`);
};

console.log("loading", ORIGIN);
await page.goto(ORIGIN, { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(3000);

// Sign in (email-code path; +clerk_test verifies with 424242).
if (await page.getByText("Welcome back").count()) {
  await page.getByPlaceholder("you@example.com").fill(EMAIL);
  await page.getByText("Email me a sign-in code instead").click();
  await page
    .getByPlaceholder("123456")
    .waitFor({ timeout: 30000 })
    .catch(async () => {
      await dumpText("sign-in");
      throw new Error("code field never appeared");
    });
  await page.getByPlaceholder("123456").fill("424242");
  await page.getByText("Verify & sign in").click();
  await page.waitForTimeout(8000);
}

if (await page.getByText("Choose your language").count()) {
  await page.getByTestId("choose-lang-hi").click();
  await page.waitForTimeout(6000);
}

const skipTour = page.getByLabel("Skip tour");
if (await skipTour.count()) {
  await skipTour.first().click();
  await page.waitForTimeout(1500);
}

await page
  .getByText("Practicing")
  .first()
  .waitFor({ timeout: 120000 })
  .catch(async () => {
    await dumpText("home");
    throw new Error("home did not load");
  });
await page.waitForTimeout(3000);

// Order: the pass's vertical position must precede the stall's.
const order = await page.evaluate(() => {
  const find = (id) => document.querySelector(`[data-testid="${id}"]`);
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), height: Math.round(r.height) };
  };
  const card = find("home-referral-card");
  return {
    pass: box(find("journey-pass-card")),
    stall: box(find("chai-stall-vignette")),
    referralCard: box(card),
    referralText: card?.innerText ?? null,
  };
});
console.log("layout:", JSON.stringify(order, null, 1));
console.log(
  "pass above stall:",
  order.pass && order.stall ? order.pass.top < order.stall.top : "MISSING",
);

await shot("home-top");

const card = page.locator('[data-testid="home-referral-card"]');
await card.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(800);
await shot("home-referral");

await browser.close();
console.log("shots written to", OUT);
