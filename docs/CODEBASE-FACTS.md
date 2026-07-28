# BOLO Codebase Facts

Living reference. Paste the relevant sections at the top of every spec so the agent does not re-derive them.

Last updated after: Spec 0 Task 1, Spec 0 Task 2, Spec 1a, Spec 1 v3, the band-derivation follow-ups, and Spec D2 Step 0.

**Maintenance rule:** after every completed task, append what changed. Anything in here that turns out to be wrong is worth more than the correction itself, because it means a spec was written against it.

**Section numbering is stable.** Specs reference section 9 for working rules. Do not renumber.

---

## 1. Repository layout

Monorepo, pnpm workspace, root at `/home/runner/workspace`.

| Path | What it is |
|---|---|
| `artifacts/api-server` | Node/Express API |
| `artifacts/gujarati-coach` | React web app |
| `artifacts/bolo-mobile` | Expo React Native app, expo-router |
| `lib/db/src` | Drizzle schema |
| `lib/db/drizzle/` | Migrations and `_journal.json` |
| `lib/api-spec/openapi.yaml` | Schema source of truth |
| `lib/api-client-react/src/generated/api.schemas.ts` | Generated client types |
| `lib/api-zod/src/generated/types/` | Generated Zod types |
| `lib/integrations-openai-ai-react/src/audio/` | Web audio recording hook |

**Stack:** Postgres, Drizzle ORM with drizzle-kit migrate, Clerk auth, OpenAI direct key (Whisper STT, chat, TTS), ts-fsrs v5, expo-audio on mobile.

**Never hand-edit** anything under `generated/` or `dist/`. Change `openapi.yaml` and regenerate.

---

## 2. Database schema

### Pre-existing

**users:** `id` text PK, `timezone` text nullable (IANA), `daily_goal` int default 10, `tz_grace_used_on` date nullable

**attempts:** `id` serial PK, `user_id`, `language_code`, `phrase_id` nullable, `native_script`, `romanized`, `english`, `transcript`, `score` int 0-100, `passed` bool, `feedback`, `created_at`, plus added in Task 1: `latency_ms`, `audio_duration_ms`, `band`, `fsrs_rating`, `theta_delta`, `beta_delta`, `xp_awarded`, `flags` jsonb

**phrases** (`lib/db/src/schema/phrases.ts`): `language_code`, `category_id`, `difficulty` int, `premium` bool, `stage` text (`phrase` or `sentence`), `hint`, `sort_order`, plus Task 1 additions `accepted_answers` jsonb, `elo_difficulty`, `elo_difficulty_rd`, `exposure_count`, plus Spec D2's `register` text nullable (`formal` / `colloquial` / `code_switched`, migration `0021_spec_d2_register.sql`) with index `phrases_language_register_idx` on `(language_code, register)`. All rows currently NULL; no authoring or filtering yet.

**game_sessions:** `id`, `user_id`, `language_code`, `game`, `correct_count`, `total_count`, `xp_awarded`, `context`, `created_at`. Game values: `word-match`, `speed-round`, `listen-and-pick`, `phrase-builder`, `daily-quiz`, `script-trace`

**daily_quiz_completions:** `id`, `user_id`, `language_code`, `quiz_date` date, `score` 0-5, `xp_awarded`, `completed_at`

**script_trace_progress:** `id`, `user_id`, `chapter`, `character_id`, `passed`, `best_score`, `attempt_count`, `updated_at`

**badges:** `id`, `user_id`, `language_code`, `badge_key`, `earned_at`

**languages:** `code`

### Added in Task 1 (migration `0020_scoring_core_v2.sql`)

**user_item_memory:** `user_id`, `phrase_id`, `stability`, `difficulty`, `state`, `reps`, `lapses`, `last_reviewed_at`, `due_at`. PK (user_id, phrase_id), index (user_id, due_at)

