// Perfect band 93 -> 91 verification (live-browser, dev).
//
// Drives a real signed-in practice attempt in headless chromium. The mic is
// shimmed with a WebAudio MediaStreamDestination and the coach's own phrase
// clip (the first data:audio play at mount) is piped into it, so STT hears a
// clean rendition of the target. That lands the sim = 1.0 fast path, the
// honesty cap holds the score at 92, and at the new 91 threshold the attempt
// must render: band 'perfect' in the eval JSON, the "Peak 🗿" flash, and the
// perfect-only confetti overlay.
//
//   cd qa && CHROME_BIN=$(which chromium) node perfect-band-92-probe.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const SK = process.env.CLERK_SECRET_KEY;
const OUT = "shots/perfect-band";
mkdirSync(OUT, { recursive: true });
const email = `bolo-band91-probe+clerk_test@example.com`;

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
  password: `B91!${Math.random().toString(36).slice(2)}Zz`,
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

// getUserMedia shim: every call returns a fresh MediaStreamDestination; all
// destinations are kept so __playIntoMic can feed whichever one the recorder
// actually captured (prewarm may grab an earlier stream than the recording).
const INIT = `
  (() => {
    window.__micDsts = [];
    const md = navigator.mediaDevices;
    if (md) {
      md.getUserMedia = () => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const dst = ctx.createMediaStreamDestination();
        window.__micDsts.push({ ctx, dst });
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
    // Decode an audio URL (data: ok) and play it into EVERY live mic
    // destination. Resolves with the clip duration in ms.
    window.__playIntoMic = async (url) => {
      const buf = await (await fetch(url)).arrayBuffer();
      let durationMs = 0;
      for (const { ctx, dst } of window.__micDsts) {
        if (ctx.state === "suspended") await ctx.resume().catch(() => {});
        const audio = await ctx.decodeAudioData(buf.slice(0));
        durationMs = Math.max(durationMs, audio.duration * 1000);
        const src = ctx.createBufferSource();
        src.buffer = audio;
        src.connect(dst);
        src.start();
      }
      return durationMs;
    };
    window.__audioLog = [];
    window.__mediaEls = [];
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.__audioLog.push({ t: performance.now(), src: String(this.src).slice(0, 100) });
      window.__mediaEls.push(this); // coach clip is a detached new Audio(); keep the ref for the full src
      return origPlay.apply(this, arguments);
    };
  })();
`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` | ${detail}` : ""}`); };

try {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(INIT);

  let evalJson = null;
  page.on("response", (res) => {
    if (res.url().includes("/openai/pronunciation")) {
      res.json().then((j) => { evalJson = j; }).catch(() => {});
    }
  });

  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await mintToken()}`, { waitUntil: "networkidle" });
  await page.goto(`${ORIGIN}/practice/1`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Hold Bolo to speak|Hold to record/i).first().waitFor({ timeout: 45000 });

  // The coach phrase clip is the first data:audio play at mount; that is the
  // exact rendition of the target we will speak back through the mic.
  await page.waitForFunction(() => window.__audioLog?.some((a) => a.src.startsWith("data:audio/")), null, { timeout: 30000 });
  const coachSrcIdx = await page.evaluate(() => window.__audioLog.findIndex((a) => a.src.startsWith("data:audio/")));
  // Pull the FULL src from the kept element refs (the play log truncates to
  // 100 chars and the coach clip element is detached, never in the DOM).
  const coachSrc = await page.evaluate(() => {
    const el = window.__mediaEls.find((e) => String(e.src).startsWith("data:audio/"));
    return el ? el.src : null;
  });
  if (!coachSrc) throw new Error("no data:audio coach clip found among played media elements");
  check("coach clip captured", !!coachSrc, coachSrc ? `${coachSrc.slice(0, 40)}... (log idx ${coachSrcIdx})` : "none");
  await page.waitForTimeout(2500); // let the coach clip finish playing aloud

  // Record: hold the bird, replay the coach clip into the mic, release.
  const belly = await page.locator('[aria-label="Hold to speak"]').first().boundingBox();
  check("hold zone present", !!belly);
  await page.mouse.move(belly.x + belly.width / 2, belly.y + belly.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500); // recorder fully live before audio starts
  const durMs = await page.evaluate((src) => window.__playIntoMic(src), coachSrc);
  console.log("piping coach clip into mic:", Math.round(durMs), "ms");
  await page.waitForTimeout(durMs + 500);
  await page.mouse.up();

  // Wait for the eval; then check flash + confetti FAST (confetti hides at 3s).
  const gotEval = await (async () => {
    for (let i = 0; i < 120; i++) {
      if (evalJson) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  })();
  check("pronunciation response received", gotEval, gotEval ? `score=${evalJson.score} band=${evalJson.band}` : "timeout");

  const domSeen = await page
    .waitForFunction(
      () => {
        const flash = document.body.innerText.includes("Peak 🗿");
        const conf = [...document.querySelectorAll("div.pointer-events-none.fixed.inset-0.z-50")]
          .some((d) => d.children.length > 30);
        window.__domSeen = window.__domSeen || { flash: false, conf: false };
        window.__domSeen.flash = window.__domSeen.flash || flash;
        window.__domSeen.conf = window.__domSeen.conf || conf;
        return window.__domSeen.flash && window.__domSeen.conf;
      },
      null,
      { timeout: 15000 },
    )
    .then(() => true)
    .catch(() => false);
  await page.screenshot({ path: `${OUT}/result.png` });
  const domSeenDetail = await page.evaluate(() => window.__domSeen);

  check("eval score is exactly 92 (honesty cap)", evalJson?.score === 92, `score=${evalJson?.score}`);
  check("eval band is 'perfect' at the 91 threshold", evalJson?.band === "perfect", `band=${evalJson?.band}`);
  check("'Peak 🗿' flash rendered", !!domSeenDetail?.flash, JSON.stringify(domSeenDetail));
  check("perfect-only confetti overlay rendered", !!domSeenDetail?.conf, JSON.stringify(domSeenDetail));
  if (!domSeen) console.log("page text:", (await page.evaluate(() => document.body.innerText)).slice(0, 600));

  await ctx.close();
} finally {
  await browser.close();
  const del = await bapi("DELETE", `/users/${userId}`);
  console.log("clerk user cleanup:", del.status);
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\nRESULT: FAIL (${failed.length})` : "\nRESULT: PASS (all checks)");
process.exit(failed.length ? 1 : 0);
