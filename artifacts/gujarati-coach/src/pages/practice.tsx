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
import { ArrowLeft, Volume2, VolumeX, ArrowRight, Loader2, RefreshCcw, Headphones } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { springs, SoundWavePulse } from "@/lib/motion";
import { prefersReducedMotion } from "@/lib/motionPrefs";
import { Confetti } from "@/components/ui/confetti";
import { BadgeUnlock } from "@/components/badge-unlock";
import { Mascot, type MascotPose } from "@/components/mascot";
import { cn } from "@/lib/utils";
import { useLanguage, useNativeText, useSpeechCapability } from "@/lib/language-context";
import { LessonBuildingScreen, LessonErrorScreen } from "@/components/lesson-states";
import { UpgradeScreen } from "@/components/plus";
import { asUpgradeRequired, upgradeHrefForDenial } from "@/lib/entitlements";
import { loadSpokenFeedback, saveSpokenFeedback } from "@/lib/spoken-feedback";
import { loadSilentMode, saveSilentMode } from "@/lib/silent-mode";
import { XpCounter } from "@/components/XpCounter";
import { MilestoneToast } from "@/components/ui/milestone-toast";
import { webHaptic } from "@/lib/haptics";
import { BandPill, type Band } from "@/components/ui/band-pill";
import { playCue } from "@/lib/sound";
import { XpArc } from "@/components/XpArc";
import { CountUp } from "@/components/ui/count-up";
import { glyphsForLanguage } from "@/lib/scriptGlyphs";

type SessionState = "intro" | "playing_coach" | "idle" | "recording" | "evaluating" | "result" | "error" | "summary" | "compare";

// localStorage key that records the learner has already seen the "feedback is
// approximate" notice for a given (degraded) language, so it shows only once.
function approxNoticeKey(code: string): string {
  return `bolo.approxNoticeSeen.${code}`;
}

// Maps a pronunciation band to its CSS color (mirrors ScoreRing color thresholds).
function bandCss(band: Band): string {
  if (band === "nailed") return "hsl(var(--success))";
  if (band === "close") return "hsl(var(--primary))";
  return "hsl(var(--destructive))";
}