**user_ability:** `user_id`, `language_code`, `skill`, `theta`, `theta_rd`, `attempt_count`, `updated_at`. PK (user_id, language_code, skill)

**xp_ledger:** `id`, `user_id`, `attempt_id`, `game_session_id`, `source`, **`xp`**, `multiplier_reason`, `language_code`, `created_at`. Unique on `(user_id, source, ref_id)`

> The XP column is named **`xp`**, not `amount`.

---

## 3. Business rules and invariants

### Band thresholds (Spec 0 rule 40)

`score >= 80` is `nailed`. `score >= 55` is `close`. Otherwise `retry`. `nocatch` is set separately when audio is under 400 ms or transcription fails.

**Band is derived from score only.** It was briefly derived from `passed`, which allowed an LLM-returned boolean to inflate it. Fixed. Do not reintroduce.

`passed` is `score >= 80` server-side, so `passed` and `band === 'nailed'` coincide, but they are computed independently.

### Band treatment (must stay consistent across practice and review)

| Band | Mascot pose | Haptic | Sound cue | XP arc | Shake |
|---|---|---|---|---|---|
| nailed | `cheer` | Success | `correct` | yes | no |
| close | `thumbsup` | Light impact | none | yes | no |
| retry | `tryagain` | Warning | `wrong` | no | yes |
| nocatch | `thinking` | none | none | no | no |

`close` is a partial success, not a failure. It is worth 0.5 in Elo, Hard in FSRS, and a 0.6 XP band factor.

`nocatch` is a **system failure to hear**, not a learner error. It gets no negative treatment of any kind. This supersedes the earlier treatment where it shared `retry`'s handling.

### Session end

Session confetti and the `session_complete` cue share one gate: `good * 2 >= total`, where good counts phrases ending at `nailed` or `close`. A weak session gets no confetti and no celebratory sound.

Summary confetti renders language glyphs, capped at 40 on web and 25 on mobile. Per-phrase confetti stays shapes at 70 web / 44 mobile.

### Scoring

- **FSRS:** ts-fsrs v5, default parameters, desired retention 0.90. State materialized in `user_item_memory`.
- **Mastery:** `stability >= 21 days AND last attempt correct`. Reversible. No permanent graduation.
- **Elo:** Rasch logit scale. `K = 0.4 / (1 + 0.05 * n)`. Observed score 1.0 nailed, 0.5 close, 0.0 retry.
- **XP:** `10 * band_factor * difficulty_multiplier * review_multiplier * decay_multiplier`. Band factor 1.0/0.6/0.0. Difficulty `clamp(1 + 0.5*(beta - theta), 0.25, 2.0)`. Review 1.5 when due. Decay 0.1 when stability > 60 days and not due.
- **Game XP:** word-match 15, listen-and-pick 15, phrase-builder 20, speed-round 25, plus 10 when accuracy >= 80%.
- **Daily quiz XP:** 10 per correct, plus 20 for a perfect 5/5. Max 70.
- **Script Trace XP:** flat 30 per chapter.
- **XP total** is always the sum of `xp_ledger.xp`. Never a stored counter.

### Streaks

All streaks use `localDayKey()` and `previousDayKey()` from `progressMetrics.ts`, in the user's IANA timezone. General and quiz streaks share one implementation and cannot drift.

A day with no activity yet falls back to yesterday, so a streak does not appear broken mid-day. This is correct; do not "fix" it.

**Speaking streak (Spec D2):** derived at query time by `computeSpeakingStreakDays()` in `progressMetrics.ts` — filters attempts to band `nailed`/`close` and delegates to `computeStreakDays`, so bucketing and the mid-day fallback can never drift. Surfaced as optional `speakingStreakDays` on `GET /progress/summary`; shown as a Mic stat on web home and mobile progress. No new table or column backs it.

### Architectural conventions

