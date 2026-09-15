// SPEAK, SCORE, RECORD THE ATTEMPT: practice's path, for a screen that is not practice.
//
// Web twin of bolo-mobile hooks/useSpeakAndScore.ts (Last Call slice 2,
// 2026-09-14). Owner ruling: gating, mastery and XP on a Last Call stop must be
// THE SAME as on a voice stop. There is exactly one way the server learns a
// learner said a phrase, and it is the one src/pages/practice.tsx
// finishRecording uses:
//
//   1. recorder.stopRecording() + the MIN_CLIP_SECONDS guard   useVoiceRecorder
//   2. POST /openai/pronunciation                              useEvaluatePronunciation
//   3. normalizeBand(band, score)                              components/ui/band-pill
//   4. POST /attempts { canClaimGift: true, evaluationToken }  useCreateAttempt
//   5. applyOptimisticTodayXp + the same eight query           @workspace/train-class,
//      invalidations web practice fires for a group session     api-client-react keys
//
// The server derives lesson-group completion and the unlock of the next stop
// from those attempt rows, and writes the XP ledger row on the attempt, so
// mirroring steps 1 to 5 is the whole of "the same gating".
//
// PRACTICE IS NOT CHANGED BY THIS FILE, for the reason the mobile twin gives:
// practice's finishRecording is interleaved with its own UI state (the
// first-word lightbox, encores, capture mode, the XP arc). KEEP THEM IN STEP: a
// change to what web practice sends to /pronunciation or /attempts belongs here
// too, and so does a change to its invalidation list.
//
// TWO DELIBERATE DIFFERENCES FROM THE MOBILE HOOK, both inherited from the
// practice each one mirrors rather than invented:
//  - `too_short`. Web practice refuses to send a clip under MIN_CLIP_SECONDS
//    (the pilot's R3 class: fragments transcribe as retry). Mobile practice has
//    no such guard, so the mobile hook has no such outcome. The screen reads it
//    as a no-strike re-ask, the same as a nocatch band.
//  - The invalidation list is WEB practice's (recent attempts keyed with
//    limit 12, plus review phrases and the category's lesson groups), not the
//    mobile list, because the keys must match the queries this client mounts.
//
// AI CONSENT. Web gates consent at the route (App.tsx Guard wraps every signed
// in route in AiConsentBoundary), so there is no per-file door census to
// register this with, unlike mobile's ai-consent-doors.test.ts.

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useEvaluatePronunciation,
  useCreateAttempt,
  getGetProgressSummaryQueryKey,
  getListRecentAttemptsQueryKey,
  getListCategoryPhrasesQueryKey,
  getListCategorySentencesQueryKey,
  getListReviewPhrasesQueryKey,
  getListBadgesQueryKey,
  getListCategoryLessonGroupsQueryKey,
  getListLessonGroupPhrasesQueryKey,
  type EarnedBadge,
  type Phrase,
  isAiConsentRequiredError,
} from "@workspace/api-client-react";
import { applyOptimisticTodayXp } from "@workspace/train-class";
import { useVoiceRecorder } from "@workspace/integrations-openai-ai-react";
import { normalizeBand, type Band } from "@/components/ui/band-pill";

/**
 * How long a take may sit with the scorer before the round gives up on it and
 * re-asks with no strike. TUNING PENDING. Same value as the mobile twin.
 */
export const SPEAK_SCORE_TIMEOUT_MS = 15_000;

/**
 * Web practice's shortest scoreable clip (practice.tsx MIN_CLIP_SECONDS),
 * restated because practice does not export it. If practice's value moves,
 * this one moves with it.
 */
export const SPEAK_MIN_CLIP_SECONDS = 0.8;

