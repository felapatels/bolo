// Task 1003, coach speaks the English meaning after each phrase (web).
// Live-browser verification in headless chromium with autoplay allowed:
//   1. one phrase play yields "phrase clip, pause, English meaning segment":
//      two data:audio plays, the second starting after the first ended, with
//      an English-language /openai/tts request ("means <translation>" text);
//   2. the Meaning pill toggle turns the segment off for the very next play;
//   3. barge-in during the meaning segment pauses it and starts recording.
//
//   CHROME_BIN=$(which chromium) NODE_PATH=/tmp/pw/node_modules node qa/task1003-meaning-probe.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const SK = process.env.CLERK_SECRET_KEY;
const OUT = "qa/shots/task1003";
mkdirSync(OUT, { recursive: true });
const email = `bolo-1003-meaning+clerk_test@example.com`;

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
  password: `B1003!${Math.random().toString(36).slice(2)}Zz`,
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

// getUserMedia shim + audio lifecycle logger (play / ended / pause, with
// truncated srcs so data URIs stay readable in output).
const INIT = `
  (() => {
    const md = navigator.mediaDevices;
    if (md) {
      md.getUserMedia = () => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.4;
        const dst = ctx.createMediaStreamDestination();
        osc.connect(gain); gain.connect(dst);
        osc.frequency.value = 220;
        osc.start();
        return Promise.resolve(dst.stream);
      };
      if (navigator.permissions?.query) {
        const orig = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = (d) =>
          d && d.name === "microphone"
            ? Promise.resolve({ state: "granted", onchange: null, addEventListener() {}, removeEventListener() {} })
            : orig(d);
      }
    }
    window.__audioLog = [];
    const log = (ev, el) => window.__audioLog.push({ ev, t: performance.now(), src: String(el.src).slice(0, 60) });
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      log("play", this);
      this.addEventListener("ended", () => log("ended", this), { once: true });
      return origPlay.apply(this, arguments);
    };
    const origPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function () {
      log("pause", this);
      return origPause.apply(this, arguments);
    };
  })();
`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` : ${detail}` : ""}`); };

// data:audio events only (band clips and cues use /sounds/ paths).
const dataAudio = (log) => log.filter((a) => a.src.startsWith("data:audio"));

try {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(INIT);

  // Capture /openai/tts request bodies to verify the English segment's
  // synthesis identity (languageName English, "means ..." text).
  const ttsBodies = [];
  page.on("request", (req) => {
    if (req.url().includes("/openai/tts") && req.method() === "POST") {
      try { ttsBodies.push(JSON.parse(req.postData() ?? "{}")); } catch { /* ignore */ }
    }
  });

  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await mintToken()}`, { waitUntil: "networkidle" });
  await page.goto(`${ORIGIN}/practice/1`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Hold Bolo to speak|Hold to record/i).first().waitFor({ timeout: 45000 });

  // ── 1. phrase, pause, meaning ────────────────────────────────────────────
  // Wait for the full two-segment chain: play, ended, play, ended.
  const chainDone = await page
    .waitForFunction(
      () => {
        const d = (window.__audioLog || []).filter((a) => a.src.startsWith("data:audio"));
        return d.filter((a) => a.ev === "ended").length >= 2;
      },
      null,
      { timeout: 45000 },
    )
    .then(() => true)
    .catch(() => false);
  const log1 = dataAudio(await page.evaluate(() => window.__audioLog));
  console.log("segment log:", JSON.stringify(log1, null, 1));
  check("two audio segments played to completion", chainDone);

  const phraseEnded = log1.find((a) => a.ev === "ended");
  const meaningPlay = log1.find((a) => a.ev === "play" && phraseEnded && a.t > phraseEnded.t);
  const gap = meaningPlay && phraseEnded ? meaningPlay.t - phraseEnded.t : NaN;
  check("meaning segment starts after the phrase clip ends", !!meaningPlay, `gap ${gap.toFixed(0)}ms`);
  check("gap between segments is roughly the 400ms beat", gap >= 300 && gap < 2500, `${gap.toFixed(0)}ms`);

  const englishTts = ttsBodies.find((b) => b.languageName === "English");
  check(
    "English TTS request carries means + translation",
    !!englishTts && /^means /.test(englishTts.text ?? "") && englishTts.languageCode === "en",
    JSON.stringify(englishTts),
  );
  await page.screenshot({ path: `${OUT}/after-chain.png` });

  // ── 2. toggle OFF applies to the next play ───────────────────────────────
  const pill = page.getByRole("button", { name: /meaning/i }).first();
  check("Meaning pill present and pressed by default", (await pill.getAttribute("aria-pressed")) === "true");
  await pill.click();
  check("Meaning pill unpressed after tap", (await pill.getAttribute("aria-pressed")) === "false");

  const countBefore = (await page.evaluate(() => window.__audioLog)).filter((a) => a.ev === "play" && a.src.startsWith("data:audio")).length;
  await page.getByLabel("Hear the phrase again").first().click();
  // Phrase replays (from the session cache): exactly one new data:audio play,
  // then silence; give the old chain's timing room to prove nothing follows.
  await page.waitForFunction(
    (n) => (window.__audioLog || []).filter((a) => a.ev === "play" && a.src.startsWith("data:audio")).length >= n + 1,
    countBefore,
    { timeout: 20000 },
  );
  await page.waitForTimeout(4000);
  const countAfterOff = (await page.evaluate(() => window.__audioLog)).filter((a) => a.ev === "play" && a.src.startsWith("data:audio")).length;
  check("toggle OFF: replay yields exactly one segment (phrase only)", countAfterOff === countBefore + 1, `${countAfterOff - countBefore} new plays`);
  const englishCallsAfterOff = ttsBodies.filter((b) => b.languageName === "English").length;
  check("toggle OFF and session cache: still exactly one English TTS request", englishCallsAfterOff === 1, `${englishCallsAfterOff}`);

  // ── 3. barge-in during the meaning segment ───────────────────────────────
  await pill.click();
  check("Meaning pill pressed again", (await pill.getAttribute("aria-pressed")) === "true");
  const markBase = (await page.evaluate(() => window.__audioLog)).length;
  await page.getByLabel("Hear the phrase again").first().click();
  // Wait for the SECOND new play (the meaning segment) of this replay.
  await page.waitForFunction(
    (n) => (window.__audioLog || []).slice(n).filter((a) => a.ev === "play" && a.src.startsWith("data:audio")).length >= 2,
    markBase,
    { timeout: 20000 },
  );
  // Hold to record while the meaning is speaking.
  const belly = await page.locator('[aria-label="Hold to speak"]').first().boundingBox();
  check("hold zone present during meaning playback", !!belly);
  await page.mouse.move(belly.x + belly.width / 2, belly.y + belly.height / 2);
  await page.mouse.down();
  const recording = await page
    .locator('[aria-label="Release to submit"]')
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check("hold during meaning starts recording on the same gesture", recording);
  const tail = (await page.evaluate(() => window.__audioLog)).slice(markBase);
  const meaningPaused = tail.some((a) => a.ev === "pause" && a.src.startsWith("data:audio"));
  check("meaning segment paused by the barge-in", meaningPaused, JSON.stringify(tail.slice(-4)));
  await page.waitForTimeout(800);
  await page.mouse.up();
  // A fresh user's first attempt pops the badge overlay; dismiss it so the
  // result-card buttons are visible.
  const badge = page.getByText(/BADGE UNLOCKED/i).first();
  if (await badge.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) {
    await page.mouse.click(215, 100);
    await badge.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  }
  // The attempt evaluates as normal, and no coach-audio failure card appears.
  const resultOrIdle = await page
    .getByRole("button", { name: /Try again|Next phrase|Retry|^Next/ })
    .first()
    .waitFor({ timeout: 45000 })
    .then(() => true)
    .catch(() => false);
  check("recording after barge-in evaluates to a result card", resultOrIdle);
  const failCard = await page.getByText(/The announcer's mic cut out/).count();
  check("no coach audio failure card anywhere in the run", failCard === 0);
  await page.screenshot({ path: `${OUT}/after-barge-in.png` });

  await ctx.close();
} finally {
  await browser.close();
  const del = await bapi("DELETE", `/users/${userId}`);
  console.log("clerk user cleanup:", del.status);
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\nRESULT: FAIL (${failed.length})` : "\nRESULT: PASS (all checks)");
process.exit(failed.length ? 1 : 0);
