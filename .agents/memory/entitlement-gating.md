---
name: Entitlement gating (Free/Plus)
description: How server-side tier gating is wired and the constraints it imposes on routes and tests.
---

# Free/Plus entitlement gating

The server is the single authority on tier access. A middleware resolves the
caller's effective plan onto the request; each gated route reads that resolved
plan and, when denied, responds with **HTTP 402** and a consistent JSON body
(`error:"upgrade_required"`, `upgradeRequired:true`, `reason`, `message`,
`feature`, `requiredPlan:"plus"`). `reason` ∈ `language_locked | daily_lesson_limit | feature_locked`.

**Rule:** any authed route that gates MUST run behind the entitlements-loading
middleware, because gate helpers read the resolved plan off the request. A route
mounted without it throws (undefined plan → 500), not a clean 401/402.

**Why:** the gates trust only the server-resolved plan; there is no client-
asserted tier. Skipping the loader leaves the plan unset.

**How to apply — tests:** any test harness that mounts the learning router must
also mount the entitlements loader after its stub-auth middleware. Route-logic
suites that aren't about tiers (e.g. review ordering, attempt recording) should
make their throwaway test user **Plus**, because review/analytics are Plus-only
and non-Hindi languages are locked on Free — otherwise those handlers now 402.

**Free daily new-lesson cap:** counted per-user over the UTC day via a
generation-log table (lessons are cached globally, so a per-user log is the only
way to count real generations). Only real AI generations (cache miss) count;
cache hits are free. The cap gate fires inside the generation path *before* the
AI call, so a capped request 402s without generating.

**Dev override:** a non-production-only endpoint flips the caller (or an explicit
userId) between free/plus/trial by writing the same subscription columns a real
payment webhook would. Hard-disabled (404) in production; kept out of the
OpenAPI spec (hidden dev tool). Real upgrades come from the separate payments work.
