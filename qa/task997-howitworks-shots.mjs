// Task 997: capture fresh product screenshots for the public homepage
// "how it works" section. Authed via a Clerk sign-in token.
//   CHROME_BIN=<chromium> E2E_USER_ID=<id> node qa/task997-howitworks-shots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/task997";
mkdirSync(OUT, { recursive: true });

const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ user_id: process.env.E2E_USER_ID }),
});
const { token } = await res.json();

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${token}`, { waitUntil: "networkidle" });
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});

async function shot(path, name, waitMs = 4000) {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(waitMs);
  // Strip the Replit dev-preview banner so marketing shots are clean.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("body > *")) {
      if (el.id !== "root" && el.tagName !== "SCRIPT") el.remove();
    }
    document.querySelectorAll("[class*=banner],[data-testid*=banner]").forEach(()=>{});
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name, page.url());
}

const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const all = [["/practice/1","practice",4000],["/chat","chat",4000],["/journey","journey",6000],["/games","games",4000],["/review","review",5000],["/progress","progress",4000]];
for (const [p,n,w] of all) if (!ONLY || ONLY.includes(n)) await shot(p,n,w);
await browser.close();
