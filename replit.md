# Gujarati Coach

A mobile-friendly web app that helps the family's kids learn Gujarati by ear:
the app speaks a Gujarati word or phrase aloud, the child repeats it, and the app
transcribes the attempt and gives friendly pronunciation feedback with a score.
Every phrase is shown in both Gujarati script and romanized English plus the
English meaning. Multiple kids each have their own profile, so progress is
tracked per child.

## Architecture

Monorepo (pnpm) with path-routed artifacts:

- **`artifacts/gujarati-coach`** — React + Vite frontend (root preview path `/`).
  Pages: a "Who's practicing?" profile picker (shown until a kid is selected),
  Home dashboard, category detail (`/learn/:id`), core practice session
  (`/practice/:id`), and progress (`/progress`). Uses generated API hooks from
  `@workspace/api-client-react` and the voice recorder from
  `@workspace/integrations-openai-ai-react`. The active kid is held in a
  `ProfileProvider` (`src/lib/profile.tsx`) and persisted in localStorage.
- **`artifacts/api-server`** — Express 5 API (mounted at `/api`). Routes:
  `profiles.ts` (list/create profiles, verify PIN), `learning.ts` (categories,
  phrases, attempts, progress) and `openai.ts` (TTS, pronunciation evaluation,
  AI phrase generation).
- **`lib/db`** — Drizzle schema: `profiles`, `categories`, `phrases`, `attempts`
  (`attempts.profileId` FK → `profiles.id`). Seed data in `lib/db/src/seed.ts`
  (6 kid profiles + hand-authored Gujarati across 6 categories).
- **`lib/api-spec`** — OpenAPI spec; `pnpm --filter @workspace/api-spec run codegen`
  regenerates the typed client (`lib/api-client-react`) and zod (`lib/api-zod`).
- **`lib/integrations-openai-ai-server` / `-react`** — Replit-managed OpenAI
  integration (no user API key). Server audio helpers: `textToSpeech`,
  `speechToText`, `ensureCompatibleFormat`.

## Audio flow

- TTS: `POST /api/openai/tts` returns base64 MP3; frontend plays via
  `new Audio("data:audio/mp3;base64,...")`.
- Pronunciation: frontend records with `useVoiceRecorder`, sends base64 audio to
  `POST /api/openai/pronunciation`, which transcribes (gpt-4o-mini-transcribe)
  and scores with an LLM (gpt-5.4-mini). Attempts are persisted via
  `POST /api/attempts`.
- All audio endpoints are plain JSON (base64 in/out) so codegen produces full
  typed hooks. Express body limit raised to 25mb for audio payloads.

## Notes / decisions

- Single-family app — lightweight **profiles**, not real auth. The selected kid
  is passed to the API as `profileId` (query param on GETs, body field on POST
  attempts). All attempt-derived stats are scoped by `profileId`; endpoints
  return empty stats (never all kids' data) when no valid `profileId` is given.
- PINs are optional per profile, stored hashed as `salt:hash` (node:crypto
  scrypt, timing-safe compare). The API only ever exposes a `hasPin` boolean.
  `verify-pin` has a small in-memory per-profile throttle against brute force.
- **Verbal feedback**: after each practice attempt the coach speaks a random
  English cheer (chosen by score band) via the TTS endpoint, played on a
  separate audio ref with a cancelled-guard so it doesn't bleed across phrases.
- `/api/openai/*` endpoints have a lightweight in-memory rate limiter to cap
  OpenAI cost abuse once published (single learner, so no login needed).
- Mastery = a phrase with a best attempt score >= 80. Streak = consecutive UTC
  days with at least one attempt (anchors on today or yesterday).
- AI-generated bonus phrases are not stored in `phrases`; their attempts are
  recorded with `phraseId = null` plus a text snapshot of the phrase.

## Running

Workflows (auto-created per artifact):
- `artifacts/api-server: API Server`
- `artifacts/gujarati-coach: web`

Seed the DB (idempotent): run `tsx lib/db/src/seed.ts` (tsx bin lives under
`node_modules/.pnpm/node_modules/.bin/tsx`).

## User preferences

- (none recorded yet)
