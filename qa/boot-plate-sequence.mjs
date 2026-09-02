// WHAT DOES A LEARNER ACTUALLY SEE IN THE FIRST SECOND? Films the boot of the
// live site frame by frame, because "glitchy brown screen on url load" (owner,
// build 29) is a complaint about a SEQUENCE and no static check can see one.
//
// The boot plate only paints for a signed-in visitor: index.html reads the
// Clerk `__client_uat` cookie before any bundle loads and only then sets
// data-boot="app". So the cookie is planted here to put the page on the path
// the owner is on. Nothing is signed in and no credential is used; the cookie
// only flips that one attribute.
//
//   node qa/boot-plate-sequence.mjs [origin] [outdir]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = process.argv[2] || "https://bolo-india.app";
const OUT = process.argv[3] || "/tmp/boot-seq";
const SHOTS = 24;
const EVERY = 120; // ms

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_BIN ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addCookies([
  { name: "__client_uat", value: String(Math.floor(Date.now() / 1000)), domain: "bolo-india.app", path: "/" },
]);
const page = await ctx.newPage();

const frames = [];
page.goto(ORIGIN, { waitUntil: "commit" }).catch(() => {});
for (let i = 0; i < SHOTS; i++) {
  const t = i * EVERY;
  const buf = await page.screenshot().catch(() => null);
  if (buf) {
    const { createWriteStream } = await import("node:fs");
    await new Promise((r) => {
      const w = createWriteStream(`${OUT}/f${String(i).padStart(2, "0")}-${t}ms.png`);
      w.end(buf, r);
    });
    // Average colour, so the sequence can be read as numbers as well as looked at.
    const stats = await page.evaluate(() => ({
      boot: document.documentElement.getAttribute("data-boot"),
      rootEmpty: !document.getElementById("root")?.childElementCount,
      htmlBg: getComputedStyle(document.documentElement).backgroundImage.slice(0, 24),
      bodyBg: getComputedStyle(document.body).backgroundColor,
    })).catch(() => null);
    frames.push({ t, ...(stats || {}) });
  }
  await new Promise((r) => setTimeout(r, EVERY));
}
await browser.close();

console.log("t(ms)  data-boot  #root empty  html bg              body bg");
for (const f of frames) {
  console.log(
    String(f.t).padStart(5),
    String(f.boot).padEnd(10),
    String(f.rootEmpty).padEnd(12),
    String(f.htmlBg).padEnd(21),
    String(f.bodyBg),
  );
}
console.log("\nframes ->", OUT);
