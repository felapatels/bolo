// Dark-mode web home verification: the language pill + "Chat with Bolo" pill
// (and other header cards) must be readable in dark mode after the
// bg-white → bg-card sweep. Emulates prefers-color-scheme: dark; the QA
// account's theme preference is "system".
//
//   CHROME_BIN=$(which chromium) node qa/dark-home-shot.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/pre28";
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
  colorScheme: "dark",
});
const page = await ctx.newPage();

const userId = await clerkUserId(EMAIL);
await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken(userId)}`, {
  waitUntil: "networkidle",
  timeout: 120000,
});
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle", timeout: 60000 });
try {
  await page.waitForFunction(
    () => document.body.innerText.includes("Chat with Bolo"),
    { timeout: 30000 },
  );
} catch (err) {
  console.log("WAIT FAILED — url:", page.url());
  const body = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log("body text:", JSON.stringify(body));
  await page.screenshot({ path: `${OUT}/dark-home-debug.png` });
  console.log("debug shot saved");
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(2000);

const isDark = await page.evaluate(() =>
  document.documentElement.classList.contains("dark"),
);
console.log("html.dark applied:", isDark);
if (!isDark) {
  // Account theme pref may be forced "light" — flip the class for the visual
  // check (the CSS vars are what we're verifying).
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(500);
  console.log("forced .dark class for the shot (account pref not 'system'/'dark')");
}

await page.screenshot({ path: `${OUT}/dark-home.png` });
console.log("saved", `${OUT}/dark-home.png`);
await browser.close();
