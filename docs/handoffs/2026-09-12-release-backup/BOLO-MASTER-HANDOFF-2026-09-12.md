# BOLO six-app master handoff

Updated September 12, 2026. Prepared for the owner and Claude.

## Read this first

This consolidates the September 11–12 conversation, repository handoffs, shared ledger, and recent Apple API verification. Older handoffs frequently say “local/unpublished”; later commits and rollout entries supersede those statements. This document distinguishes delivered code from runtime behavior still needing confirmation. It does not claim every original request is finished.

**Immediate release status:** Europe was fully prepared; subsequently the browser showed Waiting for Review (owner action, not an agent submission). East Asia, Africa and LATAM have build 5 selected, completed iPhone/iPad screenshot uploads, English and Spanish descriptions, legal links, and free worldwide app availability. Their purchase review screenshots and some declarations remain outstanding. Their subscription groups are now attached to draft reviews. No final review submission was performed by the agent.

**Critical operations gap:** Nest is live with six-app coverage. PagerDuty SMS setup exists, but automatic Nest incident delivery and the exact OpenAI balance-under-$20 alert are **not armed**. Do not assume production audio outages will automatically page the owner.

## Owner instructions that remain in force

- Work one app to completion at a time, starting with the most complete; East Asia is next after Europe.
- Prepare releases; owner handles declarations and final Submit for Review. “Approve everything” approved the specific pending subscription prices; it does not override the owner’s final-submission reservation.
- All countries remain enabled. US/Canada/UK is the intended audience, not an availability restriction.
- Preserve Spanish (Mexico) localization and complementary US search keywords, while keeping language/feature claims accurate.
- Include Terms and Privacy links in all descriptions.
- Typecheck only; owner explicitly waived full suites. Do not run full suites merely because older CLAUDE.md text says so.
- Inspect each repo’s CLAUDE.md and `/Users/aakeshpatel/bolo-supervisor/LEDGER.md` before named shared changes. Preserve regional identities and legacy API/station IDs.
- No force pushes or destructive production migrations. Preserve Replit deployment commits on merge.
- India consent is fully implemented but feature-flagged OFF until the owner explicitly changes that decision.
- Do not reset reviewer consent again without checking owner timing. Reset instructions were delivered; successful execution by the agent is not established.
- Never copy India marketing screenshots or voices into another region.

## Repositories and source state

| App | Repository | Latest local commit inspected |
|---|---|---|
| India | `/Users/aakeshpatel/bolo` | `e67367b8` Nest cockpit |
| SEA | `/Users/aakeshpatel/bolo-sea` | `f1dd7b60` Nest cockpit |
| East Asia | `/Users/aakeshpatel/bolo-east` | `d60789ca` Cha catalog fix |
| Africa | `/Users/aakeshpatel/bolo-africa` | `8cd043f4` Nest cockpit |
| Europe | `/Users/aakeshpatel/bolo-europe` | `ed6b3120` Nest cockpit |
| LATAM | `/Users/aakeshpatel/bolo-latam` | `ad2a58b5` Nest cockpit |
| TryBolo | `/Users/aakeshpatel/trybolo` | `e05c6ff` Alex/sample SEA marketing stats |

At handoff, these repositories have no tracked working changes. Five regional repos have untracked `.pnpm-store/` caches; leave them out of commits. This is a local status check, not a new remote fetch. Prior rollout evidence records all six application commits pushed and published, plus the subsequent East catalog push/deployment. Workspace release scripts/receipts are local handoff artifacts, not application source pushes.

Shared ledger: `/Users/aakeshpatel/bolo-supervisor/LEDGER.md`. Detailed topic handoffs: each repository’s `docs/handoffs/2026-09-11-*.md` and `2026-09-12-*.md`.

## Mobile, web and server work

### Daily gift and wallet

- Removed obsolete lesson-attempt daily currency payment so the gift claim is the reward writer. Home stats use actual wallet balance, not a pending gift.
- Locked cards retain “Finish a stop today” messaging. Failed claims do not open the gift. Claim/receipt state and wallet refresh were aligned across all six mobile/web apps; Africa gained the missing card.
- Added shopping navigation across all six. Later mobile design supersedes the earlier full-width footer: one compact row, small separate Shop target, enlarged gift, locked-tap wiggle and instruction emphasis, reduced-motion handling.
- Owner preview exception uses the exact authenticated Clerk user ID supplied by the owner. It bypasses earned-stop eligibility only, retains explicit claiming and once-per-day accounting, and does not grant lesson completion or automatically add currency. See `2026-09-11-owner-gift-preview.md` in each repo.
- Existing wallet balances were not erased. Original SEA balance provenance was not proven through production ledger inspection.

