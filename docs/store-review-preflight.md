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

## 0. DO THE URLS YOU FILED SERVE A DOCUMENT? RUN THE CHECK, THEN READ THE CONSOLE.

**Half of this is automated and the half that is not is the half that bit us.**

```bash
pnpm --filter @workspace/scripts run check-legal-urls
```

**It EXITS NON-ZERO. It does not warn.** It fetches each legal URL, fetches a
path that certainly does not exist, and fails if they are the same bytes.

**WHY THE CONTROL IS THE WHOLE INSTRUMENT.** Every fork's host answers **200 with
the app shell for any unknown path**, so a status code proves nothing. India
filed `https://bolo-india.app/privacy` with Apple; it 301s to `/privacy/` and
serves 7,972 bytes of shell, **byte-identical to a nonsense path**, with zero
policy words without JavaScript. The real 32,970-byte policy is at
`/privacy.html`. It was live through several approved reviews.

**THE `.html` SUFFIX IS LOAD-BEARING.** The prerenderer writes
`/privacy/index.html` and the host serves **exact paths only**. *"We prerender
it"* was never the same statement as *"a crawler can read it"*.

### AND THEN ANSWER THIS YOURSELF, BECAUSE NO SCRIPT CAN

**The script checks the URLs this repo INTENDS to file. It cannot read what is
actually in the consoles.** Those are behind a login. So:

- **Open App Store Connect > App Privacy and read the Privacy Policy URL. Does it
  end in `.html`?**
- **Open the version page and read the Support URL. Same question.**
- **Open Play > Store presence and read the privacy policy URL and the data
  deletion URL. Same question.**

**Do not assume they match the site.** India's did not, for a month, and the only
thing that found it was somebody pasting the filed string into `curl`.

**AND IF THE APP IS IN REVIEW YOU CANNOT EDIT THESE AT ALL.** App Store Connect
locks App Information behind *"remove the version from review"*. **So this is a
question for BEFORE you submit, which is why it is section 0.**

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

## 4. DOES THIS FORK'S REVENUECAT SECRET KEY READ **V1** IN THE DASHBOARD?

**Every check short of the dashboard reports healthy when it is not.** The
variable is SET either way, there is no throw and no log line, so a grep, an
`env` check and the Replit Secrets pane all say fine. **A Replit RevenueCat
connector issues a v2-scoped token, and the `/v1/subscribers` call this codebase
makes against it 401s forever.** India carried that exact fault undiagnosed for
a month in 2026, and a sibling fork spent a day on a 401ing `/api/entitlements`
in September with no secret key in its RevenueCat project at all.

**The only check that answers it is the API Version column in the RevenueCat
dashboard reading V1.**

**And the comment in `revenuecatClient.ts` that says a v1 secret key "already
exists in the environment" is an ENVIRONMENT fact about the repo it was written
in, not a fact about the code.** It travelled to five forks where it was false
and still read as verified.

---

**Add to this file rather than to a task log.** An entry earns its place here by
being a question that a fork could get wrong, and it should be worded so that
answering "yes" requires having actually checked something.
