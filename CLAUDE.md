# BOLO

South Asian language learning. Product name is **Bolo!**; the web artifact dir is
still `gujarati-coach` for historical reasons. See `replit.md` for architecture,
auth, audio flow, and RevenueCat detail.

## Layout

pnpm monorepo. Workspaces: `artifacts/*`, `lib/*`, `lib/integrations/*`, `scripts`.

- `artifacts/gujarati-coach` — web app (React, Vite, Wouter, Clerk)
- `artifacts/bolo-mobile` — iOS/Android (Expo SDK 54, expo-router)
- `artifacts/api-server` — API (Express 5, Drizzle, Postgres)
- `lib/api-spec` — `openapi.yaml`; `pnpm --filter @workspace/api-spec run codegen`
  regenerates `lib/api-client-react` (orval) and `lib/api-zod`
- `lib/db` — Drizzle schema, migrations, seed
- `lib/script-trace` — **the stroke engine**: scoring, levels, script definitions
  and the authored chapter data. Pure, no React and no DOM, consumed by web,
  mobile and `scripts`. Extracted 2026-08-20 from the web artifact, which had a
  4803-line hand-maintained duplicate in mobile and a script whose only job was
  to police the two for drift.
- `lib/referral-link`, `lib/train-class`, `lib/integrations-openai-ai-{react,server}`

Database lives in Replit and there are TWO of them, development and production.
See "THERE ARE TWO DATABASES" under Working rules. **There is no `.env` on the
user's Mac**, so a laptop has no database access of any kind, dev or production,
until one is created. Dev and prod are out of sync. Assume nothing about parity.

## Typecheck

- `pnpm run typecheck:libs` — `tsc --build` over the `lib/*` project references.
  **A fresh clone must run this first**; nothing else compiles until `lib/*` is built.
- `pnpm run typecheck` — runs `typecheck:libs`, then each artifact's own `typecheck`.

## Running locally

Replit served the client and the API from one origin and injected every secret
into the environment. Neither is true on a laptop, so local dev needs three
things the repo does not do for you.

**Nothing loads `.env`.** There is no dotenv anywhere; every consumer reads
`process.env` directly. Export it yourself before any command that touches the
database or the API:

```
set -a; . ./.env; set +a
```

**`.env` is incomplete.** `SESSION_SECRET`, the `STRIPE_*` keys, the `R2_*`
keys, `CRON_SECRET` and `TTS_AUDIT_SECRET` only ever lived in Replit's Secrets
panel. The api suite needs `SESSION_SECRET` at minimum.

**Two processes, one origin.** The API is API-only and vite has no proxy of its
own, so `vite.config.ts` grows one when `API_PROXY_TARGET` is set. It is inert
everywhere that variable is unset, which is every deployed environment.

```
# API, from the repo root
pnpm --filter @workspace/api-server run build
PORT=3001 node artifacts/api-server/dist/index.mjs

# Web, from the repo root
PORT=5173 BASE_PATH=/ API_PROXY_TARGET=http://localhost:3001 \
  VITE_CLERK_PUBLISHABLE_KEY="$CLERK_PUBLISHABLE_KEY" \
  pnpm --filter @workspace/gujarati-coach run dev
```

## Tests, per artifact

Run from the repo root.

- api: `pnpm --filter @workspace/api-server run test`
  Baseline **1251 tests, 93 suites, 1249 pass, 0 fail, 2 skipped, ~430s**, measured
  in the Repl Shell 2026-08-27. (Was 1174/91/1172 on 2026-08-23, and 1064/68/1062
  before that; the growth is new coverage, not a change in behaviour.)
  **THIS RUN CLOSED THREE THINGS AT ONCE**, which is why the number moved so far.
  `learning.zone-testout.test.ts` was fixed at the end of chat 11 and had sat
  UNVERIFIED across two handoffs, because this suite cannot run on a Mac; it
  passes. The Nest's seven `nest.range.test.ts` failures are gone. And the four
  new username-clearing cases in `account.test.ts` were shipped on reading alone
  and are now proven against the real database.
  **THE PASS COUNT IS THE SIGNAL, NOT THE TOTAL.** A different total is new
  coverage; a different pass count is a regression.
  **It cannot be run on the Mac at all** — see the dev-database note under
  Working rules. Repl Shell or nowhere. **Run it alone.**
  The script runs `sync-schema` first, so running the api tests APPLIES pending
  migrations to the dev database.
- web: `pnpm --filter @workspace/gujarati-coach run test` (vitest)
  Baseline **128 files, 1399 tests, all pass, ~26s**, measured 2026-08-27.
  (Was 93 suites / 842 tests.) One flake seen once on 2026-08-27, a single
  failure that did not reproduce across two immediate re-runs; noted rather
  than chased, and worth watching for.
- mobile: `pnpm --filter @workspace/bolo-mobile run test` (jest)
  Baseline **132 suites, 1307 tests, all pass**, measured 2026-08-27. (Was 108
  suites / 1007 tests.) Needs `--forceExit`; workers leak and CI does not pass
  that flag. Known open item.

