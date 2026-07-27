---
name: Bolo! Codebase Inventory
description: Full reference — tech stack, routes, content model, scoring, gamification, onboarding, audio, copy tone. Use before starting any feature work.
---

# Bolo! Codebase Inventory

## 1. Tech Stack

### Web app — `artifacts/gujarati-coach`
| Layer | Library |
|---|---|
| Framework | React 19 + Vite |
| Routing | Wouter |
| Server state | TanStack Query (generated hooks from `@workspace/api-client-react`) |
| UI primitives | Radix UI (full suite) |
| Styling | Tailwind CSS + `tw-animate-css` + `next-themes` (dark mode) |
| Animation | Framer Motion |
| Charts | Recharts |
| Forms | react-hook-form + zod |
| Auth | `@clerk/react` |
| Notifications | Sonner (toasts) |
| Tests | Vitest + Testing Library / jsdom |

### Mobile app — `artifacts/bolo-mobile`
| Layer | Library |
|---|---|
| Framework | Expo ~54 (React Native 0.81) |
| Routing | Expo Router ~6 (file-based) |
| Auth | `@clerk/expo` |
| Payments | `react-native-purchases` (RevenueCat) |
| Server state | TanStack Query |
| Animations | `react-native-reanimated` ~4, `react-native-gesture-handler` |
| Script drawing | `react-native-svg` |
| Audio | `expo-audio` |
| Storage | `expo-secure-store`, `@react-native-async-storage/async-storage` |
| Notifications | `expo-notifications` |
| Tests | Jest + `jest-expo` + RNTL v13 |

### API server — `artifacts/api-server`
| Layer | Library |
|---|---|
| Framework | Express 5 |
| ORM | Drizzle ORM (PostgreSQL) |
| Auth | `@clerk/express` |
| Logging | Pino + pino-http |
| Validation | Zod (schemas from `@workspace/api-zod`) |
| Email | Resend |
| Payments (web) | Stripe SDK v22 |
| Payments (mobile) | RevenueCat via `@replit/connectors-sdk` proxy |
| AI (pronunciation eval) | OpenAI GPT (LLM scoring) + Whisper STT |
| AI (TTS) | ElevenLabs (primary, flag-gated) + gpt-4o-mini-tts fallback |
| AI (chat) | gpt-4o-mini-tts via chat.completions (voice "sage") |
| Tests | node:test + tsx (live Postgres DB, self-provisioning) |

### Shared libs
- `lib/db` — Drizzle schema + seed + migrations
- `lib/api-zod` — Zod request/response contracts (source of generated client hooks)
- `lib/integrations-openai-ai-react` — `useVoiceRecorder`, transcription hooks (web)
- `lib/integrations-openai-ai-server` — server-side OpenAI helpers

---

## 2. Routes

### Web (`artifacts/gujarati-coach` — Wouter)
| Path | Page | Auth |
|---|---|---|
| `/` | landing.tsx | public |
| `/app` | home.tsx | required |
| `/practice` | practice.tsx | required |
| `/chat` | chat.tsx | required |
| `/progress` | progress.tsx | required |
| `/category/:id` | category-detail.tsx | required |
| `/friends` | friends.tsx | required |
| `/account` | account.tsx | required |
| `/upgrade` | upgrade.tsx | required |
| `/subscription` | subscription.tsx | required |
| `/family` | family.tsx | required |
| `/family-join` | family-join.tsx | required |
| `/contact` | contact.tsx | public |
| `/privacy` | privacy.tsx | public |
| `/terms` | terms.tsx | public |
| `/games` | games/index.tsx | required |
| `/games/word-match` | games/word-match.tsx | required |
| `/games/script-trace` | games/script-trace.tsx | required, Plus |
| `/games/bolo-quiz` | games/bolo-quiz.tsx | required, Plus |
| `/games/listen-and-pick` | games/listen-and-pick.tsx | required |
| `/games/phrase-builder` | games/phrase-builder.tsx | required |
| `/games/speed-round` | games/speed-round.tsx | required |

