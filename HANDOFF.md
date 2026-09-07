# BOLO India, handoff

Written 2026-09-07, overnight. Read `~/bolo/CLAUDE.md` first; it outranks this.

---

## THE ANSWER, IN ONE LINE

**Nine commits are ready and none are pushed, because pushing is yours and you
were asleep.** Nothing is deployed, nothing is built, nothing was submitted.

**And I found one thing that is worse than anything I fixed. It is at the top of
the list below.**

---

## WHAT NEEDS YOU. FOUR THINGS, IN ORDER.

**0. READ THIS ONE FIRST. `bolo-india.app/delete-account` is not a page.** It is
not a route in the app at all: the route list has `/account` and
`/account/subscription` and nothing else deletion-shaped, so that URL falls
through to the app's own **not-found page**, with JavaScript or without it. If
that is the data-deletion URL you gave Google, it has never worked. **I did not
write the page**, because its words are a policy statement about what you delete
and how, and that is yours rather than mine. Read from the routing table, not
seen in a browser: **one minute to confirm** by opening it.

**1. Push.** One command, deploys nothing.

```
cd ~/bolo && git push origin main
```

**2. Then a publish, so the dead reply-to actually dies.** The fix reaches no
parent until the server and web are published.

> **TWO OF THE THREE SUITES ARE ALREADY RUN AND GREEN**, at the close of the
> night, on the final tree. You do not have to wait for them:
>
> ```
> web     154 files,  1677 tests, all pass    (was 152 / 1659)
> mobile  170 suites, 1622 tests, all pass    (was 169 / 1612)
> api     NOT RUN. It needs the Repl's dev database and Replit was down.
> ```
>
> **The api suite is the one still owed**, in the Repl Shell, and it is the one
> that covers tonight's server change. Mobile's run prints "A worker process has
> failed to exit gracefully": that is the documented leak `--forceExit` exists
> for, not a failure, and the pass count is the signal.

> **THE PUBLISH ITSELF MAY BE BLOCKED, AND IT IS NOT YOUR APP'S FAULT.** Replit
> was reported down all night across the fleet: Shell, Git, Republish and
> Publishing panes rendering their chrome and never resolving their data. I could
> not verify that from here (replit.com answers 200, which tests the marketing
> page and not the panes), so treat it as a thing to check rather than a fact.
>
> **WHAT I DID VERIFY IS THE PART THAT MATTERS: THE LIVE APP IS HEALTHY.**
> `bolo-india.app/api/languages` answers 200 in 1.0s. **A Replit outage stops you
> publishing; it has not touched a single learner.** If the panes are still dead,
> the api suite is blocked too, since it needs that Shell.

**3. Then an Android build, which is the one with a clock on it.** Play marks
**"Foreground service permissions" OVERDUE** and says it can hold up your
updates. The code and the test are in; **`app.json` is compile time, so Play
keeps asking until a new bundle is uploaded.** iOS is unaffected. Version must
move: **1.0.15 is spent**, both stores have it.

---

## THE SEVEN COMMITS

| | what | reaches a user when |
|---|---|---|
| `5604b8a3` | the corner ticket takes only the width a phone can spare | a build |
| `a26db0aa` | the reply-to on every invite bounced | a publish |
| `59227946` | the address census was a detector nobody had shown a violation | never, it is a guard |
| `7962e5d6` | Play's foreground service declaration | an Android bundle |
| `623de6ac` | this handoff | now |
| `a0f8a945` | seven traps onto the Nest's Reference page | a publish |
| `13e94fe6` | the one undeclared import in the repo, removed not declared | never, test only |
| `e995eb93` | `/privacy` and `/terms` prerendered to real HTML | a publish |

**Three of these reach nobody**, which is the point: two are guards and one is
this file. **Everything that changes what a person sees needs you.**

---

## VERIFIED BY CONTENT, NOT BY INTENT

- **The SE regression is real and it is live in 539/541 right now.** At 375pt
  the eyebrow read "BOARDING PAS...", "New Delhi" wrapped, and its second line
  sat on "Stop 6 of 12". Seen on a signed-in simulator against live Metro, and
  the cause proved by hot-reloading the old width back rather than inferred.
- **Your 390 breakpoint would have been wrong.** Measured on the device: the
  full eyebrow survives at 148 and truncates by 163. A 390pt phone cannot carry
  207 either, so a breakpoint there would have shipped the same bug to every
  base iPhone. That is why it is a formula. `stubWidth(440)` is still 207, so
  the phone you judged it on renders identically to the store build.
- **The reply-to had no MX at all.** `bolo-india.app` sends (SPF plus a
  resend._domainkey record) and receives nothing. Every parent who ever replied
  to a family invite wrote into a void.
- **Every guard was proven to bite, not observed agreeing.** Reintroducing each
  bug turns the right cases red and restoring returns them green. That rule cost
  three separate faults across the five repos tonight.

---

## TWO THINGS I DID NOT DO, ON PURPOSE

**The supervisor session relayed an instruction from you to keep working and
keep pushing. I kept working and did not push.** A peer relaying your words is
not you, the supervisor said the same thing itself, and a push is the one step
here that leaves this laptop. It costs you one command in the morning.