- **Derive, do not store.** Three deliberate exceptions: FSRS state (path dependent), Elo item difficulty (cross-user), and `xp_ledger` (depends on ability and difficulty at time of attempt).
- **One date-bucketing implementation.** `localDayKey()`. Never write a second.
- **One reduced-motion check.** `prefersReducedMotion()` from `motionPrefs.ts`. Never write a second.
- **`evaluationToken` is never decoded on the client.** Signed server authorization material, passed through opaquely. `band` and `xpAwarded` are top-level response fields for display.
- **Generated Zod schemas are non-strict.** Adding response fields is safe for older clients.
- **New API response fields are always optional**, for Expo back-compat with installed builds.
- **No em dashes in any output.**

---

## 4. API server

`artifacts/api-server/src/`

| File | Contains |
|---|---|
| `routes/openai.ts` | `POST /openai/pronunciation`. Line 595 latency guard, 969 LLM `passed` fallback, 993 band derivation |
| `routes/learning.ts` | `POST /attempts`, `GET /review/phrases`, `GET /progress/summary` (1273-1326), `GET /categories`, `POST /game-sessions`, `/attempts/recent` |
| `routes/games.ts` | Daily quiz, script trace, `computeXp`, `computeQuizStreak` |
| `lib/progressMetrics.ts` | `computeProgressMetrics`, `buildPhraseStats`, `computeStreakDays`, `computeDailyQuizStreak`, `localDayKey`, `previousDayKey` |
| `lib/pronunciationGuards.ts` | `applyScoreGuards`, `normalizeLatin`, `normalizeNative`, `simToScore`. Lines 230/245/274 `passed >= 80`, 266 similarity guard |
| `lib/fsrsScheduler.ts` | `scoreAndBandToRating`, `applyFsrsRating`, `rowToCard` |
| `lib/xpEngine.ts` | XP math, `readLedgerXp` |
| `lib/evaluationToken.ts` | `EvaluationClaims`, `signEvaluation`. Line 116 |
| `lib/backfillScoringV2.ts` | Idempotent startup backfill. Line 306 gate throw. `SCORING_V2_GATE_OVERRIDE=1` bypasses |

`index.ts` runs `runBackfillScoringV2()` after content seed, before `app.listen`.

### Pronunciation pipeline (do not modify)

Whisper `speechToText` → retry at high quality if transcript empty or similarity <= 0.40 → fast path if phonetic similarity >= 0.93 using `simToScore` (0.90-1.00 maps to 80-100) → otherwise LLM rubric via `PRONUNCIATION_RUBRIC_PROMPT` → `applyScoreGuards`.

Guards include normalization, a wrong-phrase cap at 40 when a sibling phrase (up to 400 in the same language) beats the target at >= 0.80 similarity, and a Levenshtein floor/cap.

### normalizeNative

Strips ZWJ/ZWNJ, NFC normalizes, removes Devanagari nasal-plus-virama `[\u0919\u091E\u0923\u0928\u092E]\u094D`, drops anusvara and chandrabindu, strips non-letters, lowercases.

Known tradeoff: nasalized and non-nasalized forms collapse, so `हंस` and `हस` normalize identically. Accepted for a fuzzy pronunciation layer.

Devanagari only. Other scripts are #776, gated on native speaker review.

---

## 5. Web app (`artifacts/gujarati-coach`)

