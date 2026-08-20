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

- ~~The launch crash.~~ **Fixed 2026-08-20: `react-native-worklets` 0.5.1 to
  0.8.3.** `EXC_BAD_ACCESS` on `com.facebook.react.runtime.JavaScript` inside
  HadesGC evacuation, 200ms to 600ms after launch, presenting as either
  `KERN_INVALID_ADDRESS at 0x2000` in `CardTable::updateBoundaries` or
  `EXC_ARM_DA_ALIGN` in `BaseVisitor::visitArray`. Reanimated runs a second
  Hermes runtime through worklets; the upstream tracker carries live issues of
  this exact shape on iOS with the New Architecture.
  **We were on the FLOOR of the supported range.** Expo SDK 54 pins worklets
  0.5.1 and reanimated 4.1.7 accepts 0.5 through 0.8, so three minor versions of
  fixes sat above us with nothing flagging it. `pnpm run typecheck` and every
  suite passed the whole time. **When a native crash has no JS frames, check
  whether an Expo-pinned native module is behind its own peer range.**
- **THE METHOD THAT FOUND IT, after three wrong calls in one day. Reuse it.**
  1. **Read the device, never Sentry.** Sentry silently stopped delivering these
     at 16:28 on 2026-08-19 while the phone kept writing them, and reading that
     silence as success is how the crash was declared fixed three times.
     Settings > Privacy & Security > Analytics & Improvements > Analytics Data,
     entries named `BoloMobile-<date>`. **Check the timestamp against the build
     time before believing it**, twice a stale report was read as fresh.
  2. **Give every build its own number.** Twelve builds on 2026-08-19 all shipped
     as `1.0.0 (40)`, so no result could be tied to a bundle. `autoIncrement` is
     on for the preview profile now. Confirm the number in Settings before
     counting anything.
  3. **Ten launches, never five.** At one in six, five clean happens by luck 40%
     of the time. Every wrong call came from a 5-of-5 sample.
  4. **One variable per build, and re-run the baseline in the same session.**
  5. **Name the confound before celebrating.** Build 44 passed 10/10 with TWO
     changes in it, the version bump and the owner having let the install sit a
     few minutes. Re-testing 43 with the same wait is what turned a guess into a
     result.
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
