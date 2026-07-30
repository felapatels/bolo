// Probe the boarding-pass punch/notch circles on home hero + journey header:
// dump every small circular element inside each card with rects relative to
// the card box, so "floating dot vs edge bite" is measured, not guessed.
// Usage: CHROME_BIN=$(which chromium) node qa/notch-probe.mjs
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

const circlesIn = (label) =>
  page.evaluate((label) => {
    const out = [`== ${label} ==`];
    const all = Array.from(document.querySelectorAll("div"));
    let card;
    if (label === "home") {
      const t = all.find(
        (el) => el.children.length === 0 && /^Ride the /.test(el.textContent || ""),
      );
      card = t && (t.closest('[role="button"]') || null);
    } else {
      const t = all.find(
        (el) => el.children.length === 0 && /stations$/.test(el.textContent || ""),
      );
      // walk up to the dashed ticket container
      card = t;
      while (card && getComputedStyle(card).borderStyle !== "dashed") card = card.parentElement;
    }
    if (!card) return [...out, "card not found"];
    const c = card.getBoundingClientRect();
    out.push(`card: x=${c.x.toFixed(1)} y=${c.y.toFixed(1)} w=${c.width.toFixed(1)} h=${c.height.toFixed(1)}`);
    for (const el of card.querySelectorAll("div")) {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.width <= 24 && Math.abs(r.width - r.height) < 1 && parseFloat(s.borderRadius) >= r.width / 2 - 1 && s.backgroundColor !== "rgba(0, 0, 0, 0)") {
        const rel = `dx=${(r.x - c.x).toFixed(1)} dy=${(r.y - c.y).toFixed(1)}`;
        const edge =
          r.y < c.y || r.y + r.height > c.y + c.height || r.x < c.x || r.x + r.width > c.x + c.width
            ? "STRADDLES-EDGE"
            : "FULLY-INSIDE";
        out.push(`circle ${r.width.toFixed(0)}px ${rel} bg=${s.backgroundColor} ${edge}`);
      }
    }
    // any leaf with the ticket emoji / tofu
    for (const el of card.querySelectorAll("div")) {
      if (el.children.length === 0 && /\u{1F3AB}/u.test(el.textContent || "")) {
        const r = el.getBoundingClientRect();
        out.push(`ticket-emoji leaf at dx=${(r.x - c.x).toFixed(1)} dy=${(r.y - c.y).toFixed(1)}`);
      }
    }
    return out;
  }, label);

console.log((await circlesIn("home")).join("\n"));
await page.getByLabel(/open the journey map/).first().click();
await page.waitForTimeout(4000);
await page.getByText(/stations/).first().waitFor({ timeout: 60000 });
console.log((await circlesIn("journey-header")).join("\n"));
await browser.close();
