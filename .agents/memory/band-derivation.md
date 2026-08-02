---
name: Pronunciation band derivation (five-band)
description: Five-band ladder is display-only; behavior keys on frozen credit groups; band is score-only, never from LLM `passed`.
---
Five bands since July 2026, top to bottom: perfect >=91 (was 93 until Aug 2, 2026), great 80-90, good 68-79, almost 55-67, retry <55 (nocatch separate, set upstream, never from score). Single server config: `artifacts/api-server/src/lib/scoreBands.ts`; client mirrors in web `ui/band-pill.tsx` and mobile `lib/ui.ts`, pinned by the three sharedConstants contract suites.

**Aug 2, 2026 owner ruling:** perfect split moved 93 -> 91 so the top band is reachable under HONESTY_SCORE_CAP (92). The FSRS Easy threshold (separate literal in fsrsScheduler.ts) moved with it by explicit ruling and stays deliberately coincident; it moves ONLY by owner ruling, never as display tuning. The verify-time replay clamp re-derives band via bandFromScore(cappedScore) — never hardcode a band at a clamp site. The cap is a SCORE ceiling only: a capped 92 bands perfect by design. Old stored five-band rows keep their band (91-92 'great' history rows stay 'great'); accepted, no migration.

**Frozen vs tunable:** 91 was set by owner ruling; 68 is a display split marked TUNING PENDING. 80 and 55 are FROZEN legacy nailed/close boundaries: every behavioral consumer (XP, Elo, FSRS rating, speaking streak, session gates, test-out) keys on credit groups whose edges are exactly these. Full credit = perfect|great (legacy nailed), half credit = good|almost (legacy close). Use `isFullCreditBand`/`isHalfCreditBand`/`isPassingBand`, never compare individual band names in behavioral code.

**Legacy rows:** no data migration — attempts written before the switch still store nailed/close. Read paths use `normalizeBand(band, score)` (exact re-derivation, same score field); the speaking-streak qualifying set also accepts legacy names directly.

**Ladder UI:** result cards render all five labels with the achieved band filled (BandLadder on both platforms); labels only, never numeric scores; nocatch never shows the ladder and keeps a neutral (muted, not destructive) pill/flash. Per-attempt confetti is perfect-only.

**Why score-only:** an earlier implementation used `passed ? 'nailed' : ...`, letting an LLM-asserted boolean inflate the band and dead-coding the middle UX. Never derive band from `passed`.

**Test trap:** several mobile jest files partially mock `@/lib/ui` (e.g. just `scoreColor`); any new export the practice/review screens call becomes `undefined` in those tests and the screen lands on the generic eval-error card. Spread `jest.requireActual('@/lib/ui')` in such mocks.
