// Chunk 6B: the shared quick-game frame, built ONCE for all five quick games
// (Ticket Check, Wrong Platform, Luggage Match, Express Listening, Signal
// Lights). It owns the page chrome, topic picker with per-game floors, the
// round progress strip, the optional per-round timer, the result beat (score,
// XP, and the Chai earn beat), the decline paths, and the single session POST.
//
// Launch contexts (Story 3):
//   hub launch          no context key at all (byte-identical to before)
//   trackside signal    context "signal" + contextRef "gap-N"
//   zone closeout       context "closeout"
// On a 201 with chaiGranted the result beat surfaces the Chai earn chip and
// the tokens query is invalidated so the wallet updates.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import {
  ArrowLeft,
  Check,
  Coffee,
  Home,
  Map as MapIcon,
  RefreshCw,
  Timer,
  Trophy,
  Zap,
} from "lucide-react";
import { CategoryIcon } from "@/lib/category-icons";
import {
  useListCategories,
  useListCategoryPhrases,
  getListCategoryPhrasesQueryKey,
  useRecordGameSession,
  getGetProgressSummaryQueryKey,
  getGetTokensQueryKey,
  type Phrase,
} from "@workspace/api-client-react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { GameMuteButton, useGameAudio } from "@/components/game-mute-button";
import { Mascot } from "@/components/mascot";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/language-context";
import { markSignalCleared, type QuickGameDef } from "@/lib/quick-games";

// ─── Launch context ──────────────────────────────────────────────────────────

export type QuickLaunch = {
  categoryId: number | null;
  context: "signal" | "closeout" | null;
  contextRef: string | null;
  gap: number | null;
  /** True when the game was launched from the journey (signal or closeout). */
  fromJourney: boolean;
};

/** Parses ?cat=&ctx=&gap= from the current location. ctx=signal without a
 *  valid gap is ignored entirely (the server requires contextRef there). */
export function useQuickLaunch(): QuickLaunch {
  const search = useSearch();
  return useMemo(() => {
    const params = new URLSearchParams(search);
    const cat = params.get("cat");
    const ctx = params.get("ctx");
    const gap = params.get("gap");
    const categoryId = cat && /^\d+$/.test(cat) ? Number(cat) : null;
    const gapNum = gap && /^\d+$/.test(gap) ? Number(gap) : null;
    const context =
      ctx === "signal" && gapNum !== null
        ? ("signal" as const)
        : ctx === "closeout"
          ? ("closeout" as const)
          : null;
    return {
      categoryId,
      context,
      contextRef: context === "signal" ? `gap-${gapNum}` : null,
      gap: context === "signal" ? gapNum : null,
      fromJourney: context !== null,
    };
  }, [search]);
}

// ─── Round API handed to each game's round component ─────────────────────────

export type QuickRoundResult = {
  phraseId: number;
  selectedPhraseId: number;
  correct: boolean;
};

export type QuickRoundApi = {
  /** 0-based current round. */
  round: number;
  total: number;
  correct: number;
  /** Countdown for timed games, null when the game is untimed. */
  secondsLeft: number | null;
  /** True once the current round's timer ran out (game must submit a miss). */
  timedOut: boolean;
  /** Freeze the timer the moment an answer lands (before feedback holds). */
  lockRound: () => void;
  /** Record the round and advance (or end the run on the last round). */
  submitRound: (result: QuickRoundResult) => void;
};

export type QuickRoundProps = {
  phrases: Phrase[];
  api: QuickRoundApi;
  soundOn: boolean;
  activeLang: string;
  activeLanguageName: string | undefined;
};

// ─── Topic picker with a per-game floor ──────────────────────────────────────

