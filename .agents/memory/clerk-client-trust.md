---
name: Clerk Client Trust operations
description: Client Trust toggle is dashboard-only; no Backend API surface; how to exercise the real flow once enabled.
---

**Rule:** Clerk Client Trust cannot be enabled/disabled via the Backend API. `PATCH /v1/instance` has no trust setting (verified against the 2026-05-12 BAPI spec and by probing the dev instance); the only API surface is a per-user `bypass_client_trust` flag (skips the check for that user). Enabling it is a manual dashboard step, per instance (dev and prod toggle independently).

**Why:** Build 26's sign-in errored on `needs_client_trust`, so the owner disabled Client Trust in the dashboard; build 27 handles the second-factor email-code flow (`signIn.mfa.sendEmailCode/verifyEmailCode`, NOT the first-factor `signIn.emailCode.*`). Pre-ship real-flow verification was impossible without the dashboard click, so it lives on the build-27 device-matrix checklist in CODEBASE-FACTS §8.

**How to apply:** With the feature off, `needs_client_trust` never fires and FAPI rejects the second-factor prepare/attempt calls — mocked tests are the only pre-enable coverage. Once the DEV toggle is on, the real flow is exercisable programmatically: a fresh Clerk client counts as a new device, and dev test-mode `+clerk_test` emails verify with the fixed code 424242.

**Verified end-to-end July 30, 2026 (dev toggle ON), via `qa/client-trust-probe.mjs`:** FAPI mapping — password `attempt_first_factor` → `status: needs_client_trust` + `supported_second_factors: ["email_code"]`; `signIn.mfa.sendEmailCode()` = `POST .../prepare_second_factor {strategy: email_code}`; `signIn.mfa.verifyEmailCode({code})` = `POST .../attempt_second_factor` → `complete` + `created_session_id`. Test code 424242 works. Per-user bypass: `PATCH /v1/users/{id} {"bypass_client_trust": true}` returns 200 and exempts that user (used to keep browser QA harnesses deterministic with the toggle on).
