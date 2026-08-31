/**
 * QuickGameShell — Build 35 mobile parity foundation.
 *
 * The mobile counterpart of the web quick-game frame
 * (gujarati-coach/src/pages/games/quick-game-frame.tsx). Extracted from the
 * mobile Listen and Pick screen rather than translated from the web file, so
 * it inherits mobile's real audio, haptics, picker, end screen and
 * confirm-on-exit instead of a web-shaped approximation of them.
 *
 * The shell owns everything a quick game should never re-decide:
 *   - the topic picker (skipped when the launch pins a category)
 *   - the 3-2-1 countdown, gated on phrases actually being ready
 *   - the per-round timer and its final-two-seconds urgent state
 *   - round progression, result accumulation and scoring
 *   - the result screen and the SINGLE end-of-run POST
 *   - the audio-active mute treatment
 *
 * A game supplies only its round UI via `renderRound`, reports each round
 * through `api.submitRound`, and NEVER persists anything itself. One run is
 * exactly one POST, made here.
 *
 * Timeout contract (web parity): when the clock reaches zero the shell flags
 * `api.timedOut` and locks the round; the round component is responsible for
 * calling `submitRound` in response. The shell deliberately does not
 * auto-submit a phantom answer, because only the game knows what "no answer"
 * means for its own mechanic.
 *
 * No quick games are ported in this task — this is the foundation they land
 * against.
 */
import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListCategories,
  useListCategoryPhrases,
  getListCategoryPhrasesQueryKey,
  useRecordGameSession,
  getGetProgressSummaryQueryKey,
  getGetTokensQueryKey,
  type Phrase,
} from '@workspace/api-client-react';
import { categoryIcon } from '@/lib/ui';
import { HowToPlaySheet } from '@/components/games/HowToPlaySheet';
import { hapticLight } from '@/lib/haptics';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { FunFactLoader } from '@/components/FunFactLoader';
import { PressableScale } from '@/components/PressableScale';
import { SkeletonCard } from '@/components/SkeletonCard';
import { Mascot } from '@/components/Mascot';
import { MissReviewCta, MissReviewModal, type GameMiss } from '@/components/GameMissReview';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { useLanguage } from '@/contexts/LanguageContext';
import { markSignalCleared } from '@/lib/signalMemory';
import { markCloseoutGranted } from '@/lib/closeoutMemory';
import { GameMuteButton, useGameAudio } from '@/components/GameMuteButton';
import { confirmDiscardRun } from '@/lib/gameExit';
import { topicLockState, type QuickGameDef } from '@/lib/quick-games';

// ─── Launch context ──────────────────────────────────────────────────────────

export type QuickLaunchContext = 'signal' | 'closeout';

export type QuickLaunch = {
  /** Pinned category, or null for a hub launch that shows the picker. */
  categoryId: number | null;
  /** Origin context for the POST, or null to send no context key at all. */
  context: QuickLaunchContext | null;
  /** `gap-<n>` for signals, null otherwise. */
  contextRef: string | null;
  /** True when the run was launched from the journey (signal or closeout). */
  fromJourney: boolean;
};

const HUB_LAUNCH: QuickLaunch = {
  categoryId: null,
  context: null,
  contextRef: null,
  fromJourney: false,
};

/**
 * Parse launch params into a launch descriptor. Pure, so the validation rule
 * below is testable without rendering.
 *
 * The rule that matters: a `signal` context is only constructed when the gap
 * is a valid non-negative integer. A signal launch with a missing or
 * malformed gap is REFUSED and degrades to a plain hub launch — no context,
 * no contextRef — rather than posting a signal the server would reject (the
 * server requires contextRef matching ^gap-[0-9]+$ whenever context is
 * signal). `hub` is treated as no context so its payload stays byte-identical
 * to a launch with no params at all.
 */
