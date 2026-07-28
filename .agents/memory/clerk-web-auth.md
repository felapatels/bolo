---
name: Clerk web auth (same-domain monorepo)
description: How Clerk auth is wired for a web artifact + API that share one domain, and what NOT to "fix".
---

> Update (July 28, 2026): the project moved OFF Replit-managed Clerk to a self-managed instance (`free-bedbug-6.clerk.accounts.dev`); secrets hold that instance's keys and config lives at dashboard.clerk.com (the Auth pane no longer governs the active instance, but the old managed tenant may still exist there until deleted). Headless E2E: `?__clerk_ticket=` in the URL is NOT consumed by this app's landing page — use `Clerk.client.signIn.create({strategy:'ticket', ticket})` + `setActive` via CDP. Server-minted session tokens work as Bearer for the mobile path (60s expiry — mint and use immediately; hit the dev domain, not localhost).

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
