// Bolo Bazaar verification: sticky dressing room, wardrobe filter, "Dress Bolo".
//
// THUMBS_ONLY=1 skips the signed-in web pass and only re-renders the mobile
// thumb crop (no Clerk token burned).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/bazaar";
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

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });

// The mobile rack's square thumbs, rendered the way RN-web lays out the RN
// transform array (scale first, so the translate is in pre-scale units). This
// is the only cheap way to eyeball the head crop without a device. Served from
// a real file:// page — a setContent page is about:blank and cannot load the
// art at all.
async function mobileThumbs() {
  const SIZE = (402 - 40 - 12) / 2 - 20; // card width minus its padding
  const asset = (id) =>
    `/home/runner/workspace/artifacts/bolo-mobile/assets/images/mascot/outfits/${id}/mascot-wave.png`;
  const box = (id, head) => `
    <figure style="margin:0">
      <div style="width:${SIZE}px;height:${SIZE}px;overflow:hidden;border-radius:12px;background:#F6E7C8;position:relative">
        <img src="${asset(id)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;transform:${
          head
            ? `scale(2.3) translateX(${(0.5 - 0.53) * SIZE}px) translateY(${(0.5 - 0.26) * SIZE}px)`
            : "scale(1.04)"
        }">
      </div>
      <figcaption style="font:700 12px system-ui;text-align:center;margin-top:4px">${id}${head ? " (head)" : ""}</figcaption>
    </figure>`;
  const html = `${OUT}/thumbs.html`;
  writeFileSync(
    html,
    `<body style="margin:0;padding:16px;display:flex;gap:12px;flex-wrap:wrap;background:#fff">
       ${box("pagdi", true)}${box("station-cap", true)}${box("kurta", false)}${box("saree", false)}
     </body>`,
  );
  const mp = await ctx.newPage();
  await mp.goto(`file:///home/runner/workspace/${html}`);
  await mp.waitForTimeout(600);
  await mp.screenshot({ path: `${OUT}/mobile-thumbs.png`, fullPage: true });
  await mp.close();
}

if (process.env.THUMBS_ONLY) {
  await mobileThumbs();
  await browser.close();
  console.log("mobile thumb crop rendered");
  process.exit(0);
}

const page = await ctx.newPage();
page.on("pageerror", (e) => check("pageerror", false, String(e).slice(0, 160)));

await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken()}`, {
  waitUntil: "networkidle",
});
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
await page.goto(`${ORIGIN}/bazaar`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="outfit-storefront"]', { timeout: 20000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/web-top.png` });

const room = page.locator('[data-testid="outfit-dressing-room"]');
const before = await room.boundingBox();
const cards = await page.locator('[data-testid^="outfit-card-"]').count();
check("rack rendered", cards >= 5, `${cards} cards`);

// Scroll the rack: only the rack should move.
await page.evaluate(() => window.scrollBy(0, 900));
await page.waitForTimeout(600);
const after = await room.boundingBox();
const doc = await page.evaluate(() => window.scrollY);
check("page actually scrolled", doc > 200, `scrollY=${doc}`);
check(
  "dressing room stays on screen",
  after && after.y >= -1 && after.y + after.height > 100,
  `y=${after?.y?.toFixed(0)} h=${after?.height?.toFixed(0)} (was y=${before?.y?.toFixed(0)})`,
);
check(
  "dressing room height leaves room for the rack",
  after && after.height < 874 * 0.68,
  `${after?.height?.toFixed(0)}px of 874`,
);
const preview = await page.locator('[data-testid="outfit-preview"]').boundingBox();
check("bird still visible while scrolled", preview && preview.y + preview.height > 0 && preview.y < 874, `y=${preview?.y?.toFixed(0)}`);
await page.screenshot({ path: `${OUT}/web-scrolled.png` });

// Owned card wording.
const dress = await page.getByText("Dress Bolo").count();
check("owned cards say Dress Bolo", dress >= 1, `${dress} buttons`);

// Wardrobe filter.
await page.evaluate(() => window.scrollTo(0, 0));
await page.locator('[data-testid="outfit-filter-owned"]').click();
await page.waitForTimeout(400);
const ownedCards = await page.locator('[data-testid^="outfit-card-"]').count();
const chip = await page.locator('[data-testid="outfit-filter-owned"]').innerText();
const claimed = Number(chip.replace(/\D+/g, ""));
check(
  "filter narrows to owned stock",
  ownedCards === claimed && claimed > 0 && claimed < cards,
  `${ownedCards} cards vs chip "${chip.trim()}"`,
);
await page.evaluate(() => window.scrollBy(0, 500));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/web-owned.png` });

await page.locator('[data-testid="outfit-filter-all"]').click();
await page.waitForTimeout(400);
const allBack = await page.locator('[data-testid^="outfit-card-"]').count();
check("everything comes back", allBack === cards, `${allBack} vs ${cards}`);

// Desktop.
const wide = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const wp = await wide.newPage();
await wp.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken()}`, { waitUntil: "networkidle" });
await wp.goto(`${ORIGIN}/bazaar`, { waitUntil: "networkidle" });
await wp.waitForSelector('[data-testid="outfit-storefront"]');
await wp.waitForTimeout(1200);
await wp.screenshot({ path: `${OUT}/web-desktop.png` });

await mobileThumbs();

await browser.close();
console.log(failures ? `\n${failures} FAILURES` : "\nall checks passed");
process.exit(failures ? 1 : 0);
