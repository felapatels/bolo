import { useState, useCallback, useRef, useEffect } from "react";
import { Award, Volume2, RotateCcw, Share2, ChevronRight, Clock, CheckCircle, XCircle, ArrowLeft } from "lucide-react";
import { Link, Redirect } from "wouter";
import { useEntitlements } from "@/lib/entitlements";
import { useLanguage } from "@/lib/language-context";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Mascot } from "@/components/mascot";
import { cn } from "@/lib/utils";
import {
  useGetDailyQuiz,
  useCompleteDailyQuiz,
  useSynthesizeSpeech,
  getGetDailyQuizQueryKey,
  type QuizQuestion,
  type McqTranslationQuestion,
  type ListenIdentifyQuestion,
  type OrderWordsQuestion,
} from "@workspace/api-client-react";

/** Mirror of the server-side isCorrectAnswer — used for instant local score display. */
function localIsCorrect(q: QuizQuestion, ans: string | null): boolean {
  if (ans == null) return false;
  if (q.type === "mcq_translation") return ans === q.correctEnglish;
  if (q.type === "listen_identify") return ans === q.correctNativeScript;
  if (q.type === "order_words") return ans.trim() === q.nativeScript.trim();
  return false;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuizState = "loading" | "playing" | "results" | "already-done";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function secondsUntilMidnightUtc(): number {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

function useCountdown(initial: number) {
  const [seconds, setSeconds] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

// ---------------------------------------------------------------------------
// Question renderers
// ---------------------------------------------------------------------------

function McqQuestion({
  q,
  onAnswer,
  answered,
}: {
  q: McqTranslationQuestion;
  onAnswer: (selected: string) => void;
  answered: boolean;
}) {
  const choices = useRef(
    [...q.distractors, q.correctEnglish].sort(() => Math.random() - 0.5),
  ).current;
  const [selected, setSelected] = useState<string | null>(null);

  const choose = (c: string) => {
    if (answered) return;
    setSelected(c);
    onAnswer(c);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-primary/8 p-6 text-center">
        <p className="text-4xl font-bold leading-snug text-foreground">{q.nativeScript}</p>
        <p className="mt-1 text-sm text-muted-foreground">{q.romanized}</p>
      </div>
      <p className="text-center text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        What does this mean?
      </p>
      <div className="grid grid-cols-2 gap-3">
        {choices.map((c) => {
          const isCorrect = c === q.correctEnglish;
          const isSelected = c === selected;
          return (
            <button
              key={c}
              onClick={() => choose(c)}
              className={cn(
                "rounded-xl border p-3 text-sm font-semibold transition-all",
                !answered && "hover:border-primary/40 hover:bg-muted/40",
                answered && isCorrect && "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40",
                answered && isSelected && !isCorrect && "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40",
                answered && !isSelected && !isCorrect && "opacity-50",
                !answered && "border-border bg-card text-foreground",
              )}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ListenQuestion({
  q,
  onAnswer,
  answered,
  activeLang,
}: {
  q: ListenIdentifyQuestion;
  onAnswer: (selected: string) => void;
  answered: boolean;
  activeLang: string;
}) {
  const choices = useRef(
    [...q.distractors, q.correctNativeScript].sort(() => Math.random() - 0.5),
  ).current;
  const [selected, setSelected] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthesize = useSynthesizeSpeech();

  const playAudio = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      const result = await synthesize.mutateAsync({
        data: { text: q.correctNativeScript, languageName: activeLang },
      });
      const bytes = Uint8Array.from(atob(result.audioBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: `audio/${result.format}` });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      setIsPlaying(false);
    }
  };

  const choose = (c: string) => {
    if (answered) return;
    setSelected(c);
    onAnswer(c);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={playAudio}
          disabled={isPlaying || synthesize.isPending}
          className={cn(
            "flex h-20 w-20 items-center justify-center rounded-full border-2 transition-all",
            isPlaying || synthesize.isPending
              ? "border-primary bg-primary/10 text-primary animate-pulse"
              : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted/40",
          )}
          aria-label="Play audio"
        >
          <Volume2 className="h-8 w-8" />
        </button>
        <p className="text-sm text-muted-foreground">
          {isPlaying ? "Playing…" : "Tap to hear the phrase"}
        </p>
      </div>
      <p className="text-center text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Which script matches what you heard?
      </p>
      <div className="grid grid-cols-2 gap-3">
        {choices.map((c) => {
          const isCorrect = c === q.correctNativeScript;
          const isSelected = c === selected;
          return (
            <button
              key={c}
              onClick={() => choose(c)}
              className={cn(
                "rounded-xl border p-4 text-xl font-bold transition-all leading-snug",
                !answered && "hover:border-primary/40 hover:bg-muted/40",
                answered && isCorrect && "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40",
                answered && isSelected && !isCorrect && "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40",
                answered && !isSelected && !isCorrect && "opacity-50",
                !answered && "border-border bg-card text-foreground",
              )}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OrderQuestion({
  q,
  onAnswer,
  answered,
}: {
  q: OrderWordsQuestion;
  onAnswer: (selected: string) => void;
  answered: boolean;
}) {
  const [staged, setStaged] = useState<string[]>([]);
  const [available, setAvailable] = useState<string[]>([...q.tiles]);
  const [submitted, setSubmitted] = useState(false);

  const pick = (tile: string, idx: number) => {
    if (answered) return;
    setAvailable((a) => a.filter((_, i) => i !== idx));
    setStaged((s) => [...s, tile]);
  };

  const unpick = (tile: string, idx: number) => {
    if (answered) return;
    setStaged((s) => s.filter((_, i) => i !== idx));
    setAvailable((a) => [...a, tile]);
  };

  const submit = () => {
    if (answered || staged.length === 0) return;
    setSubmitted(true);
    onAnswer(staged.join(" "));
  };

  const correct = submitted && staged.join(" ") === q.nativeScript;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-muted/40 p-4 text-center">
        <p className="text-sm text-muted-foreground font-medium">Arrange to say:</p>
        <p className="mt-1 text-base font-semibold text-foreground">"{q.english}"</p>
        <p className="text-xs text-muted-foreground mt-0.5">{q.romanized}</p>
      </div>

      {/* Staged area */}
      <div className="min-h-14 rounded-xl border-2 border-dashed border-border bg-muted/20 p-3 flex flex-wrap gap-2 items-center">
        {staged.length === 0 && (
          <span className="text-sm text-muted-foreground">Tap words to build the phrase…</span>
        )}
        {staged.map((t, i) => (
          <button
            key={`${t}-${i}`}
            onClick={() => unpick(t, i)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-base font-semibold transition-all",
              submitted && correct && "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40",
              submitted && !correct && "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40",
              !submitted && "border-primary/50 bg-primary/10 text-primary",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Available tiles */}
      <div className="flex flex-wrap gap-2 justify-center">
        {available.map((t, i) => (
          <button
            key={`${t}-${i}`}
            onClick={() => pick(t, i)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-base font-semibold text-foreground transition-all hover:border-primary/40 hover:bg-muted/40"
          >
            {t}
          </button>
        ))}
      </div>

      {/* Submit / feedback */}
      {!submitted ? (
        <button
          onClick={submit}
          disabled={staged.length === 0}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          Check answer
        </button>
      ) : (
        <div
          className={cn(
            "rounded-xl p-3 text-center text-sm font-semibold",
            correct ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : "bg-red-50 text-red-700 dark:bg-red-950/40",
          )}
        >
          {correct ? "Correct! 🎉" : `Correct answer: ${q.nativeScript}`}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question wrapper
// ---------------------------------------------------------------------------

function QuestionCard({
  question,
  index,
  total,
  onAnswer,
  answered,
  activeLang,
}: {
  question: QuizQuestion;
  index: number;
  total: number;
  onAnswer: (selected: string) => void;
  answered: boolean;
  activeLang: string;
}) {
  const typeLabel: Record<string, string> = {
    mcq_translation: "Translation",
    listen_identify: "Listen & Identify",
    order_words: "Order the Words",
  };

  return (
    <div className="space-y-5">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${((index) / total) * 100}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
          {index + 1} / {total}
        </span>
      </div>

      {/* Type label */}
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-bold text-primary">
          {typeLabel[question.type] ?? question.type}
        </span>
      </div>

      {/* Renderer */}
      {question.type === "mcq_translation" && (
        <McqQuestion q={question} onAnswer={onAnswer} answered={answered} />
      )}
      {question.type === "listen_identify" && (
        <ListenQuestion q={question} onAnswer={onAnswer} answered={answered} activeLang={activeLang} />
      )}
      {question.type === "order_words" && (
        <OrderQuestion q={question} onAnswer={onAnswer} answered={answered} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results screen
// ---------------------------------------------------------------------------

function ResultsScreen({
  score,
  total,
  xp,
  onReturnToGames,
}: {
  score: number;
  total: number;
  xp: number;
  onReturnToGames: () => void;
}) {
  const perfect = score === total;
  const shareText = perfect
    ? `I scored ${score}/${total} on today's Bolo Quiz! 🦜🎉 Perfect score!`
    : `I scored ${score}/${total} on today's Bolo Quiz! 🦜 #BoloLanguage`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
      } catch {
        /* dismissed */
      }
    } else {
      await navigator.clipboard.writeText(shareText);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <Mascot pose={perfect ? "cheer" : score >= 3 ? "thumbsup" : "tryagain"} size={110} />

      <div className="space-y-1">
        <h2 className="text-3xl font-extrabold text-foreground">
          {perfect ? "Perfect! 🎉" : score >= 3 ? "Nice work!" : "Keep it up!"}
        </h2>
        <p className="text-muted-foreground text-sm">Today's quiz complete</p>
      </div>

      {/* Score ring */}
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center">
          <span className="text-5xl font-extrabold text-foreground">{score}</span>
          <span className="text-xs text-muted-foreground mt-0.5">out of {total}</span>
        </div>
        <div className="w-px h-10 bg-border" />
        <div className="flex flex-col items-center">
          <span className="text-5xl font-extrabold text-primary">+{xp}</span>
          <span className="text-xs text-muted-foreground mt-0.5">XP earned</span>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-3 w-3 rounded-full",
              i < score ? "bg-emerald-500" : "bg-muted",
            )}
          />
        ))}
      </div>

      {/* Next quiz countdown */}
      <NextQuizCountdown />

      <div className="flex w-full gap-3">
        <button
          onClick={handleShare}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-semibold text-foreground transition-all hover:bg-muted/40"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
        <button
          onClick={onReturnToGames}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
        >
          Back to Games
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function NextQuizCountdown() {
  const countdown = useCountdown(secondsUntilMidnightUtc());
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-2">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">
        Next quiz in <span className="font-bold text-foreground">{countdown}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Already-done screen
// ---------------------------------------------------------------------------

function AlreadyDoneScreen({
  score,
  total,
  xp,
  completedAt,
}: {
  score: number;
  total: number;
  xp: number;
  completedAt: string;
}) {
  const shareText = `I scored ${score}/${total} on today's Bolo Quiz! 🦜 #BoloLanguage`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
      } catch {
        /* dismissed */
      }
    } else {
      await navigator.clipboard.writeText(shareText);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <Mascot pose={score === total ? "cheer" : "thumbsup"} size={100} />

      <div className="space-y-1">
        <h2 className="text-2xl font-extrabold text-foreground">Already played today!</h2>
        <p className="text-sm text-muted-foreground">
          You completed this quiz at{" "}
          {new Date(completedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center">
          <span className="text-5xl font-extrabold text-foreground">{score}</span>
          <span className="text-xs text-muted-foreground mt-0.5">out of {total}</span>
        </div>
        <div className="w-px h-10 bg-border" />
        <div className="flex flex-col items-center">
          <span className="text-5xl font-extrabold text-primary">+{xp}</span>
          <span className="text-xs text-muted-foreground mt-0.5">XP earned</span>
        </div>
      </div>

      <div className="flex gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-3 w-3 rounded-full",
              i < score ? "bg-emerald-500" : "bg-muted",
            )}
          />
        ))}
      </div>

      <NextQuizCountdown />

      <div className="flex w-full gap-3">
        <button
          onClick={handleShare}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-semibold text-foreground transition-all hover:bg-muted/40"
        >
          <Share2 className="h-4 w-4" />
          Share result
        </button>
        <Link
          href="/games"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
        >
          Back to Games
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BoloQuizPage() {
  const { isPlus, isLoading: entLoading } = useEntitlements();
  const { activeLang, activeLanguage } = useLanguage();

  const quizParams = { lang: activeLang };
  const { data, isLoading: quizLoading } = useGetDailyQuiz(quizParams, {
    query: {
      enabled: !!isPlus && !!activeLang,
      queryKey: getGetDailyQuizQueryKey(quizParams),
    },
  });
  const completeMutation = useCompleteDailyQuiz();

  const [quizState, setQuizState] = useState<QuizState>("loading");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [currentAnswered, setCurrentAnswered] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [finalXp, setFinalXp] = useState(0);

  // Transition state machine when data arrives.
  useEffect(() => {
    if (!data) return;
    if (data.completed) {
      setQuizState("already-done");
    } else {
      setQuizState("playing");
    }
  }, [data]);

  const handleAnswer = useCallback(
    (selected: string) => {
      if (currentAnswered) return;
      setCurrentAnswered(true);
      setAnswers((a) => [...a, selected]);
    },
    [currentAnswered],
  );

  const handleNext = useCallback(async () => {
    const questions = data?.questions ?? [];
    const nextIndex = currentIndex + 1;

    if (nextIndex >= questions.length) {
      // Quiz finished — compute local score for instant display, then submit
      // strings to the server for authoritative storage.
      const finalAnswers = [...answers];
      const score = finalAnswers.reduce<number>((acc, ans, i) => {
        const q = questions[i];
        return acc + (q && localIsCorrect(q as QuizQuestion, ans) ? 1 : 0);
      }, 0);
      const xp = score * 10 + (score === 5 ? 20 : 0);
      setFinalScore(score);
      setFinalXp(xp);
      setQuizState("results");
      try {
        const result = await completeMutation.mutateAsync({
          data: { lang: activeLang, answers: finalAnswers },
        });
        // Update with server-authoritative score in case they differ.
        setFinalScore(result.score);
        setFinalXp(result.xpAwarded);
      } catch {
        // Non-fatal: user sees results regardless.
      }
    } else {
      setCurrentIndex(nextIndex);
      setCurrentAnswered(false);
    }
  }, [currentIndex, answers, data, activeLang, completeMutation]);

  // Redirect if not Plus (after entitlements load).
  if (!entLoading && !isPlus) {
    return <Redirect to="/upgrade" />;
  }

  const questions = data?.questions ?? [];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <Link
          href="/games"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Back to Games"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-extrabold text-foreground">Bolo Quiz</h1>
          {activeLanguage && (
            <p className="text-xs text-muted-foreground">{activeLanguage.name}</p>
          )}
        </div>
        <Award className="h-6 w-6 text-primary" />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col">
        {(quizLoading || entLoading || quizState === "loading") && (
          <div className="flex flex-1 items-center justify-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Loading today's quiz…</span>
          </div>
        )}

        {quizState === "already-done" && data?.completed && (
          <AlreadyDoneScreen
            score={data.score ?? 0}
            total={data.total ?? 5}
            xp={data.xpAwarded ?? 0}
            completedAt={String(data.completedAt ?? new Date().toISOString())}
          />
        )}

        {quizState === "playing" && questions.length > 0 && (
          <div className="mx-auto w-full max-w-lg p-5 space-y-6">
            <QuestionCard
              key={currentIndex}
              question={questions[currentIndex]!}
              index={currentIndex}
              total={questions.length}
              onAnswer={handleAnswer}
              answered={currentAnswered}
              activeLang={activeLanguage?.name ?? activeLang}
            />

            {currentAnswered && (
              <button
                onClick={handleNext}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground flex items-center justify-center gap-2"
              >
                {currentIndex + 1 < questions.length ? (
                  <>Next <ChevronRight className="h-4 w-4" /></>
                ) : (
                  "See results"
                )}
              </button>
            )}
          </div>
        )}

        {quizState === "results" && (
          <ResultsScreen
            score={finalScore}
            total={5}
            xp={finalXp}
            onReturnToGames={() => window.history.back()}
          />
        )}
      </div>

      <BottomNav />
    </div>
  );
}