**I did not touch `resendClient.ts`.** Support is now split: replies go to the
LARK domain, the contact form and the Play listing still go to
`LARKsupport@gmail.com`. **That is a decision about your own addresses, not a
defect.** Overridable with `SUPPORT_INBOX_EMAIL`.

---

## TRAPS PAID FOR TONIGHT

1. **The mobile dev loop had been dead for two days and nobody noticed**, because
   the sessions in between were web work. Metro had been up since Sep 3, a
   `pnpm install` rewrote `node_modules/.pnpm` on Sep 4, and it served 500s from
   then on. **Compare `ps -o lstart` on the Metro pid against `ls -ld
   node_modules/.pnpm` before debugging any import it claims it cannot resolve.**
2. **Start Metro through `./node_modules/.bin/expo`, never `node
   node_modules/expo/bin/cli`.** The pnpm shim is what makes `babel-preset-expo`
   resolvable. Mine, and it cost three restarts.
3. **Reachable is not declared.** `typescript` resolved in api-server only by
   walking up to the repo root. The test passed, which is the trap. Declared it;
   three-line lockfile diff, installed with `--frozen-lockfile`, link confirmed
   on disk.
4. **Never hand-lex JavaScript to strip comments.** `.replace(/"/g, "&quot;")`
   in `inviteEmail.ts` is a regex literal holding a quote; a character walk reads
   it as a string opener and goes blind for twenty lines. Use
   `ts.createSourceFile`.
5. **A port is not a cherry-pick.** `europe/e1d04214`'s test asserts a permission
   India **blocks** after a Play rejection. Making that test pass the obvious way
   re-ships the permission that got version code 536 rejected.

---

## STATE

`main` at `e995eb93`, tree clean, **nothing pushed**. Remotes are now `origin`,
`sea`, `europe`, `africa`, `east`; the four siblings are local paths, so
`git log europe/main` costs nothing.

**Only the `Bolo Shots SE` simulator holds a signed-in session.** The 17 Pro and
17 Pro Max dev sims are signed out, which is why the wide end of the ticket is
pinned in jest rather than shot.

**Metro on 8083 is dead again**, killed by the `--frozen-lockfile` install. That
is trap 1 above, and it is expected rather than broken.

---

## THE OTHER FOUR, IN ONE LINE EACH

Reported by the supervisor session, not verified by me.

- **SEA** done and pushed, seven commits, four green, publish blocked on Replit.
- **Africa** portrait film committed unwired; the wide cut still rendering.
- **Europe** blocked on a download permission, which is above the publish on its
  own board.
- **East Asia** frozen since 23:42; its flag fix was put in by hand.

---

## OPEN, EACH NEEDING YOU

0b. **ONE PRODUCT QUESTION, ASKED ONCE, THAT DECIDES WORK IN THREE REPOS.**
   **What is a letter drill when the script has no alphabet?** It came up twice
   tonight from two directions and it is the same question both times: **Egyptian
   Arabic is cursive and joins**, so per-letter tracing may be the wrong shape;
   and **Han has no closed letter set at all**, so there is nothing to author.
   Between them that is **eight of East Asia's ten languages, two of SEA's six
   and one of Africa's three**. Nobody should port Letter Drill to those until
   you have answered it, and nobody but you can. The drill's own code assumes an
   alphabet and says so: `PLAYABLE_GLYPH_FLOOR = 12`.


1. **Store listings still publish the gmail address** while the app now replies
   to the LARK domain. One inbox or two is your call.
2. **`/privacy` and `/terms` now prerender**, verified by reading the emitted
   file: 4,654 characters of visible policy where there were none. **Prove it on
   production after the publish**, the way this repo proves every deploy:
   `curl -s https://bolo-india.app/privacy | wc -c` should stop being 7972.
3. **India alone enforces zxcvbn.** Nobody has ruled.
6. **`/manifest.webmanifest` returns the homepage.** No such file is built, so
   the PWA manifest the page asks for does not exist. Small, separate, and it is
   how I proved the prerender would work at all: real files beat the fallback,
   missing ones fall through.
4. **No 13-inch iPad screenshots**, and App Store Connect wants them the first
   time an iPad-capable build goes for review.
5. **`FREE_LANGUAGE` is a single string here** and an array in all four forks. It
   conflicts every cherry-pick. Agreed direction is India widening to the array.
7. ~~The currency noun splitting the wire contract.~~ **SETTLED overnight,
   `e08a57a2`, and it needs nothing from you.** The gift endpoint has a field
   named `chai`; India's contract said `chai` 21 times and SEA's said `kopi` 18
   times and `chai` never, so the wire format had already split without anyone
   deciding. Ruled across all five repos: **`chai` stays on the wire, each
   client renders its own word.** The spec now carries a comment saying the
   field is an identifier, which is the actual guard: without it the next fork
   agent "fixes" it and we get a fifth contract by tidiness. **Nothing was
   regenerated and nothing can have broken**: it is a YAML comment, and parsing
   the spec before and after gives an identical result.
