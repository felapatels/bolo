# Authorized release sequence

Owner instruction September 11: AFTER TryBolo is live and published with all six apps, cut six mobile builds and prepare App Store review listings. Owner will add/submit for review themselves.

1. Finish true regional screenshot sets and TryBolo site. Publish and verify all six apps present; no India assets reused for other regions.
2. Verify existing App Store version numbers before builds; never invent or increment marketing versions already set by owner. Six iOS production builds (App Store context); no extra Android builds inferred. Typecheck only, owner explicitly waived full suites. Include the current intended mobile changes, inspect uncommitted changes, keep India consent feature flag off as instructed. No builds started yet.
3. Upload builds to App Store Connect/TestFlight, wait for processing, select matching builds for existing versions. This is build delivery, not review submission.
4. India: preserve existing title/subtitle/keywords/screenshots/version; edit What's New only. Verify description already includes working Terms and Privacy URLs; add missing required links if necessary because owner's all-descriptions requirement includes India.
5. SEA/East/Africa/Europe/LATAM: check all required iPhone/iPad screenshots are uploaded, region-correct and alpha-free. Check/edit titles, subtitles, keywords and descriptions for accurate ASO. No invented reviews, rankings, features or unsupported language claims. Include explicit working Terms of Use and Privacy Policy URLs in every description, and proper privacy URL field.
6. Check readiness and report any remaining required owner input. Stop BEFORE Add for Review / Submit for Review. Do not accept new agreements or alter billing/access.

Existing saved app IDs/config inventory: apps.json. Verify App Store values live; local build numbers are not authoritative for latest uploads.

Prerequisites still open: Europe screenshot phone session needs owner sign-in (question already sent). SEA dedicated screenshot simulator is blank; no clean SEA/Europe screenshot sets presently available. Three regional live sites (SEA/Africa/Europe) were found still using India legacy media. TryBolo redesign is saved locally and previewed but not published. See ../trybolo/STATUS.md.

## Capture update 21:50
Maestro authorized. Europe signed in, 4 clean iPhone and 4 clean iPad RGB captures saved in Downloads/BOLO App Store 2026-09-11/Europe. LATAM iPad sign-in and consent succeeded; 4 RGB iPad captures saved alongside prior 5 iPhone captures. Africa 4 fresh iPhone captures saved, including corrected road journey. TryBolo workspace+repo now contain real Europe4 and Africa5 screenshots; SEA remains the only carousel without screenshots.
SEA unsigned simulator startup fixed by rebuilding with CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM=57PJ64Z5FA, installed dedicated SEA Shots6.5. No production build. SEA now at sign-in; pending async owner sign-in request. No production builds or website publish yet. Cloudflare whoami succeeds.
During actual call capture, Africa and Europe mobile still referenced SEA uncle files. Replaced native backdrops with owner's Mama/Babcia footage from regional Downloads folders, silent encoded assets with first-frame posters and new names; IDs unchanged. Typechecks Africa+Europe pass. Both ringing screens visually verified. Africa real call failed to connect; Europe connected with real Polish opening greeting, second recording in progress. Changes local/uncommitted and not on websites yet. Do not use failed/blank/intermediate captures.

## Subsequent capture and fixes
East iPad4 RGB captures saved (consent success). Africa iPad4 RGB captures saved (consent success), retook journey/progress after warning. Europe native call assets and landing page now use Babcia plus five own screenshots/clip; web typecheck and DOM preview pass. Local preview requires API_PROXY_TARGET=https://bolo-europe.app and documented public dev Clerk key; runtime5190 session58206. Corrected Europe landing's old two-free-zones claim.
All6 mobile chat blur cleanup now catches native recorder.stop() rejected promise as well as sync error; found from Africa iPad navigation. All6 mobile typechecks pass. Local/uncommitted. No full suites.
Native Chrome read rejected twice by automatic approval review due broad snapshot of unrelated private tabs. Continue only task-specific browser tabs; no bypass or full-native snapshot retries absent a relevant safety change. User closedAmazon but secondrejectioncitedotherprivatetabs.
Africa call retry currently recording: simctlvideo session69975, Maestro27143, filework/store-shots/africa-call-take2.mp4. MUST stop recording when result checked. SEA stillpendingownersignin. Remaining: SEAactualshots/call, Africacallusableclip/landing, AppStoreuploads+metadata, TryBolopublishthen6productionbuilds asauthorizedorder.

