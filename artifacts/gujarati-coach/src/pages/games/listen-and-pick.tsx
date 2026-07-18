import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft,
  Volume2,
  RefreshCw,
  Home,
  Check,
  X,
  Zap,
  Trophy,
  Headphones,
} from "lucide-react";
import { CategoryIcon } from "@/lib/category-icons";
import {
  useListCategories,
  useListCategoryPhrases,
  getListCategoryPhrasesQueryKey,
  useSynthesizeSpeech,
  useRecordGameSession,
  getGetProgressSummaryQueryKey,
  type Phrase,
} from "@workspace/api-client-react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Mascot } from "@/components/mascot";
import { cn } from "@/lib/utils";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { GAME_CONFIG } from "./game-config";

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = "picker" | "game" | "end";
type AnswerState = "idle" | "correct" | "wrong";

interface Question {
  phrase: Phrase;           // the target phrase being played
  choices: Phrase[];        // 4 phrases (incl. the correct one)
  correctIdx: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildQuestions(phrases: Phrase[], count: number): Question[] {
  // Build exactly `count` questions using repeat-sampling so rounds are always
  // the full length even when the topic has fewer than `count` phrases.
  // Each question always shows `choiceCount` choices, which requires at least
  // `choiceCount` unique phrases in the pool (enforced by the topic picker).
  const questions: Question[] = [];
  let pool = shuffle([...phrases]);
  let poolIdx = 0;

  for (let i = 0; i < count; i++) {
    // Refill and re-shuffle the pool once we've exhausted all phrases.
    if (poolIdx >= pool.length) {
      pool = shuffle([...phrases]);
      poolIdx = 0;
    }
    const phrase = pool[poolIdx++];
    const distractors = shuffle(phrases.filter(p => p.id !== phrase.id)).slice(
      0,
      GAME_CONFIG.listenAndPick.choiceCount - 1,
    );
    const choices = shuffle([phrase, ...distractors]);
    const correctIdx = choices.findIndex(c => c.id === phrase.id);
    questions.push({ phrase, choices, correctIdx });
  }
  return questions;
}

// ─── Topic Picker ─────────────────────────────────────────────────────────────

function TopicPicker({
  activeLang,
  onSelect,
}: {
  activeLang: string;
  onSelect: (categoryId: number, title: string) => void;
}) {
  const { data: categories, isLoading } = useListCategories({ lang: activeLang });

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pt-4">
      <p className="text-sm font-semibold text-muted-foreground">Choose a topic to listen from</p>
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {(categories ?? []).map((cat) => (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id, cat.title)}
              disabled={cat.phraseCount < GAME_CONFIG.listenAndPick.choiceCount}
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm active:scale-[0.98]",
                cat.phraseCount < GAME_CONFIG.listenAndPick.choiceCount && "cursor-not-allowed opacity-50",
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CategoryIcon iconName={cat.iconName} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold text-foreground">{cat.title}</p>
                <p className="text-xs text-muted-foreground">{cat.phraseCount} phrases</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── End Screen ───────────────────────────────────────────────────────────────

function EndScreen({
  score,
  total,
  xpEarned,
  onPlayAgain,
  onChooseTopic,
}: {
  score: number;
  total: number;
  xpEarned: number | null;
  onPlayAgain: () => void;
  onChooseTopic: () => void;
}) {
  const isPerfect = score === total;
  const pose = isPerfect ? "cheer" : score >= total / 2 ? "thumbsup" : "tryagain";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <Mascot pose={pose} size={100} />
      <div className="text-center">
        <h2 className="text-2xl font-extrabold text-foreground">
          {isPerfect ? "Perfect Round! 🎉" : score >= total / 2 ? "Nice Work! 👍" : "Keep Practising! 💪"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {score} / {total} correct
        </p>
      </div>

      <div className="grid w-full max-w-sm grid-cols-2 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-4">
          <Check className="h-5 w-5 text-emerald-500" />
          <span className="text-xl font-extrabold text-foreground">{score}/{total}</span>
          <span className="text-xs text-muted-foreground">Score</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-4">
          <Zap className="h-5 w-5 text-amber-500" />
          <span className="text-xl font-extrabold text-foreground">{xpEarned !== null ? `+${xpEarned}` : "…"}</span>
          <span className="text-xs text-muted-foreground">XP Earned</span>
        </div>
      </div>

      <div className="grid w-full max-w-sm gap-3">
        <button
          onClick={onPlayAgain}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3.5 font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
        >
          <RefreshCw className="h-4 w-4" />
          Play Again
        </button>
        <button
          onClick={onChooseTopic}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-3.5 font-bold text-foreground transition-all hover:bg-muted active:scale-[0.98]"
        >
          <Trophy className="h-4 w-4" />
          Choose Topic
        </button>
        <Link
          href="/games"
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          <Home className="h-4 w-4" />
          Back to Games
        </Link>
      </div>
    </div>
  );
}

// ─── Game Round ───────────────────────────────────────────────────────────────

type PhraseResult = { phraseId: number; selectedPhraseId: number };

function GameRound({
  phrases,
  activeLang,
  activeLanguageName,
  onEnd,
}: {
  phrases: Phrase[];
  activeLang: string;
  activeLanguageName: string | undefined;
  onEnd: (score: number, results: PhraseResult[]) => void;
}) {
  const native = useNativeText();
  const synthesize = useSynthesizeSpeech();

  const [questions] = useState<Question[]>(() =>
    buildQuestions(phrases, GAME_CONFIG.listenAndPick.roundSize)
  );
  const [qIdx, setQIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>("idle");
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // Track per-question answer selections so the server can verify correctness.
  const phraseResultsRef = useRef<PhraseResult[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Cache synthesized audio per phrase id so replaying costs nothing extra
  const audioCache = useRef(new Map<number, { audioBase64: string; format: string }>());

  const q = questions[qIdx];
  const total = questions.length;

  const playPhrase = useCallback(
    async (phrase: Phrase) => {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsPlaying(true);
      try {
        const cached = audioCache.current.get(phrase.id);
        const res =
          cached ??
          (await synthesize.mutateAsync({
            data: { text: phrase.nativeScript, languageName: activeLanguageName },
          }));
        audioCache.current.set(phrase.id, { audioBase64: res.audioBase64, format: res.format });
        const audio = new Audio(`data:audio/${res.format};base64,${res.audioBase64}`);
        audioRef.current = audio;
        audio.onended = () => setIsPlaying(false);
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    },
    [synthesize, activeLanguageName],
  );

  // Auto-play the phrase when the question changes
  useEffect(() => {
    if (q) playPhrase(q.phrase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIdx]);

  // Prefetch next question's audio
  useEffect(() => {
    const next = questions[qIdx + 1];
    if (!next || audioCache.current.has(next.phrase.id)) return;
    synthesize
      .mutateAsync({ data: { text: next.phrase.nativeScript, languageName: activeLanguageName } })
      .then((res) => audioCache.current.set(next.phrase.id, { audioBase64: res.audioBase64, format: res.format }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIdx]);

  const handlePick = (choiceIdx: number) => {
    if (answerState !== "idle") return;

    const isCorrect = choiceIdx === q.correctIdx;
    setPickedIdx(choiceIdx);
    setAnswerState(isCorrect ? "correct" : "wrong");
    if (isCorrect) setScore(s => s + 1);

    // Record the selected phraseId so the server can verify correctness.
    phraseResultsRef.current.push({
      phraseId: q.phrase.id,
      selectedPhraseId: q.choices[choiceIdx].id,
    });

    // If wrong, play the correct phrase so learner hears it
    if (!isCorrect) {
      setTimeout(() => playPhrase(q.phrase), 200);
    }

    setTimeout(() => {
      setAnswerState("idle");
      setPickedIdx(null);
      if (qIdx + 1 >= total) {
        const finalScore = isCorrect ? score + 1 : score;
        onEnd(finalScore, phraseResultsRef.current);
      } else {
        setQIdx(i => i + 1);
      }
    }, GAME_CONFIG.listenAndPick.feedbackDelay);
  };

  if (!q) return null;

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>Question {qIdx + 1} of {total}</span>
          <span className="flex items-center gap-1 text-emerald-600">
            <Check className="h-3.5 w-3.5" />
            {score} correct
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${((qIdx) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Listen card */}
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card p-6">
        <Headphones className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-semibold text-muted-foreground">Listen and pick the matching word</p>
        <button
          onClick={() => playPhrase(q.phrase)}
          disabled={isPlaying}
          className={cn(
            "flex h-20 w-20 items-center justify-center rounded-2xl bg-primary text-white shadow-lg transition-all hover:opacity-90 active:scale-95",
            isPlaying && "animate-pulse opacity-70",
          )}
          aria-label="Play audio"
        >
          <Volume2 className="h-8 w-8" />
        </button>
        {isPlaying && (
          <p className="text-xs text-muted-foreground">Playing…</p>
        )}
      </div>

      {/* Choice cards */}
      <div className="grid grid-cols-2 gap-3">
        {q.choices.map((choice, idx) => {
          let cardClass = "border-border bg-card hover:border-primary/40 hover:bg-primary/5";
          if (answerState !== "idle" && idx === q.correctIdx) {
            cardClass = "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40";
          } else if (answerState === "wrong" && idx === pickedIdx) {
            cardClass = "border-red-400 bg-red-50 dark:bg-red-950/40";
          }

          return (
            <button
              key={choice.id}
              onClick={() => handlePick(idx)}
              disabled={answerState !== "idle"}
              className={cn(
                "relative flex min-h-[80px] items-center justify-center rounded-2xl border p-3 text-center font-semibold transition-all active:scale-[0.97]",
                cardClass,
              )}
            >
              <span
                style={native.style}
                dir={native.dir}
                className="text-base leading-snug text-foreground"
              >
                {choice.nativeScript}
              </span>
              {answerState !== "idle" && idx === q.correctIdx && (
                <span className="absolute right-2 top-2">
                  <Check className="h-4 w-4 text-emerald-600" />
                </span>
              )}
              {answerState === "wrong" && idx === pickedIdx && (
                <span className="absolute right-2 top-2">
                  <X className="h-4 w-4 text-red-600" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ListenAndPickPage() {
  const { activeLang, activeLanguage } = useLanguage();
  const queryClient = useQueryClient();
  const recordSession = useRecordGameSession();
  const [phase, setPhase] = useState<Phase>("picker");
  const [selectedCategory, setSelectedCategory] = useState<{ id: number; title: string } | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const [finalXp, setFinalXp] = useState<number | null>(null);
  const [finalPhraseResults, setFinalPhraseResults] = useState<PhraseResult[]>([]);
  const [gameKey, setGameKey] = useState(0);

  const phraseQuery = useListCategoryPhrases(
    selectedCategory?.id ?? 0,
    activeLang,
    {
      query: {
        enabled: !!selectedCategory,
        queryKey: getListCategoryPhrasesQueryKey(selectedCategory?.id ?? 0, activeLang),
      },
    }
  );
  const phrases = phraseQuery.data ?? [];

  const handleTopicSelect = (id: number, title: string) => {
    setSelectedCategory({ id, title });
    setGameKey(k => k + 1);
    setPhase("game");
  };

  const handleEnd = (score: number, results: PhraseResult[]) => {
    setFinalScore(score);
    setFinalPhraseResults(results);
    setPhase("end");
    // Post session to server for XP + badge evaluation; use server-returned XP.
    if (selectedCategory && results.length > 0) {
      recordSession.mutate(
        {
          data: {
            languageCode: activeLang,
            game: "listen-and-pick",
            categoryId: selectedCategory.id,
            phraseResults: results,
          },
        },
        {
          onSuccess: (data) => {
            setFinalXp(data.xpEarned);
            queryClient.invalidateQueries({ queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }) });
          },
        },
      );
    }
  };

  const handlePlayAgain = () => {
    setGameKey(k => k + 1);
    setPhase("game");
  };

  const handleChooseTopic = () => {
    setSelectedCategory(null);
    setPhase("picker");
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        {phase === "game" || phase === "end" ? (
          <button
            onClick={handleChooseTopic}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Back to topics"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link
            href="/games"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Back to Games"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="text-lg font-extrabold text-foreground">Listen &amp; Pick</h1>
      </div>

      {phase === "picker" && (
        <TopicPicker activeLang={activeLang} onSelect={handleTopicSelect} />
      )}

      {phase === "game" && (
        phraseQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : phrases.length < GAME_CONFIG.listenAndPick.choiceCount ? (
          <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
            Need at least {GAME_CONFIG.listenAndPick.choiceCount} phrases for this game. Choose another topic.
          </div>
        ) : (
          <GameRound
            key={gameKey}
            phrases={phrases}
            activeLang={activeLang}
            activeLanguageName={activeLanguage?.name}
            onEnd={handleEnd}
          />
        )
      )}

      {phase === "end" && (
        <EndScreen
          score={finalScore}
          total={GAME_CONFIG.listenAndPick.roundSize}
          xpEarned={finalXp}
          onPlayAgain={handlePlayAgain}
          onChooseTopic={handleChooseTopic}
        />
      )}
      {/* phraseResults tracked in finalPhraseResults for API submission */}

      <BottomNav />
    </div>
  );
}
