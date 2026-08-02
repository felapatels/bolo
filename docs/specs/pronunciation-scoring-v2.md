# Pronunciation scoring v2: gpt-audio ensemble hybrid

**Status:** Design spec. Implementation is build 32+, gated on build 31 beta approval AND on the real-voice pilot passing (see section 1).
**Client contract:** unchanged. Five bands (perfect/great/good/almost/retry), transcript, transcriptRomanized, nocatch semantics, and `scoreBands.ts` thresholds are all frozen.
**Cross-reference:** the token economy spec (`docs/specs/token-economy.md`, Task 927) should cite the per-attempt audio-grading cost numbers in section 5 of this document when computing marginal cost per token earned.

---

## Background: why v1 is accent-blind

The current pipeline (`POST /openai/pronunciation`, `artifacts/api-server/src/routes/openai.ts`) is transcript-only. The STT step (`gpt-4o-mini-transcribe`) resolves even a heavily American-syllable attempt at a Hindi phrase to the exact target text, producing similarity 1.0 and a perfect band. The LLM judge (`gpt-5.4-mini` at line 1023) receives only that text transcript, never the audio. No acoustic signal reaches band derivation.

Phoneme SUBSTITUTIONS that change the transcript are still caught. The blind spot is accent quality and delivery when the words resolve correctly.

Investigation verified July 31, 2026. Raw evidence: agent memory `pronunciation-scoring-signal.md`.

---

## 1. Pilot gate design

### Purpose

Synthetic TTS clips used in the sandbox investigation are a weak proxy for real learner audio. The acceptance criterion must be validated on actual human recordings before any production change.

### Recording protocol

**Participants:** Aakesh and family members. No TTS, no professional speakers.

**Languages:** Hindi (hi) first, then Gujarati (gu). Two languages are sufficient for the initial gate; other languages promote later per section 4.

**Phrase selection:** 5 phrases per language from the existing catalog, spanning beginner to intermediate difficulty. Choose phrases where accent quality is unambiguous to a native ear (avoid 1-2 syllable targets where the fast path already handles them correctly).

**Clip types per phrase (4 clips per phrase, 20 clips per language, 40 total):**
- `native`: spoken at natural pace with correct accent. At least 2 native speakers per language.
- `mild_accent`: spoken by a non-native speaker who speaks the words correctly but with a noticeable foreign accent.
- `heavy_accent`: spoken with strong L1 interference, all words recognizable but clearly accented.
- `wrong_attempt`: a plausibly wrong attempt (one phoneme swapped, or syllable stress badly wrong).

**Storage:** `qa/pilot-clips/hi/<phrase_slug>/<clip_type>_<speaker_id>.wav` and same for `gu/`. Committed to the repo. 16kHz mono WAV, 3-10 seconds, trimmed to remove silence at start/end.

### Pilot harness

A repeatable script at `qa/pilot-pronunciation-v2.mjs`. It reuses the sandbox approach from `/tmp/pron-exp/` (parallel gpt-audio calls, prompt-enforced JSON, 3-run median), productionized as:

```
pnpm -w exec node qa/pilot-pronunciation-v2.mjs --lang hi --clips qa/pilot-clips/hi
```

For each clip: run 3 gpt-audio grading calls in parallel, compute the median, record all 3 raw scores and the median to `qa/pilot-results/hi/<phrase_slug>_<clip_type>_<speaker_id>.json`. Print a summary table: clip, raw scores, median, current-pipeline score (from the transcript-only path).

The AI integrations proxy (`AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY`) is used, not the project's own key. Response format is prompt-enforced JSON (not `json_object`, which gpt-audio rejects). Full prompt is specified in section 2.

### Acceptance criteria

The pilot passes when ALL of the following hold across both hi and gu:

