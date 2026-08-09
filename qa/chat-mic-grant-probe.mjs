// Real-browser repro for the chat mic-grant hold-confirmation fix (Task 848).
//
// First-time flow in a clean browser profile (no mic permission stored):
// press the parrot, let the grant stay pending, release, then resolve the
// grant ("Allow") — assert NO recording starts and the text input accepts
// text. Headless chromium has no clickable permission chrome and fake-mic
// flags fail in this environment, so the pending→granted transition is
// driven by a deferred getUserMedia shim (real pointer events on the real
// page; resolving the deferred promise stands in for the Allow click).
//
// Scenarios:
//   A. released-before-grant: real pointerup is delivered, then the grant
//      resolves — no recording may start; typing works.
//   B. lost release: the permission prompt steals focus (window blur); the
//      pointerup is never delivered anywhere before the grant resolves — no
//      recording may start; typing works.
//   C. held-through-grant control: pointer still down when the grant
//      resolves — recording DOES start (fix must not break the happy path).
//
// Run (from repo root):
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<clerk user id> \
//     NODE_PATH=/tmp/pw/node_modules node qa/chat-mic-grant-probe.mjs
import { chromium } from "playwright-core";

const USER_ID = process.env.E2E_USER_ID;
const ORIGIN =
  process.env.APP_ORIGIN ||
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
if (!USER_ID || !ORIGIN || !CLERK_SECRET)
  throw new Error("need E2E_USER_ID, APP_ORIGIN/REPLIT_DEV_DOMAIN, CLERK_SECRET_KEY");

const log = (...a) => console.log(new Date().toISOString(), ...a);
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function mintTicket(userId) {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${CLERK_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`clerk sign_in_tokens failed: ${JSON.stringify(body)}`);
  return body.token;
}

// Deferred getUserMedia shim, installed before any page script runs.
const GUM_SHIM = `
  (() => {
    window.__gumCalls = 0;
    window.__gumResolvers = [];
    const md = navigator.mediaDevices;
    if (!md) return;
    md.getUserMedia = (constraints) => {
      window.__gumCalls++;
      return new Promise((resolve, reject) => {
        window.__gumResolvers.push({ resolve, reject });
      });
    };
    // Resolving the deferred promise stands in for the user clicking Allow.
    window.__resolveGum = () => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const dst = ctx.createMediaStreamDestination();
      osc.connect(dst);
      osc.start();
      for (const r of window.__gumResolvers.splice(0)) r.resolve(dst.stream);
    };
    // Clean profile: report the mic permission as not-yet-decided.
    if (navigator.permissions?.query) {
      const orig = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (d) =>
        d && d.name === "microphone"
          ? Promise.resolve({ state: "prompt", onchange: null, addEventListener() {}, removeEventListener() {} })
          : orig(d);
    }
  })();
`;

const MIC = '[aria-label="Hold to speak"]';
const RECORDING = '[aria-label="Release to send"]';
const INPUT = '[aria-label="Type a message to Bolo"]';

async function pressMic(page) {
  const box = await page.locator(MIC).first().boundingBox();
  if (!box) throw new Error("mic button not found / not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // wait for the grant to be pending (getUserMedia called, unresolved)
  await page.waitForFunction(() => window.__gumCalls >= 1, null, { timeout: 8000 });
}

async function assertIdleAndTypable(page, label) {
  await page.waitForTimeout(800);
  const recording = await page.locator(RECORDING).count();
  check(`${label}: no recording started`, recording === 0, `Release-to-send count=${recording}`);
  const input = page.locator(INPUT).first();
  const disabled = await input.isDisabled();
  check(`${label}: text input enabled`, !disabled);
  await input.fill("hello bolo");
  const val = await input.inputValue();
  check(`${label}: text input accepts input`, val === "hello bolo", `value="${val}"`);
  await input.fill("");
}

async function freshChatPage(browser, ticket) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(GUM_SHIM);
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${ticket}`, { waitUntil: "networkidle" });
  // A hard load of /chat bounces to /app while Clerk hydrates, so take the
  // real user path: home -> "Chat with Bolo".
  await page.waitForSelector('[aria-label="Chat with Bolo"]', { timeout: 20000 });
  // Dismiss the first-run guided tour overlay if it is up.
  const skip = page.getByLabel("Skip tour").first();
  if (await skip.count()) await skip.click().catch(() => {});
  await page.waitForTimeout(400);
  await page.click('[aria-label="Chat with Bolo"]');
  await page.waitForSelector(MIC, { timeout: 20000 });
  return { context, page };
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    args: ["--no-sandbox"],
  });

  // A. released-before-grant (the first-time flow from the task)
  {
    const ticket = await mintTicket(USER_ID);
    const { context, page } = await freshChatPage(browser, ticket);
    await pressMic(page);
    await page.mouse.up(); // user releases while the prompt is "open"
    await page.evaluate(() => window.__resolveGum()); // Allow lands later
    await assertIdleAndTypable(page, "A released-before-grant");
    await context.close();
  }

  // B. lost release: prompt steals focus; pointerup never delivered
  {
    const ticket = await mintTicket(USER_ID);
    const { context, page } = await freshChatPage(browser, ticket);
    await pressMic(page);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.evaluate(() => window.__resolveGum());
    await assertIdleAndTypable(page, "B lost-release (blur)");
    await page.mouse.up().catch(() => {});
  }

  // C. control: held through the grant — recording must start
  {
    const ticket = await mintTicket(USER_ID);
    const { context, page } = await freshChatPage(browser, ticket);
    await pressMic(page);
    await page.evaluate(() => window.__resolveGum()); // grant while still held
    await page.waitForSelector(RECORDING, { timeout: 8000 }).catch(() => {});
    const recording = await page.locator(RECORDING).count();
    // The page renders two mic buttons (mobile + desktop layouts), so a live
    // recording shows the label on both.
    check("C held-through-grant: recording starts", recording >= 1, `count=${recording}`);
    await page.mouse.up();
    await context.close();
  }

  await browser.close();
  log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
