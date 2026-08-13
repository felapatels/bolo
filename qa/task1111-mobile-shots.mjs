// Task #1111 — mobile friends-by-code evidence (Expo WEB build, 412×824 @2x).
//
// QA-only. Same rule as the web probe: the "with friends" state is produced by
// the feature itself (Meera types Arjun's code on mobile, Arjun accepts), never
// by inserting rows.
//
// Run (from repo root):
//   CHROME_BIN=$(which chromium) FRIEND_CODE=<arjun's code> \
//   ACCEPTER_USER_ID=<clerk id> node qa/task1111-mobile-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXPO = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const WEB = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const EMAIL = process.env.SCANNER_EMAIL || "bolo-1111-meera+clerk_test@example.com";
const FRIEND_CODE = process.env.FRIEND_CODE;
const ACCEPTER = process.env.ACCEPTER_USER_ID;
const SECRET = process.env.CLERK_SECRET_KEY;
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
page.on("pageerror", (e) => log("pageerror:", String(e).slice(0, 200)));

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const text = async () => (await page.evaluate(() => document.body.innerText)).slice(0, 900);

try {
  log("loading", EXPO);
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
  const skip = page.getByLabel("Skip tour");
  if (await skip.count()) {
    await skip.first().click();
    await page.waitForTimeout(1500);
  }
  log("after sign-in:\n", await text());

  // Friends is deliberately NOT a bottom-nav slot (out of scope for this task):
  // it hangs off Account. On the Expo web build the route is addressable, so
  // the probe navigates straight to it.
  await page.goto(`${EXPO}/friends`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(5000);
  log("friends screen:\n", await text());

  await shot("mobile-friends-empty");
  log("shot mobile-friends-empty");

  // Own code + QR are on the same screen; scroll them into view for evidence.
  const own = page.getByTestId("your-friend-code");
  if (await own.count()) {
    await own.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await shot("mobile-your-friend-code");
    log("shot mobile-your-friend-code");
  }

  // Type the other learner's code — the same path a scan lands on.
  const codeInput = page.getByLabel("Friend code", { exact: true }).first();
  await codeInput.scrollIntoViewIfNeeded();
  await codeInput.fill(FRIEND_CODE);
  await page.getByLabel("Send friend request").first().click();
  await page.waitForTimeout(4000);
  log("after send:\n", await text());
  await shot("mobile-request-sent");

  // The other learner accepts, in a separate context on the web app.
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: ACCEPTER }),
  });
  const { token } = await res.json();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const other = await ctx.newPage();
  await other.goto(`${WEB}/sign-in?__clerk_ticket=${token}`, { waitUntil: "networkidle", timeout: 120000 });
  await other.waitForTimeout(4000);
  await other.goto(`${WEB}/friends`, { waitUntil: "networkidle", timeout: 120000 });
  await other.waitForTimeout(2500);
  const accept = other.getByRole("button", { name: /^Accept request from/i });
  await accept.first().waitFor({ timeout: 20000 });
  await accept.first().click();
  await other.waitForTimeout(3500);
  log("accepted");

  await page.goto(`${EXPO}/friends`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(6000);
  await shot("mobile-friends-with");
  log("shot mobile-friends-with\n", await text());

  // Scanner sheet (camera permission is denied in headless chromium, so this
  // captures the permission state rather than a live viewfinder).
  const scan = page.getByLabel("Scan a friend code");
  if (await scan.count()) {
    await scan.first().scrollIntoViewIfNeeded();
    await scan.first().click();
    await page.waitForTimeout(2500);
    await shot("mobile-scanner");
    log("shot mobile-scanner\n", await text());
  }
} finally {
  await browser.close();
}
