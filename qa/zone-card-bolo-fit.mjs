// Is Bolo WHOLLY INSIDE the zone card, or does the card clip her?
//
// WHY THIS EXISTS (build 29). The owner: "bolo cut off on zone card web". It
// is a REPEAT: journey.tsx's own comment at the call site records an earlier
// report of the same thing, "bolo needs more space on the zone card, he's
// getting cut off", so a fix here already came back once.
//
// The card is `overflow-hidden` and she is pinned `absolute right-1.5 top-0`,
// so anything of hers that reaches the frame's edge is cut by the border. She
// is measured as PAINTED PIXELS, not as her box: the 1024x1200 sprite carries
// transparent sky, so a box-based check passes while the bird is still cut.
//
//   1. PORT=5178 BASE_PATH=/ pnpm --filter @workspace/gujarati-coach exec vite
//   2. node qa/zone-card-bolo-fit.mjs
import { chromium } from "playwright-core";

const URL = process.env.HARNESS_URL ?? "http://localhost:5178/mascot-harness.html";
const CASES = ["zone-card-390", "zone-card-390-pagdi", "zone-card-560"];

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_BIN ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
let failures = 0;
try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-case="zone-card-390"] img', { timeout: 20000 });
  await page.waitForTimeout(1500);

  for (const id of CASES) {
    const r = await page.evaluate(async (caseId) => {
      const box = document.querySelector(`[data-case="${caseId}"]`);
      if (!box) return null;
      const card = box.querySelector("[data-zone-card]");
      const imgs = [...box.querySelectorAll("img")];
      const c = card.getBoundingClientRect();
      const out = [];
      for (const img of imgs) {
        const e = img.getBoundingClientRect();
        // THE ALPHA BOUNDS, not the element box and not an assumed sky
        // fraction. The sprite is mostly transparent and the accessory is a
        // hat floating in the frame's sky, so any offset guessed from the
        // frame misses it. Draw it and find the pixels that are actually
        // painted. Same-origin, so the canvas is not tainted.
        const nat = { w: img.naturalWidth, h: img.naturalHeight };
        const cv = document.createElement("canvas");
        cv.width = nat.w; cv.height = nat.h;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, nat.w, nat.h);
        const d = ctx.getImageData(0, 0, nat.w, nat.h).data;
        let minX = nat.w, maxX = -1, minY = nat.h, maxY = -1;
        for (let y = 0; y < nat.h; y++) {
          for (let x = 0; x < nat.w; x++) {
            if (d[(y * nat.w + x) * 4 + 3] > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) continue;
        // Map those natural-pixel bounds onto the page, through object-contain.
        const AR = nat.w / nat.h;
        let pw = e.width, ph = e.width / AR;
        if (ph > e.height) { ph = e.height; pw = e.height * AR; }
        const ox = e.left + (e.width - pw) / 2;
        const oy = e.top + (e.height - ph) / 2;
        const sx = pw / nat.w, sy = ph / nat.h;
        out.push({
          which: img.dataset.testid === "mascot-accessory" ? "hat" : "bird",
          left: ox + minX * sx,
          right: ox + (maxX + 1) * sx,
          top: oy + minY * sy,
          bottom: oy + (maxY + 1) * sy,
        });
      }
      return { card: { left: c.left, right: c.right, top: c.top, bottom: c.bottom }, parts: out };
    }, id);
    if (!r) { console.log(`${id}  MISSING`); failures++; continue; }

    const n = (x) => Math.round(x * 10) / 10;
    for (const p of r.parts) {
      const overRight = p.right - r.card.right;
      const overLeft = r.card.left - p.left;
      const overTop = r.card.top - p.top;
      const overBottom = p.bottom - r.card.bottom;
      const worst = Math.max(overRight, overLeft, overTop, overBottom);
      const where = [
        overRight > 0 ? `right ${n(overRight)}` : null,
        overLeft > 0 ? `left ${n(overLeft)}` : null,
        overTop > 0 ? `top ${n(overTop)}` : null,
        overBottom > 0 ? `bottom ${n(overBottom)}` : null,
      ].filter(Boolean).join(", ");
      if (worst > 0.5) {
        console.log(`FAIL  ${id.padEnd(22)} ${p.which.padEnd(5)} cut by the card: ${where}`);
        failures++;
      } else {
        console.log(`PASS  ${id.padEnd(22)} ${p.which.padEnd(5)} wholly inside, nearest edge ${n(-worst)}px`);
      }
    }
  }
} finally {
  await browser.close();
}
console.log(failures ? `\nRESULT: FAIL (${failures})` : "\nRESULT: PASS");
process.exit(failures ? 1 : 0);