### Zones, stop access and content

- Zone 1 is free for every language. Later stops can be reached through All-Access or individual currency purchases **in order**.
- Implemented access badges and purchase choices for lessons, storybooks and tracing stops across mobile/web. Preserve owned-stop access and regional currency names.
- Owner approved GET `/tokens/journey-stops` and POST `/tokens/journey-stops/unlock`; lesson endpoint remains compatible. See ordered-stop and journey-stop-unlock handoffs for exact enforcement and model details.
- LATAM’s four-stop problem was a content shortage, not visual truncation. Expanded from 658 to 7,200 phrases by adding 6,542 generated rows, preserving original data/order and generated provenance. 72 topics validated; partition checks cover fresh and upgrade scenarios with at least ten groups. GPT review was automated, not native-speaker review. Published server includes later source rollout, but actual production per-zone counts should be checked before declaring the entire fleet’s library audit closed.
- View Map missing labels was reported. Do not equate the river/road changes with verified map-label coverage across all five; inspect this separately if no later topic receipt proves it complete.

### Journey and regional media

- SEA: irregular river banks, shallows and ripples replaced rails/ties. Ship centreline, stop positions, progress and interactions preserved. Railway crossing hardware became lantern buoys.
- East Asia: ported SEA river/buoy treatment on mobile/web while retaining East scenery/boat.
- LATAM and Africa: asphalt road, edge/centre markings and traffic lights replace railroad spine/crossings; minibus movement and legacy IDs remain.
- SEA Kopitiam loop previously contained forward footage followed by reverse. Re-encoded forward-only with a tail-to-head crossfade and matching poster, mobile/web.
- LATAM wallet/shop copy uses Mercadito and Cacao; owner’s supplied Mercadito audio replaces India welcome audio. Film retained.
- Africa intro uses owner-selected `Minibus_parked_at_roadside_stop_20260909163357.mp4` (“more road visible”). Mama’s Stall harbour background replaced with Africa market footage, matching poster and forward dissolved loop.
- Europe/Africa call backdrops replaced inherited SEA footage with Babcia/Mama media. Europe real Polish call connected and was recorded. A usable Africa call recording remained unverified in capture notes.

### Speech and chat

- SEA coach requests now pass languageCode on current/initial/next phrase playback; language is included in local audio identity. This corrects inappropriate fallback selection where the provider policy supports ElevenLabs.
- SEA coach/chat/story narrator use `bY54gWrN4O4G9QOFtXwl`; provider language restrictions and fallback policy were preserved.
- Chat first-response overlap and silence/echo handling were repaired in SEA/India and associated fleet work; native recorder blur cleanup now catches rejected stop promises in all six.
- Europe received missing coach language routing, no-speech handling, visible retry/error handling, and configured ElevenLabs model selection in buffered/streamed chat.
- Africa Shikamoo report: repaired missing language/model/instruction propagation and affected cache identity. No sound-effect call was found in the transition. **The exact scream clip was not auditioned and a clean device roundtrip was not proved.**
- Added India/SEA hold-to-talk hint/pulse behavior to the other five mobile apps with reduced-motion support.
- India TestFlight Hindi stop 1 word 3 audio error was later reported fixed by owner. Do not infer a separately verified scoring-code repair; billing/credit failure was discussed at that point.

### Voice assignments to preserve

| Area | Voice ID |
|---|---|
| SEA Bolo/coach/narrator | `bY54gWrN4O4G9QOFtXwl` |
| LATAM grandma/encounters/calls | `aYQAm4rWuigkeuRA5i92` |
| LATAM other Bolo/coach/narration default | `P0zSUl3c6tjweeuBGjgP` |
| LATAM Brazilian Portuguese | `ORgG8rwdAiMYRug8RJwR` |
| Europe Polish | `2AI3SLYKkKZsvZEiHd3D` |
| Europe Russian | `t6lBrEl93uCiLR1Lgm8v` |
| Europe Bosnian/Croatian/Serbian | `7IVTG9LKLYndnFiFDLU2` |
| Europe Ukrainian | `yMBZR4SLoc24wOJLWAB2` |
| Europe Portuguese | `zKjRewuiqTkXNUVAMwat` |
| Europe Czech/Slovak | `9Nd358gE1qQp0pDh8FgP` |
| Europe Spanish | `wKvrrFnAmhvpNRpZkbmh` |
| Europe French | `ebRwkdEFVZIx2A6YucFh` |
| Europe German | `2etPlvmUpTvN6iCGyIDC` |

