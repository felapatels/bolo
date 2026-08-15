// Task 1098 — floating web bottom nav, real-browser geometry evidence.
//
// jsdom cannot see layout, so this probe measures the things the task's
// acceptance criteria are actually about, on the running dev app:
//   1. the nav pill is inset from both edges, rounded, opaque and lifted off
//      the bottom edge (mobile's 14px floor),
//   2. the raised Bolo circle's size and how far it breaks above the pill's
//      top edge, plus that it never covers the XP numbers,
//   3. every AppShell route ends with its last element clear of the pill,
//   4. the desktop sidebar still renders (and the pill does not) at lg,
//   5. the journey map's auto-scroll still lands the current stop clear of
//      the pill.
// Screenshots land in qa/shots/task1098 (gitignored).
//
// QA-only: reads the running dev app, changes no product code.
//
// Run (from repo root):
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<clerk_user_id> \
//     NODE_PATH=/tmp/pw/node_modules node qa/task1098-nav-float-probe.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const USER_ID = process.env.E2E_USER_ID;
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
const ORIGIN = process.env.APP_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = process.env.E2E_OUT || "qa/shots/task1098";
if (!USER_ID || !CLERK_SECRET) throw new Error("E2E_USER_ID and CLERK_SECRET_KEY are required");
mkdirSync(OUT, { recursive: true });

let failures = 0;
const pass = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
};

async function mintTicket() {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${CLERK_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`clerk sign_in_tokens failed: ${JSON.stringify(body)}`);
  return body.token;
}

// Measures the nav pill, the raised circle and the XP strip in one pass.
const MEASURE_NAV = `(() => {
  const link = document.querySelector('a[aria-label="Chat with Bolo"]');
  const pill = link && link.closest('div.fixed');
  if (!pill) return { found: false };
  const circle = link.querySelector('div.rounded-full');
  const xp = pill.querySelector('[aria-label$="XP today"]');
  const xpNumbers = xp && xp.querySelector('span');
  const cs = getComputedStyle(pill);
  const r = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
  return {
    found: true,
    vw: document.documentElement.clientWidth,
    vh: window.innerHeight,
    pill: r(pill),
    circle: circle ? r(circle) : null,
    xp: xp ? r(xp) : null,
    xpNumbers: xpNumbers ? r(xpNumbers) : null,
    radius: cs.borderRadius,
    bg: cs.backgroundColor,
    border: cs.borderTopWidth + " " + cs.borderTopStyle,
    shadow: cs.boxShadow,
    position: cs.position,
    zIndex: cs.zIndex,
  };
})()`;

// Bottom-most visible content element vs. the pill's top edge.
const MEASURE_CLEARANCE = `(() => {
  const link = document.querySelector('a[aria-label="Chat with Bolo"]');
  const pill = link && link.closest('div.fixed');
  const pillTop = pill ? pill.getBoundingClientRect().top + window.scrollY : null;
  // Scroll to the very bottom first — the last element only matters there.
  window.scrollTo(0, document.body.scrollHeight);
  let worst = null;
  const skip = (el) => pill && (pill === el || pill.contains(el));
  for (const el of document.querySelectorAll('main *, body > div *')) {
    if (skip(el)) continue;
    if (el.children.length) continue;           // leaves only
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
    if (cs.position === 'fixed') continue;      // other pinned chrome
    const b = el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) continue;
    const bottom = b.bottom + window.scrollY;
    if (!worst || bottom > worst.bottom) {
      worst = { bottom, tag: el.tagName, text: (el.textContent || '').trim().slice(0, 40), cls: (el.className || '').toString().slice(0, 60) };
    }
  }
  const pillTopNow = pill ? pill.getBoundingClientRect().top + window.scrollY : null;
  return { docHeight: document.body.scrollHeight, scrollY: window.scrollY, pillTopAtLoad: pillTop, pillTopAtBottom: pillTopNow, worst };
})()`;

const ticket = await mintTicket();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || undefined,
  args: ["--no-sandbox"],
});

// ── Phone width (320px) ────────────────────────────────────────────────────
const ctx = await browser.newContext({ viewport: { width: 320, height: 700 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => pass("no page error", false, String(e).slice(0, 140)));
await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${ticket}`, { waitUntil: "networkidle" });
await page.waitForURL(/\/app|\/$/, { timeout: 45000 }).catch(() => {});
await page.goto(`${ORIGIN}/app`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('a[aria-label="Chat with Bolo"]', { timeout: 45000 });
await page.waitForTimeout(1200);

const nav = await page.evaluate(MEASURE_NAV);
console.log("nav:", JSON.stringify(nav));
pass("nav pill found", nav.found);
pass("pill inset 14px from both edges", nav.pill.l === 14 && nav.vw - nav.pill.r === 14, `l=${nav.pill.l} rightGap=${nav.vw - nav.pill.r}`);
pass("pill lifted off the bottom edge (>= 14px)", nav.vh - nav.pill.b >= 14, `gap=${nav.vh - nav.pill.b}`);
pass("pill corner radius 32px", nav.radius.startsWith("32px"), nav.radius);
pass("pill opaque card background", /^rgb\(/.test(nav.bg), nav.bg);
pass("pill has a 1px border all round", nav.border === "1px solid", nav.border);
pass("pill has a drop shadow", nav.shadow !== "none", nav.shadow);
pass("pill stays fixed at z-40", nav.position === "fixed" && nav.zIndex === "40", `${nav.position} z=${nav.zIndex}`);

const protrusion = nav.pill.t - nav.circle.t;
pass("raised circle is 58x58 (mobile size)", nav.circle.w === 58 && nav.circle.h === 58, `${nav.circle.w}x${nav.circle.h}`);
pass("circle breaks above the pill's top edge by mobile's ~24px", protrusion >= 20 && protrusion <= 28, `protrusion=${protrusion}px (${Math.round((protrusion / 74) * 100)}% of the 74px bar)`);
pass("circle bottom sits 34px inside the pill (mobile ratio)", Math.abs(nav.circle.b - nav.pill.t - 34) <= 1, `inside=${nav.circle.b - nav.pill.t}`);
pass("circle never overlaps the XP numbers", nav.xpNumbers.r <= nav.circle.l, `xpNumbersRight=${nav.xpNumbers.r} circleLeft=${nav.circle.l}`);

// Opaque in every state: the XP strip must not show through the circle.
const circleBg = await page.evaluate(`(() => {
  const c = document.querySelector('a[aria-label="Chat with Bolo"] div.rounded-full');
  return getComputedStyle(c).backgroundColor;
})()`);
pass("circle background is opaque", /^rgb\(/.test(circleBg) || /rgba\([^)]+, *1\)$/.test(circleBg), circleBg);

await page.screenshot({ path: `${OUT}/01-home-320.png` });
await page.evaluate(() => document.documentElement.classList.add("dark"));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/02-home-320-dark.png` });
await page.evaluate(() => document.documentElement.classList.remove("dark"));

