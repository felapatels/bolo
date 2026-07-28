---
name: Observability (Sentry + PostHog)
description: How error reporting and product analytics are wired across api-server, web, and mobile, and the PII/scrub rules that must hold.
---

## Rules
- Every init is gated on an env key (`SENTRY_DSN`, `VITE_SENTRY_DSN`/`VITE_POSTHOG_KEY`, `EXPO_PUBLIC_SENTRY_DSN`/`EXPO_PUBLIC_POSTHOG_KEY`). Missing key = silent no-op. Never commit DSNs/keys.
- Event payload policy: NO phrase content, transcripts, audio, or emails. User id + language code + numeric counts only.
- The 7 allowed PostHog events live in one `analyticsEvents.ts` per client app; do not add events elsewhere.
- **Why:** learner speech recordings/transcripts are sensitive; the user made this a hard requirement.

## Lessons
- Sentry Node's default RequestData integration attaches `req.body` to error events — a direct phrase/audio leak. The api-server `beforeSend` deletes `event.request` wholesale; keep that if touching Sentry config.
- Scrub key matching normalizes keys to lowercase alphanumerics (`targetNative` → `targetnative`), so one set entry covers camel/snake/kebab case.
- Installing `@sentry/node` pulled `@opentelemetry/api`, which is an optional peer of drizzle-orm → pnpm created a SECOND drizzle-orm instance and api-server typecheck exploded with "separate declarations of private property shouldInlineParams". Fix: add `@opentelemetry/api` to lib/db deps so both packages resolve the same drizzle variant.
- **How to apply:** any new dep that peers on @opentelemetry/api (or other drizzle optional peers) can re-split drizzle-orm; check `ls node_modules/.pnpm | grep drizzle-orm@` after installs.
- sign_up_completed is detected outside auth screens via Clerk `user.createdAt` within 2 minutes + trackOnce — covers email/Google/Apple without touching auth flow code.
