// Task 985 probe: journey map element-count + paint-cost measurement, plus
// full-page screenshots at phone and desktop widths. Run BEFORE the scenery /
// 2.5D pass for the Step 0 baseline and again AFTER for the comparison.
//
// QA-only: exercises the running dev app, changes no product code.
//
// Run (from repo root):
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<clerk_user_id> LABEL=baseline \
//     NODE_PATH=/tmp/pw/node_modules node qa/task985-depth-probe.mjs > /tmp/probe.log 2>&1
import { chromium } from "playwright-core";

const USER_ID = process.env.E2E_USER_ID;
const LABEL = process.env.LABEL || "run";
const ORIGIN =
  process.env.APP_ORIGIN ||
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
if (!USER_ID || !ORIGIN || !CLERK_SECRET) throw new Error("E2E_USER_ID / origin / CLERK_SECRET_KEY required");

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function mintTicket(userId) {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${CLERK_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`clerk sign_in_tokens failed: ${JSON.stringify(body)}`);
  return body.token;
}

async function measure(page, cdp, name) {
  // Element counts inside the map area + whole document.
  const counts = await page.evaluate(() => {
    const doc = document.querySelectorAll("*").length;
    const svgs = [...document.querySelectorAll("main svg")];
    const mapSvg = svgs.reduce((best, s) => {
      const n = s.querySelectorAll("*").length;
      return n > (best?.n ?? -1) ? { n } : best;
    }, null);
    const svgTotal = svgs.reduce((sum, s) => sum + 1 + s.querySelectorAll("*").length, 0);
    return { documentElements: doc, mapSvgElements: mapSvg?.n ?? 0, allMainSvgElements: svgTotal };
  });

  // Paint cost: scroll the full page down and back while frames are timed,
  // then read the CDP layout/style/paint counters accumulated over the run.
  await cdp.send("Performance.enable");
  const before = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const frameStats = await page.evaluate(async () => {
    const deltas = [];
    let last = performance.now();
    let raf = true;
    const tick = (t) => { deltas.push(t - last); last = t; if (raf) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const h = document.body.scrollHeight;
    for (let y = 0; y <= h; y += 120) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 16)); }
    for (let y = h; y >= 0; y -= 120) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 16)); }
    raf = false;
    deltas.shift();
    deltas.sort((a, b) => a - b);
    const p = (q) => deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * q))] ?? 0;
    return { frames: deltas.length, p50: +p(0.5).toFixed(1), p95: +p(0.95).toFixed(1), max: +Math.max(...deltas).toFixed(1) };
  });
  const after = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const d = (k) => +(after[k] - before[k]).toFixed(3);
  log(`MEASURE ${LABEL} ${name}`, JSON.stringify({
    ...counts,
    scrollFrames: frameStats,
    layoutCount: d("LayoutCount"),
    recalcStyleCount: d("RecalcStyleCount"),
    layoutDurSec: d("LayoutDuration"),
    recalcStyleDurSec: d("RecalcStyleDuration"),
    nodes: after.Nodes,
  }));
}

async function main() {
  const ticket = await mintTicket(USER_ID);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox"] });
  for (const vp of [{ name: "phone", width: 390, height: 844 }, { name: "desktop", width: 1280, height: 900 }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await mintTicket(USER_ID)}`, { waitUntil: "networkidle" });
    await page.goto(`${ORIGIN}/journey`, { waitUntil: "networkidle" });
    await page.getByText(/Boarding pass/i).waitFor({ timeout: 20000 });
    await page.waitForTimeout(1200);
    const cdp = await page.context().newCDPSession(page);
    await measure(page, cdp, vp.name);
    await page.screenshot({ path: `qa/shots/task985/${LABEL}-${vp.name}-full.png`, fullPage: true });
    // Mid-map viewport shot too (zone 3-4 area) for close inspection.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.45));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `qa/shots/task985/${LABEL}-${vp.name}-mid.png` });
    log(`console errors (${vp.name}):`, JSON.stringify(errors.filter((e) => !/402/.test(e))).slice(0, 300));
    await page.close();
  }
  await browser.close();
  log("DONE");
}

main().catch((e) => { console.error(e); process.exit(1); });
