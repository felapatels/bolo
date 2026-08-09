// Games hub preview vignettes (Task: animated game card previews).
//
// Verifies the /games hub after the static icon tiles were replaced with
// looping CSS preview vignettes:
//   - all five cards render (titles + vignettes), Free/Plus pills intact
//   - the vignette animations are actually running (CSS animations attached)
//   - loop phases are staggered (per-card --gv-delay differs)
//   - reduced motion: no infinite animation keeps running (each vignette
//     settles to its base/static frame)
//   - dark mode + mobile/desktop screenshots for eyeballing
//
// Usage (same pattern as demo-polish-shots.mjs):
//   CHROME_BIN=<chromium> E2E_USER_ID=<clerk user id> \
//   NODE_PATH=<playwright install> node qa/games-preview-shots.mjs
// Requires CLERK_SECRET_KEY and REPLIT_DEV_DOMAIN in the environment.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/games-previews";
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

const TITLES = ["Word Match", "Listen & Pick", "Phrase Builder", "Speed Round", "Bolo Quiz"];

async function openGames(ctx) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check("pageerror", false, String(e).slice(0, 150)));
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken()}`, {
    waitUntil: "networkidle",
  });
  await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
  await page.goto(`${ORIGIN}/games`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  return page;
}

// ── normal motion: mobile + desktop ─────────────────────────────────────────
for (const vp of [
  { tag: "mobile", width: 430, height: 900 },
  { tag: "desktop", width: 1280, height: 900 },
]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await openGames(ctx);

  for (const t of TITLES) {
    check(`${vp.tag} card "${t}"`, (await page.getByText(t, { exact: true }).count()) > 0);
  }
  const vignettes = await page.locator(".gv").count();
  check(`${vp.tag} five vignettes`, vignettes === 5, `${vignettes}/5`);

  const anim = await page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll(".gv"));
    const perCard = roots.map((r) => {
      const anims = r.getAnimations({ subtree: true });
      return {
        delay: getComputedStyle(r).getPropertyValue("--gv-delay").trim(),
        running: anims.filter((a) => a.playState === "running").length,
      };
    });
    return {
      perCard,
      distinctDelays: new Set(perCard.map((c) => c.delay)).size,
      allRunning: perCard.every((c) => c.running > 0),
    };
  });
  check(`${vp.tag} animations running on every card`, anim.allRunning, JSON.stringify(anim.perCard));
  check(`${vp.tag} staggered delays`, anim.distinctDelays === 5, `${anim.distinctDelays} distinct`);

  await page.screenshot({ path: `${OUT}/games-${vp.tag}.png` });
  // A second shot mid-cycle so a human diff shows the loops actually move.
  await page.waitForTimeout(2100);
  await page.screenshot({ path: `${OUT}/games-${vp.tag}-later.png` });

  // Dark mode is a .dark class toggle in this app.
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/games-${vp.tag}-dark.png` });
  await ctx.close();
}

// ── reduced motion: everything settles to a static frame ────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await openGames(ctx);
  const rm = await page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll(".gv"));
    const running = roots.flatMap((r) =>
      r
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === "running")
        .map((a) => a.animationName || a.id || "anim"),
    );
    return { vignettes: roots.length, running };
  });
  check("reduced-motion five vignettes", rm.vignettes === 5, `${rm.vignettes}/5`);
  check(
    "reduced-motion no looping animations",
    rm.running.length === 0,
    rm.running.join(",") || "none running",
  );
  await page.screenshot({ path: `${OUT}/games-reduced-motion.png` });
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
