// Real-browser render checks for the D1b journey map (/journey).
//
// QA-only: exercises the running dev app, changes no product code.
//
// Run (from repo root):
//   CHROME_BIN=$(which chromium) E2E_USER_ID=<clerk_user_id> E2E_SCENARIO=<name> \
//     NODE_PATH=/tmp/pw/node_modules node qa/journey-map-e2e.mjs
//
// Scenarios:
//   teaser  - Free user whose active language is plan-locked with teaser open:
//             showroom mode (the first live C-frontend / A-backend wiring).
//   plus    - Plus user: full map, real progress states, station -> practice.
//   free    - Free user on their allowed language: normal map, sentence
//             stations route through the Plus entitlement dialog.
//   picker  - Free user taps a LOCKED language in the language picker: the
//             real navigation path into the showroom (no shims). Also checks
//             blast radius: home and chat stay upright with the locked
//             language active. E2E_PICK_LANG_NAME picks the language
//             (default "Tamil").
import { chromium } from "playwright-core";

const USER_ID = process.env.E2E_USER_ID;
const SCENARIO = process.env.E2E_SCENARIO || "teaser";
const ORIGIN =
  process.env.APP_ORIGIN ||
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
const CLERK_SECRET = process.env.CLERK_SECRET_KEY;

if (!USER_ID) throw new Error("E2E_USER_ID is required");
if (!ORIGIN) throw new Error("APP_ORIGIN or REPLIT_DEV_DOMAIN is required");
if (!CLERK_SECRET) throw new Error("CLERK_SECRET_KEY is required");

