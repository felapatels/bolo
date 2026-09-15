// SPEAK, SCORE, RECORD THE ATTEMPT: practice's path, for a screen that is not practice.
//
// Owner ruling, 2026-09-14 (Last Call, slice 1): gating, mastery and XP on a
// Last Call stop must be THE SAME as on a voice stop. There is exactly one way
// the server learns a learner said a phrase, and it is the one
// app/(app)/practice/[id].tsx stopRecording uses:
//
//   1. stopAndReadRecording(recorder)             lib/audio.ts
//   2. POST /openai/pronunciation                 useEvaluatePronunciation
//   3. normalizeBand(band, score)                 lib/ui.ts
//   4. POST /attempts { evaluationToken,          useCreateAttempt
//        canClaimGift: true }
//   5. applyOptimisticTodayXp + the same six      @workspace/train-class,
//      query invalidations practice fires           api-client-react keys
//
// The server derives lesson-group completion ("80% of phrases at bestScore >=
// 80") and the unlock of the next stop from those attempt rows at read time,
// and writes the XP ledger row on the attempt. So mirroring steps 1 to 5
// exactly is the whole of "the same gating", and nothing here invents a
// persistence path.
//
// PRACTICE IS NOT CHANGED BY THIS FILE. The brief allowed extracting a shared
// hook out of practice but forbade changing practice's behaviour in this slice,
// and practice's stopRecording is interleaved with its own UI state (the
// first-word lightbox, encores, the XP arc). So this is a NEW hook calling the
// same underlying helpers in the same order, and the two are twins until a
// later slice moves practice onto it. KEEP THEM IN STEP: a change to what
// practice sends to /pronunciation or /attempts belongs here too.
//
// IN hooks/, NOT lib/, ON PURPOSE. This file calls useEvaluatePronunciation,
// which sends the learner's voice onward, and __tests__/ai-consent-doors.test.ts
// finds every such door by walking app/, components/ and hooks/. It does not
// walk lib/, so this hook in lib/ would have been a consent door that census
// could not see. Its SCREEN_FOR maps this file to the Last Call screen. Its
// second caller is Answer Back (app/(app)/(tabs)/games/answer-back.tsx,
// 2026-09-14), which scores every take as the RIGHT reply and reads the
// transcript this returns to tell which card was spoken.
//
// canClaimGift: true, same as practice, because this build draws the daily
// gift box: see learning.ts grantTokensDetailed and the CLAUDE.md note on the
// two doors onto one ledger row.

import React from 'react';
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useQueryClient } from '@tanstack/react-query';
import {
  useEvaluatePronunciation,
  useCreateAttempt,
  getGetProgressSummaryQueryKey,
  getListRecentAttemptsQueryKey,
  getListCategoryPhrasesQueryKey,
  getListCategorySentencesQueryKey,
  getListLessonGroupPhrasesQueryKey,
  getListBadgesQueryKey,
  type EarnedBadge,
  type Phrase,
  isAiConsentRequiredError,
} from '@workspace/api-client-react';
import { applyOptimisticTodayXp } from '@workspace/train-class';
import {
  prepareRecordingSession,
  prepareRecorderInSession,
  ensureRecordingMode,
  stopAndReadRecording,
  reportAudioSessionFailure,
  RECORDING_PRESET,
  SILENCE_THRESHOLD_DB,
  SILENCE_DURATION_MS,
  SPEECH_MIN_DB,
  SILENCE_DROP_DB,
} from '@/lib/audio';
import { normalizeBand, type Band } from '@/lib/ui';

/**
 * How long a take may sit with the scorer before the round gives up on it and
 * re-asks with no strike (owner brief: "a scoring timeout = re-ask with no
 * strike"). TUNING PENDING. Generous, because a strike-free re-ask still costs
 * the learner a turn of momentum, and practice itself has no timeout at all.
 */
export const SPEAK_SCORE_TIMEOUT_MS = 15_000;

