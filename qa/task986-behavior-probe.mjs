// Task 986: energy-model behavior checks in a real browser.
//   - free-card vignettes idle at the slow tempo (computed duration =
//     authored * 2.2) and wake to authored duration on hover
//   - locked-card vignettes are paused until their card is hovered
//   - off-screen vignettes pause (scroll the grid out of view)
//
// Usage: CHROME_BIN=$(which chromium) E2E_USER_ID=<clerk user id> \
//        node qa/task986-behavior-probe.mjs
import { chromium } from "playwright-core";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;

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
const ctx = await browser.newContext({ viewport: { width: 480, height: 900 } });
const page = await ctx.newPage();

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken()}`, {
  waitUntil: "networkidle",
});
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
await page.goto(`${ORIGIN}/games`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const vignetteState = (id) =>
  page.evaluate((tid) => {
    const gv = document.querySelector(`[data-testid="game-preview-${tid}"]`);
    if (!gv) return null;
    const anims = gv.getAnimations({ subtree: true });
    const spans = Array.from(gv.querySelectorAll("span, circle"));
    const durations = spans
      .map((s) => getComputedStyle(s).animationDuration)
      .filter((d) => d && d !== "0s");
    return {
      running: anims.filter((a) => a.playState === "running").length,
      paused: anims.filter((a) => a.playState === "paused").length,
      durations: [...new Set(durations)],
    };
  }, id);

// Free card idles slow (word-match authored 4.8s -> 10.56s at tempo 2.2).
{
  const s = await vignetteState("word-match");
  check(
    "free vignette idle-loops at slow tempo",
    s.running > 0 && s.durations.some((d) => Math.abs(parseFloat(d) - 10.56) < 0.05),
    JSON.stringify(s),
  );
}

// Locked card is paused until hover.
{
  const s = await vignetteState("phrase-builder");
  check("locked vignette paused before hover", s.paused > 0 && s.running === 0, JSON.stringify(s));

  await page.getByText("Phrase Builder").hover();
  await page.waitForTimeout(200);
  const hovered = await vignetteState("phrase-builder");
  check(
    "locked vignette plays on hover at full energy",
    hovered.running > 0 && hovered.durations.some((d) => Math.abs(parseFloat(d) - 5.2) < 0.05),
    JSON.stringify(hovered),
  );
}

// Free card wakes to authored duration on hover.
{
  await page.getByText("Word Match").hover();
  await page.waitForTimeout(200);
  const s = await vignetteState("word-match");
  check(
    "free vignette wakes to authored 4.8s on hover",
    s.running > 0 && s.durations.some((d) => Math.abs(parseFloat(d) - 4.8) < 0.05),
    JSON.stringify(s),
  );
  await page.mouse.move(5, 5); // unhover
}

// Off-screen pause: scroll the grid far out of view (the page is short, so
// force a tall spacer, scroll down, and let the observer fire).
{
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "3000px";
    spacer.id = "probe-spacer";
    document.body.appendChild(spacer);
    window.scrollTo(0, 2500);
  });
  await page.waitForTimeout(500);
  const s = await vignetteState("word-match");
  const offscreenClass = await page.evaluate(
    () =>
      document
        .querySelector('[data-testid="game-preview-word-match"]')
        ?.classList.contains("gv--offscreen") ?? false,
  );
  check(
    "off-screen vignette pauses",
    offscreenClass && s.running === 0,
    `offscreenClass=${offscreenClass} ${JSON.stringify(s)}`,
  );
  await page.evaluate(() => {
    document.getElementById("probe-spacer")?.remove();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
  const back = await vignetteState("word-match");
  check("scrolled back: vignette resumes", back.running > 0, JSON.stringify(back));
}

await browser.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