Owner authorized nearby-region voice reuse: sl/bg/mk use Bosnian group; it/ro use Spanish; hu uses Czech/Slovak; lt/lv/et use Polish. Albanian retains OpenAI. Do not assume voices have all been auditioned.

**Narration caveat:** Europe per-language story `languageCode` contract wiring remained pending in detailed handoffs. Verify current code before claiming all story narration uses the language map. LATAM live call now generates text then ElevenLabs audio instead of bypassing the selected grandma voice through stock gpt-audio speech; latency still merits listening.

### Consent and sign-in

- Five non-India clients/server gates repaired, including known historical disclosure version fallback, explicit retry, error handling, Account review/revoke and denied-feature helper directing to Account.
- Declined users do not silently receive another consent prompt or a manufactured grant. Non-AI features remain usable.
- iPad presentation improved. India has matching complete flow but `AI_CONSENT_ENABLED=false` across clients/server.
- Five-server rollout completed. East/Africa initially proposed destructive column drops; publication was cancelled, exact missing nullable consent columns added to development DB, and rollout retried without dropping production choices.
- SEA Google OAuth failed because the stored client secret included literal surrounding quotation marks. Removed only the wrappers; fresh simulator sign-in reached consent. No credential rotation or new native OAuth registration. Native scheme was also refreshed separately.

## Nest and alerts

Delivered/published all six: aggregated owner dashboard plus individual scopes, metric drills, coverage indicators, source records, learner/day drills, operations/people/content, existing classic tool links, subway learner map, signup boxes, bird-in-nest logo, and account exclusion picker.

- Exclusion selections are browser-local; do not imply a centralized permanent exclusion policy.
- Aggregates distinguish missing data from zero, accounts from unique people, and separate currencies. Learner drill cap is 200 records per app.
- Fixed signed-out redirect to login while maintaining non-owner denial.
- Server-only spoke relay keys and matching India hub keys configured; no key values are in this document. Fixed regional HTTPS targets, timeout/no-store, redirect refusal, header redaction and read-only remote relay boundaries.
- Live six-of-six coverage, individual Europe view, account drills, picker and signed-out redirects verified. Six public health endpoints passed; unauthenticated relays denied.
- PagerDuty service `PDNPFQ7` exists; primary SMS was verified. Secondary number deliberately not added.
- **Not done:** Nest-to-PagerDuty background delivery, end-to-end incident/SMS test, automatic exact OpenAI credit balance feed and under-$20 emergency alert. Dashboard indicates unarmed. Prioritize this operational gap after release preparation; no alert guarantee is warranted.

## TryBolo and screenshot work

- Six-region redesign: phone screenshot carousel, manual controls/pause/swipe, 3-second rotation, language badges/search, regional live video tiles, lazy/off-screen pause, scroll reveals and reduced-motion support.
- India availability text: live web/App Store/Google Play. Five others: web live, stores coming soon (revisit as apps release).
- Regional screenshots replaced art-only carousel states; Europe phone rendering corrected. SEA later gained real signed-in screenshots and owner-requested Alex/sample marketing stats.
- TryBolo source commits: `2456dae` redesign, `00e691e` SEA captures, `e05c6ff` Alex/sample stats. Initial Cloudflare deployment verified; final e05c6ff deployment should be rechecked rather than relying on stale `work/trybolo/STATUS.md`.
- **Queued, not established delivered:** prominent “All languages. Get started for FREE!” feature, with truthful Zone 1 explanation.
- Screenshot exports: `/Users/aakeshpatel/Downloads/BOLO App Store 2026-09-11/`; older regional screenshot folders also exist. App Store uploads below are independently API-verified. RGB/alpha removal performed for exports.
- Phone-call “Show meaning” helper is **roadmap only**, recorded in ROADMAP/HANDOFF and per-repo call-meaning handoffs. No implementation claimed.

## iOS builds and App Store readiness

All six EAS production builds finished; upload receipts record delivery to Apple (not review submission):

