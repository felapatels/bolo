// Task #984: recorded tear SFX replaces synthesis (web).
// Real-browser probe: sign in, land on home, verify
//   (1) preloadTearAudio fetched + decoded the recorded clip at mount
//       (decodeAudioData resolves with ~0.985s mono 44.1kHz buffer),
//   (2) tapping the boarding pass starts an AudioBufferSourceNode whose
//       buffer IS the decoded clip, routed through a GainNode at
//       TEAR_SFX_GAIN, with zero fetch after the tap,
//   (3) the tear animation classes still land and navigation still fires.
//
//   CHROME_BIN=$(which chromium) node qa/task984-tear-sfx-probe.mjs
import { chromium } from "playwright-core";
const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const EMAIL = "d1bm+clerk_test@example.com";
async function clerkUserId(email) {
  const res = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } },
  );
  const users = await res.json();
  if (!res.ok || !users.length) throw new Error("user lookup failed");
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
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
const page = await ctx.newPage();
// Instrument Web Audio BEFORE any app code runs.
await page.addInitScript(() => {
  const probe = { decodes: [], starts: [], gains: [], fetches: [] };
  window.__tearProbe = probe;
  const origFetch = window.fetch.bind(window);
  window.fetch = (...args) => {
    const url = String(args[0]);
    if (url.includes("tear-sfx"))
      probe.fetches.push({ url, t: performance.now() });
    return origFetch(...args);
  };
  const Ctor = window.AudioContext;
  const origDecode = Ctor.prototype.decodeAudioData;
  Ctor.prototype.decodeAudioData = function (...args) {
    const p = origDecode.apply(this, args);
    Promise.resolve(p).then(
      (buf) =>
        probe.decodes.push({
          duration: buf.duration,
          channels: buf.numberOfChannels,
          sampleRate: buf.sampleRate,
          t: performance.now(),
        }),
      (e) => probe.decodes.push({ error: String(e), t: performance.now() }),
    );
    return p;
  };
  const origCreateSource = Ctor.prototype.createBufferSource;
  Ctor.prototype.createBufferSource = function (...args) {
    const src = origCreateSource.apply(this, args);
    const origStart = src.start.bind(src);
    src.start = (...a) => {
      probe.starts.push({
        duration: src.buffer ? src.buffer.duration : null,
        ctxState: this.state,
        t: performance.now(),
      });
      return origStart(...a);
    };
    return src;
  };
  const origCreateGain = Ctor.prototype.createGain;
  Ctor.prototype.createGain = function (...args) {
    const g = origCreateGain.apply(this, args);
    probe.gains.push(g);
    return g;
  };
});
const userId = await clerkUserId(EMAIL);
await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken(userId)}`, {
  waitUntil: "networkidle",
  timeout: 120000,
});
await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle", timeout: 60000 });
// Preload happens at home mount; give the fetch+decode a beat.
await page.waitForTimeout(1500);
const preloadState = await page.evaluate(() => ({
  fetches: window.__tearProbe.fetches,
  decodes: window.__tearProbe.decodes,
}));
console.log("PRELOAD:", JSON.stringify(preloadState, null, 2));
// Tap the boarding pass (the /journey link with the boarding-pass h2).
const clicked = await page.evaluate(() => {
  const pass = Array.from(
    document.querySelectorAll('a[href="/journey"]'),
  ).find((a) => a.querySelector("h2"));
  if (!pass) return false;
  pass.click();
  return true;
});
if (!clicked) throw new Error("boarding pass not found");
await page.waitForTimeout(300);
const afterTap = await page.evaluate(() => ({
  starts: window.__tearProbe.starts,
  fetchCount: window.__tearProbe.fetches.length,
  gainValues: window.__tearProbe.gains.map((g) => g.gain.value),
  tearing: !!document.querySelector(".animate-stub-tear"),
}));
console.log("AFTER TAP:", JSON.stringify(afterTap, null, 2));
await page.waitForTimeout(700);
console.log("URL AFTER TEAR:", page.url());
const start = afterTap.starts[0];
const ok =
  preloadState.fetches.length === 1 &&
  preloadState.decodes.length === 1 &&
  Math.abs((preloadState.decodes[0].duration ?? 0) - 0.985) < 0.02 &&
  afterTap.starts.length === 1 &&
  Math.abs((start.duration ?? 0) - 0.985) < 0.02 &&
  afterTap.fetchCount === 1 && // no fetch at tap time
  afterTap.gainValues.some((v) => Math.abs(v - 0.4) < 0.001) &&
  afterTap.tearing &&
  page.url().includes("/journey");
console.log(ok ? "PROBE PASS" : "PROBE FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