1. **Separation:** for every phrase, `median(native) > median(heavy_accent)` by at least 20 points. Rationale: this is the minimum commercially meaningful gap (two band steps on the 0-100 scale).
2. **Stability:** for every clip, `max(run1, run2, run3) - min(run1, run2, run3) <= 30`. Single-run variance of up to 30 points was observed in the sandbox; the median of 3 largely eliminates it, but any clip with all three runs spanning more than 30 points indicates the model is unstable on that clip type and the pilot fails.
3. **Wrong-phrase handling:** `wrong_attempt` clips must score below 55 (retry or almost band) after guards, matching the current behavior for those types of errors.
4. **False negative rate:** no more than 1 `mild_accent` clip out of the 20 (per language) may score below 55. Mild accents should not be penalized severely.

If the pilot fails: diagnose by clip type, adjust the rubric prompt (section 2), re-run. Do not ship to production on a failed pilot.

---

## 2. Grading call design

### Audio rubric prompt

This prompt replaces `PRONUNCIATION_RUBRIC_PROMPT` for audio-enabled languages. It is a module-level constant (same placement logic: single byte-identical string, request-specific values in the user message only) in `artifacts/api-server/src/routes/openai.ts`:

```
You are a warm, encouraging pronunciation coach for a learner. You will hear their attempt and the target phrase. Judge the AUDIO directly -- how it sounds -- not any spelling or script.

Score with this rubric:
1. Phoneme accuracy (most important): how many of the target consonant and vowel sounds are present, in order. Aspiration, vowel length, and retroflex vs dental distinctions all count.
2. Accent and delivery: does it sound like the target language, or like the learner's L1 is bleeding through heavily?
3. Syllable count and stress: right number of syllables in the right order, correct emphasis.

Score bands:
- 90-100: all sounds present and in order; native-like delivery; at most one tiny vowel-quality slip.
- 80-89: recognizably the target phrase; one small sound off, or mild accent that does not distort the phonemes.
- 60-79: clearly attempting the target; one syllable or a couple of sounds wrong or missing; noticeable but not overwhelming accent.
- 40-59: some overlap with the target; multiple sounds or syllables wrong, or very heavy accent.
- 10-39: mostly a different word or phrase.
- 0-9: unrelated speech or noise.

If the speaker sounds like a fluent native, score 95-100; do not reserve scores above 92 for flawlessness.

For very short targets (1-2 syllables), apply the same bands per sound. Within each band, pick a specific score that reflects exactly how close the attempt was -- avoid rounding to 5 or 10 unless the attempt truly sits at that boundary. For example, within 80-89 prefer 83 or 87 over always writing 85.

Always be kind and motivating. This feedback will be READ ALOUD to the learner, so write it like you are talking to them face to face: friendly, playful, conversational. React to how they did first, name one specific thing they did well, and if it was not perfect, gently name the one sound to work on. Reply ONLY as JSON with keys: score (integer 0-100), passed (boolean, true if score>=80), feedback (three to four warm chatty sentences spoken directly), tip (one short friendly concrete pronunciation tip). Address them as "you". No emojis or special symbols.
```

**Why `response_format: json_object` is absent:** gpt-audio rejects it. Prompt-enforced JSON is the only path. Parse defensively (same `JSON.parse` with fallback as the current text-judge path).

**Prompt amendment (calibration ruling, August 2, 2026):** the "If the speaker sounds like a fluent native, score 95-100" line above was added by owner ruling after calibration round 1 showed a de-facto 92 ceiling on genuine native clips (native medians clustered 82-92 in all three pilot languages). The 92 ceiling was a prompt artifact of the strict 90-100 band text; it is fixed here at the source. The promotion cut remains 93.

### BINDING design ruling: monosyllable promotion exclusion (August 2, 2026)

Monosyllabic phrases (ha, na, and any other single-syllable target) are **excluded from judge promotion entirely**. In production, a monosyllabic phrase keeps its text-path result and is never judge-promoted above it: one phoneme cannot evidence Perfect. Calibration round 1 evidence: monosyllables were the dominant failure locus on both tails (3 of 4 american_accent promotions and a wrong_attempt scored 92 were all "ha"/"na"). These clips are likewise excluded from all calibration gate criteria (they are still scored and reported for visibility).

