// Task #1111, mobile "no friends" list shot.
//
// The friendship is undone through the real product (web client, Meera's own
// Remove button) rather than by deleting a row: react-native-web has no Alert
// implementation, so the mobile confirm dialog, and therefore mobile's own
// Remove button, cannot be driven in the Expo WEB build. Mobile removal is
// covered by the RNTL test and by the shared DELETE /friends/:userId API test.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXPO = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const WEB = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const EMAIL = "bolo-1111-meera+clerk_test@example.com";
const OUT = "qa/shots/task1111";
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ user_id: process.env.E2E_USER_A }),
});
const { token } = await res.json();

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});
try {
  const web = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  web.once("dialog", (d) => d.accept());
  await web.goto(`${WEB}/sign-in?__clerk_ticket=${token}`, { waitUntil: "networkidle", timeout: 120000 });
  await web.waitForTimeout(4000);
  await web.goto(`${WEB}/friends`, { waitUntil: "networkidle", timeout: 120000 });
  await web.waitForTimeout(2500);
  const remove = web.getByRole("button", { name: /^Remove /i });
  log("remove buttons on web:", await remove.count());
  if (await remove.count()) {
    await remove.first().click();
    await web.waitForTimeout(3500);
  }
  log("web after remove:\n", (await web.innerText("main")).slice(0, 400));

  const page = await browser.newPage({
    viewport: { width: 412, height: 824 },
    deviceScaleFactor: 2,
  });
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
  await page.getByText("Your friends", { exact: false }).first().scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/mobile-friends-empty-list.png` });
  log("shot mobile-friends-empty-list\n", (await page.evaluate(() => document.body.innerText)).slice(0, 700));
} finally {
  await browser.close();
}
