// LAST CALL, slice 2: the web twin. A voice stop, played as a boarding game.
//
// MOBILE TWIN: bolo-mobile app/(app)/(tabs)/games/last-call.tsx (slice 1). The
// two are hand-maintained, as every screen pair in this repo is; the shared
// half is the lib, not a component.
//
// Owner rulings, 2026-09-14:
//  1. Last Call REPLACES a voice stop, it never adds a row. planStopPlay in
//     @workspace/script-trace decides which rows; this page only plays one.
//  2. Gating, mastery and XP are the same as a voice stop. Every take goes
//     through hooks/useSpeakAndScore.ts, which is web practice's own evaluate
//     then /attempts path, so the server cannot tell the two pages apart.
//  3. Preview, recall round, end card. Placeholder art only.
//
// ART PASS, 2026-09-14 (presentation only; not one rule of the round moved),
// mirroring the mobile twin's pass of the same day. The emoji cards became a
// scene: the looping first-person doorway film behind everything, passengers
// as painted cut-outs queueing on the platform, and the phrase written ON the
// sign the passenger at the door holds (native script and romanization in the
// preview, English alone in the recall round). Faces, sign boxes, figure
// placement and the text fitter are shared in @workspace/script-trace
// last-call-passengers.ts; this page owns the drawing and motion.
//
// WHY /games/last-call AND NOT UNDER /practice. Every other journey stop played
// as a game already routes under /games (storybook, letter-stop, script-trace),
// and it keeps the mobile path shape, so a deep link reads the same on both.
//
// WEB-ONLY DIFFERENCES, each forced by the platform rather than chosen:
//  - AUDIO GOES THROUGH THE BLESSED COACH ELEMENT (lib/iosAudio.ts), never a
//    per-play `new Audio()`. The preview and the missed-passenger replay are
//    PROGRAMMATIC plays, and WebKit only lets an element play without a fresh
//    gesture if that element was blessed inside one. The journey card's click
//    calls blessAudioPlayback(); "Play again" calls it too.
//  - applySpeechRate on EVERY play, because the singleton persists across plays
//    and would otherwise hold a stale rate (ledger X96).
//  - A clip under SPEAK_MIN_CLIP_SECONDS is a no-strike re-ask, because web
//    practice refuses to score one (see the hook's header).
//  - Reduce Motion is the browser's prefers-reduced-motion, read through
//    framer-motion's reactive hook.
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import { Link, Redirect, useLocation, useSearch } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Lock, Mic, Play, RefreshCcw, SkipForward, Square, Volume2 } from "lucide-react";
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
  LAST_CALL_MAX_STRIKES,
  assignLastCallPassengers,
  currentPassenger,
  estimateSignTextWidth,
  fitSignText,
  initLastCall,
  lastCallFigureBox,
  lastCallPassengerById,
  lastCallReducer,
  type LastCallFigureBox,
  type LastCallPassenger,
  type LastCallState,
  type TakeOutcome,
} from "@workspace/script-trace";
import { GameMuteButton, useGameAudio } from "@/components/game-mute-button";
import { FlashbackLightbox } from "@/components/flashback-lightbox";
import { LessonBuildingScreen, LessonErrorScreen } from "@/components/lesson-states";
import { UpgradeScreen } from "@/components/plus";
import { Mascot } from "@/components/mascot";
import { isPassingBand } from "@/components/ui/band-pill";
import { VoiceBars } from "@/components/voice-bars";
import { AiConsentBlockedCard } from "@/components/ai-consent-blocked-card";
import { useInputLevel } from "@/hooks/useInputLevel";
import { useSpeakAndScore } from "@/hooks/useSpeakAndScore";
import { asUpgradeRequired, upgradeHrefForDenial } from "@/lib/entitlements";
import { blessAudioPlayback, getCoachAudioElement } from "@/lib/iosAudio";
import { useLanguage, useNativeText, useSpeechCapability } from "@/lib/language-context";
import { saveLastCallBest } from "@/lib/last-call-memory";
import { LAST_CALL_FILM_SRC, LAST_CALL_POSTER_SRC, lastCallPassengerSrc } from "@/lib/last-call-art";
import { applySpeechRate } from "@/lib/speechRatePref";
import { webHaptic } from "@/lib/haptics";
import { playCue } from "@/lib/sound";
import { cn } from "@/lib/utils";

/** Longest single clock step. A backgrounded tab throttles setInterval and
 *  resumes with one huge delta; without this a learner who switched tabs would
 *  come back to a strike they never had a chance to avoid. Same as mobile. */
const MAX_TICK_MS = 250;
const TICK_EVERY_MS = 100;
/** Below this much clock the bar says "Hurry" in words, not only in colour. */
const URGENT_MS = 3_000;
/** A release this soon after recording started is a TAP: keep listening until
 *  the next tap or the silence auto-stop, rather than scoring half a syllable. */
const TAP_MS = 350;
/** A recorder that took longer than this to go live was waiting on the
 *  permission prompt. If the press was released meanwhile, the grant alone
 *  must not start a take (web practice's hold-confirmation rule). */
const PROMPT_STALL_MS = 900;
/** Feedback beats. TUNING PENDING, same placeholder pacing as mobile. */
const BOARDED_BEAT_MS = 900;
const NOCATCH_BEAT_MS = 1_400;
const MISS_BEAT_MS = 1_800;
const PREVIEW_MUTED_BEAT_MS = 1_800;
/** The count before the round (owner, 2026-09-14: "count down from 3"). Same as mobile. */
const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 1_000;
/** How long "Go!" holds before the first passenger steps up. */
const COUNTDOWN_GO_MS = 600;
/** Web practice's flashback size (practice.tsx FLASHBACK_SIZE), for the same exit. */
const FLASHBACK_SIZE = 3;

