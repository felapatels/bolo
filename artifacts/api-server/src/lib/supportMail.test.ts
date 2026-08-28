/**
 * RUNS ON THE MAC, like presence and errorPulse, because these are the only
 * parts of supportMail that do not need a mailbox. Everything else in that file
 * opens an IMAP or SMTP connection and cannot be tested anywhere in this repo,
 * which is precisely why the judgement was pulled out of it.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { replySubject, replyRefusal, supportConfigured, REPLY_MAX } from "./supportMail";

describe("replySubject", () => {
  test("prefixes a plain subject", () => {
    assert.equal(replySubject("Can my two kids share one account?"),
                 "Re: Can my two kids share one account?");
  });

  // A thread five deep reading "Re: Re: Re:" is the mark of software nobody
  // looked at, and some clients truncate the real subject to fit the prefixes.
  test("does NOT stack Re:", () => {
    assert.equal(replySubject("Re: already a reply"), "Re: already a reply");
  });

  test("matches Re: whatever the case, because clients disagree", () => {
    assert.equal(replySubject("RE: SHOUTING"), "RE: SHOUTING");
    assert.equal(replySubject("re: quiet"), "re: quiet");
  });

  test("an empty subject becomes something rather than 'Re: '", () => {
    assert.equal(replySubject(""), "Re: (no subject)");
    assert.equal(replySubject("   "), "Re: (no subject)");
  });
});

describe("replyRefusal", () => {
  test("empty and whitespace are refused", () => {
    assert.equal(replyRefusal(""), "A reply cannot be empty");
    assert.equal(replyRefusal("   \n  "), "A reply cannot be empty");
  });

  test("a normal reply passes", () => {
    assert.equal(replyRefusal("Each child needs their own login."), null);
  });

  test("the cap is enforced, and the boundary is not off by one", () => {
    assert.equal(replyRefusal("x".repeat(REPLY_MAX)), null);
    assert.ok(replyRefusal("x".repeat(REPLY_MAX + 1)));
  });
});

describe("supportConfigured", () => {
  // Fails CLOSED, the same direction as the owner gate: a missing secret hides
  // the feature rather than half-enabling it.
  test("false when either secret is missing", () => {
    const user = process.env.LARKSUPPORT_USER;
    const pass = process.env.LARKSUPPORT_APP_PASSWORD;
    try {
      delete process.env.LARKSUPPORT_USER;
      delete process.env.LARKSUPPORT_APP_PASSWORD;
      assert.equal(supportConfigured(), false);

      process.env.LARKSUPPORT_USER = "larksupport@example.com";
      assert.equal(supportConfigured(), false, "a user with no password is not configured");

      process.env.LARKSUPPORT_APP_PASSWORD = "not-a-real-password";
      assert.equal(supportConfigured(), true);
    } finally {
      if (user === undefined) delete process.env.LARKSUPPORT_USER;
      else process.env.LARKSUPPORT_USER = user;
      if (pass === undefined) delete process.env.LARKSUPPORT_APP_PASSWORD;
      else process.env.LARKSUPPORT_APP_PASSWORD = pass;
    }
  });
});
