// Task #1111, friends-by-code evidence, real browser, real dev API.
//
// QA-only: drives the running dev web app through the ACTUAL product flow, 
// learner A reads their friend code off /friends, learner B types it in, A
// accepts the pending request. Nothing is inserted into the database by hand;
// the "with friends" state is produced by the feature itself.
//
// Run (from repo root):
//   CHROME_BIN=$(which chromium) \
//   E2E_USER_A=<clerk_user_id> E2E_USER_B=<clerk_user_id> \
//     node qa/task1111-friends-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const A = process.env.E2E_USER_A;
const B = process.env.E2E_USER_B;
const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const SECRET = process.env.CLERK_SECRET_KEY;
const OUT = "qa/shots/task1111";
if (!A || !B) throw new Error("E2E_USER_A and E2E_USER_B are required");
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);

async function ticket(userId) {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`sign_in_tokens: ${JSON.stringify(body)}`);
  return body.token;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});

async function signIn(userId, label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log(`[${label}] pageerror:`, String(e).slice(0, 200)));
  const t = await ticket(userId);
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${t}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(4000);
  log(`[${label}] signed in at`, page.url());
  return { ctx, page };
}

async function gotoFriends(page, label) {
  await page.goto(`${ORIGIN}/friends`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(2500);
  const skip = page.getByRole("button", { name: /Skip tour/i });
  if (await skip.count()) {
    await skip.first().click();
    await page.waitForTimeout(1200);
  }
  log(`[${label}] on`, page.url());
}

try {
  const a = await signIn(A, "A");
  const b = await signIn(B, "B");

  await gotoFriends(a.page, "A");
  await gotoFriends(b.page, "B");

  // ── Empty state (learner with no friends) ───────────────────────────────
  await a.page.screenshot({ path: `${OUT}/web-friends-empty.png` });
  log("shot web-friends-empty");

  // A's own friend code, read off the page exactly as a learner would.
  const codeA = (
    await a.page.getByTestId("friend-code").first().textContent()
  ).trim();
  const qrA = await a.page.getByTestId("friend-qr").first().getAttribute("data-value");
  log("A friend code:", codeA, "| QR encodes:", qrA);

  // ── B types A's code → PENDING request (never an instant friendship) ────
  await b.page.getByRole("textbox", { name: "Friend code" }).fill(codeA);
  await b.page.getByRole("button", { name: /^Add$/i }).click();
  await b.page.waitForTimeout(3000);
  log("B page text after send:\n", (await b.page.innerText("main")).slice(0, 600));
  await b.page.screenshot({ path: `${OUT}/web-request-sent.png` });

  // ── A accepts ───────────────────────────────────────────────────────────
  await gotoFriends(a.page, "A");
  const accept = a.page.getByRole("button", { name: /^Accept request from/i });
  await accept.first().waitFor({ timeout: 20000 });
  await a.page.screenshot({ path: `${OUT}/web-incoming-request.png` });
  await accept.first().click();
  await a.page.waitForTimeout(3500);
  await gotoFriends(a.page, "A");
  await a.page.screenshot({ path: `${OUT}/web-friends-with.png` });
  log("shot web-friends-with");
  log("A page text:\n", (await a.page.innerText("main")).slice(0, 800));

  // ── Remove friend still works ───────────────────────────────────────────
  const remove = a.page.getByRole("button", { name: /Remove /i });
  log("remove buttons:", await remove.count());
  if (await remove.count()) {
    a.page.once("dialog", (d) => d.accept());
    await remove.first().click();
    await a.page.waitForTimeout(3000);
    await a.page.screenshot({ path: `${OUT}/web-after-remove.png` });
    log("after remove, page text:\n", (await a.page.innerText("main")).slice(0, 500));
  }
} finally {
  await browser.close();
}
