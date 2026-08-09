// Stats-banner regression probe: signs in as the QA user, loads web home, and
// reports (a) the /api/progress/summary request outcome + body, (b) whether the
// banner cell row rendered visibly (invisible-class state, height, and the
// "Day Streak" label), so we can tell "summary undefined" apart from "summary
// populated but banner not rendering".
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<id> NODE_PATH=/tmp/pw/node_modules node qa/home-stats-banner-probe.mjs
import { chromium } from "playwright-core";

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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const summaryEvents = [];
page.on("response", async (r) => {
  if (r.url().includes("/api/progress/summary")) {
    let body = null;
    try { body = await r.json(); } catch { /* non-JSON */ }
    summaryEvents.push({ url: r.url().slice(r.url().indexOf("/api/")), status: r.status(), body });
  }
});
page.on("requestfailed", (r) => {
  if (r.url().includes("/api/progress/summary"))
    summaryEvents.push({ url: r.url().slice(r.url().indexOf("/api/")), failed: r.failure()?.errorText });
});
page.on("console", (m) => {
  if (m.type() === "error") console.log("console.error:", m.text().slice(0, 300));
});

await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${token}`, { waitUntil: "networkidle" });
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
await page.goto(`${ORIGIN}/app`, { waitUntil: "domcontentloaded" });
await page.getByText(/Browse by topic/i).first().waitFor({ timeout: 60000 });
await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3000); // let the reconcile flip + summary refetch settle

const banner = await page.evaluate(() => {
  const label = [...document.querySelectorAll("*")].find(
    (el) => el.children.length === 0 && /Day Streak/i.test(el.textContent ?? ""),
  );
  if (!label) return { labelFound: false };
  // walk up to the keyed cell-row wrapper (the one that toggles `invisible`)
  let row = label.parentElement;
  while (row && !row.className?.includes?.("items-stretch")) row = row.parentElement;
  const rect = row?.getBoundingClientRect();
  const cs = row ? getComputedStyle(row) : null;
  return {
    labelFound: true,
    rowClass: row?.className ?? null,
    ariaHidden: row?.getAttribute("aria-hidden"),
    height: rect ? Math.round(rect.height) : null,
    visibility: cs?.visibility,
    display: cs?.display,
    cellTexts: row ? [...row.querySelectorAll("*")].filter((e) => e.children.length === 0).map((e) => e.textContent?.trim()).filter(Boolean).slice(0, 12) : [],
  };
});

console.log("summary events:", JSON.stringify(summaryEvents, null, 1));
console.log("banner state:", JSON.stringify(banner, null, 1));
await browser.close();
