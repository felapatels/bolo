import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useSearch } from "wouter";
import { 
  useListCategoryPhrases, 
  useListReviewPhrases,
  useSynthesizeSpeech, 
  useEvaluatePronunciation, 
  useCreateAttempt,
  getListCategoryPhrasesQueryKey,
  getListReviewPhrasesQueryKey,
  getGetProgressSummaryQueryKey,
  getListRecentAttemptsQueryKey,
  getListBadgesQueryKey,
  type EarnedBadge
} from "@workspace/api-client-react";
import { useVoiceRecorder } from "@workspace/integrations-openai-ai-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mic, Square, Volume2, ArrowRight, Loader2, RefreshCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { springs, SoundWavePulse } from "@/lib/motion";
import { Confetti } from "@/components/ui/confetti";
import { BadgeUnlock } from "@/components/badge-unlock";
import { Mascot, type MascotPose } from "@/components/mascot";
import { cn } from "@/lib/utils";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { LessonBuildingScreen, LessonErrorScreen } from "@/components/lesson-states";
import { UpgradeScreen } from "@/components/plus";
import { asUpgradeRequired, upgradeHrefForDenial } from "@/lib/entitlements";

type SessionState = "intro" | "playing_coach" | "idle" | "recording" | "evaluating" | "result" | "summary";

