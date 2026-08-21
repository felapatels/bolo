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

Database lives in Replit; `DATABASE_URL` in `.env` points at it. Dev and prod are
out of sync. Assume nothing about parity.

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
  Baseline 1064 tests, 68 suites, 1062 pass, 2 skipped, ~350s. **Run it alone.**
  The script runs `sync-schema` first, so running the api tests APPLIES pending
  migrations to the dev database.
- web: `pnpm --filter @workspace/gujarati-coach run test` (vitest)
  Baseline 93 suites, 842 tests, all pass, ~66s.
- mobile: `pnpm --filter @workspace/bolo-mobile run test` (jest)
  Baseline 108 suites, 1007 tests, all pass. Needs `--forceExit`; workers leak and
  CI does not pass that flag. Known open item.

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
- **Prefer `pnpm install --frozen-lockfile`.** Any manifest change re-resolves on
  pnpm 11 and threads `supports-color` through the graph (48 peer suffixes become
  1136), which leaves several `react-native` copies in the store. That used to
  break jest-expo's native mocks in 22 suites; `jest.config.js` now pins
  react-native to one resolved copy, so the churn is survivable rather than
  fatal. It is still noise in a tracked lockfile: review the diff before
  committing one, and do not let it ride along with an unrelated change.
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

- **THE ANIMATION BUG. ANYTHING THAT COVERS THE SCREEN WHILE THE APP MOUNTS
  FREEZES EVERY REANIMATED ANIMATION FOR THE LIFE OF THE APP, in RELEASE
  builds.** It does not matter whether the cover is a React view or the native
  splash screen. Six store builds of the same commit, one variable apart:

  | build | what covered the screen at mount | result |
  |---|---|---|
  | 150 | JS overlay, RN `Animated`, native driver on | app frozen |
  | 170 | JS overlay, reanimated | the SPLASH froze instead |
  | 180 | JS overlay, RN `Animated`, native driver off | app frozen |
  | 190 | JS overlay, **a bare static `View`, nothing else** | app frozen |
  | 201 | **NO JS overlay. The NATIVE splash, held past Clerk** | **app frozen** |
  | 160 | **nothing. Native splash hides on fonts** | **everything animates** |

  **An earlier version of this entry said the cause was a JS overlay at the root
  and that holding the native splash was the fix. Build 201 disproved it.** 201
  mounted no JS overlay at all and froze exactly like the overlay builds.
  Dependency sets between 160 and 201 were **identical**, and the splash hold was
  the **only** functional difference in `app/_layout.tsx`. That diff is what
  identified it, which is measurement rule 4 applied to our own build.

  **THE SHIP SHAPE, and it is build 160's, restored verbatim: the native splash
  hides on `fontsLoaded || fontError` and nothing else covers the boot.** Do not
  hold it longer, on a timer or otherwise. `__tests__/splash-film.test.tsx` fails
  if anything renders `<BrandSplash>` under `app/`, if the layout gains a
  `setTimeout`, or if the release stops keying on fonts. Every one of those guards
  was checked by breaking it deliberately and watching the test fail.

  **The cost is a brief uncovered gap** while Clerk resolves and the two redirect
  hops run. **That gap is the price of a working app, and it is worth paying.**
  There is no boot film any more. `components/BrandSplash.tsx` stays on disk,
  unreferenced except for a deliberate unused import in the layout that is kept
  so this build remains the thing that was measured.

  **`app/_layout.tsx` keeps that unused `BrandSplash` import on purpose.** Build
  160 carried it, Metro does not tree-shake, so the module is bundled and
  evaluated either way. Removing it would silently make the build stop being the
  one with the 10-for-10 result behind it.

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
