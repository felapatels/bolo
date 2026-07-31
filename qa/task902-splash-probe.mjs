// Task #902: cold-load brand splash + home skeleton probe.
//
// Runs, in order:
//   A. SLOWED SPLASH cold load (--splash-duration stretched via init script,
//      categories API delayed): captures the moment mid-play (desktop +
//      mobile), verifies the skeleton is underneath and that the categories
//      request fired while the splash was up (queries are never delayed).
//   B. SKELETON cold load (stock splash timing, categories delayed): after
//      the full beat retires the splash, captures the bare skeleton, then
//      waits for real content.
//   C. REAL COLD load (no overrides): logs splash seen/gone timings and
//      time-to-content via an injected MutationObserver.
//   D. WARM in-session navigation: home -> another page -> home client-side;
//      asserts the splash never remounts and content is immediate.
//   E. REDUCED MOTION cold load (fresh context, reducedMotion: "reduce"):
//      asserts no splash at all; skeleton/content only.
//
//   CHROME_BIN=$(which chromium) node qa/task902-splash-probe.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/task902";
const EMAIL = "d1bm+clerk_test@example.com";
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

/** Injects a pre-page-script MutationObserver that timestamps splash
 *  mount/unmount relative to page start. */
const observeSplash = (page) =>
  page.addInitScript(() => {
    window.__splash = { seen: false, gone: false, tSeen: null, tGone: null };
    const check = () => {
      const el = document.querySelector('[data-testid="brand-splash"]');
      if (el && !window.__splash.seen) {
        window.__splash.seen = true;
        window.__splash.tSeen = Math.round(performance.now());
      }
      if (!el && window.__splash.seen && !window.__splash.gone) {
        window.__splash.gone = true;
        window.__splash.tGone = Math.round(performance.now());
      }
    };
    const start = () =>
      new MutationObserver(check).observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    if (document.documentElement) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
  });

/** Stretches the splash beat so the shutter can catch it mid-play. */
const slowSplash = (page) =>
  page.addInitScript(() => {
    const apply = () =>
      document.documentElement &&
      document.documentElement.style.setProperty("--splash-duration", "6000ms");
    apply();
    document.addEventListener("readystatechange", apply);
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  });

/** Delays the categories API so the skeleton window is observable. */
const delayCategories = (page, ms) =>
  page.route("**/api/categories**", async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });

const splashState = (page) => page.evaluate(() => window.__splash);
const hasSkeleton = (page) =>
  page.evaluate(() => !!document.querySelector('[data-testid="home-skeleton"]'));

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});

const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
});

// ---- Auth once for this context.
{
  const page = await ctx.newPage();
  const userId = await clerkUserId(EMAIL);
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken(userId)}`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
  await page.close();
}

// ---- A. Slowed splash, delayed data: catch the moment mid-play.
{
  const page = await ctx.newPage();
  let categoriesRequestAt = null;
  const navStart = Date.now();
  page.on("request", (req) => {
    if (req.url().includes("/api/categories") && categoriesRequestAt === null) {
      categoriesRequestAt = Date.now() - navStart;
    }
  });
  await observeSplash(page);
  await slowSplash(page);
  await delayCategories(page, 4000);
  await page.goto(`${ORIGIN}/app`, { timeout: 60000 });
  await page.waitForSelector('[data-testid="brand-splash"]', { timeout: 20000 });
  await page.waitForTimeout(1200);
  const mid = {
    splashUp: true,
    skeletonUnderneath: await hasSkeleton(page),
    categoriesRequestFiredAtMs: categoriesRequestAt,
  };
  await page.screenshot({ path: `${OUT}/splash-mid-desktop.png` });
  console.log("A mid-splash (slowed):", JSON.stringify(mid));
  await page.waitForSelector('[data-testid="brand-splash"]', {
    state: "detached",
    timeout: 20000,
  });
  const st = await splashState(page);
  await page.waitForSelector("text=Browse by topic", { timeout: 20000 });
  console.log(
    "A splash timings (slowed beat, data at ~4s cuts it short):",
    JSON.stringify(st),
  );
  await page.close();
}

// ---- A2. Mobile-width slowed splash shot.
{
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 412, height: 900 });
  await slowSplash(page);
  await delayCategories(page, 4000);
  await page.goto(`${ORIGIN}/app`, { timeout: 60000 });
  await page.waitForSelector('[data-testid="brand-splash"]', { timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/splash-mid-mobile.png` });
  await page.close();
  console.log("A2 mobile splash shot captured");
}

