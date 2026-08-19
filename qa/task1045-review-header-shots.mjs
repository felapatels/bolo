// Task #1045, mobile review header parity shots (gear + two-item menu +
// language chip), captured from the Expo WEB build (react-native-web renders
// the same component tree; there is no device/emulator here). Viewport
// 412×824 @2x, the store-screenshot convention.
//
// Signs in as a throwaway +clerk_test user (dev instances verify with 424242),
// then shims ONLY the review-queue response so the screen has a phrase due, 
// a fresh account has nothing scheduled. Everything else hits the real API.
//   1. header-closed.png, review header, menu closed
//   2. header-menu.png  , the two-item audio menu open
//
// Usage:
//   CHROME_BIN=$(which chromium) node qa/task1045-review-header-shots.mjs
// Requires REPLIT_EXPO_DEV_DOMAIN in the environment.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const OUT = "qa/shots/task1045";
const EMAIL = "d1bm+clerk_test@example.com";
mkdirSync(OUT, { recursive: true });

// Review queue shim: one due phrase, so the practice card (and therefore the
// header variant that carries the gear) renders.
const REVIEW_SHIM = `
  const REVIEW = [{
    id: 90001,
    nativeScript: "नमस्ते",
    romanized: "namaste",
    english: "hello",
    categoryId: 1,
    categoryName: "Greetings",
  }];
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.includes("/api/review/phrases")) {
      return Promise.resolve(
        new Response(JSON.stringify(REVIEW), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return origFetch.call(this, input, init);
  };
`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 412, height: 824 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 200)));
await page.addInitScript(REVIEW_SHIM);

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const dumpText = async (label) => {
  const t = await page.evaluate(() => document.body.innerText.slice(0, 800));
  console.log(`--- page text (${label}):\n${t}\n---`);
};

console.log("loading", ORIGIN);
await page.goto(ORIGIN, { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(3000);

// ── Sign in (email-code path; +clerk_test verifies with 424242) ─────────────
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

// ── Review screen ───────────────────────────────────────────────────────────
await page.goto(`${ORIGIN}/review`, { waitUntil: "networkidle", timeout: 120000 });
await page
  .getByLabel("Audio settings")
  .waitFor({ timeout: 60000 })
  .catch(async () => {
    await dumpText("review");
    throw new Error("review header gear not found");
  });
await page.waitForTimeout(2500); // entrances + fonts settle
console.log("review header visible");
await shot("header-closed");

// ── Menu open ───────────────────────────────────────────────────────────────
await page.getByLabel("Audio settings").click();
await page
  .getByText("Autoplay phrase")
  .waitFor({ timeout: 15000 })
  .catch(async () => {
    await dumpText("menu");
    throw new Error("settings sheet did not open");
  });
await page.waitForTimeout(800);
console.log("menu open");
await shot("header-menu");

await browser.close();
console.log("DONE, 2 shots in", OUT);
