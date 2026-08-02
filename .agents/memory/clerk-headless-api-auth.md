---
name: Headless Clerk API auth (no browser)
description: Mint a session JWT for any user via sign_in_tokens + Frontend API native flow; call authed api-server routes with Bearer, no playwright needed.
---

# Headless Clerk auth for API probes

No browser needed to make authed api-server requests as a specific user (dev instance):

1. Backend API: `POST https://api.clerk.com/v1/sign_in_tokens` with `{user_id, expires_in_seconds}` (Bearer CLERK_SECRET_KEY) → ticket.
2. Frontend API domain: base64-decode the `pk_test_...` suffix of VITE_CLERK_PUBLISHABLE_KEY, strip trailing `$`.
3. `POST https://<fapi>/v1/client/sign_ins?_is_native=1` form-encoded `strategy=ticket&ticket=...` → capture the `Authorization` response HEADER (client token) + `response.created_session_id` from the JSON.
4. `POST https://<fapi>/v1/client/sessions/<sid>/tokens?_is_native=1` with that Authorization header → `{jwt}`.
5. Call the api-server with `Authorization: Bearer <jwt>` (requireAuth accepts Bearer; the JWT is short-lived ~60s, mint fresh per probe).

**Why:** the previous browser-based `__clerk_ticket` pattern (playwright at /tmp/pw, wiped on restart) is slow and fragile; this is four curl-able calls.

**How to apply:** any gate probe or QA script that needs a real authed request as a specific user. Works from plain node fetch. Payload gotcha for /openai/pronunciation: targetNative/targetRomanized/targetEnglish are REQUIRED by the zod body even when phraseId is supplied (server overrides them from the catalog).

**RESTRICTION (owner-imposed, binding):** dev-environment, owner-account tool ONLY. Never use against production, never for any non-owner account, and never in any automated or scheduled context. Manual gate probes and QA scripts run by hand in dev, nothing else.
