import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
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
// THE CENSUS BELOW IS TESTED AGAINST FIXTURES, NOT ONLY AGAINST THIS TREE, and
// that case exists because the first version of this file shipped a detector
// that had never seen a violation. SEA took it, hit the false positive within
// minutes and sent it back (96e52fe6): the regex treated a BACKTICK as a quote,
// so a doc comment writing the old address in markdown to explain what not to do
// failed the very test that enforces the explanation. India passed only because
// its comments happened not to backtick an address. A detector that has only
// ever seen a clean tree has not been tested, it has been observed agreeing.

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

// ─── the detector ────────────────────────────────────────────────────────────

/**
 * Every string and template literal in a TypeScript source, and nothing else.
 *
 * THE COMPILER'S OWN PARSER, NOT A CHARACTER WALK, and the reason is worth the
 * import. The first version of this census used a regex, which treated a
 * markdown backtick in a doc comment as a quote: SEA hit that within minutes of
 * taking the file (96e52fe6). The obvious repair, walking the characters and
 * skipping strings, then failed HARDER and more quietly on this very file:
 *
 *     .replace(/"/g, "&quot;")
 *
 * A REGEX LITERAL CONTAINING A QUOTE. A hand-written lexer reads that `"` as
 * the start of a string, desynchronises, and silently swallows the next twenty
 * lines including the comments it was supposed to strip. Telling a regex
 * literal from a division needs the previous token, which is the point at which
 * you are writing a JavaScript lexer instead of a test. ts.createSourceFile
 * already has one, comments are not literals in the tree it returns, and
 * RegularExpressionLiteral is its own node kind, so both traps are gone.
 */
export function stringLiterals(src: string): string[] {
  const file = ts.createSourceFile("scan.ts", src, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/**
 * Finds the dead address family in code, ignoring comments.
 *
 * IT LOOKS FOR support@ ON A BOLO DOMAIN, not for every bolo address, and the
 * narrowness is deliberate. hello@bolo-india.app and alerts@bolo-india.app are
 * legitimate SENDERS: that domain is the only one Resend has verified, so mail
 * goes out as it and the error strings name it on purpose. support@ is the one
 * that never had a mailbox, and it is the one that must never be typed again.
 */
export function deadAddresses(src: string): string[] {
  return stringLiterals(src).flatMap(
    (lit) => lit.match(/support@bolo-[A-Za-z0-9.-]+/gi) ?? [],
  );
}

/** The names a file imports from ./appDomain, read from the tree. */
export function importsFromAppDomain(src: string): string[] {
  const file = ts.createSourceFile("scan.ts", src, ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  for (const stmt of file.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const spec = stmt.moduleSpecifier;
    if (!ts.isStringLiteral(spec) || !/appDomain$/.test(spec.text)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) names.push(el.name.text);
    }
  }
  return names;
}

// ─── the detector, tested against fixtures before it is trusted ──────────────

test("the census flags a real violation and forgives every way of documenting one", () => {
  const violations = [
    ['a plain literal', 'const a = "support@bolo-india.app";'],
    ['a template literal', 'const a = `support@bolo-india.app`;'],
    ['single quotes', "const a = 'support@bolo-sea.app';"],
    ['buried in a payload', 'send({ reply_to: "support@bolo-europe.app" });'],
  ] as const;
  for (const [label, src] of violations) {
    assert.equal(deadAddresses(src).length, 1, `should flag: ${label}`);
  }

  const documentation = [
    ['prose in a line comment', '// it replaced support@bolo-india.app, which bounced'],
    ['MARKDOWN BACKTICKS, the false positive SEA found', '// never write `support@bolo-india.app`'],
    ['a block comment', '/* was: "support@bolo-india.app" */'],
    ['a doc comment', '/**\n * IT REPLACED support@bolo-india.app.\n */'],
    ['a legitimate sender', 'const from = "hello@bolo-india.app";'],
    ['the alert sender', 'const from = `alerts@${APP_DOMAIN}`;'],
    ['a url, which is where a naive stripper breaks', 'const u = "https://bolo-india.app/mascot.png";'],
  ] as const;
  for (const [label, src] of documentation) {
    assert.deepEqual(deadAddresses(src), [], `should NOT flag: ${label}`);
  }
});

test("a regex literal holding a quote does not blind the census", () => {
  // THE EXACT SHAPE THAT DEFEATED THE HAND-WRITTEN VERSION, taken from
  // inviteEmail.ts. A character walk reads the quote inside /"/g as a string
  // opener and goes blind for the rest of the file, so the violation below was
  // reported as a clean tree.
  const src = [
    'const esc = (s: string) => s.replace(/"/g, "&quot;");',
    'const bad = "support@bolo-india.app";',
  ].join("\n");
  assert.deepEqual(deadAddresses(src), ["support@bolo-india.app"]);
});

// ─── the census over the real tree ───────────────────────────────────────────

const sourceFiles = () =>
  readdirSync(LIB_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({ name: f, text: readFileSync(join(LIB_DIR, f), "utf8") }));

test("no lib file writes the dead support address in code", () => {
  const offenders = sourceFiles()
    .filter((f) => deadAddresses(f.text).length > 0)
    .map((f) => f.name);
  assert.deepEqual(offenders, [], `dead address in: ${offenders.join(", ")}`);
});

test("both invite senders take their reply-to from the constant", () => {
  for (const name of ["inviteEmail.ts", "familyInviteEmail.ts"]) {
    const text = readFileSync(join(LIB_DIR, name), "utf8");
    assert.match(text, /reply_to:\s*SUPPORT_EMAIL/, `${name} must reply to SUPPORT_EMAIL`);
    // THE BRACE MAY HOLD MORE THAN ONE NAME. The first version of this test
    // demanded SUPPORT_EMAIL be the only import in it, which passes here today
    // and breaks the moment a sender legitimately needs APP_DOMAIN beside it.
    // SEA's senders already import both. Match the name inside the list.
    assert.ok(
      importsFromAppDomain(text).includes("SUPPORT_EMAIL"),
      `${name} must import SUPPORT_EMAIL from appDomain`,
    );
  }
});

test("the quota alert does NOT take its sender from the constant", () => {
  // THE ONE CONSUMER THAT MUST NOT INHERIT IT. quotaAlertEmail uses the address
  // as a `from:`, and Resend sends only from a domain IT has verified. The
  // support domain is not one, so the naive swap turns a best-effort alert into
  // a guaranteed failure that still reads like success in the code. Its sender
  // stays on the verified app domain. SEA proved this case bites rather than
  // assuming it: reintroducing the bug turns this case, and only this case, red.
  const text = readFileSync(join(LIB_DIR, "quotaAlertEmail.ts"), "utf8");
  const imported = importsFromAppDomain(text);
  assert.ok(!imported.includes("SUPPORT_EMAIL"), "quotaAlertEmail must not import SUPPORT_EMAIL");
  assert.ok(imported.includes("APP_DOMAIN"), "its sender must come from the verified app domain");
});
