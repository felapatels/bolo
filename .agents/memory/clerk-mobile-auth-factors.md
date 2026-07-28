---
name: Clerk mobile auth factor handling
description: One-shot password() status trap, factor selection from Clerk's response, and the no-silent-failure error policy for mobile auth.
---

# Clerk mobile auth (expo "future" hooks API)

**Rule:** never assume a Clerk auth call is error-or-complete. `signIn.password()` is a one-shot call (no separate `attemptFirstFactor` in this SDK path) and can return successfully at a non-complete status. After every auth call, branch on `status`; read `supportedFirstFactors` to discover what the account actually supports (web sign-ups are passwordless, so `email_code` is their only mobile factor).

**Why:** a production sign-in failure was swallowed silently because the code assumed complete-or-throw — no UI change, no Sentry event. The encountered status must be observable, not hidden behind generic copy.

**How to apply:**
- Every auth operation must end in navigation, a user-visible error, or a next factor step — never a silent no-op.
- When a flow stops at a non-complete status, put the status AND offered factor strategies in both the user-visible copy and the Sentry event.
- Expected user-input mistakes (wrong password/code, bad format) display without Sentry; keep that allowlist narrow — operational failures (rate limits, session conflicts) must reach Sentry.
- PII: report factor *strategy strings* only — factor objects carry a masked identifier; never pass emails/passwords/codes to reporting helpers.
- `finalize()` both returns `{ error }` and can throw — handle both.
- SSO: no created session + a resource status = surface + report (with that resource's factor strategies); no resources at all = user dismissed the browser (visible message, no Sentry noise).
- Do not bump the Clerk SDK version as part of auth behavior fixes (accepted constraint).