### Mobile (`artifacts/bolo-mobile` — Expo Router)
| File path | Screen | Notes |
|---|---|---|
| `(auth)/sign-in`, `sign-up` | Auth screens | Clerk |
| `(app)/(tabs)/index` | Home dashboard | |
| `(app)/(tabs)/chat` | AI parrot chat | |
| `(app)/(tabs)/friends` | Leaderboard + friends | |
| `(app)/(tabs)/progress` | Progress overview | |
| `(app)/(tabs)/profile` | Account settings entry | |
| `(app)/(tabs)/games/*` | Games hub + individual games | |
| `(app)/practice/[id]` | Targeted category practice | |
| `(app)/practice/daily` | Daily practice launcher | |
| `(app)/review` | Spaced-repetition review | |
| `(app)/category/[id]` | Category phrase list | |
| `(app)/analytics` | Detailed stats + charts | |
| `(app)/badges` | Full badge gallery | |
| `(app)/paywall` | Mobile upgrade screen | RevenueCat |
| `(app)/language` | Language selection/switch | |
| `(app)/account/*` | Settings sub-screens | email, password, reminders, voice, family, subscription |

### API server (`/api` prefix, Express)
Key groups (all under `/api`):
- `GET/POST /openai/tts`, `GET /openai/tts/voices`
- `POST /openai/pronunciation`
- `POST /openai/chat`, `GET /openai/chat-greeting`
- `GET /categories`, `GET /lessons/:id/phrases`, `GET /sentences/:id`
- `POST /attempts`, `GET /badges`
- `GET /review/phrases`, `GET /progress/:languageCode`, `GET /analytics`
- `GET /account/preferences`, `PATCH /account/preferences`
- `GET /account/subscription`, `POST /account/subscription/cancel`, `/pause`, `/resume`
- `POST /stripe/checkout`, `POST /stripe/webhook`
- `POST /revenuecat/webhook`
- `GET /games/daily-quiz`, `POST /games/daily-quiz/complete`
- `POST /games/session` (word-match, speed-round, listen-and-pick, phrase-builder)
- `GET /games/script-trace/:chapter`, `POST /games/script-trace/:chapter/complete`
- `GET/POST /friends`, `GET /friends/leaderboard`
- `POST /contact`
- `GET /health`

---

## 3. Database Schema (key tables)

| Table | Purpose |
|---|---|
| `users` | Clerk-keyed learner. Holds tier, subscription lifecycle, activeLanguage, timezone, dailyGoal, ttsVoice, hasCompletedTour, stripeCustomerId. |
| `languages` | 22 Indian languages (Eighth Schedule). code, name, nativeName, script, rtl. |
| `categories` | 6 topics: greetings, family, numbers, food, everyday, feelings. |
| `lessons` | Unique (languageCode, categoryId). |
| `phrases` | Learning items: nativeScript, romanized, english, hint, difficulty, sortOrder, premium (bool), stage ('phrase'|'sentence'). |
| `attempts` | Per-user practice log: phraseId, score(0-100), passed, transcript, feedback. Null phraseId = phantom (game/quiz streak keeper). |
| `gameSessions` | Mini-game results: game name, correctCount, totalCount, xpAwarded, context (chapter for script-trace). |
| `badges` | (userId, languageCode, badgeKey) — unique triplet, earnedAt. |
| `dailyQuizzes` | Shared daily quiz with JSONB questions. |
| `dailyQuizCompletions` | (userId, languageCode, quizDate, score). |
| `scriptTraceProgress` | (userId, chapter, characterId, passed, bestScore, attemptCount). |
| `familyPlans` | Owner + seats. |
| `friendships` | Directional rows. Bidirectional dup-prevention is app-level. |
| `chatTurns` | Parrot chat history per user. |
| `ttsCache` | Synthesized audio keyed by (languageCode, text, voiceId). |
| `lessonGenerations` | AI lesson generation job tracking. |

---

## 4. Content Model

**22 languages** (all Eighth Schedule): Assamese, Bengali, Bodo, Dogri, Gujarati, Hindi, Kannada, Kashmiri, Konkani, Maithili, Malayalam, Manipuri, Marathi, Nepali, Odia, Punjabi, Sanskrit, Santali, Sindhi, Tamil, Telugu, Urdu. Two are RTL (Kashmiri, Sindhi, Urdu).

**6 topics per language** (categories, language-agnostic):

| Slug | Title | Icon |
|---|---|---|
| greetings | Greetings & Manners | HandshakeIcon |
| family | Family | UsersIcon |
| numbers | Numbers 1–10 | HashIcon |
| food | Food & Eating | UtensilsIcon |
| everyday | Everyday Words | SunIcon |
| feelings | Feelings | HeartIcon |

