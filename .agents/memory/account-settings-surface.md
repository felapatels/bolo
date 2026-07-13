---
name: Account settings surface (web/mobile)
description: How the /account backend, identity mirror, and theme wiring fit together for the settings screens.
---

# Account settings surface

The `/account` routes (GET/DELETE `/account`, PATCH `/account/profile`, POST
`/account/email`, POST `/account/password`, PATCH `/account/preferences`, plus
`/account/subscription*`) live in the api-server and are mounted, but were **not**
in `lib/api-spec/openapi.yaml` — so the generated client (`@workspace/api-client-react`)
had no hooks for them. Consuming a backend route always means adding it to the
OpenAPI spec first and running `pnpm --filter @workspace/api-spec run codegen`.

**Why:** the codebase is spec-first — every typed hook comes from orval over
`openapi.yaml`. Backend routes existing ≠ client hooks existing.

## Identity mirror is backfill-only — edit through the backend, not Clerk-only

`ensureLocalUser` (requireAuth) backfills the local `users.displayName`/`email`
from Clerk **only when those columns are NULL**. So if identity is changed via a
Clerk-only client flow (e.g. `openUserProfile()`), the local mirror does NOT
update, and friends/leaderboard keep showing the stale name/email.

**How to apply:** route display-name and email changes through PATCH
`/account/profile` / POST `/account/email` (they write Clerk *and* the mirror).
Reserve Clerk's own flow for password + email *verification* UX. The web
settings screen uses the backend for name/avatar and `openUserProfile()` for
email/password (verification handled by Clerk) — accept that a Clerk-modal email
change won't propagate to the mirror until a column goes null.

## Theme / dark mode

`artifacts/gujarati-coach/src/index.css` already ships a full `.dark` variable
block and `@custom-variant dark (&:is(.dark *))`. Making theme "take effect" is
just toggling the `.dark` class on `<html>`. `src/lib/theme-context.tsx` does
this: localStorage cache for instant paint + no flash, hydrates from
`GET /account` preferences (cross-device), `system` follows `matchMedia`.
