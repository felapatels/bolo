import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useSearch } from "wouter";
import { 
  useListCategoryPhrases, 
  useListCategorySentences,
  useListReviewPhrases,
  useSynthesizeSpeech, 
  useEvaluatePronunciation, 
  useCreateAttempt,
  getListCategoryPhrasesQueryKey,
  getListCategorySentencesQueryKey,
  getListReviewPhrasesQueryKey,
  getGetProgressSummaryQueryKey,
  getListRecentAttemptsQueryKey,
  getListBadgesQueryKey,
  type EarnedBadge
} from "@workspace/api-client-react";
import { ApiError } from "@workspace/api-client-react";
import { useVoiceRecorder } from "@workspace/integrations-openai-ai-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Volume2, VolumeX, ArrowRight, Loader2, RefreshCcw } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { springs, SoundWavePulse } from "@/lib/motion";
import { Confetti } from "@/components/ui/confetti";
import { BadgeUnlock } from "@/components/badge-unlock";
import { Mascot, type MascotPose } from "@/components/mascot";
import { cn } from "@/lib/utils";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { LessonBuildingScreen, LessonErrorScreen } from "@/components/lesson-states";
import { UpgradeScreen } from "@/components/plus";
import { asUpgradeRequired, upgradeHrefForDenial } from "@/lib/entitlements";
import { loadSpokenFeedback } from "@/lib/spoken-feedback";
import { loadSilentMode, saveSilentMode } from "@/lib/silent-mode";
import { MilestoneToast } from "@/components/ui/milestone-toast";

type SessionState = "intro" | "playing_coach" | "idle" | "recording" | "evaluating" | "result" | "error" | "summary";

// Shared pass/fail thresholds — must stay in sync with mobile's scoreColor()
// in artifacts/bolo-mobile/lib/ui.ts so learners see identical feedback on
// both platforms:
//   green  ≥ SCORE_PASS      (pass)
//   amber  ≥ SCORE_NEAR_MISS (near-miss)
//   red    < SCORE_NEAR_MISS (fail)
const SCORE_PASS = 70;
const SCORE_NEAR_MISS = 50;
// Celebration threshold — not a pass/fail cutoff. Confetti and "PERFECT
// SESSION" fire when every phrase clears this bar (same bar on mobile).
const SCORE_GREAT = 80;

// ScoreRing — animates a circular SVG arc from 0 to the earned score,
// with a centered number that springs in once the arc reaches it.
// Colors shift by band: green ≥70 (pass), amber 50–69, red below 50 (fail).
// Pass size="small" for the compact variant used in the session summary.
const RING_R = 44;
const RING_STROKE = 8;
const RING_CIRCUM = 2 * Math.PI * RING_R;
const RING_SIZE = RING_R * 2 + RING_STROKE;

const SMALL_RING_R = 24;
const SMALL_RING_STROKE = 5;
const SMALL_RING_CIRCUM = 2 * Math.PI * SMALL_RING_R;
const SMALL_RING_SIZE = SMALL_RING_R * 2 + SMALL_RING_STROKE;

function ScoreRing({ score, size = "normal" }: { score: number; size?: "normal" | "small" }) {
  const reduceMotion = useReducedMotion();
  const isSmall = size === "small";
  const r = isSmall ? SMALL_RING_R : RING_R;
  const stroke = isSmall ? SMALL_RING_STROKE : RING_STROKE;
  const circum = isSmall ? SMALL_RING_CIRCUM : RING_CIRCUM;
  const ringSize = isSmall ? SMALL_RING_SIZE : RING_SIZE;
  const color =
    score >= SCORE_PASS ? "hsl(var(--success))" :
    score >= SCORE_NEAR_MISS ? "hsl(var(--primary))" :
    "hsl(var(--destructive))";
  const trackColor =
    score >= SCORE_PASS ? "hsl(var(--success) / 0.15)" :
    score >= SCORE_NEAR_MISS ? "hsl(var(--primary) / 0.15)" :
    "hsl(var(--destructive) / 0.15)";
  const targetOffset = circum * (1 - score / 100);
  const center = ringSize / 2;

  return (
    <div className="relative inline-flex items-center justify-center my-1" data-testid="score-ring">
      <svg
        width={ringSize}
        height={ringSize}
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden="true"
      >
        {/* Track ring */}
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        {/* Animated progress arc */}
        <motion.circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circum}
          initial={{ strokeDashoffset: circum }}
          animate={{ strokeDashoffset: targetOffset }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.9, ease: [0.34, 1.0, 0.64, 1] }
          }
        />
      </svg>
      {/* Score number centred inside the ring */}
      <motion.span
        key={score}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 380, damping: 22, delay: 0.28 }
        }
        className={cn("absolute font-black leading-none", isSmall ? "text-[10px]" : "text-2xl")}
        style={{ color }}
        aria-hidden="true"
      >
        {score}
      </motion.span>
      {/* Screen-reader label — also keeps `getByText("Score: N")` test queries working */}
      <span className="sr-only">Score: {score}</span>
    </div>
  );
}

