// Grab a large element screenshot of the rigged Bolo (BoloRig svg) for
// visual comparison against the original PNG mascot art.
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<id> NODE_PATH=/tmp/pw/node_modules node qa/rig-shot.mjs
import { chromium } from "playwright";

const USER_ID = process.env.E2E_USER_ID;
const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;

const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
  method: "POST",
  headers: { Authorization: `Bearer ${CLERK_SECRET}`, "Content-Type": "application/json" },
  body: JSON.stringify({ user_id: USER_ID }),
});
const { token } = await res.json();

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 800, height: 900 }, deviceScaleFactor: 4 });
await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${token}`, { waitUntil: "networkidle" });
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
// Freeze animation frames for a clean shot
await page.evaluate(() => document.querySelectorAll("*").forEach((el) => (el.style.animationPlayState = "paused")));
const svg = page.locator("svg[viewBox='0 0 200 200'], svg[data-bolo-rig]").first();
if ((await svg.count()) === 0) {
  // fall back: any svg inside the Mascot wrapper (aria-hidden container)
  console.log("rig svg selector missed; dumping candidate svgs");
  for (const s of await page.locator("svg").all()) console.log(await s.getAttribute("viewBox"), await s.getAttribute("class"));
}
await svg.screenshot({ path: "qa/shots/rig-current.png" });
console.log("saved qa/shots/rig-current.png");
await browser.close();
