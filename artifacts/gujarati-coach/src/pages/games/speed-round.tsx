import { useState, useEffect, useRef, useCallback } from "react";
import { Link, Redirect } from "wouter";
import { useEntitlements } from "@/lib/entitlements";
import { ArrowLeft, Zap, ChevronRight, RotateCcw, Home, Trophy, Flame, Timer } from "lucide-react";
import { ChaiGlyph } from "@/components/chai-stall";
import { webHaptic } from "@/lib/haptics";
import { useListCategories, useListCategoryPhrases, useRecordGameSession, useSynthesizeSpeech, getGetProgressSummaryQueryKey, getGetTokensQueryKey, type Category } from "@workspace/api-client-react";
import { useQuickLaunch } from "./quick-game-frame";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage, useNativeText } from "@/lib/language-context";
import { BottomNav } from "@/components/layout/bottom-nav";
import { GameMuteButton, useGameAudio } from "@/components/game-mute-button";
import {
  MissReviewCta,
  MissReviewDialog,
  type GameMiss,
} from "@/components/game-miss-review";
import { Mascot } from "@/components/mascot";
import { Confetti } from "@/components/ui/confetti";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const GAME_DURATION = 60; // seconds
const STREAK_BONUS_THRESHOLD = 3;
const STREAK_MULTIPLIER = 1.5;

type GamePhase = "setup" | "playing" | "done";

// selectedPhraseId is what the learner tapped; the server checks
// selectedPhraseId === phraseId to determine correctness.
type PhraseResult = { phraseId: number; selectedPhraseId: number };
type QuestionStats = { correct: number; total: number; streak: number; bestStreak: number; points: number };

interface Phrase {
  id: number;
  nativeScript: string;
  romanized: string;
  english: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildOptions(correct: Phrase, pool: Phrase[], hardMode: boolean): { label: string; romanized: string; phraseId: number; isCorrect: boolean }[] {
  const distractors = shuffle(pool.filter((p) => p.id !== correct.id)).slice(0, 3);
  const all = shuffle([correct, ...distractors]);
  return all.map((p) => ({
    label: hardMode ? p.nativeScript : p.english,
    // Carried for the end-of-run miss review only: hard-mode options ARE
    // native script, and the review never shows script without its reading.
    romanized: p.romanized ?? "",
    phraseId: p.id,
    isCorrect: p.id === correct.id,
  }));
}

// ─── Setup Screen ────────────────────────────────────────────────────────────

function SetupScreen({
  onStart,
}: {
  onStart: (categoryId: number, hardMode: boolean) => void;
}) {
  const { activeLang } = useLanguage();
  const { isPlus } = useEntitlements();
  const { data: categories = [] } = useListCategories({ lang: activeLang });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hardMode, setHardMode] = useState(false);
  const nativeText = useNativeText();

  const chosen = selectedId ?? categories[0]?.id ?? null;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background pb-nav lg:pb-8">
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <Link
          href="/games"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Back to Games"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-extrabold text-foreground">Speed Round</h1>
      </div>

      <div className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 pt-8">
        {/* Hero */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-100 dark:bg-amber-950/40">
            <Zap className="h-10 w-10 text-amber-500" strokeWidth={1.75} />
          </div>
          <h2 className="text-2xl font-extrabold text-foreground">Ready to race?</h2>
          <p className="text-sm text-muted-foreground">
            60 seconds. One phrase. Four choices. How many can you get?
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
                  (chosen === cat.id)
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

        {/* Hard mode toggle */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <p className="font-semibold text-foreground">Hard Mode</p>
            <p className="text-xs text-muted-foreground">Answer options show native script only</p>
          </div>
          <button
            role="switch"
            aria-checked={hardMode}
            onClick={() => setHardMode((v) => !v)}
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              hardMode ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                hardMode && "translate-x-5",
              )}
            />
          </button>
        </div>

        {/* Stats preview */}
        <div className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-card text-center">
          <div className="py-3">
            <p className="text-xl font-extrabold text-amber-500">60s</p>
            <p className="text-xs text-muted-foreground">Time</p>
          </div>
          <div className="py-3">
            <p className="text-xl font-extrabold text-primary">×1.5</p>
            <p className="text-xs text-muted-foreground">Streak bonus</p>
          </div>
          <div className="py-3">
            <p className="text-xl font-extrabold text-primary">{isPlus ? "All-Access" : "Free"}</p>
            <p className="text-xs text-muted-foreground">Plan</p>
          </div>
        </div>

