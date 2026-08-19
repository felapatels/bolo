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

- **`REVENUECAT_API_KEY` on the server is rejected.** Every `/entitlements` call
  logs `RevenueCat subscriber fetch non-OK, status 401`. Subscription state
  cannot be read from RevenueCat at all; entitlements are being served from the
  local mirror alone. Compare the Replit secret against the `replit-server`
  secret key in RevenueCat. Found 2026-08-19, not yet fixed.
- The API logger is plain pino with **no Sentry transport**, so `logger.error`
  reaches stdout and nothing else. A money-losing error is invisible unless
  somebody opens Replit's deployment logs. This is why the Chai pack failure
  below went unnoticed for as long as it did.
- `playCue` is wired at 22 call sites on both platforms; the audio files were never
  authored. Both no-op by design.
- Mobile splash has no tests; nothing renders `app/_layout.tsx` or
  `(tabs)/index.tsx`. (Bazaar welcome now has tests on both platforms.)
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