// Turns whatever the evaluation pipeline threw into a short, actionable
// message for the learner.
function describeEvaluationError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 502) {
      return "Bolo's squawker hit a snag 🦜 — give it another try!";
    }
    if (error.status === 429) {
      return "Whoa, that's a lot of practice! Wait a moment, then try again.";
    }
    return "Something went wrong while scoring. Please try again.";
  }
  if (error instanceof TypeError) {
    // fetch() rejects with a TypeError when the network is unreachable.
    return "Bolo flew out for a mango lassi 🥭 — check your connection and try again!";
  }
  return "Something went wrong while scoring. Please try again.";
}

// Pulsing glow ring that appears around the parrot zone while recording.
function RecordingGlow({ active }: { active: boolean }) {
  const reduceMotion = useReducedMotion();
  if (!active) return null;
  return (
    <motion.div
      className="absolute inset-0 rounded-full pointer-events-none"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={
        reduceMotion
          ? { opacity: 1, scale: 1 }
          : {
              opacity: [0.5, 1, 0.5],
              scale: [0.97, 1.03, 0.97],
              boxShadow: [
                "0 0 0px 0px hsl(var(--accent) / 0)",
                "0 0 0px 16px hsl(var(--accent) / 0.35)",
                "0 0 0px 0px hsl(var(--accent) / 0)",
              ],
            }
      }
      transition={
        reduceMotion
          ? { duration: 0.001 }
          : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
      }
      aria-hidden="true"
    />
  );
}