        {/* Start button */}
        <button
          disabled={!chosen}
          onClick={() => chosen !== null && onStart(chosen, hardMode)}
          className="w-full rounded-xl bg-primary px-6 py-4 font-extrabold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          Start Game
        </button>
      </div>

      <BottomNav />
    </div>
  );
}

// ─── Playing Screen ───────────────────────────────────────────────────────────

function PlayingScreen({
  categoryId,
  hardMode,
  soundOn,
  onToggleSound,
  onExit,
  onDone,
}: {
  categoryId: number;
  hardMode: boolean;
  soundOn: boolean;
  onToggleSound: () => void;
  onExit: () => void;
  onDone: (results: PhraseResult[], stats: QuestionStats, misses: GameMiss[]) => void;
}) {
  const { activeLang, activeLanguage } = useLanguage();
  const nativeText = useNativeText();
  const synthesize = useSynthesizeSpeech();
  const { data: phrases = [], isLoading } = useListCategoryPhrases(categoryId, activeLang);

  // Ref mirror so async speech playback observes the latest mute state.
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Cache synthesized audio per phrase id so repeats cost nothing extra.
  const audioCache = useRef(new Map<number, { audioBase64: string; format: string }>());

  // Speak the prompt word in the target language. Muted skips synthesis
  // entirely, not just playback.
  const speakPrompt = useCallback(
    async (phrase: Phrase) => {
      if (!soundOnRef.current) return;
      try {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        const cached = audioCache.current.get(phrase.id);
        const res =
          cached ??
          (await synthesize.mutateAsync({
            data: { text: phrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLang },
          }));
        audioCache.current.set(phrase.id, { audioBase64: res.audioBase64, format: res.format });
        if (!soundOnRef.current) return;
        const audio = new Audio(`data:audio/${res.format};base64,${res.audioBase64}`);
        audioRef.current = audio;
        await audio.play();
      } catch {
        // Audio is a nice-to-have; the race continues silently.
      }
    },
    [synthesize, activeLanguage?.name, activeLang],
  );

  // Stop any in-flight audio when the screen unmounts.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const reduceMotion = useReducedMotion();
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [queue, setQueue] = useState<Phrase[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [options, setOptions] = useState<{ label: string; romanized: string; phraseId: number; isCorrect: boolean }[]>([]);
  const [selected, setSelected] = useState<number | null>(null); // phraseId of selected option
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [results, setResults] = useState<PhraseResult[]>([]);
  const [stats, setStats] = useState<QuestionStats>({ correct: 0, total: 0, streak: 0, bestStreak: 0, points: 0 });
  // A miss here is a phrase whose translation the learner tapped wrong: the
  // native-script prompt they saw, the option they chose, and the right
  // translation. Wording follows the mode, English options normally, native
  // script in hard mode, so the review reads exactly as the round played.
  const [misses, setMisses] = useState<GameMiss[]>([]);
  const [started, setStarted] = useState(false);

  // Combo burst overlay state
  const [comboBurst, setComboBurst] = useState<{ text: string; key: number } | null>(null);
  const prevStreakRef = useRef(0);
  const comboBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Watch for streak milestones (3, 5, 10) to trigger the burst overlay
  useEffect(() => {
    const prev = prevStreakRef.current;
    const cur = stats.streak;
    prevStreakRef.current = cur;
    if (cur > prev) {
      let burstText: string | null = null;
      if (cur === 3) burstText = "HOT STREAK 🔥";
      else if (cur === 5) burstText = "ON FIRE ⚡";
      else if (cur === 10) burstText = "UNSTOPPABLE 💥";
      if (burstText) {
        if (comboBurstTimerRef.current) clearTimeout(comboBurstTimerRef.current);
        setComboBurst(prev => ({ text: burstText!, key: (prev?.key ?? 0) + 1 }));
        comboBurstTimerRef.current = setTimeout(() => setComboBurst(null), 1200);
      }
    }
  }, [stats.streak]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear combo-burst timer on unmount so it never fires into a torn-down component.
  useEffect(() => {
    return () => {
      if (comboBurstTimerRef.current) clearTimeout(comboBurstTimerRef.current);
    };
  }, []);

  // Build question queue once phrases load
  useEffect(() => {
    if (phrases.length === 0) return;
    const q = shuffle(phrases as Phrase[]);
    setQueue(q);
    setCurrentIndex(0);
    setStarted(true);
  }, [phrases]);

  // Update options when question changes, and speak the new prompt word.
  // speakPrompt is deliberately omitted from the deps: adding soundOn-derived
  // callbacks would re-run this effect mid-question and clear live feedback.
  useEffect(() => {
    if (queue.length === 0) return;
    const phrase = queue[currentIndex % queue.length];
    setOptions(buildOptions(phrase, queue as Phrase[], hardMode));
    setSelected(null);
    setFeedback(null);
    void speakPrompt(phrase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, currentIndex, hardMode]);

  // Countdown timer
  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [started]);

  // When timer hits 0, finalize
  const resultsRef = useRef(results);
  const statsRef = useRef(stats);
  const missesRef = useRef(misses);
  resultsRef.current = results;
  statsRef.current = stats;
  missesRef.current = misses;

  useEffect(() => {
    if (timeLeft === 0 && started) {
      onDone(resultsRef.current, statsRef.current, missesRef.current);
    }
  }, [timeLeft, started, onDone]);

  const handleAnswer = useCallback(
    (opt: { label: string; romanized: string; phraseId: number; isCorrect: boolean }) => {
      if (selected !== null) return; // already answered
      setSelected(opt.phraseId);
      const correct = opt.isCorrect;
      setFeedback(correct ? "correct" : "wrong");
      webHaptic(correct ? 'success' : 'warning');

      const phrase = queue[currentIndex % queue.length];
      // Send the tapped option's phraseId; server determines correct = (selectedPhraseId === phraseId)
      const newResult: PhraseResult = { phraseId: phrase.id, selectedPhraseId: opt.phraseId };
      setResults((prev) => [...prev, newResult]);

      if (!correct) {
        // The right answer is worded the same way the options are (English, or
        // native script in hard mode), so the miss review matches the tiles the
        // learner tapped rather than restating the prompt.
        const correctLabel = hardMode ? phrase.nativeScript : phrase.english;
        setMisses((prev) => [
          ...prev,
          {
            prompt: phrase.nativeScript,
            // The run is over, so hard mode's hidden reading comes back here:
            // the review is a study list, not part of the challenge.
            promptSub: phrase.romanized || null,
            answer: opt.label,
            answerSub: hardMode ? opt.romanized.trim() || null : null,
            correct: correctLabel,
            correctSub: hardMode ? phrase.romanized || null : null,
          },
        ]);
      }

      setStats((prev) => {
        const newStreak = correct ? prev.streak + 1 : 0;
        const multiplier = newStreak >= STREAK_BONUS_THRESHOLD ? STREAK_MULTIPLIER : 1;
        const gained = correct ? Math.round(100 * multiplier) : 0;
        return {
          correct: prev.correct + (correct ? 1 : 0),
          total: prev.total + 1,
          streak: newStreak,
          bestStreak: Math.max(prev.bestStreak, newStreak),
          points: prev.points + gained,
        };
      });

      // Advance after brief feedback delay
      setTimeout(() => {
        setCurrentIndex((i) => i + 1);
      }, correct ? 400 : 1000);
    },
    [selected, queue, currentIndex, hardMode],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading phrases…</p>
        </div>
      </div>
    );
  }

  const phrase = queue.length > 0 ? queue[currentIndex % queue.length] : null;
  const timerPct = (timeLeft / GAME_DURATION) * 100;
  const isLowTime = timeLeft <= 10;

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-background">
      {/* Timer bar */}
      <div className="h-1.5 w-full bg-muted">
        <div
          className={cn(
            "h-full transition-all duration-1000",
            isLowTime ? "bg-red-500" : "bg-amber-500",
          )}
          style={{ width: `${timerPct}%` }}
        />
      </div>

      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={onExit}
          data-testid="speed-round-exit"
          aria-label="Exit game"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className={cn("flex items-center gap-1.5 text-sm font-bold tabular-nums", isLowTime ? "text-red-500" : "text-foreground")}>
          <Timer className="h-4 w-4" />
          {timeLeft}s
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1 text-sm font-bold text-amber-500">
            <Flame className="h-4 w-4" />
            {stats.streak}
          </div>
          <div className="flex items-center gap-1 text-sm font-bold text-primary">
            <Trophy className="h-4 w-4" />
            {stats.points}
          </div>
          <GameMuteButton soundOn={soundOn} onToggle={onToggleSound} />
        </div>
      </div>

      {/* Combo burst overlay, springs in when streak hits 3, 5, or 10 */}
      <AnimatePresence>
        {comboBurst && (
          <motion.div
            key={comboBurst.key}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: [0.5, 1.05, 1] }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.9 }}
            transition={reduceMotion ? { duration: 0.2 } : { type: "tween", duration: 0.35, ease: "easeOut" }}
            className="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex items-center justify-center"
          >
            <div className="rounded-2xl bg-foreground/90 px-7 py-3 text-2xl font-black text-background shadow-2xl">
              {comboBurst.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Question area */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
        {phrase && (
          <>
            <div className="text-center">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {stats.total + 1} answered
              </p>
              <p
                className="text-3xl font-bold leading-snug text-foreground"
                style={nativeText.style}
                dir={nativeText.dir}
              >
                {phrase.nativeScript}
              </p>
              {!hardMode && phrase.romanized && (
                <p className="mt-1 text-sm text-muted-foreground">{phrase.romanized}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {hardMode ? "Pick the correct native-script translation" : "Pick the correct English translation"}
              </p>
            </div>

            <div className="grid w-full max-w-sm gap-3">
              {options.map((opt) => {
                const isSelected = selected === opt.phraseId;
                const showCorrect = feedback !== null && opt.isCorrect;
                const showWrong = isSelected && feedback === "wrong";
                return (
                  <button
                    key={opt.phraseId}
                    onClick={() => handleAnswer(opt)}
                    disabled={selected !== null}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left font-semibold transition-all",
                      showCorrect
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"
                        : showWrong
                        ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40"
                        : selected !== null
                        ? "border-border bg-card/50 text-muted-foreground opacity-60"
                        : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98]",
                    )}
                    style={hardMode ? nativeText.style : undefined}
                    dir={hardMode ? nativeText.dir : undefined}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Done Screen ─────────────────────────────────────────────────────────────

function DoneScreen({
  categoryId,
  stats,
  results,
  misses,
  onPlayAgain,
  onChangeTopic,
}: {
  categoryId: number;
  stats: QuestionStats;
  results: PhraseResult[];
  misses: GameMiss[];
  onPlayAgain: () => void;
  onChangeTopic: () => void;
}) {
  const { activeLang } = useLanguage();
  const queryClient = useQueryClient();
  const recordSession = useRecordGameSession();
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const [chaiEarned, setChaiEarned] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  // Chunk 6B: zone closeouts launch Speed Round with ?ctx=closeout; the
  // context rides along on the session POST so the server can grant Chai.
  // Hub launches carry no context key at all (payload unchanged).
  const launch = useQuickLaunch();

  useEffect(() => {
    if (submitted || results.length === 0) return;
    setSubmitted(true);
    recordSession.mutate(
      {
        data: {
          languageCode: activeLang,
          game: "speed-round",
          categoryId,
          phraseResults: results,
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
          setXpEarned(data.xpEarned);
          queryClient.invalidateQueries({ queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }) });
          const granted = data.chaiGranted ?? 0;
          if (granted > 0) {
            setChaiEarned(granted);
            queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
          }
        },
      },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const canReview = misses.length > 0;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 pb-8 pt-12">
      <Confetti active={stats.correct > 0} />

      <Mascot pose={stats.correct >= 5 ? "cheer" : stats.correct >= 2 ? "thumbsup" : "tryagain"} size={100} />

      <h2 className="mt-4 text-2xl font-extrabold text-foreground">
        {stats.correct === 0 ? "Nice try!" : stats.correct >= 10 ? "Incredible!" : "Great round!"}
      </h2>

      {/* Stats grid */}
      <div className="mt-6 grid w-full max-w-xs grid-cols-2 gap-3">
        {/* The score is the affordance learners reach for to see WHICH ones
            they missed, so when there is something to review it opens the
            dialog. A run with no misses stays a plain stat card. */}
        {canReview ? (
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            data-testid="speed-round-score-card"
            aria-label={`${stats.correct} of ${stats.total} correct. See what you missed.`}
            className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-4 transition-all hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98]"
          >
            <p className="text-2xl font-extrabold text-emerald-600">{stats.correct}/{stats.total}</p>
            <p className="mt-1 text-xs text-primary underline underline-offset-2">See misses</p>
          </button>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-4" data-testid="speed-round-score-card">
            <p className="text-2xl font-extrabold text-emerald-600">{stats.correct}/{stats.total}</p>
            <p className="mt-1 text-xs text-muted-foreground">Correct</p>
          </div>
        )}
        <StatCard label="Accuracy" value={`${accuracy}%`} color="text-primary" />
        <StatCard label="Best Streak" value={String(stats.bestStreak)} color="text-amber-500" icon={<Flame className="h-3.5 w-3.5" />} />
        <StatCard
          label="XP Earned"
          value={xpEarned !== null ? `+${xpEarned}` : "…"}
          color="text-violet-600"
        />
      </div>

      {stats.bestStreak >= STREAK_BONUS_THRESHOLD && (
        <p className="mt-4 text-sm text-amber-600 dark:text-amber-400">
          🔥 ×1.5 streak bonus applied!
        </p>
      )}

      {chaiEarned !== null && chaiEarned > 0 && (
        <div
          data-testid="chai-earn-beat"
          className="mt-4 flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-extrabold text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
        >
          <ChaiGlyph className="h-4 w-4" />
          +{chaiEarned} Chai earned
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={onPlayAgain}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-bold text-primary-foreground"
        >
          <RotateCcw className="h-4 w-4" />
          Play Again
        </button>
        <MissReviewCta count={misses.length} onClick={() => setReviewOpen(true)} />
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

      <MissReviewDialog misses={misses} open={reviewOpen} onOpenChange={setReviewOpen} />
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-4">
      <p className={cn("flex items-center gap-1 text-2xl font-extrabold", color)}>
        {icon}
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function SpeedRoundPage() {
  const { isPlus, isLoading } = useEntitlements();
  const { soundOn, toggle: toggleSound } = useGameAudio();
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [hardMode, setHardMode] = useState(false);
  const [finalResults, setFinalResults] = useState<PhraseResult[]>([]);
  const [finalStats, setFinalStats] = useState<QuestionStats>({ correct: 0, total: 0, streak: 0, bestStreak: 0, points: 0 });
  const [finalMisses, setFinalMisses] = useState<GameMiss[]>([]);
  const [gameKey, setGameKey] = useState(0); // reset key

  const handleStart = (catId: number, hard: boolean) => {
    setCategoryId(catId);
    setHardMode(hard);
    setPhase("playing");
  };

  const handleDone = useCallback((results: PhraseResult[], stats: QuestionStats, misses: GameMiss[]) => {
    setFinalResults(results);
    setFinalStats(stats);
    setFinalMisses(misses);
    setPhase("done");
  }, []);

  // Plus gate. This MUST sit below every hook call in this component: the
  // first render (entitlements still loading) runs the full hook list, so
  // returning early once isPlus resolves false would render fewer hooks than
  // the previous pass and React throws instead of showing the paywall.
  if (!isLoading && !isPlus) {
    return <Redirect to="/upgrade" />;
  }

  const handlePlayAgain = () => {
    setGameKey((k) => k + 1);
    setPhase("playing");
  };

  const handleChangeTopic = () => {
    setPhase("setup");
    setCategoryId(null);
  };

  // The countdown makes mid-play exits destructive - confirm first.
  const handleExit = () => {
    if (!window.confirm("Leave the game? Your current run will be lost.")) return;
    handleChangeTopic();
  };

  if (phase === "setup") return <SetupScreen onStart={handleStart} />;
  if (phase === "playing" && categoryId !== null) {
    return (
      <PlayingScreen
        key={gameKey}
        categoryId={categoryId}
        hardMode={hardMode}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        onExit={handleExit}
        onDone={handleDone}
      />
    );
  }
  if (phase === "done" && categoryId !== null) {
    return (
      <DoneScreen
        categoryId={categoryId}
        stats={finalStats}
        results={finalResults}
        misses={finalMisses}
        onPlayAgain={handlePlayAgain}
        onChangeTopic={handleChangeTopic}
      />
    );
  }
  return <SetupScreen onStart={handleStart} />;
}