export type SpeakScoreOutcome =
  | {
      kind: "scored";
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
  /** The clip was empty or under SPEAK_MIN_CLIP_SECONDS. Nothing was sent. */
  | { kind: "too_short" }
  /** The scorer did not answer in time. Any late answer is dropped, and no attempt is recorded for it. */
  | { kind: "timeout" }
  /** Recording or scoring threw. */
  | { kind: "error" }
  /**
   * The server refused the take because this learner declined AI permission
   * (isAiConsentRequiredError). Not retryable until they change their answer,
   * so a game must stop rather than re-ask (India consent, 2026-09-15).
   */
  | { kind: "consent_required" };

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
  /** Called once when a take goes quiet after speech (the recorder's own silence detector). */
  onSilence?: () => void;
  scoringTimeoutMs?: number;
}) {
  const queryClient = useQueryClient();
  const recorder = useVoiceRecorder();
  const evaluate = useEvaluatePronunciation();
  const createAttempt = useCreateAttempt();
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);
  const deniedRef = useRef(false);
  const onSilenceRef = useRef(onSilence);
  onSilenceRef.current = onSilence;

  // Destructured so the callbacks below depend on the recorder's stable
  // callbacks rather than on its return object, which is new every render.
  const { prepare: recorderPrepare, startRecording, stopRecording, abortRecording, getLastDurationSeconds, getAmplitude } =
    recorder;

  /** Warm the microphone so the first syllable is not clipped. Never throws. */
  const prepare = useCallback(async (): Promise<boolean> => {
    try {
      await recorderPrepare();
      return true;
    } catch {
      // Denied or no device: startRecording surfaces it at the gesture.
      return false;
    }
  }, [recorderPrepare]);

  /** True when the last start failed on microphone permission, so the screen can say so. */
  const permissionDenied = useCallback(() => deniedRef.current, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (recordingRef.current) return true;
    deniedRef.current = false;
    try {
      await startRecording({ onSilence: () => onSilenceRef.current?.() });
      recordingRef.current = true;
      setRecording(true);
      return true;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      deniedRef.current = name === "NotAllowedError" || name === "SecurityError";
      return false;
    }
  }, [startRecording]);

  /** Drop a take without scoring it (leaving the page mid-take, or a prompt that stole the press). */
  const cancel = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
    abortRecording();
  }, [abortRecording]);

  const stopAndScore = useCallback(
    async (phrase: Pick<Phrase, "id" | "nativeScript" | "romanized" | "english">): Promise<SpeakScoreOutcome> => {
      recordingRef.current = false;
      setRecording(false);
      let audioBase64: string;
      let mimeType: string;
      try {
        const blob = await stopRecording();
        // Read synchronously after the await, per the recorder's contract.
        const seconds = getLastDurationSeconds();
        if (blob.size === 0 || seconds < SPEAK_MIN_CLIP_SECONDS) return { kind: "too_short" };
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
        audioBase64 = btoa(binary);
        mimeType = blob.type;
      } catch {
        return { kind: "error" };
      }
      // Step 2, the same body web practice sends (minus capture mode, which is
      // practice-only scaffolding).
      const evaluation = evaluate.mutateAsync({
        data: {
          phraseId: phrase.id,
          targetNative: phrase.nativeScript,
          targetRomanized: phrase.romanized,
          targetEnglish: phrase.english,
          languageName,
          audioBase64,
          mimeType,
        },
      });
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timedOut = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), scoringTimeoutMs);
      });
      let raw: Awaited<typeof evaluation> | "timeout";
      try {
        raw = await Promise.race([evaluation, timedOut]);
      } catch (err) {
        return isAiConsentRequiredError(err) ? { kind: "consent_required" } : { kind: "error" };
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (raw === "timeout") {
        // A late evaluation is dropped rather than recorded: the round has
        // already re-asked, and saving it would pay XP for a take the learner
        // was told did not count. Swallow its eventual rejection.
        evaluation.catch(() => undefined);
        return { kind: "timeout" };
      }
      const band = normalizeBand(raw.band, raw.score);
      const heard = { transcript: raw.transcript ?? "", transcriptRomanized: raw.transcriptRomanized ?? "" };
      // Steps 4 and 5, mirroring web practice's non-test-out branch.
      try {
        const attempt = await createAttempt.mutateAsync({
          data: { canClaimGift: true, evaluationToken: raw.evaluationToken },
        });
        applyOptimisticTodayXp(queryClient, languageCode, raw.xpAwarded);
        queryClient.invalidateQueries({ queryKey: getGetProgressSummaryQueryKey({ lang: languageCode }) });
        queryClient.invalidateQueries({ queryKey: getListRecentAttemptsQueryKey({ lang: languageCode, limit: 12 }) });
        queryClient.invalidateQueries({ queryKey: getListCategoryPhrasesQueryKey(categoryId, languageCode) });
        queryClient.invalidateQueries({ queryKey: getListCategorySentencesQueryKey(categoryId, languageCode) });
        queryClient.invalidateQueries({ queryKey: getListReviewPhrasesQueryKey({ lang: languageCode }) });
        queryClient.invalidateQueries({ queryKey: getListBadgesQueryKey({ lang: languageCode }) });
        // Spec D1b, as practice: the map's station states derive from attempts.
        queryClient.invalidateQueries({ queryKey: getListCategoryLessonGroupsQueryKey(categoryId, languageCode) });
        queryClient.invalidateQueries({ queryKey: getListLessonGroupPhrasesQueryKey(lessonGroupId) });
        return {
          kind: "scored",
          band,
          xpAwarded: raw.xpAwarded,
          attemptSaved: true,
          newlyEarnedBadges: attempt.newlyEarnedBadges ?? [],
          ...heard,
        };
      } catch {
        return { kind: "scored", band, xpAwarded: raw.xpAwarded, attemptSaved: false, newlyEarnedBadges: [], ...heard };
      }
    },
    [
      stopRecording,
      getLastDurationSeconds,
      evaluate,
      createAttempt,
      queryClient,
      languageCode,
      languageName,
      categoryId,
      lessonGroupId,
      scoringTimeoutMs,
    ],
  );

  // getAmplitude is the recorder's own live level (0..1), passed through for the
  // voice bars (hooks/useInputLevel.ts). Mobile twin returns `metering`.
  return { recording, prepare, start, stopAndScore, cancel, permissionDenied, getAmplitude };
}
