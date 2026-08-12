// Verifies the Chacha-ji stall LANDMARK on the web journey map: it renders at
// every encounter station (3, 7, 11 ...), it sits in the gap after that stop,
// it never overlaps the current-stop marker, a station card, a zone postcard,
// a trackside signal, a signpost or other scenery, and simply rendering it
// calls no encounter endpoint and mints no Chai.
//
// QA-only: reads the running dev app, changes no product code.
//
// Run (from repo root):
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<clerk_user_id> \
//     NODE_PATH=$PWD/qa/node_modules node qa/chacha-stall-geometry.mjs
import { chromium } from "playwright-core";

const USER_ID = process.env.E2E_USER_ID;
const LABEL = process.env.E2E_LABEL || "map";
const ORIGIN = process.env.APP_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
if (!USER_ID || !CLERK_SECRET) throw new Error("E2E_USER_ID and CLERK_SECRET_KEY are required");

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

const ticket = await mintTicket(USER_ID);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || undefined,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 430, height: Number(process.env.E2E_VIEW_H || 900) },
});
// Never let the visit mint Chai: every encounter station is pre-marked seen in
// sessionStorage, which is exactly what the arrival soft stop checks. The
// endpoint watch below proves rendering asked for nothing either way.
await page.addInitScript(() => {
  for (const lang of ["hi", "gu", "ta", "mr", "ur"]) {
    for (let s = 3; s < 200; s += 4) window.sessionStorage.setItem(`chacha-${lang}-${s}`, "1");
  }
});
const encounterCalls = [];
page.on("request", (r) => {
  if (r.url().includes("/journey/chacha-encounters")) encounterCalls.push(`${r.method()} ${r.url()}`);
});

await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${ticket}`, { waitUntil: "networkidle" });
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
// Optional: switch the active line first, so the same owner account can be
// photographed both at station 1 (a line it has not started) and standing on
// an encounter station. Uses the app's own preferences write, exactly what the
// language picker does, and E2E_RESTORE_LANG puts it back afterwards.
async function setLang(code) {
  const out = await page.evaluate(async (c) => {
    const res = await fetch("/api/account/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeLanguage: c }),
    });
    return res.status;
  }, code);
  console.log(`set active language ${code}: HTTP ${out}`);
  await page.waitForTimeout(800);
}
if (process.env.E2E_LANG) await setLang(process.env.E2E_LANG);
await page.goto(`${ORIGIN}/journey`, { waitUntil: "networkidle" });
await page.getByText(/Boarding pass/i).waitFor({ timeout: 20000 });
await page.waitForTimeout(1500);

const data = await page.evaluate(() => {
  const layer = document.querySelector('[data-testid="journey-scenery-layer"]');
  const map = layer?.closest("svg")?.parentElement;
  if (!map) return { error: "map container not found" };
  const mapBox = map.getBoundingClientRect();
  const rel = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left - mapBox.left),
      y: Math.round(r.top - mapBox.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };
  // Furniture the stall must never sit on top of. Station markers and cards
  // carry aria-labels; the signal's own box includes 8px of transparent tap
  // padding around a 40x50 glyph, so compare against the glyph.
  const furniture = [];
  for (const el of map.querySelectorAll("*")) {
    const tid = el.getAttribute("data-testid") || "";
    const label = el.getAttribute("aria-label") || "";
    const r = rel(el);
    if (r.w === 0 || r.h === 0) continue;
    if (tid.startsWith("chacha-stall-")) continue;
    if (tid.startsWith("trackside-signal-")) {
      furniture.push({ kind: `${tid}-glyph`, x: r.x + 8, y: r.y + 8, w: r.w - 16, h: r.h - 16 });
    } else if (tid.startsWith("zone-signpost-")) furniture.push({ kind: tid, ...r });
    else if (tid === "scenery-item") furniture.push({ kind: "scenery", ...r });
    else if (tid === "journey-train" || tid.startsWith("journey-train")) furniture.push({ kind: "train", ...r });
    else if (/^Stop \d+ of \d+/.test(label)) furniture.push({ kind: `station:${label}`, ...r });
    else if (/^(Fare zone|Line facts)/i.test(label)) furniture.push({ kind: `zone:${label}`, ...r });
  }
  // The current-stop treatment: the pill and its "Bolo is waiting here" card.
  for (const el of map.querySelectorAll("*")) {
    if (el.children.length === 0 && /Bolo is waiting here/.test(el.textContent || "")) {
      let node = el;
      for (let i = 0; i < 3 && node.parentElement; i++) node = node.parentElement;
      furniture.push({ kind: "current-stop", ...rel(node) });
    }
  }
  const stalls = [...map.querySelectorAll('[data-testid^="chacha-stall-"]')].map((el) => ({
    station: Number(el.getAttribute("data-testid").replace("chacha-stall-", "")),
    transform: el.getAttribute("transform"),
    ...rel(el),
  }));
  // Station labels count within their fare zone ("Stop 3 of 9"), so the global
  // station number is the row's rank down the map.
  const stationRows = furniture
    .filter((f) => f.kind.startsWith("station:"))
    .map((f) => Math.round(f.y + f.h / 2))
    .sort((a, b) => a - b)
    .map((y, i) => ({ n: i + 1, y }));
  return { mapW: Math.round(mapBox.width), stalls, furniture, stationRows };
});

const overlaps = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

console.log(`LABEL ${LABEL}  mapW=${data.mapW}  stalls=${data.stalls.length}`);
const rowY = new Map(data.stationRows.map((r) => [r.n, r.y]));
console.log("station rows:", data.stationRows.map((r) => `${r.n}@${r.y}`).join(" "));
console.log(
  "stalls:",
  data.stalls.map((s) => `#${s.station}@(${s.x},${s.y},${s.w}x${s.h})`).join(" "),
);

