# Handoff: 2026-08-26

## Name this session BOLO BUILD CHAT 9

Chat 1 was the Android sign-out. 2 built the contribution page. 3 extracted
`lib/script-trace`. 4 was Script Trace and the story engine. 5 was the six
books. 6 shipped the storybook, the Emergency and the Nest. 7 was ten device
bugs and the global feed. **8 was this: the blocking control, the Nest turned
into a real dashboard, iOS 1.0.2 submitted for review, and a production outage
whose root cause had been sitting unexplained in `CLAUDE.md` for three days.**
You are 9. Increment once, at the start, never mid-session.

**Read `CLAUDE.md` first, then this.** Everything below was measured or read out
of source. Where something is unproven it says so.

---

## 1. Where things stand

- **Repo `/Users/aakeshpatel/bolo`, `main`, HEAD `c926948d`, tree clean, pushed.**
- **iOS 1.0.2 (510) IS IN REVIEW WITH APPLE.** Submitted 2026-08-26 from
  `79d61edc`. Bundle health checked before submission: 45,035 functions.
- **Android versionCode 509 is BUILT AND DELIBERATELY NOT SUBMITTED.**
  `https://expo.dev/artifacts/eas/pv3XYJe35kMlBtTwy4AC5EEEp8ikcDz36_E8HzgKp3k.aab`
- **The web is deployed at `54e26781`.** `c926948d` is documentation only, so
  the running code is current in every respect that matters.
- **Production is healthy**, verified by content: 41 tables, 23 users,
  `/api/friends/feed` and `/api/friends/leaderboard` both serving.
- Client suites at HEAD: **web 117 suites / 1333 tests**, **mobile 121 / 1219**,
  all six artifacts typecheck. **The api suite has not been run since `0d058a1d`**
  and has gained roughly 30 tests since.

**WHILE 1.0.2 IS IN REVIEW NO OTHER VERSION CAN BE SUBMITTED.** TestFlight
uploads are unaffected. To change something you must reject your own submission
in App Store Connect and resubmit, or wait. Do not cut a build expecting to slip
it in.

---

## 2. THE BIG ONE. Read this before touching any schema.

**REPLIT'S PUBLISH FLOW DIFFS THE DEVELOPMENT DATABASE AGAINST PRODUCTION AND
GENERATES MIGRATIONS TO MAKE PRODUCTION MATCH DEV.** It is a step in the
Publishing panel labelled "Generated migrations to apply to production
database", behind an **Approve and publish** button.

This answers the question `CLAUDE.md` had carried since 2026-08-23 about what
put three tables into production when nothing in the repo could have. They
existed in dev.

On 2026-08-26 the same mechanism generated

    DROP TABLE "user_blocks" CASCADE;

because that table had been created in **production by hand** and dev never got
it. It was approved unread. `blockedUserIdsFor` sits on the hot path of
`/friends/feed` and `/friends/leaderboard`, so **the entire social surface 500'd
for every learner** until the table was restored. On the phone it looked like a
blank home feed card and "Bolo couldn't load this".

**THE PROCEDURE, AND IT IS NOT OPTIONAL:**

1. Commit the migration: `pnpm --filter @workspace/db run generate`.
2. Apply it to **DEV**, in the Repl Shell:
   `pnpm --filter @workspace/db run sync-schema`. That script replays every
   committed migration idempotently and **never drops anything**.
3. Then publish. With the two agreeing **the migrations step does not appear at
   all**, and its absence is the confirmation you did it right.
4. **READ THE GENERATED SQL EVERY TIME. A `DROP` IS NEVER ROUTINE.**

Hand-applying to production is still correct for getting a change live now,
because production has no drizzle ledger and `drizzle-kit migrate` must never
run there. **It is only ever half the job.**

The full write-up is in `CLAUDE.md` under "THERE ARE TWO DATABASES".

---

## 3. What shipped in chat 8

**Blocking**, the third App Store Guideline 1.2 control, which was the gap
before the next store submission. Migration 0056 `user_blocks`, symmetric
enforcement in the WHERE clause of the feed and both leaderboard scopes,
blocking ends the friendship, `GET /blocks` and an Account list to undo it. Web,
iOS and Android.

**The Nest became a real dashboard**, replacing "open PostHog":

- **02 Numbers** `/nest/range`, any window, quick chips, sign ups / active /
  paid / free / attempts and a zero-filled by-day chart. Every tile drills into
  the accounts behind it via `/nest/drill`.
- **03 The line map** `/nest/map`, 22 lines, 1679 stops, learners per stop, in
  journey order with a zone and journey legend.
- **04 Flagged phrases** `/nest/reports`, the phrase reports with their notes.
- Per-alert timestamps, and a 30-second live refresh that pauses when hidden.

