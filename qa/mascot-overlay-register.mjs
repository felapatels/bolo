// Does the accessory overlay sit ON her head, or one sky-height above it?
//
// WHY THIS EXISTS (build 27). Build 26 grew the sprite canvas from 1024 square
// to 1024x1200 and gave the web Mascot a negative top margin to compensate. It
// gave the SAME margin to the accessory overlay, reasoning that the same frame
// plus the same pull-up must line up. On web it does not: the base img is in
// flow, so its negative margin COLLAPSES OUT and raises the overlay's
// containing block instead of moving the img inside it. The overlay then
// applies the pull-up a second time and every hat in the app floats exactly
// one sky above her head. Mobile's twin is correct, because Yoga has no margin
// collapsing.
//
// It shipped unseen because jsdom has no layout: the whole web suite passed.
// Only a real browser can answer this, which is what this probe is.
//
//   1. PORT=5178 BASE_PATH=/ pnpm --filter @workspace/gujarati-coach exec vite
//   2. node qa/mascot-overlay-register.mjs
//
// Renders artifacts/gujarati-coach/mascot-harness.html, which mounts the real
// <Mascot> inside the real ancestor chains copied from practice.tsx and
// join.tsx. No API, no Clerk: useEquippedOutfit falls back to nothing-worn
// outside its provider, so outfit/accessory come straight from props.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const URL = process.env.HARNESS_URL ?? "http://localhost:5178/mascot-harness.html";
const OUT = "qa/shots/mascot-overlay";
// The two imgs are the same 1024x1200 frame drawn at the same size, so a
// correct stack has them at the SAME top. A whole sky-height apart is the bug.
// 1px absorbs subpixel layout.
const TOLERANCE = 1;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_BIN ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });

const results = [];
try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-case] img", { timeout: 20000 });
  await page.waitForTimeout(1200); // entrance/crossfade settle

  const rows = await page.evaluate(() => {
    const out = [];
    for (const box of document.querySelectorAll("[data-case]")) {
      const overlay = box.querySelector('img[data-testid="mascot-accessory"]');
      if (!overlay) continue;
      const base = [...box.querySelectorAll("img")].find((i) => i !== overlay);
      if (!base) continue;
      const b = base.getBoundingClientRect();
      const o = overlay.getBoundingClientRect();
      out.push({
        id: box.getAttribute("data-case"),
        baseTop: +b.top.toFixed(1),
        overlayTop: +o.top.toFixed(1),
        delta: +(b.top - o.top).toFixed(1),
        sameSize: Math.abs(b.height - o.height) < 1 && Math.abs(b.width - o.width) < 1,
        size: `${b.width.toFixed(0)}x${b.height.toFixed(0)}`,
      });
    }
    return out;
  });

  if (!rows.length) throw new Error("no accessory overlay found in the harness");

  for (const r of rows) {
    const ok = Math.abs(r.delta) <= TOLERANCE && r.sameSize;
    results.push(ok);
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${r.id}  base@${r.baseTop} overlay@${r.overlayTop}` +
        `  delta ${r.delta}px  box ${r.size}${r.sameSize ? "" : "  SIZE MISMATCH"}`,
    );
    if (!ok && r.delta > 0) {
      console.log(`        overlay is ${r.delta}px ABOVE the base — the pull-up is being spent twice.`);
    }
  }

  await page.screenshot({ path: `${OUT}/harness.png`, fullPage: true });
  for (const box of await page.locator("[data-case]").all()) {
    const id = await box.getAttribute("data-case");
    await box.screenshot({ path: `${OUT}/case-${id}.png` });
  }
  console.log(`\nshots -> ${OUT}`);
} finally {
  await browser.close();
}

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\nRESULT: FAIL (${failed})` : `\nRESULT: PASS (${results.length} chains in register)`);
process.exit(failed ? 1 : 0);
