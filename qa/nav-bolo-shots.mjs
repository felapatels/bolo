// Bottom-nav rigged Bolo verification (Task: animate Bolo in the bottom nav).
//
// Checks that the centre nav button hosts the living SVG rig (not the old
// static PNG) and eyeballs framing across states:
//   - /app light + dark, /games (route change), chat-active on /chat
//   - the rig SVG is present inside the "Chat with Bolo" link; no <img>
//   - reduced motion: Bolo still fully visible (still frame)
//
// Usage:
//   CHROME_BIN=<chromium> E2E_USER_ID=<clerk user id> \
//   NODE_PATH=/tmp/pw/node_modules node qa/nav-bolo-shots.mjs
// Requires CLERK_SECRET_KEY and REPLIT_DEV_DOMAIN in the environment.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/nav-bolo";
mkdirSync(OUT, { recursive: true });

// Clerk sign-in tokens are SINGLE-USE — mint one per browser context.
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

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const NAV_LINK = 'a[aria-label="Chat with Bolo"]';

async function signedInPage(ctx) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check("pageerror", false, String(e).slice(0, 150)));
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken()}`, {
    waitUntil: "networkidle",
  });
  await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
  return page;
}

// ── Context 1: normal motion, mobile viewport ───────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
  const page = await signedInPage(ctx);
  await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle" });
  await page.waitForSelector(NAV_LINK, { timeout: 15000 });
  await page.waitForTimeout(800);

  const svgCount = await page.locator(`${NAV_LINK} svg`).count();
  const imgCount = await page.locator(`${NAV_LINK} img`).count();
  check("rig svg present in nav button", svgCount >= 1, `svg=${svgCount}`);
  check("no static <img> in nav button", imgCount === 0, `img=${imgCount}`);

  // Blink evidence: the eyelid transform templates update over time.
  const t0 = await page.locator(`${NAV_LINK} svg g[transform]`).evaluateAll((gs) =>
    gs.map((g) => g.getAttribute("transform")).join("|"),
  );
  await page.waitForTimeout(4000);
  const t1 = await page.locator(`${NAV_LINK} svg g[transform]`).evaluateAll((gs) =>
    gs.map((g) => g.getAttribute("transform")).join("|"),
  );
  check("ambient life running (rig transforms change over time)", t0 !== t1);

  await page.screenshot({ path: `${OUT}/01-app-light.png` });

  // Dark mode.
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/02-app-dark.png` });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  // Another route — nav persists.
  await page.goto(`${ORIGIN}/games`, { waitUntil: "networkidle" });
  await page.waitForSelector(NAV_LINK, { timeout: 15000 });
  check("nav Bolo present on /games", (await page.locator(`${NAV_LINK} svg`).count()) >= 1);
  await page.screenshot({ path: `${OUT}/03-games.png` });

  // Chat-active state (tinted ring) — nav shows on /chat below lg.
  await page.goto(`${ORIGIN}/chat`, { waitUntil: "networkidle" });
  await page.waitForSelector(NAV_LINK, { timeout: 15000 }).catch(() => {});
  if (await page.locator(NAV_LINK).count()) {
    await page.screenshot({ path: `${OUT}/04-chat-active.png` });
    check("nav Bolo present on /chat (active state)", (await page.locator(`${NAV_LINK} svg`).count()) >= 1);
  }
  await ctx.close();
}

// ── Context 2: reduced motion — still frame, fully visible ─────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 402, height: 874 },
    reducedMotion: "reduce",
  });
  const page = await signedInPage(ctx);
  await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle" });
  await page.waitForSelector(NAV_LINK, { timeout: 15000 });
  await page.waitForTimeout(600);

  const vis = await page.locator(`${NAV_LINK} svg`).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el.closest('[aria-hidden="true"]') ?? el);
    return { w: r.width, h: r.height, opacity: s.opacity };
  });
  check(
    "reduced motion: Bolo still frame fully visible",
    vis.w > 40 && vis.h > 40 && Number(vis.opacity) === 1,
    JSON.stringify(vis),
  );
  await page.screenshot({ path: `${OUT}/05-app-reduced-motion.png` });
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
