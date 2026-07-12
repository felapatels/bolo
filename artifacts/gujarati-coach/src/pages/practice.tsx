import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "wouter";
import { 
  useListCategoryPhrases, 
  useSynthesizeSpeech, 
  useEvaluatePronunciation, 
  useCreateAttempt,
  getListCategoryPhrasesQueryKey,
  getGetProgressSummaryQueryKey,
  getListRecentAttemptsQueryKey
} from "@workspace/api-client-react";
import { useVoiceRecorder } from "@workspace/integrations-openai-ai-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mic, Square, Volume2, ArrowRight, Loader2, Sparkles, RefreshCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Confetti } from "@/components/ui/confetti";
import { cn } from "@/lib/utils";
import { useProfile } from "@/lib/profile";

type SessionState = "intro" | "playing_coach" | "idle" | "recording" | "evaluating" | "result" | "summary";

// Fun spoken cheers the coach says out loud after each attempt, by score band.
const SPOKEN_FEEDBACK: Record<"great" | "good" | "close" | "again", string[]> = {
  great: ["Wow! You totally nailed it!", "Amazing! That was perfect!", "Superstar! You nailed it!"],
  good: ["Awesome job! You've got it!", "Yes! That sounded great!", "Brilliant! Really well done!"],
  close: ["Good try! So close, give it one more go!", "Nice effort! Almost there, try again!", "Good job! A little more practice and you've got it!"],
  again: ["Nice try! Let's give that one another go!", "Keep going! Try it one more time!", "Good effort! Practice makes perfect, try again!"],
};

function pickSpokenFeedback(score: number): string {
  const band = score >= 90 ? "great" : score >= 80 ? "good" : score >= 60 ? "close" : "again";
  const options = SPOKEN_FEEDBACK[band];
  return options[Math.floor(Math.random() * options.length)];
}

