// Task 997 gate: responsive screenshots + JSON-LD structured-data validation.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/task997-gate";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, args: ["--no-sandbox"] });

const pages = [["/", "home"], ["/languages/punjabi", "punjabi"], ["/languages/urdu", "urdu"]];
const widths = [320, 768, 1280];
for (const [path, name] of pages) {
  for (const w of widths) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      for (const el of document.querySelectorAll("body > *"))
        if (el.id !== "root" && el.tagName !== "SCRIPT") el.remove();
    });
    // full page at 320 to check overflow; viewport otherwise
    await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: w === 320 });
    // horizontal overflow probe
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${name}@${w}: hOverflow=${over}px`);
    if (path === "/" && w === 1280) {
      const ld = await page.evaluate(() => {
        const el = document.getElementById("bolo-structured-data");
        return el ? el.textContent : null;
      });
      console.log("--- JSON-LD validation ---");
      if (!ld) { console.log("FAIL: no JSON-LD found"); }
      else {
        const arr = JSON.parse(ld);
        for (const obj of arr) {
          const errs = [];
          if (obj["@context"] !== "https://schema.org") errs.push("bad @context");
          if (!obj["@type"]) errs.push("missing @type");
          if (!obj.name) errs.push("missing name");
          if (!obj.url) errs.push("missing url");
          if (obj["@type"] === "Organization" && !obj.logo) errs.push("Organization missing logo");
          if (obj["@type"] === "SoftwareApplication") {
            if (!obj.applicationCategory) errs.push("missing applicationCategory");
            if (!obj.operatingSystem) errs.push("missing operatingSystem");
            if (!obj.offers || obj.offers["@type"] !== "Offer" || obj.offers.price == null || !obj.offers.priceCurrency)
              errs.push("invalid offers");
          }
          console.log(`${obj["@type"]}: ${errs.length ? "FAIL " + errs.join("; ") : "VALID (parses as JSON-LD, @context schema.org, required properties present)"}`);
        }
      }
    }
    // per-page head checks
    const head = await page.evaluate(() => ({
      title: document.title,
      desc: document.querySelector('meta[name="description"]')?.content?.slice(0, 60),
      canonical: document.querySelector('link[rel="canonical"]')?.href,
      og: document.querySelector('meta[property="og:title"]')?.content,
      tw: document.querySelector('meta[name="twitter:card"]')?.content,
    }));
    if (w === 1280) console.log(`${name} head:`, JSON.stringify(head));
    await page.close();
  }
}
await browser.close();
