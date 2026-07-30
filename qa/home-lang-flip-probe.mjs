// Fresh-device language-flip probe: localStorage's language differs from the
// server's authoritative one (LanguageProvider reconciles after /account).
// Asserts the home blocking gate resolves ONCE — no second full-screen
// spinner wave after content first paints — and that the settled state
// matches the SERVER's language (wrong-language content is transitional
// only). Also counts the blocking API fetches per language: exactly one for
// the server language, at most one transitional fetch for the local one.
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<id> NODE_PATH=/tmp/pw/node_modules node qa/home-lang-flip-probe.mjs
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

// Track every appearance/disappearance of the full-screen gate spinner.
// Installed before any app code runs on every navigation.
await page.addInitScript(() => {
  window.__spinnerLog = window.__spinnerLog || [];
  let present = false;
  const check = () => {
    const el = document.querySelector("svg.animate-spin.h-12.w-12");
    if (!!el !== present) {
      present = !!el;
      window.__spinnerLog.push({ t: Math.round(performance.now()), ev: present ? "appear" : "gone" });
    }
  };
  new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
});

await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${token}`, { waitUntil: "networkidle" });
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});

// The server's authoritative language (cookie-authed relative fetch).
const serverLang = await page.evaluate(async () => {
  const r = await fetch("/api/account");
  if (!r.ok) throw new Error(`/api/account ${r.status}`);
  return (await r.json()).preferences.learning.activeLanguage;
});
if (!serverLang) throw new Error("QA user has no server activeLanguage — seed one first");
const localLang = serverLang === "gu" ? "hi" : "gu";
console.log(`server lang=${serverLang}, seeding localStorage with ${localLang} (fresh-device mismatch)`);
await page.evaluate((code) => localStorage.setItem("bolo.activeLang", code), localLang);

const apiReqs = [];
page.on("request", (r) => {
  const u = r.url();
  if (/\/api\/(progress\/summary|categories)\?/.test(u)) apiReqs.push(u.slice(u.indexOf("/api/")));
});

await page.goto(`${ORIGIN}/app`, { waitUntil: "domcontentloaded" });
await page.getByText(/Browse by topic/i).first().waitFor({ timeout: 60000 });
const logAtPaint = await page.evaluate(() => [...window.__spinnerLog]);
await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500); // let the /account reconcile flip + refetch fully settle
const log = await page.evaluate(() => window.__spinnerLog);
const settledLang = await page.evaluate(() => localStorage.getItem("bolo.activeLang"));
const spinnerNow = await page.locator("svg.animate-spin.h-12.w-12").count();

console.log("spinner log:", JSON.stringify(log));
console.log("blocking api requests:", JSON.stringify(apiReqs, null, 1));
console.log(`settled localStorage lang=${settledLang}`);

const appears = (l) => l.filter((e) => e.ev === "appear").length;
const failures = [];
if (appears(log) > appears(logAtPaint))
  failures.push(`spinner reappeared AFTER first content paint (${appears(log) - appears(logAtPaint)}x) — second wave not eliminated`);
if (spinnerNow > 0) failures.push("gate spinner still present at settle");
if (settledLang !== serverLang) failures.push(`settled lang ${settledLang} != server ${serverLang}`);
for (const ep of ["/api/progress/summary", "/api/categories"]) {
  const n = (lang) => apiReqs.filter((u) => u.startsWith(ep) && u.includes(`lang=${lang}`)).length;
  if (n(serverLang) !== 1) failures.push(`${ep} fetched ${n(serverLang)}x for server lang (want exactly 1 — resolve once, not twice)`);
  if (n(localLang) > 1) failures.push(`${ep} fetched ${n(localLang)}x for transitional lang (want <=1)`);
}

await browser.close();
if (failures.length) {
  console.error("FAIL:\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log("PASS: blocking gate resolved once; no second spinner wave; settled state matches the server language.");