// ── Clearance on every route that renders the nav ──────────────────────────
// The seven AppShell routes plus the game screens, which are NOT under
// AppShell but mount <BottomNav /> themselves — so they need the same
// clearance and are just as easy to regress.
const ROUTES = [
  "/app",
  "/journey",
  "/phrasebook",
  "/progress",
  "/friends",
  "/bazaar",
  "/games",
  "/games/word-match",
  "/games/speed-round",
  "/games/listen-and-pick",
  "/games/phrase-builder",
  "/games/script-trace",
  "/games/bolo-quiz",
  "/games/ticket-check",
  "/games/wrong-platform",
  "/games/luggage-match",
  "/games/express-listening",
  "/games/signal-lights",
];
for (const route of ROUTES) {
  await page.goto(`${ORIGIN}${route}`, { waitUntil: "domcontentloaded" });
  const hasNav = await page
    .waitForSelector('a[aria-label="Chat with Bolo"]', { timeout: 45000 })
    .then(() => true)
    .catch(() => false);
  pass(`${route}: renders the nav`, hasNav);
  await page.waitForTimeout(1500);
  const m = await page.evaluate(MEASURE_CLEARANCE);
  await page.waitForTimeout(300);
  const gap = m.pillTopAtBottom == null || m.worst == null ? null : Math.round(m.pillTopAtBottom - m.worst.bottom);
  pass(`${route}: last element clears the floating pill`, gap != null && gap >= 0, `gap=${gap}px last=${m.worst && m.worst.tag} "${m.worst && m.worst.text}"`);
  await page.screenshot({ path: `${OUT}/route${route.replaceAll("/", "-")}-320-bottom.png` });
}

// ── Journey auto-scroll still lands the current stop clear of the pill ─────
await page.goto(`${ORIGIN}/journey`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('a[aria-label="Chat with Bolo"]', { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(2500);
const journey = await page.evaluate(`(() => {
  const link = document.querySelector('a[aria-label="Chat with Bolo"]');
  const pill = link && link.closest('div.fixed');
  const card = [...document.querySelectorAll("div")]
    .filter((d) => /In progress|Now boarding/.test(d.textContent || ""))
    .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0];
  if (!card) return { card: null, scrollY: window.scrollY };
  const c = card.getBoundingClientRect();
  const p = pill.getBoundingClientRect();
  return { scrollY: window.scrollY, cardTop: Math.round(c.top), cardBottom: Math.round(c.bottom), pillTop: Math.round(p.top), vh: window.innerHeight };
})()`);
console.log("journey:", JSON.stringify(journey));
pass(
  "journey auto-scroll leaves the current stop clear of the pill",
  journey.card === null || (journey.cardTop > 0 && journey.cardBottom < journey.pillTop),
  JSON.stringify(journey),
);
await page.screenshot({ path: `${OUT}/03-journey-320.png` });
await ctx.close();

// ── Desktop width: sidebar unchanged, no floating pill ─────────────────────
const wide = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const dpage = await wide.newPage();
await dpage.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await mintTicket()}`, { waitUntil: "networkidle" });
await dpage.goto(`${ORIGIN}/app`, { waitUntil: "domcontentloaded" });
await dpage.waitForSelector("aside", { timeout: 45000 });
await dpage.waitForTimeout(1200);
const desktop = await dpage.evaluate(`(() => {
  const aside = document.querySelector('aside');
  const b = aside.getBoundingClientRect();
  const navLink = document.querySelector('a[aria-label="Chat with Bolo"]');
  const pill = navLink && navLink.closest('div.fixed');
  const pillVisible = pill ? getComputedStyle(pill).display !== 'none' : false;
  return { asideW: Math.round(b.width), asideH: Math.round(b.height), pillVisible, contentPadLeft: getComputedStyle(document.querySelector('aside').nextElementSibling).paddingLeft };
})()`);
console.log("desktop:", JSON.stringify(desktop));
pass("desktop sidebar still 256px wide, full height", desktop.asideW === 256 && desktop.asideH === 900, JSON.stringify(desktop));
pass("floating pill hidden at desktop width", !desktop.pillVisible);
pass("shell keeps its lg:pl-64 inset", desktop.contentPadLeft === "256px", desktop.contentPadLeft);
await dpage.screenshot({ path: `${OUT}/04-home-desktop.png` });
await wide.close();

await browser.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
