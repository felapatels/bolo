// Task #906 visual verification: the home Phrasebook door card and the new
// /phrasebook library page, captured signed in as the QA account.
//
//   CHROME_BIN=$(which chromium) node qa/task906-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/task906";
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

// --- Home: the Phrasebook door card ---
await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForFunction(
  () => document.body.innerText.includes("Phrasebook"),
  { timeout: 30000 },
);
await page.waitForTimeout(1500);
const door = page.locator('section[aria-label="Phrasebook"]');
await door.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/home-door.png` });
console.log("home door text:", JSON.stringify(await door.innerText()));

// The door must navigate to /phrasebook when clicked.
await door.locator('a[href="/phrasebook"]').first().click();
await page.waitForURL(/\/phrasebook/, { timeout: 15000 });
console.log("door click landed on:", page.url());

// --- Phrasebook page ---
await page.waitForFunction(
  () => document.body.innerText.includes("phrases mastered") ||
        document.body.innerText.includes("Done!"),
  { timeout: 30000 },
).catch(() => console.log("no mastery lines visible (may be fine)"));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/phrasebook.png`, fullPage: true });
const cards = await page.locator('a[href^="/learn/"]').count();
console.log("phrasebook topic cards:", cards);
const body = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log("page text head:", JSON.stringify(body));

await browser.close();
console.log("DONE");
