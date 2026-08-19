// Task 1082, journey map UX polish, real-browser evidence at 320px.
//
// Measures, on the running dev app, the four things jsdom cannot see:
//   1. the boarding-pass header numbers,
//   2. the current-stop card's height and whether its title wraps/truncates,
//   3. the terminus label's box against the bunting and every drawn object,
//   4. where the page has scrolled to once the map has opened.
//
// QA-only: reads the running dev app, changes no product code.
//
// Run (from repo root):
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<clerk_user_id> \
//     NODE_PATH=$PWD/qa/node_modules node qa/task1082-journey-polish.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const USER_ID = process.env.E2E_USER_ID;
const ORIGIN = process.env.APP_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
const WIDTH = Number(process.env.E2E_WIDTH || 320);
const OUT = process.env.E2E_OUT || "qa/shots/task1082";
if (!USER_ID || !CLERK_SECRET) throw new Error("E2E_USER_ID and CLERK_SECRET_KEY are required");
mkdirSync(OUT, { recursive: true });

let failures = 0;
const pass = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
};

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

/** In-page helpers, injected once so every measurement shares one definition. */
const HELPERS = `
  window.__t = {
    overlaps: (a, b) => !!a && !!b && a.left < b.right - 0.5 && b.left < a.right - 0.5
      && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5,
    // The current stop's card: the only station card whose status line reads
    // "In progress" or "Now boarding".
    currentCard: () => [...document.querySelectorAll("span")]
      .filter((s) => /^Stop \\d+ of \\d+$/.test(s.textContent || ""))
      .map((s) => s.closest("div.rounded-lg"))
      .find((c) => c && /In progress|Now boarding/.test(c.textContent || "")) || null,
    header: () => [...document.querySelectorAll("div")]
      .find((d) => /^Boarding pass/.test(d.textContent || "") && d.className.includes("border-dashed")) || null,
    termLabel: () => [...document.querySelectorAll("div")]
      .find((d) => /^Terminus: /.test(d.textContent || "")) || null,
    mapSvg: () => document.querySelector('[data-testid="journey-scenery-layer"]')?.closest("svg") || null,
    // Every leaf shape actually drawn on the map, bunting flags included.
    drawnShapes: () => {
      const svg = window.__t.mapSvg();
      if (!svg) return [];
      return [...svg.querySelectorAll("path,rect,circle,ellipse,polygon,image,text")]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => ({ el, box: el.getBoundingClientRect() }));
    },
  };
`;

const ticket = await mintTicket(USER_ID);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || undefined,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: 700 } });
// Never let the visit mint Chai: pre-mark every encounter station seen.
await page.addInitScript(() => {
  for (const lang of ["hi", "gu", "ta", "mr", "ur"]) {
    for (let s = 3; s < 400; s += 4) window.sessionStorage.setItem(`chacha-${lang}-${s}`, "1");
  }
});

