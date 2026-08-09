// Practice screen: the attempt buttons must be reachable WITHOUT scrolling.
//
// After an attempt, "Next phrase" / "Try again" (or Retry / Next) sit below
// the score card, which sits below the bird. On a phone the bird was eating
// so much of the column that the buttons fell under the fold. Reasoning about
// this in CSS is hopeless: the bird zone is flex-1 in idle and a fixed band in
// result, and the score card's height depends on the band. So measure it.
//
// Reuses the perfect-band probe's machinery: a Clerk sign-in ticket, a
// WebAudio getUserMedia shim, and the coach's own clip piped into the mic so
// the attempt lands a real result state.
//
//   cd qa && CHROME_BIN=$(which chromium) node practice-fold-probe.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const SK = process.env.CLERK_SECRET_KEY;
const OUT = "shots/practice-fold";
mkdirSync(OUT, { recursive: true });
const email = `bolo-fold-probe+clerk_test@example.com`;

// Phones we care about: iPhone SE/13 mini class, iPhone 13/14, iPhone 14 Pro Max.
const VIEWPORTS = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-13", width: 390, height: 844 },
  { name: "iphone-14-pm", width: 430, height: 932 },
];

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
  password: `Fold!${Math.random().toString(36).slice(2)}Zz`,
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
    window.__mediaEls = [];
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.__mediaEls.push(this);
      return origPlay.apply(this, arguments);
    };
  })();
`;

// Vertical budget of the practice column, so a failure says WHAT to shrink.
// The dev preview banner is torn out first: it is 71px of workspace chrome the
// published app never shows, and leaving it in poisons every fold number.
const MEASURE = () => {
  for (const el of document.querySelectorAll("body > div, body > aside"))
    if (/temporary development preview/i.test(el.textContent || "")) el.remove();
  const vh = window.innerHeight;
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
  };
  const actions = [...document.querySelectorAll("button")].find((b) =>
    /^(next phrase|next|try again|retry|finish|record again)\b/i.test((b.textContent || "").trim()),
  );
  const row = actions?.parentElement ?? null;
  const main = document.querySelector("main");
  return {
    vh,
    docH: Math.round(document.documentElement.scrollHeight),
    bird: box(document.querySelector('img[alt*="Bolo"], img[src*="mascot"]')),
    actions: box(row),
    actionLabel: actions ? actions.textContent.trim() : null,
    overflow: Math.round(document.documentElement.scrollHeight - vh),
    // Every block competing for the column, tallest first.
    blocks: main
      ? [...main.children]
          .map((c) => ({ h: Math.round(c.getBoundingClientRect().height), t: (c.textContent || "").replace(/\s+/g, " ").trim().slice(0, 34) }))
          .filter((b) => b.h > 0)
      : [],
    // One level inside the result panel, so the biggest eater is named.
    panel: row?.parentElement
      ? [...row.parentElement.children].flatMap((c) =>
          [c, ...c.children].map((d) => ({
            h: Math.round(d.getBoundingClientRect().height),
            t: (d.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
          })),
        ).filter((b) => b.h > 24)
      : [],
  };
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` | ${detail}` : ""}`); };

try {
  for (const vp of VIEWPORTS.filter((v) => !process.env.VP || v.name === process.env.VP)) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.addInitScript(INIT);

    let evalJson = null;
    page.on("response", (res) => {
      if (res.url().includes("/openai/pronunciation"))
        res.json().then((j) => { evalJson = j; }).catch(() => {});
    });

    await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await mintToken()}`, { waitUntil: "networkidle" });
    await page.goto(`${ORIGIN}/practice/1`, { waitUntil: "domcontentloaded" });
    await page.getByText(/Hold Bolo to speak|Hold to record/i).first().waitFor({ timeout: 45000 });
    await page.waitForTimeout(1500);

    const idle = await page.evaluate(MEASURE);
    console.log(`\n### ${vp.name} ${vp.width}x${vp.height}`);
    console.log("  idle  ", JSON.stringify(idle));
    await page.screenshot({ path: `${OUT}/${vp.name}-idle.png` });

    const coachSrc = await page.evaluate(async () => {
      for (let i = 0; i < 60; i++) {
        const el = window.__mediaEls.find((e) => String(e.src).startsWith("data:audio/"));
        if (el) return el.src;
        await new Promise((r) => setTimeout(r, 500));
      }
      return null;
    });
    if (!coachSrc) { check(`${vp.name}: coach clip captured`, false, "none"); await ctx.close(); continue; }
    await page.waitForTimeout(2000);

    const belly = await page.locator('[aria-label="Hold to speak"]').first().boundingBox();
    await page.mouse.move(belly.x + belly.width / 2, belly.y + belly.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    const durMs = await page.evaluate((src) => window.__playIntoMic(src), coachSrc);
    await page.waitForTimeout(durMs + 500);
    await page.mouse.up();

    for (let i = 0; i < 120 && !evalJson; i++) await page.waitForTimeout(500);
    check(`${vp.name}: attempt evaluated`, !!evalJson, evalJson ? `score=${evalJson.score} band=${evalJson.band}` : "timeout");
    await page.waitForTimeout(4000); // let the flash/confetti clear so the buttons are settled

    const res = await page.evaluate(MEASURE);
    console.log("  result", JSON.stringify(res));
    await page.screenshot({ path: `${OUT}/${vp.name}-result.png` });

    check(
      `${vp.name}: action buttons visible without scrolling`,
      !!res.actions && res.actions.bottom <= res.vh,
      res.actions ? `bottom=${res.actions.bottom} vh=${res.vh} overflow=${res.overflow} label=${res.actionLabel}` : "no action row found",
    );
    await ctx.close();
  }
} finally {
  await browser.close();
  const del = await bapi("DELETE", `/users/${userId}`);
  console.log("clerk user cleanup:", del.status);
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\nRESULT: FAIL (${failed.length})` : "\nRESULT: PASS (all checks)");
process.exit(failed.length ? 1 : 0);