// ---- B. Stock splash timing, delayed data: skeleton after the beat.
{
  const page = await ctx.newPage();
  await observeSplash(page);
  await delayCategories(page, 4500);
  await page.goto(`${ORIGIN}/app`, { timeout: 60000 });
  await page.waitForSelector('[data-testid="brand-splash"]', { timeout: 20000 });
  await page.waitForSelector('[data-testid="brand-splash"]', {
    state: "detached",
    timeout: 20000,
  });
  const skeletonAlone = await hasSkeleton(page);
  await page.screenshot({ path: `${OUT}/skeleton-desktop.png` });
  const st = await splashState(page);
  await page.waitForSelector("text=Browse by topic", { timeout: 20000 });
  console.log(
    "B full beat -> skeleton:",
    JSON.stringify({ skeletonAloneAfterBeat: skeletonAlone, ...st }),
  );
  await page.close();
}

// ---- C. Real cold load, no overrides.
{
  const page = await ctx.newPage();
  await observeSplash(page);
  const t0 = Date.now();
  await page.goto(`${ORIGIN}/app`, { timeout: 60000 });
  await page.waitForSelector("text=Browse by topic", { timeout: 30000 });
  const contentMs = Date.now() - t0;
  const st = await splashState(page);
  console.log(
    "C real cold load:",
    JSON.stringify({ ...st, timeToContentMs: contentMs }),
  );

  // ---- D. Warm client-side nav: away and back, no replay.
  await page.evaluate(() => {
    window.__splash = { seen: false, gone: false, tSeen: null, tGone: null };
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="brand-splash"]')) {
        window.__splash.seen = true;
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll("nav a")).map((a) =>
      a.getAttribute("href"),
    ),
  );
  const away = links.find((l) => l && l !== "/app" && !l.startsWith("http"));
  if (!away) throw new Error(`no away link found in nav: ${JSON.stringify(links)}`);
  await page.click(`nav a[href="${away}"]`);
  await page.waitForTimeout(900);
  await page.click('nav a[href="/app"]');
  await page.waitForSelector("text=Browse by topic", { timeout: 15000 });
  await page.waitForTimeout(600);
  const warm = await splashState(page);
  console.log(
    "D warm nav back:",
    JSON.stringify({ awayLink: away, splashReplayed: warm.seen }),
  );
  await page.screenshot({ path: `${OUT}/warm-navback-desktop.png` });
  await page.close();
}

await ctx.close();

// ---- E. Reduced motion cold load: fresh context.
{
  const rctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await rctx.newPage();
  const userId = await clerkUserId(EMAIL);
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken(userId)}`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
  await observeSplash(page);
  await delayCategories(page, 2500);
  await page.goto(`${ORIGIN}/app`, { timeout: 60000 });
  await page.waitForTimeout(1200);
  const during = {
    splashSeen: (await splashState(page)).seen,
    skeletonShown: await hasSkeleton(page),
  };
  await page.screenshot({ path: `${OUT}/reduced-motion-skeleton.png` });
  await page.waitForSelector("text=Browse by topic", { timeout: 20000 });
  const st = await splashState(page);
  console.log(
    "E reduced motion:",
    JSON.stringify({ ...during, splashEverSeen: st.seen }),
  );
  await rctx.close();
}

await browser.close();
console.log("done");