### Ensemble: 3 parallel calls

```typescript
// artifacts/api-server/src/routes/openai.ts -- new audioEnsembleGrade() helper
async function audioEnsembleGrade(
  audioBase64: string,
  audioFormat: "wav" | "webm" | "m4a",
  targetNative: string,
  targetRomanized: string,
  language: string,
  log: Logger,
): Promise<{ median: number; raw: [number, number, number]; feedback: string; tip: string } | null> {
  const calls = Array.from({ length: 3 }, () =>
    audioOpenai.chat.completions.create({
      model: "gpt-audio",
      messages: [
        { role: "system", content: AUDIO_RUBRIC_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: `Language: ${language}\nTarget: ${targetNative}\nRomanized: ${targetRomanized}\n\nGrade this attempt.` },
            { type: "input_audio", input_audio: { data: audioBase64, format: audioFormat } },
          ],
        },
      ],
    }).then((r) => {
      const j = JSON.parse(r.choices[0]?.message?.content ?? "{}") as {
        score?: number; feedback?: string; tip?: string;
      };
      return { score: Math.max(0, Math.min(100, Math.round(Number(j.score ?? 0)))), feedback: j.feedback ?? "", tip: j.tip ?? "" };
    })
  );

  // 5-second timeout per call; if a call exceeds it, treat as failed.
  const CALL_TIMEOUT_MS = 5000;
  const settled = await Promise.allSettled(calls.map((c) => Promise.race([c, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), CALL_TIMEOUT_MS))])));

  const successes = settled.flatMap((s) => s.status === "fulfilled" ? [s.value] : []);

  if (successes.length < 2) return null; // fall back to transcript scoring

  const scores = successes.map((s) => s.score).sort((a, b) => a - b);
  const median = scores.length === 3 ? scores[1]! : Math.round((scores[0]! + scores[1]!) / 2);

  // Use feedback from the call whose score is closest to the median.
  const anchor = successes.reduce((best, s) => Math.abs(s.score - median) < Math.abs(best.score - median) ? s : best);

  return {
    median,
    raw: (successes.map((s) => s.score) as any).slice(0, 3),
    feedback: anchor.feedback,
    tip: anchor.tip,
  };
}
```

**Timeout and partial-failure rules:**
- 3 of 3 returned: median of the sorted middle value.
- 2 of 3 returned: median of the two (average, rounded).
- 1 or 0 returned: `audioEnsembleGrade` returns `null`. The caller falls back to the transcript-derived score for that attempt. The response to the client is unchanged; the learner never waits for a hung provider.
- Any call that throws or times out after 5 seconds is counted as failed.

### Combined vs separate variant

**Combined (recommended):** the audio judge produces both the numeric score AND the feedback/tip text. The existing `gpt-5.4-mini` text-judge call at line 1022 is removed for audio-graded languages. Result: lower latency (one round-trip kind, 3 parallel calls instead of 1 serial text call), lower cost (eliminates the text-judge call), simpler code path.

**Separate variant:** gpt-audio produces the score, `gpt-5.4-mini` produces the feedback text. Score and feedback are independent calls, run in parallel. Advantage: text-judge feedback tends to be slightly more coherent on short phrases. Disadvantage: adds cost and a second failure domain.

**Recommendation: combined.** The audio rubric prompt produces warm, read-aloud-friendly feedback with the same constraints as the text rubric. Any feedback-quality gap will be calibrated during the pilot (the pilot harness should log both variants on a sample). Cost at 100K audio-graded attempts per month is $600 combined vs $700+ separate. Accept the combined recommendation unless pilot results show a systematic feedback-quality deficit.

---

## 3. Score integration

### Execution order and guard seams

Guards run on the TRANSCRIPT, not on the audio grade. The audio grade replaces only the raw numeric score that feeds the band ladder. This is non-negotiable: an audio grade must never rescue a wrong-phrase attempt or suppress nocatch.