**Phrase counts** (`seedContent.ts`):
- Default: 8 phrases per lesson (PHRASES_PER_LESSON)
- Numbers: 10 phrases (exception)
- `starterPhraseCount(slug)` = the free-tier boundary (first N phrases are free)
- `sentenceCount(slug)` = Plus-only sentence rows added on top
- Sentences are `stage='sentence'` rows in phrases table; every phrase query must filter by stage

**Seeding approach**:
- Gujarati (`gu`) is the hand-curated language (committed JSON, never AI-generated)
- All other 21 languages: AI-generated offline + committed to static JSON; seeder reads at startup
- The seeder runs inside api-server startup with a pg advisory lock (idempotent)

**Premium flag**: phrases.premium = true for anything beyond the free starter set. Derived BY INDEX at seed time — index >= starterPhraseCount(slug).

**Tier gating** (server-authoritative, 402 upgrade_required):
- `free`: starter phrases only, no sentences, no script-trace, no bolo-quiz
- `one_language`: Plus access for one chosen language only (locked at purchase)
- `plus`: full access all languages

---

## 5. Scoring & XP

### Pronunciation evaluation pipeline
1. **STT** — Whisper with language hint (`A language learner is speaking {language}. Transcribe exactly what they say.`)
2. **Retry logic** — if first transcript is effectively empty or sim ≤ 0.40 vs target, retry once without language hint; keep the closer transcript
3. **Phonetic similarity** — `compareToTarget()`:
   - Latin transcript → `normalizeLatin()` (lowercase, strip diacritics, fold chh→ch, w→v, ee→i, oo→u, collapse doubles) → Levenshtein `similarity()` = 1 − editDist/maxLen
   - Native-script transcript → `normalizeNative()` → same edit-distance ratio
   - Cross-script (comparable=false): guards don't fire
4. **Fast path** — sim ≥ 0.93 and target > 4 normalized chars: skip LLM, score = `simToScore(sim, 0.90)` (linear map [0.90..1.0] → [80..100])
5. **LLM scoring** — GPT evaluates by phoneme match, returns JSON `{score, passed, feedback, tip}`; score 0–100; passed iff score ≥ 80
6. **Guards** (`applyScoreGuards`):
   - Near-match floor: sim ≥ 0.90 → floor at simToScore(sim, 0.90), can never fail
   - Wrong-phrase cap: sim ≤ 0.5 and a sibling phrase matches at sim ≥ 0.80 → cap at 72
   - Partial-match cap: sim < 0.70 and LLM score ≥ 80 → cap at 72
7. **Result** persisted to `attempts` (score, passed, feedback, transcript)

**Constants**:
- `MASTERY_THRESHOLD = 80` — bestScore ≥ 80 → mastered
- `REVIEW_PASS_THRESHOLD = 60` — score ≥ 60 promotes Leitner box

### XP accumulation
- **Pronunciation XP** = raw sum of all attempt scores (0–100 per attempt, phantoms score 0)
- **Game XP**: stored per game_session row, summed separately, added to pronunciation XP for display and badge evaluation

### Game XP rates
| Game | XP formula |
|---|---|
| Daily Quiz | 10 × correct + 20 bonus if perfect (max 70 for 5/5) |
| Script Trace | 30 XP per chapter completed |
| Word Match / Speed Round / Listen & Pick / Phrase Builder | xpAwarded stored per session (computed game-side) |

---

## 6. Spaced Repetition (Review)

**Algorithm**: Leitner 5-box
**Intervals**: `[0, 1, 3, 7, 16]` days indexed by box level

**Replay logic** (per phrase, chronological):
- Pass (score ≥ 60) → advance one box (capped at 4)
- Miss (score < 60) → reset to box 0

**Due date** = lastAttemptAt + REVIEW_INTERVALS_DAYS[level] * 24h

**Review queue ordering**: due-date ascending (most overdue first); ties broken by weakest best-score first.

**Mastery removes a phrase from review** — phrases with bestScore ≥ 80 are never queued.

---

## 7. Streaks

- **Pronunciation streak** (`computeStreakDays`): consecutive local calendar days with any attempt. Uses learner's `users.timezone` (IANA, null → UTC). Anchors on today; if today has no attempt, backs up to yesterday first.
- **Daily quiz streak** (`computeDailyQuizStreak`): consecutive UTC days with any quiz completion. Also backs up to yesterday if no completion today.

---

## 8. Badge Catalog (24 badges)

All badges are per (user, language) — earning for Hindi doesn't unlock for Tamil.

