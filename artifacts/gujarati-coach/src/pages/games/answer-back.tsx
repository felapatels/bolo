// ANSWER BACK: the web twin. A voice stop, played as a conversation at
// Chacha-ji's stall.
//
// MOBILE TWIN: bolo-mobile app/(app)/(tabs)/games/answer-back.tsx (2026-09-14,
// built first, mobile first). The two are hand-maintained; the shared half is
// @workspace/script-trace (answer-back.ts, answer-back-round.ts, stop-play.ts).
//
// Owner rulings, 2026-09-14:
//  1. It REPLACES a voice stop and takes a converted slot by BEST FIT (owner
//     ruling "c", planStopPlay + bestFitConvertedKind). A group with fewer than
//     ANSWER_BACK_MIN_EXCHANGES plays as Last Call; this page redirects there
//     too, for a stale map or a deep link.
//  2. Gating, mastery and XP are a voice stop's: every scored take goes through
//     hooks/useSpeakAndScore.ts, scored as THE RIGHT REPLY.
//  3. The keeper's line is audio only with "Hear again"; three reply cards show
//     native script and romanized, English hidden until the take is scored.
//  4. Finish is visual only: no currency, no server grant. A star for a
//     perfect run, best stars in localStorage (lib/answer-back-memory.ts).
//
// WEB-ONLY DIFFERENCES, the same ones Last Call's web page carries and for the
// same platform reasons: audio through the blessed coach element
// (lib/iosAudio.ts) with applySpeechRate on every play; a clip under
// SPEAK_MIN_CLIP_SECONDS is a no-penalty re-ask; the permission prompt that
// steals a press never starts a take; Reduce Motion is framer-motion's reading
// of prefers-reduced-motion.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link, Redirect, useLocation, useSearch } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Lock, Mic, RefreshCcw, Square, Star, Volume2 } from "lucide-react";
import {
  ApiError,
  getListLessonGroupPhrasesQueryKey,
  getListReviewPhrasesQueryKey,
  useListLessonGroupPhrases,
  useListReviewPhrases,
  useSynthesizeSpeech,
  type Phrase,
} from "@workspace/api-client-react";
import {
  ANSWER_BACK_MIN_EXCHANGES,
  answerBackExchangesFor,
  answerBackReducer,
  answerBackStars,
  answerBackTakeOutcome,
  detectChosenCard,
  initAnswerBack,
  pickAnswerBackRound,
  type AnswerBackExchange,
  type AnswerBackState,
} from "@workspace/script-trace";
import { STALL_ASSETS } from "@/components/chai-stall";
import { Confetti } from "@/components/ui/confetti";
import { GameMuteButton, useGameAudio } from "@/components/game-mute-button";
import { FlashbackLightbox } from "@/components/flashback-lightbox";
import { LessonBuildingScreen, LessonErrorScreen } from "@/components/lesson-states";
import { UpgradeScreen } from "@/components/plus";
import { isPassingBand } from "@/components/ui/band-pill";
import { VoiceBars } from "@/components/voice-bars";
import { AiConsentBlockedCard } from "@/components/ai-consent-blocked-card";
import { useInputLevel } from "@/hooks/useInputLevel";
import { useSpeakAndScore } from "@/hooks/useSpeakAndScore";
import { asUpgradeRequired, upgradeHrefForDenial } from "@/lib/entitlements";
import { blessAudioPlayback, getCoachAudioElement } from "@/lib/iosAudio";
import { useLanguage, useNativeText, useSpeechCapability } from "@/lib/language-context";
import { saveAnswerBackStars } from "@/lib/answer-back-memory";
import { applySpeechRate } from "@/lib/speechRatePref";
import { webHaptic } from "@/lib/haptics";
import { playCue } from "@/lib/sound";
import { cn } from "@/lib/utils";

