// Task #899: train size bump + boarding-pass stub tear probe.
//
// MODE=before  -> measure rendered train sizes on the home pass (mobile +
//                 desktop viewports) and inside the journey rail-marker pill.
// MODE=after   -> same measurements, plus: slow the tear via the :root tuning
//                 vars, activate the pass, capture a MID-TEAR screenshot,
//                 verify the tear classes are applied, verify navigation
//                 lands on /journey, then re-run at real timing and report
//                 click->navigation latency.
//
//   CHROME_BIN=$(which chromium) MODE=before node qa/task899-tear-probe.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const MODE = process.env.MODE || "before";
const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/task899";
const EMAIL = "d1bm+clerk_test@example.com";
const ASPECT = 64 / 42; // TrainEngine viewBox aspect ratio
mkdirSync(OUT, { recursive: true });

async function clerkUserId(email) {
  const res = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } },
  );
  const users = await res.json();
  if (!res.ok || !users.length) throw new Error("user lookup failed");
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

// The hero pass is the /journey link that contains the boarding-pass h2.
const findPass = `(() => {
  return Array.from(document.querySelectorAll('a[href="/journey"]')).find(
    (a) => a.querySelector("h2") && /Boarding pass/i.test(a.textContent || ""),
  );
})`;

async function measureHome(page) {
  return page.evaluate(`(() => {
    const pass = ${findPass}();
    if (!pass) return { error: "hero pass not found" };
    const svg = pass.querySelector("svg");
    if (!svg) return { error: "train svg not found in pass" };
    const r = svg.getBoundingClientRect();
    const h2 = pass.querySelector("h2");
    const textBlock = h2 ? h2.parentElement.getBoundingClientRect() : null;
    const passRect = pass.getBoundingClientRect();
    // aspect-fit drawing size inside the svg CSS box
    const drawW = Math.min(r.width, r.height * ${ASPECT});
    const drawH = drawW / ${ASPECT};
    return {
      svgBox: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      drawing: { w: +drawW.toFixed(1), h: +drawH.toFixed(1) },
      textRight: textBlock ? +textBlock.right.toFixed(1) : null,
      svgLeft: +r.left.toFixed(1),
      gapToText: textBlock ? +(r.left - textBlock.right).toFixed(1) : null,
      svgBottom: +r.bottom.toFixed(1),
      passRight: +passRect.right.toFixed(1),
      overflowsPassRight: r.right > passRect.right + 0.5,
    };
  })()`);
}

async function measureMarker(page) {
  return page.evaluate(`(() => {
    const pill = document.querySelector('div[title="Your current stop"]');
    if (!pill) return { error: "current-stop pill not found (showroom or no progress?)" };
    const svg = pill.querySelector("svg");
    const p = pill.getBoundingClientRect();
    const r = svg.getBoundingClientRect();
    const drawW = Math.min(r.width, r.height * ${ASPECT});
    const drawH = drawW / ${ASPECT};
    // nearest station card: any absolutely positioned sibling content nearby
    return {
      pillBox: { w: +p.width.toFixed(1), h: +p.height.toFixed(1) },
      svgBox: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      drawing: { w: +drawW.toFixed(1), h: +drawH.toFixed(1) },
      svgInsidePill:
        r.left >= p.left - 0.5 && r.right <= p.right + 0.5 &&
        r.top >= p.top - 0.5 && r.bottom <= p.bottom + 0.5,
    };
  })()`);
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
await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector('a[href="/journey"] h2', { timeout: 30000 });

console.log("home mobile (412px):", JSON.stringify(await measureHome(page)));
await page.screenshot({ path: `${OUT}/home-${MODE}-mobile.png` });

await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(400);
console.log("home desktop (1280px):", JSON.stringify(await measureHome(page)));
await page.screenshot({ path: `${OUT}/home-${MODE}-desktop.png` });
await page.setViewportSize({ width: 412, height: 900 });
await page.waitForTimeout(300);

// Journey rail marker
await page.goto(`${ORIGIN}/journey`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(800);
console.log("journey marker:", JSON.stringify(await measureMarker(page)));
const pill = await page.$('div[title="Your current stop"]');
if (pill) {
  await pill.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/marker-${MODE}.png` });
}

if (MODE === "after") {
  // --- Mid-tear capture: stretch the tuning vars so the shutter can catch it.
  await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector('a[href="/journey"] h2', { timeout: 30000 });
  await page.evaluate(() => {
    const d = document.documentElement.style;
    d.setProperty("--tear-duration", "1600ms");
    d.setProperty("--tear-nav-delay", "1400ms");
  });
  await page.evaluate(`${findPass}().click()`);
  await page.waitForTimeout(500);
  const midState = await page.evaluate(() => ({
    url: location.pathname,
    stubTear: !!document.querySelector(".animate-stub-tear"),
    bodyTear: !!document.querySelector(".animate-body-tear"),
  }));
  await page.screenshot({ path: `${OUT}/mid-tear.png` });
  console.log("mid-tear state (slowed):", JSON.stringify(midState));
  await page.waitForURL(/\/journey/, { timeout: 5000 });
  console.log("navigation after slowed tear: OK ->", page.url());

  // --- Real-timing run: measure click -> /journey latency with stock vars.
  await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector('a[href="/journey"] h2', { timeout: 30000 });
  const t0 = Date.now();
  await page.evaluate(`${findPass}().click()`);
  await page.waitForURL(/\/journey/, { timeout: 5000 });
  console.log(`real-timing click -> /journey in ${Date.now() - t0}ms`);
}

await browser.close();
console.log("done");