const log = (...a) => console.log(new Date().toISOString(), ...a);
const check = (name, ok, detail = "") =>
  log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `, ${detail}` : ""}`);

async function mintTicket(userId) {
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLERK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`clerk sign_in_tokens failed: ${JSON.stringify(body)}`);
  return body.token;
}

async function main() {
  const ticket = await mintTicket(USER_ID);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });

  // Showroom harness shims (teaser scenario): the production client guard
  // reverts a plan-locked active language to the first allowed one, so the
  // showroom is not reachable via normal web navigation today (reported as a
  // D finding). To verify the showroom RENDER wiring against the real
  // lesson-groups API, seed the locked language locally and patch ONLY the
  // client-side allowedLanguages list; every journey/teaser response below is
  // the live backend's.
  const seedLang = process.env.E2E_SEED_LANG;
  const allowLang = process.env.E2E_ALLOW_LANG;
  if (seedLang) {
    await page.addInitScript((code) => {
      window.localStorage.setItem("bolo.activeLang", code);
    }, seedLang);
  }
  if (allowLang) {
    await page.route("**/api/entitlements", async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      if (Array.isArray(body.allowedLanguages) && !body.allowedLanguages.includes(allowLang)) {
        body.allowedLanguages = [...body.allowedLanguages, allowLang];
      }
      await route.fulfill({ response: res, json: body });
    });
  }
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  const shot = (n) =>
    page.screenshot({ path: `qa/shots/journey-${SCENARIO}-${n}.png`, fullPage: false }).catch(() => {});
  const fullshot = (n) =>
    page.screenshot({ path: `qa/shots/journey-${SCENARIO}-${n}.png`, fullPage: true }).catch(() => {});

  try {
    log(`SCENARIO ${SCENARIO} as ${USER_ID}`);
    await page.goto(`${ORIGIN}/sign-in?__clerk_ticket=${ticket}`, { waitUntil: "networkidle" });
    await page.waitForURL(/\/app|\/$/, { timeout: 30000 }).catch(() => {});
    log("after sign-in URL:", page.url());

    if (SCENARIO === "picker") {
      // The real path into the showroom: open the picker on home and tap a
      // locked language. No entitlement shims, no localStorage seeding.
      const pickName = process.env.E2E_PICK_LANG_NAME || "Tamil";
      await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle" });
      log(`STEP open language picker, tap locked "${pickName}"`);
      await page.getByTitle("Change language").locator("visible=true").first().click();
      const langBtn = page.getByText(pickName, { exact: true }).first();
      await langBtn.waitFor({ timeout: 10000 });
      await langBtn.click();
      await page.waitForURL(/\/journey/, { timeout: 15000 });
      check("locked picker tap lands on /journey", true, page.url());
      await page.waitForLoadState("networkidle");
    } else if (seedLang) {
      // Locked-language showroom: go straight to the map (the home entry is
      // covered by the other scenarios).
      log("STEP open /journey directly");
      await page.goto(`${ORIGIN}/journey`, { waitUntil: "networkidle" });
    } else {
      // Home: featured journey card fronts the topic grid.
      await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle" });
      const homeCard = page.getByText(/Ride the /i).first();
      check("home featured journey card", (await homeCard.count()) > 0);
      await shot("01-home-card");

      log("STEP open /journey via home card");
      await homeCard.click();
      await page.waitForURL(/\/journey/, { timeout: 15000 });
      await page.waitForLoadState("networkidle");
    }
    // Boarding-pass header renders with the line name and station tally.
    // The active language is server-authoritative and reconciles into local
    // state asynchronously after hydration, wait for the EXPECTED line name
    // so we assert against the right language's map, not the pre-reconcile
    // default.
    await page.getByText(/Boarding pass/i).waitFor({ timeout: 20000 });
    const expectLine = process.env.E2E_EXPECT_LINE;
    if (expectLine) {
      await page
        .getByText(new RegExp(expectLine, "i"))
        .first()
        .waitFor({ timeout: 20000 })
        .catch(() => {});
      // Re-render after reconcile can remount rows; settle briefly.
      await page.waitForLoadState("networkidle");
    }
    const headerText = await page
      .locator("header")
      .innerText()
      .catch(() => "");
    check(
      "boarding-pass header",
      /boarding pass/i.test(headerText) && (!expectLine || new RegExp(expectLine, "i").test(headerText)),
      headerText.replace(/\n/g, " | "),
    );
    const stationRows = await page.getByText(/^Stop \d+ of \d+$/).count();
    check("station rows render", stationRows > 0, `${stationRows} stations`);
    const postcards = await page.getByText(/Fare zone \d/i).count();
    check("six fare-zone postcards", postcards === 6, `${postcards} postcards`);
    await fullshot("02-map-full");

    if (SCENARIO === "picker") {
      // Showroom render: one free-taste stop, locked zones grayed, upgrade path.
      const freeTaste = await page.getByText(/Free taste/i).count();
      check("free-taste marking present", freeTaste >= 1, `${freeTaste} occurrences`);
      const grayZones = await page.locator(".grayscale").count();
      check("grayscale locked-zone postcards", grayZones > 0, `${grayZones} grayed`);
      const upgradeCta = await page.getByText(/All-Access/i).count();
      check("showroom shows an All-Access upgrade path", upgradeCta > 0, `${upgradeCta} mentions`);
      await shot("03-showroom");

      // Blast radius: main surfaces stay upright with a locked active language.
      log("STEP blast radius: home with locked active language");
      await page.goto(`${ORIGIN}/app`, { waitUntil: "networkidle" });
      const homeUpright = await page.getByText(/Hello|Chat with Bolo/i).count();
      check("home renders with locked active language", homeUpright > 0);
      const crashText = await page.getByText(/something went wrong|unexpected error/i).count();
      check("home shows no crash screen", crashText === 0);
      await fullshot("04-home-locked-lang");

      log("STEP blast radius: chat with locked active language");
      await page.goto(`${ORIGIN}/chat`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      const chatCrash = await page.getByText(/something went wrong|unexpected error/i).count();
      check("chat shows no crash screen", chatCrash === 0);
      await fullshot("05-chat-locked-lang");
    }

    if (SCENARIO === "teaser") {
      // Showroom wiring: structure only, one marked free-taste stop, the rest locked.
      const freeTaste = await page.getByText(/Free taste/i).count();
      check("free-taste marking present", freeTaste >= 1, `${freeTaste} occurrences`);
      const grayZones = await page.locator(".grayscale").count();
      check("grayscale locked-zone postcards", grayZones > 0, `${grayZones} grayed`);

      log("STEP tap a locked station -> language-ticket dialog");
      const lockedBtn = page
        .locator('button[aria-label*="Locked"]')
        .last();
      await lockedBtn.click();
      const dlgTicket = await page
        .getByText(/needs a ticket|tried this line/i)
        .count();
      check("entitlement (language) lock dialog", dlgTicket > 0);
      await shot("03-lock-dialog");
      await page.keyboard.press("Escape");

      log("STEP tap the free-taste station -> practice");
      const teaserRow = page
        .locator('a[aria-label*="Stop"]')
        .first();
      const teaserCount = await teaserRow.count();
      check("exactly one tappable station", (await page.locator('a[aria-label*="Stop"]').count()) === 1);
      if (teaserCount) {
        await teaserRow.click();
        await page.waitForURL(/\/practice\/\d+\?group=\d+/, { timeout: 15000 });
        check("teaser station opens group practice", true, page.url());
        await page.waitForLoadState("networkidle");
        await shot("04-teaser-practice");
      }
    }

    if (SCENARIO === "plus") {
      const express = await page.getByText(/^Express$/i).count();
      log(`express stamps visible: ${express}`);
      const plusChips = await page.getByText(/^Plus$/).count();
      if (process.env.E2E_SKIP_SENTENCE === "1") {
        // Withdrawn-C1 languages (e.g. mni) ship no sentence groups by design.
        log(`sentence-station check skipped (${plusChips} Plus chips)`);
      } else {
        check("sentence stations flagged", plusChips > 0, `${plusChips} Plus chips`);
      }
      log("STEP open current station -> practice");
      const lit = page.locator('a[aria-label*="Stop"]').first();
      await lit.click();
      await page.waitForURL(/\/practice\/\d+\?group=\d+/, { timeout: 15000 });
      check("station opens group practice", true, page.url());
      await page.waitForLoadState("networkidle");
      // Practice loads the group's phrases (not an error/upgrade screen).
      const upgradeScreen = await page.getByText(/Upgrade to/i).count();
      check("group practice loads content", upgradeScreen === 0);
      await shot("03-group-practice");
      log("STEP back returns to /journey");
      await page.getByLabel(/back/i).first().click().catch(() => page.goBack());
      await page.waitForURL(/\/journey/, { timeout: 15000 });
      check("back returns to journey", true, page.url());
    }

    if (SCENARIO === "free") {
      log("STEP tap a sentence station -> Plus entitlement dialog");
      const sentenceLock = page.locator('button[aria-label*="sentence stop"]').first();
      if (await sentenceLock.count()) {
        await sentenceLock.click();
        const dlg = await page.getByText(/First-class coach/i).count();
        check("sentence entitlement dialog", dlg > 0);
        await shot("03-sentence-dialog");
        const cta = page.getByRole("link", { name: /Unlock with Plus/i });
        check("Plus CTA targets paywall", ((await cta.getAttribute("href")) || "").includes("/upgrade"));
        await page.keyboard.press("Escape");
      } else {
        check("sentence entitlement dialog", false, "no locked sentence station found");
      }
      log("STEP tap a locked phrase station -> progression dialog");
      const lockedPhrase = page
        .locator('button[aria-label*="Locked"]:not([aria-label*="sentence"])')
        .first();
      if (await lockedPhrase.count()) {
        await lockedPhrase.click();
        const dlg = await page.getByText(/still locked/i).count();
        check("progression lock dialog", dlg > 0);
        await shot("04-progression-dialog");
        await page.keyboard.press("Escape");
      } else {
        log("SKIP progression dialog: no locked phrase station (all unlocked)");
      }
    }

    const benign = consoleErrors.filter(
      (e) => !/402|Failed to load resource.*402/.test(e),
    );
    check("no unexpected console errors", benign.length === 0, JSON.stringify(benign).slice(0, 400));
  } catch (e) {
    await shot("99-error");
    throw e;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
