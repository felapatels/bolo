# Threat Model

## Project Overview

Bolo! is a monorepo (pnpm) mobile-friendly web app that teaches spoken Indian
languages (currently Gujarati). A React + Vite frontend
(`artifacts/gujarati-coach`) talks to an Express 5 API
(`artifacts/api-server`, mounted at `/api`). Users authenticate via
Replit-managed Clerk (session cookies, same-domain). The API calls OpenAI
(Replit-managed integration) for text-to-speech, speech-to-text, and
LLM-based pronunciation scoring / phrase generation. Data is stored in
Postgres via Drizzle (`lib/db`): `users`, `categories`, `phrases`,
`attempts`. Deployed publicly on Replit Autoscale
(`https://bolo-aakeshp1.replit.app`).

## Assets

- **User identity / session** -- Clerk-issued session cookie; compromise
  allows impersonation.
- **Learner progress data** -- `attempts` rows (transcript, score, feedback,
  timestamps) drive mastery, streaks, XP; feeds the future monetization
  `tier` column.
- **OpenAI usage/cost budget** -- server-side credentials used by
  `/api/openai/*`; abuse costs the project owner money.
- **Application secrets** -- `CLERK_SECRET_KEY`, DB connection string,
  OpenAI credentials (Replit-managed, not in source).

## Trust Boundaries

- **Browser <-> API (`/api/*`)** -- untrusted client; all routes except
  `/api/healthz` require `requireAuth` (Clerk session verification).
- **API <-> Postgres** -- Drizzle ORM with parameterized queries; queries in
  `learning.ts` are consistently scoped by `req.userId` derived server-side.
- **API <-> OpenAI** -- server-side call with Replit-managed credentials;
  rate-limited per the in-memory limiter in `routes/openai.ts`.
- **Public / Authenticated boundary** -- `/`, `/sign-in`, `/sign-up`,
  `/healthz` are public; `/app`, `/learn/:id`, `/practice/:id`, `/progress`
  and all non-health `/api/*` routes require a signed-in Clerk session,
  enforced both client-side (`Guard` in `App.tsx`) and, more importantly,
  server-side (`requireAuth`).

## Scan Anchors

- Production entry points: `artifacts/api-server/src/app.ts` (Express app,
  CORS, body limits, Clerk middleware), `artifacts/api-server/src/routes/*`.
- Highest-risk code: `routes/openai.ts` (cost-bearing AI calls, custom rate
  limiter keyed on `req.ip`), `routes/learning.ts` (`/attempts` write path
  trusts client-supplied score/feedback/transcript rather than deriving them
  from the server-computed pronunciation evaluation).
- Auth: `middlewares/requireAuth.ts` (Clerk session -> `req.userId`, JIT user
  provisioning); identity is never taken from client input (this closed a
  prior cross-user `profileId` leak — see existing vulnerability history).
- Dev-only, ignore for production reachability: `artifacts/mockup-sandbox`
  (canvas prototyping sandbox, `/__mockup` preview path, not part of the
  deployed app).
- Deployment is public/autoscale, so all `/api/*` endpoints are
  internet-reachable once authenticated (or unauthenticated for `/healthz`).

## Threat Categories

### Spoofing

Identity is derived server-side from the verified Clerk session
(`getAuth(req)`), never from client-supplied IDs. This is sound. Clerk
session cookies are shared via same-domain proxying (`clerkProxyMiddleware`).

### Tampering

`POST /api/attempts` accepts and persists client-supplied `score`, `passed`,
`feedback`, and `transcript` fields directly (validated only for shape/range
by zod, not for correctness), without cross-checking them against the
server's own `/api/openai/pronunciation` evaluation for that submission. A
user can fabricate arbitrary high scores, mastery, streaks, and XP for their
own account. Because progress badges/streak/XP feed the stated monetization
roadmap (`tier` column), this is a real (if user-self-scoped) integrity gap
that MUST be addressed before progress data is used for anything
consequential (leaderboards, unlocks, billing).

### Denial of Service

`/api/openai/*` (cost-bearing OpenAI calls) uses an in-memory rate limiter
keyed on `req.ip`. Express does not enable `trust proxy`, so behind the
Replit Autoscale reverse proxy `req.ip` likely resolves to the proxy's
address for every request, collapsing all users into a single shared rate
limit bucket. Any single authenticated user issuing rapid requests can
exhaust the shared quota and deny the AI features to all other users MUST be
addressed by keying on a verified per-request identity (`req.userId`) and/or
correctly configuring `trust proxy`.

### Information Disclosure

CORS is configured as `cors({ credentials: true, origin: true })` in
`app.ts`, which reflects the requesting `Origin` back in
`Access-Control-Allow-Origin` and sets
`Access-Control-Allow-Credentials: true` for every origin. This allows any
third-party website to issue credentialed (cookie-bearing) cross-origin
requests to `/api/*` and read the JSON responses in JavaScript, if the
browser attaches the Clerk session cookie cross-site. This removes an
important defense-in-depth layer against cross-origin data theft / CSRF and
MUST be tightened to an explicit allowlist of trusted origins.

### Elevation of Privilege

No admin roles exist yet. All per-user data access in `learning.ts` is
correctly scoped by `req.userId`; no IDOR was found in the reviewed routes.