| App | Marketing version | Build | Apple app ID |
|---|---|---|---|
| India | 1.0.18 | 547 | See local apps.json; preserve existing listing |
| SEA | 1.0.0 | 11 | See local apps.json |
| East Asia | 1.0.0 | 5 | 6809205852 |
| Africa | 1.0.0 | 5 | 6809208363 |
| Europe | 1.0.0 | 6 | 6809198565 |
| LATAM | 1.0.0 | 5 | 6809805287 |

Europe build6 and the other three build5 attachments are API-verified VALID. India/SEA final listing readiness is not freshly verified here. Do not say all six are ready to submit.

### Europe

- Five iPhone + four iPad screenshots COMPLETE; English/Spanish descriptions and legal links complete; reviewer password is present (earlier claim of missing password was wrong).
- Two subscriptions, subscription group, three Čaj packs and version staged: seven READY_FOR_REVIEW items. Owner completed content rights.
- Subsequently visible browser status: Waiting for Review. Agent did not press final submit.
- Draft reference: `b34ae5b0-58fc-4694-aea4-f5b0624846d2`.

### East Asia

- Seven iPhone + four iPad COMPLETE; build5 selected; English/Spanish descriptions, support/marketing/privacy fields complete; free download and 175 countries verified.
- Group attached READY_FOR_REVIEW in draft `ee81a380-454f-4e4f-a8ad-c0cd953b0b12`.
- Version staging currently blocked by missing age-rating questionnaire answers.
- Both subscription review images and all three Cha review images missing. Owner promised device images but none present in the supplied files at handoff.

### Africa

- Five iPhone + four iPad COMPLETE; build5 selected; English/Spanish descriptions and legal URLs saved; free worldwide app configuration saved.
- Group attached READY_FOR_REVIEW in draft `aec26e2a-8fab-4998-8b18-db1ec7421720`.
- Version staging currently blocked by unpublished App Privacy/data-usage answers.
- Both subscription and three Cowries review images missing.

### LATAM

- Five iPhone + four iPad COMPLETE; build5 selected; English/Spanish descriptions/legal URLs saved; free worldwide app configuration saved.
- Used owner’s “You understand your abuela. Now answer her back.” positioning; removed unsupported claim that app does not start at greetings. Kept free Zone1 and ordered Cacao purchases clear.
- Group attached READY_FOR_REVIEW in draft `71aa89de-f205-4d52-bc25-5f9b4dd81557`.
- Version staging blocked by age-rating answers, published App Privacy/data-usage answers and content-rights declaration.
- Both subscription and three Cacao review images missing.

### Purchases: exact identities and pricing

All nine East/Africa/LATAM consumable packs are configured at USD $1.99/$4.99/$9.99 for 25/75/200, with Apple worldwide equivalents and availability. Region-specific review notes explain currency, ordered stop unlocks and no All-Access grant.

| App | 25 | 75 | 200 |
|---|---|---|---|
| East | 6810748865 / bolo_cha_cup | 6810748791 / bolo_cha_pot | 6810749102 / bolo_cha_chest |
| Africa | 6810761532 / bolo_africa_cowries_25 | 6810760208 / bolo_africa_cowries_75 | 6810761664 / bolo_africa_cowries_200 |
| LATAM | 6810748825 / bolo_cacao_pod | 6810749008 / bolo_cacao_basket | 6810748785 / bolo_cacao_sack |

Africa’s old products marked RETIRED are not the active products; do not stage them.

Africa and LATAM All-Access **verified** USD $12.99 monthly, $89.99 yearly, 175 priced/available countries each and future territories enabled:

- Africa monthly 6810749015 (`bolo_africa_allaccess_monthly`); annual 6810748914 (`bolo_africa_allaccess_yearly`).
- LATAM monthly 6810748906 (`bolo_latam_allaccess_monthly`); annual 6810748855 (`bolo_latam_allaccess_yearly`).
- East existing monthly 6809206778 (`bolo_east_plus_monthly`); annual 6809206996 (`bolo_east_plus_annual`). Existing pricing was preserved.

