// Task 882 — the bird must actually render on /practice/:id (July 30 2026).
// The canonical-PNG revert made the mascot <img> absolute inside a chain of
// indefinite percentage heights, so the parrot zone collapsed to ~10px while
// the image "loaded fine" (200, opacity 1). The Screenshot tool can't catch
// this; only a real browser measuring the img bounding box can. This probe
// pins the fix: mascot bbox height must stay above a sane floor in the idle,
// recording, evaluating, and result/error states, at mobile AND desktop
// widths (recording is driven by a getUserMedia shim — headless chromium has
// no fake-mic here; see qa/chat-mic-grant-probe.mjs for the pattern).
//   CHROME_BIN=$(which chromium) NODE_PATH=/tmp/pw/node_modules node qa/practice-mascot-probe.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const SK = process.env.CLERK_SECRET_KEY;
const OUT = "qa/shots/task882";
mkdirSync(OUT, { recursive: true });
const email = `bolo-882-mascot+clerk_test@example.com`;

// Idle/recording/evaluating floor: the fill parrot zone should give the bird
// real height (~300px at 430px width). 150 is comfortably above the collapsed
// ~10px failure mode while tolerant of viewport differences.
const FILL_FLOOR = 150;
// Result/error compact band is a definite h-[110px]; the bird must still show.
const COMPACT_FLOOR = 60;

const bapi = async (method, path, body) => {
  const r = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};

// fresh throwaway user (delete leftovers first)
const found = await bapi("GET", `/users?email_address=${encodeURIComponent(email)}`);
for (const u of Array.isArray(found.j) ? found.j : []) await bapi("DELETE", `/users/${u.id}`);
const created = await bapi("POST", "/users", {
  email_address: [email],
  password: `M882!${Math.random().toString(36).slice(2)}Zz`,
  skip_password_checks: true,
});
if (created.status !== 200) { console.error("user create failed", created.status, JSON.stringify(created.j)); process.exit(1); }
const userId = created.j.id;
await bapi("PATCH", `/users/${userId}`, { bypass_client_trust: true });
console.log("qa user:", userId);

const mintToken = async () => {
  const r = await bapi("POST", "/sign_in_tokens", { user_id: userId });
  if (!r.j.token) throw new Error(`sign_in_token failed: ${r.status} ${JSON.stringify(r.j)}`);
  return r.j.token; // single-use — mint one per context
};

// getUserMedia shim: resolves immediately with a WebAudio oscillator stream
// (fake-mic chrome flags don't work in this environment). MediaRecorder and
// the amplitude analyser both accept it.
const GUM_SHIM = `
  (() => {
    const md = navigator.mediaDevices;
    if (!md) return;
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
  })();
`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };

const MASCOT = "img[src*='mascot-']";
const mascotBox = async (page) => {
  // The crossfade can briefly hold two imgs; measure the biggest visible one.
  const boxes = [];
  for (const img of await page.locator(MASCOT).all()) {
    const b = await img.boundingBox().catch(() => null);
    if (b) boxes.push(b);
  }
  boxes.sort((a, b) => b.height - a.height);
  return boxes[0] ?? { width: 0, height: 0 };
};
const fmt = (b) => `${b.width.toFixed(0)}x${b.height.toFixed(0)}`;

