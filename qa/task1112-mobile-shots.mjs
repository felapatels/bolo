// Task #1112 — mobile friend/leaderboard row mascots (Expo WEB build, 412×824).
//
// Mobile rows used to be initials in a 44px circle: an outfit bought with Chai
// was invisible to everybody but its owner. This shoots both mobile surfaces
// with the same seeded cast the web probe uses (kurta, sherwani, nothing,
// anarkali + pagdi) so the two cream-adjacent garments can be compared at the
// real row size on the real screen.
//
//   CHROME_BIN=... node qa/task1112-mobile-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXPO = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const EMAIL =
  process.env.PROBE_EMAIL || "bolo-1112-viewer+clerk_test@example.com";
const PASSWORD = process.env.PROBE_PASSWORD || "";
const OUT = "qa/shots/task1112";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 412, height: 824 },
  deviceScaleFactor: 2,
});
page.on("dialog", (d) => d.accept());
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

try {
  await page.goto(EXPO, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForTimeout(5000);
  if (await page.getByText("Welcome back").count()) {
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder(/password/i).fill(PASSWORD);
    await page.getByText("Sign in", { exact: true }).last().click();
    await page.waitForTimeout(6000);
    // Clerk Client Trust: a browser it has never seen has to clear an emailed
    // code first. Test-mode addresses (+clerk_test) always take 424242.
    if (await page.getByText("Enter your code").count()) {
      await page.getByPlaceholder("123456").fill("424242");
      await page.getByText("Verify & sign in").click();
      await page.waitForTimeout(9000);
    }
    console.log(
      "after sign-in:",
      (await page.evaluate(() => document.body.innerText)).slice(0, 160),
    );
  }

  await page.goto(`${EXPO}/friends`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(7000);

  // The friends screen opens on the list; the board is behind the second tab.
  const boardTab = page.getByText("Leaderboard", { exact: true }).first();
  if (await boardTab.count()) {
    await boardTab.click();
    await page.waitForTimeout(3000);
  }
  await shot("mobile-leaderboard");

  // Back to the list, which sits below the add-friend card and the QR.
  const listTab = page.getByText("Friends", { exact: true }).first();
  if (await listTab.count()) {
    await listTab.click();
    await page.waitForTimeout(2500);
  }
  const list = page.getByText("Your friends", { exact: false }).first();
  if (await list.count()) {
    await list.scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(1200);
  }
  await shot("mobile-friends-list");
  console.log((await page.evaluate(() => document.body.innerText)).slice(0, 700));
} finally {
  await browser.close();
}
