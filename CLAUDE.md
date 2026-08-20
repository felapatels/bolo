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

- **THE LAUNCH CRASH IS NOT FIXED. Removing `expo-video` did not fix it, and
  anyone who reads otherwise in an older commit message is reading a mistake.**
  The fault is `EXC_BAD_ACCESS`, `KERN_INVALID_ADDRESS at 0x2000`, on
  `com.facebook.react.runtime.JavaScript`, inside `CardTable::updateBoundaries`
  under `HadesGC::scanDirtyCards`. Intermittent, roughly one cold start in six,
  and it fires 200ms to 600ms after launch, which is module-init time rather
  than anything a screen does.
  **Use the device's crash reports as the oracle, NEVER Sentry.** Sentry stopped
  delivering these on 2026-08-19 at 16:28 EDT while the phone kept recording
  them, and reading that silence as success is exactly how this got declared
  fixed three times in one day. iOS Settings > Privacy & Security > Analytics &
  Improvements > Analytics Data, entries named `BoloMobile-<date>`.
  **Five clean launches proves nothing** at a one-in-six rate: it happens by
  luck 40% of the time. Every wrong call that day came from a 5-of-5 sample.
  Live suspects, none eliminated: `react-native-worklets` 0.5.1 with reanimated
  4.1.1 starting a second Hermes runtime (turning entrance animations off did
  NOT test this, since the worklets runtime still starts), `@sentry/react-native`
  initialising early on the launch path, and Hermes itself on RN 0.81.5 with the
  New Architecture.
- **THE DEVICE IS AN UNCONTROLLED VARIABLE, AND EVERY CONCLUSION DRAWN FROM A
  SINGLE 5 OR 10 LAUNCH SAMPLE ON 2026-08-19 IS SUSPECT, INCLUDING MINE.**
  `bd817370` went **0 crashes in 10** at roughly 21:00. `350af74e`, which is
  RUNTIME-IDENTICAL to it (`SPLASH_MOTION_ENABLED` false means the interval
  returns immediately and the same poster renders through the same
  react-native `Image`; the only additions are twelve dead `require()`s that
  produce asset ids and decode nothing), went **9 crashes in 10** about an hour
  later.
  Same code. Opposite result. **Something other than the bundle changed**, most
  likely accumulated memory pressure on the phone over an evening of installs,
  and it was never held constant. Anything that reads as a clean A/B in the
  commits from that night was measured against a drifting baseline.
  **Before comparing two builds, reboot the phone, and re-run the previous
  build to re-establish the baseline.** An A/B where B is measured an hour after
  A is not an A/B.
  The one comparison that still looks structurally sound is `expo-image`: two
  crashing builds (5/5 and 5/5) sandwiched between two clean ones (5/5 and
  10/10), which drift alone does not produce easily. Treat even that as strong
  suspicion rather than proof.
- **`SPLASH_MOTION_ENABLED` in `lib/splashFilm.ts` is false and the splash is a
  still.** Three attempts at motion all failed: `expo-video`, `expo-image` with
  an animated WebP, and a twelve-frame sequence through react-native's own
  `Image`. The last of those added no library at all, which is why "allocation
  pressure at launch" looked like the answer, but the revert scoring the same
  9-in-10 removed that comparison's footing. **What is actually known is that
  the splash does not reliably move, not why.**
  The wave frames (`assets/splash/wave/`, 364KB, 12 JPEGs at 640px) and the
  ffmpeg recipe stay in the tree unreferenced, ready for the day this is
  understood. `expo-video` stays banned from the launch path regardless.
- **UNTESTED SUSPECT, and the cheapest one left: `BrandSplash` ITSELF.**
  `components/BrandSplash.tsx` was created 2026-08-16 at 17:02; `expo-video` was
  added at 16:47 the same day; the last production build that ever launched
  clean is `36a3a7a3` at 10:41, six hours before both. **Every experiment on
  2026-08-19 changed what renders INSIDE BrandSplash and none removed the
  component**, so the two arrived as one variable and were never separated. It
  mounts at the ROOT, reads AsyncStorage and sets four timers on every cold
  start. Test it by not mounting it in `app/_layout.tsx`: one line.
  Note the TestFlight build 40 has no `BrandSplash` and no `expo-video` at all;
  what it shows is the NATIVE iOS launch screen (`mascot-wave.png` on
  `#F8FAFC`), which is why it looks flawless. There is no video splash there to
  compare against.
- **`expo-image` MUST NOT be imported anywhere in the mobile app. It crashed
  five cold starts out of five, twice.** This is the one clean bisect result of
  2026-08-19. Three builds, same app, one import apart:
  `d429f289` react-native `Image` + still poster, 5 launches 0 crashes;
  `c56157f0` `expo-image` + animated WebP, 5 launches 5 crashes;
  `0f349d37` `expo-image` + the SAME still poster, 5 launches 5 crashes.
  The film was never the variable. **The `Image` component was**, and the second
  of those builds proves it, since the animation was already switched off.
  `app/(app)/account/index.tsx` had already worked around the same package for
  its avatar; that comment predates this and was the corroboration.
  Guarded by a census in `__tests__/splash-film.test.tsx`. `expo-image-picker`
  is a different package and is fine.
- **No moving image has ever survived the launch path. Both films are off.**
  `expo-video` was removed because `BrandSplash` mounts at `app/_layout.tsx`,
  the ROOT, so it decoded a film on EVERY cold start. Still banned there, now on
  principle rather than as the crash's cause. The splash and the bazaar welcome
  both show their poster through react-native's own `Image`.
  `assets/splash/welcome-bolo.webp` stays on disk **unreferenced**: the encode
  was the fiddly part and the asset was never at fault. The recipe is in
  `lib/splashFilm.ts`, and `img2webp` defaults to LOSSLESS, which makes that
  same film 4.7MB instead of 2.3MB. Neither `.mp4` is required by any code, so
  neither is bundled; both stay on disk as re-encode sources.
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
