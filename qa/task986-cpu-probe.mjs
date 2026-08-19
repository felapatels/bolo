// Task 986: games hub CPU probe, measures hub idle cost so the vignette
// energy-model change can report before/after, plus frame-time sampling.
//
// Metrics over a fixed IDLE_MS window on /games (after the entrance cascade):
//   - CDP Performance.getMetrics deltas: ScriptDuration, RecalcStyleDuration,
//     LayoutDuration (seconds of main-thread work attributable to the window)
//   - rAF frame delta p50 / p95 (ms)
//   - count of running CSS animations inside the game grid
//
// Usage (run with cwd = repo root so shots/paths resolve):
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<clerk user id> \
//   node qa/task986-cpu-probe.mjs [label]
import { chromium } from "playwright-core";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const LABEL = process.argv[2] ?? "run";
const IDLE_MS = 8000;

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
const ctx = await browser.newContext({ viewport: { width: 480, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken()}`, {
  waitUntil: "networkidle",
});
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
await page.goto(`${ORIGIN}/games`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000); // let the entrance cascade fully settle

const cdp = await ctx.newCDPSession(page);
await cdp.send("Performance.enable");

const grab = async () => {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const get = (n) => metrics.find((m) => m.name === n)?.value ?? 0;
  return {
    script: get("ScriptDuration"),
    style: get("RecalcStyleDuration"),
    layout: get("LayoutDuration"),
  };
};

// Start frame sampling in-page, snapshot metrics, idle, snapshot again.
await page.evaluate((ms) => {
  window.__frames = [];
  let last = performance.now();
  const tick = (t) => {
    window.__frames.push(t - last);
    last = t;
    if (t - window.__frameStart < ms) requestAnimationFrame(tick);
  };
  window.__frameStart = performance.now();
  requestAnimationFrame(tick);
}, IDLE_MS);

const before = await grab();
await page.waitForTimeout(IDLE_MS);
const after = await grab();

const frames = await page.evaluate(() => window.__frames.slice(1));
frames.sort((a, b) => a - b);
const pct = (p) => frames[Math.min(frames.length - 1, Math.floor(frames.length * p))] ?? 0;

const anims = await page.evaluate(() => {
  const grid = document.querySelector("h3")?.closest(".grid") ?? document.body;
  return grid.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length;
});

console.log(`[${LABEL}] idle window ${IDLE_MS}ms on /games @480px`);
console.log(
  `[${LABEL}] main-thread deltas (ms): script=${((after.script - before.script) * 1000).toFixed(1)} style=${((after.style - before.style) * 1000).toFixed(1)} layout=${((after.layout - before.layout) * 1000).toFixed(1)}`,
);
console.log(`[${LABEL}] frame delta p50=${pct(0.5).toFixed(1)}ms p95=${pct(0.95).toFixed(1)}ms n=${frames.length}`);
console.log(`[${LABEL}] running animations in grid: ${anims}`);

await browser.close();