export function parseQuickLaunch(params: {
  cat?: string;
  ctx?: string;
  gap?: string;
}): QuickLaunch {
  // Digits alone aren't enough: a long digit string parses to an unsafe
  // integer or Infinity, and `gap-Infinity` would fail the server's
  // ^gap-[0-9]+$ rule while a rounded unsafe integer could target the wrong
  // signal entirely. Refuse both.
  const asInt = (v: string | undefined): number | null => {
    if (typeof v !== 'string' || !/^\d+$/.test(v)) return null;
    const n = Number(v);
    return Number.isSafeInteger(n) ? n : null;
  };

  const categoryId = asInt(params.cat);
  const gap = asInt(params.gap);

  let context: QuickLaunchContext | null = null;
  let contextRef: string | null = null;

  if (params.ctx === 'signal') {
    // Refuse the signal launch unless the gap is genuinely usable.
    if (gap !== null) {
      context = 'signal';
      contextRef = `gap-${gap}`;
    }
  } else if (params.ctx === 'closeout') {
    context = 'closeout';
  }

  return { categoryId, context, contextRef, fromJourney: context !== null };
}

/** Route-param flavour of {@link parseQuickLaunch}. */
export function useQuickLaunch(): QuickLaunch {
  const params = useLocalSearchParams<{ cat?: string; ctx?: string; gap?: string }>();
  const [launch] = useState<QuickLaunch>(() => parseQuickLaunch(params));
  return launch;
}

// ─── Round contract ──────────────────────────────────────────────────────────

/**
 * One round's outcome. `correct` drives the shell's live score display only —
 * it is never sent to the server, which recomputes correctness from
 * `selectedPhraseId`.
 */
export type QuickRoundResult = {
  phraseId: number;
  selectedPhraseId: number;
  correct: boolean;
  /** What the end screen's miss review shows when this round was wrong. Each
   *  game words its own round (the prompt it showed, the answer the learner
   *  picked), so the shell never guesses it from the ids — a game whose right
   *  answer is the odd one out would be described backwards. */
  review?: GameMiss;
};

export type QuickRoundApi = {
  /**
   * ZERO-BASED round index, matching the web frame. Read it directly as
   * `plan[api.round]` — ported web round code transfers with no off-by-one.
   * The shell's own "Round N of M" display adds the +1, not the game.
   */
  round: number;
  total: number;
  /** Correct answers so far this run. */
  correct: number;
  /** Seconds left in this round, or null when the game is untimed. */
  secondsLeft: number | null;
  /** True once the clock hit zero. Never true for an untimed game. */
  timedOut: boolean;
  /** Freeze the clock (answer taken, showing feedback). */
  lockRound: () => void;
  /** Report the round and advance. Ignored after the first call per round. */
  submitRound: (result: QuickRoundResult) => void;
};

export type QuickRoundProps = {
  phrases: Phrase[];
  api: QuickRoundApi;
  soundOn: boolean;
  activeLang: string;
  activeLanguage: ReturnType<typeof useLanguage>['activeLanguage'];
  /** Report live playback so the shell can light the mute button. */
  setAudioPlaying: (playing: boolean) => void;
};

// ─── Shell ───────────────────────────────────────────────────────────────────

type Phase = 'picker' | 'countdown' | 'playing' | 'end';

const COUNTDOWN_START = 3;
const COUNTDOWN_STEP_MS = 800;
const DEFAULT_ROUNDS_PER_RUN = 5;
/** Final-two-seconds urgent threshold (web parity). */
const URGENT_SECONDS = 2;

export type QuickGameShellProps = {
  def: QuickGameDef;
  /**
   * Per-round clock in seconds. OMIT it (or pass null) for an UNTIMED game:
   * no per-round clock, no timer chip, no 3-2-1 countdown, and `api.timedOut`
   * never becomes true. Mirrors the web frame's contract exactly. Untimed is
   * a real design choice, not a fallback — Ticket Check's answer reveal rides
   * the continue beat for both outcomes so the learner sets the dwell time.
   */
  secondsPerRound?: number | null;
  /**
   * How many rounds one run lasts.
   *
   * A plain number is fixed at mount and behaves exactly as it always has.
   * A FUNCTION mirrors the web frame's `totalRounds(phrases)` contract: the
   * shell calls it with the fetched pool once that pool clears `def.floor`,
   * so a game whose length depends on its data — a pairs board capped at
   * min(6, phrases.length), say — can say so. Without this, such a game has
   * to hardcode a number, and a category at the floor but under that number
   * builds a board that can never reach the finish condition: no POST, no
   * result screen, and the learner's finished work thrown away.
   */
  roundsPerRun?: number | ((phrases: Phrase[]) => number);
  /**
   * Whether this game speaks target-language audio.
   *
   * Defaults to TRUE, so every existing game keeps the mute toggle with no
   * edit. A game that declares `false` gets no toggle at all — not disabled,
   * not dimmed, absent — because a control that cannot affect anything is
   * worse than no control: the learner presses it, nothing changes, and the
   * game reads as broken. Same opt-in shape as `secondsPerRound`: one
   * per-game declaration, the shell decides the chrome.
   *
   * A silent game still receives `soundOn` and `setAudioPlaying` (the round
   * contract does not change); it simply never uses them.
   */
  usesAudio?: boolean;
  /**
   * The game's one-line instruction. It is the FIRST line of the How to Play
   * sheet, and it used to be rendered only inside the countdown branch below,
   * which meant an untimed game never showed it at all. See HowToPlaySheet.
   */
  instruction?: string;
  /**
   * Extra paragraphs for the How to Play sheet, after `instruction`. Optional:
   * a game that needs no more than its one line supplies nothing and still
   * gets a sheet and a `?`.
   */
  howToPlay?: string[];
  renderRound: (props: QuickRoundProps) => ReactNode;
};

