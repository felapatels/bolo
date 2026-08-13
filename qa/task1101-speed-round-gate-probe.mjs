// Task 1101 — Plus-gated game screens must show the paywall, never a crash.
//
// jsdom cannot reproduce this defect: it is a HOOK-ORDER fault that only
// appears across two real renders (entitlements loading -> resolved), so it
// needs a real browser with a real signed-in session. The probe drives both
// tiers against the running dev app and asserts, per gated route:
//   Free  -> lands on /upgrade, paywall content visible, no page error and no
//            "Rendered fewer hooks" console error,
//   Plus  -> the game's own screen renders, no errors.
//
// QA-only: reads the running dev app, changes no product code.
//
// Run (from repo root):
//   CHROME_BIN=$(which chromium) \
//   FREE_USER_ID=<clerk_user_id> PLUS_USER_ID=<clerk_user_id> \
//   NODE_PATH=node_modules/.pnpm/playwright-core@1.62.0/node_modules \
//     node qa/task1101-speed-round-gate-probe.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const FREE_USER_ID = process.env.FREE_USER_ID;
const PLUS_USER_ID = process.env.PLUS_USER_ID;
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
const ORIGIN = process.env.APP_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = process.env.E2E_OUT || "qa/shots/task1101";
if (!FREE_USER_ID || !PLUS_USER_ID || !CLERK_SECRET) {
  throw new Error("FREE_USER_ID, PLUS_USER_ID and CLERK_SECRET_KEY are required");
}
mkdirSync(OUT, { recursive: true });

let failures = 0;
const pass = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
};

// Every Plus-only game screen, plus one free game as a control.
const GATED = [
  ["/games/speed-round", "Ready to race?"],
  ["/games/phrase-builder", "Build the phrase"],
  ["/games/script-trace", "Script Trace"],
  ["/games/bolo-quiz", "Bolo Quiz"],
];
const FREE_CONTROL = ["/games/word-match", "Word Match"];

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

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || undefined,
  args: ["--no-sandbox"],
});

/** Sign a user in and walk the gated routes, collecting console/page errors. */
async function runTier(label, userId, expectPlus) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`);
  });

  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await mintTicket(userId)}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(2500);

  // Confirm the server agrees which tier this session is on before judging UI.
  const ent = await page.evaluate(async () => {
    const r = await fetch("/api/entitlements", { credentials: "include" });
    return r.ok ? await r.json() : { error: r.status };
  });
  pass(`${label}: session resolves plan=${expectPlus ? "plus" : "free"}`, ent.plan === (expectPlus ? "plus" : "free"), JSON.stringify(ent.plan ?? ent));

  const routes = [...GATED, FREE_CONTROL];
  for (const [route, marker] of routes) {
    const gated = GATED.some(([r]) => r === route);
    const before = errors.length;
    await page.goto(`${ORIGIN}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const url = new URL(page.url()).pathname;
    const body = await page.evaluate(() => document.body.innerText.slice(0, 4000));
    const root = await page.evaluate(() => (document.getElementById("root")?.innerHTML || "").length);
    const newErrors = errors.slice(before);
    const hookError = newErrors.some((e) => /Rendered (fewer|more) hooks/i.test(e));

    if (gated && !expectPlus) {
      pass(`${label} ${route}: redirected to the paywall`, url === "/upgrade", `landed on ${url}`);
      pass(
        `${label} ${route}: paywall content is visible`,
        /All-Access|Upgrade|Plus|plan/i.test(body) && root > 500,
        `rootHtml=${root} chars`,
      );
    } else {
      pass(`${label} ${route}: stays on the game route`, url === route, `landed on ${url}`);
      pass(`${label} ${route}: the game screen rendered`, body.includes(marker), `marker "${marker}" ${body.includes(marker) ? "found" : "MISSING"}`);
    }
    pass(`${label} ${route}: no hooks-order crash`, !hookError, newErrors.filter((e) => /hooks/i.test(e)).join(" | "));
    pass(`${label} ${route}: console clean`, newErrors.length === 0, newErrors.slice(0, 3).join(" | "));
    await page.screenshot({ path: `${OUT}/${label}${route.replaceAll("/", "-")}.png` });
  }

  await ctx.close();
}

await runTier("free", FREE_USER_ID, false);
await runTier("plus", PLUS_USER_ID, true);

await browser.close();
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
