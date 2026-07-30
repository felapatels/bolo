// Measure logged-in home (/app) load time on the dev preview: cold and warm,
// with a breakdown of where the time goes (HTML, modules, API calls, render).
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<id> NODE_PATH=/tmp/pw/node_modules node qa/home-load-timing.mjs
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${token}`, { waitUntil: "networkidle" });
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});

async function measure(label) {
  const reqs = [];
  const onReq = (r) => reqs.push({ url: r.url(), start: Date.now() });
  page.on("request", onReq);
  const t0 = Date.now();
  await page.goto(`${ORIGIN}/app`, { waitUntil: "domcontentloaded" });
  const tDcl = Date.now();
  // "page looks loaded" = hero greeting visible
  await page.getByText(/Ready to speak|Browse by topic/i).first().waitFor({ timeout: 60000 });
  const tHero = Date.now();
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  const tIdle = Date.now();
  page.off("request", onReq);

  const nav = await page.evaluate(() => {
    const e = performance.getEntriesByType("navigation")[0];
    const rs = performance.getEntriesByType("resource");
    const byType = {};
    for (const r of rs) {
      const kind = r.name.includes("/api/") ? "api" : r.name.includes("node_modules") ? "deps" : r.name.match(/\.tsx?|\.jsx?/) ? "src" : "other";
      byType[kind] = byType[kind] || { n: 0, ms: 0, slowest: null };
      byType[kind].n++;
      byType[kind].ms += r.duration;
      if (!byType[kind].slowest || r.duration > byType[kind].slowest.ms)
        byType[kind].slowest = { url: r.name.slice(-70), ms: Math.round(r.duration) };
    }
    const slow = rs.filter((r) => r.duration > 800).map((r) => ({ url: r.name.slice(-80), ms: Math.round(r.duration) }));
    slow.sort((a, b) => b.ms - a.ms);
    return { ttfb: Math.round(e.responseStart - e.startTime), resources: rs.length, byType, slow: slow.slice(0, 12) };
  });
  console.log(`\n== ${label} ==`);
  console.log(`ttfb=${nav.ttfb}ms  domContentLoaded=+${tDcl - t0}ms  heroVisible=+${tHero - t0}ms  networkIdle=+${tIdle - t0}ms  resources=${nav.resources}`);
  for (const [k, v] of Object.entries(nav.byType))
    console.log(`  ${k}: ${v.n} reqs, slowest ${v.slowest.ms}ms ${v.slowest.url}`);
  console.log("  >800ms:", JSON.stringify(nav.slow, null, 1));
}

await measure("cold-ish (first nav this browser)");
await measure("warm (second nav)");
await browser.close();