export function QuickGameShell({
  def,
  secondsPerRound,
  roundsPerRun = DEFAULT_ROUNDS_PER_RUN,
  usesAudio = true,
  instruction,
  howToPlay,
  renderRound,
}: QuickGameShellProps) {
  const colors = useColors();
  const router = useRouter();
  const { activeLang, activeLanguage } = useLanguage();
  const queryClient = useQueryClient();
  const recordSession = useRecordGameSession();
  const { soundOn, toggle: toggleSound } = useGameAudio();
  const launch = useQuickLaunch();

  const pinned = launch.categoryId !== null;
  /**
   * A timed game runs the clock rig (count-in, chip, timeout); an untimed one
   * skips all of it and drops straight into the first round.
   */
  const timed = secondsPerRound != null;

  const [categoryId, setCategoryId] = useState<number | null>(launch.categoryId);
  const [phase, setPhase] = useState<Phase>(
    pinned ? (timed ? 'countdown' : 'playing') : 'picker',
  );
  const [countdown, setCountdown] = useState<number | null>(
    pinned && timed ? COUNTDOWN_START : null,
  );
  const [round, setRound] = useState(0); // 0-based
  const [correct, setCorrect] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(secondsPerRound ?? null);
  const [locked, setLocked] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const [chaiEarned, setChaiEarned] = useState(0);
  const [misses, setMisses] = useState<GameMiss[]>([]);
  /**
   * Identity of the CURRENT run, used only as a remount key for the round
   * subtree (web does the same with its `gameKey`).
   *
   * `resetRun` clears the shell's own state, but a round that keeps state of
   * its own — a persistent board like Luggage Match, which holds a matched
   * set and a first-wrong map for the whole run — would otherwise carry that
   * state into the next run: press Play Again and every tag is already
   * matched. Bumping this key unmounts the round and rebuilds it from
   * scratch. Per-round-derived games are unaffected either way.
   */
  const [runKey, setRunKey] = useState(0);
  /**
   * How to Play. `helpOpen` drives the sheet; `helpFirstTime` only changes the
   * button's wording. The seen flag is per GAME, not per run: a learner who
   * has played Wrong Platform before should not be re-explained it every time
   * they open it, or the sheet becomes the thing you tap through.
   */
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpFirstTime, setHelpFirstTime] = useState(false);
  const helpLines = useMemo(
    () => [instruction, ...(howToPlay ?? [])].filter((l): l is string => !!l),
    [instruction, howToPlay],
  );
  useEffect(() => {
    if (helpLines.length === 0) return;
    // ONLY ONCE THE RUN STARTS. Opening over the topic picker would explain a
    // game before the learner has said which topic they want, and the picker
    // is not the thing being explained.
    if (phase === 'picker' || phase === 'end') return;
    let alive = true;
    const key = `bolo.game.howto.${def.id}`;
    AsyncStorage.getItem(key)
      .then((seen) => {
        if (!alive || seen) return;
        setHelpFirstTime(true);
        setHelpOpen(true);
        return AsyncStorage.setItem(key, '1');
      })
      // A storage failure must never cost the learner the game. Worst case
      // the sheet opens again next time, which is the harmless direction.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [def.id, helpLines.length, phase]);

  const resultsRef = useRef<QuickRoundResult[]>([]);
  /**
   * One submit per round. Cleared by the effect below — that is, only once
   * React has actually COMMITTED the next round — never synchronously inside
   * submitRound. Clearing it inline would reopen the guard within the same
   * tick, so a round that calls submitRound twice in one go (a timeout
   * handler racing a tap, say) would append a second result under the stale
   * round index and corrupt the run that gets posted.
   */
  const submittedRef = useRef(false);
  /** One POST per run — the single-POST guarantee. */
  const finishedRef = useRef(false);

  const phraseQuery = useListCategoryPhrases(categoryId ?? 0, activeLang, {
    query: {
      enabled: categoryId !== null,
      queryKey: getListCategoryPhrasesQueryKey(categoryId ?? 0, activeLang),
    },
  });
  const phrases: Phrase[] = phraseQuery.data ?? [];
  /** The pool exists and is big enough for this game to be playable at all. */
  const poolReady = categoryId !== null && phrases.length >= def.floor;
  /**
   * THE run length. Everything downstream — progression, the finish
   * condition, `api.total`, the "Round N of M" display, the end screen —
   * reads this and never the raw prop. A resolver is only called once the
   * pool clears the floor (web parity: `phrases.length >= def.floor ?
   * totalRounds(phrases) : 0`), so it never sees a half-loaded list.
   */
  const resolvedRounds =
    typeof roundsPerRun === 'function' ? (poolReady ? roundsPerRun(phrases) : 0) : roundsPerRun;
  /**
   * A run is only enterable if it can also END. A resolver returning 0 (or
   * anything under one whole round) means this topic cannot fill a run of
   * this game, so the shell refuses to start rather than dropping the
   * learner into a board whose finish condition is unreachable.
   */
  const roundsReady = poolReady && resolvedRounds >= 1;

  // ── Countdown: only ticks once the phrases are actually ready, so a slow
  //    query can never drop the learner into an empty first round.
  useEffect(() => {
    if (phase !== 'countdown' || !roundsReady || countdown === null) return;
    if (helpOpen) return; // the count-in waits behind the sheet too
    if (countdown <= 0) {
      setCountdown(null);
      setSecondsLeft(secondsPerRound ?? null);
      setLocked(false);
      setTimedOut(false);
      submittedRef.current = false;
      setPhase('playing');
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), COUNTDOWN_STEP_MS);
    return () => clearTimeout(t);
  }, [phase, roundsReady, countdown, secondsPerRound, helpOpen]);

  // ── Per-round clock. Frozen while locked or counting in; absent entirely
  //    for an untimed game, which never schedules a tick at all.
  useEffect(() => {
    // helpOpen freezes the clock. Beat the Train runs on a ten-second round,
    // so a help button that let it run would charge the learner for asking.
    if (!timed || phase !== 'playing' || locked || helpOpen) return;
    if (secondsLeft === null || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [timed, phase, locked, secondsLeft, helpOpen]);

  // ── Zero: flag the timeout and lock. The game decides what to submit.
  //    An untimed game can never reach this, so timedOut stays false for good.
  useEffect(() => {
    if (!timed || phase !== 'playing' || timedOut) return;
    if (secondsLeft === null || secondsLeft > 0) return;
    setTimedOut(true);
    setLocked(true);
  }, [timed, phase, secondsLeft, timedOut]);

  const finishRun = useCallback(
    (results: QuickRoundResult[]) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setAudioPlaying(false);
      setPhase('end');

      if (categoryId === null || results.length === 0) return;

      recordSession.mutate(
        {
          data: {
            languageCode: activeLang,
            game: def.serverGame,
            categoryId,
            // Correctness is the server's call; we send only what was picked.
            phraseResults: results.map((r) => ({
              phraseId: r.phraseId,
              selectedPhraseId: r.selectedPhraseId,
            })),
            // Context keys are spread in only when the launch really carried
            // them, so a hub launch posts a payload byte-identical to one
            // from a shell that knows nothing about launch context.
            ...(launch.context ? { context: launch.context } : {}),
            ...(launch.contextRef ? { contextRef: launch.contextRef } : {}),
          },
        },
        {
          onSuccess: (data) => {
            setXpEarned(data.xpEarned);
            queryClient.invalidateQueries({
              queryKey: getGetProgressSummaryQueryKey({ lang: activeLang }),
            });
            const chai = data.chaiGranted ?? 0;
            if (chai > 0) {
              setChaiEarned(chai);
              queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
              // The shell is the only place that sees a real grant, so it is
              // the only place allowed to retire a crossing locally. Guarded
              // three ways: the launch must be a SIGNAL one (a closeout or hub
              // run can grant Chai too, and marking on those would clear a
              // crossing nobody played), the ref must parse to a gap, and the
              // server must have actually granted — this whole branch is
              // inside `chai > 0`. The mark can therefore never outrun the
              // ledger and retire a still-claimable reward.
              const gap =
                launch.context === 'signal' && launch.contextRef
                  ? Number(/^gap-([0-9]+)$/.exec(launch.contextRef)?.[1] ?? NaN)
                  : NaN;
              if (Number.isInteger(gap)) void markSignalCleared(activeLang, gap);
              // A closeout run records the RECEIPT instead of a mark: the
              // journey's payoff beat may only claim Chai the server actually
              // paid, and this is the one place that sees the amount. Session
              // scoped, so it never outlives the run it describes, and the
              // closeout stage machine stays pure display state.
              if (launch.context === 'closeout' && categoryId !== null) {
                markCloseoutGranted(activeLang, categoryId, chai);
              }
            }
          },
        },
      );
    },
    [activeLang, categoryId, def.serverGame, launch, queryClient, recordSession],
  );

  const lockRound = useCallback(() => setLocked(true), []);

  const submitRound = useCallback(
    (result: QuickRoundResult) => {
      if (submittedRef.current) return;
      submittedRef.current = true;

      resultsRef.current = [...resultsRef.current, result];
      if (result.correct) setCorrect((c) => c + 1);
      // Only wrong rounds, in the order they were played, and only those the
      // game described. A game that skips `review` simply shows no review.
      if (!result.correct && result.review) {
        const review = result.review;
        setMisses((m) => [...m, review]);
      }

      const nextRound = round + 1;
      if (nextRound >= resolvedRounds) {
        // Terminal: the guard deliberately stays closed for good.
        finishRun(resultsRef.current);
        return;
      }
      setRound(nextRound);
      setSecondsLeft(secondsPerRound ?? null);
      setLocked(false);
      setTimedOut(false);
      setAudioPlaying(false);
    },
    [finishRun, round, resolvedRounds, secondsPerRound],
  );

  // Reopen the submit guard only once the new round is on screen.
  useEffect(() => {
    submittedRef.current = false;
  }, [round]);

  const resetRun = useCallback(() => {
    resultsRef.current = [];
    submittedRef.current = false;
    finishedRef.current = false;
    setRound(0);
    setCorrect(0);
    setXpEarned(null);
    setChaiEarned(0);
    setMisses([]);
    setSecondsLeft(secondsPerRound ?? null);
    setLocked(false);
    setTimedOut(false);
    setAudioPlaying(false);
  }, [secondsPerRound]);

  const playAgain = useCallback(() => {
    resetRun();
    setRunKey((k) => k + 1);
    setCountdown(timed ? COUNTDOWN_START : null);
    setPhase(timed ? 'countdown' : 'playing');
  }, [resetRun, timed]);

  const backToPicker = useCallback(() => {
    resetRun();
    setRunKey((k) => k + 1);
    setCategoryId(null);
    setCountdown(null);
    setPhase('picker');
  }, [resetRun]);

  const backToJourney = useCallback(() => {
    router.replace('/(app)/journey');
  }, [router]);

  /**
   * Where a declined/finished run goes. A pinned launch has no picker to fall
   * back to — the learner came from somewhere specific, so send them back
   * there instead of a topic list they never chose from.
   */
  const leaveRun = useCallback(() => {
    if (!pinned) {
      backToPicker();
      return;
    }
    if (launch.fromJourney) backToJourney();
    else router.back();
  }, [backToJourney, backToPicker, launch.fromJourney, pinned, router]);

  const handleExit = useCallback(() => {
    if (phase === 'picker') {
      router.back();
      return;
    }
    if (phase === 'end') {
      leaveRun();
      return;
    }
    // Mid-run (counting in or playing): a started run is never silently lost.
    confirmDiscardRun(leaveRun);
  }, [leaveRun, phase, router]);

  const handleTopicSelect = useCallback(
    (id: number) => {
      resetRun();
      setCategoryId(id);
      setCountdown(timed ? COUNTDOWN_START : null);
      setPhase(timed ? 'countdown' : 'playing');
    },
    [resetRun, timed],
  );

  const urgent =
    phase === 'playing' && secondsLeft !== null && secondsLeft <= URGENT_SECONDS;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={handleExit}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="game-exit-btn"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{def.title}</Text>
          {activeLanguage && (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {activeLanguage.name}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {/* ALWAYS REACHABLE, which is half the ask: the sheet opens itself
              once and this is how it comes back. It sits in the slot a silent
              game used to fill with ballast, so nothing shifts off centre. */}
          {helpLines.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="How to play"
              testID="how-to-play-open"
              onPress={() => {
                hapticLight();
                setHelpFirstTime(false);
                setHelpOpen(true);
              }}
              style={styles.headerSlot}
              hitSlop={8}
            >
              <Feather name="help-circle" size={20} color={colors.mutedForeground} />
            </Pressable>
          )}
          {usesAudio ? (
            <GameMuteButton soundOn={soundOn} onToggle={toggleSound} active={audioPlaying} />
          ) : (
            // Layout ballast only, no control: the header is space-between, so
            // dropping the toggle outright would slide the title off centre.
            helpLines.length === 0 && <View style={styles.headerSlot} />
          )}
        </View>
      </View>

      <HowToPlaySheet
        visible={helpOpen}
        title={def.title}
        lines={helpLines}
        firstTime={helpFirstTime}
        onClose={() => setHelpOpen(false)}
      />

      {phase === 'picker' && (
        <TopicPicker
          activeLang={activeLang}
          floor={def.floor}
          onSelect={handleTopicSelect}
          colors={colors}
        />
      )}

      {(phase === 'countdown' || phase === 'playing') &&
        (phraseQuery.isLoading ? (
          <View style={styles.center}>
            <FunFactLoader color={colors.primary} />
          </View>
        ) : !roundsReady ? (
          <View style={styles.center}>
            {poolReady ? (
              // Above the floor, but the game's own resolver cannot make a
              // whole round out of this topic. Same recoverable dead end,
              // different cause, so it says so rather than blaming the floor.
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}
                testID="quick-no-rounds"
              >
                Not enough here for a full round. {pinned ? 'Try another stop.' : 'Choose another topic.'}
              </Text>
            ) : (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Need at least {def.floor} phrases here. {pinned ? 'Try another stop.' : 'Choose another topic.'}
              </Text>
            )}
          </View>
        ) : phase === 'countdown' ? (
          <View style={styles.center} testID="quick-countdown">
            <Text style={[styles.countdownNum, { color: colors.primary }]}>
              {countdown}
            </Text>
            {!!instruction && (
              <Text style={[styles.countdownHint, { color: colors.mutedForeground }]}>
                {instruction}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.playArea}>
            <View style={styles.progressSection}>
              <View style={styles.progressMeta}>
                <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
                  Round {round + 1} of {resolvedRounds}
                </Text>
                <Text style={[styles.progressLabel, { color: '#10B981' }]}>
                  ✓ {correct} correct
                </Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      backgroundColor: colors.primary,
                      width: `${(round / resolvedRounds) * 100}%` as any,
                    },
                  ]}
                />
              </View>
            </View>

            {/* Untimed games render no chip at all — not a frozen or hidden
                one — so nothing on screen implies a clock that isn't running. */}
            {timed && secondsLeft !== null && (
              <View style={styles.timerRow}>
                <View
                  testID="quick-timer"
                  accessibilityLabel={`${secondsLeft} seconds left`}
                  style={[
                    styles.timerPill,
                    urgent
                      ? { backgroundColor: '#EF444420', borderColor: '#EF4444' }
                      : { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Feather
                    name="clock"
                    size={14}
                    color={urgent ? '#EF4444' : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.timerText,
                      { color: urgent ? '#EF4444' : colors.foreground },
                    ]}
                  >
                    {secondsLeft}s
                  </Text>
                </View>
              </View>
            )}

            {/* Keyed on the run, so a round holding its own state starts
                every run clean. A Fragment rather than a wrapper View: the
                remount must not add a layout node. */}
            <Fragment key={runKey}>
              {renderRound({
              phrases,
              api: {
                // Zero-based, web parity. The display above adds the +1.
                round,
                total: resolvedRounds,
                correct,
                secondsLeft,
                timedOut,
                lockRound,
                submitRound,
              },
              soundOn,
              activeLang,
              activeLanguage,
              setAudioPlaying,
              })}
            </Fragment>
          </View>
        ))}

      {phase === 'end' && (
        <EndScreen
          score={correct}
          total={resolvedRounds}
          xpEarned={xpEarned}
          chaiEarned={chaiEarned}
          misses={misses}
          pinned={pinned}
          fromJourney={launch.fromJourney}
          onPlayAgain={playAgain}
          onChooseTopic={backToPicker}
          onBackToJourney={backToJourney}
          onBack={() => router.back()}
          colors={colors}
        />
      )}
    </Screen>
  );
}