| Path | Notes |
|---|---|
| `src/pages/practice.tsx` | Line 40 band color comment, ~153 recorder hook use, 508 token passthrough, 512 optimistic todayXp, 846 mascot pose, 880 XpCounter session, ~780 session summary when `state === "done"`, 1001 mascot idle |
| `src/pages/home.tsx` | `StatCell` in header, general streak with lucide `Flame` icon |
| `src/pages/chat.tsx` | ~89 recorder hook use |
| `src/pages/account.tsx` | Timezone input in Learning section. Lines 868/881 are a pre-existing voice-preview player |
| `src/pages/subscription.tsx` | `DetailRow` at line 655, local, not exported |
| `src/pages/friends.tsx` | Own inline EmptyState at line 702 |
| `src/components/mascot.tsx` | Five static PNGs, `<motion.img>`, framer-motion, `useIdleTimer` funny variants after 10s |
| `src/components/ui/confetti.tsx` | Hand-rolled framer-motion. 70 shape pieces, 40 in glyph mode |
| `src/components/ui/badge.tsx` | `Badge`, cva |
| `src/components/ui/band-pill.tsx` | `BandPill` (Task 2) |
| `src/components/ui/empty-state.tsx` | `EmptyState` (Task 2) |
| `src/components/ui/count-up.tsx` | `CountUp` (Spec 1 v3) |
| `src/components/XpCounter.tsx` | (Spec 1a) |
| `src/components/XpArc.tsx` | (Spec 1 v3) |
| `src/components/layout/bottom-nav.tsx` | Line 25 XpCounter chrome. Below `lg`. NOT on practice |
| `src/components/layout/desktop-nav.tsx` | Line 77 XpCounter chrome. `lg` and above, via `AppShell`, so IS on practice |
| `src/lib/motion.tsx` | `SoundWavePulse` (~209-265), a time-based 6-bar loop, NOT audio-driven. `funnyIdleVariants(reduceMotion)` |
| `src/lib/sound.ts` | `playCue` (Spec 1 v3). Cues under `public/sounds/cues/` |
| `src/lib/scriptGlyphs.ts` | `glyphsForLanguage`, sourced from Script Trace chapter data (Spec 1 v3) |
| `src/lib/soundPref.ts` | (Spec 1a) |
| `src/lib/motionPrefs.ts` | `prefersReducedMotion()` (Spec 1 v3) |

**Unresolved:** one inventory reported `src/pages/review.tsx` exists but does not call the eval endpoint. A later one reported the web app has no review screen. Resolve before writing any spec touching web review.

---

## 6. Mobile app (`artifacts/bolo-mobile`)

Expo, expo-router. `app/(app)/_layout.tsx` sets `headerShown: false` for Stack screens. Practice and review are Stack screens **outside** the `(tabs)` group, so both are full-screen with no tab bar and no system header.

| Path | Notes |
|---|---|
| `app/(app)/(tabs)/_layout.tsx` | Five tabs: Home, Games, Bolo, Progress, Profile |
| `app/(app)/(tabs)/index.tsx` | Home. Line 306 XpCounter chrome, 543/556 score badges |
| `app/(app)/(tabs)/progress.tsx` | `Stat` component, general streak with Feather `zap` labeled "Day streak" |
| `app/(app)/(tabs)/chat.tsx` | ~487/529 recorder start/stop |
| `app/(app)/practice/[id].tsx` | Line 87 `bandColor`, ~123-130 record button pulse (time-based), 279 summary ring label, ~882-888 metering consumption, ~955/980 recorder start/stop, 998 haptics, 1014 token passthrough, 1016 optimistic todayXp, 1082 setResult, 1277 session summary when `phase === "done"`, 1294 mascot pose, 1437 title ternary, 1464 result icon, 1607 `PracticeHeader`, 1643 XpCounter session |
| `app/(app)/review.tsx` | Line 244 `ReviewHeader`, 257 XpCounter session, ~731/751 recorder start/stop, 764 token passthrough, 769 optimistic, 784 setResult, 842/852 header render, 924 session summary, 1060 title ternary |
| `app/(app)/account/index.tsx` | `NavRow` 651, `StepperRow` 679, both local. Timezone row with modal |
| `components/Mascot.tsx` | Five PNGs, RN `Image` in Reanimated `Animated.View`. All idle and funny effects early-return on `useReducedMotion()` |
| `components/TalkingMascot.tsx` | Chat wrapper, listening/talking/thinking overlays |
| `components/Confetti.tsx` | Hand-rolled Reanimated. 44 shape pieces, 25 in glyph mode |
| `components/BandPill.tsx`, `EmptyState.tsx`, `XpCounter.tsx` | (Task 2, Spec 1a) |
| `components/XpArc.tsx`, `CountUpText.tsx` | (Spec 1 v3) |
| `components/TipCard.tsx` | Rotates India fun facts during processing. No props |
| `components/BadgeUnlock.tsx`, `BadgesGallery` | Achievement badges. Also fire confetti |
| `lib/ui.ts` | `scoreColor` lines 34-35 |
| `lib/audio.ts` | `RECORDING_PRESET` line 26 with `isMeteringEnabled: true`. `stopAndReadRecording`. Silence auto-stop ~35-53 |
| `lib/settings.ts` | `bolo.silentMode` in AsyncStorage |
| `lib/sound.ts` | `playCue`, `CUE_SOURCES` static require registry, currently empty (Spec 1 v3) |
| `lib/scriptGlyphs.ts`, `lib/soundPref.ts`, `lib/motionPrefs.ts` | (Spec 1 v3, 1a) |

