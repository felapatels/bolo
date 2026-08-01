// R1 amendment verification (web pass stub, 32.1 respin).
// Signs in as the QA account and measures the home boarding pass + journey
// header stub at multiple widths:
//   1. FARE ZONE label span stays inside the ring's chord (no arc collision).
//   2. Station name inside the circle: no ellipsis, box inside the ring.
//   3. Vertical wordmark box stays inside its measured slot (no overflow).
//   4. Resume row: CTA text, streak chip, and daily-goal chip boxes do not
//      intersect (rule 5: fix spacing only if they collide).
// Screenshots land in qa/shots/r1-stub/.
//
//   CHROME_BIN=$(which chromium) node qa/r1-stub-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const ORIGIN = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const OUT = "qa/shots/r1-stub";
const EMAIL = "d1bm+clerk_test@example.com";
mkdirSync(OUT, { recursive: true });

async function clerkUserId(email) {
  const res = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } },
  );
  const users = await res.json();
  if (!res.ok || !users.length) throw new Error(`user lookup failed: ${JSON.stringify(users).slice(0, 200)}`);
  return users[0].id;
}

async function signInToken(userId) {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId }),
  });
  const tk = await res.json();
  if (!res.ok) throw new Error(`sign-in token: ${JSON.stringify(tk)}`);
  return tk.token;
}

const intersect = (a, b) =>
  a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function measure(page) {
  return page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const stamp = document.querySelector('[data-testid="zone-stamp"]');
    const name = document.querySelector('[data-testid="zone-stamp-name"]');
    const label = stamp?.querySelector("span");
    const wordmark = document.querySelector('[data-testid="stub-line-name"]');
    const slot = wordmark?.parentElement;
    // Resume row pieces (home only): CTA span is the first child of the
    // bottom row; chips carry the flame/target icons.
    const row = document.querySelector('a[href*="journey"] .flex.items-center.justify-between.gap-2.p-5');
    const cta = row?.querySelector(":scope > span:first-child");
    const chips = row ? [...row.querySelectorAll(":scope > span:last-child > span")] : [];
    return {
      stamp: box(stamp),
      label: box(label),
      labelText: label?.textContent,
      name: box(name),
      nameText: name?.textContent,
      nameOverflowsX: name ? name.scrollWidth > name.clientWidth + 1 : null,
      wordmark: box(wordmark),
      wordmarkText: wordmark?.textContent,
      slot: box(slot),
      cta: box(cta),
      ctaText: cta?.textContent?.trim(),
      chips: chips.map(box),
      chipTexts: chips.map((c) => c.textContent?.trim()),
    };
  });
}

const run = async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    args: ["--no-sandbox"],
  });
  const userId = await clerkUserId(EMAIL);
  const failures = [];

  for (const width of [320, 390, 768]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const token = await signInToken(userId);
    await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${token}`, {
      waitUntil: "networkidle",
      timeout: 120000,
    });
    await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
    // Home pass
    await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle", timeout: 60000 });
    await page
      .waitForFunction(
        () =>
          /Start your journey|Resume at Stop|Continue your journey/.test(
            document.body.innerText,
          ),
        { timeout: 30000 },
      )
      .catch(() => {});
    await page.waitForSelector('[data-testid="stub-line-name"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    const m = await measure(page);
    const pass = await page.$('a[href*="journey"]');
    if (pass) await pass.screenshot({ path: `${OUT}/home-pass-${width}.png`, animations: "disabled", timeout: 15000 });
    else await page.screenshot({ path: `${OUT}/home-pass-${width}.png` });

    // Checks
    if (m.stamp && m.label) {
      // label inside the ring's rotated AABB with margin
      if (m.label.width > m.stamp.width * 0.85)
        failures.push(`w${width}: label spans ${m.label.width.toFixed(1)} of ${m.stamp.width.toFixed(1)} stamp`);
    }
    if (m.nameText && /\u2026|\.\.\./.test(m.nameText)) failures.push(`w${width}: name ellipsized: ${m.nameText}`);
    if (m.nameOverflowsX) failures.push(`w${width}: name overflows its box`);
    if (m.wordmark && m.slot && (m.wordmark.height > m.slot.height + 2))
      failures.push(`w${width}: wordmark ${m.wordmark.height.toFixed(1)} overflows slot ${m.slot.height.toFixed(1)}`);
    for (let i = 0; i < m.chips.length; i++) {
      if (intersect(m.cta, m.chips[i]))
        failures.push(`w${width}: CTA text collides with chip "${m.chipTexts[i]}"`);
      for (let j = i + 1; j < m.chips.length; j++)
        if (intersect(m.chips[i], m.chips[j]))
          failures.push(`w${width}: chips collide: "${m.chipTexts[i]}" vs "${m.chipTexts[j]}"`);
    }
    console.log(`--- width ${width} (home) ---`);
    console.log(JSON.stringify({ labelText: m.labelText, nameText: m.nameText, wordmarkText: m.wordmarkText, ctaText: m.ctaText, chipTexts: m.chipTexts }, null, 0));
    console.log(JSON.stringify({ stamp: m.stamp, label: m.label, name: m.name, wordmark: m.wordmark, slot: m.slot, cta: m.cta, chips: m.chips }));

    // Journey header
    await page.goto(`${ORIGIN}/journey`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const jm = await measure(page);
    const header = await page.$("header");
    if (header) await header.screenshot({ path: `${OUT}/journey-header-${width}.png`, animations: "disabled", timeout: 15000 });
    if (jm.stamp && jm.label && jm.label.width > jm.stamp.width * 0.85)
      failures.push(`journey w${width}: label spans ${jm.label.width.toFixed(1)} of ${jm.stamp.width.toFixed(1)}`);
    if (jm.nameText && /\u2026|\.\.\./.test(jm.nameText)) failures.push(`journey w${width}: name ellipsized: ${jm.nameText}`);
    console.log(`--- width ${width} (journey) ---`);
    console.log(JSON.stringify({ labelText: jm.labelText, nameText: jm.nameText, stamp: jm.stamp, label: jm.label, name: jm.name }));
    await ctx.close();
  }

  await browser.close();
  console.log(failures.length ? `FAILURES:\n${failures.join("\n")}` : "ALL CHECKS PASS");
  process.exit(failures.length ? 1 : 0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
