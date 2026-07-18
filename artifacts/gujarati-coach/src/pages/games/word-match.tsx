import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Link2, RefreshCw, Home, Clock, Zap, Trophy } from "lucide-react";
import {
  useListCategories,
  useListCategoryPhrases,
  getListCategoryPhrasesQueryKey,
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

type Difficulty = "easy" | "normal";

interface GameCard {
  id: string;       // unique card id
  pairId: number;   // phrase id (shared between the two cards of a pair)
  type: "native" | "english";
  label: string;
  state: "hidden" | "flipped" | "matched" | "error";
}

type Phase = "picker" | "difficulty" | "game" | "end";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildCards(phrases: Phrase[], count: number): GameCard[] {
  const pool = shuffle([...phrases]).slice(0, count);
  const cards: GameCard[] = [];
  for (const p of pool) {
    cards.push({ id: `${p.id}-n`, pairId: p.id, type: "native", label: p.nativeScript, state: "hidden" });
    cards.push({ id: `${p.id}-e`, pairId: p.id, type: "english", label: p.english, state: "hidden" });
  }
  return shuffle(cards);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FlipCard({
  card,
  onFlip,
  native,
}: {
  card: GameCard;
  onFlip: (id: string) => void;
  native: ReturnType<typeof useNativeText>;
}) {
  const isFlipped = card.state !== "hidden";
  const isMatched = card.state === "matched";
  const isError = card.state === "error";

  return (
    <button
      onClick={() => card.state === "hidden" && onFlip(card.id)}
      disabled={card.state !== "hidden"}
      aria-label={isFlipped ? card.label : "Face-down card"}
      style={{ perspective: "600px" }}
      className="h-20 w-full sm:h-24"
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: `transform ${GAME_CONFIG.wordMatch.flipDuration}ms ease`,
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Back face (hidden state) */}
        <div
          style={{ backfaceVisibility: "hidden" }}
          className="absolute inset-0 flex items-center justify-center rounded-2xl border border-border bg-card shadow-sm hover:border-primary/40 hover:bg-primary/5 transition-colors"
        >
          <Link2 className="h-6 w-6 text-muted-foreground/40" />
        </div>

        {/* Front face (flipped/matched/error state) */}
        <div
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-2xl border px-2 py-1 text-center text-sm font-semibold leading-tight shadow-sm transition-colors",
            isMatched && "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
            isError && "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
            !isMatched && !isError && "border-primary/50 bg-primary/10 text-foreground",
          )}
        >
          <span
            style={card.type === "native" ? native.style : undefined}
            dir={card.type === "native" ? native.dir : undefined}
            className="line-clamp-3"
          >
            {card.label}
          </span>
        </div>
      </div>
    </button>
  );
}