**East consumable server fix:** mobile fetches server product IDs, then StoreKit hides packs when none resolve. Server had `bolo_east_cha_*`; Apple has `bolo_cha_cup/pot/chest`. Fixed catalog and six fixture/source files, typechecked, pushed `d60789ca`. Replit saved GitHub auth failed. Created exact 1,581-byte Git bundle relative to `2beaa612`, verified it in clean Replit, fetched bundle and merged, preserving existing publish history. Republished; refreshed Live status and public healthz OK. No new binary required by this catalog change. Actual TestFlight sellability still needs confirmation after Apple propagation; binary was not disassembled.

## Next actions in order

1. Finish East Asia: obtain actual East purchase/All-Access device review images, upload and verify COMPLETE, attach both subscription versions and three consumable versions. Owner completes age ratings. Then stage version and verify complete draft without submitting.
2. Finish Africa, then LATAM with their own purchase screenshots and the declarations listed above. Prices are done: do not ask again or create duplicates.
3. Recheck India/SEA original listing scope and latest build selection; India primarily What’s New. Do not disturb Europe while Waiting for Review.
4. Arm and end-to-end test Nest/PagerDuty and the balance alert; this remains an important operational obligation.
5. Complete/verify TryBolo prominent free-language feature and latest marketing deployment; verify regional homepage assets/live claims.
6. Audit deferred runtime matters: Africa scream, Europe microphone/coach, per-language story narration, full library production counts and map labels. Keep these visible until evidenced, not assumed.

## API and workflow notes for the next agent

Working root: `/Users/aakeshpatel/Documents/Codex/2026-09-11/referenced-chatgpt-conversation-this-is-an`.

Use the existing `work/app-store-release/asc-api.mjs`. It reads an existing local App Store key and signs short-lived tokens in memory; do not print/copy secrets, JWTs or reviewer passwords into handoffs. Node: `/opt/homebrew/bin/node`. Apple OpenAPI spec saved at `/tmp/asc-spec/openapi.oas (2).json`.

- Initial subscription pricing worked via PATCH subscription with included `subscriptionPrices`, not individual POST. One Apple500 was retried after checking existing rows; all four final configurations verified. Approval blocker resolved by owner; no reapproval needed.
- Stage version objects (`subscriptionVersion`, `inAppPurchaseVersion`, `subscriptionGroupVersion`), not base product IDs. Never set review submission `submitted:true`.
- Screenshot upload: reserve, PUT exact chunks to returned URLs, commit uploaded/checksum, then poll asset state COMPLETE. Uploaded is not processed. Do not reuse another region’s image.
- Europe IAP image rejected original dimensions. Resize/pad without altering UI content to 640×1136 succeeded. Preserve original screenshot. User notes Apple page sometimes must be refreshed before another screenshot attempt.
- User authorized Chrome and Maestro; simulator taps have been unreliable. Simulator cannot reliably display real StoreKit packs; do not fabricate a purchase screen.
- Replit live app and development preview are separate. East development Clerk domain error is not proof of production failure. Use Shell, not paid Replit Agent, for deployment tasks.

## Evidence files

All below relative to working root:

- `work/app-store-release/builds-started.json`: six finished builds and EAS IDs.
- `work/app-store-release/testflight-submissions.json`: Apple upload receipts.
- `work/app-store-release/europe-ready.json`: Europe readiness receipt.
- `work/app-store-release/remaining-apps-audit.json`: build/screenshot/description readback; Africa/LATAM availability fields predate their final setup.
- `work/app-store-release/subscriptions-verified.json`: authoritative four-subscription prices/175-country verification.
- `work/app-store-release/draft-staging.json`: latest draft/group attachment and exact declaration errors.
- `work/app-store-release/preparation-status-2026-09-12.md`: append-only history; latest entries supersede earlier blockers.
- `work/app-store-release/review-captures/`: Europe purchase images only.
- `work/app-store-screenshots-2026-09-12.json`: prior screenshot upload record.
- `work/replit-rollout/status.md`: five-app consent rollout, including avoided destructive migration.
- `work/trybolo/STATUS.md`: historical design notes, stale on final publication/capture status.

Validation throughout: relevant mobile/web/API typechecks, focused source/media/UI/API checks; no full suites. This handoff contains no secret keys or passwords.

## Git backup follow-up

Owner requested all work pushed. Six application branches were fetched and verified equal to origin/main. TryBolo now has private GitHub remote https://github.com/felapatels/trybolo and main was pushed. This handoff, release scripts/receipts and shared supervisor documentation are backed up in the India repository under docs/handoffs/2026-09-12-release-backup. Generated dependency caches, credentials and temporary UI captures are intentionally excluded.
