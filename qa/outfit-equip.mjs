// Does a bought accessory actually reach the rest of the app?
//
// Buying and wearing are easy to unit-test; what unit tests cannot see is
// whether the bird on HOME and the bird in the JOURNEY are wearing what the
// shop says she is wearing, and whether a hat and a garment survive together
// across a navigation. That is what this drives, in a real browser, as a real
// signed-in learner: buy the cap, wear a garment, then walk the app and read
// the actual <img> srcs.
//
//   E2E_USER_ID=user_... CHROME_BIN=... node qa/outfit-equip.mjs
//   ITEM=station-cap GARMENT=kurta   (defaults)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const ITEM = process.env.ITEM ?? "station-cap";
const GARMENT = process.env.GARMENT ?? "kurta";
const OUT = "qa/shots/equip";
mkdirSync(OUT, { recursive: true });

async function signInToken() {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: process.env.E2E_USER_ID }),
  });
  const tk = await res.json();
  if (!res.ok) throw new Error(`sign-in token: ${JSON.stringify(tk)}`);
  return tk.token;
}

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

/**
 * Click a rack button.
 *
 * Two things sit over the rack and swallow the click if you just call
 * `.click()`: the dev-preview banner at the top of the frame, and the shop's
 * own sticky dressing room, which is exactly where playwright's "scroll into
 * view" parks an element. So: drop the banner, then leave the button in the
 * middle of the viewport rather than at its edge.
 */
async function tap(locator) {
  await locator.page().evaluate(() => {
    document.getElementById("replit-dev-banner")?.remove();
  });
  await locator.scrollIntoViewIfNeeded();
  await locator.page().evaluate(() => window.scrollBy(0, -280));
  await locator.click({ timeout: 15000 });
}

/** Every mascot image on the page, as the outfit folder each one came from. */
const mascotArt = (page) =>
  page.$$eval("img", (imgs) =>
    imgs
      .map((i) => i.currentSrc || i.src)
      .filter((s) => s.includes("/mascot/"))
      .map((s) => s.split("/mascot/")[1]),
  );

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => check("pageerror", false, String(e).slice(0, 160)));

await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken()}`, {
  waitUntil: "networkidle",
});
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
await page.goto(`${ORIGIN}/outfits`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="outfit-storefront"]', { timeout: 20000 });
await page.waitForTimeout(1200);

// The new item is on the rack at all.
const card = page.locator(`[data-testid="outfit-card-${ITEM}"]`);
check("the item is stocked", (await card.count()) === 1);
const section = await page
  .locator('[data-testid="outfit-section-accessory"]')
  .locator(`[data-testid="outfit-card-${ITEM}"]`)
  .count();
check("it is racked with the accessories", section === 1);

// Buy it, unless a previous run already did.
const buy = page.locator(`[data-testid="outfit-buynow-${ITEM}"]`);
if (await buy.count()) {
  await tap(buy);
  await page.waitForTimeout(2500);
}
check(
  "it is owned after buying",
  (await page.locator(`[data-testid="outfit-buynow-${ITEM}"]`).count()) === 0,
  "buy button is gone",
);

// Wear the hat and a garment at once.
const wear = async (id) => {
  const btn = page.locator(`[data-testid="outfit-wear-${id}"]`);
  if (await btn.count()) {
    await tap(btn);
    await page.waitForTimeout(1800);
  }
};
await wear(ITEM);
await wear(GARMENT);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/shop-both-on.png` });

const shopArt = await mascotArt(page);
const previewBase = shopArt.some((s) => s.startsWith(`outfits/${GARMENT}/mascot-`));
const previewHat = shopArt.some((s) => s.startsWith(`outfits/${ITEM}/overlay-`));
check("the shop bird wears the garment", previewBase, shopArt.join(" "));
check("the shop bird wears the hat over it", previewHat);

// Now walk the app. The bird outside the shop must agree with the shop.
for (const [label, path] of [
  ["home", "/"],
  ["journey", "/journey"],
]) {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const art = await mascotArt(page);
  check(
    `${label}: Bolo is dressed at all`,
    art.some((s) => s.startsWith("outfits/")),
    art.slice(0, 4).join(" ") || "no mascot art found",
  );
  check(
    `${label}: wearing the garment`,
    art.some((s) => s.startsWith(`outfits/${GARMENT}/mascot-`)),
  );
  check(
    `${label}: wearing the hat too`,
    art.some((s) => s.startsWith(`outfits/${ITEM}/overlay-`)),
  );
  await page.screenshot({ path: `${OUT}/${label}.png` });
}

// Taking the hat off must leave the garment on, everywhere.
await page.goto(`${ORIGIN}/outfits`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="outfit-storefront"]');
await tap(page.locator(`[data-testid="outfit-takeoff-${ITEM}"]`));
await page.waitForTimeout(2000);
await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const afterArt = await mascotArt(page);
check(
  "home: hat off, garment still on",
  afterArt.some((s) => s.startsWith(`outfits/${GARMENT}/mascot-`)) &&
    !afterArt.some((s) => s.startsWith(`outfits/${ITEM}/`)),
  afterArt.slice(0, 4).join(" "),
);

await browser.close();
console.log(failures ? `\n${failures} FAILURES` : "\nall checks passed");
process.exit(failures ? 1 : 0);
