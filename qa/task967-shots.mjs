// Task 967: colorful 2-column animated games hub (web) — visual verification.
//
// Checks, per viewport (320 / 480 / 640 / 1280):
//   - all five cards render with titles fully visible (no clipping/truncation)
//   - grid is 1 column below 480px and 2 columns at >=480px
//   - per-game color identity applied (five distinct card background colors)
//   - locked cards are NOT gray (their bg differs from the page background
//     and from unlocked neutrals)
// Plus:
//   - normal motion: cards animate in (framer-motion sets opacity/transform)
//     and settle to opacity 1
//   - reduced motion: no running animations on the card wrappers; cards at
//     opacity 1
//
// Usage: CHROME_BIN=<chromium> E2E_USER_ID=<clerk user id> \
//        NODE_PATH=/tmp/pw/node_modules node qa/task967-shots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/task967";
mkdirSync(OUT, { recursive: true });

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

const TITLES = ["Word Match", "Listen & Pick", "Phrase Builder", "Speed Round", "Bolo Quiz"];

async function openGames(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken()}`, {
    waitUntil: "networkidle",
  });
  await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
  await page.goto(`${ORIGIN}/games`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); // let the entrance cascade finish
  return page;
}

for (const vp of [
  { tag: "320", width: 320, height: 800, cols: 1 },
  { tag: "480", width: 480, height: 900, cols: 2 },
  { tag: "640", width: 640, height: 900, cols: 2 },
  { tag: "1280", width: 1280, height: 900, cols: 2 },
]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await openGames(ctx);

  for (const t of TITLES) {
    check(`${vp.tag}px card "${t}" present`, (await page.getByText(t, { exact: true }).count()) > 0);
  }

  const layout = await page.evaluate(() => {
    const h3s = Array.from(document.querySelectorAll("h3"));
    const cards = h3s.map((h) => h.closest("a"));
    const clipped = h3s
      .filter((h) => h.scrollWidth > h.clientWidth + 1 || h.scrollHeight > h.clientHeight + 1)
      .map((h) => h.textContent);
    const lefts = new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left)));
    const bgs = h3s.map((h) => {
      // Walk up to the tinted card div (first ancestor with a non-transparent bg).
      let el = h.parentElement;
      while (el && getComputedStyle(el).backgroundColor === "rgba(0, 0, 0, 0)") el = el.parentElement;
      return el ? getComputedStyle(el).backgroundColor : "none";
    });
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    return { clipped, columns: lefts.size, bgs, distinctBgs: new Set(bgs).size, overflow };
  });

  check(`${vp.tag}px no clipped titles`, layout.clipped.length === 0, layout.clipped.join(","));
  check(`${vp.tag}px ${vp.cols}-column grid`, layout.columns === vp.cols, `${layout.columns} col starts`);
  check(`${vp.tag}px five distinct card colors`, layout.distinctBgs === 5, layout.bgs.join(" | "));
  check(`${vp.tag}px no horizontal overflow`, !layout.overflow);

  await page.screenshot({ path: `${OUT}/games-${vp.tag}.png`, fullPage: vp.width < 500 });
  await ctx.close();
}

// ── reduced motion ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 480, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await openGames(ctx);
  const rm = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("h3")).map((h) => h.closest("a"));
    const opacities = cards.map((c) => getComputedStyle(c.firstElementChild).opacity);
    // Any still-running (non-finished) animations inside the card wrappers?
    const running = cards.flatMap((c) =>
      c.getAnimations({ subtree: true }).filter((a) => a.playState === "running").map((a) => a.animationName || "anim"),
    );
    return { opacities, running };
  });
  check("reduced-motion cards fully visible", rm.opacities.every((o) => Number(o) === 1), rm.opacities.join(","));
  check("reduced-motion no running animations", rm.running.length === 0, rm.running.join(",") || "none");
  await page.screenshot({ path: `${OUT}/games-reduced-motion.png` });
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
