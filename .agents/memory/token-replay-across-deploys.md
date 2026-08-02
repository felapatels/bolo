---
name: Token replay across deploys
description: Signed evaluation tokens outlive deploys by their TTL; scoring policy must be enforced at verification time, not only at signing time.
---

**Rule:** any policy applied when signing an evaluation token (score caps, band rules) must ALSO be enforced in `verifyEvaluation` (`artifacts/api-server/src/lib/evaluationToken.ts`). Tokens stay valid for TOKEN_TTL_MS (15 min) across deploys/restarts, so a token signed by an old binary can be replayed against a new one and its claims written verbatim by `/attempts`.

**Why:** proven live 2026-08-01. The S1 honesty cap (92) shipped at 14:01 UTC; an attempt evaluated by the still-running pre-cap process was POSTed at 14:19:59 after the 14:14:41 restart and wrote score=100/band=perfect (attempt 14097). No path in the capped binary can emit 100 — the escape was purely temporal.

**Fingerprint technique:** tokens signed by the dual-pass (S1) binary always carry sttTranscriptMini/Hq/Disagreement into the attempt row. NULL stt columns on a row written after the respin deploy = token signed by the pre-respin binary. Generalizes: any new signed claim field dates which binary signed a token.

**How to apply:** the approved fix (post-session queue item 2) exports HONESTY_SCORE_CAP=92 from evaluationToken.ts, clamps non-nocatch claims >92 to 92/'great' inside verifyEvaluation (single choke point covering /attempts and test-out), replaces the two literal 92s in openai.ts, adds three pin tests, and repairs attempt 14097 only (UPDATE to 92/great; older pre-cap history untouched). The scoring-v2 promotion gate must ship an `audioJudged: true` claim exempted by this clamp — same commit adds the claim groundwork. Test-out is INCLUDED in the v2 promotion gate (owner ruling).
