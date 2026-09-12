# App Store preparation — 2026-09-12

In progress; nothing submitted for review.

## Builds
Africa 5 already attached. LATAM 5, East Asia 5, Europe 6 selected and saved. Final reload verification outstanding.

## Screenshots
Previous task verified 38 saved screenshots across these four apps (iPhone and iPad). See ../app-store-screenshots-2026-09-12.json.

## Metadata
English descriptions/review notes/contact details saved for four apps. Review account passwords still missing. Spanish (Mexico) must be preserved for complementary US search terms. Europe Spanish description/support/marketing/privacy fields completed; other Spanish fields still require audit.

## Purchases
LATAM and Africa monthly/yearly English names/descriptions and subscription group localization created. Their pricing, availability and review screenshots remain incomplete. Consumables not attached.
Europe monthly review screenshot uploaded (actual entitled account state) and explanatory review notes saved. Final save verification and staging outstanding. Europe yearly and East products not yet fully inspected.

## Pending owner input
Existing question asks approval to use app-defined consumable prices and app availability, plus reviewer password. No response yet. Spanish reminder does not answer this question.

## Other blockers
Europe validation reported missing Content Rights and app price tier. Spanish privacy/description/support blockers fixed.
Browser connector became unavailable; native Chrome UI remains usable. App Store Connect reopened in new native tab.

## Capture
review-captures/europe-all-access-active.png shows actual All-Access enabled status, not purchase pricing. Notes explicitly disclose entitled capture account.
Europe Metro started on 8085 (exec session 44759), simulator 21B6BAF0-F4AF-4362-AE49-3E6C1FFD5CDA.

Update: Europe monthly Save verified disabled; Add for Review successfully created one draft submission containing the subscription. Submit remains disabled: subscription group and app version must be added. No submission sent. Native UI currently shows draft submission drawer.

## API progress (latest)
Existing App Store Metadata key successfully reused; helper asc-api.mjs reads original key locally and never logs it or JWTs.
Europe: build6 verified valid. Reviewer password IS present (earlier UI-based missing claim incorrect). English+Spanish metadata complete. All nine screenshots COMPLETE. Monthly+yearly+group staged in draft b34ae5b0-58fc-4694-aea4-f5b0624846d2. Annual screenshot uploaded and review notes saved. Free app price created and verified $0. Currency packs have existing $1.99/$4.99/$9.99 pricing; notes saved. No price change made to packs.
App version staging validation now blocked only by contentRightsDeclaration. Owner question pending. Consumable screenshot still needed: simulator taps report successful but do not open wallet; asked owner to open Buy more Čaj. No review submitted.

## Latest verified update — September 12, afternoon
- Europe was fully staged (7 Ready for Review items); browser now shows Waiting for Review, consistent with owner submission. Agent did not submit.
- East server: commit d60789ca pushed to GitHub. Replit GitHub saved auth failed. Transferred exact 1,581-byte Git bundle for 2beaa612..d60789ca, verified bundle and merged via git fetch bundle / git merge. Existing Replit history preserved. Republish completed; refreshed UI Live; public /api/healthz returns status ok. Correct Cha IDs bolo_cha_cup/pot/chest match Apple. Server typecheck passed, no full suites. Device purchase flow still needs real-device confirmation/Apple propagation.
- East: build5 valid; 7 iPhone+4 iPad screenshots COMPLETE; both descriptions/support/privacy/terms present; free download, 175 countries. Draft ee81a380-454f-4e4f-a8ad-c0cd953b0b12 exists. Version cannot stage while age-rating questionnaire fields missing. Owner is handling declarations; no questions sent for these.
- Africa/LATAM: build5 valid each; 5 iPhone+4 iPad screenshots COMPLETE each; Spanish descriptions and privacy fields saved. LATAM uses owner's abuela positioning, qualified to reflect greetings and free Zone1. Removed unsupported language names from Spanish keywords, kept complementary relevant terms. Free app and all-country availability configured with explicit bundle identity guard.
- East/Africa/LATAM 25/75/200 currency packs now priced $1.99/$4.99/$9.99 with Apple equivalents worldwide, per explicit owner approval. Region-specific product IDs verified against server code. Review notes updated. Review screenshots still missing for these products and subscriptions; do not reuse Europe images.
- Africa and LATAM subscription prices/availability remain missing. Automated approval review rejected setting $12.99/month, $89.99/year from repo documentation because explicit owner approval covered currency packs only. No subscription mutation occurred. Need explicit owner approval for these rates to proceed. Continue other authorized work; no circumvention.
- Audit receipt remaining-apps-audit.json (availability fields preceded final Africa/LATAM setup).

Owner subsequently replied “approve everything” directly to the explicit Africa/LATAM subscription price question. Authorized $12.99 monthly and $89.99 yearly with worldwide equivalents. Subscription configuration now running; do not treat the previous approval blocker as current. Final Apple submission remains reserved to owner.

Subscription approval completed: Africa 6810749015/6810748914 and LATAM 6810748906/6810748855 now verified at USD12.99 monthly/USD89.99 annual, each with 175 priced and available territories and future territories enabled. Used subscription-level PATCH with included initial prices (individual POST did not support initial setup); retried one Apple500 only after reading existing prices. Receipt subscriptions-verified.json. No review submitted. Remaining region-specific purchase review screenshots and owner declarations unchanged.