/** Art pass motion (owner brief 2026-09-14), in seconds for framer-motion. The
 *  next passenger walks up from the queue, a boarding passenger steps up into
 *  the doorway, a missed one shakes their sign and goes to the back. Each sits
 *  inside the feedback beats above, as on mobile. */
const WALK_S = 0.35;
const BOARD_S = 0.45;
const SHAKE_S = 0.33;
const ASIDE_S = 0.42;
const QUEUE_FADE_S = 0.25;

/** Dark ink on the cream card, whatever the theme: it is printed on paper
 *  inside a painting, not UI chrome. Same value as mobile. */
const SIGN_INK = "#2A2118";
/** The painting's dark door-frame tone, under everything, so an undecoded
 *  poster is never a white flash. Same value as mobile. */
const STAGE_GROUND = "#3A4238";
/** The film's own aspect. The stage is never wider than this at the window's
 *  height: a landscape window would otherwise cover-crop the door and the
 *  steps clean off the top and bottom of the frame, and every figure with them. */
const FILM_ASPECT = 1080 / 1920;
const SIGN_PAD_X = 0.05;
const SIGN_PAD_Y = 0.07;
const APP_FONT = "Inter, ui-sans-serif, system-ui, sans-serif";
const TEXT_SHADOW: CSSProperties = { textShadow: "0 1px 3px rgba(0,0,0,0.55)" };

type FigurePhase = "enter" | "board" | "aside";
type SignContent =
  | { kind: "english"; text: string }
  | { kind: "preview"; native: string; roman: string };

/** Transform that draws a figure laid out at `box` at `target` instead:
 *  centre to centre, bottom to bottom, scaled by height about the centre. */
function offsetFor(box: LastCallFigureBox, target: LastCallFigureBox) {
  const s = target.height / box.height;
  return {
    x: target.cx - box.cx,
    y: target.bottom - (s * box.height) / 2 - (box.bottom - box.height / 2),
    scale: s,
  };
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
/**
 * A canvas ruler in the real face. The web can measure before it draws, which
 * mobile cannot, so the fit here is exact where the font has loaded. Where no
 * canvas exists (jsdom) it falls back to the same estimate mobile uses.
 */
function canvasMeasure(fontFamily: string, weight: number) {
  return (s: string, size: number): number => {
    if (measureCtx === undefined) {
      try {
        measureCtx = document.createElement("canvas").getContext("2d");
      } catch {
        measureCtx = null;
      }
    }
    if (!measureCtx) return estimateSignTextWidth(s, size);
    measureCtx.font = `${weight} ${size}px ${fontFamily}`;
    return measureCtx.measureText(s).width;
  };
}

/**
 * What is written on the door passenger's sign, fitted to its blank card.
 * fitSignText (shared with mobile) steps the size down from a ceiling until a
 * greedy word-wrap fits the card in at most three lines, never breaking a
 * word. The browser then wraps the same words at the same size itself; the
 * card clips as a last resort.
 */
function SignText({
  content,
  width,
  height,
  nativeStyle,
  nativeDir,
}: {
  content: SignContent;
  width: number;
  height: number;
  nativeStyle: CSSProperties;
  nativeDir: "rtl" | "ltr";
}) {
  const innerW = width * (1 - 2 * SIGN_PAD_X);
  const innerH = height * (1 - 2 * SIGN_PAD_Y);
  const base: CSSProperties = {
    color: SIGN_INK,
    textAlign: "center",
    maxWidth: innerW,
    overflowWrap: "normal",
    margin: 0,
  };
  if (content.kind === "english") {
    const fit = fitSignText(content.text, innerW, innerH, canvasMeasure(APP_FONT, 800), {
      maxFontSize: 30,
      minFontSize: 8,
      lineHeight: 1.18,
      maxLines: 3,
    });
    return (
      <span style={{ ...base, fontFamily: APP_FONT, fontWeight: 800, fontSize: fit.fontSize, lineHeight: 1.18 }}>
        {content.text}
      </span>
    );
  }
  const nativeFamily = typeof nativeStyle.fontFamily === "string" ? nativeStyle.fontFamily : APP_FONT;
  const nativeLine = nativeStyle.lineHeight ? Number(nativeStyle.lineHeight) || 1.6 : 1.6;
  const nativeFit = fitSignText(content.native, innerW, innerH * 0.6, canvasMeasure(nativeFamily, 700), {
    maxFontSize: 30,
    minFontSize: 8,
    lineHeight: nativeLine,
    maxLines: 2,
  });
  const romanFit = fitSignText(content.roman, innerW, innerH * 0.4, canvasMeasure(APP_FONT, 600), {
    maxFontSize: Math.max(8, Math.round(nativeFit.fontSize * 0.7)),
    minFontSize: 7,
    lineHeight: 1.18,
    maxLines: 2,
  });
  return (
    <>
      <span
        dir={nativeDir}
        style={{ ...base, ...nativeStyle, fontWeight: 700, fontSize: nativeFit.fontSize, lineHeight: nativeLine }}
      >
        {content.native}
      </span>
      <span style={{ ...base, fontFamily: APP_FONT, fontWeight: 600, fontSize: romanFit.fontSize, lineHeight: 1.18 }}>
        {content.roman}
      </span>
    </>
  );
}

/**
 * One painted passenger, laid out in `box`. As on mobile, the layout box never
 * moves during a walk; only a transform does. A queue figure whose place
 * changes rides framer-motion's layout animation to the new place.
 *
 * The cut-out is decorative (empty alt, aria-hidden). The sign is not: it is
 * role="img" with its words as the label, which is the whole question.
 */
function PassengerFigure({
  passenger,
  box,
  from,
  exitTo,
  phase,
  reduceMotion,
  sign,
  nativeStyle,
  nativeDir,
  signTestId,
}: {
  passenger: LastCallPassenger;
  box: LastCallFigureBox;
  from?: LastCallFigureBox;
  exitTo?: LastCallFigureBox;
  phase: FigurePhase;
  reduceMotion: boolean;
  sign?: SignContent;
  nativeStyle: CSSProperties;
  nativeDir: "rtl" | "ltr";
  signTestId?: string;
}) {
  const start = from ? offsetFor(box, from) : null;
  const initial = reduceMotion
    ? { x: 0, y: 0, scale: 1, rotate: 0, opacity: box.opacity }
    : start
      ? { ...start, rotate: 0, opacity: from!.opacity }
      : { x: 0, y: 0, scale: 1, rotate: 0, opacity: 0 };

  let animate: Record<string, number | number[]>;
  let transition: Record<string, unknown>;
  if (phase === "board") {
    animate = { x: 0, y: -box.height * 0.14, scale: 1.1, rotate: 0, opacity: 0 };
    transition = reduceMotion ? { duration: 0 } : { duration: BOARD_S, ease: "easeIn" };
  } else if (phase === "aside") {
    const t = offsetFor(box, exitTo ?? box);
    const total = SHAKE_S + ASIDE_S;
    const walkTimes = [0, SHAKE_S / total, 1];
    animate = reduceMotion
      ? { opacity: 0 }
      : {
          rotate: [0, -5, 5, -3, 0],
          x: [0, 0, t.x],
          y: [0, 0, t.y],
          scale: [1, 1, t.scale],
          opacity: [1, 1, 0],
        };
    transition = reduceMotion
      ? { duration: 0 }
      : {
          rotate: { duration: SHAKE_S, times: [0, 0.21, 0.5, 0.79, 1] },
          x: { duration: total, times: walkTimes, ease: "easeInOut" },
          y: { duration: total, times: walkTimes, ease: "easeInOut" },
          scale: { duration: total, times: walkTimes, ease: "easeInOut" },
          opacity: { duration: total, times: walkTimes, ease: "easeInOut" },
        };
  } else {
    animate = { x: 0, y: 0, scale: 1, rotate: 0, opacity: box.opacity };
    transition = reduceMotion
      ? { duration: 0 }
      : { duration: start ? WALK_S : QUEUE_FADE_S, ease: "easeOut", layout: { duration: WALK_S, ease: "easeOut" } };
  }

  const signBox = {
    left: box.width * passenger.sign.x,
    top: box.height * passenger.sign.y,
    width: box.width * passenger.sign.w,
    height: box.height * passenger.sign.h,
  };
  const label = !sign ? undefined : sign.kind === "english" ? sign.text : `${sign.native}, ${sign.roman}`;

  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      layout={!reduceMotion && !sign ? "position" : false}
      initial={initial}
      animate={animate}
      transition={transition}
      aria-hidden={sign ? undefined : true}
    >
      <img
        src={lastCallPassengerSrc(passenger.id)}
        alt=""
        aria-hidden
        draggable={false}
        className="block h-full w-full select-none object-contain"
      />
      {sign ? (
        <div
          role="img"
          aria-label={label}
          data-testid={signTestId}
          className="absolute flex flex-col items-center justify-center overflow-hidden"
          style={{
            ...signBox,
            padding: `${signBox.height * SIGN_PAD_Y}px ${signBox.width * SIGN_PAD_X}px`,
          }}
        >
          <SignText
            content={sign}
            width={signBox.width}
            height={signBox.height}
            nativeStyle={nativeStyle}
            nativeDir={nativeDir}
          />
        </div>
      ) : null}
    </motion.div>
  );
}