export default function Practice() {
  const { categoryId } = useParams();
  const id = parseInt(categoryId || "0", 10);
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const profileId = profile?.id;

  const { data: phrases, isLoading: loadingPhrases } = useListCategoryPhrases(id, { profileId });
  const synthesize = useSynthesizeSpeech();
  const evaluate = useEvaluatePronunciation();
  const createAttempt = useCreateAttempt();
  const recorder = useVoiceRecorder();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [state, setState] = useState<SessionState>("intro");
  const [result, setResult] = useState<{ score: number; feedback: string; tip: string; spoken: string } | null>(null);
  const [sessionResults, setSessionResults] = useState<{ phraseId: number; score: number }[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const feedbackAudioRef = useRef<HTMLAudioElement | null>(null);

  const phrase = phrases?.[currentIndex];

  // Auto-start when phrases load
  useEffect(() => {
    if (phrases && phrases.length > 0 && state === "intro") {
      setState("playing_coach");
    }
  }, [phrases, state]);

  // Handle coach playing
  useEffect(() => {
    if (state === "playing_coach" && phrase) {
      let cancelled = false;
      const playCoach = async () => {
        try {
          const res = await synthesize.mutateAsync({ data: { text: phrase.gujaratiScript } });
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

  // Speak a fun cheer out loud whenever a result appears.
  useEffect(() => {
    if (state === "result" && result?.spoken) {
      let cancelled = false;
      const speak = async () => {
        try {
          const res = await synthesize.mutateAsync({ data: { text: result.spoken } });
          if (cancelled) return;
          const audio = new Audio(`data:audio/${res.format};base64,${res.audioBase64}`);
          feedbackAudioRef.current = audio;
          await audio.play();
        } catch {
          // A missed cheer shouldn't interrupt practice; stay silent.
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
  }, [state, result?.spoken]);

  const toggleRecording = async () => {
    if (state === "idle") {
      try {
        await recorder.startRecording();
        setState("recording");
      } catch (err) {
        alert("Microphone access is needed to practice.");
      }
    } else if (state === "recording") {
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
            targetGujarati: phrase!.gujaratiScript,
            targetRomanized: phrase!.romanized,
            targetEnglish: phrase!.english,
            audioBase64,
            mimeType: blob.type
          }
        });

        setResult({
          score: evalRes.score,
          feedback: evalRes.feedback,
          tip: evalRes.tip,
          spoken: pickSpokenFeedback(evalRes.score),
        });
        setSessionResults(prev => [...prev, { phraseId: phrase!.id, score: evalRes.score }]);

        // Save attempt for the active kid
        if (profileId != null) {
          await createAttempt.mutateAsync({
            data: {
              profileId,
              phraseId: phrase!.id,
              gujaratiScript: phrase!.gujaratiScript,
              romanized: phrase!.romanized,
              english: phrase!.english,
              transcript: evalRes.transcript,
              score: evalRes.score,
              passed: evalRes.passed,
              feedback: evalRes.feedback
            }
          });

          // Invalidate queries so progress updates
          queryClient.invalidateQueries({ queryKey: getGetProgressSummaryQueryKey({ profileId }) });
          queryClient.invalidateQueries({ queryKey: getListRecentAttemptsQueryKey({ limit: 12, profileId }) });
          queryClient.invalidateQueries({ queryKey: getListCategoryPhrasesQueryKey(id, { profileId }) });
        }

        setState("result");
        
        if (evalRes.score >= 80) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 3000);
        }

      } catch (error) {
        console.error("Evaluation failed", error);
        setState("idle");
      }
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
    setState("idle");
  };

  const playAgain = () => {
    setState("playing_coach");
  };

  if (loadingPhrases || !phrases) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (phrases.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold mb-4">No phrases found here.</h2>
        <Link href={`/learn/${id}`} className="text-primary font-bold">Go back</Link>
      </div>
    );
  }

  if (state === "summary") {
    const avgScore = Math.round(sessionResults.reduce((a, b) => a + b.score, 0) / (sessionResults.length || 1));
    return (
      <div className="min-h-screen flex flex-col bg-background p-6">
        <Confetti active={avgScore >= 70} />
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <div className="w-24 h-24 bg-secondary rounded-full flex items-center justify-center text-white mb-4">
            <Sparkles className="w-12 h-12" />
          </div>
          <h1 className="text-4xl font-black text-foreground">Session Complete!</h1>
          
          <div className="bg-white p-6 rounded-3xl w-full max-w-sm border border-card-border shadow-sm">
            <p className="text-muted-foreground font-bold uppercase tracking-wider mb-2">Average Score</p>
            <div className={cn(
              "text-6xl font-black",
              avgScore >= 80 ? "text-success" : avgScore >= 60 ? "text-primary" : "text-destructive"
            )}>
              {avgScore}
            </div>
            <p className="text-muted-foreground mt-4 font-medium">You practiced {sessionResults.length} phrases.</p>
          </div>
        </div>
        
        <Link href={`/learn/${id}`} className="w-full bg-primary text-primary-foreground font-black text-xl py-5 rounded-2xl flex items-center justify-center shadow-[0_8px_0_hsl(27,100%,45%)] active:translate-y-2 active:shadow-[0_0px_0_hsl(27,100%,45%)] transition-all">
          Done
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      <Confetti active={showConfetti} />
      
      <header className="px-6 py-4 flex items-center justify-between">
        <Link href={`/learn/${id}`} className="text-muted-foreground hover:text-foreground">
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

      <main className="flex-1 flex flex-col px-6 pb-8">
        <AnimatePresence mode="wait">
          <motion.div 
            key={phrase?.id}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col justify-center"
          >
            <div className="bg-white rounded-[2rem] p-8 text-center shadow-sm border border-card-border relative">
              <button 
                onClick={playAgain}
                disabled={state === "recording" || state === "evaluating"}
                className="absolute -top-6 left-1/2 -translate-x-1/2 w-14 h-14 bg-secondary text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 disabled:opacity-50 transition-all"
              >
                <Volume2 className="w-7 h-7" />
              </button>
              
              <div className="pt-6 space-y-6">
                <h2 className="font-gujarati text-6xl font-extrabold text-foreground leading-tight tracking-tight">
                  {phrase?.gujaratiScript}
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
                className="flex-1 bg-primary text-primary-foreground font-black text-lg py-5 rounded-2xl flex items-center justify-center gap-2 shadow-[0_6px_0_hsl(27,100%,45%)] active:translate-y-1.5 active:shadow-[0_0px_0_hsl(27,100%,45%)] transition-all"
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
                onClick={toggleRecording}
                disabled={state === "playing_coach" || state === "evaluating"}
                className={cn(
                  "w-28 h-28 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 disabled:opacity-50",
                  state === "recording" 
                    ? "bg-accent scale-110 shadow-[0_0_40px_hsl(var(--accent)/0.5)] animate-pulse" 
                    : "bg-primary active:scale-95 shadow-[0_8px_0_hsl(27,100%,45%)] active:translate-y-2 active:shadow-[0_0px_0_hsl(27,100%,45%)]"
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
                  Tap to speak
                </p>
              )}
              {state === "recording" && (
                <p className="text-center text-accent font-bold mt-6 uppercase tracking-widest text-sm animate-pulse">
                  Recording...
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
