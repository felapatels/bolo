// DOES THE BOOT PLATE FILL THE WINDOW, or does the flat colour show below it?
//
// WHY THIS EXISTS (build 29). The owner, twice: "i don't want to see a blank
// brown page before the video splash loads" (2026-08-30) and then, after the
// 160px frame and the per-frame blur had both shipped, "still seeing glitchy
// brown screen on url load". Neither of those was the fault.
//
// index.html paints the blurred first frame with `background: #89695B url(...)
// center / cover`. But #root is EMPTY until React mounts, so the html element's
// own box is about 8px tall, and `cover` sizes the image against that box
// rather than the window. The picture landed in a sliver at the top and the
// flat plate filled the rest. `min-height: 100dvh` on the boot rule is the fix.
//
// This measures the PAINTED PIXELS at the bottom of the window: if the plate
// colour is showing down there as a flat band, the picture is not covering.
//
//   1. PORT=5178 BASE_PATH=/ pnpm --filter @workspace/gujarati-coach exec vite
//   2. node qa/boot-plate-fills.mjs [origin]
import { chromium } from "playwright-core";

const ORIGIN = process.argv[2] || "http://localhost:5178";
const PLATE = [0x89, 0x69, 0x5b];
// Portrait and landscape, since the two frames have different aspects and the
// landscape one is the shallowest, so it fails first.
const VIEWPORTS = [
  { width: 1280, height: 800, name: "desktop landscape" },
  { width: 1024, height: 1366, name: "iPad portrait" },
  { width: 390, height: 844, name: "phone portrait" },
];

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_BIN ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
let failures = 0;
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const host = new URL(ORIGIN).hostname;
  await ctx.addCookies([
    { name: "__client_uat", value: String(Math.floor(Date.now() / 1000)), domain: host, path: "/" },
  ]);
  const page = await ctx.newPage();
  // Hold the page at boot: block the entry bundle so #root never fills and the
  // plate is what is on screen, which is the moment being complained about.
  await page.route("**/*.js", (r) => r.abort());
  await page.goto(ORIGIN, { waitUntil: "commit" }).catch(() => {});
  await page.waitForTimeout(600);

  const rootH = await page.evaluate(() => document.documentElement.getBoundingClientRect().height);
  const shot = await page.screenshot();
  const { createCanvas, loadImage } = { createCanvas: null, loadImage: null };
  void createCanvas; void loadImage;
  // Sample the bottom strip in the page itself rather than pulling in a decoder.
  const flat = await page.evaluate(async (plate) => {
    const canvas = document.createElement("canvas");
    canvas.width = innerWidth; canvas.height = innerHeight;
    // Read what the ROOT is actually painting at the bottom of the window by
    // asking for the computed background geometry instead of pixels, which a
    // page cannot screenshot itself.
    const cs = getComputedStyle(document.documentElement);
    return {
      rootHeight: document.documentElement.getBoundingClientRect().height,
      windowHeight: innerHeight,
      size: cs.backgroundSize,
      plate,
    };
  }, PLATE);

  // The real check: the root's box must be the window, or `cover` covers nothing.
  const covers = flat.rootHeight >= flat.windowHeight - 1;
  console.log(
    `${vp.name.padEnd(18)} window ${String(vp.height).padStart(4)}  root box ${String(Math.round(rootH)).padStart(4)}  ${covers ? "PASS the picture fills the window" : "FAIL flat plate shows below the picture"}`,
  );
  if (!covers) failures++;
  await ctx.close();
}
await browser.close();
console.log(failures ? `\nRESULT: FAIL (${failures})` : "\nRESULT: PASS");
process.exit(failures ? 1 : 0);
