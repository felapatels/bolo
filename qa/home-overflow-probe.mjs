// One-off diagnostic: find which element(s) push the home page wider than the
// viewport on mobile (reported: boarding-pass ticket runs off screen).
//
// Run (from repo root):
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<clerk user id> \
//     NODE_PATH=/tmp/pw/node_modules node qa/home-overflow-probe.mjs
import { chromium } from "playwright-core";

const USER_ID = process.env.E2E_USER_ID;
const ORIGIN = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null;
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
if (!USER_ID || !ORIGIN || !CLERK_SECRET) throw new Error("need E2E_USER_ID, REPLIT_DEV_DOMAIN, CLERK_SECRET_KEY");

const log = (...a) => console.log(...a);

async function mintTicket(userId) {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${CLERK_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`clerk sign_in_tokens failed: ${JSON.stringify(body)}`);
  return body.token;
}

const PATHS = (process.env.E2E_PATHS || "/app").split(",");

async function main() {
  const ticket = await mintTicket(USER_ID);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${ticket}`, { waitUntil: "networkidle" });
  await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});

  for (const path of PATHS) {
    await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
    // let entrance animations & reconcile settle
    await page.waitForTimeout(2500);
    const report = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const doc = {
        vw,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      };
      const clippedBy = (el) => {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const ox = getComputedStyle(a).overflowX;
          if (ox === "hidden" || ox === "clip" || ox === "auto" || ox === "scroll") return true;
        }
        return false;
      };
      // 1. unclipped elements that stick out past the viewport
      const offenders = [];
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 1 && !clippedBy(el)) {
          const cls = typeof el.className === "string" ? el.className : (el.getAttribute("class") || "");
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: cls.slice(0, 90),
            left: Math.round(r.left),
            right: Math.round(r.right),
            width: Math.round(r.width),
            kids: el.children.length,
            text: (el.textContent || "").trim().slice(0, 40),
          });
        }
      }
      offenders.sort((a, b) => (b.right - b.width) - (a.right - a.width)); // prefer deep leaves? keep all
      // 2. recursive bisect: descend into whichever child restores the
      // viewport width when hidden, ends at the culprit leaf.
      const chain = [];
      let node = document.querySelector("main") || document.body;
      for (let depth = 0; depth < 20 && node; depth++) {
        let found = null;
        for (const child of node.children) {
          const prev = child.style.display;
          child.style.display = "none";
          const sw = document.documentElement.scrollWidth;
          child.style.display = prev;
          if (sw <= vw + 1) { found = child; break; }
        }
        if (!found) break;
        const cls = typeof found.className === "string" ? found.className : (found.getAttribute("class") || "");
        chain.push({
          tag: found.tagName.toLowerCase(),
          cls: cls.slice(0, 110),
          w: Math.round(found.getBoundingClientRect().width),
          scrollW: found.scrollWidth,
          text: (found.textContent || "").trim().slice(0, 40),
        });
        node = found;
      }
      return { doc, offenders: offenders.slice(0, 20), count: offenders.length, chain };
    });
    log(`\n=== ${path} ===`);
    log("doc:", JSON.stringify(report.doc));
    log(`UNCLIPPED offenders (${report.count}):`);
    for (const o of report.offenders) {
      log(` <${o.tag}> right=${o.right} left=${o.left} w=${o.width} kids=${o.kids} cls="${o.cls}" text="${o.text}"`);
    }
    log("bisect chain (each level: hiding this child restored viewport width):");
    for (const c of report.chain) {
      log(` <${c.tag}> w=${c.w} scrollW=${c.scrollW} cls="${c.cls}" text="${c.text}"`);
    }
    await page.screenshot({ path: `qa/shots/overflow-${path.replace(/\W+/g, "_")}.png` }).catch(() => {});
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
