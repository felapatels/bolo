// Task 903 — instant band audio, streamed feedback (live-browser verification).
//
// Drives a real signed-in practice attempt in headless chromium (getUserMedia
// shimmed with a WebAudio oscillator; see qa/practice-mascot-probe.mjs) and
// asserts, from an in-page HTMLAudioElement.play() log:
//   1. a bundled band clip (sounds/bands/<band>.mp3) plays when the result
//      lands — within a tight window of the pronunciation response, with no
//      TTS round-trip in between;
//   2. the synthesized feedback sentence (data:audio/... src) plays AFTER the
//      band clip, not instead of it;
//   3. the result card renders regardless of audio (it's visible before or
//      irrespective of the feedback audio resolving).
// Also logs the /openai/tts response timing so the eval-time server prewarm
// can be cross-checked in the api-server workflow logs (hit:"pending-prewarm").
//
//   CHROME_BIN=$(which chromium) NODE_PATH=/tmp/pw/node_modules node qa/task903-band-audio-probe.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const SK = process.env.CLERK_SECRET_KEY;
const OUT = "qa/shots/task903";
mkdirSync(OUT, { recursive: true });
const email = `bolo-903-bandaudio+clerk_test@example.com`;

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
  password: `B903!${Math.random().toString(36).slice(2)}Zz`,
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

// getUserMedia shim + audio playback logger.
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
    // Log every HTMLMediaElement.play() with a timestamp (src truncated).
    window.__audioLog = [];
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.__audioLog.push({ t: performance.now(), src: String(this.src).slice(0, 200) });
      return origPlay.apply(this, arguments);
    };
  })();
`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };

try {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(INIT);

  // Network timing: when did the pronunciation eval and the feedback TTS land?
  const netLog = [];
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/openai/pronunciation") || url.includes("/openai/tts") || url.includes("/sounds/bands/")) {
      netLog.push({ t: Date.now(), status: res.status(), url: url.slice(url.indexOf("/openai") >= 0 ? url.indexOf("/openai") : url.indexOf("/sounds")) });
    }
  });

  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await mintToken()}`, { waitUntil: "networkidle" });
  await page.goto(`${ORIGIN}/practice/1`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Hold Bolo to speak|Hold to record/i).first().waitFor({ timeout: 45000 });
  await page.waitForTimeout(1500);

  // Record: hold the bird, speak (oscillator), release.
  const belly = await page.locator('[aria-label="Hold to speak"]').first().boundingBox();
  check("hold zone present", !!belly);
  await page.mouse.move(belly.x + belly.width / 2, belly.y + belly.height / 2);
  await page.mouse.down();
  await page.locator('[aria-label="Release to submit"]').waitFor({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const tRelease = Date.now();
  await page.mouse.up();

  // The result landing is signalled by the band clip play itself (the
  // button-visibility wait is flaky under the first-attempt badge overlay).
  const bandPlayed = await page
    .waitForFunction(() => window.__audioLog?.some((a) => a.src.includes("/sounds/bands/")), null, { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  const tResult = Date.now();
  if (!bandPlayed) {
    await page.screenshot({ path: `${OUT}/timeout.png` });
    console.log("page text:", (await page.evaluate(() => document.body.innerText)).slice(0, 800));
  }

  // A fresh user's first attempt pops the "First Words" badge overlay —
  // dismiss it so the result-card buttons are visible.
  const badge = page.getByText(/BADGE UNLOCKED/i).first();
  if (await badge.waitFor({ timeout: 5000 }).then(() => true).catch(() => false)) {
    await page.mouse.click(215, 100);
    await badge.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  }

  // Result card: Try again / Next phrase buttons appear even if audio fails.
  const cardVisible = await page
    .getByRole("button", { name: /Try again|Next phrase/ })
    .first()
    .waitFor({ timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check("result card rendered", cardVisible, `${tResult - tRelease}ms after release (band-play signal)`);
  await page.screenshot({ path: `${OUT}/result.png` });

  // Give the feedback sentence time to follow the clip, then read the logs.
  await page.waitForTimeout(9000);
  const audioLog = await page.evaluate(() => window.__audioLog);
  console.log("audio log:", JSON.stringify(audioLog, null, 1));
  console.log("net log:", JSON.stringify(netLog.map((n) => ({ ...n, t: n.t - tRelease })), null, 1));

  const bandPlay = audioLog.find((a) => a.src.includes("/sounds/bands/"));
  // The coach phrase at mount is ALSO a data:audio play — the feedback
  // sentence is the data:audio play that comes after the band clip.
  const feedbackPlay = audioLog.find((a) => a.src.startsWith("data:audio/") && bandPlay && a.t > bandPlay.t);
  check("band clip played on result", !!bandPlay, bandPlay?.src);
  check(
    "feedback sentence played AFTER the band clip",
    !!feedbackPlay,
    feedbackPlay ? `${(feedbackPlay.t - bandPlay.t).toFixed(0)}ms after band clip started` : "none",
  );

  // Instant = the band clip started within a tight window of the eval
  // response (i.e. no TTS synthesis round-trip in between). The eval lands ~
  // when the result card renders; allow rendering + effect + play() overhead.
  const evalRes = netLog.find((n) => n.url.includes("/openai/pronunciation"));
  if (evalRes && bandPlay) {
    // Convert: audioLog.t is page performance.now(); compare via the result
    // render wall-clock instead — band play must be within 1.5s of card render.
    const pageNow = await page.evaluate(() => performance.now());
    const bandWallClock = Date.now() - (pageNow - bandPlay.t);
    const delta = bandWallClock - evalRes.t;
    check("band clip started within 1500ms of the eval response (no synthesis wait)", delta < 1500, `${delta.toFixed(0)}ms`);
  }

  // The /openai/tts feedback request should have joined the server-side
  // eval-time prewarm (verify hit:"pending-prewarm" in api-server logs).
  const ttsRes = netLog.find((n) => n.url.includes("/openai/tts"));
  check("feedback TTS request completed", !!ttsRes && ttsRes.status === 200, ttsRes ? `status ${ttsRes.status}, ${ttsRes.t - tRelease}ms after release` : "none");

  await ctx.close();
} finally {
  await browser.close();
  const del = await bapi("DELETE", `/users/${userId}`);
  console.log("clerk user cleanup:", del.status);
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\nRESULT: FAIL (${failed.length})` : "\nRESULT: PASS (all checks)");
process.exit(failed.length ? 1 : 0);