export default function Practice({ mode = "category" }: { mode?: "category" | "review" }) {
  const { categoryId } = useParams();
  const id = parseInt(categoryId || "0", 10);
  const isReview = mode === "review";
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const startPhraseId = searchParams.get("phrase");
  const skipMastered = searchParams.get("skipMastered") === "true";
  // The Plus-only sentence stage practices through this same session flow —
  // `?stage=sentences` swaps the phrase list for the topic's sentence list.
  const isSentences = !isReview && searchParams.get("stage") === "sentences";
  const queryClient = useQueryClient();
  const { activeLang, activeLanguage } = useLanguage();
  const native = useNativeText();

  // Where "back" goes: the review session lives off the Home dashboard, while a
  // normal lesson belongs to its category.
  const backHref = isReview ? "/app" : `/learn/${id}`;

  const categoryQuery = useListCategoryPhrases(id, activeLang, {
    query: {
      enabled: !isReview && !isSentences,
      queryKey: getListCategoryPhrasesQueryKey(id, activeLang),
    },
  });
  const sentencesQuery = useListCategorySentences(id, activeLang, {
    query: {
      enabled: isSentences,
      queryKey: getListCategorySentencesQueryKey(id, activeLang),
    },
  });
  const reviewQuery = useListReviewPhrases(
    { lang: activeLang },
    {
      query: {
        enabled: isReview,
        queryKey: getListReviewPhrasesQueryKey({ lang: activeLang }),
      },
    },
  );
  const {
    data: phrases,
    isLoading: loadingPhrases,
    isError,
    error,
    isFetching,
    refetch,
  } = isReview ? reviewQuery : isSentences ? sentencesQuery : categoryQuery;
  const synthesize = useSynthesizeSpeech();
  const evaluate = useEvaluatePronunciation();
  const createAttempt = useCreateAttempt();
  const recorder = useVoiceRecorder();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [state, setState] = useState<SessionState>("intro");
  const [result, setResult] = useState<{ score: number; feedback: string; tip: string } | null>(null);
  // Keyed by phraseId so retrying a phrase overwrites its previous entry
  // instead of appending a duplicate. The summary derives an ordered list from
  // `phrases` so phrase ordering is preserved.
  const [sessionResults, setSessionResults] = useState<Record<number, {
    phraseId: number;
    score: number;
    feedback: string;
    tip: string;
    nativeScript: string;
    english: string;
  }>>({});
  // Which phrase ring is expanded in the summary (index into orderedSummaryEntries).
  const [summarySelectedIdx, setSummarySelectedIdx] = useState<number | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [newBadges, setNewBadges] = useState<EarnedBadge[]>([]);
  const [evalError, setEvalError] = useState<string | null>(null);
  // When true, the attempt scored but saving progress failed — the learner
  // keeps their result and gets a gentle note instead of a silent reset.
  const [saveFailed, setSaveFailed] = useState(false);

  const [silentMode, setSilentMode] = useState<boolean>(loadSilentMode);
  // Read by effects so the current value is always visible inside callbacks.
  const silentModeRef = useRef<boolean>(silentMode);

  // ── Streak & toast state ─────────────────────────────────────────────────
  // Use a ref so finishRecording (in a useCallback) always sees the current value.
  const consecutiveGoodRef = useRef(0);
  const [activeToast, setActiveToast] = useState<{ message: string; key: number } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the confetti hide-timer so it can be cancelled on unmount and never
  // fires into a torn-down component (avoids "window is not defined" in tests).
  const confettiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards so each mid-session milestone fires at most once per session.
  const halfwayToastFiredRef = useRef(false);
  const lastToastFiredRef = useRef(false);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setActiveToast(prev => ({ message, key: (prev?.key ?? 0) + 1 }));
    toastTimerRef.current = setTimeout(() => setActiveToast(null), 1800);
  }, []);

  // Clear timers on unmount so they never fire into a torn-down component.
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current);
    };
  }, []);

  const changeSilentMode = (enabled: boolean) => {
    setSilentMode(enabled);
    silentModeRef.current = enabled;
    saveSilentMode(enabled);
  };

  // Warm up the microphone as soon as the practice session mounts, so the
  // first hold starts capturing immediately and the first syllable isn't
  // clipped. If permission is denied here, startRecording surfaces the
  // existing error message at hold time. The hook releases the stream on
  // unmount.
  useEffect(() => {
    recorder.prepare().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const feedbackAudioRef = useRef<HTMLAudioElement | null>(null);
  // Replays reuse the first synthesized audio for a phrase: regenerating on
  // every "hear it again" sometimes yields a different (wrong) reading.
  const coachAudioCacheRef = useRef(new Map<number, { audioBase64: string; format: string }>());

  const phrase = phrases?.[currentIndex];

  // Auto-start when phrases load (jump to a specific phrase if requested)
  useEffect(() => {
    if (phrases && phrases.length > 0 && state === "intro") {
      if (startPhraseId != null) {
        const idx = phrases.findIndex(p => p.id === parseInt(startPhraseId, 10));
        if (idx >= 0) setCurrentIndex(idx);
      } else if (skipMastered) {
        // Advance past already-mastered phrases so the session starts where
        // the learner actually has work to do. Falls back to index 0 if
        // every phrase is mastered (avoids an empty session).
        const firstUnmastered = phrases.findIndex(p => !p.mastered);
        if (firstUnmastered > 0) setCurrentIndex(firstUnmastered);
      }
      // In silent mode skip the coach voice and go straight to recording.
      setState(silentModeRef.current ? "idle" : "playing_coach");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrases, state]);

  // Prefetch the next phrase's audio while the learner is on the current one
  // so advancing feels instant. Best-effort — failures are silently swallowed.
  useEffect(() => {
    if (silentModeRef.current) return;
    const nextPhrase = phrases?.[currentIndex + 1];
    if (!nextPhrase || coachAudioCacheRef.current.has(nextPhrase.id)) return;

    let cancelled = false;
    synthesize
      .mutateAsync({ data: { text: nextPhrase.nativeScript, languageName: activeLanguage?.name } })
      .then((res) => {
        if (!cancelled) {
          coachAudioCacheRef.current.set(nextPhrase.id, {
            audioBase64: res.audioBase64,
            format: res.format,
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, phrases]);

  // Handle coach playing
  useEffect(() => {
    if (state === "playing_coach" && phrase) {
      let cancelled = false;
      const playCoach = async () => {
        try {
          const cached = coachAudioCacheRef.current.get(phrase.id);
          const res = cached ?? await synthesize.mutateAsync({ data: { text: phrase.nativeScript, languageName: activeLanguage?.name } });
          coachAudioCacheRef.current.set(phrase.id, { audioBase64: res.audioBase64, format: res.format });
          if (cancelled) return;
          const audio = new Audio(`data:audio/${res.format};base64,${res.audioBase64}`);
          audioRef.current = audio;
          audio.onended = () => setState("idle");
          await audio.play();
        } catch (error) {
          if (!cancelled) {
            console.error("Failed to synthesize speech", error);
            setState("idle");
          }
        }
      };
      playCoach();

      return () => {
        cancelled = true;
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, phrase?.id]);

  // Read the coach's full feedback out loud whenever a result appears.
  useEffect(() => {
    const spokenText = result
      ? [result.feedback, result.tip].filter(Boolean).join(" ")
      : "";
    // Read the setting fresh each time a result lands, so a toggle flipped on
    // the Account page applies to the very next score without a reload.
    if (state === "result" && spokenText && loadSpokenFeedback()) {
      let cancelled = false;
      const speak = async () => {
        try {
          const res = await synthesize.mutateAsync({ data: { text: spokenText } });
          if (cancelled) return;
          const audio = new Audio(`data:audio/${res.format};base64,${res.audioBase64}`);
          feedbackAudioRef.current = audio;
          await audio.play();
        } catch {
          // A missed read-aloud shouldn't interrupt practice; stay silent.
        }
      };
      speak();

      return () => {
        cancelled = true;
        if (feedbackAudioRef.current) {
          feedbackAudioRef.current.pause();
          feedbackAudioRef.current = null;
        }
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, result?.feedback, result?.tip]);

  // Prevents a manual stop and any double-release from both firing.
  const finishingRef = useRef(false);
  // True once recorder.startRecording() has resolved — lets finishRecording
  // guard without capturing stale React state in a closure.
  const isRecordingRef = useRef(false);
  // True when pointerUp fires before startRecording resolves (quick tap / slow
  // permission grant). startRecording checks this after it resolves and calls
  // finishRecording immediately so the release is never silently dropped.
  const isPendingStopRef = useRef(false);

  const finishRecording = useCallback(async () => {
    if (finishingRef.current) return;
    // Guard via ref, not React state — state may still be "idle" in the closure
    // if this is called synchronously right after startRecording sets the ref.
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    finishingRef.current = true;
    setState("evaluating");
    setEvalError(null);
    setSaveFailed(false);
    try {
      const blob = await recorder.stopRecording();

      if (blob.size === 0) {
        // The recorder produced no audio at all (mic went away, recorder
        // failed). Tell the learner rather than sending an empty payload.
        setEvalError("We didn't capture any audio. Check your microphone and try again.");
        setState("error");
        return;
      }

      // Blob to base64
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const audioBase64 = btoa(binary);

      const evalRes = await evaluate.mutateAsync({
        data: {
          phraseId: phrase!.id,
          targetNative: phrase!.nativeScript,
          targetRomanized: phrase!.romanized,
          targetEnglish: phrase!.english,
          languageName: activeLanguage?.name,
          audioBase64,
          mimeType: blob.type
        }
      });

      setResult({
        score: evalRes.score,
        feedback: evalRes.feedback,
        tip: evalRes.tip,
      });
      // Overwrite by phraseId so retries replace rather than duplicate.
      setSessionResults(prev => ({
        ...prev,
        [phrase!.id]: {
          phraseId: phrase!.id,
          score: evalRes.score,
          feedback: evalRes.feedback,
          tip: evalRes.tip,
          nativeScript: phrase!.nativeScript,
          english: phrase!.english,
        },
      }));

      // The learner has their score — show it now. Saving the attempt below
      // must never take the result away from them.
      setState("result");

      if (evalRes.score >= SCORE_GREAT) {
        setShowConfetti(true);
        if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current);
        confettiTimeoutRef.current = setTimeout(() => setShowConfetti(false), 3000);
      }

      // Hot-streak tracking: increment consecutive good counter (score ≥ 70)
      // using a ref so we always see the latest value inside this callback.
      const newConsec = evalRes.score >= 70 ? consecutiveGoodRef.current + 1 : 0;
      consecutiveGoodRef.current = newConsec;
      if (newConsec === 3) showToast("🔥 3 in a row!");
      else if (newConsec === 5) showToast("🔥🔥 On a roll!");
      else if (newConsec === 10) showToast("🔥🔥🔥 UNSTOPPABLE!");

      try {
        // Save the attempt for the signed-in user. The score/feedback are
        // carried inside the server-signed evaluation token, so the server —
        // not the client — decides what gets recorded. The response reports any
        // badges newly earned by this attempt, which the server awards exactly
        // once per (user, language) — so this celebration never replays.
        const attemptRes = await createAttempt.mutateAsync({
          data: {
            evaluationToken: evalRes.evaluationToken
          }
        });

        // Invalidate queries so progress updates
        queryClient.invalidateQueries({ queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }) });
        queryClient.invalidateQueries({ queryKey: getListRecentAttemptsQueryKey({ lang: activeLang, limit: 12 }) });
        queryClient.invalidateQueries({ queryKey: getListCategoryPhrasesQueryKey(id, activeLang) });
        queryClient.invalidateQueries({ queryKey: getListCategorySentencesQueryKey(id, activeLang) });
        queryClient.invalidateQueries({ queryKey: getListReviewPhrasesQueryKey({ lang: activeLang }) });
        queryClient.invalidateQueries({ queryKey: getListBadgesQueryKey({ lang: activeLang }) });

        if (attemptRes.newlyEarnedBadges.length > 0) {
          setNewBadges(attemptRes.newlyEarnedBadges);
        }
      } catch (saveError) {
        console.error("Saving the attempt failed", saveError);
        setSaveFailed(true);
      }
    } catch (error) {
      console.error("Evaluation failed", error);
      setEvalError(describeEvaluationError(error));
      setState("error");
    } finally {
      finishingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, evaluate, createAttempt, queryClient, phrase, id, activeLang, activeLanguage]);

  const startRecording = async () => {
    if (state !== "idle") return;
    isPendingStopRef.current = false;
    setEvalError(null);
    try {
      // Hold-to-talk always uses manual stop — the learner releases their
      // finger to finish, so silence detection is not needed.
      await recorder.startRecording(undefined);
      isRecordingRef.current = true;
      setState("recording");
      // Race: if the learner released before startRecording resolved (quick tap
      // or slow permission grant), honour that release immediately now.
      if (isPendingStopRef.current) {
        void finishRecording();
      }
    } catch {
      setEvalError("We couldn't access your microphone. Allow mic access in your browser, then try again.");
      setState("error");
    }
  };

  const handleBellyPointerDown = (e: React.PointerEvent) => {
    // Capture the pointer so pointerup fires on this element even if the
    // learner's finger drifts off it slightly.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture is unavailable in some test/jsdom environments.
    }
    void startRecording();
  };

  const handleBellyPointerUp = () => {
    if (isRecordingRef.current) {
      void finishRecording();
    } else {
      // Recording hasn't started yet — flag it so startRecording stops
      // immediately once the recorder resolves (quick-tap / permission lag).
      isPendingStopRef.current = true;
    }
  };

  const handleBellyPointerCancel = () => {
    if (isRecordingRef.current) {
      void finishRecording();
    } else {
      isPendingStopRef.current = true;
    }
  };

  const handleErrorRetry = () => {
    setEvalError(null);
    setState("idle");
  };

  const handleNext = () => {
    setResult(null);
    setShowConfetti(false);
    if (phrases && currentIndex < phrases.length - 1) {
      const nextIndex = currentIndex + 1;
      // Mid-session milestone toasts — fire at most once each per session.
      if (phrases.length >= 4 && nextIndex === Math.floor(phrases.length / 2) && !halfwayToastFiredRef.current) {
        halfwayToastFiredRef.current = true;
        showToast("Halfway there! 💪");
      } else if (nextIndex === phrases.length - 1 && !lastToastFiredRef.current) {
        lastToastFiredRef.current = true;
        showToast("Last one! 🦜 Finish strong!");
      }
      setCurrentIndex(c => c + 1);
      // In silent mode skip the coach voice and go straight to recording.
      setState(silentMode ? "idle" : "playing_coach");
    } else {
      setState("summary");
    }
  };

  const handleRetry = () => {
    setResult(null);
    setShowConfetti(false);
    // Return through the coach playback so the learner hears the model
    // pronunciation again before re-recording. In silent mode, skip straight
    // to idle so the mic is available immediately.
    setState(silentMode ? "idle" : "playing_coach");
  };

  const playAgain = () => {
    setState("playing_coach");
  };

  const upgrade = asUpgradeRequired(error);
  if (upgrade) {
    return (
      <UpgradeScreen
        backHref={backHref}
        title={
          upgrade.reason === "daily_lesson_limit"
            ? "You've hit today's free lessons"
            : upgrade.reason === "feature_locked"
              ? isSentences
                ? "Full sentences are a Plus feature"
                : "Review is a Plus feature"
              : "Unlock this language"
        }
        message={upgrade.message}
        upgradeHref={upgradeHrefForDenial(upgrade, activeLang)}
        showTrial={upgrade.reason === "daily_lesson_limit"}
      />
    );
  }

  if (isError) {
    return (
      <LessonErrorScreen
        backHref={backHref}
        onRetry={() => { void refetch(); }}
        isRetrying={isFetching}
      />
    );
  }

  if (loadingPhrases || !phrases) {
    return (
      <LessonBuildingScreen
        languageName={activeLanguage?.name}
        backHref={backHref}
      />
    );
  }

  if (phrases.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold mb-4">
          {isReview
            ? "Nothing to review right now."
            : isSentences
              ? "No sentences found here."
              : "No phrases found here."}
        </h2>
        <Link href={backHref} className="text-primary font-bold">Go back</Link>
      </div>
    );
  }

  if (state === "summary") {
    // Build an ordered, deduplicated list of results: one entry per phrase,
    // in the order they appear in the phrase list. Retries have already
    // overwritten earlier attempts in the record, so we get the latest score.
    const orderedSummaryEntries = phrases
      .map(p => sessionResults[p.id])
      .filter((r): r is NonNullable<typeof r> => r !== undefined);
    const attemptCount = orderedSummaryEntries.length;
    const avgScore = attemptCount > 0
      ? Math.round(orderedSummaryEntries.reduce((a, b) => a + b.score, 0) / attemptCount)
      : 0;
    const isPerfect = attemptCount > 0 && orderedSummaryEntries.every(r => r.score >= SCORE_GREAT);
    // XP: rounded-to-tens of avg score × phrase count, capped at 50
    const xpEarned = Math.min(Math.round(avgScore / 10) * attemptCount, 50);
    return (
      <div className="app-surface min-h-screen flex flex-col bg-background p-6 mx-auto w-full max-w-xl">
        <Confetti active={isPerfect || avgScore >= 70} variant={isPerfect ? "perfect" : "default"} />
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <Mascot pose={avgScore >= SCORE_NEAR_MISS ? "cheer" : "thumbsup"} size={148} idle={avgScore >= SCORE_NEAR_MISS ? "cheer" : "float"} />
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className={cn(
              "text-4xl font-black",
              isPerfect ? "text-amber-500" : "text-foreground",
            )}
          >
            {isPerfect ? "PERFECT SESSION! 🏆" : avgScore >= SCORE_PASS ? "You crushed it!" : avgScore >= SCORE_NEAR_MISS ? "Session Complete!" : "Great effort!"}
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, type: "spring", stiffness: 260, damping: 18 }}
            className={cn(
              "p-6 rounded-3xl w-full max-w-sm border shadow-sm",
              isPerfect ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" : "bg-white border-card-border",
            )}
          >
            <p className="text-muted-foreground font-bold uppercase tracking-wider mb-2">Average Score</p>
            <div className={cn(
              "text-6xl font-black",
              avgScore >= SCORE_PASS ? "text-success" : avgScore >= SCORE_NEAR_MISS ? "text-primary" : "text-destructive"
            )}>
              {avgScore}
            </div>
            {/* XP earned chip */}
            <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-950/40 px-4 py-1 text-sm font-black text-violet-600 dark:text-violet-400">
              +{xpEarned} XP earned
            </div>
            <p className="text-muted-foreground mt-3 font-medium">You practiced {attemptCount} {isSentences ? "sentences" : "phrases"}.</p>

            {/* ── Per-phrase score rings ──────────────────────────────── */}
            {orderedSummaryEntries.length > 0 && (
              <div className="mt-4 w-full">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Per-phrase scores
                </p>
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
                  {orderedSummaryEntries.map((r, i) => (
                    <button
                      key={r.phraseId}
                      onClick={() => setSummarySelectedIdx(summarySelectedIdx === i ? null : i)}
                      className="flex flex-col items-center gap-0.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Phrase ${i + 1}: ${r.english}, score ${r.score}`}
                      aria-expanded={summarySelectedIdx === i}
                    >
                      <ScoreRing score={r.score} size="small" />
                      <span className="text-[9px] text-muted-foreground max-w-[56px] truncate leading-tight">
                        {r.english}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Expandable feedback panel for the selected phrase */}
                <AnimatePresence>
                  {summarySelectedIdx !== null && orderedSummaryEntries[summarySelectedIdx] && (
                    <motion.div
                      key={summarySelectedIdx}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                      className="mt-3 rounded-xl border border-card-border bg-muted/50 p-3 text-left space-y-1"
                    >
                      <p className="font-bold text-sm text-foreground">
                        {orderedSummaryEntries[summarySelectedIdx].english}
                      </p>
                      {orderedSummaryEntries[summarySelectedIdx].feedback && (
                        <p className="text-sm text-muted-foreground">
                          {orderedSummaryEntries[summarySelectedIdx].feedback}
                        </p>
                      )}
                      {orderedSummaryEntries[summarySelectedIdx].tip && (
                        <p className="text-xs text-muted-foreground/75 italic">
                          {orderedSummaryEntries[summarySelectedIdx].tip}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>
        
        <Link href={backHref} className="w-full bg-primary text-primary-foreground font-black text-xl py-5 rounded-2xl flex items-center justify-center shadow-[0_8px_0_hsl(var(--primary-shadow))] active:translate-y-2 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all">
          Done
        </Link>
      </div>
    );
  }

  // Bolo reacts to the moment: listening/thinking while the coach speaks or the
  // learner records, encouraging on their turn, and celebrating (or gently
  // cheering back up) once a score lands.
  const mascotPose: MascotPose =
    state === "result" && result
      ? result.score >= SCORE_PASS
        ? "cheer"
        : result.score >= SCORE_NEAR_MISS
          ? "thumbsup"
          : "tryagain"
      : state === "error"
        ? "tryagain"
        : state === "playing_coach" || state === "recording" || state === "evaluating"
          ? "thinking"
          : "thumbsup";

  // The belly zone is interactive only when the learner can actually record.
  const bellyActive = state === "idle" || state === "recording";

  return (
    <div className="app-surface min-h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      <Confetti active={showConfetti} />
      <BadgeUnlock badges={newBadges} onDismiss={() => setNewBadges([])} />
      
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="mx-auto w-full max-w-2xl px-4 py-3 flex items-center justify-between gap-3 shrink-0">
        <Link href={backHref} className="text-muted-foreground hover:text-foreground shrink-0">
          <ArrowLeft className="w-7 h-7" />
        </Link>
        <div className="flex-1">
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-secondary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${((currentIndex) / phrases.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
        <div className="font-bold text-sm text-muted-foreground shrink-0">{currentIndex + 1}/{phrases.length}</div>
        {/* Silent mode toggle lives in the header so it stays accessible */}
        <button
          onClick={() => changeSilentMode(!silentMode)}
          aria-pressed={silentMode}
          title={silentMode ? "Silent mode on — tap to hear the coach first" : "Tap to skip the coach voice"}
          className={cn(
            "shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-xs font-bold transition-all",
            silentMode
              ? "bg-secondary text-white shadow-sm"
              : "bg-muted text-muted-foreground",
          )}
        >
          {silentMode ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 flex flex-col px-4 pb-4 min-h-0">

        {/* ── Phrase card ─────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={phrase?.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={springs.snappy}
            className="shrink-0 bg-white rounded-2xl border border-card-border shadow-sm overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Play-again button */}
              <button
                onClick={playAgain}
                disabled={state === "recording" || state === "evaluating"}
                aria-label="Hear the phrase again"
                className="shrink-0 w-11 h-11 bg-secondary text-white rounded-full flex items-center justify-center shadow-md active:scale-95 disabled:opacity-40 transition-all"
              >
                <Volume2 className="w-5 h-5" />
              </button>

              <div className="flex-1 min-w-0">
                <h2
                  className="text-3xl font-extrabold text-foreground leading-tight tracking-tight truncate"
                  style={native.style}
                  dir={native.dir}
                >
                  {phrase?.nativeScript}
                </h2>
                <p className="text-primary font-bold text-base leading-tight">{phrase?.romanized}</p>
                <p className="text-muted-foreground text-sm leading-tight">{phrase?.english}</p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* ── Parrot zone ──────────────────────────────────────────────────── */}
        {/*
          The parrot takes all remaining vertical space. The belly hit zone is
          an absolutely-positioned transparent button on the lower-center of the
          image area so the interaction feels spatially tied to the character.
        */}
        <div className="flex-1 relative flex flex-col items-center justify-center min-h-0 mt-1">
          {/* Parrot image */}
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Glow ring while recording */}
            <motion.div
              className="absolute inset-[10%] rounded-full pointer-events-none"
              animate={
                state === "recording"
                  ? {
                      boxShadow: [
                        "0 0 0px 0px hsl(var(--accent) / 0)",
                        "0 0 0px 24px hsl(var(--accent) / 0.3)",
                        "0 0 0px 0px hsl(var(--accent) / 0)",
                      ],
                      opacity: [0.6, 1, 0.6],
                    }
                  : { boxShadow: "0 0 0px 0px hsl(var(--accent) / 0)", opacity: 0 }
              }
              transition={
                state === "recording"
                  ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.3 }
              }
              aria-hidden="true"
            />

            <AnimatePresence mode="wait">
              <motion.div
                key={mascotPose}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{
                  opacity: state === "evaluating" ? 0.55 : 1,
                  scale: state === "recording" ? 1.04 : 1,
                }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={springs.snappy}
                className="w-full h-full"
              >
                <Mascot
                  pose={mascotPose}
                  fill
                  idle={state === "result" && (result?.score ?? 0) >= SCORE_PASS ? "cheer" : "float"}
                />
              </motion.div>
            </AnimatePresence>

            {/* Evaluating spinner — centred over the belly zone */}
            {state === "evaluating" && (
              <div className="absolute bottom-[18%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
                <Loader2 className="w-10 h-10 animate-spin text-primary drop-shadow-lg" />
              </div>
            )}

            {/* Belly hit zone — lower-center of the parrot image area */}
            {bellyActive && (
              <div
                className="absolute"
                style={{
                  bottom: "10%",
                  left: "20%",
                  right: "20%",
                  height: "38%",
                }}
              >
                <button
                  onPointerDown={handleBellyPointerDown}
                  onPointerUp={handleBellyPointerUp}
                  onPointerLeave={handleBellyPointerUp}
                  onPointerCancel={handleBellyPointerCancel}
                  disabled={!bellyActive}
                  aria-label={state === "recording" ? "Release to submit" : "Hold to speak"}
                  style={{ touchAction: "none" }}
                  className="w-full h-full rounded-[40%] bg-transparent cursor-pointer select-none focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* ── Milestone toast (streak / halfway / last phrase) ────────── */}
          <MilestoneToast
            message={activeToast?.message ?? null}
            toastKey={activeToast?.key ?? null}
          />

          {/* ── Instruction label ───────────────────────────────────────── */}
          <div className="shrink-0 h-12 flex items-center justify-center mt-1">
            <AnimatePresence mode="wait">
              {state === "idle" && (
                <motion.p
                  key="hold-to-speak"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={springs.snappy}
                  className="text-center text-muted-foreground font-bold uppercase tracking-widest text-xs"
                >
                  Hold to speak
                </motion.p>
              )}
              {state === "recording" && (
                <motion.div
                  key="listening"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={springs.snappy}
                  className="flex flex-col items-center gap-1.5"
                >
                  <SoundWavePulse className="text-accent" size={22} bars={7} />
                  <p className="text-center text-accent font-bold uppercase tracking-widest text-xs">
                    Listening…
                  </p>
                </motion.div>
              )}
              {state === "playing_coach" && (
                <motion.p
                  key="listen-first"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={springs.snappy}
                  className="text-center text-muted-foreground font-medium text-sm"
                >
                  Listen first…
                </motion.p>
              )}
              {state === "evaluating" && (
                <motion.p
                  key="evaluating"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={springs.snappy}
                  className="text-center text-muted-foreground font-medium text-sm"
                >
                  Scoring…
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Bottom panel: result / error / action buttons ────────────── */}
        {(state === "result" || state === "error") && (
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springs.bouncy}
              className="shrink-0 space-y-3 mt-2"
            >
              {state === "error" && evalError && (
                <div
                  className="bg-white rounded-2xl p-4 border border-destructive/30 shadow-sm text-center"
                  role="alert"
                >
                  <p className="text-lg font-black mb-1 text-destructive">Oops, that didn't work</p>
                  <p className="text-foreground font-medium text-sm leading-snug">{evalError}</p>
                </div>
              )}

              {state === "result" && result && (
                <div className="bg-white rounded-2xl p-4 border border-card-border shadow-sm text-center">
                  <p className={cn(
                    "text-xl font-black mb-1",
                    result.score >= SCORE_PASS ? "text-success" :
                    result.score >= SCORE_NEAR_MISS ? "text-primary" :
                    "text-foreground"
                  )}>
                    {result.score >= SCORE_PASS ? "Amazing!" : result.score >= SCORE_NEAR_MISS ? "Nice work!" : "Good try — keep going!"}
                  </p>
                  <ScoreRing score={Math.round(result.score)} />
                  <p className="text-foreground font-medium text-sm leading-snug mb-2">"{result.feedback}"</p>
                  {result.tip && (
                    <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-xl">Tip: {result.tip}</p>
                  )}
                  {saveFailed && (
                    <p className="mt-2 text-xs text-destructive font-medium">
                      Heads up — this attempt couldn't be saved to your progress.
                    </p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              {state === "error" ? (
                <button
                  onClick={handleErrorRetry}
                  className="w-full bg-primary text-primary-foreground font-black text-lg py-4 rounded-2xl flex items-center justify-center gap-2 shadow-[0_6px_0_hsl(var(--primary-shadow))] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
                >
                  <RefreshCcw className="w-5 h-5" /> Try again
                </button>
              ) : (
                <div className="flex gap-3">
                  <button 
                    onClick={handleRetry}
                    className="flex-1 bg-white text-foreground border-2 border-border font-bold text-base py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <RefreshCcw className="w-5 h-5" /> Retry
                  </button>
                  <button 
                    onClick={handleNext}
                    className="flex-1 bg-primary text-primary-foreground font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 shadow-[0_6px_0_hsl(var(--primary-shadow))] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
                  >
                    Next <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </motion.div>
          )}
      </main>
    </div>
  );
}