**Precise execution order (for audio-enabled languages on the LLM path):**

1. **STT** (unchanged): `speechToText` in `lib/integrations-openai-ai-server/src/audio/client.ts`. Returns `transcript`. The audio bytes are also retained in memory for the grading call.
2. **Script-mismatch nocatch** (`applyScoreGuards`, `pronunciationGuards.ts` ~line 240): fires on `transcript` alone. If nocatch, return immediately -- the audio grade is NEVER called. Rationale: nocatch means the recognizer failed; grading nonsense audio is not useful.
3. **Fast-path bypass:** the fast path (`openai.ts` line 845: `targetSim.comparable && targetSim.sim >= 0.93 && !isShortTarget`) is **disabled for audio-enabled languages**. The fast path derives its score from transcript similarity; doing so for an audio-graded language would silently skip the accent check on high-confidence transcriptions, which is exactly the blind spot being fixed.
4. **Wrong-phrase-cap check** (transcript sim, `pronunciationGuards.ts`): still fires before the audio call. If `targetSim.sim <= 0.5` and a sibling matches at >= 0.80, cap the score at 40 and return -- no audio call needed.
5. **Audio ensemble** (`audioEnsembleGrade`, parallel 3 calls): runs in parallel with the sibling-phrases DB query (same pattern as the current `siblingsPromise`). Returns `{ median, raw, feedback, tip }` or `null`.
6. **Score selection:**
   - If `audioEnsembleGrade` returned a non-null result: `audioScore = result.median`.
   - If `audioEnsembleGrade` returned `null` (partial failure): `audioScore = llmTextScore` from a fallback gpt-5.4-mini call (same as today), so the path degrades cleanly.
7. **Near-match-floor guard** (`pronunciationGuards.ts` ~line 228): `if (targetSim.sim >= 0.90) { floor = simToScore(sim, 0.90); audioScore = Math.max(audioScore, floor); }`. The floor is RETAINED for audio-graded languages. Rationale: a transcription at 0.90+ similarity is strong evidence the words were correct; the floor prevents the audio judge from penalizing a phonetically correct attempt due to model variance.
8. **Partial-match-cap guard** (`pronunciationGuards.ts` ~line 260): `if (targetSim.sim < 0.70 && audioScore >= 80) { audioScore = min(audioScore, 72); }`. Retained.
9. **`bandFromScore(audioScore)`** (`scoreBands.ts`): unchanged.
10. **`signEvaluation`**: stores `audioScore` as `score`, same as today.

**Key file and line references (current code, build 31):**

| Seam | File | Line (approx) |
|---|---|---|
| Fast path entry | `artifacts/api-server/src/routes/openai.ts` | 845 |
| `llmPromise` (text judge, to be replaced) | same | 1022 |
| `siblingsPromise` (to be run in parallel with audio calls) | same | 1007 |
| `applyScoreGuards` call | same | 1061 |
| `bandFromScore` call | same | 1127 |
| Near-match-floor logic | `artifacts/api-server/src/lib/pronunciationGuards.ts` | ~228 |
| Wrong-phrase-cap logic | same | ~240 |
| Partial-match-cap logic | same | ~260 |
| `BAND_THRESHOLDS` (frozen) | `artifacts/api-server/src/lib/scoreBands.ts` | 28 |

**The `applyScoreGuards` function is NOT called with the audio score as input.** Guards read `transcript` sim, not the audio grade. The audio grade enters only at step 6, after the guard that can return nocatch has already run. `applyScoreGuards` is called with the audio score as `score` only for the near-match-floor and partial-match-cap applications (steps 7 and 8); those guards read `target.sim`, not `score`.

---

## 4. Language rollout table

### Flag mechanism

A single config object in a new file `artifacts/api-server/src/lib/audioGradingConfig.ts` (modeled on `ttsConfig.ts`):

