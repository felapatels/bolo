// Task 1103, daily XP train-class ladder, real-browser evidence (MOBILE).
//
// Captured from the Expo WEB build (react-native-web renders the same
// component tree); there is no device or emulator in this environment.
// Viewport 412×824 @2x, the store-screenshot convention used by
// qa/d1bm-shots.mjs and qa/task1049-mobile-shots.mjs.
//
// Same three ladder states as the web probe, so the two sets of shots can be
// compared side by side: both platforms must show the same number, the same
// class and the same bar for the same learner.
//
// Today's XP is forced by rewriting the /api/progress/summary response.
//
// QA-only: reads the running dev app, changes no product code.
// Screenshots land in qa/shots/task1103-mobile (gitignored).
//
//   cd /home/runner/workspace && CHROME_BIN=$(which chromium) \
//     node qa/task1103-trainclass-mobile-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const SK = process.env.CLERK_SECRET_KEY;
const OUT = "qa/shots/task1103-mobile";
if (!SK) throw new Error("CLERK_SECRET_KEY is required");
mkdirSync(OUT, { recursive: true });

const EMAIL = "bolo-trainclass-m+clerk_test@example.com";

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
let userId = (Array.isArray(found.j) ? found.j : [])[0]?.id;
if (!userId) {
  const created = await bapi("POST", "/users", {
    email_address: [EMAIL],
    password: `Tc1103m!${Math.random().toString(36).slice(2)}Zz`,
    skip_password_checks: true,
  });
  if (created.status !== 200) throw new Error(`user create failed ${created.status} ${JSON.stringify(created.j)}`);
  userId = created.j.id;
}
await bapi("PATCH", `/users/${userId}`, { bypass_client_trust: true });
console.log("qa user:", userId);

const STATES = [
  { key: "a-no-class", xp: 40, expectClass: null, expectFraction: "40/100" },
  { key: "b-mid-ladder", xp: 254, expectClass: "Superfast", expectFraction: "254/400" },
  { key: "c-top-class", xp: 900, expectClass: "Shatabdi", expectFraction: null },
];

// react-native-web maps testID → data-testid, accessibilityLabel → aria-label.
const MEASURE = `(() => {
  const strips = [...document.querySelectorAll('[data-testid="xp-counter"]')];
  const strip = strips.find((el) => el.getBoundingClientRect().width > 0) || strips[0];
  if (!strip) return { found: false };
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
  const bar = strip.querySelector('[data-testid="xp-meter-bar"]');
  return {
    found: true,
    vw: document.documentElement.clientWidth,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    text: (strip.textContent || "").trim(),
    label: strip.getAttribute("aria-label"),
    className: strip.querySelector('[data-testid="xp-train-class"]')?.textContent?.trim() ?? null,
    hasBar: !!bar,
    barW: bar ? Math.round(bar.getBoundingClientRect().width) : null,
    fillW: bar?.firstElementChild ? Math.round(bar.firstElementChild.getBoundingClientRect().width) : null,
    strip: box(strip),
  };
})()`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 412, height: 824 }, deviceScaleFactor: 2 });

let forcedXp = 0;
await ctx.route("**/api/progress/summary*", async (route) => {
  const res = await route.fetch();
  let json;
  try { json = await res.json(); } catch { return route.fulfill({ response: res }); }
  json.todayXp = forcedXp;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(json),
  });
});

const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 200)));

const dump = async (label) => {
  const t = await page.evaluate(() => document.body.innerText.slice(0, 700));
  console.log(`--- page text (${label}):\n${t}\n---`);
};

console.log("loading", ORIGIN);
await page.goto(ORIGIN, { waitUntil: "networkidle", timeout: 240000 });
await page.waitForTimeout(4000);

if (await page.getByText("Welcome back").count()) {
  await page.getByPlaceholder("you@example.com").fill(EMAIL);
  await page.getByText("Email me a sign-in code instead").click();
  await page.getByPlaceholder("123456").waitFor({ timeout: 60000 }).catch(async () => {
    await dump("sign-in");
    throw new Error("code field never appeared");
  });
  await page.getByPlaceholder("123456").fill("424242");
  await page.getByText("Verify & sign in").click();
  await page.waitForTimeout(10000);
}

if (await page.getByText("Choose your language").count()) {
  await page.getByTestId("choose-lang-hi").click();
  await page.waitForTimeout(8000);
}
const skipTour = page.getByLabel("Skip tour");
if (await skipTour.count()) {
  await skipTour.first().click().catch(() => {});
  await page.waitForTimeout(1500);
}

for (const surface of [
  { name: "home", url: `${ORIGIN}/`, },
  { name: "session", url: `${ORIGIN}/practice/1`, },
]) {
  for (const s of STATES) {
    forcedXp = s.xp;
    await page.goto(surface.url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="xp-counter"]', { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(4000);

    const m = await page.evaluate(MEASURE);
    const tag = `${surface.name}-${s.key}`;
    if (!m.found) { pass(`${tag}: strip rendered`, false); await dump(tag); continue; }

    console.log(`${tag}:`, JSON.stringify(m));
    await page.screenshot({ path: `${OUT}/${tag}.png` });

    pass(`${tag}: class name`, m.className === s.expectClass, `got=${m.className} want=${s.expectClass}`);
    if (s.expectFraction) {
      pass(`${tag}: shows ${s.expectFraction}`, m.text.includes(s.expectFraction), `text=${m.text}`);
      pass(`${tag}: has a bar`, m.hasBar === true);
      pass(`${tag}: bar not pinned full`, m.fillW !== null && m.barW !== null && m.fillW < m.barW, `fill=${m.fillW} track=${m.barW}`);
    } else {
      pass(`${tag}: no fraction at the top class`, !m.text.includes("/"), `text=${m.text}`);
      pass(`${tag}: no bar at the top class`, m.hasBar === false);
      pass(`${tag}: class name is the whole strip`, m.text === "Shatabdi", `text=${m.text}`);
    }
    pass(`${tag}: strip inside the viewport`, m.strip.l >= 0 && m.strip.r <= m.vw, `l=${m.strip.l} r=${m.strip.r} vw=${m.vw}`);
    pass(`${tag}: no horizontal page overflow`, m.overflowX <= 0, `overflowX=${m.overflowX}`);
  }
}

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
