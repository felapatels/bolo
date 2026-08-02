// Practice header pill fit probe (follow-up to #1003).
//
// Signs in a throwaway Clerk test user and loads /practice/1 at 320px width.
// Verifies all three header pills (Phrase / Feedback / Meaning) are fully
// inside the viewport with no horizontal page overflow, in light and dark
// themes and with enlarged root text (accessibility approximation), plus a
// 375px sanity pass. Screenshots land in shots/header-pills/.
//
//   cd qa && CHROME_BIN=$(which chromium) node header-pills-320-probe.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const SK = process.env.CLERK_SECRET_KEY;
const OUT = "shots/header-pills";
mkdirSync(OUT, { recursive: true });
const email = `bolo-headerpills-probe+clerk_test@example.com`;

const bapi = async (method, path, body) => {
  const r = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};

const found = await bapi("GET", `/users?email_address=${encodeURIComponent(email)}`);
for (const u of Array.isArray(found.j) ? found.j : []) await bapi("DELETE", `/users/${u.id}`);
const created = await bapi("POST", "/users", {
  email_address: [email],
  password: `Hp320!${Math.random().toString(36).slice(2)}Zz`,
  skip_password_checks: true,
});
if (created.status !== 200) { console.error("user create failed", created.status, JSON.stringify(created.j)); process.exit(1); }
const userId = created.j.id;
await bapi("PATCH", `/users/${userId}`, { bypass_client_trust: true });
console.log("qa user:", userId);
const mintToken = async () => {
  const r = await bapi("POST", "/sign_in_tokens", { user_id: userId });
  if (!r.j.token) throw new Error(`sign_in_token failed: ${r.status} ${JSON.stringify(r.j)}`);
  return r.j.token;
};

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` | ${detail}` : ""}`); };

// Measures the three pills against the viewport. Runs inside the page.
const MEASURE = `(() => {
  const names = ["phrase", "feedback", "meaning"];
  const pills = [...document.querySelectorAll("header button[aria-pressed]")];
  const vw = document.documentElement.clientWidth;
  const overflowX = document.documentElement.scrollWidth - vw;
  const detail = pills.map((b) => {
    const r = b.getBoundingClientRect();
    return { name: (b.textContent || "pill").trim().toLowerCase() || "icon", left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) };
  });
  const allIn = pills.length === 3 && detail.every((d) => d.left >= 0 && d.right <= vw);
  return { count: pills.length, vw, overflowX, allIn, detail: JSON.stringify(detail) };
})()`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await mintToken()}`, { waitUntil: "networkidle" });
  await page.goto(`${ORIGIN}/practice/1`, { waitUntil: "domcontentloaded" });
  await page.locator("header button[aria-pressed]").nth(2).waitFor({ timeout: 45000 });

  const scenarios = [
    { name: "320 light", setup: null },
    { name: "320 dark", setup: () => document.documentElement.classList.add("dark") },
    { name: "320 dark large-text", setup: () => { document.documentElement.style.fontSize = "20px"; } },
    { name: "320 light large-text", setup: () => { document.documentElement.classList.remove("dark"); } },
  ];
  for (const s of scenarios) {
    if (s.setup) await page.evaluate(s.setup);
    await page.waitForTimeout(300);
    const m = await page.evaluate(MEASURE);
    check(`${s.name}: 3 pills fully on screen, no page overflow`, m.allIn && m.overflowX <= 0, `count=${m.count} vw=${m.vw} overflowX=${m.overflowX} ${m.detail}`);
    await page.screenshot({ path: `${OUT}/${s.name.replaceAll(" ", "-")}.png` });
  }

  // 375px sanity pass at normal text, light theme.
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.setViewportSize({ width: 375, height: 750 });
  await page.waitForTimeout(300);
  const m375 = await page.evaluate(MEASURE);
  check("375 light: 3 pills fully on screen, no page overflow", m375.allIn && m375.overflowX <= 0, `overflowX=${m375.overflowX} ${m375.detail}`);
  await page.screenshot({ path: `${OUT}/375-light.png` });

  await ctx.close();
} finally {
  await browser.close();
  const del = await bapi("DELETE", `/users/${userId}`);
  console.log("clerk user cleanup:", del.status);
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\nRESULT: FAIL (${failed.length})` : "\nRESULT: PASS (all checks)");
process.exit(failed.length ? 1 : 0);
