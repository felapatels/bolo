# BOLO Codebase Facts

Living reference. Paste the relevant sections at the top of every spec so the agent does not re-derive them.

Last updated after: Spec 0 Task 1, Spec 0 Task 2, Spec 1a, Spec 1 v3, the band-derivation follow-ups, Spec D2 Step 0, Task 787 (self-managed Clerk migration), and the observability pass (Sentry + PostHog, July 28, 2026; DSNs and keys wired into the development environment the same day).

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
| `artifacts/bolo-launch-video` | Marketing asset: programmatic launch video (React/Framer Motion, video-js scaffold). Not product code; nothing in the main apps depends on it |
| `artifacts/bolo-social-clips` | Marketing asset: short social clips, same video-js scaffold. Not product code; no main-app dependencies |
| `artifacts/mockup-sandbox` | Internal design tooling: vite preview server for canvas component mockups. Never shipped; no main-app dependencies |
| `lib/db/src` | Drizzle schema |
| `lib/db/drizzle/` | Migrations and `_journal.json` |
| `lib/api-spec/openapi.yaml` | Schema source of truth |
| `lib/api-client-react/src/generated/api.schemas.ts` | Generated client types |
| `lib/api-zod/src/generated/types/` | Generated Zod types |
| `lib/integrations-openai-ai-react/src/audio/` | Web audio recording hook |

**Stack:** Postgres, Drizzle ORM with drizzle-kit migrate, Clerk auth (self-managed; dev instance `free-bedbug-6.clerk.accounts.dev`, production instance on `clerk.bolo-india.app` with CNAME DNS verified and Apple + Google SSO custom credentials), OpenAI direct key (Whisper STT, chat, TTS), ts-fsrs v5, expo-audio on mobile.