/**
 * The looping doorway film over its frame 0. REDUCE MOTION gets the poster
 * only: the global CSS rule reaches animation and transition, never a
 * <video>, so the film gates itself (bazaar-welcome.tsx, same reasoning). The
 * film stays transparent until it has a frame, so the poster is what shows
 * while it loads and the whole backdrop if it never does.
 */
function PlatformFilm({ reduceMotion }: { reduceMotion: boolean }) {
  const [framed, setFramed] = useState(false);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden style={{ backgroundColor: STAGE_GROUND }}>
      <img src={LAST_CALL_POSTER_SRC} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {reduceMotion ? null : (
        <video
          src={LAST_CALL_FILM_SRC}
          poster={LAST_CALL_POSTER_SRC}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onLoadedData={() => setFramed(true)}
          data-testid="last-call-film"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: framed ? 1 : 0 }}
        />
      )}
    </div>
  );
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export default function LastCallPage() {
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
  const [runKey, setRunKey] = useState(0);
  const leave = useCallback(() => navigate("/journey"), [navigate]);

  if (!validGroup) return <Redirect to="/journey" replace />;
  // An unsupported language never gets a Last Call row (planStopPlay), so
  // arriving here is a stale map or a deep link. Its voice stop is a compare
  // stop, which only practice can play.
  if (speechCapability === "unsupported") {
    return <Redirect to={`/practice/${categoryId}?group=${groupId}`} replace />;
  }
  // The same expected refusals practice handles, in the same order.
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
          Finish the stop before it to board here. The line runs station by station.
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
  if (phrasesQuery.isLoading || !phrasesQuery.data) {
    return <LessonBuildingScreen languageName={activeLanguage?.name} backHref="/journey" />;
  }
  const list = phrasesQuery.data;
  // Practice sends an empty group back to the map for the same reason: the
  // listing reports such a stop plan-locked, so the map is where it makes sense.
  if (list.length === 0) return <Redirect to="/journey" replace />;

  return (
    <LastCallRound
      // Keyed so Play again starts a clean round with a fresh shuffle: the
      // reducer has no reset on purpose, as on mobile.
      key={`${groupId}:${runKey}`}
      phrases={list}
      groupId={groupId}
      categoryId={categoryId}
      stopLabel={stopLabel}
      onLeave={leave}
      onPlayAgain={() => setRunKey((k) => k + 1)}
    />
  );
}