// 1. one stall per encounter station, whatever the learner's position
const expected = [];
for (let s = 3; s <= data.stationRows.length; s += 4) expected.push(s);
const got = data.stalls.map((s) => s.station).sort((a, b) => a - b);
const okSet = JSON.stringify(got) === JSON.stringify(expected);
console.log(
  `${okSet ? "PASS" : "FAIL"} stall at every encounter station`,
  `expected ${expected.join(",")} got ${got.join(",")}`,
);

// 2. seated in the gap AFTER its station (below that row, above the next)
let okAfter = true;
for (const s of data.stalls) {
  const here = rowY.get(s.station);
  const next = rowY.get(s.station + 1);
  const top = s.y;
  const bottom = s.y + s.h;
  const ok = here != null && top > here && (next == null || bottom < next);
  if (!ok) okAfter = false;
  console.log(`  station ${s.station}: row=${here} stall ${top}..${bottom} nextRow=${next} ${ok ? "ok" : "BAD"}`);
}
console.log(`${okAfter ? "PASS" : "FAIL"} every stall sits in the gap after its stop`);

// 3. no overlap with any existing map furniture
let collisions = 0;
for (const s of data.stalls) {
  for (const f of data.furniture) {
    if (overlaps(s, f)) {
      collisions += 1;
      if (collisions < 12)
        console.log(
          `  COLLIDE stall#${s.station} (${s.x},${s.y},${s.w}x${s.h}) vs ${f.kind} (${f.x},${f.y},${f.w}x${f.h})`,
        );
    }
  }
}
console.log(`${collisions === 0 ? "PASS" : "FAIL"} no overlap with map furniture (${collisions})`);

// 4. rendering is not triggering
console.log(
  `${encounterCalls.length === 0 ? "PASS" : "FAIL"} rendering called no encounter endpoint`,
  encounterCalls.join(" | "),
);

// Screenshots: the first stalls ahead of the learner, then the learner's own
// row if they stand on an encounter station.
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
await page.screenshot({ path: `qa/shots/chacha-stall-${LABEL}-top.png` });
const firstStall = data.stalls[0];
if (firstStall) {
  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 320)), firstStall.y);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `qa/shots/chacha-stall-${LABEL}-first.png` });
}
const current = await page
  .locator("text=Bolo is waiting here")
  .first()
  .boundingBox()
  .catch(() => null);
if (current) {
  await page.evaluate((y) => window.scrollBy(0, y - 300), current.y);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `qa/shots/chacha-stall-${LABEL}-current.png` });
}
if (process.env.E2E_RESTORE_LANG) await setLang(process.env.E2E_RESTORE_LANG);
await browser.close();
