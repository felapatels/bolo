// Boarding pass + journey CTA animation verification (web only).
// Signs in as the QA account, captures the authed home hero pass and the
// journey map, and asserts the idle animation classes are live in the DOM:
//   home:    .animate-ticket-breathe, .animate-cta-arrow-nudge
//   journey: .animate-stop-glow-pulse, .animate-train-bob
// Also records the progress-aware CTA copy actually rendered.
//
//   CHROME_BIN=$(which chromium) node qa/boarding-pass-cta-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/boarding-pass-cta";
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
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

const userId = await clerkUserId(EMAIL);
await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken(userId)}`, {
  waitUntil: "networkidle",
  timeout: 120000,
});
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});

// Home: boarding pass hero.
await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle", timeout: 60000 });
await page
  .waitForFunction(
    () =>
      /Begin your journey|Resume at Stop|Continue your journey/.test(
        document.body.innerText,
      ),
    { timeout: 30000 },
  )
  .catch(() => {});
const home = await page.evaluate(() => ({
  breathe: !!document.querySelector(".animate-ticket-breathe"),
  nudge: !!document.querySelector(".animate-cta-arrow-nudge"),
  cta:
    (document.body.innerText.match(
      /Begin your journey|Resume at Stop \d+ · \d+ phrases? to go|Continue your journey/,
    ) || [null])[0],
}));
console.log("home:", JSON.stringify(home));
await page.screenshot({ path: `${OUT}/home-pass.png` });

// Journey: glow pulse on the current stop card + train bob on the marker.
await page.goto(`${ORIGIN}/journey`, { waitUntil: "networkidle", timeout: 60000 });
await page
  .waitForFunction(() => document.body.innerText.includes("Stop 1"), {
    timeout: 30000,
  })
  .catch(() => {});
const journey = await page.evaluate(() => {
  const glow = document.querySelector(".animate-stop-glow-pulse");
  glow?.closest("div[class*=relative]")?.scrollIntoView({ block: "center" });
  return {
    glow: !!glow,
    trainBob: !!document.querySelector(".animate-train-bob"),
  };
});
console.log("journey:", JSON.stringify(journey));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/journey-current-stop.png` });

await browser.close();

const ok = home.breathe && home.nudge && !!home.cta && journey.glow && journey.trainBob;
console.log(ok ? "PROBE PASS" : "PROBE FAIL");
process.exit(ok ? 0 : 1);
