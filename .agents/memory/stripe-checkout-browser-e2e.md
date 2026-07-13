---
name: Real-browser Stripe checkout E2E
description: Durable gotchas for real-browser QA of the gujarati-coach Plus checkout journey. Reproducible runbook lives in the committed qa/ artifact.
---

# Real-browser QA of the Plus checkout journey — durable gotchas

The full reproducible runbook (setup, script, expected results) is committed at
`qa/plus-checkout-verification.md` + `qa/plus-checkout-e2e.mjs`. Only the
non-obvious, cross-session lessons are here:

- **No testing subagent here.** `subagent({ config: { $kind: "testing" } })`
  throws "Unknown config kind: testing"; only `general`/`explore` exist. Drive
  Playwright yourself.
- **Bundled Chromium won't launch** (missing `libglib-2.0.so.0` on NixOS). Use
  `installSystemDependencies(["chromium"])` and pass that binary as Playwright's
  `executablePath` with `--no-sandbox`. It writes an untracked `replit.nix` —
  delete it after verification-only work.
- **Sign in without the UI** (Cloudflare blocks Clerk dev sign-in): mint a Clerk
  sign-in token and open `/sign-in?__clerk_ticket=<token>`; the `<SignIn>`
  component auto-consumes it. Single-use.
- **Stripe hosted-checkout card fields** render in the top document but only after
  selecting the Card method, whose radio is visually hidden — force-click it, then
  `#cardNumber/#cardExpiry/#cardCvc` are fillable. The "Save my information"
  (Link) checkbox `#enableStripePass` makes the phone field required and can
  trigger SMS verification — uncheck it or the trial button silently won't submit.
- **Expected, not a bug:** Free users on `/upgrade` produce benign `402` console
  entries from Plus-gated endpoints being probed.
- **Dev Stripe webhook endpoint drifts from the dev domain.** The dev TEST
  endpoint's URL hard-codes a stale dev-domain suffix, so when `REPLIT_DEV_DOMAIN`
  changes, subscription webhooks never reach the server and the DB→Plus flip
  silently fails in dev only. Repoint it to the current domain to test, then
  restore. Prod uses its own endpoint and is unaffected.