// ─── Topic Picker ────────────────────────────────────────────────────────────

function TopicPicker({
  activeLang,
  floor,
  onSelect,
  colors,
}: {
  activeLang: string;
  floor: number;
  onSelect: (id: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const { data: categories, isLoading } = useListCategories({ lang: activeLang });
  const router = useRouter();

  if (isLoading) {
    return (
      <View style={styles.pickerList}>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} height={64} borderRadius={16} />
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.pickerList, { paddingBottom: TAB_BAR_CLEARANCE }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.pickerLabel, { color: colors.mutedForeground }]}>
        Choose a topic to play with
      </Text>
      {(categories ?? []).map((cat) => {
        // PLAYABLE, not held, and WHY when it is not enough. topicLockState
        // owns both the gate and the sentence for all six pickers.
        const lock = topicLockState(cat, floor);
        const disabled = lock.locked;
        return (
          <PressableScale
            key={cat.id}
            // A LOCKED CARD IS NEVER A DEAD END, the rule the games hub already
            // states and the Phrasebook already keeps: a shut topic is a door
            // to the journey rather than a control that does nothing.
            onPress={() => (disabled ? router.push('/(app)/journey') : onSelect(cat.id))}
            accessibilityRole="button"
            accessibilityLabel={
              disabled
                ? `${cat.title}, locked, open the journey`
                : cat.title
            }
            style={[
              styles.topicCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: disabled ? 0.5 : 1,
              },
            ]}
          >
            <Feather
              name={categoryIcon(cat.iconName)}
              size={24}
              color={colors.primary}
              style={styles.topicIcon}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.topicTitle, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {cat.title}
              </Text>
              <Text
                testID={`game-topic-${lock.kind}-${cat.id}`}
                style={[styles.topicSub, { color: colors.mutedForeground }]}
              >
                {lock.sub}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

// ─── End Screen ──────────────────────────────────────────────────────────────

function EndScreen({
  score,
  total,
  xpEarned,
  chaiEarned,
  misses,
  pinned,
  fromJourney,
  onPlayAgain,
  onChooseTopic,
  onBackToJourney,
  onBack,
  colors,
}: {
  score: number;
  total: number;
  xpEarned: number | null;
  chaiEarned: number;
  misses: GameMiss[];
  pinned: boolean;
  fromJourney: boolean;
  onPlayAgain: () => void;
  onChooseTopic: () => void;
  onBackToJourney: () => void;
  onBack: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const canReview = misses.length > 0;
  const isPerfect = score === total;
  const pose = isPerfect ? 'cheer' : score >= total / 2 ? 'thumbsup' : 'tryagain';
  const headline = isPerfect
    ? 'Perfect Round! 🎉'
    : score >= total / 2
    ? 'Nice Work! 👍'
    : 'Keep Practising! 💪';

  return (
    <View style={styles.centerPad}>
      <Mascot pose={pose} size={100} />
      <Text style={[styles.h2, { color: colors.foreground }]}>{headline}</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        {score} / {total} correct
      </Text>

      <View style={styles.statsGrid}>
        {/* The score is the first thing a learner reaches for when they want
            to know WHICH ones they missed, so it opens the review itself.
            With nothing to review (a perfect run) it stays a plain card. */}
        <Pressable
          testID="quick-score-card"
          onPress={canReview ? () => setReviewOpen(true) : undefined}
          disabled={!canReview}
          accessibilityRole={canReview ? 'button' : undefined}
          accessibilityLabel={
            canReview ? `${score} of ${total} correct. See what you missed.` : undefined
          }
          style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="check-circle" size={20} color="#10B981" />
          <Text style={[styles.statCardValue, { color: colors.foreground }]}>
            {score}/{total}
          </Text>
          <Text
            style={[
              styles.statCardLabel,
              { color: canReview ? colors.primary : colors.mutedForeground },
            ]}
          >
            {canReview ? 'See misses' : 'Score'}
          </Text>
        </Pressable>
        <View
          style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="zap" size={20} color="#F59E0B" />
          <Text style={[styles.statCardValue, { color: colors.foreground }]}>
            {xpEarned !== null ? `+${xpEarned}` : '…'}
          </Text>
          <Text style={[styles.statCardLabel, { color: colors.mutedForeground }]}>XP Earned</Text>
        </View>
      </View>

      {chaiEarned > 0 && (
        <View testID="quick-chai-chip" style={[styles.chaiChip, { borderColor: '#F59E0B' }]}>
          <Text style={styles.chaiChipText}>+{chaiEarned} Chai ☕</Text>
        </View>
      )}

      <ChunkyButton
        title="Play Again"
        icon="refresh-cw"
        onPress={onPlayAgain}
        style={{ width: '100%' }}
      />
      <MissReviewCta count={misses.length} onPress={() => setReviewOpen(true)} />
      {fromJourney ? (
        <ChunkyButton
          title="Back to the Journey"
          icon="map"
          variant="secondary"
          onPress={onBackToJourney}
          style={{ width: '100%' }}
        />
      ) : pinned ? null : (
        <ChunkyButton
          title="Choose Topic"
          icon="list"
          variant="secondary"
          onPress={onChooseTopic}
          style={{ width: '100%' }}
        />
      )}
      {!fromJourney && (
        <Pressable onPress={onBack} style={styles.textBtn}>
          <Text style={[styles.textBtnLabel, { color: colors.mutedForeground }]}>
            ← Back to Games
          </Text>
        </Pressable>
      )}

      <MissReviewModal
        misses={misses}
        visible={reviewOpen}
        onClose={() => setReviewOpen(false)}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerSlot: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // The right-hand cluster: How to Play, then the mute. A row rather than a
  // single slot because a game can now carry both.
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: AppFonts.bold, fontSize: 18 },
  subtitle: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  centerPad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  playArea: { flex: 1, paddingHorizontal: 16, gap: 12, paddingBottom: TAB_BAR_CLEARANCE },
  h2: { fontFamily: AppFonts.extrabold, fontSize: 22, textAlign: 'center' },
  sub: { fontFamily: AppFonts.regular, fontSize: 14, textAlign: 'center' },
  countdownNum: { fontFamily: AppFonts.extrabold, fontSize: 72 },
  countdownHint: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  pickerLabel: { fontFamily: AppFonts.semibold, fontSize: 13, marginBottom: 4 },
  pickerList: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  topicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  topicIcon: { fontSize: 24, width: 36, textAlign: 'center' },
  topicTitle: { fontFamily: AppFonts.bold, fontSize: 15 },
  topicSub: { fontFamily: AppFonts.regular, fontSize: 12 },
  textBtn: { paddingVertical: 8 },
  textBtnLabel: { fontFamily: AppFonts.regular, fontSize: 14 },
  statsGrid: { flexDirection: 'row', gap: 12, width: '100%' },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  statCardValue: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  statCardLabel: { fontFamily: AppFonts.regular, fontSize: 12 },
  chaiChip: {
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#F59E0B18',
  },
  chaiChipText: { fontFamily: AppFonts.bold, fontSize: 14, color: '#B45309' },
  progressSection: { gap: 6 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontFamily: AppFonts.semibold, fontSize: 13 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 4 },
  timerRow: { alignItems: 'center' },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  timerText: { fontFamily: AppFonts.bold, fontSize: 14 },
  emptyText: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