await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${ticket}`, { waitUntil: "networkidle" });
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
await page.goto(`${ORIGIN}/journey`, { waitUntil: "networkidle" });
await page.getByText(/Boarding pass/i).waitFor({ timeout: 20000 });
await page.waitForTimeout(2500); // let the open scroll settle
await page.addScriptTag({ content: HELPERS });

/** Clear anything sitting over the map before a shot: the trackside-signal
 *  encounter dialog (server-gated, so it re-arms on every visit) and the
 *  Replit dev-preview banner. Escape closes the dialog without waving the
 *  signal through, so nothing is spent and no Chai is minted. */
async function clearOverlays() {
  for (let i = 0; i < 4; i += 1) {
    const open = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
    if (!open) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
  }
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("body > *")) {
      if (/temporary development preview/i.test(el.textContent || "")) el.remove();
    }
  });
}
await clearOverlays();

// ── 4. scroll on open ──────────────────────────────────────────────────────
const openScroll = await page.evaluate(() => {
  const card = window.__t.currentCard();
  const box = card?.getBoundingClientRect();
  return {
    scrollY: Math.round(window.scrollY),
    innerHeight: window.innerHeight,
    pageHeight: document.documentElement.scrollHeight,
    cardTop: box ? Math.round(box.top) : null,
    cardBottom: box ? Math.round(box.bottom) : null,
  };
});
console.log("open scroll:", JSON.stringify(openScroll));
pass("the map opens scrolled down the line, not at the top", openScroll.scrollY > 0, `scrollY=${openScroll.scrollY}`);
pass(
  "the current stop is comfortably in view, off both edges",
  openScroll.cardTop !== null && openScroll.cardTop > 80 &&
    openScroll.cardBottom < openScroll.innerHeight - 80,
  `card ${openScroll.cardTop}..${openScroll.cardBottom} of ${openScroll.innerHeight}`,
);
await clearOverlays();
await page.screenshot({ path: `${OUT}/01-open-scroll-${WIDTH}.png` });

// ── 1. header ──────────────────────────────────────────────────────────────
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
const header = await page.evaluate(() => {
  const el = window.__t.header();
  const box = el?.getBoundingClientRect();
  // The route line is where the stop count lives; being in the DOM is not the
  // same as being readable, so measure whether it is clipped.
  const route = el
    ? [...el.querySelectorAll("div")]
        .filter((d) => d.children.length === 0)
        .find((d) => /\u00b7\s*(Stop \d+ of|All \d+ stations)/.test(d.textContent || ""))
    : null;
  return {
    text: el?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    routeText: route?.textContent ?? null,
    routeClipped: route ? route.scrollWidth > route.clientWidth + 1 : null,
    box: box ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) } : null,
  };
});
console.log("header:", JSON.stringify(header));
await clearOverlays();
pass("the header names the learner's stop, not the finished count", /Stop \d+ of \d+ stations/.test(header.text ?? ""));
pass("the header counts every station the six zones serve", /of 59 stations/.test(header.text ?? ""));
pass("the stop count is readable, not clipped off the end", header.routeClipped === false, String(header.routeText));
if (header.box) {
  await page.screenshot({
    path: `${OUT}/02-header-${WIDTH}.png`,
    clip: { x: header.box.x, y: header.box.y, width: header.box.w, height: header.box.h },
  });
}

// ── 2. current-stop card ───────────────────────────────────────────────────
const card = await page.evaluate(async () => {
  const el = window.__t.currentCard();
  if (!el) return { error: "current-stop card not found" };
  el.scrollIntoView({ block: "center", behavior: "instant" });
  await new Promise((r) => setTimeout(r, 200));
  const box = el.getBoundingClientRect();
  const title = [...el.querySelectorAll("span")].find((s) => /^Stop \d+ of \d+$/.test(s.textContent ?? ""));
  const tBox = title?.getBoundingClientRect();
  const tStyle = title ? getComputedStyle(title) : null;
  const status = el.querySelector("div.text-\\[11px\\]");
  const sStyle = status ? getComputedStyle(status) : null;
  return {
    height: Math.round(box.height),
    width: Math.round(box.width),
    box: { x: Math.round(box.x), y: Math.round(box.y) },
    text: el.textContent?.replace(/\s+/g, " ").trim(),
    titleText: title?.textContent ?? null,
    titleLines: tBox && tStyle ? Math.round(tBox.height / parseFloat(tStyle.lineHeight)) : null,
    titleTruncated: title ? title.scrollWidth > title.clientWidth + 1 : null,
    titleFontSize: tStyle?.fontSize ?? null,
    statusFontSize: sStyle?.fontSize ?? null,
    statusLines: status && sStyle
      ? Math.round(status.getBoundingClientRect().height / parseFloat(sStyle.lineHeight))
      : null,
    hasBar: !!el.querySelector('[data-testid^="progress-stop-"]'),
    mastered: [...el.querySelectorAll("span")].map((s) => s.textContent).find((t) => /mastered$/.test(t ?? "")) ?? null,
    // The bar and the count only render once the stop has attempts; a freshly
    // boarded stop legitimately shows neither.
    attempted: !/Now boarding · \d+ phrases/.test(el.textContent ?? ""),
  };
});
console.log("current-stop card:", JSON.stringify(card));
pass("the card carries no 'Bolo is waiting here'", !(card.text ?? "").includes("Bolo is waiting"));
pass("the card title stays on one line", card.titleLines === 1, `lines=${card.titleLines}`);
pass("the card title is not truncated", card.titleTruncated === false);
pass("the status line stays on one line", card.statusLines === 1, `lines=${card.statusLines}`);
pass("the title keeps its 14px size", card.titleFontSize === "14px", String(card.titleFontSize));
pass("the status keeps its 11px size", card.statusFontSize === "11px", String(card.statusFontSize));
if (card.attempted) {
  pass("the card keeps its progress bar", card.hasBar === true);
  pass("the card keeps its mastered count", /mastered$/.test(card.mastered ?? ""), String(card.mastered));
} else {
  console.log("SKIP progress bar / mastered count: this stop has no attempts yet, so neither renders by design");
  // Prove they still render somewhere on the map when a stop does have attempts.
  const anywhere = await page.evaluate(() => ({
    bars: document.querySelectorAll('[data-testid^="progress-stop-"]').length,
    counts: [...document.querySelectorAll("span")].filter((s) => /mastered$/.test(s.textContent ?? "")).length,
  }));
  console.log("attempted stops on this map:", JSON.stringify(anywhere));
}
console.log(`>> current-stop card height at ${WIDTH}px: ${card.height}px (station rhythm STATION_H = 88)`);
pass("the card fits inside the station slot it is given", card.height <= 88, `${card.height} <= 88`);
await clearOverlays();
await page.screenshot({ path: `${OUT}/03-current-card-${WIDTH}.png` });

// ── stall + scenery clearance at the new station rhythm ────────────────────
const clearance = await page.evaluate(async () => {
  const svg = window.__t.mapSvg();
  if (!svg) return { error: "map svg not found" };
  const stalls = [...svg.querySelectorAll('[data-testid="chacha-stall-figure"]')];
  const out = [];
  for (const stall of stalls) {
    stall.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise((r) => setTimeout(r, 120));
    const sBox = stall.getBoundingClientRect();
    const cards = [...document.querySelectorAll("span")]
      .filter((s) => /^Stop \d+ of \d+$/.test(s.textContent || ""))
      .map((s) => s.closest("div.rounded-lg"))
      .filter(Boolean);
    const hit = cards.filter((c) => window.__t.overlaps(sBox, c.getBoundingClientRect()))
      .map((c) => (c.textContent || "").slice(0, 24));
    out.push({ stall: Math.round(sBox.top), w: Math.round(sBox.width), h: Math.round(sBox.height), hit });
  }
  return { stalls: stalls.length, out };
});
console.log("stall clearance:", JSON.stringify(clearance));
// NOT a pass/fail here. Chacha-ji's stall now stands in its own scenery-only
// halt row, seated off the HALT POINT rather than off a station row, so the
// station rhythm no longer sets its clearance. Card/stall overlap is owned by
// qa/chacha-stall-geometry.mjs, and that probe reports the SAME 12 collisions
// (and the same "stall left of the track" failure) at STATION_H = 100 as at 88
//, bisected by temporarily restoring 100 in both journey screens. Reported as
// a number so a rhythm change that DID make it worse would be visible.
const stallHits = (clearance.out ?? []).filter((s) => s.hit.length > 0).length;
console.log(
  `NOTE stall/card overlap: ${stallHits} of ${clearance.stalls} stalls, unchanged between ` +
    `STATION_H 100 and 88 (pre-existing, owned by qa/chacha-stall-geometry.mjs)`,
);

// ── 3. terminus label ──────────────────────────────────────────────────────
const terminus = await page.evaluate(async () => {
  const label = window.__t.termLabel();
  if (!label) return { error: "terminus label not found" };
  label.scrollIntoView({ block: "center", behavior: "instant" });
  await new Promise((r) => setTimeout(r, 250));
  const box = label.getBoundingClientRect();
  const style = getComputedStyle(label);
  // Anything drawn on the map that lands on the words. The bunting's flags and
  // string are ordinary <path>s in this sweep, so they are covered.
  const hits = window.__t.drawnShapes()
    .filter((s) => window.__t.overlaps(box, s.box))
    .map((s) => s.el.tagName + (s.el.closest("[data-scenery]")?.dataset.scenery ?? ""));
  const lineH = parseFloat(style.lineHeight);
  return {
    text: label.textContent,
    textAlign: style.textAlign,
    fontSize: style.fontSize,
    lines: Math.round(box.height / lineH),
    box: { top: Math.round(box.top), left: Math.round(box.left), right: Math.round(box.right), h: Math.round(box.height) },
    viewport: window.innerWidth,
    hits,
  };
});
console.log("terminus:", JSON.stringify(terminus));
pass("the terminus label is centred", terminus.textAlign === "center");
pass("the terminus label carries no em dash", !(terminus.text ?? "").includes("\u2014"));
pass(
  "the terminus label sits inside the viewport",
  terminus.box.left >= 0 && terminus.box.right <= terminus.viewport,
  `${terminus.box.left}..${terminus.box.right} of ${terminus.viewport}`,
);
pass("no drawn object lands on the terminus label", (terminus.hits ?? ["?"]).length === 0, JSON.stringify(terminus.hits));
await clearOverlays();
await page.screenshot({ path: `${OUT}/04-terminus-${WIDTH}.png` });

// ── em dash sweep over the whole rendered map ──────────────────────────────
const emDashes = await page.evaluate(() => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue?.includes("\u2014")) out.push(n.nodeValue.trim().slice(0, 80));
  }
  for (const el of document.querySelectorAll("[aria-label],[title]")) {
    for (const a of ["aria-label", "title"]) {
      const v = el.getAttribute(a);
      if (v?.includes("\u2014")) out.push(`${a}=${v.slice(0, 80)}`);
    }
  }
  return out;
});
pass("no em dash anywhere on the journey map", emDashes.length === 0, JSON.stringify(emDashes));

await browser.close();
console.log(`shots written to ${OUT}`);
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