| Key | Title | Criterion | Plus-only |
|---|---|---|---|
| first_phrase | First Words | 1 attempt | — |
| phrases_10 | Explorer | 10 phrases practiced | — |
| phrases_50 | Globetrotter | 50 phrases practiced | — |
| mastery_1 | First Mastery | 1 phrase mastered (score 80+) | — |
| mastery_10 | Master of Ten | 10 phrases mastered | — |
| mastery_25 | Phrase Master | 25 phrases mastered | — |
| streak_3 | On a Roll | 3-day streak | — |
| streak_7 | Week Warrior | 7-day streak | — |
| streak_14 | Fortnight Fire | 14-day streak | — |
| streak_30 | Unstoppable | 30-day streak | — |
| streak_60 | Summit Seeker | 60-day streak | — |
| streak_100 | Century Club | 100-day streak | — |
| xp_500 | Rising Star | 500 XP | — |
| xp_2000 | XP Champion | 2,000 XP | — |
| xp_5000 | XP Legend | 5,000 XP | — |
| perfect_100 | Flawless | score 100 on any phrase | — |
| card_shark | Card Shark | 3 Word Match sessions | — |
| speed_demon | Speed Demon | 1 Speed Round ≥80% accuracy | — |
| ear_trained | Ear Trained | 5 Listen & Pick sessions | — |
| sentence_architect | Sentence Architect | 3 Phrase Builder sessions | — |
| scribe | Scribe | 1 Script Trace chapter completed | ✓ |
| daily_devotee | Daily Devotee | 7-day Bolo Quiz streak | ✓ |

Badge award: `INSERT … ON CONFLICT DO NOTHING RETURNING` — idempotent, only newly-inserted rows trigger celebration. Progress = min(metric, target) / target.

---

## 9. Gamification State Machine

After every practice attempt (`POST /attempts`):
1. Insert attempt row
2. Load extended metrics (attempts + game sessions + script trace + quiz completions)
3. `awardNewlyEarnedBadges()` — bulk upsert, return only new rows
4. Phrase replenisher fires in background (top up Plus phrase pool if low)

After every game session or quiz completion:
- `awardNewlyEarnedBadges()` called with same extended metrics
- A phantom attempt (phraseId=null, score=0) is inserted so the calendar day counts for the pronunciation streak

Daily goal: `users.dailyGoal` (default 10 attempts/day). Progress against it shown on home screen; celebration fires when attemptsToday reaches it (once per session).

---

## 10. Onboarding / Tour

**Web** — 6-step guided overlay (`guided-tour-overlay.tsx`, `tour-context.tsx`):

| Step | Title | Route | Mascot pose |
|---|---|---|---|
| 1 | "Welcome to Bolo! 👋" | /app | wave |
| 2 | "Pick a topic 🗂️" | /app | thinking |
| 3 | "Chat with Bolo 🦜" | /chat | cheer |
| 4 | "Play your way to fluency 🎮" | /games | thumbsup |
| 5 | "Watch yourself grow 📈" | /progress | thinking |
| 6 | "You're all set! 🎉" | /app | cheer |

Auto-launches on first authenticated visit (`hasCompletedTour = false`). Never interrupts a practice/chat/review session. On finish or skip: `PATCH /account/preferences { hasCompletedTour: true }`.

**Mobile** — equivalent tour launched from `(app)/_layout.tsx`, same `hasCompletedTour` flag.

---

## 11. Audio Architecture

### SFX
- `public/sounds/squawk.mp3`, `squawk_a.mp3`, `squawk_b.mp3`, `squawk_c.mp3` (web)
- `assets/sounds/squawk*.mp3` (mobile) — four variants, played on parrot character events

### Practice TTS (phrase audio + feedback readback)
- Endpoint: `POST /openai/tts`
- Primary: ElevenLabs (when `USE_ELEVENLABS_TTS = true` in `lib/ttsConfig.ts`; currently **false**)
- Fallback / current default: gpt-audio via `chat.completions` (OpenAI TTS workaround — Replit proxy only routes /v1/chat/completions, not /v1/audio/speech)
- Cached in `ttsCache` table keyed by (languageCode, text, voiceId)
- Voice selection: per-language default from `LANGUAGE_VOICE_MAP`, overridden by `users.ttsVoice` (Plus only; ElevenLabs premade voice ID from `VOICE_CATALOG`)
- Feedback readback: practice.tsx pre-synthesizes feedback in parallel with `createAttempt`, plays back `feedback + tip` text