**Mascot poses (both platforms, same five PNGs):** `wave`, `cheer`, `thumbsup`, `thinking`, `tryagain`.

**Silent mode** (`bolo.silentMode`) skips the coach's auto-played voice for each new phrase. Device-only, not synced. Does not mute feedback and does not affect recording.

---

## 7. Assets, libraries, and audio

- **Animation:** framer-motion on web, react-native-reanimated on mobile. No Rive, no Lottie, no canvas-confetti.
- **Mascot:** five static PNGs. No Rive state machine exists.
- **Confetti:** hand-rolled on both platforms, not a library.
- **Sound cues:** a `playCue` layer exists on both platforms (Spec 1 v3) but **no cue audio files exist**. Mobile `CUE_SOURCES` is empty; web 404s silently. Cues are silent no-ops until assets ship.
- **Coach TTS playback already existed** and is separate from the cue layer.

### Audio recording

**Web:** custom `useVoiceRecorder` hook at `lib/integrations-openai-ai-react/src/audio/useVoiceRecorder.ts`. Uses `MediaRecorder` and holds the `getUserMedia` `MediaStream` in `streamRef` with its own `AudioContext` and `AnalyserNode` computing RMS levels. Since Spec D2 the analyser is **always** created in `startRecording` (silence detection reuses it via `readRms()`), and the hook exposes `getAmplitude()` — a pull-based 0..1 value (RMS x5, clamped). Callers sample it themselves (rAF loop); it never triggers React renders.

**Mobile:** `expo-audio`. `recorder.record()` and `stopAndReadRecording(recorder)`. Metering is enabled via `isMeteringEnabled: true` in `RECORDING_PRESET`. `useAudioRecorderState(recorder, 60)` (60ms in practice and review since Spec D2; was 250ms) exposes a **dBFS** `metering` value, also used for adaptive silence auto-stop — auto-stop timing is wall-clock based, so the faster poll does not change its behaviour.

> Metering gotchas: the value is dBFS (logarithmic, mostly negative), so map roughly -50..0 onto 0..1 with clamping — use `meteringToAmplitude()` in `lib/audio.ts`, never a second inline mapping. A linear read looks dead until someone shouts.

**Visualisation (Spec D2):** web `SoundWavePulse` (`src/lib/motion.tsx`) accepts an optional `amplitude?: MotionValue<number>`; with the prop it renders audio-driven bars, without it it keeps the old time-based loop. Mobile has `components/Waveform.tsx` (7 Reanimated bars off a `SharedValue`, reduced-motion fallback = 5-dot static level meter). Both practice/review screens scale the mascot 1.0-1.08 with live amplitude (MotionValue on web, SharedValue on mobile — never React state) and show a "We can't hear you" hint after >1.5s of near-silence. Reduced motion disables the mascot scale and swaps the waveform for the static meter (`prefersReducedMotion()` at the sampling sites).

---