const openPractice = async (viewport) => {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(GUM_SHIM);
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await mintToken()}`, { waitUntil: "networkidle" });
  await page.goto(`${ORIGIN}/practice/1?group=120`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Hold Bolo to speak|Hold to record/i).first().waitFor({ timeout: 45000 });
  await page.waitForTimeout(1500); // entrance spring settles
  return { ctx, page };
};

try {
  // ── Mobile: idle → recording → evaluating → result/error ────────────────
  const { ctx: mCtx, page: m } = await openPractice({ width: 430, height: 900 });

  const idle = await mascotBox(m);
  check(`mobile idle: bird bbox height > ${FILL_FLOOR}`, idle.height > FILL_FLOOR, fmt(idle));
  await m.screenshot({ path: `${OUT}/practice-idle-mobile.png` });

  // Task 882 addition: the hold-to-speak touchable must cover the FULL
  // rendered bird (head to feet), not an inner belly box. Assert the button's
  // bounds ⊇ the mascot img's bounds. SLACK absorbs the idle bob/rotation
  // (±6px y + 1.5° tilt inflate the img's axis-aligned bbox a few px).
  const SLACK = 16;
  const covers = (btn, img) =>
    img.x >= btn.x - SLACK &&
    img.y >= btn.y - SLACK &&
    img.x + img.width <= btn.x + btn.width + SLACK &&
    img.y + img.height <= btn.y + btn.height + SLACK;
  const belly = await m.locator('[aria-label="Hold to speak"]').first().boundingBox();
  check("hold zone present", !!belly, belly ? fmt(belly) : "missing");
  check(
    "mobile: touchable covers the full bird (bounds ≥ img bounds)",
    !!belly && covers(belly, idle),
    `btn=${fmt(belly ?? { width: 0, height: 0 })} img=${fmt(idle)}`,
  );

  // Press the bird's HEAD (top-center) — must start recording, proving the
  // hit target isn't belly-only.
  await m.mouse.move(belly.x + belly.width / 2, belly.y + belly.height * 0.1);
  await m.mouse.down();
  await m.locator('[aria-label="Release to submit"]').waitFor({ timeout: 8000 }).catch(() => {});
  const rec = await mascotBox(m);
  check(`mobile recording (head press): bird bbox height > ${FILL_FLOOR}`, rec.height > FILL_FLOOR, fmt(rec));
  const recBtn = await m.locator('[aria-label="Release to submit"]').first().boundingBox().catch(() => null);
  check("mobile: head press started recording", !!recBtn, recBtn ? fmt(recBtn) : "no Release-to-submit button");
  await m.screenshot({ path: `${OUT}/practice-recording-mobile.png` });
  await m.waitForTimeout(1200); // > 400ms min-audio rule
  await m.mouse.up();

  // Evaluating (transient — sample immediately, tolerate a fast skip).
  const evalSeen = await m
    .locator(".animate-spin")
    .first()
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (evalSeen) {
    const ev = await mascotBox(m);
    check(`mobile evaluating: bird bbox height > ${FILL_FLOOR}`, ev.height > FILL_FLOOR, fmt(ev));
    await m.screenshot({ path: `${OUT}/practice-evaluating-mobile.png` });
  } else {
    console.log("note: evaluating spinner not sampled (state passed too fast)");
  }

  // A fresh user's first attempt pops the "First Words" badge overlay (its
  // own 128px cheer mascot would pollute the measurement) — dismiss it.
  const badge = m.getByText(/BADGE UNLOCKED/i).first();
  if (await badge.waitFor({ timeout: 20000 }).then(() => true).catch(() => false)) {
    await m.screenshot({ path: `${OUT}/practice-badge-overlay-mobile.png` });
    await m.mouse.click(215, 100); // overlay dismisses on tap anywhere
    await badge.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    await m.waitForTimeout(600);
  }

  // Result/error: parrot zone compacts to a definite 110px band — the bird
  // must still be visible there (height between the floor and ~130px).
  await m.waitForFunction(
    () => {
      const img = document.querySelector("img[src*='mascot-']");
      return img && img.getBoundingClientRect().height <= 130;
    },
    null,
    { timeout: 60000 },
  ).catch(() => {});
  const compact = await mascotBox(m);
  check(
    `mobile result/error: compact bird visible (${COMPACT_FLOOR} < h <= 130)`,
    compact.height > COMPACT_FLOOR && compact.height <= 130,
    fmt(compact),
  );
  await m.screenshot({ path: `${OUT}/practice-result-mobile.png` });
  await mCtx.close();

  // ── Desktop: idle ────────────────────────────────────────────────────────
  const { ctx: dCtx, page: d } = await openPractice({ width: 1280, height: 900 });
  const dIdle = await mascotBox(d);
  check(`desktop idle: bird bbox height > ${FILL_FLOOR}`, dIdle.height > FILL_FLOOR, fmt(dIdle));
  const dBelly = await d.locator('[aria-label="Hold to speak"]').first().boundingBox();
  check(
    "desktop: touchable covers the full bird (bounds ≥ img bounds)",
    !!dBelly && covers(dBelly, dIdle),
    `btn=${fmt(dBelly ?? { width: 0, height: 0 })} img=${fmt(dIdle)}`,
  );
  await d.screenshot({ path: `${OUT}/practice-idle-desktop.png` });
  await dCtx.close();
} finally {
  await browser.close();
  const del = await bapi("DELETE", `/users/${userId}`);
  console.log("clerk user cleanup:", del.status);
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\nRESULT: FAIL (${failed.length})` : "\nRESULT: PASS (all checks)");
console.log("shots saved to", OUT);
process.exit(failed.length ? 1 : 0);
