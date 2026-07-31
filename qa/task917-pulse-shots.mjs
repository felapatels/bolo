// Task #917 visual verification: directional pulse dots on the journey map's
// active rail segment, captured signed in as the QA account. Two frames a
// beat apart show the wave lit at different points along the run; travel
// DIRECTION still needs eye verification (stills cannot prove motion).
//
//   CHROME_BIN=$(which chromium) node qa/task917-pulse-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/task917";
const EMAIL = "d1bm+clerk_test@example.com";
mkdirSync(OUT, { recursive: true });

async function clerkUserId(email) {
  const res = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } },
  );
  const users = await res.json();
  if (!res.ok || !users.length) throw new Error(`user lookup failed: ${JSON.stringify(users).slice(0, 200)}`);
  return users[0].id;
}

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
const ctx = await browser.newContext({
  viewport: { width: 412, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

const userId = await clerkUserId(EMAIL);
await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken(userId)}`, {
  waitUntil: "networkidle",
  timeout: 120000,
});
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});

await page.goto(`${ORIGIN}/journey`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector('[data-testid="rail-pulse-dot"]', { timeout: 30000 });

const info = await page.evaluate(() => {
  const dots = [...document.querySelectorAll('[data-testid="rail-pulse-dot"]')];
  const first = dots[0].getBoundingClientRect();
  const last = dots[dots.length - 1].getBoundingClientRect();
  return {
    count: dots.length,
    delays: dots.map((d) => d.style.getPropertyValue("--rail-pulse-delay")),
    firstY: first.top + window.scrollY,
    lastY: last.top + window.scrollY,
    anim: getComputedStyle(dots[0]).animationName,
  };
});
console.log("pulse dots:", JSON.stringify(info, null, 2));

// Center the active run in the viewport.
await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 380)), info.firstY);
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/active-segment-frame1.png` });
await page.waitForTimeout(1100);
await page.screenshot({ path: `${OUT}/active-segment-frame2.png` });

await browser.close();
console.log("done");
