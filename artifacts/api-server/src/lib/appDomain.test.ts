import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { APP_DOMAIN, SUPPORT_EMAIL } from "./appDomain";

// THE DEAD REPLY-TO, PINNED SO IT CANNOT COME BACK.
//
// Until 2026-09-06 every invite this app has ever sent carried
// reply_to support@bolo-india.app, and the Terms page published the same
// address. bolo-india.app publishes SPF and a resend._domainkey record, so it
// SENDS; it has no MX record at all, so nothing can be delivered TO it. Every
// parent who received a family invite, hit Reply and asked a question was
// writing into a void, and it was live in production the whole time.
//
// These are cheap constant checks on purpose. The bug was never subtle, it was
// simply never looked at, and the thing that keeps it gone is a test that fails
// the moment somebody types a bolo domain into a reply-to again.

const LIB_DIR = new URL(".", import.meta.url).pathname;

test("the support address is on a domain that actually receives mail", () => {
  // larkenterprisesllc.com publishes three Cloudflare Email Routing MX records
  // and an SPF record. That is the whole reason it was chosen.
  assert.match(SUPPORT_EMAIL, /@larkenterprisesllc\.com$/i);
});

test("the support address carries the LLC, which is the easy typo", () => {
  // larkenterprises.com, WITHOUT the LLC, is a DIFFERENT domain with no MX and
  // no SPF. Dropping three letters ships the identical bug wearing a better
  // name, so this asserts the presence of the three letters directly.
  const domain = SUPPORT_EMAIL.split("@")[1]!.toLowerCase();
  assert.equal(domain, "larkenterprisesllc.com");
  assert.notEqual(domain, "larkenterprises.com");
});

test("the support address is not on a bolo domain, because none of them receive", () => {
  assert.doesNotMatch(SUPPORT_EMAIL, /@bolo-/i);
  assert.doesNotMatch(SUPPORT_EMAIL, new RegExp(`@${APP_DOMAIN}$`, "i"));
});

// ─── the census: no source file may hardcode a support address again ─────────

const sourceFiles = () =>
  readdirSync(LIB_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({ name: f, text: readFileSync(join(LIB_DIR, f), "utf8") }));

test("no lib file writes a support address as a string literal", () => {
  // A quoted address is the shape the bug had: four separate copies of
  // "support@bolo-india.app", none of which could be changed in one place.
  // Comments may still NAME the old address, which is why this looks for the
  // quoted form only.
  const offenders = sourceFiles()
    .filter((f) => /["'`]\s*[A-Za-z0-9._%+-]+@bolo-/.test(f.text))
    .map((f) => f.name);
  assert.deepEqual(offenders, [], `hardcoded bolo address in: ${offenders.join(", ")}`);
});

test("both invite senders take their reply-to from the constant", () => {
  for (const name of ["inviteEmail.ts", "familyInviteEmail.ts"]) {
    const text = readFileSync(join(LIB_DIR, name), "utf8");
    assert.match(text, /reply_to:\s*SUPPORT_EMAIL/, `${name} must reply to SUPPORT_EMAIL`);
    assert.match(text, /import\s*\{\s*SUPPORT_EMAIL\s*\}/, `${name} must import it`);
  }
});

test("the quota alert does NOT take its sender from the constant", () => {
  // THE ONE CONSUMER THAT MUST NOT INHERIT IT. quotaAlertEmail uses the address
  // as a `from:`, and Resend sends only from a domain IT has verified. The
  // support domain is not one, so the naive swap turns a best-effort alert into
  // a guaranteed failure that still reads like success in the code. Its sender
  // stays on the verified app domain.
  const text = readFileSync(join(LIB_DIR, "quotaAlertEmail.ts"), "utf8");
  assert.doesNotMatch(text, /import\s*\{[^}]*SUPPORT_EMAIL/);
  assert.match(text, /ALERT_FROM\s*=[\s\S]{0,200}APP_DOMAIN/);
});