function QuickTopicPicker({
  activeLang,
  floor,
  onSelect,
}: {
  activeLang: string;
  floor: number;
  onSelect: (categoryId: number, title: string) => void;
}) {
  const { data: categories, isLoading } = useListCategories({ lang: activeLang });

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pt-4">
      <p className="text-sm font-semibold text-muted-foreground">Choose a topic to play from</p>
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
              disabled={cat.phraseCount < floor}
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm active:scale-[0.98]",
                cat.phraseCount < floor && "cursor-not-allowed opacity-50",
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

// ─── Result beat ─────────────────────────────────────────────────────────────

function QuickEndScreen({
  score,
  total,
  xpEarned,
  chaiEarned,
  fromJourney,
  onPlayAgain,
  onChooseTopic,
}: {
  score: number;
  total: number;
  xpEarned: number | null;
  chaiEarned: number | null;
  fromJourney: boolean;
  onPlayAgain: () => void;
  onChooseTopic: (() => void) | null;
}) {
  const isPerfect = score === total;
  const pose = isPerfect ? "cheer" : score >= total / 2 ? "thumbsup" : "tryagain";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6" data-testid="quick-end">
      <Mascot pose={pose} size={100} />
      <div className="text-center">
        <h2 className="text-2xl font-extrabold text-foreground">
          {isPerfect ? "Perfect Round! 🎉" : score >= total / 2 ? "Nice Work! 👍" : "Keep Practicing! 💪"}
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

      {/* Chai earn beat: only when the server granted tokens for this run
          (first clear of a trackside signal or a zone closeout). Modeled on
          the +XP chip pattern; the wallet's Coffee icon keeps Chai's look. */}
      {chaiEarned !== null && chaiEarned > 0 && (
        <div
          data-testid="chai-earn-beat"
          className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-extrabold text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
        >
          <Coffee className="h-4 w-4" />
          +{chaiEarned} Chai earned
        </div>
      )}

      <div className="grid w-full max-w-sm gap-3">
        <button
          onClick={onPlayAgain}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3.5 font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
        >
          <RefreshCw className="h-4 w-4" />
          Play Again
        </button>
        {onChooseTopic && (
          <button
            onClick={onChooseTopic}
            className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-3.5 font-bold text-foreground transition-all hover:bg-muted active:scale-[0.98]"
          >
            <Trophy className="h-4 w-4" />
            Choose Topic
          </button>
        )}
        {fromJourney ? (
          <Link
            href="/journey"
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            <MapIcon className="h-4 w-4" />
            Back to the journey
          </Link>
        ) : (
          <Link
            href="/games"
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            <Home className="h-4 w-4" />
            Back to Games
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Shell ───────────────────────────────────────────────────────────────────

type Phase = "picker" | "game" | "end";

export function QuickGameShell({
  def,
  instruction,
  secondsPerRound,
  totalRounds,
  renderRound,
}: {
  def: QuickGameDef;
  /** One-line how-to shown above the round UI. */
  instruction: string;
  /** Per-round countdown in seconds; omit for untimed games. */
  secondsPerRound?: number;
  /** Rounds for a given phrase pool (pairs count for Luggage Match). */
  totalRounds: (phrases: Phrase[]) => number;
  renderRound: (props: QuickRoundProps) => ReactNode;
}) {
  const { activeLang, activeLanguage } = useLanguage();
  const { soundOn, toggle: toggleSound } = useGameAudio();
  const queryClient = useQueryClient();
  const recordSession = useRecordGameSession();
  const launch = useQuickLaunch();
  const { data: categories } = useListCategories({ lang: activeLang });

  const [phase, setPhase] = useState<Phase>(launch.categoryId !== null ? "game" : "picker");
  const [selectedCategory, setSelectedCategory] = useState<{ id: number; title: string } | null>(
    launch.categoryId !== null ? { id: launch.categoryId, title: "" } : null,
  );
  const [gameKey, setGameKey] = useState(0);

  const [roundIndex, setRoundIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [locked, setLocked] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(secondsPerRound ?? null);
  const resultsRef = useRef<QuickRoundResult[]>([]);

  const [finalScore, setFinalScore] = useState(0);
  const [finalTotal, setFinalTotal] = useState(0);
  const [finalXp, setFinalXp] = useState<number | null>(null);
  const [chaiEarned, setChaiEarned] = useState<number | null>(null);

  const phraseQuery = useListCategoryPhrases(selectedCategory?.id ?? 0, activeLang, {
    query: {
      enabled: !!selectedCategory,
      queryKey: getListCategoryPhrasesQueryKey(selectedCategory?.id ?? 0, activeLang),
    },
  });
  const phrases = phraseQuery.data ?? [];
  const total = phrases.length >= def.floor ? totalRounds(phrases) : 0;

  // Per-round countdown for timed games; freezes once the round is locked.
  useEffect(() => {
    if (phase !== "game" || secondsPerRound == null || locked) return;
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      setTimedOut(true);
      setLocked(true);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsPerRound, locked, secondsLeft]);

  const resetRun = () => {
    resultsRef.current = [];
    setRoundIndex(0);
    setCorrect(0);
    setLocked(false);
    setTimedOut(false);
    setSecondsLeft(secondsPerRound ?? null);
    setFinalXp(null);
    setChaiEarned(null);
  };

  const finishRun = (results: QuickRoundResult[], score: number, roundTotal: number) => {
    setFinalScore(score);
    setFinalTotal(roundTotal);
    setPhase("end");
    if (!selectedCategory || results.length === 0) return;
    recordSession.mutate(
      {
        data: {
          languageCode: activeLang,
          game: def.serverGame,
          categoryId: selectedCategory.id,
          phraseResults: results.map(({ phraseId, selectedPhraseId }) => ({
            phraseId,
            selectedPhraseId,
          })),
          // Hub launches send NO context key at all (byte-identical payload).
          ...(launch.context !== null
            ? {
                context: launch.context,
                ...(launch.contextRef !== null ? { contextRef: launch.contextRef } : {}),
              }
            : {}),
        },
      },
      {
        onSuccess: (data) => {
          setFinalXp(data.xpEarned);
          queryClient.invalidateQueries({
            queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }),
          });
          const granted = data.chaiGranted ?? 0;
          if (granted > 0) {
            setChaiEarned(granted);
            queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
          }
          if (launch.context === "signal" && launch.gap !== null) {
            markSignalCleared(activeLang, launch.gap);
          }
        },
      },
    );
  };

  const api: QuickRoundApi = {
    round: roundIndex,
    total,
    correct,
    secondsLeft: secondsPerRound != null ? secondsLeft : null,
    timedOut,
    lockRound: () => setLocked(true),
    submitRound: (result) => {
      resultsRef.current.push(result);
      const nextCorrect = result.correct ? correct + 1 : correct;
      if (result.correct) setCorrect(nextCorrect);
      if (resultsRef.current.length >= total) {
        finishRun(resultsRef.current, nextCorrect, total);
      } else {
        setRoundIndex((i) => i + 1);
        setLocked(false);
        setTimedOut(false);
        setSecondsLeft(secondsPerRound ?? null);
      }
    },
  };

  const handleTopicSelect = (id: number, title: string) => {
    setSelectedCategory({ id, title });
    resetRun();
    setGameKey((k) => k + 1);
    setPhase("game");
  };

  const handlePlayAgain = () => {
    resetRun();
    setGameKey((k) => k + 1);
    setPhase("game");
  };

  const handleChooseTopic = () => {
    setSelectedCategory(null);
    setPhase("picker");
  };

  // A journey launch pins its category: declining returns to the journey
  // instead of the topic picker, so the picker is a hub-only surface.
  const pinnedLaunch = launch.categoryId !== null;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background pb-28 lg:pb-8" data-testid="quick-game-frame">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        {phase !== "picker" && !pinnedLaunch ? (
          <button
            onClick={handleChooseTopic}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Back to topics"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link
            href={launch.fromJourney ? "/journey" : "/games"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
            aria-label={launch.fromJourney ? "Back to the journey" : "Back to Games"}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="text-lg font-extrabold text-foreground">{def.title}</h1>
        <div className="ml-auto">
          <GameMuteButton soundOn={soundOn} onToggle={toggleSound} />
        </div>
      </div>

      {phase === "picker" && (
        <QuickTopicPicker activeLang={activeLang} floor={def.floor} onSelect={handleTopicSelect} />
      )}

      {phase === "game" &&
        (selectedCategory && phraseQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : phrases.length < def.floor ? (
          phraseQuery.isFetched || !selectedCategory ? (
            <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
              Need at least {def.floor} phrases for this game. Choose another topic.
            </div>
          ) : null
        ) : (
          <div className="flex flex-1 flex-col gap-4 px-4 pb-4" key={gameKey}>
            {/* Progress strip + optional timer */}
            <div className="space-y-1.5 pt-3" data-testid="quick-round-progress">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>
                  Round {Math.min(roundIndex + 1, total)} of {total}
                </span>
                <span className="flex items-center gap-3">
                  {secondsPerRound != null && secondsLeft !== null && (
                    <span
                      data-testid="quick-timer"
                      className={cn(
                        "flex items-center gap-1",
                        secondsLeft <= 2 ? "text-red-600" : "text-muted-foreground",
                      )}
                    >
                      <Timer className="h-3.5 w-3.5" />
                      {secondsLeft}s
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-emerald-600">
                    <Check className="h-3.5 w-3.5" />
                    {correct} correct
                  </span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${(roundIndex / Math.max(1, total)) * 100}%` }}
                />
              </div>
            </div>

            <p className="text-center text-sm font-semibold text-muted-foreground">{instruction}</p>

            {renderRound({
              phrases,
              api,
              soundOn,
              activeLang,
              activeLanguageName: activeLanguage?.name,
            })}
          </div>
        ))}

      {phase === "end" && (
        <QuickEndScreen
          score={finalScore}
          total={finalTotal}
          xpEarned={finalXp}
          chaiEarned={chaiEarned}
          fromJourney={launch.fromJourney}
          onPlayAgain={handlePlayAgain}
          onChooseTopic={pinnedLaunch ? null : handleChooseTopic}
        />
      )}

      <BottomNav />
    </div>
  );
}

/** Shared shuffle for the quick games (Fisher-Yates). */
export function quickShuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
