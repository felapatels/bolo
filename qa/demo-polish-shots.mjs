// Demo-day polish pass (P1 v2) — screenshot matrix + presentation assertions.
//
// Captures the spec's matrix: home (boarding-pass hero), /journey top and
// mid-scroll (floating nav, train avatar, zone postcards), chat (allowance
// meter area + hold-to-speak mascot), practice (mascot idle + pressed) at a
// mobile and a desktop viewport, for the entitled state. Locked/teaser-state
// journey rendering (grayscale postcards included) is already exercised by
// qa/journey-map-e2e.mjs's showroom scenarios — run that harness for those.
//
// Usage (same pattern as upgrade-paywall-shots.mjs):
//   CHROME_BIN=<chromium> E2E_USER_ID=<clerk user id> \
//   NODE_PATH=<playwright install> node qa/demo-polish-shots.mjs
// Requires CLERK_SECRET_KEY and REPLIT_DEV_DOMAIN in the environment.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/demo-polish";
mkdirSync(OUT, { recursive: true });

// Clerk sign-in tokens are SINGLE-USE — mint one per browser context.
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

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const VIEWPORTS = [
  { tag: "mobile", width: 430, height: 900 },
  { tag: "desktop", width: 1280, height: 900 },
];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(`${vp.tag} pageerror`, false, String(e).slice(0, 150)));

  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken()}`, { waitUntil: "networkidle" });
  await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});

  // ── home: boarding-pass hero ──────────────────────────────────────────────
  await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check(`${vp.tag} home hero label`, (await page.getByText(/Boarding pass/i).count()) > 0);
  check(`${vp.tag} home hero line name`, (await page.getByText(/Ride the /i).count()) > 0);
  check(`${vp.tag} home browse-by-topic`, (await page.getByText(/Browse by topic/i).count()) > 0);
  await page.screenshot({ path: `${OUT}/home-hero-${vp.tag}.png` });

  // ── journey: top + mid-scroll (nav, train, postcards) ─────────────────────
  await page.goto(`${ORIGIN}/journey`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check(`${vp.tag} journey header`, (await page.getByText(/Boarding pass/i).count()) > 0);
  check(
    `${vp.tag} journey postcards`,
    (await page.getByText(/Fare zone \d/i).count()) === 6,
    `${await page.getByText(/Fare zone \d/i).count()}/6`,
  );
  check(`${vp.tag} postcard stamps`, (await page.getByText(/^Zone$/).count()) === 6);
  await page.screenshot({ path: `${OUT}/journey-top-${vp.tag}.png` });
  await page.mouse.wheel(0, 1100);
  await page.waitForTimeout(400);
  const navPinned = await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll("div.fixed.bottom-0")).find(
      (d) => d.textContent.includes("Home") && d.textContent.includes("Games"),
    );
    // Desktop hides the mobile nav (lg:hidden) — that counts as fine there,
    // whether the element is absent or merely display:none.
    if (!nav) return window.innerWidth >= 1024 ? "desktop-hidden" : null;
    if (getComputedStyle(nav).display === "none")
      return window.innerWidth >= 1024 ? "desktop-hidden" : "hidden-on-mobile!";
    const r = nav.getBoundingClientRect();
    return Math.abs(Math.round(r.bottom) - window.innerHeight) < 3 ? "pinned" : `at ${Math.round(r.bottom)}`;
  });
  check(
    `${vp.tag} journey nav mid-scroll`,
    navPinned === "pinned" || navPinned === "desktop-hidden",
    String(navPinned),
  );
  await page.screenshot({ path: `${OUT}/journey-mid-${vp.tag}.png` });

  // ── chat: meter area + mascot affordance ──────────────────────────────────
  await page.goto(`${ORIGIN}/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  check(
    `${vp.tag} chat hold-to-speak affordance`,
    (await page.locator('button[aria-label="Hold to speak"]').count()) > 0,
  );
  // The allowance meter renders once the server reports secondsRemaining
  // (after the first turn / a greeting payload that carries it). Log state
  // rather than hard-fail: a fresh QA user legitimately has no meter yet.
  console.log(
    `  (${vp.tag} chat meter visible: ${(await page.getByText(/2 free chat minutes/i).count()) > 0})`,
  );
  await page.screenshot({ path: `${OUT}/chat-${vp.tag}.png` });

  // ── practice: mascot idle + pressed ───────────────────────────────────────
  await page.goto(`${ORIGIN}/practice/1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  check(
    `${vp.tag} practice hold-Bolo label`,
    (await page.getByText(/Hold Bolo to speak/i).count()) > 0,
  );
  await page.screenshot({ path: `${OUT}/practice-idle-${vp.tag}.png` });
  const belly = page.locator('[aria-label="Hold to speak"]');
  if (await belly.count()) {
    const bb = await belly.boundingBox();
    if (bb) {
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/practice-pressed-${vp.tag}.png` });
      await page.mouse.up();
    }
  }

  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
