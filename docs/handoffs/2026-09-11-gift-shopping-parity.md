# Daily gift shopping parity — 2026-09-11

Owner requested a Go Shopping button on LATAM's gift and consistent placement and behavior across BOLO. Shared ledger inspected before work.

Mobile and web now offer a full-width Go Shopping footer in every gift state, for Free and All-Access learners. It opens the regional shop at the existing /bazaar route and never invokes the gift claim. Existing claim/earned gates, wallet reads, locked instructions and region currency copy remain unchanged. Existing currency/upgrade actions remain separate.

Home placement: below stats, above the Journey frame. Europe's mobile card moved outside the frame to match its web counterpart and the fleet.

Mobile and web typechecks passed across all six. No suites run. LATAM simulator visually confirmed the locked card, zero wallet, and navigation from Go Shopping to Mercadito without a claim or purchase. Other forks received source/typecheck verification, not runtime claim cycles. Existing gate assertions updated where they prohibited a Free learner's shop link; not executed.

Local only; not pushed or published. Other pending work preserved.
