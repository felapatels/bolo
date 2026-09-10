/**
 * THE URLS YOU ACTUALLY FILED WITH APPLE AND GOOGLE MUST SERVE A DOCUMENT.
 *
 * Run before preparing any release:
 *   pnpm --filter @workspace/scripts run check-legal-urls
 *
 * WHY THIS EXISTS. India filed `https://bolo-india.app/privacy` with Apple. That
 * path 301s to `/privacy/` and serves the SPA shell: 7,972 bytes, zero policy
 * words, and BYTE-IDENTICAL TO A PATH THAT DOES NOT EXIST. The real 32,970-byte
 * policy is at `/privacy.html`. It was live through several approved reviews,
 * because nobody ever fetched the string that was actually filed.
 *
 * VERSION ONE OF THIS SCRIPT HAD A HOST PLUS A CONVENTION AND IT WAS WRONG,
 * WHICH IS THE MOST IMPORTANT THING IN THIS FILE. It checked
 * `bolo-india.app/support.html` and failed correctly. Then a console read showed
 * the filed Support URL is **`https://trybolo.app`** — A DIFFERENT DOMAIN. The
 * script was failing accurately about a URL nobody had filed.
 *
 *     A CHECK AIMED BY CONVENTION IS A CHECK AIMED AT WHAT YOU ASSUMED.
 *
 * So `FILED` below holds the values READ OUT OF THE CONSOLES, verbatim, and this
 * fetches exactly those strings. When the consoles change, this file is wrong
 * until somebody re-reads them, which is what `readFromConsoleOn` is for.
 *
 * IT DOES NOT COMPARE AGAINST AN EXPECTED STRING, AND THAT IS THE DESIGN. A
 * string check passes the day somebody files a DIFFERENT broken URL. This
 * fetches the document and asks whether a reviewer would find one.
 *
 * THE CONTROL IS PER HOST, AND `trybolo.app` IS WHY. That host is a CATCH-ALL:
 * `/support` and a nonsense path both return the same 21,621-byte landing page.
 * A control fetched from a different host would have proved nothing about it.
 */

interface Filed {
  /** Where a person reads and edits this, so a failure names the field. */
  field: string;
  /** The value READ OUT OF THE CONSOLE, verbatim. Not what we wish it were. */
  url: string;
  /** Words a real document of this kind contains. Empty means "any real page". */
  expect: string[];
  /** Known-wrong entries carry the fix, so a failure is actionable. */
  pendingFix?: string;
  /**
   * TRUE WHEN BEING THE HOST'S FALLBACK PAGE IS THE CORRECT ANSWER.
   *
   * ADDED AFTER THE CONTROL FLAGGED THE MARKETING URL, WHICH IS CORRECT AS
   * FILED. `trybolo.app` is a catch-all, so its landing page IS its
   * not-found page, and for a marketing splash that is not a defect: the field
   * asks for a page about the app, and that is what it serves.
   *
   * WRITTEN AS AN EXPLICIT PER-ENTRY OPT-OUT RATHER THAN BY WEAKENING THE
   * CONTROL, because the control is the only thing in this script that found
   * anything. A guard that cries wolf is a guard somebody switches off, and the
   * fix for a false positive is to name it, not to blunt the instrument.
   */
  catchAllIsCorrect?: boolean;
}

/**
 * READ FROM THE CONSOLES ON THIS DATE. A filed value can change without this
 * repo hearing about it, so this file is a SNAPSHOT and it goes stale. The
 * staleness check below is the same shape as the gift shim's REVIEW_BY: it
 * cannot know the truth, so it fails on a date and makes a person look.
 */
const READ_FROM_CONSOLE_ON = "2026-09-09";
const STALE_AFTER_DAYS = 45;

