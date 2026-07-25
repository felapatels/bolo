import { useState, useEffect } from "react";
import { Link, Redirect } from "wouter";
import { ArrowLeft, Layers, RotateCcw, Home, Check, X, ChevronRight } from "lucide-react";
import { webHaptic } from "@/lib/haptics";
import { useEntitlements } from "@/lib/entitlements";
import {
  useListCategories,
  useListCategoryPhrases,
  useRecordGameSession,
  getGetProgressSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Mascot } from "@/components/mascot";
import { Confetti } from "@/components/ui/confetti";
import { cn } from "@/lib/utils";

const PHRASES_PER_ROUND = 6; // 5–8

type GamePhase = "setup" | "playing" | "done";

interface Phrase {
  id: number;
  nativeScript: string;
  romanized: string;
  english: string;
}

interface WordSlot {
  word: string;
  tileId: string; // unique id for the tile
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Split a phrase string into word tokens, filtering blanks */
function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Pick multi-word phrases (≥2 words) for the game */
function pickPhrases(all: Phrase[]): Phrase[] {
  const multi = all.filter((p) => tokenize(p.nativeScript).length >= 2);
  const pool = shuffle(multi.length >= PHRASES_PER_ROUND ? multi : [...multi, ...shuffle(all)]);
  return pool.slice(0, PHRASES_PER_ROUND);
}

// ─── Setup ───────────────────────────────────────────────────────────────────

function SetupScreen({ onStart }: { onStart: (categoryId: number) => void }) {
  const { activeLang } = useLanguage();
  const { isPlus } = useEntitlements();
  const { data: categories = [] } = useListCategories({ lang: activeLang });
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const chosen = selectedId ?? categories[0]?.id ?? null;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background pb-24 lg:pb-8">
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <Link
          href="/games"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Back to Games"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-extrabold text-foreground">Phrase Builder</h1>
      </div>

      <div className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 pt-8">
        {/* Hero */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-100 dark:bg-indigo-950/40">
            <Layers className="h-10 w-10 text-indigo-500" strokeWidth={1.75} />
          </div>
          <h2 className="text-2xl font-extrabold text-foreground">Build the phrase</h2>
          <p className="text-sm text-muted-foreground">
            Tap word tiles to arrange them into the correct order.
          </p>
        </div>

        {/* Category picker */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Topic</label>
          <div className="grid max-h-52 gap-2 overflow-y-auto">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedId(cat.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                  chosen === cat.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:bg-muted/50",
                )}
              >
                <span className="text-base font-semibold">{cat.title}</span>
                {chosen === cat.id && <ChevronRight className="ml-auto h-4 w-4 shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Info strip */}
        <div className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-card text-center">
          <div className="py-3">
            <p className="text-xl font-extrabold text-indigo-500">{PHRASES_PER_ROUND}</p>
            <p className="text-xs text-muted-foreground">Phrases</p>
          </div>
          <div className="py-3">
            <p className="text-xl font-extrabold text-primary">Tiles</p>
            <p className="text-xs text-muted-foreground">Tap to place</p>
          </div>
          <div className="py-3">
            <p className="text-xl font-extrabold text-primary">{isPlus ? "Plus" : "Free"}</p>
            <p className="text-xs text-muted-foreground">Plan</p>
          </div>
        </div>

        <button
          disabled={!chosen}
          onClick={() => chosen !== null && onStart(chosen)}
          className="w-full rounded-xl bg-primary px-6 py-4 font-extrabold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          Start Game
        </button>
      </div>
      <BottomNav />
    </div>
  );
}

// ─── Playing ──────────────────────────────────────────────────────────────────

// submittedText is the assembled words joined by space; the server checks
// submittedText.trim() === phrase.nativeScript.trim() to determine correctness.
interface PhraseResult {
  phraseId: number;
  submittedText: string;
}

interface PhraseBuilderState {
  placed: WordSlot[]; // words in the drop zone (in order)
  tiles: WordSlot[]; // words still in the tile tray
  status: "idle" | "correct" | "wrong";
  wrongMask: boolean[]; // per-placed-slot: is this word wrong?
}

function initPhraseState(words: string[]): PhraseBuilderState {
  const shuffledWords = shuffle(words.map((w, i) => ({ word: w, tileId: `${w}-${i}` })));
  return {
    placed: [],
    tiles: shuffledWords,
    status: "idle",
    wrongMask: [],
  };
}

function PlayingScreen({
  categoryId,
  onDone,
}: {
  categoryId: number;
  onDone: (results: PhraseResult[], correctCount: number) => void;
}) {
  const { activeLang } = useLanguage();
  const nativeText = useNativeText();
  const { data: allPhrases = [], isLoading } = useListCategoryPhrases(categoryId, activeLang);

  const [round, setRound] = useState<Phrase[]>([]);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [pState, setPState] = useState<PhraseBuilderState>({ placed: [], tiles: [], status: "idle", wrongMask: [] });
  const [results, setResults] = useState<PhraseResult[]>([]);
  const [correctCount, setCorrectCount] = useState(0);

  useEffect(() => {
    if (allPhrases.length === 0) return;
    const picked = pickPhrases(allPhrases as Phrase[]);
    setRound(picked);
    setPhraseIdx(0);
    const words = tokenize(picked[0].nativeScript);
    setPState(initPhraseState(words));
  }, [allPhrases]);

  const phrase = round[phraseIdx] ?? null;
  const targetWords = phrase ? tokenize(phrase.nativeScript) : [];
  const allPlaced = phrase ? pState.placed.length === targetWords.length : false;

  // Tap a tile -> place it
  const placeTile = (tile: WordSlot) => {
    if (pState.status !== "idle") return;
    setPState((prev) => ({
      ...prev,
      tiles: prev.tiles.filter((t) => t.tileId !== tile.tileId),
      placed: [...prev.placed, tile],
    }));
  };

  // Tap a placed word -> return it to tiles
  const returnTile = (tile: WordSlot) => {
    if (pState.status !== "idle") return;
    setPState((prev) => ({
      ...prev,
      placed: prev.placed.filter((t) => t.tileId !== tile.tileId),
      tiles: [...prev.tiles, tile],
    }));
  };

  const handleCheck = () => {
    if (!phrase || !allPlaced) return;
    const placedWords = pState.placed.map((t) => t.word);
    const submittedText = placedWords.join(" ");
    const correct = submittedText === phrase.nativeScript;
    webHaptic(correct ? 'success' : 'warning');
    if (correct) {
      setPState((prev) => ({ ...prev, status: "correct", wrongMask: [] }));
      setCorrectCount((c) => c + 1);
    } else {
      const mask = pState.placed.map((t, i) => t.word !== targetWords[i]);
      setPState((prev) => ({ ...prev, status: "wrong", wrongMask: mask }));
    }
    // Send the assembled text; server determines correctness server-side
    setResults((prev) => [...prev, { phraseId: phrase.id, submittedText }]);
  };

  const handleNext = () => {
    const next = phraseIdx + 1;
    if (next >= round.length) {
      // correctCount was already incremented in handleCheck for this phrase.
      onDone(results, correctCount);
      return;
    }
    setPhraseIdx(next);
    const words = tokenize(round[next].nativeScript);
    setPState(initPhraseState(words));
  };

  if (isLoading || round.length === 0) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading phrases…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* Progress bar */}
      <div className="h-1 w-full bg-muted">
        <div
          className="h-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${((phraseIdx + 1) / round.length) * 100}%` }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-muted-foreground">
          Phrase {phraseIdx + 1} of {round.length}
        </span>
        <span className="text-sm font-bold text-indigo-500">
          {correctCount} correct
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-6 px-4 pt-2">
        {/* English translation (hint) */}
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Translate to {nativeText.dir === "rtl" ? "native script" : "native script"}</p>
          <p className="mt-1 text-lg font-bold text-foreground">{phrase?.english}</p>
          {phrase?.romanized && (
            <p className="text-sm text-muted-foreground">{phrase.romanized}</p>
          )}
        </div>

        {/* Drop zone */}
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Your answer</p>
          <div
            className={cn(
              "min-h-[64px] rounded-xl border-2 border-dashed p-3 transition-colors",
              pState.status === "correct"
                ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20"
                : pState.status === "wrong"
                ? "border-red-400 bg-red-50 dark:bg-red-950/20"
                : "border-border bg-card/50",
            )}
            dir={nativeText.dir}
          >
            <div className="flex flex-wrap gap-2">
              {pState.placed.map((tile, i) => (
                <button
                  key={tile.tileId}
                  onClick={() => returnTile(tile)}
                  disabled={pState.status !== "idle"}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors",
                    pState.status === "correct"
                      ? "border-emerald-400 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40"
                      : pState.status === "wrong" && pState.wrongMask[i]
                      ? "border-red-400 bg-red-100 text-red-700 dark:bg-red-900/40"
                      : "border-primary/40 bg-primary/10 text-primary",
                  )}
                  style={nativeText.style}
                >
                  {tile.word}
                </button>
              ))}
              {pState.placed.length === 0 && (
                <p className="text-sm text-muted-foreground italic">Tap words below…</p>
              )}
            </div>
          </div>
        </div>

        {/* Feedback message */}
        {pState.status === "correct" && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-700 dark:bg-emerald-950/30">
            <Check className="h-5 w-5 shrink-0" />
            <p className="font-semibold">Correct!</p>
          </div>
        )}
        {pState.status === "wrong" && (
          <div className="rounded-xl bg-red-50 px-4 py-3 dark:bg-red-950/30">
            <div className="flex items-center gap-2 text-red-700">
              <X className="h-5 w-5 shrink-0" />
              <p className="font-semibold">Not quite — correct order:</p>
            </div>
            <p className="mt-1 text-sm font-semibold text-red-700" style={nativeText.style} dir={nativeText.dir}>
              {phrase?.nativeScript}
            </p>
          </div>
        )}

        {/* Word tile tray */}
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Available words</p>
          <div className="flex flex-wrap gap-2" dir={nativeText.dir}>
            {pState.tiles.map((tile) => (
              <button
                key={tile.tileId}
                onClick={() => placeTile(tile)}
                disabled={pState.status !== "idle"}
                className={cn(
                  "rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors",
                  pState.status === "idle" && "hover:border-primary/50 hover:bg-primary/5 active:scale-[0.97]",
                  pState.status !== "idle" && "opacity-40",
                )}
                style={nativeText.style}
              >
                {tile.word}
              </button>
            ))}
            {pState.tiles.length === 0 && pState.status === "idle" && (
              <p className="text-sm text-muted-foreground italic">All placed — check your answer!</p>
            )}
          </div>
        </div>

        {/* Action button */}
        <div className="pb-4">
          {pState.status === "idle" ? (
            <button
              onClick={handleCheck}
              disabled={!allPlaced}
              className="w-full rounded-xl bg-primary px-6 py-3.5 font-bold text-primary-foreground disabled:opacity-40"
            >
              Check Answer
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="w-full rounded-xl bg-primary px-6 py-3.5 font-bold text-primary-foreground"
            >
              {phraseIdx + 1 >= round.length ? "See Results" : "Next Phrase →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Done ─────────────────────────────────────────────────────────────────────

function DoneScreen({
  results,
  correctCount,
  categoryId,
  onPlayAgain,
  onChangeTopic,
}: {
  results: PhraseResult[];
  correctCount: number;
  categoryId: number;
  onPlayAgain: () => void;
  onChangeTopic: () => void;
}) {
  const { activeLang } = useLanguage();
  const queryClient = useQueryClient();
  const recordSession = useRecordGameSession();
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (submitted || results.length === 0) return;
    setSubmitted(true);
    recordSession.mutate(
      {
        data: {
          languageCode: activeLang,
          game: "phrase-builder",
          categoryId,
          phraseResults: results,
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

  const total = results.length;
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 pb-8 pt-12">
      <Confetti active={correctCount > 0} />

      <Mascot
        pose={correctCount === total ? "cheer" : correctCount >= total / 2 ? "thumbsup" : "tryagain"}
        size={100}
      />
      <h2 className="mt-4 text-2xl font-extrabold text-foreground">
        {correctCount === total ? "Perfect!" : correctCount === 0 ? "Keep practising!" : "Well done!"}
      </h2>

      <div className="mt-6 grid w-full max-w-xs grid-cols-2 gap-3">
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-4">
          <p className="text-2xl font-extrabold text-emerald-600">{correctCount}/{total}</p>
          <p className="mt-1 text-xs text-muted-foreground">Correct</p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-4">
          <p className="text-2xl font-extrabold text-primary">{accuracy}%</p>
          <p className="mt-1 text-xs text-muted-foreground">Accuracy</p>
        </div>
        <div className="col-span-2 flex flex-col items-center justify-center rounded-xl border border-border bg-card py-4">
          <p className="text-2xl font-extrabold text-violet-600">
            {xpEarned !== null ? `+${xpEarned} XP` : "…"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">XP Earned</p>
        </div>
      </div>

      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={onPlayAgain}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-bold text-primary-foreground"
        >
          <RotateCcw className="h-4 w-4" />
          Play Again
        </button>
        <button
          onClick={onChangeTopic}
          className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3.5 font-bold text-foreground hover:bg-muted/50"
        >
          <Home className="h-4 w-4" />
          Change Topic
        </button>
        <Link
          href="/games"
          className="text-center text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          Back to Games
        </Link>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function PhraseBuilderPage() {
  const { isPlus, isLoading } = useEntitlements();
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [finalResults, setFinalResults] = useState<PhraseResult[]>([]);
  const [finalCorrect, setFinalCorrect] = useState(0);
  const [gameKey, setGameKey] = useState(0);

  if (!isLoading && !isPlus) {
    return <Redirect to="/upgrade" />;
  }

  const handleDone = (results: PhraseResult[], correctCount: number) => {
    setFinalResults(results);
    setFinalCorrect(correctCount);
    setPhase("done");
  };

  if (phase === "setup") {
    return (
      <SetupScreen
        onStart={(id) => {
          setCategoryId(id);
          setPhase("playing");
        }}
      />
    );
  }
  if (phase === "playing" && categoryId !== null) {
    return <PlayingScreen key={gameKey} categoryId={categoryId} onDone={handleDone} />;
  }
  if (phase === "done" && categoryId !== null) {
    return (
      <DoneScreen
        results={finalResults}
        correctCount={finalCorrect}
        categoryId={categoryId}
        onPlayAgain={() => {
          setGameKey((k) => k + 1);
          setPhase("playing");
        }}
        onChangeTopic={() => {
          setPhase("setup");
          setCategoryId(null);
        }}
      />
    );
  }
  return <SetupScreen onStart={(id) => { setCategoryId(id); setPhase("playing"); }} />;
}