```typescript
// Languages for which the gpt-audio ensemble replaces the text judge.
// Add a language code here after its pilot passes (see docs/specs/pronunciation-scoring-v2.md).
// Languages absent from this set use transcript scoring unchanged.
const AUDIO_GRADING_LANGUAGES_RAW = process.env.AUDIO_GRADING_LANGUAGES ?? ""; // e.g. "hi,gu"
export const AUDIO_GRADING_LANGUAGES: ReadonlySet<string> =
  AUDIO_GRADING_LANGUAGES_RAW.trim()
    ? new Set(AUDIO_GRADING_LANGUAGES_RAW.split(",").map((s) => s.trim()).filter(Boolean))
    : new Set();

export function isAudioGradingEnabled(languageCode: string | null | undefined): boolean {
  return languageCode != null && AUDIO_GRADING_LANGUAGES.has(languageCode);
}
```

Default: empty set (no audio grading). Enabled per-language by setting `AUDIO_GRADING_LANGUAGES=hi,gu` in the environment. No deploy required to add a language -- environment variable change only -- but a pilot run is required first.

### Initial cohort

After the pilot passes: set `AUDIO_GRADING_LANGUAGES=hi,gu`.

### Promotion criteria for each additional language

A language may be added to the set when:
1. At least 10 real human recordings per clip type (native/mild_accent/heavy_accent/wrong_attempt) are collected for that language.
2. The pilot harness acceptance criteria (section 1) pass on those recordings.
3. The language is not in the indefinitely-transcript-scored list below.

### Languages expected to stay transcript-scored indefinitely

Following the C1 rollout precedent (LLMs cannot reliably validate low-resource content): `ks` (Kashmiri), `sat` (Santali), `brx` (Bodo), `mni` (Manipuri). These four had the same disqualification applied to AI-generated content in the C1 rollout; accent grading by an LLM is expected to be similarly unreliable. Additionally: `doi` (Dogri) and `mai` (Maithili) should be treated as provisional -- include them in pilots before enabling.

### Full language status table

| Code | Language | Audio grading | Notes |
|---|---|---|---|
| hi | Hindi | Yes, initial cohort | Pilot required |
| gu | Gujarati | Yes, initial cohort | Pilot required |
| bn | Bengali | Promote after pilot | |
| ta | Tamil | Promote after pilot; also Azure PA candidate |
| te | Telugu | Promote after pilot | |
| kn | Kannada | Promote after pilot | |
| ml | Malayalam | Promote after pilot | |
| mr | Marathi | Promote after pilot | |
| pa | Punjabi | Promote after pilot | |
| ur | Urdu | Promote after pilot | |
| or | Odia | Promote after pilot | |
| as | Assamese | Promote after pilot | |
| ne | Nepali | Promote after pilot | |
| sa | Sanskrit | Promote after pilot | |
| sd | Sindhi | Promote after pilot | |
| kok | Konkani | Promote after pilot | |
| doi | Dogri | Provisional -- pilot before enabling | |
| mai | Maithili | Provisional -- pilot before enabling | |
| ks | Kashmiri | Indefinitely transcript-scored | Low-resource; LLM unreliable |
| sat | Santali | Indefinitely transcript-scored | Low-resource; LLM unreliable |
| brx | Bodo | Indefinitely transcript-scored | Low-resource; LLM unreliable |
| mni | Manipuri | Indefinitely transcript-scored | Low-resource; LLM unreliable |

### Backend swappability

The grading backend is an implementation detail behind the score. The client contract and band ladder are backend-agnostic: five bands (perfect/great/good/almost/retry), the frozen 80/55 credit-group edges, nocatch semantics, and `scoreBands.ts` thresholds are all unchanged regardless of which backend produces the raw numeric score.

The gpt-audio ensemble defined in this spec is the initial production backend. The anticipated long-term replacement is a self-hosted phoneme-scoring backend -- IndicMFA/GOP or a wav2vec2-class model -- which would eliminate the per-attempt API cost, extend reliable coverage to all 22 languages including the four low-resource languages currently excluded from audio grading, and keep learner audio inside the app's own infrastructure.