const FILED: Filed[] = [
  {
    field: "App Store Connect > App Privacy > Privacy Policy URL",
    url: "https://bolo-india.app/privacy",
    expect: ["privacy", "personal", "data"],
    pendingFix: "https://bolo-india.app/privacy.html — queued to 1.0.18 (owner, 2026-09-09)",
  },
  {
    field: "App Store Connect > version > Support URL",
    url: "https://trybolo.app",
    expect: ["support"],
    pendingFix:
      "NO SUPPORT PAGE EXISTS YET. /support and /support.html both serve the shell. " +
      "The words are the owner's to write; then file that URL. Queued to 1.0.18.",
  },
  {
    field: "App Store Connect > version > Marketing URL",
    url: "https://trybolo.app",
    // CORRECT AND SHOULD STAY. A marketing splash is exactly right here, and it
    // is the same string as the Support URL above, where it is exactly wrong.
    // ONE VALUE IN TWO FIELDS WHERE ONLY ONE IS THE RIGHT ANSWER is why this
    // read as fine at a glance for the life of the app.
    expect: [],
    catchAllIsCorrect: true,
  },
  {
    field: "Terms of Service, linked from the paywall and the listing",
    url: "https://bolo-india.app/terms",
    expect: ["terms"],
    pendingFix: "https://bolo-india.app/terms.html — same fault as privacy, queued to 1.0.18",
  },
];

async function get(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, { redirect: "follow" });
  return { status: res.status, body: await res.text() };
}

/** A path on THIS host that certainly does not exist. */
async function controlFor(url: string): Promise<string> {
  const u = new URL(url);
  u.pathname = `/__preflight-control-${Date.now()}`;
  u.search = "";
  return (await get(u.toString())).body;
}

async function main(): Promise<void> {
  console.log(`Legal URLs as filed, read from the consoles on ${READ_FROM_CONSOLE_ON}\n`);

  const failures: string[] = [];
  const controls = new Map<string, string>();

  for (const f of FILED) {
    const host = new URL(f.url).host;
    if (!controls.has(host)) controls.set(host, await controlFor(f.url));
    const control = controls.get(host)!;

    const r = await get(f.url);
    const text = r.body.toLowerCase();
    const problems: string[] = [];

    if (r.status !== 200) problems.push(`HTTP ${r.status}`);
    if (r.body === control && !f.catchAllIsCorrect) {
      problems.push(
        `IDENTICAL TO A PATH THAT DOES NOT EXIST ON ${host} (${r.body.length} bytes). ` +
          `This host answers everything with the same page.`,
      );
    }
    const missing = f.expect.filter((w) => !text.includes(w));
    if (missing.length > 0) problems.push(`no sign of: ${missing.join(", ")}`);

    if (problems.length === 0) {
      const note = f.catchAllIsCorrect ? "  (catch-all, correct for this field)" : "";
      console.log(`  OK    ${f.url}  ${r.body.length} bytes${note}`);
    } else {
      console.log(`  FAIL  ${f.url}  ${problems.join("; ")}`);
      console.log(`        filed at: ${f.field}`);
      if (f.pendingFix) console.log(`        fix:      ${f.pendingFix}`);
      failures.push(f.field);
    }
  }

  // THE SNAPSHOT GOES STALE AND CANNOT KNOW IT. Same mechanism as the gift
  // shim's review date: nothing here can see a console, so it fails on a date
  // rather than pretending the values are current.
  const age =
    (Date.now() - new Date(`${READ_FROM_CONSOLE_ON}T00:00:00Z`).getTime()) / 86_400_000;
  if (age > STALE_AFTER_DAYS) {
    console.log(
      `\n  FAIL  the filed values were last read ${Math.round(age)} days ago. ` +
        `Re-read the console fields and update READ_FROM_CONSOLE_ON.`,
    );
    failures.push("stale snapshot");
  }

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} filed URL(s) do not serve what the field promises.\n` +
        `A reviewer, a regulator or a learner clicking these gets the wrong page.\n` +
        `DO NOT PREPARE A RELEASE UNTIL THESE ARE FIXED. Note that App Store Connect\n` +
        `LOCKS these fields while a version is In Review, so they can only be edited\n` +
        `between submissions: see docs/store-review-preflight.md.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("\nEvery filed legal URL serves what its field promises.");
}

void main();
