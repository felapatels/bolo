// Practice header fit probe (follow-up to #1003, re-aimed for #1044).
//
// Signs in a throwaway Clerk test user and loads /practice/1 at 320px width.
// The three audio pills this probe was written for now live behind a settings
// gear, so it measures the two controls that replaced them, the display-only
// language chip and the gear, plus, once the menu is open, the three menu
// items. Everything must be fully inside the viewport with no horizontal page
// overflow, in light and dark themes and with enlarged root text
// (accessibility approximation), plus a 375px sanity pass.
//
// The chip is forced to a three-character code (SAT) for the measurement:
// the slot is fixed-width so the header must not reflow between HI and SAT,
// and three characters is the worst case.
//
// Screenshots land in shots/header-pills/.
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

// Measures the header chip + gear against the viewport. Runs inside the page.
// Widening the chip text to a three-character code is the worst case for fit,
// and proves the fixed slot does not reflow the row.
const MEASURE = `(() => {
  const chip = document.querySelector('header [data-testid="lesson-language-chip"]');
  const gear = document.querySelector('header [data-testid="practice-settings-trigger"]');
  const controls = [chip, gear].filter(Boolean);
  const vw = document.documentElement.clientWidth;
  const overflowX = document.documentElement.scrollWidth - vw;
  const detail = controls.map((el) => {
    const r = el.getBoundingClientRect();
    return { name: el.dataset.testid, text: (el.textContent || "").trim().slice(0, 8), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) };
  });
  const allIn = controls.length === 2 && detail.every((d) => d.left >= 0 && d.right <= vw);
  // No leftover pills: the three controls must be in the menu now, not loose.
  const strayPills = document.querySelectorAll("header button[aria-pressed]").length;
  return { count: controls.length, strayPills, vw, overflowX, allIn, detail: JSON.stringify(detail) };
})()`;

// Opens the gear menu and measures the three items. Radix opens on pointerdown.
const MEASURE_MENU = `(() => {
  const items = [...document.querySelectorAll('[role="menuitemcheckbox"]')];
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const detail = items.map((el) => {
    const r = el.getBoundingClientRect();
    return { text: (el.textContent || "").trim(), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
  });
  const allIn = items.length === 3 && detail.every((d) => d.left >= 0 && d.right <= vw && d.top >= 0 && d.bottom <= vh);
  return { count: items.length, vw, allIn, detail: JSON.stringify(detail) };
})()`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await mintToken()}`, { waitUntil: "networkidle" });
  await page.goto(`${ORIGIN}/practice/1`, { waitUntil: "domcontentloaded" });
  const gear = page.locator('header [data-testid="practice-settings-trigger"]');
  await gear.waitFor({ timeout: 45000 });

  // Worst case for the fixed slot: a three-character code (SAT / MNI). The
  // chip must never truncate, "SA" already means Sanskrit.
  const WIDEN_CHIP = () => {
    const chip = document.querySelector('header [data-testid="lesson-language-chip"]');
    if (chip) chip.firstChild.textContent = "SAT";
  };

  const scenarios = [
    { name: "320 light", setup: null },
    { name: "320 dark", setup: () => document.documentElement.classList.add("dark") },
    { name: "320 dark large-text", setup: () => { document.documentElement.style.fontSize = "20px"; } },
    { name: "320 light large-text", setup: () => { document.documentElement.classList.remove("dark"); } },
  ];
  for (const s of scenarios) {
    if (s.setup) await page.evaluate(s.setup);
    await page.evaluate(WIDEN_CHIP);
    await page.waitForTimeout(300);
    const m = await page.evaluate(MEASURE);
    check(`${s.name}: chip + gear fully on screen, no page overflow`, m.allIn && m.overflowX <= 0 && m.strayPills === 0, `count=${m.count} strayPills=${m.strayPills} vw=${m.vw} overflowX=${m.overflowX} ${m.detail}`);
    await page.screenshot({ path: `${OUT}/${s.name.replaceAll(" ", "-")}.png` });

    // The three controls now live in the gear menu; check they fit too.
    await gear.click();
    await page.waitForTimeout(300);
    const mm = await page.evaluate(MEASURE_MENU);
    check(`${s.name}: 3 menu items fully on screen`, mm.allIn, `count=${mm.count} ${mm.detail}`);
    await page.screenshot({ path: `${OUT}/${s.name.replaceAll(" ", "-")}-menu.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  // 375px sanity pass at normal text, light theme.
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.setViewportSize({ width: 375, height: 750 });
  await page.evaluate(WIDEN_CHIP);
  await page.waitForTimeout(300);
  const m375 = await page.evaluate(MEASURE);
  check("375 light: chip + gear fully on screen, no page overflow", m375.allIn && m375.overflowX <= 0 && m375.strayPills === 0, `overflowX=${m375.overflowX} ${m375.detail}`);
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