Qualifying a replacement backend uses the same pilot harness acceptance criteria defined in section 1 (separation, stability, wrong-phrase handling, false negative rate). The voice contribution corpus collected under `docs/specs/voice-data-program.md` is the evaluation set for that qualification: real learner recordings with known bands and transcripts, spanning the language and accent distribution of the actual user population, are the ground truth against which any replacement is measured.

Swapping the backend requires: (1) the replacement passes the pilot criteria on the contributed corpus; (2) `audioEnsembleGrade()` in `openai.ts` is replaced by a call to the new backend returning the same `{ median, raw, feedback, tip }` shape; (3) `scoring_path` in the `attempts` table records the new backend name. No client changes, no band-ladder changes, and no schema changes beyond the `scoring_path` string are required.

---

## 5. Cost, latency, and budget controls

### Per-attempt cost (combined variant: audio replaces text judge)

**gpt-audio token metering (empirically measured in sandbox):**
- Audio input: ~10 tokens per second of clip. A 3s attempt = ~30 audio input tokens.
- Text prompt: ~120 tokens (system rubric + user message with target).
- Text output: ~120 tokens (score + 3-4 sentence feedback + tip).
- Total per call: ~270 tokens.

**Rates (tokenrate.dev, July 2026):** gpt-audio $2.50/1M text input, $10/1M text output. Audio input rate is not separately listed; using the conservative observed effective rate from sandbox usage data (~$0.002 per call for a 3s clip on the actual billed amount from the API key used). **Label: partially inferred** -- audio token billing rate is not confirmed at a per-token price; the $0.002 figure is measured from total charge / number of calls in the sandbox run.

**Per-attempt cost (3-call ensemble):**
- Combined (audio replaces text judge): ~$0.006 per attempt. This is the total; no additional text-judge call.
- Separate (audio scores, text judges feedback): ~$0.007 per attempt ($0.006 audio + $0.001 gpt-5.4-mini text).
- Current pipeline (text judge only): ~$0.001 per attempt (gpt-5.4-mini with prompt caching).

**Incremental cost of switching from text to audio grading per attempt: ~$0.005.**

### Monthly projections

These figures cover only audio-graded attempts (hi + gu initially; eventually all non-low-resource languages). Apply the fraction of total attempts in audio-graded languages to the total attempt volume.

| Monthly audio-graded attempts | Cost (combined) | Cost (separate) |
|---|---|---|
| 1,000 | ~$6 | ~$7 |
| 10,000 | ~$60 | ~$70 |
| 100,000 | ~$600 | ~$700 |

At 10K total attempts/month with hi+gu comprising ~60%: ~$36 incremental over current pipeline. At 100K: ~$360. These figures assume gpt-audio billing does not change.

### Budget guard

A server-side per-user daily cap prevents runaway cost from a single user (abuse or a bug):

```typescript
// audioGradingConfig.ts
export const AUDIO_GRADING_DAILY_USER_LIMIT = Number(
  process.env.AUDIO_GRADING_DAILY_USER_LIMIT ?? "200"
); // calls, not attempts (3 calls per attempt)
```

Implementation: an in-process LRU counter (keyed by userId, TTL = start of next UTC day). If the counter for a user exceeds `AUDIO_GRADING_DAILY_USER_LIMIT * 3` total calls that UTC day, `isAudioGradingEnabled` returns false for that user+request and the attempt falls back to transcript scoring silently. The response to the client is identical; the `scoring_path` column (section 6) records the fallback.

A global per-process limit of 2,000 audio-grading calls per minute (`AUDIO_GRADING_RATE_LIMIT_PER_MIN`, default 2000) is enforced with a token-bucket in the same config module. Exceeding it also degrades to transcript scoring silently.

### Cross-reference to token economy spec

The token economy spec (`docs/specs/token-economy.md`) should reference these figures: the marginal server-side cost per scored attempt is ~$0.006 for audio-graded languages and ~$0.001 for transcript-scored languages. When computing the cost per token earned (if earning requires a scored attempt), use the weighted average across the language mix.

