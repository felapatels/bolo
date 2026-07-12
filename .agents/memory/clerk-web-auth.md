---
name: Clerk web auth (same-domain monorepo)
description: How Clerk auth is wired for a web artifact + API that share one domain, and what NOT to "fix".
---

# Clerk web auth in this monorepo

The web artifact and the API server are served on the **same domain** (web at
`/`, API at `/api`). Because of that:

- Clerk session **cookies** flow automatically on relative `/api/...` calls.
  Web code must NOT add `getToken`/Bearer/`setAuthTokenGetter` — that pattern is
  only for cross-origin/mobile clients. Adding it on web is wrong and redundant.
- Identity is derived **server-side**: the auth middleware reads the Clerk
  session and sets `req.userId`; JIT-provisions a local `users` row so
  ownership FKs resolve. The client never sends a user/profile id. Any endpoint
  that scopes data by a client-supplied id is a cross-user leak — scope by the
  server-derived id instead.

**Why:** an earlier version passed a `profileId` query param from the client,
which let any client read/write any user's data. Server-derived identity closes
that whole class of bug.

**How to apply:** when adding a new authed endpoint, put it behind the auth
middleware (only `/healthz` is public) and use `req.userId` for all reads/writes.
On the web client, just call the relative API — no token plumbing.

## Expected dev noise — do NOT "fix"
- A `pk_test_...` publishable key in development is correct.
- The browser console warning "Clerk has been loaded with development keys" is
  expected in dev. It resolves itself in production; it is not a bug.

## Automated e2e limitation
- Clerk dev sign-up is gated by a Cloudflare "verify you are human" challenge, so
  a Playwright tester generally CANNOT complete sign-up end-to-end. Verify the
  auth *gating* (public landing, protected routes redirect when signed out,
  branded sign-in/up renders) rather than a full automated sign-up.
