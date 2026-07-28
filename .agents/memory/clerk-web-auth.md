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

## Production instance (clerk.bolo-india.app) — live July 2026
- Production Clerk runs on CNAME custom domain `clerk.bolo-india.app` (DNS verified, Apple+Google SSO custom creds). CNAME and Clerk proxy are mutually exclusive — no client may set a proxyUrl in production; `clerkProxyMiddleware` stays mounted but dormant.
- pk_live is deterministic: `pk_live_` + base64(`clerk.<domain>$`) → `pk_live_Y2xlcmsuYm9sby1pbmRpYS5hcHAk`. Never need the user to paste a publishable key.
- **Trap:** `publishableKeyFromHost(host, fallback)` returns the fallback whenever it is a DEV key — so production env MUST carry live keys or prod silently runs against free-bedbug-6. Live pk set in Replit production env vars (CLERK_PUBLISHABLE_KEY, VITE_CLERK_PUBLISHABLE_KEY) and EAS production env; sk_live is owner-set in the Publishing tool's deployment secrets.
- Workspace secrets keep the pk_test/sk_test dev keys; workspace secrets do NOT auto-sync to the production deployment, which is what keeps dev/prod instances separate.

## Production bake trap (July 28, 2026) — RESOLVED client-side
- The Replit deployment's Vite build bakes WORKSPACE secrets into `VITE_*` values; production env vars (which held pk_live) never reached the build, so the published bundle carried pk_test and `publishableKeyFromHost`'s dev-fallback short-circuit served free-bedbug-6 on bolo-india.app.
- Fix: App.tsx now derives pk_live from `window.location.hostname` at runtime when the host is bolo-india.app or www.bolo-india.app (no fallback passed); every other host keeps the baked dev key. replit.app default domain intentionally stays on the dev instance.
- General rule: NEVER rely on production env vars for any build-time `VITE_*` value in this repl; either derive at runtime or commit public write-only values gated on `import.meta.env.PROD` (done for the web Sentry DSN and PostHog key).

## Stale dev-cookie poisoning after the prod key fix (July 28, 2026)
- Symptom set: OAuth ends at clerk.<domain>/v1/oauth_callback?err_code=authorization_invalid, email sign-up silently creates no user, instance shows "watching for users" — while curl/clean browsers work end to end.
- Mechanism: browsers that visited the prod domain during the dev-keyed window carry dev-instance JS cookies on the apex (__client, __client_uat*, __clerk_db_jwt*); they ride to clerk.<domain> and the FAPI resolves the wrong client, so the OAuth state never matches.
- Diagnosis order that worked: bundle greps (proxy/dev refs) -> FAPI /v1/environment -> raw curl sign-up (fails ONLY captcha_missing_token = healthy) -> oauth_callback with mismatched cookie reproduces authorization_invalid exactly.
- Remedy: one-time versioned cookie purge on the prod host before Clerk init (src/lib/clerkCookieCleanup.ts); MUST no-op when localStorage is unavailable or it signs users out on every load. Remove after the affected window ages out.
- Turnstile note: captcha_oauth_bypass=[] on this instance; headless probes always stall at interactive Turnstile — not evidence of breakage.
