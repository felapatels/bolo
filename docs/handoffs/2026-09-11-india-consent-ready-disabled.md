# India AI consent: complete, held off

Owner: finish the approved consent UX and feature flag it off until explicitly authorized after review feedback. Other five forks retain their enabled flows.

`lib/ai-consent/src/index.ts` exports `AI_CONSENT_ENABLED = false`. Mobile boundary, existing feature-door state, Account controls, web boundary/Account controls and server enforcement consume this single flag. Off means no consent gate/notice/consent-specific fetch and no server consent rejection. It never manufactures a grant or alters saved decisions.

When enabled, clients wait for a saved decision before mounting authenticated screens. Unknown decisions show the same four-card disclosure on mobile and web, with a bounded phone/tablet column, mascot header, equally sized outlined refusal and filled acceptance. Both choices persist through the existing India endpoint; failures stay on screen with retry. A stored refusal does not re-prompt; Account provides deliberate review/change. Server guards cover AI send/synthesis routes while leaving account, consent and call-end usable. Exact consent refusals show the Account helper.

Recipients, recording/text transmission, memory use and the existing India disclosure version are unchanged. No API contract or account data changes. To activate, explicitly approve flipping this flag and coordinate a mobile release with web/server publication; do not enable server enforcement ahead of compatible mobile clients. This is a build-time flag, not a remote switch.

Validation: typechecks only per owner. Enabled consent was not submitted on a real account by the agent. Native release builds remain held for simulator review.