/** A release this soon after recording started is a TAP (Last Call's rule). */
const TAP_MS = 350;
/** A recorder slower than this to go live was waiting on the permission prompt. */
const PROMPT_STALL_MS = 900;
/** Feedback beats. TUNING PENDING, same as mobile. */
const BEAM_BEAT_MS = 1_100;
const NOCATCH_BEAT_MS = 1_400;
const MISS_BEAT_MS = 1_800;
/** Web practice's flashback size, for the same exit Last Call takes. */
const FLASHBACK_SIZE = 3;

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export default function AnswerBackPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const groupId = Number(params.get("group"));
  const categoryId = Number(params.get("cat"));
  const stopLabel = params.get("stop") ?? undefined;
  const { activeLang, activeLanguage } = useLanguage();
  const speechCapability = useSpeechCapability();
  const [, navigate] = useLocation();
  const validGroup = Number.isFinite(groupId) && groupId > 0;

  const phrasesQuery = useListLessonGroupPhrases(validGroup ? groupId : 0, {
    query: {
      enabled: validGroup,
      queryKey: getListLessonGroupPhrasesQueryKey(validGroup ? groupId : 0),
    },
  });
  const list = phrasesQuery.data;
  const exchanges = useMemo(() => answerBackExchangesFor(list ?? []), [list]);
  const [runKey, setRunKey] = useState(0);
  const leave = useCallback(() => navigate("/journey"), [navigate]);

  if (!validGroup) return <Redirect to="/journey" replace />;
  if (speechCapability === "unsupported") {
    return <Redirect to={`/practice/${categoryId}?group=${groupId}`} replace />;
  }
  const upgrade = asUpgradeRequired(phrasesQuery.error);
  if (upgrade) {
    return (
      <UpgradeScreen
        backHref="/journey"
        title="Unlock this stop"
        message={upgrade.message}
        upgradeHref={upgradeHrefForDenial(upgrade, activeLang)}
      />
    );
  }
  const groupLocked =
    phrasesQuery.error instanceof ApiError &&
    phrasesQuery.error.status === 403 &&
    (phrasesQuery.error.data as { error?: string } | null)?.error === "lesson_group_locked";
  if (groupLocked) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Lock className="h-7 w-7 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-extrabold text-foreground">This stop is still locked</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Finish the stop before it to sit at this stall. The line runs station by station.
        </p>
        <button
          type="button"
          onClick={leave}
          className="mt-3 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
        >
          Back to the map
        </button>
      </div>
    );
  }
  if (phrasesQuery.isError) {
    return (
      <LessonErrorScreen
        backHref="/journey"
        onRetry={() => void phrasesQuery.refetch()}
        isRetrying={phrasesQuery.isFetching}
      />
    );
  }
  if (phrasesQuery.isLoading || !list) {
    return <LessonBuildingScreen languageName={activeLanguage?.name} backHref="/journey" />;
  }
  if (list.length === 0) return <Redirect to="/journey" replace />;
  // THE FALLBACK, HELD HERE TOO (mobile twin): too few exchanges plays as Last Call.
  if (exchanges.length < ANSWER_BACK_MIN_EXCHANGES) {
    return (
      <Redirect
        to={`/games/last-call?group=${groupId}&cat=${categoryId}${stopLabel ? `&stop=${encodeURIComponent(stopLabel)}` : ""}`}
        replace
      />
    );
  }

  return (
    <AnswerBackRound
      key={`${groupId}:${runKey}`}
      exchanges={exchanges}
      groupId={groupId}
      categoryId={categoryId}
      stopLabel={stopLabel}
      onLeave={leave}
      onPlayAgain={() => setRunKey((k) => k + 1)}
    />
  );
}