export default function Practice({ mode = "category" }: { mode?: "category" | "review" }) {
  const { categoryId } = useParams();
  const id = parseInt(categoryId || "0", 10);
  const isReview = mode === "review";
  const search = useSearch();
  const startPhraseId = new URLSearchParams(search).get("phrase");
  const queryClient = useQueryClient();
  const { activeLang, activeLanguage } = useLanguage();
  const native = useNativeText();

  // Where "back" goes: the review session lives off the Home dashboard, while a
  // normal lesson belongs to its category.
  const backHref = isReview ? "/app" : `/learn/${id}`;

  const categoryQuery = useListCategoryPhrases(id, activeLang, {
    query: {
      enabled: !isReview,
      queryKey: getListCategoryPhrasesQueryKey(id, activeLang),
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
  } = isReview ? reviewQuery : categoryQuery;
  const synthesize = useSynthesizeSpeech();
  const evaluate = useEvaluatePronunciation();
  const createAttempt = useCreateAttempt();
  const recorder = useVoiceRecorder();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [state, setState] = useState<SessionState>("intro");
  const [result, setResult] = useState<{ score: number; feedback: string; tip: string } | null>(null);
  const [sessionResults, setSessionResults] = useState<{ phraseId: number; score: number }[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [newBadges, setNewBadges] = useState<EarnedBadge[]>([]);

  // Warm up the microphone as soon as the practice session mounts, so the
  // record tap starts capturing immediately and the first syllable isn't
  // clipped. If permission is denied here, startRecording surfaces the
  // existing error message at click time. The hook releases the stream on
  // unmount.
  useEffect(() => {
    recorder.prepare().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const feedbackAudioRef = useRef<HTMLAudioElement | null>(null);

  const phrase = phrases?.[currentIndex];

  // Auto-start when phrases load (jump to a specific phrase if requested)
  useEffect(() => {
    if (phrases && phrases.length > 0 && state === "intro") {
      if (startPhraseId != null) {
        const idx = phrases.findIndex(p => p.id === parseInt(startPhraseId, 10));
        if (idx >= 0) setCurrentIndex(idx);
      }
      setState("playing_coach");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrases, state]);

  // Handle coach playing
  useEffect(() => {
    if (state === "playing_coach" && phrase) {
      let cancelled = false;
      const playCoach = async () => {
        try {
          const res = await synthesize.mutateAsync({ data: { text: phrase.nativeScript, languageName: activeLanguage?.name } });
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
    if (state === "result" && spokenText) {
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

  // Prevents a manual stop and an auto-stop from both firing.
  const finishingRef = useRef(false);

  const finishRecording = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setState("evaluating");
    try {
      const blob = await recorder.stopRecording();

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
      setSessionResults(prev => [...prev, { phraseId: phrase!.id, score: evalRes.score }]);

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
      queryClient.invalidateQueries({ queryKey: getListReviewPhrasesQueryKey({ lang: activeLang }) });
      queryClient.invalidateQueries({ queryKey: getListBadgesQueryKey({ lang: activeLang }) });

      setState("result");

      if (evalRes.score >= 80) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }

      if (attemptRes.newlyEarnedBadges.length > 0) {
        setNewBadges(attemptRes.newlyEarnedBadges);
      }
    } catch (error) {
      console.error("Evaluation failed", error);
      setState("idle");
    } finally {
      finishingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, evaluate, createAttempt, queryClient, phrase, id, activeLang, activeLanguage]);

  const startRecording = async () => {
    try {
      await recorder.startRecording({
        onSilence: () => { void finishRecording(); },
        silenceDurationMs: 1600,
      });
      setState("recording");
    } catch {
      alert("Microphone access is needed to practice.");
    }
  };

  const handleNext = () => {
    setResult(null);
    setShowConfetti(false);
    if (phrases && currentIndex < phrases.length - 1) {
      setCurrentIndex(c => c + 1);
      setState("playing_coach");
    } else {
      setState("summary");
    }
  };

  const handleRetry = () => {
    setResult(null);
    setShowConfetti(false);
    // Return through the coach playback so the learner hears the model
    // pronunciation again before re-recording.
    setState("playing_coach");
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
              ? "Review is a Plus feature"
              : "Unlock this language"
        }
        message={upgrade.message}
        upgradeHref={upgradeHrefForDenial(upgrade, activeLang)}
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
          {isReview ? "Nothing to review right now." : "No phrases found here."}
        </h2>
        <Link href={backHref} className="text-primary font-bold">Go back</Link>
      </div>
    );
  }

  if (state === "summary") {
    const avgScore = Math.round(sessionResults.reduce((a, b) => a + b.score, 0) / (sessionResults.length || 1));
    return (
      <div className="app-surface min-h-screen flex flex-col bg-background p-6 mx-auto w-full max-w-xl">
        <Confetti active={avgScore >= 70} />
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <Mascot pose={avgScore >= 60 ? "cheer" : "thumbsup"} size={148} idle={avgScore >= 60 ? "cheer" : "float"} />
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-4xl font-black text-foreground"
          >
            {avgScore >= 80 ? "You crushed it!" : avgScore >= 60 ? "Session Complete!" : "Great effort!"}
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, type: "spring", stiffness: 260, damping: 18 }}
            className="bg-white p-6 rounded-3xl w-full max-w-sm border border-card-border shadow-sm"
          >
            <p className="text-muted-foreground font-bold uppercase tracking-wider mb-2">Average Score</p>
            <div className={cn(
              "text-6xl font-black",
              avgScore >= 80 ? "text-success" : avgScore >= 60 ? "text-primary" : "text-destructive"
            )}>
              {avgScore}
            </div>
            <p className="text-muted-foreground mt-4 font-medium">You practiced {sessionResults.length} phrases.</p>
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
      ? result.score >= 80
        ? "cheer"
        : result.score >= 60
          ? "thumbsup"
          : "tryagain"
      : state === "playing_coach" || state === "recording" || state === "evaluating"
        ? "thinking"
        : "thumbsup";

  return (
    <div className="app-surface min-h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      <Confetti active={showConfetti} />
      <BadgeUnlock badges={newBadges} onDismiss={() => setNewBadges([])} />
      
      <header className="mx-auto w-full max-w-2xl px-6 py-4 flex items-center justify-between">
        <Link href={backHref} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-8 h-8" />
        </Link>
        <div className="flex-1 px-6">
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-secondary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${((currentIndex) / phrases.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
        <div className="font-bold text-muted-foreground">{currentIndex + 1}/{phrases.length}</div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 flex flex-col px-6 pb-8">
        <AnimatePresence mode="wait">
          <motion.div 
            key={phrase?.id}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col justify-center"
          >
            <div className="flex justify-center mb-2">
              <Mascot
                pose={mascotPose}
                size={92}
                idle={state === "result" && (result?.score ?? 0) >= 80 ? "cheer" : "float"}
              />
            </div>

            <div className="bg-white rounded-[2rem] p-8 text-center shadow-sm border border-card-border relative">
              <button 
                onClick={playAgain}
                disabled={state === "recording" || state === "evaluating"}
                className="absolute -top-6 left-1/2 -translate-x-1/2 w-14 h-14 bg-secondary text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 disabled:opacity-50 transition-all"
              >
                <Volume2 className="w-7 h-7" />
              </button>
              
              <div className="pt-6 space-y-6">
                <h2 className="text-6xl font-extrabold text-foreground leading-tight tracking-tight" style={native.style} dir={native.dir}>
                  {phrase?.nativeScript}
                </h2>
                <div className="space-y-2">
                  <p className="text-primary font-bold text-2xl tracking-wide">{phrase?.romanized}</p>
                  <p className="text-muted-foreground text-lg">{phrase?.english}</p>
                </div>
              </div>
            </div>

            {state === "result" && result && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 bg-white rounded-3xl p-6 border border-card-border shadow-sm text-center"
              >
                <p className={cn(
                  "text-2xl font-black mb-2",
                  result.score >= 80 ? "text-success" :
                  result.score >= 60 ? "text-primary" :
                  "text-foreground"
                )}>
                  {result.score >= 80 ? "Amazing!" : result.score >= 60 ? "Nice work!" : "Good try — keep going!"}
                </p>
                <div className={cn(
                  "inline-block px-4 py-1 rounded-full font-black text-xl mb-4",
                  result.score >= 80 ? "bg-success/20 text-success" : 
                  result.score >= 60 ? "bg-primary/20 text-primary" : 
                  "bg-destructive/20 text-destructive"
                )}>
                  Score: {Math.round(result.score)}
                </div>
                <p className="text-foreground font-medium text-lg leading-snug mb-3">"{result.feedback}"</p>
                {result.tip && (
                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-xl">Tip: {result.tip}</p>
                )}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-auto pt-8 flex flex-col items-center">
          {state === "result" ? (
            <div className="w-full flex gap-4">
              <button 
                onClick={handleRetry}
                className="flex-1 bg-white text-foreground border-2 border-border font-bold text-lg py-5 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <RefreshCcw className="w-6 h-6" /> Retry
              </button>
              <button 
                onClick={handleNext}
                className="flex-1 bg-primary text-primary-foreground font-black text-lg py-5 rounded-2xl flex items-center justify-center gap-2 shadow-[0_6px_0_hsl(var(--primary-shadow))] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--primary-shadow))] transition-all"
              >
                Next <ArrowRight className="w-6 h-6" />
              </button>
            </div>
          ) : (
            <div className="relative">
              {state === "evaluating" && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 rounded-full backdrop-blur-sm">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                </div>
              )}
              
              <button 
                onClick={state === "recording" ? finishRecording : startRecording}
                disabled={state === "playing_coach" || state === "evaluating"}
                className={cn(
                  "w-28 h-28 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 disabled:opacity-50",
                  state === "recording" 
                    ? "bg-accent scale-110 shadow-[0_0_40px_hsl(var(--accent)/0.5)] animate-pulse" 
                    : "bg-primary active:scale-95 shadow-[0_8px_0_hsl(var(--primary-shadow))] active:translate-y-2 active:shadow-[0_0px_0_hsl(var(--primary-shadow))]"
                )}
              >
                {state === "recording" ? (
                  <Square className="w-10 h-10 text-white fill-current" />
                ) : (
                  <Mic className="w-12 h-12 text-white" />
                )}
              </button>
              
              {state === "idle" && (
                <p className="text-center text-muted-foreground font-bold mt-6 uppercase tracking-widest text-sm">
                  Tap, then speak
                </p>
              )}
              {state === "recording" && (
                <div className="mt-6 flex flex-col items-center gap-2">
                  <SoundWavePulse className="text-accent" size={26} bars={7} />
                  <p className="text-center text-accent font-bold uppercase tracking-widest text-sm">
                    Listening... stops on its own
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
