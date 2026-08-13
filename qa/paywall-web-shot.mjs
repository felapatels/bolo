// Photographs the WEB paywall (/upgrade) signed in, to show the Terms of Use
// and Privacy Policy links inside the purchase flow. QA-only, dev-only.
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<clerk_user_id> node paywall-web-shot.mjs
import { chromium } from "playwright-core";
const USER_ID = process.env.E2E_USER_ID;
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
const ORIGIN = process.env.APP_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
if (!USER_ID || !CLERK_SECRET) throw new Error("E2E_USER_ID and CLERK_SECRET_KEY are required");
const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
  method: "POST",
  headers: { Authorization: `Bearer ${CLERK_SECRET}`, "Content-Type": "application/json" },
  body: JSON.stringify({ user_id: USER_ID }),
});
const body = await res.json();
if (!res.ok) throw new Error(`clerk sign_in_tokens failed: ${JSON.stringify(body)}`);
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 412, height: 1000 } });
await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${body.token}`, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
await page.goto(`${ORIGIN}/upgrade`, { waitUntil: "networkidle" });
await page.waitForTimeout(6000);
for (const name of ["Terms of Use", "Privacy Policy"]) {
  const link = page.getByRole("link", { name });
  const n = await link.count();
  console.log(`  web "${name}": count=${n} href=${n ? await link.first().getAttribute("href") : null}`);
}
const cta = page.getByRole("button", { name: /Start 7-day free trial|Get the Family plan/ });
console.log("  CTA visible:", await cta.first().isVisible().catch(() => false));
await page.screenshot({ path: "shots/paywall-web-legal-links.png", fullPage: true });
await browser.close();
