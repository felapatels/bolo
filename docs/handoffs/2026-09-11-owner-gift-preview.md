# Owner gift preview

Owner requested a completed-stop exception for aakeshp@gmail.com to visually review the real award flow. Daily gift read and claim share the exception. The server verifies the authenticated user’s primary verified Clerk email; the local email is only a lookup hint. No request-supplied email, broad owner role, or client-only eligibility override is accepted.

Normal once-per-local-day ledger uniqueness, gift draw, wallet credit on claim, and subscription multiplier remain intact. No lesson/streak records are created and no gift is claimed on the owner’s behalf. Applies to mobile and web through their existing server gift readers. Remove dailyGiftPreview and its loader call to retire the exception.

API typecheck passed. Deployment and signed-in verification pending. Typecheck only per owner; no suites or native builds.
