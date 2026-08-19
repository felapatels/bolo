// Task 870 verification shots: band chips (progress), timezone dropdown
// (account), friends back affordance, 360px language picker (no truncated
// English names, crown lock glyph), softened choose-language tiles.
//
//   CHROME_BIN=$(which chromium) NODE_PATH=/tmp/pw/node_modules \
//   PLUS_USER=<id> FREE_USER=<id> FRESH_USER=<id> node qa/task870-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/task870";
mkdirSync(OUT, { recursive: true });

async function signInToken(userId) {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId }),
  });
  const tk = await res.json();
  if (!res.ok) throw new Error(`sign-in token: ${JSON.stringify(tk)}`);
  return tk.token;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});

async function signedInPage(userId, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken(userId)}`, {
    waitUntil: "networkidle",
  });
  await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
  return { ctx, page };
}

// ---------- Plus user: progress, account, friends ----------
const STAGE = process.env.STAGE || "all";
if (STAGE === "all" || STAGE === "plus") {
  const { ctx, page } = await signedInPage(process.env.PLUS_USER, {
    width: 390,
    height: 844,
  });

  // Item 1: Progress, band chips, Best Attempt card, analytics bands.
  await page.goto(`${ORIGIN}/progress`, { waitUntil: "networkidle" });
  await page.getByText("Practice History").waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  const numericChips = await page.getByText(/Score: \d|avg \d/).count();
  console.log(`progress: leftover numeric score strings = ${numericChips}`);
  await page.screenshot({ path: `${OUT}/1-progress.png`, fullPage: true });

  // Item 2: Account, timezone dropdown closed + open.
  await page.goto(`${ORIGIN}/account`, { waitUntil: "networkidle" });
  const tzTrigger = page.getByTestId("timezone-trigger");
  await tzTrigger.waitFor({ timeout: 30000 });
  await tzTrigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/2-account-tz-closed.png` });
  await tzTrigger.click();
  await page.getByPlaceholder("Search timezones…").waitFor({ timeout: 10000 });
  await page.getByPlaceholder("Search timezones…").fill("Kolk");
  await page.waitForTimeout(400);
  const tzOpts = await page.locator("[cmdk-item]:visible").allTextContents();
  console.log(`account tz: options for "Kolk" = ${JSON.stringify(tzOpts.slice(0, 5))}`);
  await page.screenshot({ path: `${OUT}/2-account-tz-open.png` });
  await page.keyboard.press("Escape");

  // Item 3: Friends, back affordance in header.
  await page.goto(`${ORIGIN}/friends`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const back = await page.locator('[aria-label="Back to account"]').count();
  console.log(`friends: back affordance count = ${back}`);
  await page.screenshot({
    path: `${OUT}/3-friends.png`,
    clip: { x: 0, y: 0, width: 390, height: 500 },
  });
  await ctx.close();
}

// ---------- Free user @360px: language picker ----------
if (STAGE === "all" || STAGE === "picker") {
  const { ctx, page } = await signedInPage(process.env.FREE_USER, {
    width: 360,
    height: 800,
  });
  await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle" });
  await page.locator('[title="Change language"]:visible').first().waitFor({ timeout: 60000 });
  await page.locator('[title="Change language"]:visible').first().click();
  await page.getByText("Choose a language").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  // Truncation probe: any tile English-name span clipped?
  const clipped = await page.evaluate(() => {
    const spans = [...document.querySelectorAll("[role='dialog'] button span:last-of-type")];
    return spans
      .filter((s) => s.scrollWidth > s.clientWidth + 1)
      .map((s) => s.textContent);
  });
  console.log(`picker: clipped english names = ${JSON.stringify(clipped)}`);
  const crowns = await page.locator("[data-testid^='picker-locked-']").count();
  console.log(`picker: crown glyphs = ${crowns}`);
  // Park the mouse so no tile carries a transient :hover ring in the shot
  // (clicking the trigger leaves the cursor over whatever tile scrolls under it).
  await page.mouse.move(5, 5);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/4-picker-360-top.png` });
  // Scroll the dialog's own scroller to the bottom for the rest of the list.
  await page.evaluate(() => {
    const dlg = document.querySelector("[role='dialog']");
    const scroller =
      [...dlg.querySelectorAll("*")].find((el) => el.scrollHeight > el.clientHeight + 8) || dlg;
    scroller.scrollTop = scroller.scrollHeight;
  });
  await page.waitForTimeout(400);
  const hovered = await page.evaluate(() =>
    [...document.querySelectorAll("[role='dialog'] button:hover")].map((b) =>
      (b.textContent || "").slice(0, 40),
    ),
  );
  console.log(`picker: tiles under cursor after scroll = ${JSON.stringify(hovered)}`);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/4-picker-360-bottom.png` });
  await ctx.close();
}

// ---------- Fresh user: choose-language tiles ----------
if (STAGE === "all" || STAGE === "fresh") {
  const { ctx, page } = await signedInPage(process.env.FRESH_USER, {
    width: 390,
    height: 844,
  });
  await page.goto(`${ORIGIN}/choose-language`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  console.log(`choose-language landed on: ${page.url()}`);
  await page.screenshot({ path: `${OUT}/5-choose-language.png`, fullPage: true });
  await ctx.close();
}

console.log("saved shots to", OUT);
await browser.close();
