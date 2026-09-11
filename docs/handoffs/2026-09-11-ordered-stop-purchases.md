# Ordered journey-stop purchases — 2026-09-11

Owner requested the SEA access policy across all six apps, on mobile and web.
Later clarified: any Zone 1 stop is free, all later stop types can be bought,
and purchases must follow stop order. This also approved `letter` in the
existing journey-stop API kind enum. No new endpoint or response-field names.

## Behavior

- Journey 1 Zone 1 remains free in every language on the Free plan, including
  full story/tracing stops. Normal lesson progression remains. Existing legacy
  One-Language subscription policy is not redesigned in this change.
- Zones 2–6 and their stop cards show the existing brass All-Access badge on
  mobile and web, including already owned/subscribed stops.
- The upgrade/paywall screen offers a permanent purchase using Chai, the
  existing regional wallet to buy more, and the existing subscription choices.
  Price remains the server's STOP_UNLOCK_COST (100); currency/store products
  and voices are preserved. No client invents a price or grants a balance.
- Individual purchases follow the visible journey order per language. The
  earliest unowned paid stop is purchasable; prior free stops need no purchase.
  Ownership is sufficient to buy the next stop; lesson completion is not an
  additional purchase prerequisite. Previously owned stops remain owned.
- Backend enforces order on BOTH `/tokens/journey-stops/unlock` and legacy
  `/tokens/unlock-stop`; out-of-order requests return 409 previous_stop_required
  before a debit. Atomic wallet locking and same-stop ownership rechecks remain.
- Stop-order modules share identical logic across API/mobile/web, using the
  existing story/tracing/letter insertion functions and phrase-before-sentence
  order. Clients load existing category/group queries, show why a later stop
  cannot be bought yet, and link to the next purchasable stop.
- Existing lesson ledger refs are retained; other refs include kind, language,
  journey and zone. No database schema migration. Slugs resolve category IDs;
  neither purchases nor navigation assume Journey 2 categories are IDs 7–12.
- Owned lesson content, scoring, attempts and earned-day computation respect
  ownership. Owned story/tracing content opens in full. Nest counts stop
  purchases and supports the existing drill-down.
- Web currency checkout return includes an expiring link back to the selected
  stop. A checkout return itself does not buy a stop or claim currency arrived.

India additionally wires its authored letter-listening stops through the new
kind, purchase panel, both journey maps, both letter screens and the server's
letter-completion gate. Other forks accept the shared enum but reject purchases
of letter stops they do not author. This does not introduce India content there.

India chat **92932140** was pushed before the fleet access work. The web chat
already handled noSpeech and used in-flow layout; this follow-up prevents its
mascot/status and fact card from shrinking while the transcript fills the page.
The server echo filter already covers both web and mobile.

## Source, validation and delivery

Shared ledger reviewed first. Surgical port from SEA 854933e2, whose combined
commit also contains SEA-only art/video/chat work: wholesale cherry-picking it
would move regional assets. Contract names previously owner-approved, with
letter-kind and ordered-purchase clarification approved in this task. Generated
clients and Zod were regenerated through each repo's own codegen command.

Mobile, web and API typechecks passed after final changes; library typechecks
passed through codegen. Diff whitespace and order-module parity checks passed.
Regression definitions cover order versus actual map row planners, order-lock
buttons, ownership scope, exact targets, replay/concurrency, insufficient funds,
full purchased content and Zone 1. No tests/suites run per owner's instruction.
No live purchases, database mutations, subscription changes, distributed builds,
or deployment performed. Updated server/client behavior is not runtime-verified
against a deployed updated backend. Pre-existing local edits were preserved.

Owner authorized delivery of these fleet changes to main. Push commit IDs are
recorded in the shared ledger. Backend publication and mobile reload/build are
required after delivery for the new behavior to be live.