**Clerk key locations (dev and prod never share instances):** dev = workspace secrets `CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` (pk_test/sk_test, free-bedbug-6). Production = Replit production environment vars `CLERK_PUBLISHABLE_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` (both `pk_live_Y2xlcmsuYm9sby1pbmRpYS5hcHAk`, set) plus `CLERK_SECRET_KEY` sk_live as a deployment secret (owner sets it in the Publishing tool's deployment settings, then republishes). Mobile = EAS production env `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (same pk_live, set). No proxy in production: CNAME custom domain and Clerk proxy are mutually exclusive; `VITE_CLERK_PROXY_URL` stays unset and the stale `EXPO_PUBLIC_CLERK_PROXY_URL` was deleted from EAS. `clerkProxyMiddleware` remains mounted but dormant (nothing routes to `/api/__clerk` when no client sets a proxyUrl). Note `publishableKeyFromHost` returns a dev fallback key when one is present, so the production env must carry live keys or the site would run against the dev instance.

**Never hand-edit** anything under `generated/` or `dist/`. Change `openapi.yaml` and regenerate.

---

## 2. Database schema

### Pre-existing

**users:** `id` text PK, `timezone` text nullable (IANA), `daily_goal` int default 50 (was 10 until migration 0025, July 28, 2026; existing rows untouched), `tz_grace_used_on` date nullable

**attempts:** `id` serial PK, `user_id`, `language_code`, `phrase_id` nullable, `native_script`, `romanized`, `english`, `transcript`, `score` int 0-100, `passed` bool, `feedback`, `created_at`, plus added in Task 1: `latency_ms`, `audio_duration_ms`, `band`, `fsrs_rating`, `theta_delta`, `beta_delta`, `xp_awarded`, `flags` jsonb

**phrases** (`lib/db/src/schema/phrases.ts`): `language_code`, `category_id`, `difficulty` int, `premium` bool, `stage` text (`phrase` or `sentence`), `hint`, `sort_order`, plus Task 1 additions `accepted_answers` jsonb, `elo_difficulty`, `elo_difficulty_rd`, `exposure_count`, plus Spec D2's `register` text nullable (`formal` / `colloquial` / `code_switched`, migration `0021_spec_d2_register.sql`) with index `phrases_language_register_idx` on `(language_code, register)`. All rows currently NULL; no authoring or filtering yet.

**game_sessions:** `id`, `user_id`, `language_code`, `game`, `correct_count`, `total_count`, `xp_awarded`, `context`, `created_at`. Game values: `word-match`, `speed-round`, `listen-and-pick`, `phrase-builder`, `daily-quiz`, `script-trace`

**daily_quiz_completions:** `id`, `user_id`, `language_code`, `quiz_date` date, `score` 0-5, `xp_awarded`, `completed_at`

**script_trace_progress:** `id`, `user_id`, `chapter`, `character_id`, `passed`, `best_score`, `attempt_count`, `updated_at`

**badges:** `id`, `user_id`, `language_code`, `badge_key`, `earned_at`

**languages:** `code` text PK, `name`, `native_name`, `script`, `font_family`, `rtl` bool, `sort_order` int, plus `speech_capability` text default `'supported'` (migration `0022_speech_capability.sql`; see section 4 "Speech capability")

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

### Speech capability + script-mismatch guard (July 2026)

- `languages.speech_capability` (`supported` | `degraded` | `unsupported`, default `supported`, migration 0022) is server-authoritative, seeded from probe verdicts in `seedData.ts`, exposed as optional `speechCapability` on `GET /languages`. Verdicts: ks + sat degraded, mni + brx unsupported, rest supported.
- **Probe limitation:** verdicts come from `artifacts/api-server/scripts/probeSttLanguages.ts` using TTS-generated audio, so `supported` means "best case with clean synthetic speech". Re-probing with real human recordings is pending and likely infeasible in this environment; if human audio shows a language materially worse, downgrade its seed value.
- `/openai/pronunciation` short-circuits for `unsupported` languages BEFORE any STT call: returns band `nocatch`, xp 0, listen-record-compare copy. Clients never send evaluations for these languages, this is the backstop.
- `applyScoreGuards` guard ladder changed: the old `cross-script-cap` (cap 85) is replaced by universal `script-mismatch-nocatch` — a transcript in the wrong Unicode script (or a Latin transcript with romanized sim < 0.45 against a non-Latin target) proves the recognizer failed, and resolves to band `nocatch` (score 0, no XP, no streak break) in ALL languages. Latin transcripts with sim >= 0.45 stay scoreable; wrong-phrase-cap takes precedence.
- The STT language-code-rejected retry in `lib/integrations-openai-ai-server` is unchanged but now logs `[stt] language_code_rejected_retrying_without_hint` with the language code.
- `POST /attempts` treats band `nocatch` as a system miss end to end: the attempt row is inserted for analytics, but Elo theta is untouched (`thetaDelta` 0, no ability upsert), no FSRS rating/memory write, and no phrase exposure bump. This is the server-authoritative safeguard; clients in unsupported-language compare mode never submit attempts at all.
- Mobile auth offers Sign in with Apple (`components/AppleAuthButton.tsx`, Clerk `oauth_apple` via `useSSO`, same flow shape as `GoogleAuthButton.tsx`) on both `(auth)/sign-in.tsx` and `(auth)/sign-up.tsx`. iOS-only render (`Platform.OS !== 'ios'` returns null) — App Review 4.8 requirement, not needed on Android. Apple may supply a `privaterelay.appleid.com` email and supplies the user's name only on FIRST authorization; all name usages fall back (`user?.firstName ?? 'friend'` etc.), never assume email is the user's real mailbox. Web has no Apple button yet (intentional).
- Clients: web `practice.tsx` (also serves review mode) and mobile `practice/[id].tsx` + `review.tsx` read the active language's `speechCapability`. Degraded shows a one-time dismissible notice (key `bolo.approxNoticeSeen.<code>`, localStorage/AsyncStorage). Unsupported switches to a listen-record-compare stage (play target, hear yourself, no evaluation request, no band/XP).

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

**Fonts (self-hosted since the fonts pass, July 28, 2026):** `src/fonts/fonts.css` declares all `@font-face` rules (Inter + 13 Noto script families incl. Ol Chiki and Meetei Mayek) from local woff2 subsets in `src/fonts/` (~2.0 MB total, `font-display: swap`, OFL.txt alongside). `index.css` imports it; there are **no** runtime Google Fonts CDN requests (index.html preconnect/link tags removed too). Regenerate via the css2-API fetch approach if families change.

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

**Native-script fonts** (`constants/fonts.ts`): all 13 Noto script families are bundled via `@expo-google-fonts/*` packages — including Ol Chiki and Meetei Mayek (both bundled since the app's creation; an earlier audit note claiming they were missing was wrong). `SCRIPT_FONTS` maps backend `fontFamily` → loaded font. Meetei Mayek is mapped on **Android only** (Platform-gated since the fonts pass, July 28, 2026): on iOS the Expo-loaded font bypasses the OpenType shaper and mis-renders combining vowel marks, while iOS ships its own Noto Sans Meetei Mayek system fallback (since iOS 10) with correct shaping. Do not map it on iOS.

**Mascot poses (both platforms, same five PNGs):** `wave`, `cheer`, `thumbsup`, `thinking`, `tryagain`.

**Silent mode** (`bolo.silentMode`) skips the coach's auto-played voice for each new phrase. Device-only, not synced. Does not mute feedback and does not affect recording.

**Mobile auth (July 28, 2026 fix).** Factor set: **password, email code, and SSO (Apple/Google)**. Factor selection is driven by Clerk's sign-in response — after `signIn.password()`, `signIn.status` and `signIn.supportedFirstFactors` decide the next step (a `needs_first_factor` response offering `email_code` auto-falls-over to the emailed-code step; web sign-ups are passwordless, so this is their only mobile path). `app/(auth)/sign-in.tsx` also has an explicit "Email me a sign-in code instead" entry (`signIn.emailCode.sendCode`/`verifyCode`). Shared error policy lives in `lib/authErrors.ts`: every auth operation ends in navigation, a user-visible error, or a code step; expected user-input errors (wrong password/code) show but do not go to Sentry; everything else is Sentry-captured with `authContext` tag; a flow that stops at a non-complete status surfaces **the status and offered factor strategies in the user-visible copy and the Sentry event** (never a generic error). Never pass emails/passwords/codes/factor objects (they carry `safeIdentifier`) into these helpers — strategy strings only.

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

## 7a2. Email sending via Resend (July 28, 2026)

Two distinct Resend mechanisms coexist:

1. **Replit Resend connector** (`@replit/connectors-sdk`, no API key in app secrets) — used by friend invites (`artifacts/api-server/src/lib/inviteEmail.ts`) and family-plan invites (`artifacts/api-server/src/lib/familyInviteEmail.ts`). Both call `connectors.proxy("resend", "/emails", ...)` — the proxy must be addressed by **connector name** (`"resend"`), not the `conn_…` connection id (the id form stopped resolving and returns 404 "no connection found"). The connector's key is send-only (GET `/emails` returns 401 `restricted_api_key`), so delivery status cannot be queried through it.
2. **Raw `resend` npm SDK with `RESEND_API_KEY`** — used by ElevenLabs quota alerts (`quotaAlertEmail.ts`; sender `ELEVENLABS_ALERT_FROM` ?? `Bolo! <onboarding@resend.dev>`) and the contact form (`routes/contact.ts` → `resendClient.ts`; sender `RESEND_FROM` ?? `noreply@boloapp.in`, which is NOT a Resend-verified domain and 403s — see debt table).

**Invite CTA + template (July 28, 2026):** CTA destination is `INVITE_CTA_URL` (dev+prod env = `https://bolo-india.app`; code default is the same web URL — flip the env var to the App Store link at iOS launch, no code change). Both invite templates carry a properly hidden preheader div and a hosted mascot header image (`https://bolo-india.app/mascot/mascot-wave.png` — hosted, not base64, because Gmail strips data URIs). Family invites' CTA remains the personal join link.

**Contact-form sender:** `RESEND_FROM` (dev+prod env = `hello@bolo-india.app`), no hardcoded fallback — `fromAddress()` throws if unset, caught by the best-effort send path (logs + `email_sent=false`).

**Invite sender address:** `INVITE_FROM_EMAIL` (server-side env var, both dev and production; no `VITE_*` involvement). There is deliberately **no hardcoded fallback** — a missing value throws at send time. Dev and production Replit env vars are set to `hello@bolo-india.app` (the bolo-india.app domain is Resend-verified: DKIM/MX/SPF green). Because it is a server-side env var (not a deployment secret and not a build-time `VITE_*` value), the production env var is read at runtime by the deployed api-server; the workspace-secrets-baked-into-Vite trap in §8 does not apply.

## 7b. Observability (Sentry + PostHog, July 28, 2026)

**Sentry (error reporting, all three apps).** Initialized ONLY when the DSN env var is present; without it every call is a no-op. Each init scrubs PII in `beforeSend`/`beforeBreadcrumb`: emails masked by regex, and keys like `transcript`, `audioBase64`, `nativeScript`, `romanized`, `english`, `email*` redacted. `tracesSampleRate: 0` (errors only), `sendDefaultPii: false`, Sentry user = id only.

| App | Init file | DSN env var | Notes |
|---|---|---|---|
| api-server | `src/lib/sentry.ts` (imported FIRST in `index.ts`) | `SENTRY_DSN` | `Sentry.setupExpressErrorHandler(app)` + a new global express error handler in `app.ts` (500 JSON, logs via pino). `@sentry/node` is in build.mjs `external`. Dev-only test route `GET /api/__sentry-test` (throws; absent when NODE_ENV=production) |
| gujarati-coach | `src/lib/sentry.ts`, called from `main.tsx` | `VITE_SENTRY_DSN` | Dev-only verification: open with `?sentry_test=1`. `setSentryUser` synced from Clerk in `App.tsx` `AnalyticsIdentitySync` |
| bolo-mobile | `lib/sentry.ts`, called at module load in `app/_layout.tsx`; root export is `Sentry.wrap(RootLayout)` | `EXPO_PUBLIC_SENTRY_DSN` | app.json plugin is `["@sentry/react-native/expo", { organization: "lark-enterprises-llc", project: "bolo-mobile" }]`; source map upload at EAS build still needs `SENTRY_AUTH_TOKEN` as an EAS secret (see debt). Dev-only verification: `EXPO_PUBLIC_SENTRY_TEST=1` |

**PostHog (product analytics, both clients).** Event names live in ONE constants file per app — `src/lib/analyticsEvents.ts` (web) and `lib/analyticsEvents.ts` (mobile) — the deliberate, complete set: `sign_up_completed`, `language_selected`, `first_practice_session_started`, `first_phrase_attempted`, `session_completed`, `paywall_viewed`, `purchase_completed`. Wrappers in `src/lib/analytics.ts` / `lib/analytics.ts` (`track`, `trackOnce` — once per browser/install via localStorage/AsyncStorage `bolo.analytics.once.*`, `identifyUser` — Clerk user id only). Autocapture, pageviews, and session recording OFF. Init only when `VITE_POSTHOG_KEY` / `EXPO_PUBLIC_POSTHOG_KEY` present (`VITE_POSTHOG_HOST`/`EXPO_PUBLIC_POSTHOG_HOST` optional, default US cloud). **Payload rule: no phrase content, transcripts, audio, or email — user id and language code only** (plus numeric counts).

Hook sites: web `App.tsx` (sign-up via `user.createdAt` < 2 min, also identity sync), `account.tsx` `handleChangeLanguage`, `practice.tsx` (session start effect, evaluate call, summary transition), `upgrade.tsx` (`Paywall` mount, `?checkout=success`). Mobile `app/_layout.tsx` (`AnalyticsIdentitySync`, same createdAt rule — covers email/Google/Apple without touching auth screens), `language.tsx` `choose`, `practice/[id].tsx` (list-loaded effect, evaluate call, done transition), `paywall.tsx` (mount, `runPurchase` success).

**Correction to section 5:** web practice's summary state literal is `"summary"` (line ~791 `setState("summary")`), not `"done"` as previously written; `"done"` is mobile-only (`phase === 'done'`).

---

## 7c. D1a Slice 1 — lesson grouping data layer (July 28, 2026)

- NEW table `lesson_groups` (lib/db/src/schema/lessonGroups.ts): the journey-map "station" unit — ordered partitions of a (language, category)'s phrases into ~10-phrase chunks. Unique (language_code, category_id, position) — NOT the spec's (category_id, position), because categories are shared across languages. `title` null pending fare-zone/station naming.
- NEW nullable columns `phrases.lesson_group_id` (FK) and `phrases.lesson_group_position` (1-based within group).
- Migration: `0023_lesson_groups` (drizzle generated it as a duplicate `0022_` prefix — artifact of the healed journal; file + journal tag renamed to 0023 by hand, DDL untouched).
- Grouping backfill: `artifacts/api-server/src/scripts/backfillLessonGroups.ts`, run at startup after scoring v2 (advisory lock 727_003). Idempotent: skips any (language, category) that already has groups. Ordering tiebreak inside a stage block: `(sort_order, id)`. Stage blocks (phrase, then sentence) are never interleaved within a group; positions number phrase-stage groups first. Tail chunks of ≤4 merge into the previous group (sizes mostly 8-13; a stage block of ≤7 with no previous group stays small — observed mins 5-7 in gu/mni/brx).
- Result on migration day: 620 groups over 132 (language, category) pairs, 22 languages, median size 10, ZERO unassigned phrases; concatenation property (group order reproduces (sort_order, id) order per stage) verified for gu/hi/ta.
- NEW endpoints (both additive; openapi.yaml + regenerated clients): `GET /categories/{id}/lesson-groups/{lang}` → `{ lessonGroups: [{id, position, title, phraseCount, attemptedCount, masteredCount}], unassignedCount }` (progress derived at read time from attempts; no stored counters); `GET /lesson-groups/{id}/phrases` → same per-phrase shape as the category listing (Phrase schema), ordered by lesson_group_position, premium-filtered identically. Existing endpoints untouched.
- The existing `lessons` table is a per-(language, category) AI-content-cache record — a MISNOMER kept as-is (renaming is non-additive; deferred cleanup, see debt). The journey-map grouping is `lesson_groups`.
- Tests: `learning.lesson-groups.test.ts` (endpoints + partitionIds unit).
- Post-review hardening: migration `0024_phrase_group_position_unique` adds a UNIQUE index on `phrases (lesson_group_id, lesson_group_position)` (NULLs never conflict), guarding the concatenation invariant against future writers. The backfill runs strictly BEFORE the server listens, so the replenisher cannot race it in practice; a cross-scope composite FK (group and phrase agreeing on language/category) and a race regression test are deferred to Slice 2 (see debt).

### D1a Slice 2, lesson group unlock model (July 28, 2026)

- NEW tables (migration `0026_slice2_unlock_model`, generated as duplicate `0025_` prefix and renamed by hand pre-application; DDL reordered so the composite FK follows its target unique constraint): `lesson_group_progress` (composite PK user_id + lesson_group_id; only `tested_out` is persisted today, all other statuses are derived at read time) and `lesson_group_testouts` (append-only submission log: user, group, passed, created_at; keeps history for future rate limiting).
- Composite-FK scope hardening: `lesson_groups` gains UNIQUE (id, language_code, category_id); `phrases` gains composite FK (lesson_group_id, language_code, category_id) referencing it, MATCH SIMPLE so NULL-group rows stay legal. A phrase can no longer point at a group in a different language or category. This closes the Slice 1 "scope not DB-enforced" debt row.
- Unlock derivation (`artifacts/api-server/src/lib/lessonGroupUnlock.ts`, pure): statuses are locked / unlocked / in_progress / completed / tested_out. First group always unlocked; a group unlocks when the previous one is completed or tested_out. Completed = at least 80% of the group's phrases at bestScore >= 80 (the attempts-based mastery signal; FSRS remains review-scheduler only). Completed takes precedence over tested_out. Monotonicity is enforced by a LATCH (post-review fix): replenishment grows a group's denominator with fresh phrases, which would dilute a completed ratio below the threshold, so the lesson-groups GET persists a `completed` progress row the first time completion is observed and the derivation honors persisted completed/tested_out rows regardless of the live ratio. Nothing ever re-locks.
- Entitlement precedence: all deny* gates run BEFORE unlock computation; a gated caller gets the 402 payload and never sees unlock state.
- Test-out endpoints (additive, in openapi.yaml + regenerated clients): `GET /lesson-groups/{id}/test-out` returns a fresh random sample (5 phrases, or all accessible if fewer) plus sampleSize and requiredCorrect = ceil(0.8 x n); `POST` validates server-signed evaluationTokens (user match, phrase-in-group, distinct, exact sample count), passes on requiredCorrect attempts at band `nailed`, records every submission, and upserts `tested_out` progress on pass. Retryable with a new sample. If every phrase in a group is premium-filtered away, the assessment itself 402s (feature_locked).
- `GET /categories/{id}/lesson-groups/{lang}` now returns an optional additive `status` per group.
- Replenisher insert-time assignment (strategy A, cap 14): new phrase-stage rows append to the LAST phrase-stage group while it is under 14 phrases; overflow creates a new phrase group at (last phrase position + 1) and shifts sentence-stage groups up by one, all in a single transaction (two-phase sign-flip position update to dodge the unique index). Retries once on unique violation, then falls back to the legacy NULL-group insert (surfaces via unassignedCount rather than failing the request). Progress keys on group id, never position, so shifts cannot orphan progress.
- Tests: `learning.lesson-groups-unlock.test.ts` (derivation units, endpoint statuses, test-out pass/fail/forgery/402 precedence, replenisher append + overflow shift + concurrent-writer race). Replenish test cleanups now delete `lesson_groups` (and the new suite deletes `lesson_generations`) because the replenisher creates groups at insert time.

## 8. Known debt and open items

| Item | Notes |
|---|---|
| Contact-form sender likely 403s (July 28, 2026) | `resendClient.ts` defaults `RESEND_FROM` to `noreply@boloapp.in`, which is NOT verified with Resend (an in-code comment in quotaAlertEmail.ts records the 403). The contact form swallows the failure (`email_sent=false`) so it fails silently. Reported during the invite-sender migration; deliberately NOT changed (out of scope). Fix: set `RESEND_FROM` to a bolo-india.app address or migrate to the connector |
| ~~Clerk production keys stale in EAS~~ | **Resolved (July 28, 2026).** Production Clerk instance `clerk.bolo-india.app` is live (DNS verified, Apple + Google SSO). EAS production env carries the correct `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` pk_live and the stale `EXPO_PUBLIC_CLERK_PROXY_URL` was removed. Remaining owner step: set `CLERK_SECRET_KEY` sk_live in the deployment settings of the Publishing tool and republish. See "Clerk key locations" in section 1 |
| Observability keys | Development AND production env vars now set (`SENTRY_DSN`, `VITE_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN` (dev), `VITE_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_KEY` (dev); Sentry org o4511813816352768 / lark-enterprises-llc, PostHog US cloud). Web also carries committed production fallbacks (public write-only DSN/phc values) gated on `import.meta.env.PROD` because the deployment build does not reliably see production env vars (see trap below). Still manual: EAS production env `EXPO_PUBLIC_SENTRY_DSN` + `EXPO_PUBLIC_POSTHOG_KEY`, and `SENTRY_AUTH_TOKEN` as an EAS secret for source map upload. Dashboard-side arrival of the dev test events is unverified (no auth token available to the agent); confirm in Sentry/PostHog UIs |
| Stale dev-Clerk cookies poisoned prod auth (July 28, 2026) | Browsers that visited bolo-india.app during the dev-keyed window carry dev-instance JS cookies on the apex; they ride to clerk.bolo-india.app and break OAuth (err_code=authorization_invalid) and email sign-up silently. Server, DNS, Google creds, and instance config were all healthy. Remedied by a detect-then-purge cleanup in gujarati-coach src/lib/clerkCookieCleanup.ts (called from main.tsx before Clerk init). v2 (July 28, 2026): purges ONLY when a dev-era distinguisher cookie is visible (__client or __clerk_db_jwt* on the apex; prod's __client is HttpOnly on clerk.<domain> so invisible); marker is a first-party cookie (bolo_clerk_dev_cleanup=v2, Domain=.bolo-india.app, Secure), written and read back BEFORE any delete as a write-probe — the v1 localStorage marker silently failed under privacy extensions and looped users out after every sign-in. Temporary: remove after the affected window ages out. RESOLVED July 28, 2026: user-verified in an extension-laden browser; one pre-fix poisoned browser needed a single manual cookie clear (state unreachable post-fix); no real-user impact remains |
| TRAP: deployment build bakes workspace secrets into Vite `VITE_*` values | Observed July 28, 2026: production env vars held pk_live but the published bundle carried the workspace pk_test secret, so the Replit deployment build reads workspace secrets, not production env vars, at build time. Clerk's `publishableKeyFromHost` returns a DEV fallback unconditionally, so bolo-india.app served the dev Clerk instance. Fixed client-side: App.tsx derives pk_live from the hostname at runtime on bolo-india.app / www; sentry.ts and analytics.ts carry committed PROD fallbacks. Any future build-time `VITE_*` value must NOT rely on production env vars alone |
| No cue audio files | `playCue` exists on both platforms with nothing to play. Source real tabla or dholak samples; do not synthesize |
| `latencyMs` unenforced | Neither client sends it. Spec 0 rule 47 is a no-op. #777 has nothing to measure |
| `todayXp` in-memory filter | `learning.ts` pulls the full ledger and filters in application code. Needs a SQL date-range filter |
| #782 pre-existing API test failures | 14: progress/summary x1, progress/analytics x2, entitlementsGating (suite-level) x1, review ordering x3, parrot system-prompt x2, TTS cache/fallback x3, warmGreetings x2 (all reproduce on a clean tree). The `attempts` test formerly counted in this row now passes. The GET /account defaults failure briefly counted here on July 28 2026 was a stale test expectation (dailyGoal 10 vs the migration-0025 column default 50), fixed in the test, not baseline. Provenance: this doc said 15, an out-of-band tracker said 11, and July 2026 full-suite runs measured 14. Rule: this enumerated row is the single source of truth for the baseline — never track a bare count elsewhere |
| Truncated test-workflow logs | The `test` workflow's captured log keeps only the tail (~90 lines), which can cut most of the node:test failure summary and make a full-suite run look like it had only a handful of failures. Count failures only from a complete captured log (`pnpm run test > file 2>&1`), never from the truncated workflow preview |
| `phrases.register` unpopulated | Spec D2 added the nullable column + `(language_code, register)` index; no authoring or filtering yet — all rows are NULL |
| ~~Stale drizzle meta snapshots~~ | **Resolved with 0021.** Task 1's ad-hoc DDL left `meta/` lagging the committed migrations, so `generate` re-emitted applied DDL. The 0021 repair rewrote the terminal snapshot to the full current schema; `generate` now emits "No schema changes", and `check-drift` runs a trial generate on every pass so regression cannot land silently |
| Web pre-existing test failures | `account.test.tsx` x6, `chat-error-banner.test.tsx` x2 |
| ~~`daily_goal` default of 10~~ | **Resolved (July 28, 2026).** Migration `0025_daily_goal_default_50` set the column default to 50 for NEW users only; the 4 existing rows at 10 were deliberately left unchanged. Server-side missing-row fallback in learning.ts updated to 50; client display fallbacks (`?? 10` in home.tsx/XpCounter) are loading placeholders and were left as-is. No prior cleanup pass had changed this |
| FSRS is mobile-only on the client | Review queue and `/review/phrases` have no web surface |
| #776 | Conjunct-nasal normalization for scripts other than Devanagari. Gated on native speaker review |
| Web `EmptyState` | May be unused while `friends.tsx` has its own inline version |
| `CountUpText` type cast | Needs `as unknown as Partial<TextInputProps>`; the prop is valid natively but absent from public TS types |
| Duplicate `useReducedMotion` imports | In both mobile practice screens. Harmless, typecheck-clean |
| Web review screen | See the contradiction noted in section 5 |
| `lesson_groups.title` all NULL | Pending fare-zone/station naming (content work, per journey-map decision record `docs/BOLO-Journey-Map-Design-Decision.md`) |
| ~~Replenished phrases stay ungrouped~~ | **Resolved (July 28, 2026, Slice 2).** phraseReplenisher assigns groups at insert time (append to last phrase group under cap 14, else new group + sentence shift). Residual: the retry-then-fallback path can still insert NULL-group rows after two consecutive unique violations; observable via `unassignedCount`, self-heals on a later backfill |
| ~~Lesson-group scope not DB-enforced~~ | **Resolved (July 28, 2026, Slice 2).** Composite FK (lesson_group_id, language_code, category_id) on phrases references UNIQUE (id, language_code, category_id) on lesson_groups; race regression test added in `learning.lesson-groups-unlock.test.ts` |
| Test-out rate limiting | `lesson_group_testouts` logs every submission but nothing throttles retries yet; a determined user can brute-force samples. Add per-user-per-group cooldown when it matters |
| `lessons` table misnomer | It is a per-(language, category) content-cache record, not a lesson. Rename deferred as a future NON-additive cleanup |
| TRAP: dev-DB `drizzle-kit migrate` recorded 0023 without executing its DDL | July 28, 2026: migrate reported success and inserted the hash row, but `lesson_groups` did not exist; DDL applied by hand via psql afterwards. Fresh-DB full-chain (`db-migrations`) applies 0023 cleanly, so the anomaly is dev-DB-local. If a table is "missing" despite migrate success, check `to_regclass` before trusting the hash table |
| TRAP: Clerk expo one-shot `signIn.password()` is NOT complete-or-throw | `signIn.password()` (Clerk "future" hooks API; there is no separate `attemptFirstFactor`) can return without error at a non-complete status (`needs_first_factor` for passwordless accounts, `needs_second_factor`, etc.). Code that assumes error-or-complete swallows those states silently — this was the July 2026 production sign-in failure. Always branch on `signIn.status` + `supportedFirstFactors`, and surface unexpected statuses in the UI and Sentry (see §6 mobile auth) |
| TRAP: migration ghost-apply (general pattern) | drizzle migrate against the shared dev DB can record a migration's hash row in `__drizzle_migrations` WITHOUT executing its DDL. Detection: `SELECT to_regclass('public.<table>')` (or check the specific column/index) for each object the migration creates, compared against the hash rows present. Fix: apply the committed migration SQL by hand via psql; never hand-edit applied migration files |

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

### Journey map design decision (July 28, 2026)
D1b direction decided: **Gujarat Express (Mockup C) merged** — rail-line layout base, postcards from B as the collectible layer, scenic markers from A as garnish. Full record: `docs/BOLO-Journey-Map-Design-Decision.md`. Mockups live in `artifacts/mockup-sandbox/src/components/mockups/Journey*.tsx` (task #794, merged). Prerequisite: D1a lesson grouping.

## 10. Spec status

| Spec | State |
|---|---|
| Spec 0 v2, Task 1 (backend + backfill) | Built |
| Spec 0 v2, Task 2 (band UI + score deprecation) | Built |
| Spec 1a v3 (XP counter + sound preference) | Built |
| Spec 1 v3 (motion engine) | Built |
| Spec D2 v2 (speaking system) | Built (register column, speaking streak, live waveforms + mascot amplitude on web and mobile) |
| Spec D1 (map and journey) | Not written. Blocked on whether a lesson map screen exists |
| Spec D1b (journey map mockups) | Built — 3 static mockups in `artifacts/mockup-sandbox/src/components/mockups/` (`JourneyWindingPath`, `JourneyRegionChapters`, `JourneyGujaratExpress`), shared mock data in `src/lib/journeyData.ts`, mascot PNGs copied (256px) to `artifacts/mockup-sandbox/public/mascot/`. Exploration only; no production screens touched |
| Spec D3 (Rishta Tree, real-world quests) | Not written |
| Spec B (onboarding) | Not written |
| Spec E (copy and voice) | Not written |
| Spec F (progress and accomplishment) | Not written |
| Spec G (social) | Not written |
