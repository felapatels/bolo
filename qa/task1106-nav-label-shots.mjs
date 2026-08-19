// Task #1106 verification, the mobile centre tab label ("Bolo Chat").
//
// Captured from the Expo WEB build (react-native-web renders the same
// component tree; there is no device or emulator in this environment) at the
// NARROWEST supported width, 320 CSS px, in light and dark mode.
//
// It measures, rather than eyeballs:
//   • the tab bar's height (must stay 74) and the circle's bottom offset,
//   • the centre label's box: one line, no truncation (scrollWidth fits),
//   • every tab label's BASELINE-proxy bottom edge (the other four must not
//     have moved, and the centre block's last line must sit level with them),
//   • the vertical gap between the label's top edge and the raised circle.
//
// Widths sweep 320 (the narrowest supported phone), 360 and 375; shots are
// taken at 320, the worst case.
//
//   CHROME_BIN=$(which chromium) node qa/task1106-nav-label-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const OUT = "qa/shots/task1106";
const EMAIL = "d1bm+clerk_test@example.com";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});

// Reads the tab bar geometry out of the live DOM. RN-web renders each tab
// label as a text node; the bar itself is the element that carries the
// floating pill's 74px height.
const MEASURE = () => {
  const texts = ["Home", "Games", "Bolo Chat", "Progress"];
  const all = [...document.querySelectorAll("div,span")];
  const labels = {};
  for (const t of texts) {
    const el = all
      .filter((e) => e.textContent?.trim() === t && e.children.length === 0)
      .pop();
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const lineHeight =
      cs.lineHeight === "normal"
        ? parseFloat(cs.fontSize) * 1.2
        : parseFloat(cs.lineHeight);
    labels[t] = {
      left: +r.left.toFixed(1),
      right: +r.right.toFixed(1),
      top: +r.top.toFixed(1),
      bottom: +r.bottom.toFixed(1),
      width: +r.width.toFixed(1),
      height: +r.height.toFixed(1),
      fontSize: cs.fontSize,
      color: cs.color,
      // Truncation / wrap detectors.
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      lines: Math.max(1, Math.round(r.height / lineHeight)),
    };
  }
  // The floating pill: the ancestor of the Home label whose height is 74.
  let bar = null;
  let node = all.find(
    (e) => e.textContent?.trim() === "Home" && e.children.length === 0,
  );
  while (node) {
    const r = node.getBoundingClientRect();
    if (Math.round(r.height) === 74) {
      bar = {
        top: +r.top.toFixed(1),
        bottom: +r.bottom.toFixed(1),
        height: +r.height.toFixed(1),
        left: +r.left.toFixed(1),
        right: +r.right.toFixed(1),
      };
      break;
    }
    node = node.parentElement;
  }
  // The raised circle: the 58x58 round element in the centre slot.
  const circleEl = [...document.querySelectorAll("div")].find((e) => {
    const r = e.getBoundingClientRect();
    return Math.round(r.width) === 58 && Math.round(r.height) === 58;
  });
  const circle = circleEl
    ? (() => {
        const r = circleEl.getBoundingClientRect();
        return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1) };
      })()
    : null;
  return { labels, bar, circle, viewport: window.innerWidth };
};

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}, ${msg}`);
  if (!ok) failures += 1;
};

const RUNS = [
  { width: 320, scheme: "light", shots: true },
  { width: 320, scheme: "dark", shots: true },
  { width: 360, scheme: "light", shots: false },
  { width: 375, scheme: "light", shots: false },
];

for (const { width, scheme, shots } of RUNS) {
  const page = await browser.newPage({
    viewport: { width, height: 720 },
    deviceScaleFactor: 3,
    colorScheme: scheme,
  });
  page.on("pageerror", (e) =>
    console.log("pageerror:", String(e).slice(0, 200)),
  );

  console.log(`\n=== ${scheme} @${width} ===`);
  await page.goto(ORIGIN, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForTimeout(3000);

  if (await page.getByText("Welcome back").count()) {
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByText("Email me a sign-in code instead").click();
    await page.getByPlaceholder("123456").waitFor({ timeout: 30000 });
    await page.getByPlaceholder("123456").fill("424242");
    await page.getByText("Verify & sign in").click();
    await page.waitForTimeout(8000);
  }
  if (await page.getByText("Choose your language").count()) {
    await page.getByTestId("choose-lang-hi").click();
    await page.waitForTimeout(6000);
  }
  const skipTour = page.getByLabel("Skip tour");
  if (await skipTour.count()) {
    await skipTour.first().click();
    await page.waitForTimeout(1500);
  }
  await page
    .getByText("Bolo Chat")
    .first()
    .waitFor({ timeout: 120000 })
    .catch(async () => {
      console.log((await page.evaluate(() => document.body.innerText)).slice(0, 800));
      throw new Error("tab bar never rendered");
    });
  await page.waitForTimeout(2500);

  const m = await page.evaluate(MEASURE);
  console.log(JSON.stringify(m, null, 1));

  const bolo = m.labels["Bolo Chat"];
  check(!!bolo, "the centre label reads 'Bolo Chat'");
  check(m.bar?.height === 74, `tab bar height is 74 (got ${m.bar?.height})`);
  check(bolo?.lines === 1, `centre label is one line (got ${bolo?.lines})`);
  check(
    bolo && bolo.scrollWidth <= bolo.clientWidth,
    `centre label is not truncated (scroll ${bolo?.scrollWidth} <= client ${bolo?.clientWidth})`,
  );
  check(
    bolo && bolo.left >= 0 && bolo.right <= m.viewport,
    `centre label is inside the ${width}px viewport (${bolo?.left}–${bolo?.right})`,
  );
  check(bolo?.fontSize === "11px", `centre label is 11px (got ${bolo?.fontSize})`);
  const siblings = ["Home", "Games", "Progress"]
    .map((k) => m.labels[k]?.bottom)
    .filter((v) => v != null);
  const spread = Math.max(...siblings) - Math.min(...siblings);
  check(spread < 0.6, `the other tab labels share one baseline (spread ${spread.toFixed(2)}px)`);
  check(
    bolo && Math.abs(bolo.bottom - siblings[0]) < 1.5,
    `centre label's last line sits on that same baseline (Δ ${bolo ? (bolo.bottom - siblings[0]).toFixed(2) : "?"}px)`,
  );
  check(
    bolo && m.circle && bolo.top > m.circle.bottom,
    `centre label clears the raised circle (gap ${bolo && m.circle ? (bolo.top - m.circle.bottom).toFixed(2) : "?"}px)`,
  );

  if (shots) await page.screenshot({ path: `${OUT}/home-${scheme}-${width}.png` });
  // Tight crop on the floating bar so the label treatment is readable.
  if (shots && m.bar) {
    await page.screenshot({
      path: `${OUT}/navbar-${scheme}-${width}.png`,
      clip: {
        x: 0,
        y: Math.max(0, m.bar.top - 34),
        width,
        height: Math.min(140, 720 - Math.max(0, m.bar.top - 34)),
      },
    });
  }
  // Chat tab focused, the label must stay brand-coloured in both states.
  // Click the label text, not the parrot: the parrot never stops moving, so
  // Playwright's stability wait never settles on it.
  await page.getByText("Bolo Chat").first().click();
  await page.waitForTimeout(4000);
  const focused = await page.evaluate(MEASURE);
  console.log("focused centre label:", JSON.stringify(focused.labels["Bolo Chat"]));
  check(
    focused.labels["Bolo Chat"]?.color === bolo?.color,
    `centre label keeps the same brand colour when focused (${focused.labels["Bolo Chat"]?.color})`,
  );
  if (shots && focused.bar) {
    await page.screenshot({
      path: `${OUT}/navbar-${scheme}-${width}-focused.png`,
      clip: {
        x: 0,
        y: Math.max(0, focused.bar.top - 34),
        width,
        height: Math.min(140, 720 - Math.max(0, focused.bar.top - 34)),
      },
    });
  }
  await page.close();
}

await browser.close();
console.log(`\nshots written to ${OUT}; failures: ${failures}`);
process.exit(failures ? 1 : 0);