**The exclusion list was badly wrong and is now right.** The owner's own two
busiest accounts sat at the top of the learner board (45 and 42 attempts), and
three accounts named "John Apple" are Apple reviewers. Nine ids moved into a new
`nonLearnerUserIds` list, separate from `ownerUserIds` so counting never widens
access. **The dashboard went from 19 accounts / 1 paid to 10 / 0.** There are no
paying customers; the one "paid" was a reviewer's sandbox purchase.

**All 47 phrase reports came from the App Review tester**, and all 44 "notes"
are the literal string `appletester721-bolo@yahoo.com`. A client-side autofill
fix had already shipped and did not hold, so `lib/reportNote.ts` now drops an
email-only note server side.

**Six user-facing fixes:** the board told learners "nobody can see you" directly
above their own visible row; "See all" on the feed card opened the Weekly XP
ranking and forgot the scope; the line map ordered zones alphabetically so
everyone appeared mid-track; the app icon read "Bolo! Mobile"; the AASA file was
served as `text/plain`; and a sticky App Store bar was added to the landing page.

**The notification primer.** Production held **zero push tokens** because the
only code that could ask sat behind Account > Reminders. A primer now asks in
Bolo's words at first login, gated on `hasChosenLanguage`, and only a YES calls
`requestNotificationPermission`, so the single iOS dialog is never spent on a no.

---

## 4. Traps this session paid for

**CLASS NAMES COLLIDE. GREP THE STYLESHEET BEFORE YOU DEFINE ONE.** The first
version of the Nest sections redefined `.tile`, `.chips`, `.chip`, `.subhead`,
`.bar`, `.bars`, `.rangebar` and `.drill`, every one of which already existed,
and asked for a `var(--card)` this palette does not have. The drill panel
rendered with no background. The page already owned `button.tile[aria-expanded]`,
`.drill/.drill-h/.drill-body`, `.seg` and `.bars` with `--h`. Rewriting onto
them **deleted 7,771 characters** of my own CSS.

**A JEST FACTORY CANNOT REFERENCE A `const jest.fn()` DIRECTLY.** The component
import that triggers the factory is hoisted above the const, so
`requestNotificationPermission: mockRequest` captures it uninitialised and
silently yields `undefined` rather than erroring. Call it from inside an arrow:
`() => mockRequest()`. Closure-style mocks in the same file were unaffected,
which is why five tests passed and two did not.

**TWO PASSING TESTS WERE HOLDING A BUG IN PLACE.** `expect(link).toHaveAttribute("href", "/leaderboard")` on web and the bare route on mobile both asserted
exactly the broken behaviour. Inverted with the reasoning, per the repo rule.

**HERMES PACKS ITS STRING TABLE WITH OVERLAPPING SLICES.** Counting raw bytes in
an `.ipa` to prove a string is absent does not work: `bolo-india.app` appears
once because it is stored as a slice of `https://bolo-india.app/privacy`. I
claimed an env var was missing on that basis and was wrong. **Prove it by
checking a string that cannot overlap** (the Clerk `pk_live` key was present,
which settled it).

**`cd` PERSISTS BETWEEN BASH CALLS.** Three commands ran against the wrong
directory this session, one of which made `psql` connect to a local default and
report a production table missing when it was not. Use absolute paths.

**THE OWNER GATE AND THE COUNTING EXCLUSION ARE DIFFERENT QUESTIONS.**
`ownerUserIds` answers "who may open the Nest". `nonLearnerUserIds` answers "who
is not a customer". Merging them would hand the cockpit to the App Review tester.

---

## 5. Open, highest value first

1. **THE API HAS NEVER SENT AN ERROR TO SENTRY.** The `node-express` project
   held **zero issues in seven days** while `/friends/feed` returned
   `{"error":"Internal server error"}` to every learner. `SENTRY_DSN` is set in
   `[userenv.production]` and `app.ts:132` calls
   `Sentry.setupExpressErrorHandler`, so the wiring looks right and nothing
   arrives. **Every server-side 500 has been invisible**, which is why a total
   outage produced no alert and was found by using the app. Fix this first.
2. **Run `syncSchema` at api-server boot**, so production stops depending on
   anybody remembering step 2 of section 2. The script already exists and never
   drops.
3. **Re-run the api suite.** Nothing since `0d058a1d` has touched the dev
   database, and roughly 30 tests have been added: `routes/blocks.test.ts` (10
   including the fail-open regression), `routes/nest.range.test.ts` (9),
   `lib/reportNote.test.ts` (4, and these run on the Mac).
4. **Clicking a stop on the line map** to see which learners are standing on it.
   Parked at the owner's word, mid-session, until after the builds.
5. **The home widget should flash with the latest moment.** Asked for in chat 7,
   still not built. The card reads the projection already but renders one entry
   and never rotates.
6. **The Nest wants a free/paid account split over a date range.** Paid and free
   are snapshots today because `users` stores the current tier and no history.
   Answering "how many were paid in March" needs a tier-change log.
7. **`tts_cache` is 98% of a 1.23 GB database** and `purge-stale-tts-cache`
   appears never to have run.