---

## 6. Failure and abuse posture

### Provider outage

If `audioEnsembleGrade` returns `null` (fewer than 2 calls succeeded), the route falls back to a `gpt-5.4-mini` text-judge call (same as the current LLM path). The learner never waits indefinitely: the 5-second-per-call timeout in the ensemble ensures the entire ensemble resolves within 5 seconds regardless of provider state.

Log at WARN level: `{ userId, languageCode, audioCallsSucceeded: 0|1, reason: "timeout"|"error" }`.

**Grading never produces nocatch on its own.** Nocatch fires only from script-mismatch in the transcript path. A failed audio ensemble that falls back to transcript scoring may produce any of the five scored bands; it cannot independently produce nocatch.

### Logging and calibration store

To enable post-launch calibration (verifying that the audio grade and the transcript grade agree when they should, and auditing cases where they diverge):

**Schema addition (build-32 migration, listed here -- not executed):**

```sql
-- Migration: 0031_audio_grading_columns.sql
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS audio_grade_raw integer[];   -- e.g. [45, 50, 55]
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS audio_grade_median integer;  -- e.g. 50; null = transcript path
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS scoring_path text;           -- 'audio_ensemble' | 'audio_fallback_transcript' | 'transcript' | 'fast_path'
```

`scoring_path` values:
- `audio_ensemble`: ensemble returned >= 2 results; median used as the score.
- `audio_fallback_transcript`: ensemble returned < 2 results; gpt-5.4-mini text judge used.
- `transcript`: language not in audio-grading set; existing pipeline unchanged.
- `fast_path`: transcript sim >= 0.93, fast path taken (only applies to non-audio-graded languages post-v2, since audio-graded languages disable the fast path).

The `flags` column (already present: `text("flags")`, comma-separated) does NOT replace these columns; it is for guard-firing tags. The new columns are for calibration and should be queried to compare `audio_grade_median` against `score` (which equals the guarded audio grade after floors/caps).

**No separate table.** The minimal addition to `attempts` is sufficient; a join-free query is faster and the data volume is the same as today.

### Azure PA as future calibration anchor

Azure Pronunciation Assessment (hi-IN and ta-IN only) is NOT a dependency of v2. It is listed here as a future option: once v2 is live, run the pilot harness against the same clips using Azure PA to produce reference GOP scores, then correlate them against the gpt-audio median grades for hi and ta. If correlation is strong, the Azure scores can act as a ground-truth anchor for rubric recalibration. This requires Azure credentials and a short batch script -- it does not touch any production code.

---

## 7. Build-32 task breakdown

