/**
 * THE URLS YOU FILE WITH APPLE AND GOOGLE MUST SERVE A DOCUMENT.
 *
 * Run before preparing any release:
 *   pnpm --filter @workspace/scripts run check-legal-urls
 *
 * WHY THIS EXISTS. India filed `https://bolo-india.app/privacy` with Apple. That
 * path 301s to `/privacy/` and serves the SPA shell: 7,972 bytes, zero policy
 * words without JavaScript, and BYTE-IDENTICAL TO A PATH THAT DOES NOT EXIST.
 * The real 32,970-byte policy is at `/privacy.html`. It was live in a shipped
 * app through several approved reviews, because nobody ever fetched the string
 * that was actually filed.
 *
 * ALL SIX FORKS HAD IT. The prerenderer writes `/privacy/index.html` and the
 * host serves EXACT PATHS ONLY, so `/privacy` lands on the shell everywhere.
 * "We prerender it" was never the same statement as "a crawler can read it".
 *
 * WHY IT IS A SCRIPT THAT FAILS RATHER THAN A LINE IN THE PREFLIGHT DOC. The
 * commitment to fix India's filed URL on 1.0.18 currently lives in one
 * supervisor's memory, which is Europe's "a rule that holds because every call
 * site remembers it" with exactly one call site. `docs/store-review-preflight.md`
 * opens by saying a document that describes what we did on a date reads as
 * history and history does not get actioned. So this does not describe anything.
 * It exits non-zero.
 *
 * IT DOES NOT COMPARE AGAINST AN EXPECTED STRING, AND THAT IS THE DESIGN. A
 * string check passes the day somebody files a DIFFERENT broken URL. This
 * fetches the document and asks whether a reviewer would find a policy in it.
 *
 * WHAT IT CANNOT DO, STATED PLAINLY: it cannot read what is FILED in App Store
 * Connect or Play. Those live in consoles behind a login. It checks that the
 * URLs this repo INTENDS to file serve real documents, which is the half that
 * can be automated. A human still has to read the three console fields, and
 * `docs/store-review-preflight.md` is where that question belongs.
 */
const HOST = process.env.STORE_LEGAL_HOST ?? "bolo-india.app";

interface Filed {
  /** Where a person will paste this, so a failure names the field. */
  field: string;
  path: string;
  /** Words a real document of this kind contains. Lowercased before matching. */
  expect: string[];
}

/**
 * THE `.html` SUFFIX IS LOAD-BEARING, NOT A STYLE CHOICE. `/privacy` redirects
 * to `/privacy/` and the host serves exact paths only, so the directory form
 * lands on the shell. File the `.html`.
 */
const FILED: Filed[] = [
  {
    field: "App Store Connect > App Privacy > Privacy Policy URL",
    path: "/privacy.html",
    expect: ["privacy", "personal", "data"],
  },
  {
    field: "Terms of Service, linked from the paywall and the listing",
    path: "/terms.html",
    expect: ["terms"],
  },
  {
    field: "App Store Connect > version > Support URL",
    path: "/support.html",
    expect: ["support"],
  },
];

/** A path that certainly does not exist, so the shell can be recognised. */
const CONTROL = `/__preflight-control-${Date.now()}`;

async function get(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`https://${HOST}${path}`, { redirect: "follow" });
  return { status: res.status, body: await res.text() };
}

async function main(): Promise<void> {
  console.log(`Checking the legal URLs on ${HOST}\n`);

  // THE CONTROL IS FETCHED FIRST AND IS THE WHOLE INSTRUMENT. Without it a 200
  // proves nothing: this host answers 200 with its HTML shell for every unknown
  // path, which is exactly how the filed URL looked healthy for a month.
  const control = await get(CONTROL);
  if (control.status !== 200) {
    console.log(
      `  note: the control path returned ${control.status} rather than a shell, ` +
        `so this host may 404 properly. The checks below still hold.`,
    );
  }

  const failures: string[] = [];

  for (const f of FILED) {
    const r = await get(f.path);
    const text = r.body.toLowerCase();
    const problems: string[] = [];

    if (r.status !== 200) problems.push(`HTTP ${r.status}`);
    if (r.body === control.body) {
      problems.push(
        `IDENTICAL TO A PATH THAT DOES NOT EXIST (${r.body.length} bytes). ` +
          `This is the app shell, not a document.`,
      );
    }
    if (r.body.length < 5000) problems.push(`only ${r.body.length} bytes`);
    const missing = f.expect.filter((w) => !text.includes(w));
    if (missing.length > 0) problems.push(`no sign of: ${missing.join(", ")}`);

    if (problems.length === 0) {
      console.log(`  OK    ${f.path}  ${r.body.length} bytes`);
    } else {
      console.log(`  FAIL  ${f.path}  ${problems.join("; ")}`);
      console.log(`        filed at: ${f.field}`);
      failures.push(f.path);
    }
  }

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} of ${FILED.length} legal URLs do not serve a document: ` +
        `${failures.join(", ")}\n` +
        `A reviewer, a regulator or a learner clicking these gets a blank page.\n` +
        `DO NOT PREPARE A RELEASE UNTIL THESE SERVE REAL DOCUMENTS AND THE CONSOLE\n` +
        `FIELDS POINT AT THEM. Reading the console fields is still a human job:\n` +
        `see docs/store-review-preflight.md.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("\nAll filed legal URLs serve real documents.");
}

void main();
