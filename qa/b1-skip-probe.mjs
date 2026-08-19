// B1 language-step SKIP path probe (July 30 2026) — the one path qa unit tests
// couldn't cover in a real browser. Note: #859's qa/b1-402-probe.mjs never landed
// in the tree (empty merge), so this is a standalone probe following the same
// harness pattern (fresh +clerk_test user, sign_in_tokens, Nix chromium).
// Asserts: fresh user hits /app -> gated to /choose-language -> Skip -> lands on
// /app with session marker set and NO hasChosenLanguage write -> same-session
// reload stays home -> FRESH browser context re-gates to /choose-language.
//   CHROME_BIN=$(which chromium) NODE_PATH=/tmp/pw/node_modules node qa/b1-skip-probe.mjs
import { chromium } from "playwright-core";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const SK = process.env.CLERK_SECRET_KEY;
const email = `bolo-b1-skip+clerk_test@example.com`;

const bapi = async (method, path, body) => {
  const r = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};

// fresh throwaway user (delete leftovers first)
const found = await bapi("GET", `/users?email_address=${encodeURIComponent(email)}`);
for (const u of Array.isArray(found.j) ? found.j : []) await bapi("DELETE", `/users/${u.id}`);
const created = await bapi("POST", "/users", {
  email_address: [email],
  password: `B1skip!${Math.random().toString(36).slice(2)}Zz`,
  skip_password_checks: true,
});
if (created.status !== 200) { console.error("user create failed", created.status, JSON.stringify(created.j)); process.exit(1); }
const userId = created.j.id;
// Client Trust is ON in dev; ticket sign-ins may or may not trip it — set the
// documented per-user bypass so the harness is deterministic either way.
const bypass = await bapi("PATCH", `/users/${userId}`, { bypass_client_trust: true });
console.log("qa user:", userId, "| bypass_client_trust patch:", bypass.status);

const mintToken = async () => {
  const r = await bapi("POST", "/sign_in_tokens", { user_id: userId });
  if (!r.j.token) throw new Error(`sign_in_token failed: ${r.status} ${JSON.stringify(r.j)}`);
  return r.j.token; // single-use — mint one per context
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };

const signIn = async (ctx) => {
  const page = await ctx.newPage();
  const prefWrites = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/account/preferences") && r.method() === "PATCH")
      prefWrites.push(r.postData() ?? "");
  });
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await mintToken()}`, { waitUntil: "networkidle" });
  return { page, prefWrites };
};

try {
  // ---- context A: gate -> skip -> home, marker present, no flag write
  const ctxA = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const { page: a, prefWrites } = await signIn(ctxA);
  await a.goto(`${ORIGIN}/app`, { waitUntil: "domcontentloaded" });
  await a.waitForURL(/\/choose-language/, { timeout: 30000 }).catch(() => {});
  check("fresh user is gated to /choose-language", a.url().includes("/choose-language"), a.url());
  await a.getByTestId("choose-lang-hi").waitFor({ timeout: 20000 });
  check("language tiles rendered", true);

  await a.getByTestId("skip-language-step").click();
  await a.waitForURL(/\/app/, { timeout: 20000 }).catch(() => {});
  check("skip lands on /app", a.url().includes("/app"), a.url());
  const marker = await a.evaluate(() => sessionStorage.getItem("bolo.langStepSkipped"));
  check("session marker present after skip", !!marker, `bolo.langStepSkipped=${marker}`);
  const flagWrites = prefWrites.filter((b) => b.includes("hasChosenLanguage"));
  check("skip sent NO hasChosenLanguage write", flagWrites.length === 0, flagWrites.join(" | ").slice(0, 200) || "no writes");

  await a.goto(`${ORIGIN}/app`, { waitUntil: "domcontentloaded" });
  await a.waitForTimeout(4000);
  check("same-session reload stays on /app", a.url().includes("/app") && !a.url().includes("/choose-language"), a.url());
  await ctxA.close();

  // ---- context B: fresh session (marker gone) re-gates
  const ctxB = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const { page: b } = await signIn(ctxB);
  await b.goto(`${ORIGIN}/app`, { waitUntil: "domcontentloaded" });
  await b.waitForURL(/\/choose-language/, { timeout: 30000 }).catch(() => {});
  check("fresh session re-gates to /choose-language", b.url().includes("/choose-language"), b.url());
  await ctxB.close();
} finally {
  await browser.close();
  const del = await bapi("DELETE", `/users/${userId}`);
  console.log("clerk user cleanup:", del.status, "| db row left for cascade-free manual sweep:", userId);
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\nRESULT: FAIL (${failed.length})` : "\nRESULT: PASS (all checks)");
process.exit(failed.length ? 1 : 0);
