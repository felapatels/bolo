// Task 1103 — daily XP train-class ladder, real-browser evidence (WEB).
//
// jsdom cannot see layout, so this probe captures the three ladder states on
// the running dev app at phone width (320px, the narrowest supported), in both
// places the strip is mounted:
//   • the nav variant, in the floating bottom nav on /app
//   • the compact session variant, in the practice header on /practice/1
//
// Today's XP is forced by rewriting the /api/progress/summary response, so the
// three states are reproducible without earning 900 XP by hand. Nothing else
// is stubbed — the real component, the real nav and the real header render.
//
// It also measures the compact variant against its neighbours: with a
// three-digit numerator over a three-digit denominator the strip must still
// fit the header with no page overflow, no wrapping, and no overlap with the
// language chip or the settings gear.
//
// QA-only: reads the running dev app, changes no product code.
// Screenshots land in qa/shots/task1103 (gitignored).
//
//   cd /home/runner/workspace && CHROME_BIN=$(which chromium) \
//     node qa/task1103-trainclass-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = process.env.APP_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
const SK = process.env.CLERK_SECRET_KEY;
const OUT = "qa/shots/task1103";
if (!SK) throw new Error("CLERK_SECRET_KEY is required");
mkdirSync(OUT, { recursive: true });

const EMAIL = "bolo-trainclass-probe+clerk_test@example.com";

let failures = 0;
const pass = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
};

const bapi = async (method, path, body) => {
  const r = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};

const found = await bapi("GET", `/users?email_address=${encodeURIComponent(EMAIL)}`);
for (const u of Array.isArray(found.j) ? found.j : []) await bapi("DELETE", `/users/${u.id}`);
const created = await bapi("POST", "/users", {
  email_address: [EMAIL],
  password: `Tc1103!${Math.random().toString(36).slice(2)}Zz`,
  skip_password_checks: true,
});
if (created.status !== 200) throw new Error(`user create failed ${created.status} ${JSON.stringify(created.j)}`);
const userId = created.j.id;
await bapi("PATCH", `/users/${userId}`, { bypass_client_trust: true });
console.log("qa user:", userId);
const ticket = (await bapi("POST", "/sign_in_tokens", { user_id: userId })).j.token;
if (!ticket) throw new Error("sign_in_token failed");

// The three states the ladder can be in, at phone width.
const STATES = [
  { key: "a-no-class", xp: 40, expectClass: null, expectFraction: "40/100" },
  { key: "b-mid-ladder", xp: 254, expectClass: "Superfast", expectFraction: "254/400" },
  { key: "c-top-class", xp: 900, expectClass: "Shatabdi", expectFraction: null },
];

// Reads the rendered strip: its own text, its box, and the boxes of the
// controls it must not crowd.
const MEASURE = `(() => {
  // Both navs mount the strip; the desktop one is display:none at phone width
  // (zero-size box), so measure the VISIBLE instance.
  const strips = [...document.querySelectorAll('[data-testid="xp-counter"]')];
  const strip = strips.find((el) => el.getBoundingClientRect().width > 0) || strips[0];
  if (!strip) return { found: false };
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
  const header = document.querySelector("header");
  const chip = document.querySelector('header [data-testid="lesson-language-chip"]');
  const gear = document.querySelector('header [data-testid="practice-settings-trigger"]');
  // Line count: the strip must not wrap its numbers row.
  const numbers = strip.querySelector("span");
  const lineHeight = numbers ? numbers.getBoundingClientRect().height : 0;
  return {
    found: true,
    vw: document.documentElement.clientWidth,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    text: (strip.textContent || "").trim(),
    label: strip.getAttribute("aria-label"),
    className: strip.querySelector('[data-testid="xp-train-class"]')?.textContent?.trim() ?? null,
    classBox: box(strip.querySelector('[data-testid="xp-train-class"]')),
    // The floating nav's raised Bolo circle breaks through the strip's row.
    boloCircle: box(document.querySelector('a[aria-label="Chat with Bolo"] div.rounded-full')),
    hasBar: !!strip.querySelector('[data-testid="xp-meter-bar"]'),
    barFillPct: strip.querySelector('[data-testid="xp-meter-bar"] > div')?.style.width ?? null,
    strip: box(strip),
    header: box(header),
    chip: box(chip),
    gear: box(gear),
    numbersLineHeight: Math.round(lineHeight),
  };
})()`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || undefined,
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 320, height: 720 }, deviceScaleFactor: 2 });

