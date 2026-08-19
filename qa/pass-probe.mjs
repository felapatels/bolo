// Probe the home boarding-pass stub layout on the Expo web build: dump
// bounding rects for the stamp, vertical line name, punch hole, and stub
// column so misalignment is measured, not guessed.
// Usage: CHROME_BIN=$(which chromium) node qa/pass-probe.mjs
import { chromium } from "playwright-core";

const ORIGIN = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const EMAIL = "d1bm+clerk_test@example.com";

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 412, height: 824 } });

await page.goto(ORIGIN, { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(3000);
await Promise.race([
  page.getByText("Welcome back").first().waitFor({ timeout: 120000 }),
  page.getByLabel("Change language").first().waitFor({ timeout: 120000 }),
]).catch(() => {});
if (await page.getByText("Welcome back").count()) {
  await page.getByPlaceholder("you@example.com").fill(EMAIL);
  await page.getByText("Email me a sign-in code instead").click();
  await page.getByPlaceholder("123456").waitFor({ timeout: 30000 });
  await page.getByPlaceholder("123456").fill("424242");
  await page.getByText("Verify & sign in").click();
  await page.waitForTimeout(6000);
}
await page.getByText("BOARDING PASS").first().waitFor({ timeout: 90000 });
await page.waitForTimeout(2000);

const report = await page.evaluate(() => {
  const out = [];
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return `x=${r.x.toFixed(1)} y=${r.y.toFixed(1)} w=${r.width.toFixed(1)} h=${r.height.toFixed(1)}`;
  };
  // Find the home pass card via its title text.
  const all = Array.from(document.querySelectorAll("div"));
  const title = all.find((el) =>
    el.textContent === el.innerText &&
    /^Ride the /.test(el.textContent || "") &&
    el.children.length === 0,
  );
  if (!title) return ["no title node"];
  const card = title.closest('[role="button"]') || title.parentElement.parentElement.parentElement.parentElement;
  out.push(`card: ${rect(card)}`);
  const within = Array.from(card.querySelectorAll("*"));
  const stamp = within.find((el) => el.textContent === "FARE ZONE" && el.children.length === 0);
  if (stamp) {
    const ring = stamp.parentElement;
    out.push(`stamp ring: ${rect(ring)} transform=${getComputedStyle(ring).transform}`);
    out.push(`stamp slot(parent): ${rect(ring.parentElement)}`);
    out.push(`stub(grandparent): ${rect(ring.parentElement.parentElement)} align=${getComputedStyle(ring.parentElement.parentElement).alignItems} display=${getComputedStyle(ring.parentElement.parentElement).display} flexDir=${getComputedStyle(ring.parentElement.parentElement).flexDirection}`);
  }
  const name = within.find((el) => el.children.length === 0 && /LINE|EXPRESS|MAIL|RAIL/.test(el.textContent || "") && el.textContent === (el.textContent || "").toUpperCase() && (el.textContent || "").length > 3);
  if (name) {
    out.push(`name text "${name.textContent}": ${rect(name)} cssW=${getComputedStyle(name).width} transform=${getComputedStyle(name).transform}`);
    out.push(`name slot(parent): ${rect(name.parentElement)}`);
  } else {
    // maybe truncated, find rotated text inside stub
    const cand = within.filter((el) => el.children.length === 0 && getComputedStyle(el).transform !== "none");
    for (const c of cand.slice(0, 6)) out.push(`rotated leaf "${(c.textContent || "").slice(0, 20)}": ${rect(c)} cssW=${getComputedStyle(c).width}`);
  }
  return out;
});
console.log(report.join("\n"));
await browser.close();