// Turns whatever the evaluation pipeline threw into a short, actionable
// message for the learner.
function describeEvaluationError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 502) {
      return "Bolo hit a snag 🦜 — give it another try!";
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
  // Speech-recognition capability for the active language decides how practice
  // handles feedback: "supported" scores normally; "degraded" scores but shows
  // a one-time "feedback is approximate" notice; "unsupported" drops scoring
  // entirely for a listen-record-compare (ear-training) flow.
  const speechCapability = useSpeechCapability();
  const isUnsupported = speechCapability === "unsupported";
  const isDegraded = speechCapability === "degraded";
  const languageName = activeLanguage?.name ?? "this language";

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
  const [result, setResult] = useState<{ band: Band; passed: boolean; xpAwarded: number; xpBreakdown?: string | null; feedback: string; tip: string } | null>(null);
  // Keyed by phraseId so retrying a phrase overwrites its previous entry
  // instead of appending a duplicate. The summary derives an ordered list from
  // `phrases` so phrase ordering is preserved.
  const [sessionResults, setSessionResults] = useState<Record<number, {
    phraseId: number;
    band: Band;
    xpAwarded: number;
    xpBreakdown?: string | null;
    feedback: string;
    tip: string;
    nativeScript: string;
    english: string;
  }>>({});
  // Which phrase ring is expanded in the summary (index into orderedSummaryEntries).
  const [summarySelectedIdx, setSummarySelectedIdx] = useState<number | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  // Spec 1: retry-band shake (increment retriggers), XP arc overlay state.
  const [shakeKey, setShakeKey] = useState(0);
  const [xpArc, setXpArc] = useState<{
    key: number;
    amount: number;
    from: { x: number; y: number };
  } | null>(null);
  const resultPanelRef = useRef<HTMLDivElement | null>(null);
  const xpArcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (xpArcTimerRef.current) clearTimeout(xpArcTimerRef.current);
  }, []);
  const reduceMotion = useReducedMotion();
  // ── Spec D2: live input amplitude ──────────────────────────────────────
  // A single rAF loop samples recorder.getAmplitude() while recording and
  // feeds two animation bindings — the waveform bars and the mascot scale —
  // through MotionValues, never React state. React state is only touched for
  // slow-changing facts: the zero-input hint and the reduced-motion level
  // segments (which change a few times per second at most).
  const amplitudeMv = useMotionValue(0);
  const mascotScaleRaw = useTransform(amplitudeMv, (a) => 1 + Math.min(1, a) * 0.08);
  const mascotScale = useSpring(mascotScaleRaw, { stiffness: 300, damping: 22 });
  // Zero-input state: visible once >1.5s passes with near-zero amplitude
  // while recording (mic muted / wrong device), per Spec D2 rule 7.
  const [noInput, setNoInput] = useState(false);
  // Reduced motion: static level indicator segments (0..5), not a waveform.
  const [levelSegments, setLevelSegments] = useState(0);
  useEffect(() => {
    if (state !== "recording") {
      amplitudeMv.set(0);
      setNoInput(false);
      setLevelSegments(0);
      return;
    }
    let raf = 0;
    let lastLoudAt = performance.now();
    const loop = () => {
      const amp = recorder.getAmplitude();
      // Re-check each frame so an OS preference change mid-recording switches
      // the animated feed <-> static meter immediately (matchMedia is cheap).
      if (!prefersReducedMotion()) {
        amplitudeMv.set(amp);
      } else {
        // Park the mascot at rest so a mid-recording switch to reduced motion
        // doesn't freeze it partially scaled.
        amplitudeMv.set(0);
        setLevelSegments(Math.min(5, Math.round(Math.min(1, amp) * 5)));
      }
      const now = performance.now();
      if (amp > 0.04) lastLoudAt = now;
      setNoInput(now - lastLoudAt > 1500);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const [newBadges, setNewBadges] = useState<EarnedBadge[]>([]);
  const [evalError, setEvalError] = useState<string | null>(null);
  // When true, the attempt scored but saving progress failed — the learner
  // keeps their result and gets a gentle note instead of a silent reset.
  const [saveFailed, setSaveFailed] = useState(false);
  const [xpExpanded, setXpExpanded] = useState(false);

  // ── Degraded-language notice (spec 1) ────────────────────────────────────
  // Show a one-time, dismissible "feedback is approximate" heads-up the first
  // time a learner opens a recording surface in a degraded language. The seen
  // state persists per language code so it never reappears.
  const [showApproxNotice, setShowApproxNotice] = useState(false);
  useEffect(() => {
    if (!isDegraded || !activeLang) {
      setShowApproxNotice(false);
      return;
    }
    try {
      if (localStorage.getItem(approxNoticeKey(activeLang)) === "1") return;
    } catch {
      // localStorage unavailable (private mode); still show it this session.
    }
    setShowApproxNotice(true);
  }, [isDegraded, activeLang]);

  const dismissApproxNotice = () => {
    setShowApproxNotice(false);
    try {
      localStorage.setItem(approxNoticeKey(activeLang), "1");
    } catch {
      // Ignore storage failures; the notice stays dismissed for this session.
    }
  };

  // ── Unsupported-language playback (spec 2) ───────────────────────────────
  // In ear-training mode we keep the learner's recording so they can play it
  // back and compare it to the coach. Held as an object URL that is revoked
  // when replaced or on unmount to avoid leaking blobs.
  const [ownRecordingUrl, setOwnRecordingUrl] = useState<string | null>(null);
  const ownRecordingUrlRef = useRef<string | null>(null);
  const ownAudioRef = useRef<HTMLAudioElement | null>(null);
  const setOwnRecording = useCallback((blob: Blob | null) => {
    if (ownRecordingUrlRef.current) {
      URL.revokeObjectURL(ownRecordingUrlRef.current);
      ownRecordingUrlRef.current = null;
    }
    const url = blob ? URL.createObjectURL(blob) : null;
    ownRecordingUrlRef.current = url;
    setOwnRecordingUrl(url);
  }, []);
  useEffect(() => {
    return () => {
      if (ownRecordingUrlRef.current) URL.revokeObjectURL(ownRecordingUrlRef.current);
      if (ownAudioRef.current) ownAudioRef.current.pause();
    };
  }, []);

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

  // Spoken feedback preference — whether the coach reads the result text aloud
  // after scoring. Mirrored in React state so the header quick-toggle applies
  // instantly without a full remount, matching the mobile quick-mute pattern.
  const [spokenFeedback, setSpokenFeedback] = useState<boolean>(loadSpokenFeedback);
  // Ref mirror so finishRecording (a useCallback) always sees the live value
  // without needing spokenFeedback in its deps and causing excess re-creation.
  const spokenFeedbackRef = useRef(spokenFeedback);
  const changeSpokenFeedback = (enabled: boolean) => {
    spokenFeedbackRef.current = enabled;
    setSpokenFeedback(enabled);
    saveSpokenFeedback(enabled);
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
  // Pre-warmed audio for the starting phrase — kicked off when phrases first
  // load so the coach voice plays instantly instead of waiting 1–2 s for
  // gpt-audio synthesis after state flips to "playing_coach".
  const startingPhraseAudioRef = useRef<Promise<{ audioBase64: string; format: string } | null> | null>(null);
  // Pre-synthesized feedback audio — started in parallel with createAttempt
  // so the voice is ready (or nearly ready) when the result card appears.
  const feedbackAudioPendingRef = useRef<Promise<{ audioBase64: string; format: string } | null> | null>(null);

  const phrase = phrases?.[currentIndex];

  // Auto-start when phrases load (jump to a specific phrase if requested)
  useEffect(() => {
    if (phrases && phrases.length > 0 && state === "intro") {
      let startIdx = 0;
      if (startPhraseId != null) {
        const idx = phrases.findIndex(p => p.id === parseInt(startPhraseId, 10));
        if (idx >= 0) startIdx = idx;
      } else if (skipMastered) {
        // Advance past already-mastered phrases so the session starts where
        // the learner actually has work to do. Falls back to index 0 if
        // every phrase is mastered (avoids an empty session).
        const firstUnmastered = phrases.findIndex(p => !p.mastered);
        if (firstUnmastered > 0) startIdx = firstUnmastered;
      }
      if (startIdx > 0) setCurrentIndex(startIdx);

      // Pre-warm the starting phrase's audio immediately so the coach voice
      // plays as soon as state flips to "playing_coach". Without this, gpt-audio
      // synthesis (1–2 s) happens *after* the state change, leaving a window
      // where the belly button looks tappable but recordings are silently dropped.
      const startPhrase = phrases[startIdx];
      if (!silentModeRef.current && startPhrase && !coachAudioCacheRef.current.has(startPhrase.id)) {
        startingPhraseAudioRef.current = synthesize
          .mutateAsync({ data: { text: startPhrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLang } })
          .then(res => { coachAudioCacheRef.current.set(startPhrase.id, res); return res; })
          .catch(() => null);
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
      .mutateAsync({ data: { text: nextPhrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLang } })
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
          // Consume any pre-warmed synthesis promise that was started when
          // phrases first loaded — avoids a redundant gpt-audio API call.
          const pendingPrewarm = !cached ? startingPhraseAudioRef.current : null;
          if (pendingPrewarm) startingPhraseAudioRef.current = null;
          const prewarm = pendingPrewarm ? await pendingPrewarm : null;
          const res = cached ?? prewarm ?? await synthesize.mutateAsync({ data: { text: phrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLang } });
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
    if (state === "result" && spokenText && spokenFeedback) {
      let cancelled = false;
      const speak = async () => {
        try {
          // Consume the pre-synthesized audio started in finishRecording
          // (parallel with createAttempt). If it's ready the voice plays
          // immediately; if not, we just await the same in-flight promise.
          const pending = feedbackAudioPendingRef.current;
          feedbackAudioPendingRef.current = null;
          const res = pending
            ? await pending
            : await synthesize.mutateAsync({ data: { text: spokenText } });
          if (!res || cancelled) return;
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
    // Ear-training mode never scores, so there's no "evaluating" stage — the
    // learner goes straight to a compare stage once we have their recording.
    setState(isUnsupported ? "recording" : "evaluating");
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

      // Unsupported language: no evaluation request is ever sent. Keep the
      // recording so the learner can play it back and compare (spec 2).
      if (isUnsupported) {
        setOwnRecording(blob);
        setState("compare");
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
        band: evalRes.band,
        passed: evalRes.passed,
        xpAwarded: evalRes.xpAwarded,
        xpBreakdown: evalRes.xpBreakdown,
        feedback: evalRes.feedback,
        tip: evalRes.tip,
      });
      // Overwrite by phraseId so retries replace rather than duplicate.
      setSessionResults(prev => ({
        ...prev,
        [phrase!.id]: {
          phraseId: phrase!.id,
          band: evalRes.band,
          xpAwarded: evalRes.xpAwarded,
          xpBreakdown: evalRes.xpBreakdown,
          feedback: evalRes.feedback,
          tip: evalRes.tip,
          nativeScript: phrase!.nativeScript,
          english: phrase!.english,
        },
      }));

      // Kick off spoken-feedback TTS in parallel with createAttempt so the
      // voice is ready (or nearly ready) when the result card appears.
      // gpt-audio synthesis takes ~1–2 s; pre-warming here cuts that delay.
      const fbText = [evalRes.feedback, evalRes.tip].filter(Boolean).join(" ");
      if (fbText && spokenFeedbackRef.current) {
        feedbackAudioPendingRef.current = synthesize
          .mutateAsync({ data: { text: fbText } })
          .then(res => res)
          .catch(() => null);
      }

      // The learner has their score — show it now. Saving the attempt below
      // must never take the result away from them.
      setState("result");
      // Web haptics — mirror the mobile practice pattern exactly.
      webHaptic('medium');
      if (evalRes.band === 'nailed') {
        webHaptic('heavy');
        setTimeout(() => webHaptic('heavy'), 140);
      }

      // Band-driven cues (Spec 1): correct on nailed, wrong+shake on retry.
      // nocatch is a system miss, not a learner error (rule 16): no wrong
      // cue, no shake.
      if (evalRes.band === 'nailed') {
        playCue('correct');
      } else if (evalRes.band === 'retry') {
        playCue('wrong');
        setShakeKey(k => k + 1);
      }

      if (evalRes.band === 'nailed') {
        setShowConfetti(true);
        if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current);
        confettiTimeoutRef.current = setTimeout(() => setShowConfetti(false), 3000);
      }
      // XP arc: badge flies from the result panel to the XP counter. Fires
      // whenever XP was actually awarded (nailed AND close — close earns at
      // the 0.6 band factor). retry/nocatch award no XP, so no arc.
      if ((evalRes.band === 'nailed' || evalRes.band === 'close') && evalRes.xpAwarded > 0) {
        if (xpArcTimerRef.current) clearTimeout(xpArcTimerRef.current);
        xpArcTimerRef.current = setTimeout(() => {
          const rect = resultPanelRef.current?.getBoundingClientRect();
          setXpArc({
            key: Date.now(),
            amount: evalRes.xpAwarded,
            from: rect
              ? { x: rect.left + rect.width / 2, y: rect.top + 24 }
              : { x: window.innerWidth / 2, y: window.innerHeight * 0.7 },
          });
        }, 250);
      }

      // Hot-streak tracking: increment consecutive good counter (nailed or close)
      // using a ref so we always see the latest value inside this callback.
      const newConsec = (evalRes.band === 'nailed' || evalRes.band === 'close') ? consecutiveGoodRef.current + 1 : 0;
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

        // Optimistic: increment todayXp immediately so the XpCounter reacts
        // before the background refetch resolves.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        queryClient.setQueryData(getGetProgressSummaryQueryKey({ lang: activeLang }), (old: any) =>
          old ? { ...old, todayXp: (old.todayXp ?? 0) + evalRes.xpAwarded } : old,
        );
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
      webHaptic('error');
      setState("error");
    } finally {
      finishingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, evaluate, createAttempt, queryClient, phrase, id, activeLang, activeLanguage, isUnsupported, setOwnRecording]);

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
    feedbackAudioPendingRef.current = null; // discard stale pre-synthesis
    setResult(null);
    setShowConfetti(false);
    setOwnRecording(null); // release any ear-training playback for this phrase
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
      // Fire a session-end haptic: success if any phrase passed, warning if not.
      // Mirrors the mobile done-screen haptic in the phase==='done' effect.
      const _entries = (phrases ?? []).map(p => sessionResults[p.id]).filter(Boolean);
      const _anyPassed = _entries.some(e => e.band === 'nailed' || e.band === 'close');
      webHaptic(_anyPassed ? 'success' : 'warning');
      // Celebratory sound gated on the same condition as summary confetti:
      // at least half of the phrases ended nailed or close.
      const _good = _entries.filter(e => e.band === 'nailed' || e.band === 'close').length;
      if (_entries.length > 0 && _good * 2 >= _entries.length) {
        playCue('session_complete');
      }
      setState("summary");
    }
  };

  const handleRetry = () => {
    feedbackAudioPendingRef.current = null; // discard stale pre-synthesis
    setResult(null);
    setShowConfetti(false);
    setOwnRecording(null); // release any ear-training playback for this phrase
    // Return through the coach playback so the learner hears the model
    // pronunciation again before re-recording. In silent mode, skip straight
    // to idle so the mic is available immediately.
    setState(silentMode ? "idle" : "playing_coach");
  };

  const playAgain = () => {
    setState("playing_coach");
  };

  // Ear-training mode (spec 2): replay the learner's own recording so they can
  // compare it to the coach. No evaluation is ever involved.
  const playOwnRecording = () => {
    if (!ownRecordingUrl) return;
    try {
      if (ownAudioRef.current) ownAudioRef.current.pause();
      const audio = new Audio(ownRecordingUrl);
      ownAudioRef.current = audio;
      void audio.play();
    } catch {
      // Playback is best-effort; a failure shouldn't interrupt practice.
    }
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
    // overwritten earlier attempts in the record, so we get the latest band.
    const orderedSummaryEntries = phrases
      .map(p => sessionResults[p.id])
      .filter((r): r is NonNullable<typeof r> => r !== undefined);
    const attemptCount = orderedSummaryEntries.length;
    const totalXp = orderedSummaryEntries.reduce((a, r) => a + r.xpAwarded, 0);
    const isPerfect = attemptCount > 0 && orderedSummaryEntries.every(r => r.band === "nailed");
    const anyPassed = orderedSummaryEntries.some(r => r.band === "nailed" || r.band === "close");
    // Spec 1 gating: session confetti only when at least half of the phrases
    // ended nailed or close — never on rough sessions.
    const goodCount = orderedSummaryEntries.filter(r => r.band === "nailed" || r.band === "close").length;
    const celebrateSession = attemptCount > 0 && goodCount * 2 >= attemptCount;
    return (
      <div className="app-surface min-h-screen flex flex-col bg-background p-6 mx-auto w-full max-w-xl">
        <Confetti
          active={celebrateSession}
          variant={isPerfect ? "perfect" : "default"}
          glyphs={glyphsForLanguage(activeLang)}
        />
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <Mascot pose={anyPassed ? "cheer" : "thumbsup"} size={148} idle={anyPassed ? "cheer" : "float"} />
          <motion.h1
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { delay: 0.12, type: "spring", stiffness: 260, damping: 20 }}
            className={cn(
              "text-4xl font-black",
              isPerfect ? "text-amber-500" : "text-foreground",
            )}
          >
            {isPerfect ? "PERFECT SESSION! 🏆" : anyPassed ? "Session Complete!" : "Great effort!"}
          </motion.h1>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { delay: 0.24, type: "spring", stiffness: 260, damping: 18 }}
            className={cn(
              "p-6 rounded-3xl w-full max-w-sm border shadow-sm",
              isPerfect ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" : "bg-white border-card-border",
            )}
          >
            <p className="text-muted-foreground font-medium">You practiced {attemptCount} {isSentences ? "sentences" : "phrases"}.</p>
            {/* XP earned chip */}
            {totalXp > 0 && (
              <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-950/40 px-4 py-1 text-sm font-black text-violet-600 dark:text-violet-400">
                <CountUp value={totalXp} prefix="+" suffix=" XP earned" />
              </div>
            )}

            {/* XP breakdown — collapsed by default */}
            {orderedSummaryEntries.some(r => r.xpBreakdown) && (
              <div className="mt-3 text-left">
                <button
                  onClick={() => setXpExpanded(x => !x)}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  aria-expanded={xpExpanded}
                >
                  {xpExpanded ? "▲" : "▼"} XP breakdown
                </button>
                <AnimatePresence>
                  {xpExpanded && (
                    <motion.ul
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="mt-1 space-y-0.5 overflow-hidden"
                    >
                      {orderedSummaryEntries.map((r, i) => (
                        <li key={r.phraseId} className="text-xs text-muted-foreground flex justify-between gap-2">
                          <span className="truncate">{r.english}</span>
                          <span className="font-semibold whitespace-nowrap">
                            {r.xpBreakdown ?? (r.xpAwarded > 0 ? `+${r.xpAwarded} XP` : "0 XP")}
                          </span>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* ── Per-phrase band indicators ──────────────────────────── */}
            {orderedSummaryEntries.length > 0 && (
              <div className="mt-4 w-full">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Per-phrase results
                </p>
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
                  {orderedSummaryEntries.map((r, i) => (
                    <button
                      key={r.phraseId}
                      onClick={() => setSummarySelectedIdx(summarySelectedIdx === i ? null : i)}
                      className="flex flex-col items-center gap-0.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Phrase ${i + 1}: ${r.english}, ${r.band}`}
                      aria-expanded={summarySelectedIdx === i}
                    >
                      <span
                        className="block w-5 h-5 rounded-full mx-auto border-2 border-white/60 shadow-sm"
                        style={{ background: bandCss(r.band) }}
                        aria-hidden="true"
                      />
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
  // cheering back up) once a band lands.
  const mascotPose: MascotPose =
    state === "result" && result
      ? result.band === "nailed"
        ? "cheer"
        : result.band === "close"
          ? "thumbsup"
          : result.band === "nocatch"
            ? "thinking" // system miss, not learner error (Spec 1 rule 16)
            : "tryagain"
      : state === "error"
        ? "tryagain"
        : state === "compare"
          ? "cheer" // ear-training always counts — celebrate the effort
          : state === "playing_coach" || state === "recording" || state === "evaluating"
            ? "thinking"
            : "thumbsup";

  // The belly zone is interactive only when the learner can actually record.
  const bellyActive = state === "idle" || state === "recording";

  return (
    <div className="app-surface min-h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      <Confetti active={showConfetti} />
      {xpArc && (
        <XpArc
          key={xpArc.key}
          amount={xpArc.amount}
          from={xpArc.from}
          onDone={() => setXpArc(null)}
        />
      )}
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
        {/* Daily XP counter — compact session variant */}
        <XpCounter variant="session" />
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
        {/* Spoken Feedback toggle — quick-access in the practice header,
            mirrors the mobile result-card mute button for web parity. */}
        <button
          onClick={() => changeSpokenFeedback(!spokenFeedback)}
          aria-pressed={spokenFeedback}
          title={spokenFeedback ? "Spoken feedback on — tap to silence it" : "Tap to hear score feedback aloud"}
          className={cn(
            "shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-xs font-bold transition-all",
            spokenFeedback
              ? "bg-secondary text-white shadow-sm"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Headphones className="w-4 h-4" />
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 flex flex-col px-4 pb-4 min-h-0">

        {/* ── Approximate-feedback notice (degraded languages, spec 1) ────── */}
        <AnimatePresence>
          {showApproxNotice && (
            <motion.div
              key="approx-notice"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={springs.snappy}
              role="status"
              className="shrink-0 mb-2 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3"
            >
              <p className="flex-1 text-sm font-medium text-amber-900 dark:text-amber-200 leading-snug">
                Heads up: speech recognition is still learning {languageName}, so feedback may be approximate.
              </p>
              <button
                onClick={dismissApproxNotice}
                aria-label="Dismiss notice"
                className="shrink-0 text-xs font-black text-amber-700 dark:text-amber-300 rounded-lg px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
              >
                Got it
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Ear-training explainer (unsupported languages, spec 2) ──────── */}
        {isUnsupported && (
          <div
            role="status"
            className="shrink-0 mb-2 rounded-2xl border border-secondary/30 bg-secondary/10 px-4 py-3"
          >
            <p className="text-sm font-medium text-foreground leading-snug">
              Speech recognition can't hear {languageName} reliably yet, so this is ear-training practice: listen, record, and compare. It still counts!
            </p>
          </div>
        )}

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
                  scale: 1,
                }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={springs.snappy}
                className="w-full h-full"
              >
                {/* Spec D2: mascot "hears" the learner — scale rides the live
                    amplitude MotionValue (1.0–1.08) while recording. The rAF
                    loop leaves amplitudeMv at 0 under reduced motion or when
                    not recording, so this settles to scale 1 in those cases. */}
                <motion.div className="w-full h-full" style={{ scale: mascotScale }}>
                  <Mascot
                    pose={mascotPose}
                    fill
                    idle={state === "result" && result?.passed ? "cheer" : "float"}
                  />
                </motion.div>
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
                  {isUnsupported ? "Hold to record" : "Hold to speak"}
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
                  {reduceMotion ? (
                    // Reduced motion: static level indicator (Spec D2 rule 6).
                    // Segments light up with input level; nothing loops or
                    // dances, but mic-is-working feedback stays visible.
                    <div
                      className="flex items-center gap-1"
                      role="img"
                      aria-label="Microphone level"
                    >
                      {[1, 2, 3, 4, 5].map((seg) => (
                        <span
                          key={seg}
                          className={cn(
                            "w-2 h-2 rounded-full",
                            seg <= levelSegments ? "bg-accent" : "bg-muted",
                          )}
                        />
                      ))}
                    </div>
                  ) : (
                    <SoundWavePulse
                      className="text-accent"
                      size={22}
                      bars={7}
                      amplitude={amplitudeMv}
                    />
                  )}
                  {noInput ? (
                    // Zero-input state (Spec D2 rule 7): >1.5s of near-silence
                    // while recording — most likely a muted or wrong mic.
                    <p className="text-center text-muted-foreground font-bold uppercase tracking-widest text-xs">
                      We can't hear you — check your mic
                    </p>
                  ) : (
                    <p className="text-center text-accent font-bold uppercase tracking-widest text-xs">
                      Listening…
                    </p>
                  )}
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

        {/* ── Compare panel: ear-training playback + advance (spec 2) ───── */}
        {state === "compare" && (
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.bouncy}
            className="shrink-0 space-y-3 mt-2"
          >
            <div className="bg-white rounded-2xl p-4 border border-card-border shadow-sm text-center">
              <p className="text-xl font-black mb-1 text-foreground">Nice work!</p>
              <p className="text-foreground font-medium text-sm leading-snug mb-3">
                Play the phrase and your recording back to back, and listen for the difference.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={playAgain}
                  className="flex-1 bg-white text-foreground border-2 border-border font-bold text-base py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <Volume2 className="w-5 h-5" /> Hear the phrase
                </button>
                <button
                  onClick={playOwnRecording}
                  disabled={!ownRecordingUrl}
                  className="flex-1 bg-white text-foreground border-2 border-border font-bold text-base py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40 transition-all"
                >
                  <Headphones className="w-5 h-5" /> Hear yourself
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRetry}
                className="flex-1 bg-white text-foreground border-2 border-border font-bold text-base py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <RefreshCcw className="w-5 h-5" /> Practice again
              </button>
              <button
                onClick={handleNext}
                className="flex-1 bg-primary text-primary-foreground font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 shadow-[0_6px_0_hsl(var(--primary-shadow))] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
              >
                Next <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Bottom panel: result / error / action buttons ────────────── */}
        {(state === "result" || state === "error") && (
            <motion.div
              ref={resultPanelRef}
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springs.bouncy}
              className="shrink-0 space-y-3 mt-2"
            >
              {/* Retry-band shake: 3 horizontal cycles ≈80ms, ≤8px,
                  transform-only; retriggers via key. Never fires for nocatch. */}
              <motion.div
                key={shakeKey}
                animate={
                  shakeKey > 0 && !reduceMotion && result?.band === "retry"
                    ? { x: [0, -8, 8, -8, 8, 0] }
                    : undefined
                }
                transition={{ duration: 0.32, ease: "easeInOut" }}
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
                    result.band === "nailed" ? "text-success" :
                    result.band === "close" ? "text-primary" :
                    "text-foreground"
                  )}>
                    {result.band === "nailed" ? "Amazing!" : result.band === "close" ? "Nice work!" : "Good try — keep going!"}
                  </p>
                  <div className="my-2 flex justify-center">
                    <BandPill band={result.band} />
                  </div>
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
              </motion.div>

              {/* Action buttons */}
              {state === "error" ? (
                <button
                  onClick={handleErrorRetry}
                  className="w-full bg-primary text-primary-foreground font-black text-lg py-4 rounded-2xl flex items-center justify-center gap-2 shadow-[0_6px_0_hsl(var(--primary-shadow))] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
                >
                  <RefreshCcw className="w-5 h-5" /> Record again
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
