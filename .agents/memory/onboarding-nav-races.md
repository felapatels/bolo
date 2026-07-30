---
name: Onboarding auto-launcher navigation races
description: Auto-launching flows that navigate (tours, wizards) race same-commit Redirects from onboarding gates; gate the launcher on every onboarding precondition, and verify with a real-browser fresh-account probe.
---

**Rule:** Any component that auto-launches a flow which NAVIGATES (guided tour, setup wizard) must check every onboarding precondition — not just "am I on a blocked route right now". Route-prefix blocklists are insufficient: at first render the location is still the pre-redirect route.

**Why:** July 30, 2026 — Bolo web's tour auto-launcher only blocked by route prefix. On a truly fresh account (tour not completed AND language not chosen), the launcher's effect ran while location was still `/app`; `startTour` navigated to step 1's route (`/app`) in the same React commit as the language gate's `Redirect to /choose-language`. The navigations cancelled out: URL stayed `/app`, the gate kept rendering a spent `<Redirect>` (null), and the learner saw the tour over a BLANK page. Every brand-new signup would have hit it.

**How to apply:**
- Launcher effects must return early until upstream onboarding steps are resolved (server flag, or the session skip marker), and re-run on location/account-cache changes so the flow starts once the user actually lands.
- Isolated unit tests of gate/launcher/step each pass while the composition is broken — the race only exists in the full app. Verify fresh-account onboarding with a real-browser probe (fresh Clerk user via sign_in_tokens, e.g. `qa/b1-skip-probe.mjs`).
- Diagnostic signature of a cancelled wouter Redirect: URL is the "wrong" route, route content is blank (Redirect renders null, its one-shot navigate already consumed), overlay/portal UI still visible.