// Minimum phrase counts required per difficulty.
// Easy: 6 pairs → 6 unique phrases; Normal: 8 pairs → 8 unique phrases.
const WORD_MATCH_MIN_EASY = 6;
const WORD_MATCH_MIN_NORMAL = 8;

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
      <p className="text-sm font-semibold text-muted-foreground">Choose a topic to match</p>
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {(categories ?? []).map((cat) => {
            // Require at least 6 phrases so the Easy (4×3, 6-pair) grid is always full.
            const disabled = cat.phraseCount < WORD_MATCH_MIN_EASY;
            return (
              <button
                key={cat.id}
                onClick={() => onSelect(cat.id, cat.title)}
                disabled={disabled}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm active:scale-[0.98]",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl">
                  {cat.iconName ?? "📚"}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold text-foreground">{cat.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {disabled
                      ? `Need ${WORD_MATCH_MIN_EASY}+ phrases`
                      : `${cat.phraseCount} phrases`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Difficulty Picker ────────────────────────────────────────────────────────

function DifficultyPicker({
  topicTitle,
  phraseCount,
  onSelect,
  onBack,
}: {
  topicTitle: string;
  phraseCount: number;
  onSelect: (d: Difficulty) => void;
  onBack: () => void;
}) {
  const canNormal = phraseCount >= WORD_MATCH_MIN_NORMAL;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <Mascot pose="cheer" size={80} />
      <div className="text-center">
        <h2 className="text-xl font-extrabold text-foreground">{topicTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pick a grid size</p>
      </div>
      <div className="grid w-full max-w-sm gap-3">
        <button
          onClick={() => onSelect("easy")}
          className="flex flex-col items-center gap-1 rounded-2xl border-2 border-emerald-400 bg-emerald-50 px-6 py-5 text-emerald-700 transition-all hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
        >
          <span className="text-lg font-extrabold">Easy</span>
          <span className="text-sm font-medium opacity-80">4 × 3 grid · 6 pairs · {GAME_CONFIG.wordMatch.xpEasy} XP</span>
        </button>
        <button
          onClick={() => canNormal && onSelect("normal")}
          disabled={!canNormal}
          className={cn(
            "flex flex-col items-center gap-1 rounded-2xl border-2 border-primary bg-primary/10 px-6 py-5 text-primary transition-all hover:bg-primary/20",
            !canNormal && "cursor-not-allowed opacity-40",
          )}
        >
          <span className="text-lg font-extrabold">Normal</span>
          <span className="text-sm font-medium opacity-80">
            {canNormal ? `4 × 4 grid · 8 pairs · ${GAME_CONFIG.wordMatch.xpNormal} XP` : "Need 8+ phrases in topic"}
          </span>
        </button>
      </div>
      <button
        onClick={onBack}
        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
      >
        ← Back to topics
      </button>
    </div>
  );
}

// ─── End Screen ───────────────────────────────────────────────────────────────

function EndScreen({
  elapsed,
  difficulty,
  categoryId,
  usedPhraseIds,
  activeLang,
  onPlayAgain,
  onChooseTopic,
}: {
  elapsed: number;
  difficulty: Difficulty;
  categoryId: number;
  usedPhraseIds: number[];
  activeLang: string;
  onPlayAgain: () => void;
  onChooseTopic: () => void;
}) {
  const queryClient = useQueryClient();
  const recordSession = useRecordGameSession();
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current || usedPhraseIds.length === 0) return;
    submitted.current = true;
    recordSession.mutate(
      {
        data: {
          languageCode: activeLang,
          game: "word-match",
          categoryId,
          phraseResults: usedPhraseIds.map((id) => ({ phraseId: id, selectedPhraseId: id })),
        },
      },
      {
        onSuccess: (data) => {
          setXpEarned(data.xpEarned);
          queryClient.invalidateQueries({ queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }) });
        },
      },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <Mascot pose="cheer" size={100} />
      <div className="text-center">
        <h2 className="text-2xl font-extrabold text-foreground">All Matched! 🎉</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {difficulty === "easy" ? "Easy" : "Normal"} mode complete
        </p>
      </div>

      <div className="grid w-full max-w-sm grid-cols-2 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-4">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <span className="text-xl font-extrabold text-foreground">{formatTime(elapsed)}</span>
          <span className="text-xs text-muted-foreground">Time</span>
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

// ─── Game Board ───────────────────────────────────────────────────────────────

function GameBoard({
  phrases,
  difficulty,
  onEnd,
}: {
  phrases: Phrase[];
  difficulty: Difficulty;
  onEnd: (elapsed: number, usedPhraseIds: number[]) => void;
}) {
  const native = useNativeText();
  const pairCount = difficulty === "easy" ? 6 : 8;
  const cols = difficulty === "easy" ? 4 : 4; // always 4 cols; rows differ

  const [cards, setCards] = useState<GameCard[]>(() => buildCards(phrases, pairCount));
  const [flipped, setFlipped] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const matchedCount = cards.filter(c => c.state === "matched").length;
  const allMatched = matchedCount === cards.length;

  useEffect(() => {
    if (allMatched) {
      if (timerRef.current) clearInterval(timerRef.current);
      const total = Math.floor((Date.now() - startRef.current) / 1000);
      // Collect unique phrase IDs used in the board — all are "correct" since
      // matching is the only way to complete a pair.
      const usedPhraseIds = [...new Set(cards.map(c => c.pairId))];
      // Short delay so the final matched animation is visible
      setTimeout(() => onEnd(total, usedPhraseIds), 600);
    }
  }, [allMatched, onEnd]);

  const handleFlip = useCallback((id: string) => {
    if (locked) return;

    setCards(prev =>
      prev.map(c => c.id === id ? { ...c, state: "flipped" } : c)
    );

    setFlipped(prev => {
      const next = [...prev, id];
      if (next.length < 2) return next;

      // We have two flipped cards — check for a match
      setLocked(true);
      const [aId, bId] = next;

      setCards(current => {
        const a = current.find(c => c.id === aId)!;
        const b = current.find(c => c.id === bId)!;
        const isMatch = a.pairId === b.pairId && a.type !== b.type;

        if (isMatch) {
          const updated = current.map(c =>
            c.id === aId || c.id === bId ? { ...c, state: "matched" as const } : c
          );
          setLocked(false);
          return updated;
        } else {
          const updated = current.map(c =>
            c.id === aId || c.id === bId ? { ...c, state: "error" as const } : c
          );
          setTimeout(() => {
            setCards(cc =>
              cc.map(c =>
                c.id === aId || c.id === bId ? { ...c, state: "hidden" as const } : c
              )
            );
            setLocked(false);
          }, GAME_CONFIG.wordMatch.mismatchDelay);
          return updated;
        }
      });

      return [];
    });
  }, [locked]);

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <Clock className="h-4 w-4" />
          {formatTime(elapsed)}
        </div>
        <div className="text-sm font-semibold text-muted-foreground">
          {matchedCount / 2} / {pairCount} pairs
        </div>
      </div>

      {/* Card grid */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {cards.map(card => (
          <FlipCard key={card.id} card={card} onFlip={handleFlip} native={native} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WordMatchPage() {
  const { activeLang } = useLanguage();
  const [phase, setPhase] = useState<Phase>("picker");
  const [selectedCategory, setSelectedCategory] = useState<{ id: number; title: string } | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [elapsed, setElapsed] = useState(0);
  const [usedPhraseIds, setUsedPhraseIds] = useState<number[]>([]);
  const [gameKey, setGameKey] = useState(0); // remount game board for play-again

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
    setPhase("difficulty");
  };

  const handleDifficultySelect = (d: Difficulty) => {
    setDifficulty(d);
    setGameKey(k => k + 1);
    setPhase("game");
  };

  const handleEnd = (t: number, ids: number[]) => {
    setElapsed(t);
    setUsedPhraseIds(ids);
    setPhase("end");
  };

  const handlePlayAgain = () => {
    setGameKey(k => k + 1);
    setPhase("game");
  };

  const handleChooseTopic = () => {
    setSelectedCategory(null);
    setPhase("picker");
  };

  const xpEarned = difficulty === "easy"
    ? GAME_CONFIG.wordMatch.xpEasy
    : GAME_CONFIG.wordMatch.xpNormal;

  const phaseTitle: Record<Phase, string> = {
    picker: "Word Match",
    difficulty: "Word Match",
    game: "Word Match",
    end: "Word Match",
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
        ) : phase === "difficulty" ? (
          <button
            onClick={() => setPhase("picker")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Back"
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
        <h1 className="text-lg font-extrabold text-foreground">{phaseTitle[phase]}</h1>
      </div>

      {/* Phase content */}
      {phase === "picker" && (
        <TopicPicker activeLang={activeLang} onSelect={handleTopicSelect} />
      )}

      {phase === "difficulty" && selectedCategory && (
        <DifficultyPicker
          topicTitle={selectedCategory.title}
          phraseCount={phrases.length}
          onSelect={handleDifficultySelect}
          onBack={() => setPhase("picker")}
        />
      )}

      {phase === "game" && (
        phraseQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : phrases.length < (difficulty === "easy" ? WORD_MATCH_MIN_EASY : WORD_MATCH_MIN_NORMAL) ? (
          <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
            Not enough phrases in this topic yet. Choose another topic.
          </div>
        ) : (
          <GameBoard
            key={gameKey}
            phrases={phrases}
            difficulty={difficulty}
            onEnd={handleEnd}
          />
        )
      )}

      {phase === "end" && selectedCategory && (
        <EndScreen
          elapsed={elapsed}
          difficulty={difficulty}
          categoryId={selectedCategory.id}
          usedPhraseIds={usedPhraseIds}
          activeLang={activeLang}
          onPlayAgain={handlePlayAgain}
          onChooseTopic={handleChooseTopic}
        />
      )}

      <BottomNav />
    </div>
  );
}
