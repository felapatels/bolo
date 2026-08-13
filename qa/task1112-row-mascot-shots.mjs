// Task #1112 — web friend/leaderboard row mascots, in a real browser.
//
// The row avatar was a 40px initials circle. It is now the learner's own Bolo
// wearing whatever they bought, and the ONLY question a unit test cannot
// answer is whether a 40 Chai purchase is legible at row size: kurta against
// sherwani, the two that differ mainly below the chest. So this probe signs in
// as a seeded learner whose friends are dressed in kurta, sherwani, anarkali +
// pagdi and nothing at all, shoots both tabs, and crops the two hard rows side
// by side at 1x so the size decision is made by looking.
//
//   E2E_USER_ID=user_... CHROME_BIN=... node qa/task1112-row-mascot-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/task1112";
mkdirSync(OUT, { recursive: true });

async function signInTicket() {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: process.env.E2E_USER_ID }),
  });
  const tk = await res.json();
  if (!res.ok) throw new Error(`sign-in token: ${JSON.stringify(tk)}`);
  return tk.token;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const dropBanner = () =>
  page.evaluate(() => document.getElementById("replit-dev-banner")?.remove());

try {
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInTicket()}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(4000);
  await page.goto(`${ORIGIN}/friends`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await dropBanner();

  // What each row is actually wearing, read off the DOM rather than assumed.
  const worn = async () =>
    page.$$eval('[data-testid="row-mascot"]', (els) =>
      els.map((el) => ({
        outfit: el.getAttribute("data-outfit"),
        accessory: el.getAttribute("data-accessory"),
        art: (el.querySelector("img")?.currentSrc || "").split("/mascot/")[1],
        px: Math.round(el.getBoundingClientRect().width),
      })),
    );

  console.log("desktop rows:", JSON.stringify(await worn(), null, 1));
  await page.screenshot({ path: `${OUT}/web-friends-desktop.png`, fullPage: true });

  // The hard case at 1x, as it actually renders: kurta above sherwani.
  const rows = page.locator('[data-testid="row-mascot"]');
  const box = await rows.first().boundingBox();
  if (box) {
    await page.screenshot({
      path: `${OUT}/web-kurta-vs-sherwani-1x.png`,
      clip: {
        x: Math.max(0, box.x - 10),
        y: Math.max(0, box.y - 10),
        width: 380,
        height: 260,
      },
    });
  }

  // Phone width folds the page into tabs; the friends list lives behind one.
  await page.setViewportSize({ width: 402, height: 874 });
  await page.waitForTimeout(1500);
  await dropBanner();
  await page.screenshot({ path: `${OUT}/web-leaderboard-402.png` });
  const tab = page.getByRole("tab", { name: /friends/i });
  if (await tab.count()) {
    await tab.click();
    await page.waitForTimeout(1500);
    // The add-friend card and the QR fill the first screenful on a phone.
    await page.locator('[data-testid="row-mascot"]').first().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(800);
    console.log("friends tab rows:", JSON.stringify(await worn(), null, 1));
    await page.screenshot({ path: `${OUT}/web-friends-list-402.png` });
  }
} finally {
  await browser.close();
}