function AnswerBackRound({
  exchanges,
  groupId,
  categoryId,
  stopLabel,
  onLeave,
  onPlayAgain,
}: {
  exchanges: AnswerBackExchange<Phrase>[];
  groupId: number;
  categoryId: number;
  stopLabel?: string;
  onLeave: () => void;
  onPlayAgain: () => void;
}) {
  const [, navigate] = useLocation();
  const reduceMotion = useReducedMotion() === true;
  const native = useNativeText();
  const { activeLang, activeLanguage } = useLanguage();
  const { soundOn, toggle: toggleSound } = useGameAudio();

  // Picked once per mount, as on mobile: the round and each line's card order.
  const [round] = useState(() => pickAnswerBackRound(exchanges, shuffle));
  const [cardOrder] = useState(() => round.map((e) => shuffle([e.replyPhrase, ...e.distractors])));

  const [state, dispatch] = useReducer(answerBackReducer, round.length, initAnswerBack);
  const stateRef = useRef<AnswerBackState>(state);
  stateRef.current = state;
  const exchange = round[state.index];
  const cards = cardOrder[state.index] ?? [];

  // ── Audio: Last Call's web playPhrase, through the blessed element ───────
  const synth = useSynthesizeSpeech();
  // Keyed by phrase AND speaker: one phrase can be the keeper's line in one
  // exchange and the learner's reply in another, and those are two voices.
  const audioCache = useRef(new Map<string, { audioBase64: string; format: string }>());
  const playTokenRef = useRef(0);
  const pendingResolveRef = useRef<(() => void) | null>(null);
  const aliveRef = useRef(true);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const [audioPlaying, setAudioPlaying] = useState(false);

  const stopPlayback = useCallback(() => {
    playTokenRef.current += 1;
    const el = getCoachAudioElement();
    el.onended = null;
    el.onerror = null;
    try {
      el.pause();
    } catch {
      // jsdom and some browsers throw on pause of an unloaded element.
    }
    const resolve = pendingResolveRef.current;
    pendingResolveRef.current = null;
    resolve?.();
    setAudioPlaying(false);
  }, []);

  /**
   * WHO speaks is the second argument (owner ruling 2026-09-15, option A, under
   * the 2026-09-13 voice roles rule: the bird is the coach, the elder is always
   * different). Every place Chacha-ji speaks passes "elder": the opening line,
   * each re-ask and "Hear again". The learner's right reply after a miss stays
   * "coach", the model answer in practice's voice. The coach's request is
   * byte-identical to what it was, so its server cache key is too. Mobile twin:
   * the same rule in bolo-mobile's answer-back.tsx.
   */
  const playPhrase = useCallback(
    (phrase: Phrase, speaker: "coach" | "elder"): Promise<void> =>
      new Promise((resolve) => {
        if (!soundOnRef.current) {
          resolve();
          return;
        }
        stopPlayback();
        const token = playTokenRef.current;
        pendingResolveRef.current = resolve;
        const finish = () => {
          if (token !== playTokenRef.current) return;
          pendingResolveRef.current = null;
          setAudioPlaying(false);
          resolve();
        };
        void (async () => {
          try {
            const key = `${phrase.id}:${speaker}`;
            const res =
              audioCache.current.get(key) ??
              (await synth.mutateAsync({
                data:
                  speaker === "elder"
                    ? { text: phrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLang, speaker: "elder" }
                    : { text: phrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLang },
              }));
            audioCache.current.set(key, { audioBase64: res.audioBase64, format: res.format });
            if (token !== playTokenRef.current || !aliveRef.current) return finish();
            const el = getCoachAudioElement();
            el.src = `data:audio/${res.format};base64,${res.audioBase64}`;
            el.onended = finish;
            el.onerror = finish;
            applySpeechRate(el);
            setAudioPlaying(true);
            await el.play();
          } catch {
            // Autoplay refused or synthesis failed: "Hear again" replays it
            // inside a gesture.
            finish();
          }
        })();
      }),
    [activeLang, activeLanguage?.name, stopPlayback, synth],
  );

  // ── Recorder, scorer and the attempts path ──────────────────────────────
  const finishTakeRef = useRef<() => void>(() => undefined);
  const speak = useSpeakAndScore({
    lessonGroupId: groupId,
    categoryId,
    languageCode: activeLang,
    languageName: activeLanguage?.name,
    onSilence: () => finishTakeRef.current(),
  });
  const { prepare: speakPrepare, start: speakStart, stopAndScore, cancel: speakCancel, permissionDenied } = speak;

  // THE VOICE BARS and the can't-hear-you hint, as Last Call (hooks/useInputLevel.ts).
  const voice = useInputLevel(speak.recording, speak.getAmplitude);

  useEffect(
    () => () => {
      aliveRef.current = false;
      stopPlayback();
      speakCancel();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (state.status === "asking") void speakPrepare();
  }, [state.status, speakPrepare]);

  // The keeper says the line on every new line and every re-ask (askSeq).
  useEffect(() => {
    if (state.status !== "asking" || !exchange) return;
    void playPhrase(exchange.promptPhrase, "elder");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.askSeq]);

  // ── A take: score as the right reply, read which card was spoken ─────────
  const finishingRef = useRef(false);
  const pressingRef = useRef(false);
  const recordStartedAtRef = useRef(0);
  const [banner, setBanner] = useState<string | null>(null);
  // A standing no to AI permission stops the round here (AiConsentBlockedCard).
  const [consentBlocked, setConsentBlocked] = useState(false);
  const [chosenId, setChosenId] = useState<number | null>(null);
  const [micMessage, setMicMessage] = useState<string | null>(null);

  const finishTake = useCallback(async () => {
    if (finishingRef.current) return;
    const s = stateRef.current;
    if (s.status !== "speaking") return;
    const ex = round[s.index];
    const shown = cardOrder[s.index];
    if (!ex || !shown) return;
    finishingRef.current = true;
    dispatch({ type: "score_start" });
    try {
      const outcome = await stopAndScore(ex.replyPhrase);
      if (!aliveRef.current) return;
      if (outcome.kind === "consent_required") {
        // Re-asking cannot succeed until the learner changes their answer, and
        // it used to loop forever. The round stays paused under the card.
        setConsentBlocked(true);
        return;
      }
      if (outcome.kind === "too_short") {
        // Nothing was sent: the recorder's miss, read as nocatch (Last Call's rule).
        setBanner(null);
        setChosenId(null);
        dispatch({ type: "scored", outcome: "nocatch" });
        return;
      }
      if (outcome.kind !== "scored") {
        setBanner(
          outcome.kind === "timeout"
            ? "That took too long to check. Chacha-ji will ask again."
            : "Checking hit a snag. Chacha-ji will ask again.",
        );
        setChosenId(null);
        dispatch({ type: "scoring_timeout" });
        return;
      }
      const band = outcome.band === "nocatch" ? "nocatch" : isPassingBand(outcome.band) ? "pass" : "fail";
      const { chosen } = detectChosenCard(outcome, shown);
      setChosenId(chosen?.id ?? null);
      setBanner(outcome.attemptSaved ? null : "Scored, but your progress did not save. Check your connection.");
      dispatch({
        type: "scored",
        outcome: answerBackTakeOutcome({ band, chosenId: chosen?.id ?? null, rightId: ex.replyPhrase.id }),
      });
    } finally {
      finishingRef.current = false;
    }
  }, [round, cardOrder, stopAndScore]);
  finishTakeRef.current = () => void finishTake();

  const beginTake = useCallback(async () => {
    const s = stateRef.current;
    if (s.status === "speaking") {
      void finishTake();
      return;
    }
    if (s.status !== "asking") return;
    setMicMessage(null);
    stopPlayback();
    dispatch({ type: "speak" });
    const asked = Date.now();
    const ok = await speakStart();
    if (!ok) {
      dispatch({ type: "speak_cancel" });
      setMicMessage(
        permissionDenied()
          ? "Please allow microphone access to play Answer Back."
          : "Could not start recording. Try again.",
      );
      return;
    }
    // The permission prompt stole the press: a grant alone never starts a take.
    if (!pressingRef.current && Date.now() - asked > PROMPT_STALL_MS) {
      speakCancel();
      dispatch({ type: "speak_cancel" });
      void speakPrepare();
      setMicMessage("Microphone ready. Hold or tap to answer.");
      return;
    }
    recordStartedAtRef.current = Date.now();
    webHaptic("medium");
  }, [finishTake, speakStart, speakCancel, speakPrepare, permissionDenied, stopPlayback]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    pressingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Unavailable in jsdom and some embedded browsers.
    }
    void beginTake();
  };

  const onPointerUp = () => {
    pressingRef.current = false;
    if (stateRef.current.status !== "speaking" || !speak.recording) return;
    if (Date.now() - recordStartedAtRef.current >= TAP_MS) void finishTake();
  };

  // ── Feedback beats ───────────────────────────────────────────────────────
  useEffect(() => {
    if (state.status !== "feedback") return;
    const last = state.last;
    const ex = last ? round[last.exchangeIndex] : undefined;
    if (!last || !ex) return;
    let cancelled = false;
    const beat = (ms: number) => new Promise((r) => setTimeout(r, ms));
    void (async () => {
      if (last.outcome === "pass") {
        webHaptic("success");
        playCue("correct");
        await beat(BEAM_BEAT_MS);
      } else if (last.outcome === "wrong_card" || last.outcome === "fail") {
        webHaptic("warning");
        playCue("wrong");
        const started = Date.now();
        await playPhrase(ex.replyPhrase, "coach");
        await beat(Math.max(400, MISS_BEAT_MS - (Date.now() - started)));
      } else {
        // nocatch or a scoring timeout: a system miss, no warning (Spec 1 rule 16).
        await beat(NOCATCH_BEAT_MS);
      }
      if (!cancelled && stateRef.current.status === "feedback") {
        setBanner(null);
        setChosenId(null);
        dispatch({ type: "continue" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.last]);

  // ── End: the star, kept in the browser ───────────────────────────────────
  const stars = answerBackStars(state);
  const [best, setBest] = useState<{ best: number; isNewBest: boolean } | null>(null);
  useEffect(() => {
    if (state.status !== "over") return;
    setBest(saveAnswerBackStars(activeLang, groupId, stars));
  }, [state.status, stars, activeLang, groupId]);

  const flashbackParams = { lang: activeLang, limit: FLASHBACK_SIZE };
  const flashbackDue = useListReviewPhrases(flashbackParams, {
    query: { enabled: !!activeLang, queryKey: getListReviewPhrasesQueryKey(flashbackParams) },
  });
  const [flashbackOpen, setFlashbackOpen] = useState(false);
  const flashbackHref = `/flashback?next=${encodeURIComponent("/journey")}`;
  const dueKnown = Array.isArray(flashbackDue.data);
  const dueCount = Array.isArray(flashbackDue.data) ? flashbackDue.data.length : 0;

  const handleExit = () => {
    webHaptic("light");
    if (state.status !== "over" && !window.confirm("Leave the game? Your current run will be lost.")) return;
    speakCancel();
    stopPlayback();
    onLeave();
  };

  const playAgain = () => {
    webHaptic("light");
    // Inside the gesture, so the next line's programmatic play is allowed.
    blessAudioPlayback();
    stopPlayback();
    onPlayAgain();
  };

  const inFeedback = state.status === "feedback" && state.last !== null;
  const outcome = state.last?.outcome;
  const advance = state.last?.advance === true;
  const mood = !inFeedback
    ? null
    : outcome === "pass"
      ? { emoji: "😊", words: "Chacha-ji beams." }
      : outcome === "wrong_card"
        ? {
            emoji: "🤔",
            words: advance
              ? "Chacha-ji looks puzzled. This was the reply. On to his next line."
              : "Chacha-ji looks puzzled. Listen to the right reply, then try again.",
          }
        : outcome === "fail"
          ? {
              emoji: "👂",
              words: advance ? "Nearly. Listen to how it goes. On to his next line." : "Nearly. Listen, then say it again.",
            }
          : { emoji: "🙂", words: "He didn't catch that. He'll ask again." };
  const enter = reduceMotion ? {} : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={handleExit}
            aria-label="Go back"
            data-testid="answer-back-exit"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-lg font-extrabold leading-tight text-foreground">Answer Back</h1>
            {stopLabel ? <p className="truncate text-xs text-muted-foreground">{stopLabel}</p> : null}
          </div>
          <GameMuteButton soundOn={soundOn} onToggle={toggleSound} active={audioPlaying} />
        </div>
      </div>

      {state.status === "over" ? (
        <div className="mx-auto flex w-full max-w-md flex-col items-center px-6 pb-10 pt-8 text-center">
          {/* Visual only: no Chai, no grant. Confetti skips itself under Reduce Motion. */}
          <Confetti active={stars > 0} variant="perfect" />
          <img src={STALL_ASSETS.chachaji} alt="" className="h-40 w-auto" draggable={false} />
          <h2 className="mt-4 text-2xl font-extrabold text-foreground" data-testid="answer-back-result">
            {stars > 0
              ? "Perfect conversation!"
              : `${state.answered} of ${state.exchangeCount} ${state.exchangeCount === 1 ? "reply" : "replies"} landed`}
          </h2>
          <p
            className={cn("mt-2 inline-flex items-center gap-1.5 text-lg font-bold", stars > 0 ? "text-primary" : "text-muted-foreground")}
            data-testid="answer-back-stars"
          >
            <Star className={cn("h-5 w-5", stars > 0 ? "fill-current" : "")} aria-hidden />
            {stars > 0 ? "1 star" : "No star this time"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {stars > 0
              ? "Every reply right first time. Chacha-ji pours you a proper cup."
              : `First time right: ${state.firstTry} of ${state.exchangeCount}. Get them all for the star.`}
          </p>
          {best ? (
            <p
              className={cn("mt-2 text-sm", best.isNewBest ? "font-bold text-primary" : "text-muted-foreground")}
              data-testid="answer-back-best"
            >
              {best.isNewBest ? "New best: 1 star" : best.best > 0 ? "Best: 1 star" : "Best: no star yet"}
            </p>
          ) : null}
          {banner ? <p className="mt-3 text-sm text-destructive">{banner}</p> : null}
          {dueKnown ? (
            <button
              type="button"
              data-testid="answer-back-next-stop"
              onClick={() => {
                if (dueCount > 0) setFlashbackOpen(true);
                else onLeave();
              }}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-base font-black text-primary-foreground"
            >
              On to the next stop
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <Link
              href={flashbackHref}
              data-testid="answer-back-next-stop"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-base font-black text-primary-foreground"
            >
              On to the next stop
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
          <button
            type="button"
            onClick={playAgain}
            data-testid="answer-back-play-again"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-base font-bold text-foreground hover:bg-muted"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden />
            Play again
          </button>
          <FlashbackLightbox
            open={flashbackOpen}
            onEnter={() => {
              setFlashbackOpen(false);
              navigate(flashbackHref);
            }}
            onSkip={() => {
              setFlashbackOpen(false);
              onLeave();
            }}
          />
        </div>
      ) : exchange ? (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-4 pb-8 pt-3">
          <p className="text-sm font-bold text-muted-foreground" data-testid="answer-back-progress">
            {`Line ${state.index + 1} of ${state.exchangeCount}${state.tries > 0 && !inFeedback ? " · second try" : ""}`}
          </p>

          <div className="mt-2 flex w-full items-end gap-3">
            <img src={STALL_ASSETS.chachaji} alt="" className="h-36 w-auto shrink-0" draggable={false} />
            <div className="mb-3 min-w-0 flex-1 rounded-2xl border border-border bg-card p-3.5">
              {mood ? (
                <motion.div key={`mood-${state.last?.exchangeIndex}-${state.tries}-${outcome}`} {...enter} role="status">
                  <span className="text-3xl" aria-hidden>
                    {mood.emoji}
                  </span>
                  <p className="mt-1 text-sm font-bold text-foreground" data-testid="answer-back-mood">
                    {mood.words}
                  </p>
                </motion.div>
              ) : (
                <>
                  {/* AUDIO ONLY: the keeper's line is never written (owner brief). */}
                  <p className="text-sm font-bold text-foreground">
                    {audioPlaying ? "Chacha-ji is speaking..." : "Chacha-ji said something. Answer him!"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      webHaptic("light");
                      void playPhrase(exchange.promptPhrase, "elder");
                    }}
                    disabled={!soundOn || state.status !== "asking"}
                    data-testid="answer-back-hear-again"
                    className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
                  >
                    <Volume2 className="h-4 w-4" aria-hidden />
                    {soundOn ? "Hear again" : "Sound is off"}
                  </button>
                </>
              )}
            </div>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">Say ONE of these out loud</p>
          <ul className="mt-1 w-full space-y-2.5" aria-label="Reply cards">
            {cards.map((card, i) => {
              const isRight = card.id === exchange.replyPhrase.id;
              const isChosen = card.id === chosenId;
              const reveal = inFeedback && (outcome === "pass" || outcome === "wrong_card" || outcome === "fail");
              const tag = reveal && isRight ? "Right reply" : reveal && isChosen ? "You said this" : null;
              return (
                <li
                  key={card.id}
                  data-testid={`answer-back-card-${i}`}
                  className={cn(
                    "flex flex-col items-center rounded-2xl bg-card px-4 py-3 text-center",
                    tag === "Right reply" ? "border-2 border-emerald-600" : tag ? "border-2 border-destructive" : "border border-border",
                  )}
                >
                  <span style={native.style} dir={native.dir} className="text-2xl font-bold text-foreground">
                    {card.nativeScript}
                  </span>
                  <span className="mt-0.5 text-base text-muted-foreground">{card.romanized}</span>
                  {reveal ? <span className="mt-1.5 text-sm font-bold text-foreground">{card.english}</span> : null}
                  {tag ? (
                    <span className={cn("mt-1 text-xs font-bold", tag === "Right reply" ? "text-emerald-700" : "text-destructive")}>
                      {tag === "Right reply" ? `✓ ${tag}` : `✗ ${tag}`}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {banner ? <p className="mt-2 text-sm text-muted-foreground">{banner}</p> : null}

          <div className="min-h-[16px] flex-1" />
          <button
            type="button"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={(e) => {
              // A keyboard press arrives as a click with no pointer detail: a tap.
              if (e.detail === 0) void beginTake();
            }}
            onContextMenu={(e) => e.preventDefault()}
            disabled={state.status !== "asking" && state.status !== "speaking"}
            aria-label={state.status === "speaking" ? "Stop and check" : "Hold or tap to answer"}
            data-testid="answer-back-mic"
            className={cn(
              "mt-3 flex h-20 w-20 touch-none select-none items-center justify-center rounded-full text-white shadow-md transition-colors",
              state.status === "speaking" ? "bg-destructive" : state.status === "asking" ? "bg-primary" : "bg-muted",
            )}
          >
            {state.status === "speaking" ? <Square className="h-7 w-7" aria-hidden /> : <Mic className="h-8 w-8" aria-hidden />}
          </button>
          {/* A fixed-height slot, so the mic never moves under a holding finger. */}
          <div className="mt-2 flex h-7 items-center justify-center" data-testid="answer-back-voice-slot">
            {speak.recording ? <VoiceBars amplitude={voice.amplitude} level={voice.level} className="text-primary" /> : null}
          </div>
          <p className="mt-1 text-center text-sm text-muted-foreground" aria-live="polite">
            {micMessage ??
              (state.status === "speaking"
                ? voice.noInput
                  ? "We can't hear you. Check your mic."
                  : "Listening. Let go, or tap again, when you are done."
                : state.status === "scoring"
                  ? "Chacha-ji is listening..."
                  : state.status === "feedback"
                    ? " "
                    : "Hold or tap to answer")}
          </p>
        </div>
      ) : null}
      {consentBlocked ? (
        <AiConsentBlockedCard
          gameName="Answer Back"
          onLeave={() => {
            speakCancel();
            stopPlayback();
            onLeave();
          }}
          testId="answer-back-consent-blocked"
        />
      ) : null}
    </div>
  );
}