function LastCallRound({
  phrases,
  groupId,
  categoryId,
  stopLabel,
  onLeave,
  onPlayAgain,
}: {
  phrases: Phrase[];
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

  const byId = useMemo(() => new Map(phrases.map((p) => [p.id, p])), [phrases]);
  const ids = useMemo(() => phrases.map((p) => p.id), [phrases]);

  const [state, dispatch] = useReducer(lastCallReducer, ids, (initial: number[]) =>
    initLastCall(initial, shuffle(initial)),
  );
  // Async callbacks read the round through this, never through a stale closure.
  const stateRef = useRef<LastCallState>(state);
  stateRef.current = state;
  // Faces are dealt ONCE, off the round's opening preview and recall orders,
  // so a phrase keeps its passenger through the preview, the recall round and
  // every re-queue (rule and reasoning: assignLastCallPassengers). The lazy
  // initialiser reads the first render's state, which is the initial round.
  const [faces] = useState(() => assignLastCallPassengers(state.passengers, state.queue));
  const passengerFor = (phraseId: number) => lastCallPassengerById(faces.get(phraseId) ?? "grandmother");

  // ── Audio: synthesize once per phrase, play through the blessed element ──
  const synth = useSynthesizeSpeech();
  const audioCache = useRef(new Map<number, { audioBase64: string; format: string }>());
  const playTokenRef = useRef(0);
  const pendingResolveRef = useRef<(() => void) | null>(null);
  const aliveRef = useRef(true);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const [audioPlaying, setAudioPlaying] = useState(false);

  const stopPlayback = useCallback(() => {
    playTokenRef.current += 1;
    const el = getCoachAudioElement();
    // The element persists (blessed singleton); drop this page's handlers so
    // they can never fire on a later silent blessing play.
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
   * Play a passenger's phrase once. Resolves when it has finished, failed or
   * been stopped, so a caller can chain the next beat off it. Muted means no
   * synthesis at all (GameMuteButton's contract), resolving immediately.
   */
  const playPhrase = useCallback(
    (phrase: Phrase): Promise<void> =>
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
            const res =
              audioCache.current.get(phrase.id) ??
              (await synth.mutateAsync({
                data: { text: phrase.nativeScript, languageName: activeLanguage?.name, languageCode: activeLang },
              }));
            audioCache.current.set(phrase.id, { audioBase64: res.audioBase64, format: res.format });
            if (token !== playTokenRef.current || !aliveRef.current) return finish();
            const el = getCoachAudioElement();
            el.src = `data:audio/${res.format};base64,${res.audioBase64}`;
            el.onended = finish;
            el.onerror = finish;
            applySpeechRate(el);
            setAudioPlaying(true);
            await el.play();
          } catch {
            // Autoplay refused or synthesis failed: the card still shows the
            // phrase, and the preview card's speaker button replays it inside
            // a gesture.
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

  // THE VOICE BARS and the can't-hear-you hint, so a learner can see the mic
  // hears them (hooks/useInputLevel.ts has the ruling and the wiring).
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

  // Warm the microphone whenever a passenger is at the door, as practice does
  // at idle, so the first syllable is not clipped.
  useEffect(() => {
    if (state.status === "asking") void speakPrepare();
  }, [state.status, speakPrepare]);

  // ── Before the round: the rules, then a count from 3 ─────────────────────
  // Owner, 2026-09-14, on the mobile twin: "Add the instructions before it
  // starts. and count down from 3", then, placing it: "needs a countdown after
  // I hit start on the How to Play card." Start runs the count and the first
  // passenger steps up when it ends. Until then nothing plays, nobody queues
  // and no clock can tick. The round's rules (last-call-round.ts) know neither.
  const [showRules, setShowRules] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  countdownRef.current = countdown;
  /** The rules card or the count is up: the round is held at the door. */
  const beforeRound = showRules || countdown !== null;
  useEffect(() => {
    if (countdown === null) return;
    webHaptic(countdown > 0 ? "light" : "medium");
    const t = setTimeout(
      () => setCountdown(countdown > 0 ? countdown - 1 : null),
      countdown > 0 ? COUNTDOWN_STEP_MS : COUNTDOWN_GO_MS,
    );
    return () => clearTimeout(t);
  }, [countdown]);

  // ── Preview: each passenger says their phrase once ───────────────────────
  const previewPhrase = state.status === "preview" ? byId.get(state.passengers[state.previewIndex]!) : undefined;
  // WEB ONLY: the preview card has a "Hear it" button, because a browser may
  // refuse the programmatic play. Pressing it hands this card to the learner:
  // the auto-advance stands down for it, or the replay would be cut off by the
  // next passenger's clip. Tapping the card still moves on.
  const previewManualRef = useRef<number | null>(null);
  useEffect(() => {
    if (!previewPhrase || beforeRound) return;
    let cancelled = false;
    void (async () => {
      const started = Date.now();
      await playPhrase(previewPhrase);
      // Muted or refused audio still leaves time to read the card.
      const rest = Math.max(350, PREVIEW_MUTED_BEAT_MS - (Date.now() - started));
      await new Promise((r) => setTimeout(r, rest));
      if (
        !cancelled &&
        previewManualRef.current !== state.previewIndex &&
        stateRef.current.status === "preview" &&
        stateRef.current.previewIndex === state.previewIndex
      ) {
        dispatch({ type: "preview_next" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewPhrase?.id, state.previewIndex, beforeRound]);

  // ── The clock. Runs only while asking or speaking, never under the count; the reducer ignores it otherwise. ─
  const clockRunning = (state.status === "asking" || state.status === "speaking") && countdown === null;
  useEffect(() => {
    if (!clockRunning) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      dispatch({ type: "tick", ms: Math.min(MAX_TICK_MS, now - last) });
      last = now;
    }, TICK_EVERY_MS);
    return () => clearInterval(id);
  }, [clockRunning]);

  // ── A take: stop, score, record, then tell the round ─────────────────────
  const finishingRef = useRef(false);
  const pressingRef = useRef(false);
  const recordStartedAtRef = useRef(0);
  const [banner, setBanner] = useState<string | null>(null);
  // A standing no to AI permission stops the round here (AiConsentBlockedCard).
  const [consentBlocked, setConsentBlocked] = useState(false);

  const finishTake = useCallback(async () => {
    if (finishingRef.current) return;
    const s = stateRef.current;
    if (s.status !== "speaking") return;
    const id = currentPassenger(s);
    const phrase = id === null ? undefined : byId.get(id);
    if (!phrase) return;
    finishingRef.current = true;
    dispatch({ type: "score_start" });
    try {
      const outcome = await stopAndScore(phrase);
      if (!aliveRef.current) return;
      if (outcome.kind === "consent_required") {
        // Re-asking cannot succeed until the learner changes their answer, and
        // it used to loop forever. The round stays paused under the card.
        setConsentBlocked(true);
        return;
      }
      if (outcome.kind === "too_short") {
        // Nothing was sent, so this is the recorder's miss, not the learner's:
        // the same no-strike reading a nocatch band gets.
        setBanner(null);
        dispatch({ type: "scored", outcome: "nocatch" });
        return;
      }
      if (outcome.kind !== "scored") {
        // A timeout and a thrown request both re-ask with no strike: neither
        // is something the learner did.
        setBanner(
          outcome.kind === "timeout"
            ? "The scorer took too long. Same passenger, no strike."
            : "Scoring hit a snag. Same passenger, no strike.",
        );
        dispatch({ type: "scoring_timeout" });
        return;
      }
      // Practice's idea of passing, unchanged: band-pill isPassingBand.
      const take: TakeOutcome =
        outcome.band === "nocatch" ? "nocatch" : isPassingBand(outcome.band) ? "pass" : "fail";
      setBanner(outcome.attemptSaved ? null : "Scored, but your progress did not save. Check your connection.");
      dispatch({ type: "scored", outcome: take });
    } finally {
      finishingRef.current = false;
    }
  }, [byId, stopAndScore]);
  finishTakeRef.current = () => void finishTake();

  // The clock ran out mid-take: score what was said.
  useEffect(() => {
    if (state.timeUp && state.status === "speaking") void finishTake();
  }, [state.timeUp, state.status, finishTake]);

  const [micMessage, setMicMessage] = useState<string | null>(null);

  const beginTake = useCallback(async () => {
    const s = stateRef.current;
    // A second tap while listening in tap mode is the stop.
    if (s.status === "speaking") {
      void finishTake();
      return;
    }
    if (s.status !== "asking" || countdownRef.current !== null) return;
    setMicMessage(null);
    stopPlayback();
    dispatch({ type: "speak" });
    const asked = Date.now();
    const ok = await speakStart();
    if (!ok) {
      dispatch({ type: "speak_cancel" });
      setMicMessage(
        permissionDenied()
          ? "Please allow microphone access to play Last Call."
          : "Could not start recording. Try again.",
      );
      return;
    }
    // THE PERMISSION PROMPT STOLE THE PRESS. Released while the prompt was up:
    // a grant by itself must never produce a take (practice's rule). Back to
    // the door with a fresh clock, and say why nothing happened.
    if (!pressingRef.current && Date.now() - asked > PROMPT_STALL_MS) {
      speakCancel();
      dispatch({ type: "speak_cancel" });
      void speakPrepare();
      setMicMessage("Microphone ready. Hold or tap to speak.");
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
    // A hold ends the take on release; a tap leaves the mic open.
    if (Date.now() - recordStartedAtRef.current >= TAP_MS) void finishTake();
  };

  // ── Feedback beats ───────────────────────────────────────────────────────
  const isOver = state.status === "over";
  useEffect(() => {
    if (state.status !== "feedback" && state.status !== "over") return;
    const last = state.last;
    if (!last) return;
    let cancelled = false;
    const beat = (ms: number) => new Promise((r) => setTimeout(r, ms));
    void (async () => {
      if (last.outcome === "pass") {
        webHaptic("success");
        playCue("correct");
        if (isOver) return;
        await beat(BOARDED_BEAT_MS);
      } else if (last.outcome === "fail" || last.outcome === "clock") {
        webHaptic("warning");
        playCue("wrong");
        if (isOver) return;
        const phrase = byId.get(last.phraseId);
        const started = Date.now();
        // Hear the correct audio before the next passenger steps up.
        if (phrase) await playPhrase(phrase);
        await beat(Math.max(400, MISS_BEAT_MS - (Date.now() - started)));
      } else {
        // nocatch or a scoring timeout: a system miss, so no warning haptic
        // and no wrong cue (Spec 1 rule 16, as practice).
        await beat(NOCATCH_BEAT_MS);
      }
      if (!cancelled && stateRef.current.status === "feedback") {
        setBanner(null);
        dispatch({ type: "continue" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Keyed on the outcome object itself: each take produces a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.last, isOver]);

  // ── End: keep the best in the browser ────────────────────────────────────
  const [best, setBest] = useState<{ best: number; isNewBest: boolean } | null>(null);
  useEffect(() => {
    if (state.status !== "over") return;
    setBest(saveLastCallBest(activeLang, groupId, state.boarded.length));
  }, [state.status, state.boarded.length, activeLang, groupId]);

  // THE SAME EXIT WEB PRACTICE TAKES FROM A FINISHED JOURNEY STOP: the flashback
  // lightbox when phrases are due, the map when none are, and the flashback
  // route's own step-aside when the answer is not in yet.
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
    // Attempts already scored stay saved on the server; what a learner loses
    // by leaving is this round's boarding count, which is what the prompt says.
    speakCancel();
    stopPlayback();
    onLeave();
  };

  const playAgain = () => {
    webHaptic("light");
    // Inside the gesture, so the next preview's programmatic play is allowed.
    blessAudioPlayback();
    stopPlayback();
    onPlayAgain();
  };

  const current = currentPassenger(state);
  const currentPhrase = current === null ? undefined : byId.get(current);
  const timerFrac = state.timerTotalMs > 0 ? state.timerLeftMs / state.timerTotalMs : 0;
  const urgent = clockRunning && state.timerLeftMs <= URGENT_MS;
  const lastPhrase = state.last ? byId.get(state.last.phraseId) : undefined;
  const seconds = Math.ceil(state.timerLeftMs / 1000);
  // An entrance only when motion is welcome; otherwise the card simply appears.
  const enter = reduceMotion ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  // ── The stage: a portrait window onto the film, and who stands where ─────
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = () => setView({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", read);
      return () => window.removeEventListener("resize", read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const stageW = Math.min(view.w, view.h * FILM_ASPECT);
  const stageH = view.h;

  // WHO IS AT THE DOOR. During a pass or miss beat it is still the passenger
  // who just spoke, so the same mounted figure can board or step aside; the
  // reducer has already moved the queue on. The key counts resolved takes, so
  // it is unchanged from that passenger's own turn into their exit, and new
  // for the next turn, which mounts a fresh figure that walks up. Same rule
  // as mobile.
  const resolving =
    state.status === "feedback" &&
    state.last &&
    state.last.outcome !== "nocatch" &&
    state.last.outcome !== "scoring_timeout"
      ? state.last
      : null;
  const takesResolved = state.boarded.length + state.strikes;
  const door: { id: number; key: string; phase: FigurePhase } | null =
    state.status === "over"
      ? null
      : state.status === "preview"
        ? previewPhrase
          ? { id: previewPhrase.id, key: `preview-${state.previewIndex}`, phase: "enter" }
          : null
        : resolving
          ? {
              id: resolving.phraseId,
              key: `turn-${resolving.phraseId}-${takesResolved - 1}`,
              phase: resolving.outcome === "pass" ? "board" : "aside",
            }
          : current !== null
            ? { id: current, key: `turn-${current}-${takesResolved}`, phase: "enter" }
            : null;
  const waiting: number[] =
    state.status === "over"
      ? []
      : state.status === "preview"
        ? state.passengers.slice(state.previewIndex + 1, state.previewIndex + 3)
        : resolving
          ? state.queue.filter((id) => id !== resolving.phraseId).slice(0, 2)
          : state.queue.slice(1, 3);
  const doorPhrase = door ? byId.get(door.id) : undefined;
  const doorSign: SignContent | undefined = !doorPhrase
    ? undefined
    : state.status === "preview"
      ? { kind: "preview", native: doorPhrase.nativeScript, roman: doorPhrase.romanized }
      : // English only in the recall round: the romanized hint is deliberately
        // withheld (owner brief, slice 1).
        { kind: "english", text: doorPhrase.english };

  const onFilm = "text-white";
  const onFilmMuted = "text-white/80";

  return (
    <div ref={rootRef} className="relative h-[100dvh] overflow-hidden" style={{ backgroundColor: STAGE_GROUND }}>
      {/* Beyond the portrait stage on a wide window: the poster, soft and dim,
          so the page never has hard black bars. Decorative. */}
      <img
        src={LAST_CALL_POSTER_SRC}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl"
      />
      {stageW > 0 ? (
        <div
          className="absolute inset-y-0 left-1/2 -translate-x-1/2 overflow-hidden"
          style={{ width: stageW }}
          data-testid="last-call-stage"
        >
          <PlatformFilm reduceMotion={reduceMotion} />
          {/* Soft dark scrims so the controls read over any part of the film. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/60 via-black/25 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/70 via-black/40 to-transparent"
          />
          {!beforeRound && state.status === "preview" && previewPhrase ? (
            // The whole platform is the "next passenger" tap, as the card was.
            // It sits UNDER the figures, which take no pointer events.
            <button
              type="button"
              onClick={() => {
                webHaptic("light");
                stopPlayback();
                dispatch({ type: "preview_next" });
              }}
              aria-label="Next passenger"
              data-testid="last-call-preview"
              className="absolute inset-0 h-full w-full cursor-pointer"
            />
          ) : null}
          {/* No one queues before the round: the platform is the backdrop. */}
          {beforeRound && state.status !== "over" ? null : [...waiting.map((id, i) => ({ id, slot: i === 0 ? ("queue1" as const) : ("queue2" as const) }))]
            // Furthest back first, so nearer figures paint over them.
            .reverse()
            .map(({ id, slot }) => {
              const p = passengerFor(id);
              return (
                <PassengerFigure
                  key={`q-${id}`}
                  passenger={p}
                  box={lastCallFigureBox(slot, p, stageW, stageH)}
                  phase="enter"
                  reduceMotion={reduceMotion}
                  nativeStyle={native.style}
                  nativeDir={native.dir}
                />
              );
            })}
          {door && doorSign && !(beforeRound && state.status !== "over")
            ? (() => {
                const p = passengerFor(door.id);
                return (
                  <PassengerFigure
                    key={door.key}
                    passenger={p}
                    box={lastCallFigureBox("door", p, stageW, stageH)}
                    from={lastCallFigureBox("queue1", p, stageW, stageH)}
                    exitTo={lastCallFigureBox("queue2", p, stageW, stageH)}
                    phase={door.phase}
                    reduceMotion={reduceMotion}
                    sign={doorSign}
                    nativeStyle={native.style}
                    nativeDir={native.dir}
                    signTestId={state.status === "preview" ? "last-call-preview-sign" : "last-call-passenger"}
                  />
                );
              })()
            : null}
        </div>
      ) : null}

      <div className="pointer-events-none relative z-10 mx-auto flex h-full w-full max-w-md flex-col">
        <div className="pointer-events-auto flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={handleExit}
            aria-label="Go back"
            data-testid="last-call-exit"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </button>
          <div className="min-w-0 flex-1 text-center" style={TEXT_SHADOW}>
            <h1 className={cn("truncate text-lg font-extrabold leading-tight", onFilm)}>Last Call</h1>
            {stopLabel ? <p className={cn("truncate text-xs", onFilmMuted)}>{stopLabel}</p> : null}
          </div>
          {/* A card plaque: the mute icon is drawn in the theme's foreground
              colour, which would vanish into the dark scrim. */}
          <div className="rounded-xl border border-border bg-card">
            <GameMuteButton soundOn={soundOn} onToggle={toggleSound} active={audioPlaying} />
          </div>
        </div>

        {showRules && state.status !== "over" ? (
          <div className="flex w-full flex-1 flex-col justify-center px-4 pb-8">
            <div
              className="pointer-events-auto rounded-3xl border border-border bg-card px-5 pb-5 pt-4"
              data-testid="last-call-rules"
            >
              <h2 className="text-center text-2xl font-extrabold text-foreground">How to play</h2>
              <ol className="mt-3 space-y-2.5">
                {[
                  "Meet your passengers. Each one says their line once.",
                  `Then each sign shows the meaning in English. Say it in ${activeLanguage?.name ?? "your language"} before the clock runs out.`,
                  "Hold the mic while you speak, or tap it to start and tap again to stop.",
                  "Three misses and the doors close. Board everyone to win.",
                ].map((line, i) => (
                  <li key={i} className="flex gap-3 text-left">
                    <span className="w-4 shrink-0 text-base font-extrabold text-primary">{i + 1}</span>
                    <span className="text-sm leading-snug text-foreground">{line}</span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={() => {
                  webHaptic("light");
                  // Inside the gesture, so the first passenger's programmatic
                  // play is allowed when the count ends.
                  blessAudioPlayback();
                  setShowRules(false);
                  setCountdown(COUNTDOWN_FROM);
                }}
                data-testid="last-call-start"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-base font-black text-primary-foreground"
              >
                <Play className="h-4 w-4" aria-hidden />
                Start
              </button>
            </div>
          </div>
        ) : countdown !== null && state.status === "preview" ? (
          // The count stands alone over the platform (its overlay is below).
          <div className="flex-1" />
        ) : state.status === "preview" && previewPhrase ? (
          <div className="flex w-full flex-1 flex-col items-center px-4 pb-8 pt-1 text-center" style={TEXT_SHADOW}>
            <p className={cn("text-lg font-bold", onFilm)}>Last call! Meet your passengers.</p>
            <p className={cn("mt-1 text-sm", onFilmMuted)}>
              {`Passenger ${state.previewIndex + 1} of ${state.passengers.length}`}
            </p>
            {/* The sign carries the script and the sound; the meaning rides
                under the counter so the pairing the recall round asks for is
                still taught once (the slice 2 card showed all three). */}
            <p className={cn("mt-1 text-xl font-bold", onFilm)}>{previewPhrase.english}</p>
            <div className="flex-1" />
            <div className="pointer-events-auto mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  previewManualRef.current = state.previewIndex;
                  void playPhrase(previewPhrase);
                }}
                disabled={!soundOn}
                data-testid="last-call-preview-hear"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
                style={{ textShadow: "none" }}
              >
                <Volume2 className="h-4 w-4" aria-hidden />
                {soundOn ? "Hear it" : "Sound is off"}
              </button>
              <span className={cn("text-xs", onFilmMuted)}>Tap the platform for the next passenger</span>
            </div>
            <button
              type="button"
              onClick={() => {
                stopPlayback();
                dispatch({ type: "preview_skip" });
              }}
              data-testid="last-call-skip-preview"
              className="pointer-events-auto mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-base font-bold text-foreground hover:bg-muted"
              style={{ textShadow: "none" }}
            >
              <SkipForward className="h-4 w-4" aria-hidden />
              Skip to boarding
            </button>
          </div>
        ) : state.status === "over" ? (
          <div className="pointer-events-auto flex-1 overflow-y-auto px-4 pb-10 pt-4">
            <div className="flex w-full flex-col items-center rounded-3xl border border-border bg-card px-6 pb-8 pt-6 text-center">
              <Mascot pose={state.endReason === "all_aboard" ? "cheer" : "wave"} size={128} idle={reduceMotion ? "none" : "float"} />
              <h2 className="mt-4 text-2xl font-extrabold text-foreground" data-testid="last-call-aboard">
                {`${state.boarded.length} ${state.boarded.length === 1 ? "passenger" : "passengers"} aboard`}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {state.endReason === "all_aboard"
                  ? "Everyone made the train!"
                  : `Three misses and the doors closed. ${state.queue.length} still on the platform.`}
              </p>
              {best ? (
                <p
                  className={cn("mt-2 text-sm", best.isNewBest ? "font-bold text-primary" : "text-muted-foreground")}
                  data-testid="last-call-best"
                >
                  {best.isNewBest ? `New best: ${best.best}` : `Best: ${best.best}`}
                </p>
              ) : null}
              {state.bestCombo >= 2 ? (
                <p className="mt-1 text-sm text-muted-foreground">{`Longest combo: ${state.bestCombo}`}</p>
              ) : null}
              {banner ? <p className="mt-3 text-sm text-destructive">{banner}</p> : null}
              {dueKnown ? (
                <button
                  type="button"
                  data-testid="last-call-next-stop"
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
                  data-testid="last-call-next-stop"
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-base font-black text-primary-foreground"
                >
                  On to the next stop
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              )}
              <button
                type="button"
                onClick={playAgain}
                data-testid="last-call-play-again"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-base font-bold text-foreground hover:bg-muted"
              >
                <RefreshCcw className="h-4 w-4" aria-hidden />
                Play again
              </button>
            </div>
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
        ) : (
          <div className="flex w-full flex-1 flex-col items-center px-4 pb-8 pt-1">
            {/* Strikes and combo in WORDS as well as marks: a colour-only state
                is invisible to a colour-blind learner (owner, standing rule). */}
            <div className="flex w-full items-center justify-between text-sm font-bold" style={TEXT_SHADOW}>
              <span className={onFilm} data-testid="last-call-strikes">
                {`Misses ${state.strikes}/${LAST_CALL_MAX_STRIKES}`}
              </span>
              <span className={onFilm}>{`Aboard ${state.boarded.length}/${state.passengers.length}`}</span>
              <span className={state.combo >= 2 ? onFilm : onFilmMuted}>
                {state.combo >= 2 ? `Combo x${state.combo}` : "Combo"}
              </span>
            </div>

            <div
              className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/30"
              role="progressbar"
              aria-label={`${seconds} seconds left`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.max(0, Math.min(1, timerFrac)) * 100)}
              data-testid="last-call-timer"
            >
              <div
                className={cn("h-full rounded-full", urgent ? "bg-destructive" : "bg-primary")}
                style={{ width: `${Math.round(Math.max(0, Math.min(1, timerFrac)) * 100)}%` }}
              />
            </div>
            <p
              className={cn("mt-1.5 text-xs font-bold", urgent ? "text-red-200" : onFilmMuted)}
              style={TEXT_SHADOW}
            >
              {state.status === "scoring" || state.status === "feedback"
                ? "Clock paused"
                : urgent
                  ? `Hurry! ${seconds}s`
                  : `${seconds}s`}
            </p>

            {state.status === "feedback" && state.last && lastPhrase ? (
              <motion.div
                key={`fb-${state.boarded.length}-${state.strikes}-${state.last.outcome}-${state.queue.join(",")}`}
                {...enter}
                className="mt-3 flex w-full flex-col items-center rounded-2xl border border-border bg-card px-4 py-3 text-center"
                data-testid="last-call-feedback"
                role="status"
              >
                {state.last.outcome === "pass" ? (
                  <p className="text-2xl font-extrabold text-emerald-600">Boarded! 🎉</p>
                ) : state.last.outcome === "fail" || state.last.outcome === "clock" ? (
                  <>
                    <p className="text-xl font-extrabold text-destructive">
                      {state.last.outcome === "clock" ? "Out of time. Back of the queue." : "Missed. Back of the queue."}
                    </p>
                    <p style={native.style} dir={native.dir} className="mt-1 text-2xl font-bold text-foreground">
                      {lastPhrase.nativeScript}
                    </p>
                    <p className="text-base text-muted-foreground">{lastPhrase.romanized}</p>
                  </>
                ) : (
                  <p className="text-xl font-extrabold text-foreground">
                    {"Didn't catch that. Same passenger, no strike."}
                  </p>
                )}
                {banner ? <p className="mt-2 text-sm text-muted-foreground">{banner}</p> : null}
              </motion.div>
            ) : currentPhrase ? (
              <p className={cn("mt-2 text-sm", onFilm)} style={TEXT_SHADOW} role={state.status === "scoring" ? "status" : undefined}>
                {state.status === "scoring" ? "Checking your ticket..." : "Read the sign. Say it to board:"}
              </p>
            ) : null}

            <div className="min-h-[16px] flex-1" />
            <button
              type="button"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onClick={(e) => {
                // A keyboard press (Enter or Space) arrives as a click with no
                // pointer detail: treat it as a tap, which toggles the take.
                if (e.detail === 0) void beginTake();
              }}
              onContextMenu={(e) => e.preventDefault()}
              disabled={countdown !== null || (state.status !== "asking" && state.status !== "speaking")}
              aria-label={state.status === "speaking" ? "Stop and score" : "Hold or tap to speak"}
              data-testid="last-call-mic"
              className={cn(
                "pointer-events-auto flex h-20 w-20 touch-none select-none items-center justify-center rounded-full text-white shadow-md transition-colors",
                state.status === "speaking"
                  ? "bg-destructive"
                  : state.status === "asking" && countdown === null
                    ? "bg-primary"
                    : "bg-muted",
              )}
            >
              {state.status === "speaking" ? (
                <Square className="h-7 w-7" aria-hidden />
              ) : (
                <Mic className="h-8 w-8" aria-hidden />
              )}
            </button>
            {/* The slot keeps its height in every state, so the mic never moves
                under a holding finger when the bars appear. */}
            <div className="mt-2 flex h-7 items-center justify-center" data-testid="last-call-voice-slot">
              {speak.recording ? <VoiceBars amplitude={voice.amplitude} level={voice.level} className={onFilm} /> : null}
            </div>
            <p className={cn("mt-1 text-center text-sm", onFilm)} style={TEXT_SHADOW} aria-live="polite">
              {micMessage ??
                (state.status === "speaking"
                  ? voice.noInput
                    ? "We can't hear you. Check your mic."
                    : "Listening. Let go, or tap again, when you are done."
                  : state.status === "scoring"
                    ? "Scoring. The clock is paused."
                    : "Hold or tap to speak")}
            </p>
          </div>
        )}
      </div>

      {consentBlocked ? (
        <AiConsentBlockedCard
          gameName="Last Call"
          onLeave={() => {
            speakCancel();
            stopPlayback();
            onLeave();
          }}
          testId="last-call-consent-blocked"
        />
      ) : null}

      {/* THE COUNT. Over everything and never under a pointer; the number is
          also announced, so it does not ride on sight alone. */}
      {countdown !== null ? (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          role="status"
          aria-live="assertive"
          aria-label={countdown > 0 ? `Starting in ${countdown}` : "Go"}
        >
          <div className="flex h-[150px] w-[150px] items-center justify-center rounded-full bg-black/55">
            <span className="text-[84px] font-black leading-none text-white" style={TEXT_SHADOW} data-testid="last-call-countdown">
              {countdown > 0 ? String(countdown) : "Go!"}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
