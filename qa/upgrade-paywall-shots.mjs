// QA-only: real-browser screenshots of the reworked /upgrade paywall.
// Verifies the One Language card is gone, store-ladder prices render, and the
// Family card has no text overlap at mobile + desktop widths.
//
// Run (from repo root):
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<clerk_user_id> \
//     NODE_PATH=/tmp/pw/node_modules node qa/upgrade-paywall-shots.mjs
import { chromium } from "playwright-core";

const USER_ID = process.env.E2E_USER_ID;
const ORIGIN =
  process.env.APP_ORIGIN ||
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
if (!USER_ID || !ORIGIN || !CLERK_SECRET) throw new Error("missing env");

const log = (...a) => console.log(new Date().toISOString(), ...a);
const check = (name, ok, detail = "") =>
  log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `, ${detail}` : ""}`);

async function mintTicket(userId) {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLERK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`clerk sign_in_tokens failed: ${JSON.stringify(body)}`);
  return body.token;
}

async function main() {
  const ticket = await mintTicket(USER_ID);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 1400 } });
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${ticket}`, { waitUntil: "networkidle" });
  log("after sign-in URL:", page.url());

  await page.goto(`${ORIGIN}/upgrade`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  // Content checks (monthly default).
  const body = await page.textContent("body");
  check("One Language card gone", !body.includes("One Language"));
  check("All-Access card present", body.includes("All-Access"));
  check("Plus monthly $12.99", body.includes("$12.99"));
  check("Family monthly $19.99", body.includes("$19.99"));
  check("no stale $9.99", !body.includes("$9.99"));
  check("no stale $6.99", !body.includes("$6.99"));
  await page.screenshot({ path: "qa/shots/upgrade-mobile-monthly.png", fullPage: true });

  // Annual toggle.
  await page.getByRole("button", { name: /Annual/ }).click();
  await page.waitForTimeout(400);
  const annualBody = await page.textContent("body");
  check("Plus annual $89.99", annualBody.includes("$89.99"));
  check("Family annual $139.99", annualBody.includes("$139.99"));
  check("no stale $71.99", !annualBody.includes("$71.99"));
  await page.screenshot({ path: "qa/shots/upgrade-mobile-annual.png", fullPage: true });

  // Desktop width, the 3-column grid where the Family card overlap lived.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "qa/shots/upgrade-desktop-annual.png", fullPage: true });
  await page.getByRole("button", { name: /^Monthly/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "qa/shots/upgrade-desktop-monthly.png", fullPage: true });

  // Family card box overlap probe: check the Family card's title and price
  // bounding boxes do not intersect at desktop width.
  const family = page.locator("button", { hasText: "Family" }).first();
  const title = family.getByText("Family", { exact: true }).first();
  const price = family.getByText("$19.99").first();
  const [tb, pb] = [await title.boundingBox(), await price.boundingBox()];
  if (tb && pb) {
    const overlap =
      tb.x < pb.x + pb.width && pb.x < tb.x + tb.width &&
      tb.y < pb.y + pb.height && pb.y < tb.y + tb.height;
    check("Family title/price no overlap", !overlap, JSON.stringify({ tb, pb }));
  } else {
    check("Family title/price boxes found", false);
  }

  check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