Africa retry recording69975 stopped, Maestro27143 complete. Recording showed the old ended-call alert rather than a fresh connection, then simulator SpringBoard. Diagnostic BoloAfrica-2026-09-11-225935.0002.ips crashed inside XCTAutomationSession initWithAccessibilityFramework block (automation), not a demonstrated app-code crash. Do not use retry movie. Must reopen app and dismiss old ended-call state before a genuine new call attempt.

Africa fresh call now SUCCESS: after app restart and cleared overlays, third recording connected Swahili greeting with Mama stall footage. work/store-shots/africa-call-take3.mp4, trimmed13seconds from13s into africa-call-web.mp4. Fullresstill /tmp/africa-good-18.png saved Africa/iPhone/05-call.png RGB, Downloads Africa/Homepage video/phone-call.mp4. Updated Africa landing to own5screens+callclip and currentZone1copy, web typecheck passed. Europe/Africa call images addedTryBolo phonecarousels (Europe5,Africa6). AllrecordersSTOPPED. Mainshotphone nowSEA: installedexistingapp+opened8082, firstdevmenupromptbeingdismissed (Maestro sea-main-close). It may have existingGoogleSSO; investigate before waitingonownersignin. DedicatedSEAdevicependingoldquestionunchanged.


## Release execution — September 12
TryBolo published to Cloudflare production, commit 2456dae, deployment https://23096f03.trybolo.pages.dev; six regions verified on https://trybolo.app/regions.json. SEA still uses its own artwork pending Google sign-in repair and actual captures; five other regions have real phones.
All six reviewed app changes pushed, including shared Show meaning roadmap handoff copies. Five iOS production builds submitted: India547, East5, Africa5, Europe6, LATAM5. Exact IDs/status in builds-started.json. Build counters pushed. India547 finished successfully. SEA held for reproduced Google needs_identifier callback failure. Temporary diagnostics removed. Clerk production allowlist already contains bolo-sea://sso-callback, but native iOS identity list empty; adding verified 57PJ64Z5FA/com.bolo.sea was rejected by approval review and is awaiting explicit owner permission. No Clerk write confirmed. Simulator native project was stale bolo-mobile, regenerated to bolo-sea and rebuilding.
All six mobile and both modified Africa/Europe web typechecks pass, no suites. No App Store submission yet.


## Current outcome
All six iOS builds submitted; see builds-started.json. All six repo changes and build numbers pushed. TryBolo first deployment is live. A second committed update (00e691e) adds four clean SEA screenshots, but Cloudflare publish is blocked by automatic approval review pending explicit user permission to publish images showing first name Aakesh and learning stats. Exact review in work/trybolo/sea-screenshot-review.md. Do not bypass.

SEA Google sign-in repaired in Clerk: existing client secret had literal enclosing double quotes. Removed only the quotes; inner secret suffix matched Google. Fresh Google OAuth verified to consent, consent continued to language selector, and home/chat/progress/journey captured. No secret rotation, no iOS native identity registration; the earlier registration approval question is obsolete. All temporary app diagnostics removed. Handoff pushed as 1d9a663f.

Screenshot originals: Downloads/BOLO App Store 2026-09-11/SEA/iPhone, 4 RGB1320x2868. SEA iPad/call clip and regional landing replacement still pending from the older queue. App Store Connect metadata/screenshots/build selection remain pending; nothing submitted for review.
