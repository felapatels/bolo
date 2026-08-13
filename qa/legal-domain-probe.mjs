// Reports what the mobile build injects as EXPO_PUBLIC_DOMAIN, and whether the
// legal pages render REAL content on that host (the SPA shell is served for
// every route, so status codes prove nothing). QA-only.
import { chromium } from "playwright-core";

const resolved =
  process.env.REPLIT_INTERNAL_APP_DOMAIN ||
  process.env.REPLIT_DEV_DOMAIN ||
  process.env.EXPO_PUBLIC_DOMAIN;
console.log("injected EXPO_PUBLIC_DOMAIN would be:", resolved || "<none>");

const hosts = [resolved, "bolo-india.app"].filter(Boolean);
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
for (const host of hosts) {
  for (const path of ["/terms", "/privacy"]) {
    const url = `https://${host}${path}`;
    let status = "n/a";
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      status = res ? res.status() : "no-response";
      await page.waitForTimeout(4000);
      const h1 = await page.locator("h1").first().innerText().catch(() => "<no h1>");
      const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
      console.log(`${url} -> HTTP ${status} | h1="${h1}" | ${text.length} chars | ${text.slice(0, 120)}`);
    } catch (err) {
      console.log(`${url} -> HTTP ${status} | FAILED: ${String(err).slice(0, 140)}`);
    }
  }
}
await browser.close();
