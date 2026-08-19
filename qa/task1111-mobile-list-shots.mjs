// Task #1111, mobile friends LIST evidence (Expo WEB build, 412×824 @2x).
//
// The add-friend card and the learner's own code fill the first screenful, so
// the list itself needs scrolling into view. This probe also exercises
// remove-friend on mobile, which is how the "no friends" list shot is produced
//, no rows are deleted by hand.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXPO = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const EMAIL = process.env.SCANNER_EMAIL || "bolo-1111-meera+clerk_test@example.com";
const OUT = "qa/shots/task1111";
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

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
const text = async () => (await page.evaluate(() => document.body.innerText)).slice(0, 900);

try {
  await page.goto(EXPO, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForTimeout(4000);
  if (await page.getByText("Welcome back").count()) {
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByText("Email me a sign-in code instead").click();
    await page.getByPlaceholder("123456").waitFor({ timeout: 30000 });
    await page.getByPlaceholder("123456").fill("424242");
    await page.getByText("Verify & sign in").click();
    await page.waitForTimeout(8000);
  }
  await page.goto(`${EXPO}/friends`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(6000);

  const list = page.getByText("Your friends", { exact: false }).first();
  await list.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(1200);
  await shot("mobile-friends-with-list");
  log("shot mobile-friends-with-list\n", await text());

  // Remove-friend on mobile (confirm dialog is auto-accepted above).
  const remove = page.getByLabel(/^Remove /).first();
  log("remove buttons:", await page.getByLabel(/^Remove /).count());
  await remove.scrollIntoViewIfNeeded();
  await remove.click();
  await page.waitForTimeout(4000);
  log("after remove:\n", await text());

  await page.goto(`${EXPO}/friends`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(6000);
  const list2 = page.getByText("Your friends", { exact: false }).first();
  await list2.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(1200);
  await shot("mobile-friends-empty-list");
  log("shot mobile-friends-empty-list\n", await text());
} finally {
  await browser.close();
}