### Chat TTS (parrot replies)
- `boloTTSMini` / `boloTTSMiniStream` in `parrotChat.ts`
- Model: `gpt-4o-mini-tts`, voice: `"sage"`, format: `"mp3"`
- SSE streaming: `X-Audio-Stream` header → audioChunk events → audioDone commit signal
- Web uses MSE audio/mpeg; Safari/mobile falls back to full clip

### iOS audio routing
- Must flip to playback-only mode around coach audio (earpiece routing issue), serialized with recorder prepares

### Mic pre-warm (web)
- Recorder streams prepared ahead of tap; pre-warmed tracks must not be stopped on stopRecording or clipping returns

---

## 12. Copy & Tone

**Brand voice**: warm, encouraging, heritage reconnection angle. Never harsh. Speaks directly to "you".

**Landing / marketing**: "Bolo! helps you reconnect with your heritage language through short, enjoyable daily sessions."

**Practice feedback** (LLM-generated, spoken aloud): conversational, face-to-face register. "React to how they did first (celebrate a great one, cheer on a close one), then name one specific thing they did well, and if it wasn't perfect, gently point out the one sound to work on." No emojis or special symbols (text is TTS-read).

**Session-end copy** (practice.tsx):
- Perfect session: "PERFECT SESSION! 🏆"
- avg ≥ pass threshold: "You crushed it!"
- avg ≥ near-miss threshold: "Session Complete!"
- Otherwise: "Great effort!"

**Tour copy** (short, warm, first-person-address, written as Bolo's friendly voice):
- Uses "Bolo!" consistently (exclamation mark part of brand name)
- Plus-only features labelled honestly upfront ("for Plus members")

**Parrot persona** (`parrotChat.ts`):
- Name: Bolo, a green parrot
- Squawk tokens: Squawk, Squawkity, Bawk, Bawk bawk, Awk, Eeek, Tweet, Chirp, Screech, Caw, Squee (with/without !)
- System prompt instructs roughly 1-in-3 replies to start with a squawk
- `extractSquawks()` strips bird tokens before TTS so they're display-only
- **Removal in progress**: squawk tokens are being removed from system prompts and copy (not yet done)

**Bolo Quiz** copy: `computeXp` awards 10 per correct + 20 bonus for perfect; messaging references "Bolo Quiz" (not "daily quiz") in user-facing surfaces.

---

## 13. Subscription & Payments

### Tiers
| Tier | Access |
|---|---|
| `free` | Starter phrases (first N per topic), 4 free games, no review, limited chat |
| `one_language` | Plus access for one chosen language (locked at purchase) |
| `plus` | All languages, sentences, script-trace, bolo-quiz, review, unlimited chat |

### Web (Stripe)
- Checkout: redirect-away Stripe session; client sends BASE_URL for return URLs
- Webhook is the only tier-write path (`stripe.ts`)
- Cancel/manage via Stripe portal only (not `/account/subscription` endpoints, which are DB-only)
- Drift reconcile: periodic list-all sweep self-heals missed webhooks

### Mobile (RevenueCat)
- SDK: `react-native-purchases` + RevenueCat connector proxy
- Webhook at `POST /revenuecat/webhook` writes tier to DB
- Reconcile-on-read gated on REVENUECAT_PROJECT_ID

### Family plans
- Owner seat + up to N member seats (familyPlans table)
- Member Plus derived per-request from owner (no writes needed)
- Plus→Family is in-place price swap; join's Stripe cancel runs inside seat transaction

### Subscription pause/retention
- `paused` status = suspended-not-expired; resolves Free until `pauseUntil`
- Pause branch evaluated before tier branch in `loadEntitlements`
- 3-month retention offer recorded in `retentionOfferAcceptedAt`

---

## 14. Known Rough Edges / In-Progress

- `USE_ELEVENLABS_TTS` is currently **false** — all TTS uses gpt-audio fallback
- `boloTTSMiniStream` passes `stream_format: "audio"` which is a non-standard parameter; behavior unconfirmed
- Bird-noise (squawk) removal from copy is **not yet done**: system prompts in `parrotChat.ts`, `buildGreetingDisplayText` in `greetingStrings.ts`, empty-state UI, error strings in practice/chat/review — all still contain squawk tokens; `BOLO_CHAT_CACHE_KEY` needs bumping after system prompt changes
- Chat audio silence bug (text appears, no audio) not yet root-caused; suspected cause is the `stream_format` parameter
