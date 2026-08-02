---
name: Pilot capture upload verification
description: WARN-swallowed storage tees can fail 100% silently; verify a real upload round-trip before any capture session.
---

**Rule:** Before any labeled capture session or voice-contribution work, empirically verify ONE real upload lands (PutObject + ListObjects round-trip). Never trust "all storage env vars are set" as evidence the tee works - presence checks do not validate values.

**Why:** The pilot clip tee swallows failures at WARN by design (response path must never break), so misconfigured storage credentials produced zero uploaded clips while the feature looked fully functional end-to-end from the client. Classic value-shape traps for S3-compatible stores: an account-id var holding the full endpoint URL (client then builds a nonsense hostname, DNS ENOTFOUND), or a key of the wrong length/type for the provider (Cloudflare R2 S3 access key ids are 32 chars). Allowlist-gated tees add another silent leg: an allowlist holding only a dev-environment user id means prod attempts never tee at all.

**How to apply:** Request corrected secrets in the exact bare shapes the client constructs URLs from, then verify with a real upload before capturing. When debugging, check each env value's SHAPE (length, scheme prefix) against what the client code concatenates, not just its presence.

**Proof pattern:** drive the real tee function directly (add a probe user to the exported allowlist set, pass a synthetic buffer), capture the clip key from the success log, GET both objects back, then delete. Verifies key scheme + sidecar shape + credentials in one pass without touching the eval route.

**Probe-size trap (checksum):** a tiny synthetic-buffer probe can pass while every real-sized clip fails. AWS SDK v3 (≥3.300) auto-injects a CRC32 trailing checksum on PutObject for binary bodies above an internal size threshold; Cloudflare R2 rejects it with InvalidArgument (400). Fix: `requestChecksumCalculation: "WHEN_REQUIRED"` on the S3Client. So the proof upload must use a realistic-size binary Buffer (tens of KB), not a short string — otherwise the probe validates credentials but not the request shape R2 actually sees.
