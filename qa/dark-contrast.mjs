// Dark mode readability audit.
//
// Reasoning about which Tailwind class lacks a `dark:` variant finds
// candidates, not failures: a hardcoded `bg-white` behind dark text is fine,
// and a semantic token can still land light-on-light. So this measures what a
// learner actually sees. It signs in, forces the dark theme BEFORE the app
// boots, walks the real pages, and computes the WCAG contrast ratio of every
// visible run of text against the background actually painted behind it.
//
//   E2E_USER_ID=user_... CHROME_BIN=... node qa/dark-contrast.mjs
//   PAGES=/chat,/journey   limits the walk.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/dark";
mkdirSync(OUT, { recursive: true });

const PAGES = (
  process.env.PAGES ?? "/,/chat,/journey,/bazaar,/progress,/account,/games"
).split(",");

async function signInToken() {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: process.env.E2E_USER_ID }),
  });
  const tk = await res.json();
  if (!res.ok) throw new Error(`sign-in token: ${JSON.stringify(tk)}`);
  return tk.token;
}

// Runs in the page. Returns every failing text run, worst first.
const AUDIT = () => {
  // Colours are read back in whatever space the browser feels like: a
  // Tailwind opacity modifier serializes as `oklab(... / 0.8)`, and pulling
  // numbers out of that string with a regex reads the lightness as a red
  // channel and calls a pale grey nearly black. So let the browser do the
  // conversion: paint the colour onto a known background and read the pixel.
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const paint = (base, color) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = `rgb(${base.join(",")})`;
    cx.fillRect(0, 0, 1, 1);
    cx.fillStyle = color;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const transparent = (c) => !c || c === "transparent" || /,\s*0\)$/.test(c);
  // Opaque means it hides what is under it: paint it over black and over
  // white and see whether the two agree.
  const opaque = (c) => {
    const a = paint([0, 0, 0], c);
    const b = paint([255, 255, 255], c);
    return a.every((v, i) => Math.abs(v - b[i]) <= 1);
  };
  const lum = ([r, g, b]) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };

  // What is painted behind this element: the first ancestor with an opaque
  // enough background, alpha-composited down. An image or gradient background
  // is unmeasurable this way, so those elements are reported separately rather
  // than guessed at.
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== "none")
        return { image: true };
      const c = s.backgroundColor;
      if (transparent(c)) continue;
      layers.push(c);
      if (opaque(c)) break;
    }
    let base = [255, 255, 255];
    for (const c of layers.reverse()) base = paint(base, c);
    return { color: base };
  };

  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || +s.opacity === 0)
      continue;
    if (transparent(s.color)) continue;
    const bg = backdrop(el);
    if (bg.image) continue; // photographs and gradients: eyeball these

    const px = parseFloat(s.fontSize);
    const bold = +s.fontWeight >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const cr = ratio(paint(bg.color, s.color), bg.color);
    const need = large ? 3 : 4.5;
    if (cr >= need) continue;

    const key = `${own.slice(0, 40)}|${s.color}|${Math.round(cr * 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      text: own.slice(0, 60),
      ratio: +cr.toFixed(2),
      need,
      color: s.color,
      bg: `rgb(${bg.color.map(Math.round).join(",")})`,
      cls: (typeof el.className === "string" ? el.className : "").slice(0, 120),
      y: Math.round(r.top + window.scrollY),
    });
  }
  return out.sort((a, b) => a.ratio - b.ratio);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({
  viewport: { width: 402, height: 874 },
  colorScheme: "dark",
});
// The theme is read from localStorage at first paint, so it has to be there
// before any app code runs.
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("bolo.theme", "dark");
  } catch {}
});

const page = await ctx.newPage();
await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${await signInToken()}`, {
  waitUntil: "networkidle",
});
await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});

// Some of the worst offenders only exist inside a dialog, so a page walk that
// never opens one misses them. Each entry opens what the page hides.
const OPEN = {
  "/journey": ['[data-testid="signal-scene"]', '[data-testid="signpost-fact"]'],
};

let total = 0;
for (const path of PAGES) {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    document.getElementById("replit-dev-banner")?.remove();
  });
  const dark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  const bad = await page.evaluate(AUDIT);
  for (const sel of OPEN[path] ?? []) {
    const el = page.locator(sel).first();
    if (!(await el.count())) continue;
    await el.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    for (const b of await page.evaluate(AUDIT))
      if (!bad.some((x) => x.text === b.text)) bad.push({ ...b, sel });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
  bad.sort((a, b) => a.ratio - b.ratio);
  total += bad.length;
  const name = path === "/" ? "home" : path.replace(/\//g, "");
  console.log(`\n### ${path}  (dark=${dark})  ${bad.length} unreadable`);
  for (const b of bad.slice(0, 14))
    console.log(
      `  ${b.ratio.toFixed(2)}:1 (needs ${b.need})  "${b.text}"  ${b.color} on ${b.bg}\n      ${b.cls}`,
    );
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

await browser.close();
console.log(`\n${total} unreadable text runs across ${PAGES.length} pages`);
process.exit(total ? 1 : 0);
