---
name: Pilot capture upload verification
description: WARN-swallowed storage tees can fail 100% silently; verify a real upload round-trip before any capture session.
---

**Rule:** Before any labeled capture session or voice-contribution work, empirically verify ONE real upload lands (PutObject + ListObjects round-trip). Never trust "all storage env vars are set" as evidence the tee works - presence checks do not validate values.

**Why:** The pilot clip tee swallows failures at WARN by design (response path must never break), so misconfigured storage credentials produced zero uploaded clips while the feature looked fully functional end-to-end from the client. Classic value-shape traps for S3-compatible stores: an account-id var holding the full endpoint URL (client then builds a nonsense hostname, DNS ENOTFOUND), or a key of the wrong length/type for the provider (Cloudflare R2 S3 access key ids are 32 chars). Allowlist-gated tees add another silent leg: an allowlist holding only a dev-environment user id means prod attempts never tee at all.

**How to apply:** Request corrected secrets in the exact bare shapes the client constructs URLs from, then verify with a real upload before capturing. When debugging, check each env value's SHAPE (length, scheme prefix) against what the client code concatenates, not just its presence.