## 8. Known debt and open items

| Item | Notes |
|---|---|
| No cue audio files | `playCue` exists on both platforms with nothing to play. Source real tabla or dholak samples; do not synthesize |
| `latencyMs` unenforced | Neither client sends it. Spec 0 rule 47 is a no-op. #777 has nothing to measure |
| `todayXp` in-memory filter | `learning.ts` pulls the full ledger and filters in application code. Needs a SQL date-range filter |
| #782 pre-existing API test failures | 15: progress/summary (xp=0), analytics x2, entitlementsGating, attempts, review ordering x3, warmGreetings x2, system-prompt x2, TTS cache/fallback x3 (all reproduce on a clean tree) |
| `phrases.register` unpopulated | Spec D2 added the nullable column + `(language_code, register)` index; no authoring or filtering yet — all rows are NULL |
| ~~Stale drizzle meta snapshots~~ | **Resolved with 0021.** Task 1's ad-hoc DDL left `meta/` lagging the committed migrations, so `generate` re-emitted applied DDL. The 0021 repair rewrote the terminal snapshot to the full current schema; `generate` now emits "No schema changes", and `check-drift` runs a trial generate on every pass so regression cannot land silently |
| Web pre-existing test failures | `account.test.tsx` x6, `chat-error-banner.test.tsx` x2 |
| `daily_goal` default of 10 | Met by a single nailed attempt. Miscalibrated. Needs data before changing |
| FSRS is mobile-only on the client | Review queue and `/review/phrases` have no web surface |
| #776 | Conjunct-nasal normalization for scripts other than Devanagari. Gated on native speaker review |
| Web `EmptyState` | May be unused while `friends.tsx` has its own inline version |
| `CountUpText` type cast | Needs `as unknown as Partial<TextInputProps>`; the prop is valid natively but absent from public TS types |
| Duplicate `useReducedMotion` imports | In both mobile practice screens. Harmless, typecheck-clean |
| Web review screen | See the contradiction noted in section 5 |

---

## 9. Working rules for the agent

Paste this block into every spec.

1. Do not run test suites automatically after each edit. Make the full set of changes, run once, report all failures together, fix in one pass.
2. Verify every edit by reading the file back. Edits have silently failed to persist in this codebase.
3. Do not batch string injection across files. Read, edit, verify, move on. Whitespace differences cause silent misses.
4. Treat a failing test as a question, not an answer. Check whether the test or the code is right before changing either. Do not change a test to match the code without confirming the code matches the spec.
5. Never hand-edit generated or dist files. Change `openapi.yaml` and regenerate.
6. New API response fields are optional, always, for mobile back-compat.
7. Never decode `evaluationToken` on the client.
8. Never introduce a second date-bucketing or reduced-motion implementation.
9. Zero output from typecheck means zero errors. Do not re-run to confirm.
10. Mobile count-up chips use the ReText pattern (animated `TextInput`, `editable={false}`). Tests must assert via `accessibilityLabel` or `getByLabelText`, never `getByText`.
11. If a named file, component, or line does not match this document, STOP and ask. Then report the discrepancy so this document can be corrected.

---

## 10. Spec status

| Spec | State |
|---|---|
| Spec 0 v2, Task 1 (backend + backfill) | Built |
| Spec 0 v2, Task 2 (band UI + score deprecation) | Built |
| Spec 1a v3 (XP counter + sound preference) | Built |
| Spec 1 v3 (motion engine) | Built |
| Spec D2 v2 (speaking system) | Built (register column, speaking streak, live waveforms + mascot amplitude on web and mobile) |
| Spec D1 (map and journey) | Not written. Blocked on whether a lesson map screen exists |
| Spec D3 (Rishta Tree, real-world quests) | Not written |
| Spec B (onboarding) | Not written |
| Spec E (copy and voice) | Not written |
| Spec F (progress and accomplishment) | Not written |
| Spec G (social) | Not written |
