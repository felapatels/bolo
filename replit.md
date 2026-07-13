# Bolo!

A mobile-friendly web app for learning to speak the languages of India by ear:
the app speaks a word or phrase aloud, the learner repeats it, and the app
transcribes the attempt and gives friendly, kid-ready pronunciation feedback with
a score. Every phrase is shown in native script plus romanized and English.
Each learner has a real email account (Clerk), and progress is tracked per user.
This is the monetization foundation for a multi-language product (payments
deferred; the `users` table carries a `tier` column defaulting to `'free'`).

> Content today is Gujarati; the roadmap (Task #2) expands to the 22 Eighth
> Schedule Indian languages via AI-generated lessons cached per (language, topic).
> The frontend artifact dir is still named `gujarati-coach` for historical
> reasons — the product/brand is **Bolo!**.

## Architecture

Monorepo (pnpm) with path-routed artifacts:

- **`artifacts/gujarati-coach`** — React + Vite frontend (root preview path `/`).
  Routes: public **Landing** at `/` (signed-out) which redirects signed-in users
  to `/app`; Clerk `/sign-in/*` and `/sign-up/*`; and signed-in-guarded `/app`
  (Home dashboard), `/learn/:id` (category detail), `/practice/:id` (practice
  session) and `/progress`. Guards redirect signed-out users to `/`. Uses
  generated API hooks from `@workspace/api-client-react` and the voice recorder
  from `@workspace/integrations-openai-ai-react`.
- **`artifacts/api-server`** — Express 5 API (mounted at `/api`). Routes:
  `health.ts` (`/healthz`, public), `learning.ts` (categories, phrases, attempts,
  progress) and `openai.ts` (TTS, pronunciation evaluation, AI phrase
  generation), `entitlements.ts` (plan snapshot), and `revenuecat.ts` (payment
  webhook — public, shared-secret auth). Everything except `/healthz`,
  `/languages` and `/revenuecat/webhook` is behind `requireAuth`.
- **`lib/db`** — Drizzle schema: `users` (id = Clerk userId text PK, email,
  displayName, `tier` default `'free'`), `categories`, `phrases`, `attempts`
  (`attempts.userId` text FK → `users.id`). Seed data in `lib/db/src/seed.ts`
  (categories + hand-authored Gujarati phrases; no user seeding).
- **`lib/api-spec`** — OpenAPI spec; `pnpm --filter @workspace/api-spec run codegen`
  regenerates the typed client (`lib/api-client-react`) and zod (`lib/api-zod`).
- **`lib/integrations-openai-ai-server` / `-react`** — Replit-managed OpenAI
  integration (no user API key). Server audio helpers: `textToSpeech`,
  `speechToText`, `ensureCompatibleFormat`.

## Authentication

- **Replit-managed Clerk.** Frontend and API share the same domain, so Clerk
  session **cookies** flow automatically — web calls use relative `/api/...` and
  need NO `getToken`/Bearer handling.
- Identity is derived **server-side**: `requireAuth` reads the Clerk session,
  sets `req.userId`, and JIT-provisions a local `users` row
  (`onConflictDoNothing`) so `attempts` can FK to it. The client never sends a
  user/profile id — this closed the prior cross-user leak from a client-supplied
  `profileId` query param. All attempt-derived stats are scoped by `req.userId`.
- Frontend Clerk setup lives in `src/App.tsx` (ClerkProvider with host-derived
  publishable key, proxy URL, branded `appearance`/`localization`, and wouter
  `routerPush/Replace` with base-path stripping). A dev `pk_test` key and the
  "development keys" console warning are EXPECTED — do not "fix" them.

## Audio flow

- TTS: `POST /api/openai/tts` returns base64 MP3; frontend plays via
  `new Audio("data:audio/mp3;base64,...")`.
- Pronunciation: frontend records with `useVoiceRecorder`, sends base64 audio to
  `POST /api/openai/pronunciation`, which transcribes (gpt-4o-mini-transcribe)
  and scores with an LLM. Attempts are persisted via `POST /api/attempts`.
- All audio endpoints are plain JSON (base64 in/out) so codegen produces full
  typed hooks. Express body limit raised to 25mb for audio payloads.

## Notes / decisions

- **Verbal feedback**: after each practice attempt the coach speaks a random
  English cheer (chosen by score band) via the TTS endpoint, played on a
  separate audio ref with a cancelled-guard so it doesn't bleed across phrases.
- `/api/openai/*` endpoints have a lightweight in-memory rate limiter to cap
  OpenAI cost abuse.
- Mastery = a phrase with a best attempt score >= 80. Streak = consecutive UTC
  days with at least one attempt (anchors on today or yesterday).
- AI-generated bonus phrases are not stored in `phrases`; their attempts are
  recorded with `phraseId = null` plus a text snapshot of the phrase.

## Payments / entitlements (RevenueCat)

- **Server is authoritative.** RevenueCat — never the client — decides who is
  Plus. Billing state lands on the `users` subscription columns
  (`tier`/`subscriptionStatus`/`trialEndsAt`/`currentPeriodEnd`, plus provider
  bookkeeping) which the entitlement backbone already reads.
- **Two sync paths, one apply helper** (`lib/revenuecat*` in api-server):
  - **Webhook (push):** `POST /api/revenuecat/webhook` (public, before
    `requireAuth`) authenticates with a shared secret in the `Authorization`
    header (constant-time compare vs `REVENUECAT_WEBHOOK_AUTH`; fails closed if
    unset). It derives plan state directly from the event payload — no SDK call.
  - **Reconcile-on-read (pull):** `GET /api/entitlements` pulls the live
    subscriber via the RevenueCat connector proxy and heals stored state, so a
    missed webhook never strands a user. Best-effort, throttled ~5 min/user, and
    a **no-op until `REVENUECAT_PROJECT_ID` is set** (keeps dev/tests offline).
- **Config/secrets:** `REVENUECAT_ENTITLEMENT_ID` (default `plus`),
  `REVENUECAT_WEBHOOK_AUTH` (secret; also set verbatim as the webhook auth header
  in the RevenueCat dashboard), `REVENUECAT_PROJECT_ID`, and the client public
  keys (`EXPO_PUBLIC_REVENUECAT_*`) — all emitted by the seed script.
- **Setup:** connect the RevenueCat integration (connector, OAuth), then run
  `pnpm --filter @workspace/scripts exec tsx src/seedRevenueCat.ts` to create the
  Plus entitlement + monthly/annual products + `default` offering and print the
  keys to wire up. Store-side products (App Store Connect / Google Play / Stripe)
  and the 7-day trial + sandbox purchase verification are done in those consoles.
- Integration uses the `@replit/connectors-sdk` **proxy** pattern
  (`connectors.proxy("revenuecat", "/v1/...")`), not a typed RevenueCat SDK.

## Running

Workflows (auto-created per artifact):
- `artifacts/api-server: API Server`
- `artifacts/gujarati-coach: web`

Seed the DB (idempotent): run `tsx lib/db/src/seed.ts` (tsx bin lives under
`node_modules/.pnpm/node_modules/.bin/tsx`).

## User preferences

- (none recorded yet)
