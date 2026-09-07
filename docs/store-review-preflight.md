# Before you file a store review: questions, not history

**Read this before submitting to App Review or to Play, in EVERY fork.** It is
short on purpose and every entry is a question somebody has to answer **about
this fork, today**, rather than a record of what was done in another repo on
another date.

**Why it is written as questions.** India documented the Client Trust problem
correctly in July 2026 and the note still cost a second store review in
September, in a sibling fork, because of how it was PHRASED. It read as a
post-ship step for India's build 27 and described the state of one dashboard on
one date. **A fork reading that finds an instruction that looks already handled
and moves on.** A new production instance created the day before a review
inherits no dashboard state at all and nobody asks.

> **A document that describes what we did on a date reads as history, and
> history does not get actioned. Only a question somebody must answer survives a
> fork.**

---

## 1. IS CLIENT TRUST BYPASSED FOR THE DEMO ACCOUNT ON *THIS* FORK'S PRODUCTION INSTANCE?

**The reviewer signs in from a device Clerk has never seen, which is exactly what
Client Trust challenges.** They get an email code they cannot read, and the
review fails as "cannot sign in". Seen twice: once on India's review, and again
on a sibling's, sixteen failed attempts in thirteen minutes followed by
`Clerk: Email code factor not found`.

**THE FIX IS THE PER-USER `bypass_client_trust` FLAG ON THE DEMO ACCOUNT.** Not
turning Client Trust off. **Exempting one account leaves every learner's
sign-in protection intact; disabling the feature weakens it for everybody to
solve a problem with one login.** The instance-wide toggle is dashboard-only
(Backend API `PATCH /v1/instance` has no trust setting), and dev and production
toggle independently, so a green dev check says nothing about the instance the
reviewer will hit.

**AND THE OBVIOUS PROBE CANNOT ANSWER THIS QUESTION.** `user_settings` on a
Clerk instance reports `totp` absent, `backup_code` disabled, `phone_number`
disabled and `second_factor: {"required": false}` whether or not Client Trust is
on, **because Client Trust does not appear in `user_settings` at all.** Every one
of those readings is true and the conclusion "there is no MFA" is false. **An
instrument that cannot see a feature reports its absence identically to it being
off.** Do not clear this item with that probe.

## 2. HAVE YOU SIGNED IN AS THE DEMO ACCOUNT ON A DEVICE THAT HAS NEVER SIGNED IN BEFORE?

**Not the owner's phone. It is already trusted and it will always pass.**

A fresh device, a simulator reset, or a throwaway browser profile. **That single
act exercises Client Trust, email verification and the SSO redirect allowlist
together**, which is most of what a reviewer does before they ever see the
product. It is the cheapest pre-flight in this file and it is the one that
catches the failure this document exists for.

## 3. IS THE DATA-DELETION URL YOU ARE ABOUT TO FILE ACTUALLY SERVING POLICY?

**Fetch it without JavaScript and count the bytes**, naming the exact path you
will type into the console rather than the pretty one:

```
curl -s https://<your-domain>/privacy.html | wc -c
```

A number close to your app shell's size means the crawler sees the app, not the
policy. India filed a deletion URL that had never resolved.

---

**Add to this file rather than to a task log.** An entry earns its place here by
being a question that a fork could get wrong, and it should be worded so that
answering "yes" requires having actually checked something.
