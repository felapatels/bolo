# Daily gift parity — 2026-09-11

Owner requested completed fleet changes be pushed first, then daily gifts work as in SEA on mobile and web.

The prior ordered-stop purchases and web parity changes were pushed to all six main branches. Owner subsequently authorized pushing all pending changes. Delivery commit IDs are recorded in the shared ledger; publication remains with the owner.

- The gift stays visible while locked, with the instruction to finish a stop.
- Opening requires both the earned-day gate and claimable state. Existing server completed-stop rules remain authoritative.
- Pending/failed claims do not open the gift or award a displayed balance. Errors give retry feedback and refresh server state.
- Home refreshes the wallet and gift on return from a stop on mobile and web.
- India, Africa, East Asia and Europe no longer silently grant the gift in the attempts route. SEA and LATAM already used claim-only payment. Older installations without a gift UI need the updated client to claim; retained capability wire fields are inert, not removed.
- Existing currency names, reward draws/multipliers, ledger reasons/ref IDs, stored balances and once-per-day idempotency remain intact. Stat bars read actual wallet balances, not pending gift amounts.
- Africa now has SEA's card on both home screens, with Cowries copy, existing shop/wallet links and optional meter fields handled without inventing amounts. Added the existing daily-gift workspace dependency and lockfile entries.
- India no longer interprets an in-flight request as claimed.
- SEA/Africa/East/LATAM local reveal receipts are scoped to the server's local day, so an earlier day's reveal cannot hold a new box open.
- LATAM's claim now returns the complete already-declared DailyGiftClaimResult instead of only amount/balance/granted. East's claim includes its already-declared wallet meter fields. No API spec or generated contract changes were needed.

Validation: mobile, web and API typechecks passed in all six repositories. Africa's checks included its daily-gift library reference. No tests/suites, builds, live currency purchases, database changes or publication performed. Existing India/East request regression definitions were updated for claim-only awards but not executed. Runtime visual/claim checks against a published updated backend remain for iteration.

Pre-existing India app.json and Africa/East/LATAM consent edits were preserved and excluded from the earlier commits.

Delivery scope: the owner’s latest request includes the previously pending consent-screen updates in Africa/East/LATAM and India’s iOS build-number bump to 546. These were excluded only from the earlier ordered-stop commits. Generated local package caches are excluded.
