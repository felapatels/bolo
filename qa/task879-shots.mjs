// Task #879: web boarding-pass cutout ruling port. Shoots the home hero pass
// and the /journey header in light AND dark mode, and probes every small
// background-colored circle inside each ticket so "floating dot vs edge bite"
// is measured, not guessed (same check as qa/notch-probe.mjs on mobile).
//
//   CHROME_BIN=$(which chromium) node qa/task879-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/task879";
const EMAIL = "d1bm+clerk_test@example.com";
mkdirSync(OUT, { recursive: true });

async function clerkUserId(email) {
  const res = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } },
  );
  const users = await res.json();
  if (!res.ok || !users.length) throw new Error(`user lookup failed`);
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

const probeCircles = (marker) =>
  `(() => {
    const out = [];
    const t = Array.from(document.querySelectorAll("*")).find(
      (el) => el.children.length === 0 && ${marker}.test(el.textContent || ""),
    );
    if (!t) return ["ticket not found"];
    let card = t;
    while (card && !/\\bborder-dashed\\b|\\brounded-3xl\\b/.test(card.className || "")) card = card.parentElement;
    if (!card) card = t.closest("a") || t.parentElement;
    const c = card.getBoundingClientRect();
    out.push("card w=" + c.width.toFixed(0) + " h=" + c.height.toFixed(0));
    for (const el of card.querySelectorAll("div,span")) {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.width <= 26 && Math.abs(r.width - r.height) < 1 &&
          parseFloat(s.borderRadius) >= r.width / 2 - 1 &&
          s.backgroundColor !== "rgba(0, 0, 0, 0)") {
        const edge =
          r.y < c.y || r.y + r.height > c.y + c.height || r.x < c.x || r.x + r.width > c.x + c.width
            ? "STRADDLES-EDGE" : "FULLY-INSIDE";
        out.push("circle " + r.width.toFixed(0) + "px dx=" + (r.x - c.x).toFixed(0) + " dy=" + (r.y - c.y).toFixed(0) + " " + edge);
      }
    }
    if (/\\u{1F3AB}/u.test(card.textContent || "")) out.push("EMOJI STILL PRESENT");
    return out;
  })()`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const userId = await clerkUserId(EMAIL);
await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken(userId)}`, {
  waitUntil: "networkidle",
  timeout: 120000,
});
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});

for (const mode of ["light", "dark"]) {
  // home hero
  await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes("BOARDING PASS"), { timeout: 30000 });
  await page.evaluate((m) => document.documentElement.classList.toggle("dark", m === "dark"), mode);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/home-${mode}.png` });
  console.log(`== home ${mode} ==`);
  console.log((await page.evaluate(probeCircles("/^Ride the /"))).join("\n"));

  // journey header
  await page.goto(`${ORIGIN}/journey`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForFunction(() => /stations/.test(document.body.innerText), { timeout: 30000 });
  await page.evaluate((m) => document.documentElement.classList.toggle("dark", m === "dark"), mode);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/journey-${mode}.png` });
  console.log(`== journey ${mode} ==`);
  console.log((await page.evaluate(probeCircles("/stations$/"))).join("\n"));
}

await browser.close();
console.log("done");
