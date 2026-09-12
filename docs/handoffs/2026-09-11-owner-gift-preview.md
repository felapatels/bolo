# Owner gift preview

Owner requested a completed-stop exception to review the real gift award flow, then supplied the exact Clerk ID user_3HBsmeNhc3jxT6rCH1WXI4R0Ykv. Daily gift read and claim share an exact comparison against the authenticated server user ID. No client-provided ID/email, broad owner role, or email lookup is accepted. This supersedes the initial email-based implementation.

Normal once-per-local-day ledger uniqueness, gift draw, wallet credit on claim, and subscription multiplier remain intact. No lesson/streak records are created and no gift is claimed on the owner’s behalf. Applies to mobile and web through their existing server gift readers. Remove dailyGiftPreview and its loader call to retire the exception.

Initial API typechecks passed; exact-ID simplification verification and deployment pending. No suites or native builds.