8. **The production user purge**, still fully scoped and untouched. Note the 47
   phrase reports are now known to be one tester's, so the "export them first"
   caution from the last handoff is much weaker than it looked.
9. **Recording the RevenueCat `environment`.** It arrives on every webhook and
   `routes/revenuecat.ts:81` logs it and stores nothing, so the database cannot
   tell a sandbox purchase from a real one. Deliberately not done on submission
   night; it needs a column and a webhook write.

---

## 6. Android, and the calendar

**The Play closed test completes around 2026-08-29** and there is **zero
margin**: 12 testers is the exact minimum, and one opt-out restarts the 14 days.

**After the 14 days there are TWO waits, not one.** You apply for production
access, which is a human review by Google of your closed test (commonly a few
days, Google quotes up to 7), and only then does the actual release go through
normal review. **The 29th is when the clock starts, not when you can publish.**

**Publish nothing to the Alpha track until production access is granted.**

versionCode 509 is built and waiting. Android link verification has still never
been tested on a Play-distributed build.

---

## 7. Commands, by terminal

**Deploy web, in the BOLO Replit Shell**, then hit Republish and READ the
migrations step if one appears:

```bash
cd /home/runner/workspace && ls artifacts/gujarati-coach/package.json && GIT_EDITOR=true git pull --no-rebase origin main && pnpm install --frozen-lockfile && git merge-base --is-ancestor c926948d HEAD && echo "OK c926948d IS IN"
```

**Apply committed migrations to DEV, same Shell**, before any publish that
carries a schema change:

```bash
cd /home/runner/workspace && pnpm --filter @workspace/db run sync-schema && psql "$DATABASE_URL" -c "\dt" | tail -5
```

**The api suite, same Shell**, ~6 minutes, output that survives a restart:

```bash
cd /home/runner/workspace && mkdir -p tmp && pnpm --filter @workspace/db run sync-schema && cd artifacts/api-server && node --import tsx --test --test-reporter=tap --test-concurrency=1 --experimental-test-module-mocks "src/**/*.test.ts" > /home/runner/workspace/tmp/api.log 2>&1; cd /home/runner/workspace && { echo "exit=$?"; grep -E "^not ok" tmp/api.log | head -60; grep -E "^# (tests|pass|fail|skipped)" tmp/api.log; } > tmp/api-summary.log 2>&1; cat tmp/api-summary.log
```

**Client suites, Mac terminal:**

```bash
cd /Users/aakeshpatel/bolo && pnpm run typecheck
cd /Users/aakeshpatel/bolo/artifacts/gujarati-coach && npx vitest run
cd /Users/aakeshpatel/bolo/artifacts/bolo-mobile && npx jest --forceExit
```

**Read production, read-only, Mac terminal.** Always `cd` first: the working
directory persists between commands and an unset `DATABASE_URL_PROD` connects
psql to a local default that will lie to you.

```bash
cd /Users/aakeshpatel/bolo && set -a; . ./.env.production; set +a
PGOPTIONS='-c default_transaction_read_only=on' /opt/homebrew/opt/postgresql@17/bin/psql "$DATABASE_URL_PROD"
```

**Preview the Nest on a Mac against real data, read-only.** This is the only way
to see that page without deploying, and the script is in the scratchpad rather
than the repo. Mount the real nest router with `DATABASE_URL` set to the
production URL plus `?options=-c%20default_transaction_read_only%3Don`, stub
`requireAuth` to an owner id, serve `assets/nest-production.html` at `/`, and
never call `runStartupPipeline`. Roughly 40 lines.

**Mobile builds, Mac terminal**, from `artifacts/bolo-mobile`, **one at a time**:
start iOS, wait for `Bumping expo.ios.buildNumber` AND for the archive upload to
finish, then start Android. Both rewrite `app.json`.

```bash
./node_modules/.bin/eas build --platform ios --profile production --non-interactive
node --experimental-strip-types scripts/checkBundleHealth.ts <ipa-url>
./node_modules/.bin/eas submit --platform ios --latest --non-interactive
```

**Healthy is ~45,000 functions; poisoned is ~52,900.** Build 510 measured 45,035.

---

## 8. Working style

Verdict first, short bullets, **bold the keywords**, no long paragraphs. **No em
dashes, ever**, in chat, commits, comments or app copy. Always paste shell
commands as complete blocks and say which terminal, and whether it writes.

**ONE STEP AT A TIME, and it beats every other rule.** End with "Your plate"
naming exactly ONE action, then stop.

**Verify by content, never by assertion.** This session, three separate claims
turned out to be wrong when checked: that the tree was clean at `f4b58fe9`, that
the leaderboard copy needed fixing when it was already fixed and undeployed, and
that build 510 had no API host embedded. Each took one command to settle. **Run
the command.**

**Say when they are wrong, and check before saying it.** Twice the owner
reported something that turned out to be correct behaviour, and once they were
right about something I had dismissed. The line map ordering was caught by eye,
from a picture, when every number in it was correct.