**Never run the api suite concurrently with web.** A different total is not a
failure; a different PASS count is.

Default to the minimum set covering the change (changed files plus importers), and
say which set you ran and why. Typecheck always. Full suites only on request, or
for the two exceptions: any migration change, and any change to tokenService, the
token ledger, the RevenueCat or Stripe webhook paths, or entitlement resolution.

## Migrations

`lib/db/drizzle/`, numbered sequentially, each with a matching entry in
`meta/_journal.json`. Generate with `pnpm --filter @workspace/db run generate`.
**Never create a table by hand in the database.** Doing exactly that broke
`migrate` for a day.

## Working rules

- **Verify by content, never by commit message.** Replit auto-committed 22 times in
  two days and the message rarely survived. Read the diffstat and file list.
  **The Repl's `main` normally sits AHEAD of GitHub by a stack of `Published your
  App` commits and the merges between them, and that is NOT divergence.**
  Established 2026-08-23: thirteen such commits, and `git diff --stat origin/main
  HEAD` in the Shell printed NOTHING, so the two copies were identical in content.
  Run that diff before worrying about the log. Note also that `git pull` in the
  Shell always produces a merge commit for this reason, so the Repl's HEAD hash
  will never equal the hash you pushed. Check `git merge-base --is-ancestor
  <pushed-sha> HEAD` instead.
- **Prefer `pnpm install --frozen-lockfile`.** Any manifest change re-resolves on
  pnpm 11 and threads `supports-color` through the graph (48 peer suffixes become
  1136), which leaves several `react-native` copies in the store. That used to
  break jest-expo's native mocks in 22 suites; `jest.config.js` now pins
  react-native to one resolved copy, so the churn is survivable rather than
  fatal. It is still noise in a tracked lockfile: review the diff before
  committing one, and do not let it ride along with an unrelated change.
- **THERE ARE TWO DATABASES, AND THE SHELL IS NOT THE ONE USERS TOUCH.**
  `$DATABASE_URL` in the Repl's Shell is the **development** database. The
  deployed app runs against a **separate production** database, and they are
  divergent. Established 2026-08-23 when three freshly created tables came back
  **empty in the Shell's database while production held the real rows**.

  1. **Never answer a question about real data from the Shell's database.** It
     is dev. Empty tables there mean nothing, and a count from there is not an
     answer. Query PRODUCTION, or you will report zero contributions to someone
     looking at a page full of them. The BollyMoves work learned this the hard
     way already.
  2. **Verify a deploy against production, by content.** The live endpoint
     answering correctly is the proof. A green check in the Shell is not.

  **HOW THE SPLIT WORKS, traced 2026-08-23.** The code has no dev/prod branching
  anywhere: every consumer reads bare `process.env.DATABASE_URL`, and
  `lib/db/src/index.ts` builds the only pool. The split is entirely Replit
  injecting a different value per environment. `.replit` is tracked and declares
  three scopes, `[userenv.shared]`, `[userenv.development]` and
  `[userenv.production]`, and production is the one carrying the `pk_live_`
  Clerk keys. `DATABASE_URL` is in NONE of them: it comes from `postgresql-16`
  in the `modules` line, which Replit injects per environment. **Confirmed by
  the user in the Repl's Database pane, which lists two databases.**

  **NOTHING IN THIS REPO MIGRATES PRODUCTION, so do not expect a deploy to
  carry a migration.** Boot is bare `node --enable-source-maps ./dist/index.mjs`.
  `[deployment.postBuild]` is only `pnpm store prune`. The `[postMerge]` hook
  DOES run `pnpm --filter @workspace/db run setup`, which is `drizzle-kit
  migrate` plus seed, but it runs in the Repl WORKSPACE, so **it migrates dev**.

  **THE DEV DATABASE IS UNREACHABLE FROM A LAPTOP, established 2026-08-23.** Its
  host is `helium` and its database `heliumdb`: a Replit-internal name that does
  not resolve anywhere else, so `psql` fails with "could not translate host name".
  Production is a public Neon endpoint and connects fine from a Mac. Two
  consequences worth knowing before planning any work around them:

  1. **The api-server test suite CANNOT be run on the Mac**, because it needs the
     dev database. It runs in the Repl's Shell or not at all.
  2. **The app cannot be run locally against dev either**, so a UI change that
     needs real data has to be verified in the Repl, or by a test with mocked
     data. The journey tests already do the latter and are the pattern to follow.

  Putting a dev `DATABASE_URL` in `.env` on the Mac therefore buys nothing. That
  is why there was never one there.

  **ANSWERED 2026-08-26, AND IT IS THE MOST IMPORTANT THING IN THIS SECTION.**
  This entry used to end "what is STILL NOT established: what put the three new
  tables into production on 2026-08-23, since nothing above can have." Here is
  what:

  **REPLIT'S PUBLISH FLOW DIFFS THE DEVELOPMENT DATABASE AGAINST PRODUCTION AND
  GENERATES MIGRATIONS TO MAKE PRODUCTION MATCH DEV.** It is a step in the
  Publishing panel, between "Provision" and "Security checks", labelled
  "Generated migrations to apply to production database", and it waits on an
  **Approve and publish** button. Nothing in this repo drives it: not `.replit`,
  whose `[deployment.postBuild]` really is only `pnpm store prune`, and not
  `[postMerge]`, which runs against the workspace. It is the platform.

  That is why three tables appeared in production on 2026-08-23: they existed in
  dev. It is also why, on 2026-08-26, it generated

      DROP TABLE "user_blocks" CASCADE;

  because `user_blocks` had been created in PRODUCTION BY HAND and dev had never
  got it. The first time it ran, it was approved without anybody reading it, and
  the table went. `blockedUserIdsFor` is on the hot path of `/friends/feed` and
  `/friends/leaderboard`, so the whole social surface 500'd for every learner
  until the table was restored.

  **THE RULE THAT FALLS OUT OF THIS, AND IT GOVERNS EVERY SCHEMA CHANGE:**

  1. **Commit the migration.** `pnpm --filter @workspace/db run generate`.
  2. **Apply it to DEV**, in the Repl Shell:
     `pnpm --filter @workspace/db run sync-schema`. That script replays every
     committed migration idempotently and **never drops anything**.
  3. **Then publish.** With dev and production agreeing, the diff finds nothing
     and the migrations step does not appear at all. Its absence is the signal
     that you did this right.
  4. **READ THE GENERATED SQL EVERY TIME. A `DROP` IS NEVER ROUTINE.** It is the
     only thing standing between the platform and your production data, and it
     is one click.

  **ANY CHANGE APPLIED TO PRODUCTION BY HAND WILL BE REVERTED BY THE NEXT
  PUBLISH UNLESS DEV HAS IT TOO.** Hand-applying to production is still correct
  for getting a change live now, because production has no drizzle ledger and
  `drizzle-kit migrate` must never be run there. It is only ever half the job.

  **A related gap, found the same night and NOT yet fixed:** the api-server has
  never sent a single error to Sentry. The `node-express` project held zero
  issues while `/friends/feed` was returning `{"error":"Internal server error"}`
  to every learner. `SENTRY_DSN` is set in `[userenv.production]` and
  `app.ts:132` calls `Sentry.setupExpressErrorHandler`, so the wiring looks
  right and nothing arrives. **Every server-side 500 you have ever had has been
  invisible**, which is why a total outage produced no alert and was found by
  using the app.

- **Never rewrite history on `main`.** No amend, no `reset --hard`, no rebase onto
  main, no force push. `origin` is GitHub; `gitsafe-backup` is a stale Replit remote.
- **Reuse before you write.** Web and mobile share no components: they are
  hand-maintained twins held together only by prose comments. Grep for an existing
  helper first. A second definition of the same thing is the defect, not the fix.
- **Both platforms, or say why not.** Every user-facing change states its reach:
  web done, iOS done, Android done, or why one is excluded.
- **Read the test before changing it.** If an assertion fails because behaviour
  changed on purpose, INVERT it with a comment. Do not delete it.
- **Quote before you edit.** For any non-trivial change, quote the current code
  first. Several bugs here came from a stale mental model of a file.
- **Comments carry reasoning, not description.** Name the commit or task that caused
  the thing. If you change behaviour a comment describes, change the comment.

## Style, for anything written for the human

Verdict first, then short bullets. Bold the key words. No long paragraphs.
**No em dashes, ever** (app copy, comments, or chat). Offer a recommendation with
any choice. End with a numbered "Your Plate", 2 to 3 actions max, then "Nothing
else on you." The human has ADHD: one step at a time, and say plainly where a
command runs.

## Known open items

- **THE SIMULATOR DEV LOOP (chat 11) IS THE WAY TO SEE MOBILE.** Dev client
  on the iPhone 17 Pro sim (`org.name.Bolo`), Metro hot reload, deep links
  (`xcrun simctl openurl booted "bolo-mobile://journey"`), Maestro for
  taps/swipes. **`tapOn: id: "<testID>"` WORKS, established 2026-08-28** by
  driving the chat screen's collapsed input, mute toggle and backdrop; only the
  TEXT matcher is the one that cannot see RN's tree, and this line used to say
  "coordinates only", which sent a session down the coordinate path
  unnecessarily. Maestro needs a JRE (`brew install --cask temurin`) and
  **refuses a `takeScreenshot` path outside its own run folder**, so take shots
  with `xcrun simctl io <udid> screenshot` between steps instead,
  `simctl` screenshots, and onLayout console probes over Metro. Valid for
  layout, navigation and touch; NOT for animations or release behaviour
  (rules below). Two operational traps: **EAS goes bare-workflow if it sees
  `artifacts/bolo-mobile/ios`** (excluded in `.easignore`, which REPLACES
  .gitignore on EAS; also run eas-cli from `artifacts/bolo-mobile`, never
  the repo root), and the dev client's Info.plist is hand-patched (usage
  strings + URL schemes) so regenerating ios/ silently breaks chat's mic
  and deep links until re-patched.

- **EXPO-ROUTER SCREENS OUTLIVE THE USER'S MENTAL MODEL OF THEM, and it has
  now caused two bugs in one day (2026-08-28).** A route that looks like it
  opens fresh is often still MOUNTED from last time, holding all its state.
  1. The language picker is a modal route. Its search box accumulated across
     openings: type "guj", close, reopen, type "hindi", and the field reads
     "gujhindi" and matches nothing, so the picker appears to contain no
     languages at all. Fixed with `useFocusEffect` resetting the query.
  2. Chacha-ji's call screen did not unmount on answering, so a second deep
     link found it already connected rather than ringing.
  **The fix is the same shape both times: reset on FOCUS, not on mount.** If a
  screen has state a learner would expect to be fresh each time they open it,
  `useEffect(..., [])` is the wrong hook, because it fires once for the life of
  the mounted route and not once per visit.

- **TWO RENDER TRAPS PROVEN ON DEVICE, chat 11, both invisible to RNTL:**
  1. An `Image` sized by `width:'100%'`+`aspectRatio` or by `absoluteFill`
     inside this tree can resolve to its INTRINSIC pixel size on device.
     This was the entire blank-board saga of builds 511-515. Size images in
     explicit points when the box is knowable.
  2. A react-native-svg `Svg` overlay EATS ALL TOUCHES under it even with
     `pointerEvents="none"`. It killed every stop-card tap when a zone-wide
     stall layer went above the cards. Never span an Svg across tappable
     UI; use per-element svgs sized to their art.


- **1.0.0 IS RELEASED ON THE APP STORE as of 2026-08-21, so it is CLOSED. Every
  iOS submission from now on needs `expo.version` BUMPED, not just
  `ios.buildNumber`.** Build 210 was rejected at upload for exactly this, with two
  errors that are the same fact twice: **90062**, `CFBundleShortVersionString`
  must be higher than the approved 1.0.0, and **90186**, "the train version
  '1.0.0' is closed for new build submissions". **90186 means TestFlight is closed
  for that train too, so this blocks internal testing, not just release.** The
  version is a compile-time value, so a rejected binary cannot be resubmitted, it
  has to be rebuilt. **`1.0.4` was approved and released on 2026-08-28, so that
  train is closed too and `app.json` is already bumped to `1.0.5` for the next
  submission.** This line has been stale before: it said `1.0.1` while 1.0.2,
  1.0.3 and 1.0.4 shipped, so check `app.json` rather than trusting it.

  **Also confirmed 2026-08-21: EAS `autoIncrement` with `appVersionSource: local`
  WRITES THE INCREMENTED NUMBER BACK INTO `app.json`.** It left `201` and then
  `210` in the working tree after each build. So the number you commit is one less
  than the build you get, and the tree is dirty afterwards.

- ~~The launch crash.~~ **Fixed 2026-08-20. It was `expo-video` on the launch
  path, plus `react-native-worklets` being off Expo SDK 54's pinned 0.5.1.**
  Remove both and a store build launches 10 cold starts for 10 (build 150).
  The fault is `EXC_BAD_ACCESS` on `com.facebook.react.runtime.JavaScript`
  inside HadesGC evacuation, 200ms to 600ms in, appearing as either
  `KERN_INVALID_ADDRESS at 0x2000` in `CardTable::updateBoundaries` or
  `EXC_ARM_DA_ALIGN` in `BaseVisitor::visitArray`. The JS trigger is arbitrary
  (an object spread one time, a plain property write another) because the heap
  is ALREADY corrupt when the collector runs. The GC is the detector, not the
  cause.
  **An earlier entry here claimed worklets 0.8.3 was the fix. It was not.** It
  "fixed" the crash by breaking reanimated so completely that nothing animated,
  and with no worklets running there was nothing to corrupt the heap. Pairing it
  with a matching reanimated brought the crash straight back.

- **THE MEASUREMENT RULES. Nineteen builds were wasted before these were known.
  Read this section before touching a native-level bug in this app.**

  1. **AD-HOC BUILDS CRASH 10 OUT OF 10 NO MATTER WHAT IS IN THEM. They are
     worthless as evidence.** `distribution: "internal"`, which is every QR /
     preview build, crashes every launch on code that a store build of the SAME
     COMMIT runs perfectly. Proven: `36a3a7a3` as a store build is 10/10 clean;
     the identical commit as an ad-hoc build crashes every time. **Only store
     builds through TestFlight tell the truth.** Roughly fifteen builds of this
     investigation measured nothing but this artefact.
  2. **DEV BUILDS ANIMATE WHEN RELEASE BUILDS DO NOT.** A development build with
     Metro, even serving `--no-dev --minify` production JS, animates perfectly
     on code where the release build is completely frozen. So local checks, fast
     refresh and every green suite can all say the app is fine while it is not.
     **A dev build can never clear an animation bug.**
  3. **CLEARING A SUSPECT MEANS MEASURING THE SYMPTOM YOU CARE ABOUT.** This is
     the single most expensive mistake made here, and it was made twice.
     `expo-video` and `BrandSplash` were both "cleared" by removing them and
     observing that the crash continued. Nobody looked at whether the ANIMATIONS
     came back. `expo-video` turned out to be half the crash; `BrandSplash`
     turned out to be the whole animation bug. **Two symptoms were treated as
     one thing for two days.**
  4. **DIFF THE LOCKFILE FOR NATIVE PACKAGES between a build that works and one
     that does not.** This was the measurement that cracked it and it was
     available on day one. Between build 40 and `main` exactly one package
     shipping native code differed: `expo-video`. Everything else was noise.
  5. **Read the device's crash reports, never Sentry.** Sentry silently stopped
     delivering these at 16:28 on 2026-08-19 while the phone kept writing them,
     and reading that silence as success is how the crash got declared fixed
     three separate times. Settings > Privacy & Security > Analytics &
     Improvements > Analytics Data, entries named `BoloMobile-<date>`. **Check
     the timestamp against the build time**; a seven-hour-old report was twice
     read as fresh.
  6. **Ten launches, never five.** Five clean happens by luck 40% of the time at
     a one-in-six rate. Every wrong call came from a 5-of-5 sample.
  7. **Every build needs a UNIQUE number, and confirm it in Settings before
     counting.** Two branches each autoIncrementing from their own base both
     produced `1.0.0 (61)`; iOS could not tell them apart and one whole result
     was void. Set `ios.buildNumber` explicitly and far clear of everything.
  8. **Reboot the phone and re-run the PREVIOUS build before comparing.** An A/B
     measured an hour apart on a phone that has taken a dozen installs is not an
     A/B. Two contradictory results came from this.
  9. **Put the unknown on the screen instead of inferring it.** One diagnostic
     banner showing the two Reduce Motion values and an UNGATED animated bar
     replaced about seven bisect builds and ended five wrong theories at once.
     `components/AnimDiag.tsx` on the `diag/*` branches is the pattern.

  10. **APPLY RULE 4 TO YOUR OWN BUILDS, NOT JUST TO OLD ONES.** Build 201 was a
     fix that failed, and one `git diff` against build 160, the last build known
     to animate, showed identical dependency sets and exactly one functional
     change. That diff took a minute and named the cause outright. It should be
     the FIRST thing done when a fix does not work, not the last.
  11. **CHECK THE ARTEFACT, NOT JUST THE SOURCE.** Every finished EAS build stays
     downloadable for 30 days. Comparing two `.ipa` files directly — `Info.plist`
     for the toolchain, the zip manifest for the contents, the Hermes header for
     the bundle — took twenty minutes and produced the first hard fact of the
     whole investigation. **It should have come before any bisect build.**
  13. **A SHARED SIMULATOR IS AN UNCONTROLLED VARIABLE, and every rule above
     this one assumes you have the device to yourself.** Established 2026-08-28,
     when two agents worked this repo at once. One drove Maestro flows opening
     `bolo-mobile://call` while the other took screenshots of a language picker.
     The result: one agent reported a phantom trigger that did not exist (the
     other agent's flow had navigated over its screen), and the other read
     3/3, then 2/3, then 1/3 failures on IDENTICAL CODE and nearly went hunting
     for a regression. Both were the same collision.
     **THE TELL IS NOT CONTRADICTORY RESULTS, IT IS RESULTS THAT CHANGE WHILE
     THE CODE DOES NOT.** 3/3, then 2/3, then 1/3 on bytes that never moved, and
     both agents' first instinct was still to go hunting for a regression rather
     than to look at the room. That instinct is the expensive part. When a
     number moves and your diff is empty, suspect the instrument and the room
     before you suspect the code.
     **Say before you run a batch, and say when you are done.** A screenshot or
     an assertion taken while someone else is driving proves nothing, and it
     costs more to chase than it does to ask. This is rule 12 wearing a new
     costume: if two runs of one thing can differ, no result is interpretable.

  12. **A BUILD THAT IS NOT REPRODUCIBLE CANNOT BE BISECTED.** If two builds of
     one commit can differ, every A/B result is uninterpretable and every hour
     spent on one is wasted. Establish reproducibility FIRST: commit `ios/`,
     commit `Podfile.lock`, pin the builder `image` in `eas.json`. **Nineteen
     builds were spent before anyone checked this.**

- **THE NATIVE ANIMATION DRIVER IS DEAD, NOT JUST REANIMATED. Established on
  device 2026-08-21 by build 270.** A ported animation using react-native's own
  `Animated` with **`useNativeDriver: true`** came out **dead flat**, while the
  diagnostic's own bar on **`useNativeDriver: false`** kept pulsing beside it in
  the same build. **So anything driven per-frame from the NATIVE side does not
  tick in release builds of this app.** That is also why reanimated 4's frame
  loop never starts: on the New Architecture it drives from native too.
  **`useNativeDriver: false` is the only thing that animates here.** Every RN
  `Animated` port in this codebase must pass `false`, and the cost is that a busy
  JS thread can stutter idle motion, which is a fair price for it running at all.
  See `lib/useLoopProgressRN.ts`.

- **THE ANIMATION BUG. THE CAUSE IS NOT IN THIS REPO. Two builds of
  byte-identical source produce different bundles, and the bundle predicts the
  symptom perfectly.** Measured 2026-08-21 across seven store builds:

  | build | verdict | bytes | functions |
  |---|---|---|---|
  | **160** | **ANIMATES** | **8,886,780** | **44,080** |
  | 150 | frozen | 9,525,032 | 52,918 |
  | 170 | frozen | 9,526,224 | 52,920 |
  | 180 | frozen | 9,525,032 | 52,918 |
  | 190 | frozen | 9,523,200 | 52,899 |
  | 201 | frozen | 9,521,108 | 52,878 |
  | 220 | frozen | 9,520,604 | 52,872 |

  **Six frozen builds cluster at ~52,900 functions. The one animating build has
  44,080. Nothing lands in between.** String and identifier counts are
  near-identical across all seven (62,545 to 62,575 strings; 34,257 to 34,271
  identifiers), so it is **the same JavaScript compiled two different ways**.
  Builds 160 and 220 differ only in comments, `"1.0.0"` to `"1.0.1"`, and the
  build number — verified with a full unfiltered diff of the entire repo — and
  still came out 8,792 functions apart.

  **RULED OUT BY MEASUREMENT, not by argument.** `expo-video`, worklets, the
  animation driver, the library choice, `BrandSplash`, the native splash hold,
  Reduce Motion, Low Power Mode, a reboot, Xcode version (both 17A324), SDK
  (both 23A339), build machine (both 24G90), the lockfile (byte-identical),
  **React Compiler** (toggling it locally moves the count by six), and the
  **Hermes `-O` flag** (no effect on function count at all).

  **WHAT IS NOT KNOWN: why EAS emits the bigger bundle.** A local
  `expo export:embed` on this same source produces ~43,000 functions, the healthy
  shape, so the divergence happens **on the EAS builder** and could not be
  reproduced on a Mac. **Every prior theory in this file about WHY the app froze
  was wrong**, including two of mine, because they were all built on comparing
  builds that were never comparable.

  **THE ROOT PROBLEM IS THAT YOUR BUILDS ARE NOT REPRODUCIBLE.** No `ios/`
  committed, so `expo prebuild` regenerates the native project every build; no
  `Podfile.lock` committed, so CocoaPods re-resolves every build; no `image`
  pinned in any `eas.json` profile, so the toolchain can move under you. **Two
  builds of one commit were never guaranteed to be the same app, which is why a
  week of one-variable-at-a-time bisecting produced nothing.** Fixing that is the
  actual work.

  **PRE-FLIGHT CHECK, use it before spending an install:**
  `node --experimental-strip-types scripts/checkBundleHealth.ts <ipa-url-or-path>`
  reads the Hermes header and tells you HEALTHY or POISONED in about a minute.
  **A poisoned build should be rebuilt, not installed.**

- **`expo-image` MUST NOT be imported anywhere in the mobile app. It crashed
  five cold starts out of five, twice**, including a build where it rendered
  nothing but a still poster. That ban is the one splash-renderer verdict that
  stands on its own evidence. Guarded by a census in
  `__tests__/splash-film.test.tsx`. `expo-image-picker` is a different package
  and is fine. `app/(app)/account/index.tsx` had already worked around
  expo-image for its avatar, which was corroboration nobody grepped for.
- ~~expo-video crashes the app.~~ **That ban was never earned, and was lifted
  2026-08-20.** expo-video was the FIRST thing removed on 2026-08-19 and the
  crash carried straight on without it; the 18:40 device report that night is
  the same fault on a build with no expo-video in it. Suspicion hardened into a
  rule in this file and a test asserting it. **The splash now plays the original
  `welcome-bolo.mp4` at 1080x2400, untouched, through expo-video from the root
  layout: 10 cold starts for 10.** `SPLASH_MOTION_ENABLED` in
  `lib/splashFilm.ts` is the kill switch and is **true**.
  Every other splash verdict from that day was contaminated the same way, since
  all of them were measured on worklets 0.5.1. The one exception is expo-image
  above, whose evidence was self-contained.
- **The fallback, already proven: `assets/splash/wave/`.** Twelve JPEGs at
  640px, 364KB, ping-ponged through react-native's own `Image`. Shipped as build
  47 and went 10 cold starts for 10. Kept on disk unreferenced with its ffmpeg
  recipe in `lib/splashFilm.ts`. A full-resolution frame sequence of the WHOLE
  film is not viable and was measured rather than guessed: 122 frames at
  1080x2400 is 11.7MB bundled and 1.2GB of decoded pixels. That is why the film
  is an mp4 and not frames.
- **The bazaar welcome still shows its poster.** `components/BazaarWelcome.tsx`
  lost its film in the same panic and has not been given it back. It is off the
  launch path, so it was never urgent, but the reason it was removed is now
  known to be wrong.
- ~~RevenueCat reconcile-on-read returns 401.~~ **Fixed 2026-08-19.** The cause
  was never a wrong key: Replit's RevenueCat connector issues a **v2-scoped**
  token, so the `/v1/subscribers` call through it always 401'd (documented in
  `docs/CODEBASE-FACTS.md` on 2026-07-29 and unfixed for a month).
  `revenuecatClient.ts` now calls v1 directly with `REVENUECAT_SECRET_API_KEY`,
  which is one fewer thread tying this codebase to Replit. The connector remains
  as a fallback and still 401s where no key is set.
- ~~The API logger has no Sentry transport.~~ **Fixed 2026-08-19.** `logger`
  now forwards **warn and above** to Sentry. Warn is included on purpose: the
  RevenueCat 401 that hid for a month logged at warn, so forwarding only errors
  would have left the more expensive of the two bugs invisible. An `err` on the
  log is reported as an exception (grouped by stack), everything else as a
  message keyed on the log line (grouped by the line, not by whichever field
  varies). No DSN means every call is a no-op, so local and test behaviour is
  unchanged.
- `playCue` is wired at 22 call sites on both platforms; the audio files were never
  authored. Both no-op by design.
- Nothing renders `app/_layout.tsx` or `(tabs)/index.tsx`. (`BrandSplash` and
  bazaar welcome now have tests; note that any splash query needs
  `includeHiddenElements: true`, since the overlay hides itself from the
  accessibility tree on purpose.)
- Sentry ingests development events into the production stream.
- One-Language tier is dead (no RevenueCat package, no purchasers) but
  `allowedLanguagesForPlan` still branches on it.

## Chai packs: why they never credited, resolved 2026-08-19

Two independent faults, and BOTH had to be fixed. Worth reading before touching
the purchase path, because either one alone reproduces the same symptom: Apple
charges, the app says "Chai on the way", the balance never moves.

1. **The server listened for an event RevenueCat does not send.**
   `NON_SUBSCRIPTION_PURCHASE` is not in their vocabulary; the consumable event
   is `NON_RENEWING_PURCHASE`. Both are accepted now, real name first.
2. **The in-app purchases were incomplete in App Store Connect.** Apple will
   sell a product whose metadata is unfinished, which is why prices rendered and
   StoreKit took the money, but RevenueCat cannot validate the transaction, so
   it records no purchase and sends no webhook. Uploading the review screenshots
   completed them.

Fault 2 hid fault 1 completely. A purchase at 09:22 failed with the code fix
already deployed, which is how we know the metadata was load-bearing.

`POST /chai-packs/credited` is READ-ONLY: it selects from the ledger and never
grants. The webhook is the only thing that can add Chai. If a balance moves
without a webhook in the log, something is wrong with your reading of the log,
not with that rule.

## The Android sign-out: two Clerk clients, resolved 2026-08-22

Sign in on Android, sit on the homepage, and about 43 seconds later the app is
back at the sign-in screen. Foreground, idle, no interaction. Deterministic, not
flaky:

```
build 422, @clerk/expo 3.7.4   session held 43033 ms
build 423, @clerk/expo 3.7.8   session held 43747 ms
build 426, exclusion + patch   session held 344000 ms and still signed in
```

**The mechanism.** Since v3.0.0, `@clerk/expo` runs TWO Clerk clients: the JS one
(clerk-js) and an embedded native one (`com.clerk.api.Clerk`, via
`expo.modules.clerk.ClerkExpoModule`), kept agreed by `useSyncableTokenCache`,
`useNativeClientBootstrap` and `useNativeClientEventSync` in
`node_modules/@clerk/expo/dist/provider/nativeClientSync.js`. The client JWT
rotates on every FAPI call. clerk-js's own refresh tick rotates it, the native
side answers with its now stale copy, the sync layer writes the stale token back,
refetches `/v1/client`, and the server returns **200 with a brand new empty
client**. No sessions on it, so `isSignedIn` flips. Nothing was revoked, which is
why Clerk's dashboard logs are clean.

**The fix, and it takes BOTH halves.**

1. `expo.autolinking.android.exclude: ["@clerk/expo"]` in
   `artifacts/bolo-mobile/package.json`, beside the `apple` one that has been
   there since 2026-07-14. **That apple exclusion is why iOS never had this bug.**
   With the module excluded, `loadNativeModule()` returns null and every sync path
   no-ops. Verified: builds 422 and 423 printed Clerk native lines to logcat, 426
   prints zero.
2. `scripts/patch-clerk-android-specs.mjs`, wired as the root `postinstall`.
   **The exclusion alone crashes at launch.** Build 424 died with
   `JavascriptException: Error: Cannot find native module 'ClerkExpo'` because of
   one word:

   ```
   NativeClerkModule.js          requireOptionalNativeModule   returns null
   NativeClerkModule.android.js  requireNativeModule           THROWS
   ```

   and `dist/utils/native-module.js` wraps only the property access on line 19,
   not the `require` on line 4, so the throw escapes the try/catch meant to
   absorb it.

**Do NOT convert that postinstall to `pnpm patch`.** It was tried, and build 425
died in 20 seconds on `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`. This repo is worked
from two pnpm versions that keep `patchedDependencies` in different files with no
shared value:

```
pnpm 11 (this Mac)                    pnpm-workspace.yaml
pnpm 10 (EAS builder, Replit)         package.json, under "pnpm"
```

pnpm 11 refuses the pnpm 10 location outright. A postinstall script does not care
which pnpm is running. Remove the script the day Clerk ships the fix upstream.

**Latent hazard introduced by the exclusion, unproven, do not chase without
evidence.** `NativeClientSync` renders whenever `isNative()`, regardless of its
`enabled` prop, so its `handleUnauthenticated` and `updateClient` monkey patches
stay installed even with the module gone. On a genuine 401,
`handleUnauthenticated` calls `readNativeDeviceToken()`, gets null because there
is no module, and `syncDeviceTokenToCache(cache, null)` then **clears the client
JWT**. Idle use never triggers it. iOS has carried the same exposure since July
without incident. One dist-426 Sentry event is consistent with it (`held 112858ms,
credential absent`) but it came from the Google Play pre-launch crawler, not a
real device, so treat it as a hypothesis with one data point.

**Ruled out, each with evidence, so nobody re-runs these.** Not a crash (zero
FATAL, zero tombstones, pid survives). Not server-side (Clerk logs show
`session.created` around every bounce and zero revocations). Not session config
(inactivity timeout off, lifetime 7 days). Not app-initiated (nothing calls
`signOut` but two account-screen buttons). Not SecureStore (`lib/clerkTokenCache.ts`
reports any throw before deleting, and has never fired). **Not Android 16**: one
device, no evidence, two agents asserted it confidently anyway.

**Reading the diagnostics.** Sentry's default scrubbing strips any key containing
"token" or "auth" from extras and breadcrumb data, and it still ate
`credentialState` on 426. Tags survive, and so does the error MESSAGE. Put
anything load-bearing in the message, which is why the held-time and credential
state are in the string.

**Operational.** The `production` profile builds an `.aab`, which cannot be
sideloaded, so every Android test costs a full Play round trip: about 20 minutes
to build, then 10 or more for Play to serve it. `eas.json` already has a
`preview` profile that builds an APK you can `adb install` directly. Use it for
iteration. Force Play to notice a new internal build with:

```bash
adb shell am force-stop com.android.vending
adb shell am start -a android.intent.action.VIEW -d "market://details?id=com.bolo.mobile" -p com.android.vending
```

The `-p com.android.vending` matters. Without it the intent opens an app chooser.

## The contribution page: whose data counts

`bolo-india.app/aksharmala.html` collects traced alphabets and read-aloud audio
from family members. Built from `scripts/src/aksharmala.template.html` by
`pnpm --filter @workspace/scripts build-aksharmala`; the output is committed, so
**edit the template and rebuild, never the generated file**.

**IGNORE ANYTHING FROM "Test Aakesh".** That is the name used to demonstrate the
page to people, so those rows are a walkthrough, not handwriting. Same for
anything beginning "test", and for the `PROBE_CLAUDE` and `smoke` rows left by
endpoint checks.

This is enforced rather than remembered: `isTestContributor()` in
`@workspace/script-trace` matches any name starting with "test" plus a short
list, and `compareContributions()` drops them BY DEFAULT alongside anything
flagged `is_practice`. Forgetting the option excludes too much rather than too
little, which is the safe direction. **A name merely starting with "test" is
caught too**, and that trade is deliberate: losing one contributor called Testa
is recoverable, teaching a child from a developer's scribble is not.

**There was a "just trying this out" checkbox on the page and it was removed.**
It sat directly under the name field, and a real contributor would tick it as
readily as a tester would, silently opting their own work out of ever being
used. The `!` prefix it wrote still works in the wire format, the parser and the
`is_practice` column, so a row can still be marked after the fact.

**All twelve reading passages are UNVERIFIED.** They were written by an agent
with no translation tool and no speaker of each language to check them; Santali
and Meetei are first drafts. Every one carries `confidence` and
`verified: false` in `lib/script-trace/src/passages.ts`, and the build prints a
WARNING naming all twelve on every run. The page asks each reader whether the
text is natural before they record and stores both answers in `passage_feedback`
**including the plain yeses**, because a yes from a speaker is what lets a
passage be marked verified.
