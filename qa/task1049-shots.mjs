// Task #1049 verification shots — web home.
//
// Proves in a REAL browser (jsdom cannot lay anything out) that:
//   1. the boarding pass renders ABOVE Chacha-ji's Chai stall, and
//   2. the compact referral card is the last content card on home,
//      showing no code, no URL and no stat row.
//
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<clerk user id> \
//   NODE_PATH=/tmp/pw/node_modules node qa/task1049-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const USER_ID = process.env.E2E_USER_ID;
const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/task1049";
mkdirSync(OUT, { recursive: true });

const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ user_id: USER_ID }),
});
const { token } = await res.json();
if (!token) throw new Error(`no sign-in token: ${JSON.stringify(res.status)}`);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 200)));

await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${token}`, {
  waitUntil: "networkidle",
  timeout: 120000,
});
await page.waitForURL(/\/app|\/$/, { timeout: 60000 }).catch(() => {});
await page.goto(`${ORIGIN}/app`, { waitUntil: "domcontentloaded" });
await page
  .getByText(/Browse by topic/i)
  .first()
  .waitFor({ timeout: 90000 })
  .catch(async () => {
    console.log("home marker missing. url:", page.url());
    console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1200));
  });
await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3000);

const order = await page.evaluate(() => {
  const pass = document.querySelector('[data-testid="journey-pass-card"]');
  const stall = document.querySelector('[data-testid="chai-stall-vignette"]');
  const card = document.querySelector('[data-testid="home-referral-card"]');
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), height: Math.round(r.height) };
  };
  return {
    pass: box(pass),
    stall: box(stall),
    referralCard: box(card),
    referralText: card?.innerText ?? null,
  };
});
console.log("layout:", JSON.stringify(order, null, 1));
console.log(
  "pass above stall:",
  order.pass && order.stall ? order.pass.top < order.stall.top : "MISSING",
);

// Top of home: pass then stall.
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/home-top.png` });

// The referral card, at the bottom of the content stack.
await page
  .locator('[data-testid="home-referral-card"]')
  .scrollIntoViewIfNeeded()
  .catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/home-referral.png` });

// Desktop width too — the card must land after Recent plays at every width.
// Same page, resized: a fresh browser.newPage() would open a new context and
// land on the signed-out marketing page instead of home.
await page.setViewportSize({ width: 1280, height: 950 });
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByText(/Browse by topic/i).first().waitFor({ timeout: 90000 }).catch(() => {});
await page.waitForTimeout(3000);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: `${OUT}/home-desktop-top.png` });
await page
  .locator('[data-testid="home-referral-card"]')
  .scrollIntoViewIfNeeded()
  .catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/home-desktop-referral.png` });

await browser.close();
console.log("shots written to", OUT);