All tasks are gated on: build 31 beta approved AND pilot (#928 equivalent) passing. Tasks are ordered by dependency; items at the same level can be parallelized.

| Order | Task | Owner files | Size estimate |
|---|---|---|---|
| 1 | Collect and commit real human recordings (hi and gu); run pilot harness; confirm acceptance criteria | `qa/pilot-clips/`, `qa/pilot-pronunciation-v2.mjs`, `qa/pilot-results/` | 1-2 days |
| 2 | Add `audioGradingConfig.ts` (language set, rate limiter, per-user daily cap) | `artifacts/api-server/src/lib/audioGradingConfig.ts` | Small |
| 3 | Add `AUDIO_RUBRIC_PROMPT` constant and `audioEnsembleGrade()` helper to `openai.ts` | `artifacts/api-server/src/routes/openai.ts` | Small-medium |
| 4 | Wire `isAudioGradingEnabled` into the route: disable fast path for audio languages, replace `llmPromise` with `audioEnsembleGrade` + fallback, apply guards to audio score | same | Medium |
| 5 | Write migration `0031_audio_grading_columns.sql`; update Drizzle schema (`attempts.ts`); regenerate types | `lib/db/src/schema/attempts.ts`, `lib/db/migrations/` | Small |
| 6 | Update `openai.ts` attempt-write path to populate `audio_grade_raw`, `audio_grade_median`, `scoring_path` | `artifacts/api-server/src/routes/openai.ts`, `artifacts/api-server/src/routes/learning.ts` | Small |
| 7 | Unit tests: `audioGradingConfig` (set membership, env override, fallback behavior), ensemble grade mock (2-of-3 median logic, timeout path), guard interactions | `artifacts/api-server/src/lib/audioGradingConfig.test.ts`, `artifacts/api-server/src/routes/openai.test.ts` | Medium |
| 8 | Integration smoke test: POST /openai/pronunciation with a stub audio buffer for hi and gu; assert `scoring_path=audio_ensemble` in the DB row; assert band is in the valid set | `artifacts/api-server/src/routes/openai.test.ts` | Small-medium |
| 9 | Set `AUDIO_GRADING_LANGUAGES=hi,gu` in production environment (env var change only; no deploy) | Replit environment secrets | Trivial |

**Items NOT in build 32:** Azure PA integration, IndicMFA prototype, promotion of additional languages beyond hi and gu.

---

## 8. Findings: codebase divergences and open questions

### Divergences from the investigation description

1. **`gpt-5.4-mini` not `gpt-4.1-mini`:** the investigation report referenced the model by behavior; actual model string at line 1023 is `"gpt-5.4-mini"`. Spec uses the exact string from code.
2. **Fast path also generates feedback:** the fast path (line 845-993) does not just return a score; it also picks a feedback/tip string from a hardcoded pool (line 912) and calls `prewarmFeedbackTts`. The audio grading path must also call `prewarmFeedbackTts` on the feedback from the ensemble anchor call. This is not a semantic change, only a reminder to keep the TTS prewarm wired.
3. **Audio bytes are not currently retained after STT:** `speechToText` returns only `response.text`. For audio grading, the raw audio buffer must be passed through alongside the transcript to the grading call. The route already has the audio buffer (from `multer` or equivalent); verify the exact field name at build time.
4. **The `openai` client in `openai.ts` uses the project's own `OPENAI_API_KEY` (line 16 of `audio/client.ts`).** The AI integrations proxy (`AI_INTEGRATIONS_OPENAI_BASE_URL`) is separate. Audio grading calls should use the AI integrations proxy (it is already available and was used in the sandbox). A separate `audioOpenai` client instance is needed, initialized with `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY`. This keeps audio-grading costs on the Replit proxy budget, not the project's own OpenAI key.

### Open questions requiring Aakesh's decision

1. **Pilot clip storage:** should the pilot clips be committed to the repo (convenient for CI, but ~40 WAV files add bulk), stored in object storage and downloaded by the harness, or kept off-repo entirely? Spec assumes committed; change the harness if another approach is preferred.
2. **Daily user limit:** the default of 200 audio-grading calls per user per UTC day (67 attempts) is a placeholder. Confirm the correct threshold based on expected power-user behavior.
3. **Fast path for audio-graded languages:** the spec disables the fast path entirely for audio-graded languages. An alternative is to keep the fast path but treat it as a `fast_path` scoring path with a fixed score of 100 when sim >= 0.93, accepting that perfectly-transcribed attempts skip the audio quality check. Choose which behavior is preferred.
4. **Pilot ownership:** who collects the recordings? If Aakesh or family is not available to record within the build-32 window, is there an acceptable synthetic-audio fallback for the first rollout (accepting degraded calibration), or does build 32 simply defer audio grading until recordings are available?

---

## Closing status note (August 2, 2026)

Promotion gate rejected after calibration round 2 (13c314a). Judge score distribution does not separate native from american_accent clips (overlap through 82-92); native reachability 7-8% at cut 93 and ~30% at simulated cut 88 with increased american leakage. Global cap 92 remains in effect; Perfect band remains unreachable by design. Corpus (237 clips) and harness are retained as the standing evaluation gate for any future judge candidate.
