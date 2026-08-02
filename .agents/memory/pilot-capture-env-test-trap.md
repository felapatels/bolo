---
name: pilot-capture test vs .replit env
description: api-server pilot-capture test fails whenever PILOT_CAPTURE_USER_IDS is set in the environment
---
The api-server test "unlisted userId -> S3 PutObjectCommand never called" asserts `pilotCaptureUserIds.size === 0`, i.e. that `PILOT_CAPTURE_USER_IDS` is absent at module init. But `.replit` sets that env var workspace-wide, so the canonical api-server suite (and markTaskComplete validation) fails on this test in any session where the var is live.

**Why:** the allowlist Set is populated from the env var at import time; the test was written assuming a clean env.

**How to apply:** if validation fails only on this test and you didn't touch api-server, it's this trap - diagnose, then use an audited skip_validation_reason. Real fix (separate task): have the test clear the Set or the env var in its before() hook.