export type SpeakScoreOutcome =
  | {
      kind: 'scored';
      band: Band;
      xpAwarded: number;
      /** False when the score came back but /attempts failed; the band still stands, as in practice. */
      attemptSaved: boolean;
      newlyEarnedBadges: EarnedBadge[];
      /**
       * What the scorer heard, straight off the evaluation. Added for Answer
       * Back (2026-09-14), which scores every take against the RIGHT reply
       * and then reads this to tell which of its three cards was spoken
       * (@workspace/script-trace answer-back.ts detectChosenCard). Last Call
       * ignores it. transcriptRomanized is "" where the server gives none.
       */
      transcript: string;
      transcriptRomanized: string;
    }
  /** The scorer did not answer in time. Any late answer is dropped, and no attempt is recorded for it. */
  | { kind: 'timeout' }
  /** Recording or scoring threw. */
  | { kind: 'error' }
  /**
   * The server refused the take because this learner declined AI permission
   * (isAiConsentRequiredError). Not retryable until they change their answer,
   * so a game must stop rather than re-ask (India consent, 2026-09-15).
   */
  | { kind: 'consent_required' };

export function useSpeakAndScore({
  lessonGroupId,
  categoryId,
  languageCode,
  languageName,
  onSilence,
  scoringTimeoutMs = SPEAK_SCORE_TIMEOUT_MS,
}: {
  lessonGroupId: number;
  /** The zone's category id, for the same category-list invalidations practice fires. */
  categoryId: number;
  languageCode: string;
  languageName: string | undefined;
  /** Called once when a take goes quiet after speech, the same auto-stop practice runs. */
  onSilence?: () => void;
  scoringTimeoutMs?: number;
}) {
  const queryClient = useQueryClient();
  const recorder = useAudioRecorder(RECORDING_PRESET);
  const evaluate = useEvaluatePronunciation();
  const createAttempt = useCreateAttempt();
  const [recording, setRecording] = React.useState(false);
  const recordingRef = React.useRef(false);

  // ── Warm-up, identical in shape to practice's prepareRecorder ───────────
  const sessionReadyRef = React.useRef(false);
  const recorderPreparedRef = React.useRef(false);
  const preparePromiseRef = React.useRef<Promise<boolean> | null>(null);
  const prepare = React.useCallback((): Promise<boolean> => {
    if (preparePromiseRef.current) return preparePromiseRef.current;
    const run = async (): Promise<boolean> => {
      try {
        if (!sessionReadyRef.current) {
          const ok = await prepareRecordingSession();
          if (!ok) return false;
          sessionReadyRef.current = true;
        }
        if (!recorderPreparedRef.current) {
          await prepareRecorderInSession(recorder);
          recorderPreparedRef.current = true;
        }
        return true;
      } catch (err) {
        reportAudioSessionFailure(sessionReadyRef.current ? 'prepare_recorder' : 'prepare_session', err);
        return false;
      } finally {
        preparePromiseRef.current = null;
      }
    };
    preparePromiseRef.current = run();
    return preparePromiseRef.current;
  }, [recorder]);

  /** True when microphone permission is missing, so the screen can say so. */
  const permissionDenied = React.useCallback(() => !sessionReadyRef.current, []);

  const start = React.useCallback(async (): Promise<boolean> => {
    if (recordingRef.current) return true;
    if (!recorderPreparedRef.current) {
      const ok = await prepare();
      if (!ok) return false;
    }
    try {
      // Coach playback flips iOS to playback-only; re-assert before record(),
      // exactly as practice does on every record path.
      await ensureRecordingMode();
      recorder.record();
      recorderPreparedRef.current = false;
      recordingRef.current = true;
      setRecording(true);
      return true;
    } catch (err) {
      recorderPreparedRef.current = false;
      reportAudioSessionFailure('start_record', err, 'record_threw');
      return false;
    }
  }, [prepare, recorder]);

  // ── Silence auto-stop, practice's adaptive rule, for tap-to-speak ────────
  const recorderState = useAudioRecorderState(recorder, 60);
  const metering = recorderState?.metering;
  const silenceSinceRef = React.useRef<number | null>(null);
  const peakDbRef = React.useRef(-160);
  const onSilenceRef = React.useRef(onSilence);
  onSilenceRef.current = onSilence;
  React.useEffect(() => {
    if (!recording) {
      silenceSinceRef.current = null;
      peakDbRef.current = -160;
      return;
    }
    if (typeof metering !== 'number') return;
    const now = Date.now();
    if (metering > peakDbRef.current) peakDbRef.current = metering;
    if (peakDbRef.current < SPEECH_MIN_DB) {
      silenceSinceRef.current = null;
      return;
    }
    const threshold = Math.max(SILENCE_THRESHOLD_DB, peakDbRef.current - SILENCE_DROP_DB);
    if (metering > threshold) {
      silenceSinceRef.current = now;
      return;
    }
    if (silenceSinceRef.current == null) {
      silenceSinceRef.current = now;
      return;
    }
    if (now - silenceSinceRef.current >= SILENCE_DURATION_MS) {
      silenceSinceRef.current = null;
      onSilenceRef.current?.();
    }
  }, [recording, metering]);

  /** Drop a take without scoring it (leaving the screen mid-take). */
  const cancel = React.useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    try {
      await recorder.stop();
    } catch {
      // Nothing to score and nothing to report: the learner left.
    }
  }, [recorder]);

  const stopAndScore = React.useCallback(
    async (phrase: Pick<Phrase, 'id' | 'nativeScript' | 'romanized' | 'english'>): Promise<SpeakScoreOutcome> => {
      recordingRef.current = false;
      setRecording(false);
      let audioBase64: string;
      try {
        audioBase64 = await stopAndReadRecording(recorder);
      } catch {
        return { kind: 'error' };
      }
      // Step 2, the same body practice sends.
      const evaluation = evaluate.mutateAsync({
        data: {
          phraseId: phrase.id,
          targetNative: phrase.nativeScript,
          targetRomanized: phrase.romanized,
          targetEnglish: phrase.english,
          languageName,
          audioBase64,
          mimeType: 'audio/m4a',
        },
      });
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timedOut = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), scoringTimeoutMs);
      });
      let raw: Awaited<typeof evaluation> | 'timeout';
      try {
        raw = await Promise.race([evaluation, timedOut]);
      } catch (err) {
        return isAiConsentRequiredError(err) ? { kind: 'consent_required' } : { kind: 'error' };
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (raw === 'timeout') {
        // A late evaluation is dropped rather than recorded: the round has
        // already re-asked, and saving it would pay XP for a take the learner
        // was told did not count. Swallow its eventual rejection.
        evaluation.catch(() => undefined);
        return { kind: 'timeout' };
      }
      const band = normalizeBand(raw.band, raw.score);
      const heard = { transcript: raw.transcript ?? '', transcriptRomanized: raw.transcriptRomanized ?? '' };
      // Step 4 and 5, mirroring practice's non-test-out branch line for line.
      try {
        const attempt = await createAttempt.mutateAsync({
          data: { evaluationToken: raw.evaluationToken, canClaimGift: true },
        });
        applyOptimisticTodayXp(queryClient, languageCode, raw.xpAwarded);
        queryClient.invalidateQueries({ queryKey: getGetProgressSummaryQueryKey({ lang: languageCode }) });
        queryClient.invalidateQueries({ queryKey: getListRecentAttemptsQueryKey({ lang: languageCode }) });
        queryClient.invalidateQueries({ queryKey: getListCategoryPhrasesQueryKey(categoryId, languageCode) });
        queryClient.invalidateQueries({ queryKey: getListCategorySentencesQueryKey(categoryId, languageCode) });
        // Practice fires this for group sessions so the map's mastered counts
        // and unlock states move; a Last Call stop is always a group session.
        queryClient.invalidateQueries({ queryKey: getListLessonGroupPhrasesQueryKey(lessonGroupId) });
        queryClient.invalidateQueries({ queryKey: getListBadgesQueryKey({ lang: languageCode }) });
        return {
          kind: 'scored',
          band,
          xpAwarded: raw.xpAwarded,
          attemptSaved: true,
          newlyEarnedBadges: attempt.newlyEarnedBadges ?? [],
          ...heard,
        };
      } catch {
        return { kind: 'scored', band, xpAwarded: raw.xpAwarded, attemptSaved: false, newlyEarnedBadges: [], ...heard };
      }
    },
    [recorder, evaluate, createAttempt, queryClient, languageCode, languageName, categoryId, lessonGroupId, scoringTimeoutMs],
  );

  // `metering` is exposed for the games' voice bars (owner, 2026-09-14: "add a
  // voice visualizer to that game so you know that your voice is getting
  // recognized"): the same dBFS reading the silence auto-stop above uses.
  return { recorder, recording, metering, prepare, start, stopAndScore, cancel, permissionDenied };
}
