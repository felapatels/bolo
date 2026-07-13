---
name: Expo app ↔ api-server CORS
description: Why the Expo mobile app's browser (web/preview) calls to the shared api-server 401 unless its own dev origin is allowlisted.
---

# Expo (web/preview) → api-server CORS

The Expo app talks to the shared api-server at `$REPLIT_DEV_DOMAIN/api`, but the
Expo dev server itself runs on a **different** origin: `$REPLIT_EXPO_DEV_DOMAIN`
(`*.expo.worf.replit.dev`). When the app runs in a browser (Expo web or the
Replit mobile preview), every `/api/*` call is **cross-origin + credentialed**,
so the browser sends an `OPTIONS` preflight.

**Rule:** the api-server CORS allowlist must include `https://${REPLIT_EXPO_DEV_DOMAIN}`
(guarded by env presence so it's absent in prod), alongside `REPLIT_DEV_DOMAIN`.

**Why:** the `cors` package's origin callback returning `false` does **not**
answer the preflight — it calls `next()`, so the `OPTIONS` falls through to the
router and hits `requireAuth`, which 401s it (preflights carry no auth header).
The browser then blocks the real request and the UI shows a generic load
failure (e.g. "Couldn't load topics"). Symptom in api-server logs: **every**
authed endpoint 401s (`entitlements`, `categories`, ...) while public
`/languages` succeeds — looks like broken auth but it's CORS.

**How to apply:** if a browser-run client on a distinct Replit origin gets
blanket 401s on authed endpoints, check the CORS allowlist first, not the auth
token. Native Expo Go (no browser) doesn't preflight, so it's unaffected —
this only bites the web/preview path.
