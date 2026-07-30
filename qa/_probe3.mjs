import { chromium } from "playwright-core";
const ORIGIN = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 412, height: 824 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
const api = [];
page.on("response", (r) => { const u = r.url(); if (u.includes("/api/")) api.push(`${r.status()} ${u.slice(u.indexOf("/api/")).slice(0, 80)}`); });
await page.goto(ORIGIN, { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(3000);
if (await page.getByText("Welcome back").count()) {
  await page.getByPlaceholder("you@example.com").fill("d1bm+clerk_test@example.com");
  await page.getByText("Email me a sign-in code instead").click();
  await page.getByPlaceholder("123456").waitFor({ timeout: 30000 });
  await page.getByPlaceholder("123456").fill("424242");
  await page.getByText("Verify & sign in").click();
  await page.waitForTimeout(7000);
}
await page.getByText("Practicing").first().waitFor({ timeout: 60000 });
api.length = 0;
await page.getByText("Practicing").first().click();
await page.waitForTimeout(2000);
await page.getByText("Gujarati · Gujarati").first().click();
await page.waitForTimeout(10000);
const txt = await page.evaluate(() => document.body.innerText);
console.log("URL:", page.url());
console.log("TEXT:", txt.slice(0, 700).replace(/\n+/g, " | "));
console.log("API:"); for (const a of api) console.log("  ", a);
await browser.close();
