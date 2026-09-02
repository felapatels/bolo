// Does Bolo FIT IN THE RESULT BAND, or does she clear it and land on the card?
//
// WHY THIS EXISTS (build 29). The owner sent a screenshot of the practice
// result screen with Bolo sitting on top of the phrase card. `<Mascot fill>`
// pulls the sprite up by MASCOT_SKY_PCT, the sky as a fraction of the box
// WIDTH, because a margin percentage resolves against nothing else. That is
// exact only while the painted bird is as wide as her box. The result state
// makes the parrot zone a DEFINITE h-[72px], so the box is wide and short,
// `object-contain` letterboxes her to 61x72, and the pull-up is still computed
// off the full width: 68px of lift inside a 72px band.
//
// The fix gives the compact branch a box with the frame's 1024:1200 aspect, so
// painted and element are the same rectangle and the component's own
// arithmetic is exact again. Mascot itself is untouched.
//
// It shipped unseen because jsdom has no layout: the whole web suite passed.
// Only a real browser can answer this, which is what this probe is.
//
//   1. PORT=5178 BASE_PATH=/ pnpm --filter @workspace/gujarati-coach exec vite
//   2. node qa/practice-band-fit.mjs
import { chromium } from "playwright-core";

const URL = process.env.HARNESS_URL ?? "http://localhost:5178/mascot-harness.html";
// The bird may sit a little proud of a 72px band, but she must not clear it.
// Anything past this and she is over the phrase card, which is the bug.
const MAX_SPILL_ABOVE = 8;

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_BIN ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });

let failures = 0;
try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-case="practice-compact"] img', { timeout: 20000 });
  await page.waitForTimeout(1200);

  const r = await page.evaluate(() => {
    const AR = 1024 / 1200;
    const box = document.querySelector('[data-case="practice-compact"]');
    // The band is the zone the layout actually gives her: the h-[72px] div.
    const band = box.querySelector('[class*="h-[72px]"]');
    const img = box.querySelector("img");
    const b = band.getBoundingClientRect();
    const e = img.getBoundingClientRect();
    let pw = e.width, ph = e.width / AR;
    if (ph > e.height) { ph = e.height; pw = e.height * AR; }
    const paintTop = e.top + (e.height - ph) / 2;
    const bodyTop = paintTop + ph * (176 / 1200);
    const bodyBot = paintTop + ph;
    return {
      band: [b.width, b.height],
      elem: [e.width, e.height],
      body: [pw, ph - ph * (176 / 1200)],
      spillAbove: b.top - bodyTop,
      spillBelow: bodyBot - b.bottom,
    };
  });

  const n = (x) => Math.round(x * 10) / 10;
  console.log(`band        ${n(r.band[0])}x${n(r.band[1])}`);
  console.log(`img element ${n(r.elem[0])}x${n(r.elem[1])}`);
  console.log(`painted bird ${n(r.body[0])}x${n(r.body[1])}`);
  console.log(`spill above band  ${n(r.spillAbove)}px   (limit ${MAX_SPILL_ABOVE})`);
  console.log(`spill below band  ${n(r.spillBelow)}px`);

  // 1. She must not clear the band upward. This is the reported bug.
  if (r.spillAbove > MAX_SPILL_ABOVE) {
    console.log(`FAIL  she clears the band by ${n(r.spillAbove)}px and lands on the card above`);
    failures++;
  } else {
    console.log("PASS  she sits in her band");
  }

  // 2. The box must be the frame's shape, which is WHY 1 passes. Asserted
  //    separately so a regression names its own cause instead of just a number.
  const aspect = r.elem[0] / r.elem[1];
  if (Math.abs(aspect - 1024 / 1200) > 0.01) {
    console.log(`FAIL  box aspect ${n(aspect)} is not the frame's ${n(1024 / 1200)}; the pull-up cannot be exact`);
    failures++;
  } else {
    console.log("PASS  box carries the frame's aspect");
  }
} finally {
  await browser.close();
}

console.log(failures ? `\nRESULT: FAIL (${failures})` : "\nRESULT: PASS");
process.exit(failures ? 1 : 0);