let forcedXp = 0;
await ctx.route("**/api/progress/summary*", async (route) => {
  const res = await route.fetch();
  let json;
  try { json = await res.json(); } catch { return route.fulfill({ response: res }); }
  json.todayXp = forcedXp;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(json),
  });
});

const page = await ctx.newPage();
page.on("pageerror", (e) => pass("no page error", false, String(e).slice(0, 160)));

await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${ticket}`, { waitUntil: "networkidle" });
await page.waitForURL(/\/app/, { timeout: 60000 }).catch(() => {});

// Dismiss the onboarding tour if it launches — it covers the nav.
const skip = page.getByRole("button", { name: /skip tour/i });
if (await skip.count()) await skip.first().click().catch(() => {});

for (const surface of [
  { name: "nav", url: `${ORIGIN}/app`, ready: 'a[aria-label="Chat with Bolo"]' },
  { name: "session", url: `${ORIGIN}/practice/1`, ready: '[data-testid="xp-counter"]' },
]) {
  for (const s of STATES) {
    forcedXp = s.xp;
    await page.goto(surface.url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(surface.ready, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const m = await page.evaluate(MEASURE);
    const tag = `${surface.name}-${s.key}`;
    if (!m.found) { pass(`${tag}: strip rendered`, false); continue; }

    console.log(`${tag}:`, JSON.stringify(m));
    await page.screenshot({ path: `${OUT}/${tag}.png` });

    pass(`${tag}: no horizontal page overflow`, m.overflowX <= 0, `overflowX=${m.overflowX}`);
    pass(`${tag}: class name`, m.className === s.expectClass, `got=${m.className} want=${s.expectClass}`);
    if (s.expectFraction) {
      pass(`${tag}: shows ${s.expectFraction}`, m.text.includes(s.expectFraction), `text=${m.text}`);
      pass(`${tag}: has a bar`, m.hasBar === true);
      pass(`${tag}: bar not pinned full`, m.barFillPct !== "100%", `fill=${m.barFillPct}`);
    } else {
      pass(`${tag}: no fraction at the top class`, !m.text.includes("/"), `text=${m.text}`);
      pass(`${tag}: no bar at the top class`, m.hasBar === false);
      pass(`${tag}: class name is the whole strip`, m.text === "Shatabdi", `text=${m.text}`);
    }
    pass(`${tag}: strip inside the viewport`, m.strip.l >= 0 && m.strip.r <= m.vw, `l=${m.strip.l} r=${m.strip.r} vw=${m.vw}`);

    if (surface.name === "nav" && m.classBox && m.boloCircle) {
      // The class name must not vanish behind the raised Bolo circle.
      const clear = m.classBox.l >= m.boloCircle.r || m.classBox.r <= m.boloCircle.l;
      pass(`${tag}: class name clear of the raised Bolo circle`, clear,
        `class=[${m.classBox.l},${m.classBox.r}] bolo=[${m.boloCircle.l},${m.boloCircle.r}]`);
    }

    if (surface.name === "session") {
      // The compact variant must not crowd the controls beside it.
      if (m.chip) pass(`${tag}: clear of the language chip`, m.strip.r <= m.chip.l, `stripR=${m.strip.r} chipL=${m.chip.l}`);
      if (m.gear) pass(`${tag}: clear of the settings gear`, m.strip.r <= m.gear.l, `stripR=${m.strip.r} gearL=${m.gear.l}`);
      // A wrapped numbers row would roughly double its line box. A single
      // 11px row measures ~17px once the baseline-aligned "XP" unit is in it.
      pass(`${tag}: numbers row did not wrap`, m.numbersLineHeight > 0 && m.numbersLineHeight <= 24, `h=${m.numbersLineHeight}`);
    }
  }
}

await browser.close();
await bapi("DELETE", `/users/${userId}`);
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
