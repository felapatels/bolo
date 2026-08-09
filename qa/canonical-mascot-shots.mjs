// Verify the canonical PNG Bolo renders everywhere the rig used to:
//   home hero, bottom-nav centre button, landing header.
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<id> NODE_PATH=/tmp/pw/node_modules node qa/canonical-mascot-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/canonical-mascot";
mkdirSync(OUT, { recursive: true });

async function signInToken() {
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

// --- Landing (signed out) ---
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const imgs = await page.locator("img[src*='mascot-']").count();
  const svgs = await page.locator("[aria-hidden='true'] svg[viewBox='0 0 200 200']").count();
  console.log(`landing: mascot PNG imgs=${imgs}, rig svgs=${svgs}`);
  await page.screenshot({ path: `${OUT}/landing-header.png`, clip: { x: 0, y: 0, width: 390, height: 560 } });
  await page.close();
}

// --- Signed-in: home hero + nav button ---
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken()}`, { waitUntil: "networkidle" });
  await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
  await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle" });
  await page.getByText(/Ready to speak|Browse by topic/i).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
  const imgs = await page.locator("img[src*='mascot-']").count();
  const svgs = await page.locator("[aria-hidden='true'] svg[viewBox='0 0 200 200']").count();
  console.log(`home: mascot PNG imgs=${imgs}, rig svgs=${svgs}`);
  await page.locator("header").first().screenshot({ path: `${OUT}/home-hero.png` });
  await page.screenshot({ path: `${OUT}/nav-button.png`, clip: { x: 0, y: 844 - 140, width: 390, height: 140 } });
  await page.close();
}

console.log("saved shots to", OUT);
await browser.close();
