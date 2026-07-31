// Task #919 verification: the review upsell card (UpgradeCard) reflow, the
// other home cards' overflow audit, and the badge-card -> /progress return
// path, at three viewport widths.
//
//   CHROME_BIN=$(which chromium) node qa/task919-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/task919";
const EMAIL = "d1bm+clerk_test@example.com";
mkdirSync(OUT, { recursive: true });

async function clerkUserId(email) {
  const res = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } },
  );
  const users = await res.json();
  if (!res.ok || !users.length) throw new Error(`user lookup failed: ${JSON.stringify(users).slice(0, 200)}`);
  return users[0].id;
}

async function signInToken(userId) {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId }),
  });
  const tk = await res.json();
  if (!res.ok) throw new Error(`sign-in token: ${JSON.stringify(tk)}`);
  return tk.token;
}

const WIDTHS = [
  { name: "mobile", width: 360, height: 800 },
  { name: "intermediate", width: 768, height: 900 },
  { name: "desktop", width: 1280, height: 900 },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

const userId = await clerkUserId(EMAIL);
await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken(userId)}`, {
  waitUntil: "networkidle",
  timeout: 120000,
});
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});

// Measurement helpers evaluated in-page: page-level horizontal overflow, plus
// per-card containment and the upsell title/pill collision check.
const measure = () => {
  const vw = document.documentElement.clientWidth;
  const out = {
    vw,
    docScrollWidth: document.documentElement.scrollWidth,
    overflows: document.documentElement.scrollWidth > vw + 1,
    cards: {},
    upsell: null,
  };
  const within = (r, c) => r.left >= c.left - 1 && r.right <= c.right + 1;
  const overlap = (a, b) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  const findCard = (label, el) => {
    if (!el) { out.cards[label] = "ABSENT"; return; }
    const r = el.getBoundingClientRect();
    out.cards[label] = {
      right: Math.round(r.right),
      clipsViewport: r.right > vw + 1 || r.left < -1,
      innerOverflow: el.scrollWidth > el.clientWidth + 2,
    };
  };

  const byText = (txt, sel = "a,section,div") =>
    [...document.querySelectorAll(sel)].find(
      (e) => e.textContent && e.textContent.includes(txt),
    );

  // Upsell card: the UpgradeCard whose title is the review upsell.
  const pill = [...document.querySelectorAll("span")].find(
    (s) => s.textContent.trim() === "All-Access" && s.className.includes("shrink-0"),
  );
  if (pill) {
    const card = pill.closest("a");
    const title = card && card.querySelector("h3");
    if (card && title) {
      const cr = card.getBoundingClientRect();
      const pr = pill.getBoundingClientRect();
      const tr = title.getBoundingClientRect();
      const titleStyle = getComputedStyle(title);
      const lineHeight = parseFloat(titleStyle.lineHeight) || 20;
      const lines = Math.round(tr.height / lineHeight);
      out.upsell = {
        cardRight: Math.round(cr.right),
        pillWithinCard: within(pr, cr),
        pillOverlapsTitle: overlap(pr, tr),
        titleLines: lines,
        titleWords: title.textContent.trim().split(/\s+/).length,
        titleWidth: Math.round(tr.width),
        pillBelowTitleTop: pr.top >= tr.top - 1,
      };
    }
  }

  // The other home cards (audit): stats banner, recent plays, chat shortcut,
  // Phrasebook door, boarding pass.
  findCard("statsBanner", document.querySelector(".bg-gradient-to-br"));
  findCard("phrasebookDoor", document.querySelector('section[aria-label="Phrasebook"]'));
  findCard("chatShortcut", byText("Chat with Bolo", "a"));
  const recentHeader = [...document.querySelectorAll("h2")].find(
    (e) => e.textContent.trim() === "Recent plays",
  );
  findCard("recentPlays", recentHeader ? recentHeader.parentElement : null);
  findCard("boardingPass", byText("Boarding pass", "a"));
  findCard("badgeCard", byText("Latest badge", "a"));
  return out;
};

for (const { name, width, height } of WIDTHS) {
  await page.setViewportSize({ width, height });
  await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle", timeout: 60000 });
  await page
    .waitForFunction(() => document.body.innerText.includes("Phrasebook"), { timeout: 30000 })
    .catch(() => {});
  await page.waitForTimeout(2500); // entrance springs settle
  const report = await page.evaluate(measure);
  console.log(`\n=== /app @ ${name} (${width}px) ===`);
  console.log(JSON.stringify(report, null, 1));
  await page.screenshot({ path: `${OUT}/home-${name}.png`, fullPage: true });
}

// Badge-card return path, live: click the badge card (if present), land on
// /progress, confirm the return affordance (mobile bottom nav Progress active
// + Home tab, desktop sidebar) is visible, then use it to return.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2000);
const badgeCard = page.locator('a[href="/progress"]', { hasText: "Latest badge" });
if (await badgeCard.count()) {
  await badgeCard.first().click();
  await page.waitForURL(/\/progress/, { timeout: 15000 });
  await page.waitForTimeout(2000);
  const nav = await page.evaluate(() => {
    const links = [...document.querySelectorAll("a")].filter((a) => {
      const r = a.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const home = links.find((a) => a.textContent.trim() === "Home");
    const progress = links.find((a) => a.textContent.trim() === "Progress");
    return {
      homeTabVisible: !!home,
      progressTabVisible: !!progress,
      progressActive: progress ? progress.className.includes("text-secondary") : false,
    };
  });
  console.log("\n=== badge card -> /progress return path (mobile) ===");
  console.log(JSON.stringify(nav));
  await page.screenshot({ path: `${OUT}/progress-mobile.png` });
  // The desktop sidebar's Home link exists in the DOM but is hidden at
  // mobile width; click the visible bottom-nav one.
  await page.locator("a:visible", { hasText: /^Home$/ }).first().click();
  await page.waitForURL(/\/app/, { timeout: 15000 });
  console.log("Home tab returned to:", page.url());
} else {
  console.log("\nNo badge card on this account (no earned badges); return path verified on /progress directly.");
  await page.goto(`${ORIGIN}/progress`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/progress-mobile.png` });
  const nav = await page.evaluate(() => {
    const links = [...document.querySelectorAll("a")].filter((a) => a.getBoundingClientRect().width > 0);
    return {
      homeTabVisible: links.some((a) => a.textContent.trim() === "Home"),
      progressTabVisible: links.some((a) => a.textContent.trim() === "Progress"),
    };
  });
  console.log(JSON.stringify(nav));
}

await browser.close();
console.log("DONE");
